import {
  GAME_CATALOG,
  LIMITS,
  createRoomSchema,
  defaultSettings,
  isGameId,
  isValidRoomCode,
  joinRoomSchema,
  normalizeRoomCode,
  parseGameSettings,
  sanitizeText,
  type RoomPreview,
  type SessionCredentials,
} from '@playtogether/shared';
import { AppError } from '../util/errors.js';
import { generateRoomCode, generateToken, hashToken } from '../util/ids.js';
import { logger } from '../util/logger.js';
import { WindowCounter } from '../util/rateLimit.js';
import { hashPasscode, verifyPasscode } from '../security/passcode.js';
import type { PersistenceStore } from '../persistence/store.js';
import { Room, type RoomIO, type RoomTiming, type PlayerRecord } from './Room.js';

export interface RoomManagerOptions {
  io: RoomIO;
  store: PersistenceStore;
  timing: RoomTiming;
  roomIdleTtlMs: number;
  roomMaxAgeMs: number;
  random?: () => number;
  now?: () => number;
}

const FAILED_JOIN_LIMIT = 8;
const FAILED_JOIN_WINDOW_MS = 10 * 60_000;

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private readonly loading = new Map<string, Promise<Room | null>>();
  private readonly failedJoins: WindowCounter;
  private readonly now: () => number;

  constructor(private readonly opts: RoomManagerOptions) {
    this.now = opts.now ?? Date.now;
    this.failedJoins = new WindowCounter(FAILED_JOIN_LIMIT, FAILED_JOIN_WINDOW_MS, this.now);
  }

  private newRoom(init: ConstructorParameters<typeof Room>[0]): Room {
    const room = new Room(init, {
      io: this.opts.io,
      store: this.opts.store,
      timing: this.opts.timing,
      random: this.opts.random,
      now: this.opts.now,
      onClosed: (r) => {
        this.rooms.delete(r.id);
        logger.info('Room closed', { room: r.id });
      },
    });
    this.rooms.set(room.id, room);
    return room;
  }

  async createRoom(raw: unknown): Promise<SessionCredentials> {
    const parsed = createRoomSchema.safeParse(raw);
    if (!parsed.success) throw new AppError('BAD_REQUEST', 'Please fill in all fields correctly.');
    const input = parsed.data;
    const hostName = sanitizeText(input.hostName, LIMITS.nameMax);
    const roomName = sanitizeText(input.roomName, LIMITS.roomNameMax) || `${hostName}'s room`;
    if (!hostName) throw new AppError('BAD_REQUEST', 'Please enter a display name.');
    if (input.passcode.trim().length < LIMITS.passcodeMin) throw new AppError('BAD_REQUEST', `Passcode must be at least ${LIMITS.passcodeMin} characters.`);
    if (!isGameId(input.gameId)) throw new AppError('BAD_REQUEST', 'Unknown game.');
    if (GAME_CATALOG[input.gameId].status !== 'ready') throw new AppError('BAD_REQUEST', 'That game is not available yet.');
    const settings = parseGameSettings(input.gameId, input.gameSettings ?? {});
    if (!settings.ok) throw new AppError('BAD_REQUEST', settings.error);

    let code = generateRoomCode();
    for (let i = 0; this.rooms.has(code) || (await this.opts.store.loadRoom(code)); i++) {
      if (i > 10) throw new AppError('INTERNAL', 'Could not allocate a room code.', 500);
      code = generateRoomCode();
    }
    const passcodeHash = await hashPasscode(input.passcode);
    const room = this.newRoom({
      id: code,
      name: roomName,
      passcodeHash,
      maxPlayers: input.maxPlayers,
      selectedGame: input.gameId,
      gameSettings: settings.value,
      createdAt: this.now(),
    });
    const token = generateToken();
    const host = room.addPlayer(hostName, hashToken(token));
    room.hostId = host.id;
    this.opts.store.createRoom({
      id: room.id,
      name: room.name,
      passcodeHash,
      maxPlayers: room.maxPlayers,
      selectedGame: room.selectedGame,
      gameSettings: room.gameSettings,
      hostPlayerId: host.id,
      createdAt: room.createdAt,
      lastActiveAt: room.lastActivity,
      players: [{ id: host.id, name: host.name, color: host.color, tokenHash: host.tokenHash, joinedAt: host.joinedAt }],
    });
    logger.info('Room created', { room: room.id, game: room.selectedGame });
    return { roomId: room.id, playerId: host.id, token, name: host.name };
  }

  /** Find a live room, or lazily rehydrate it from the database after a restart. */
  async getRoom(rawId: string): Promise<Room | null> {
    const id = normalizeRoomCode(rawId);
    if (!isValidRoomCode(id)) return null;
    const live = this.rooms.get(id);
    if (live) return live;
    if (this.opts.store.kind === 'memory') return null;
    let pending = this.loading.get(id);
    if (!pending) {
      pending = this.rehydrate(id).finally(() => this.loading.delete(id));
      this.loading.set(id, pending);
    }
    return pending;
  }

  private async rehydrate(id: string): Promise<Room | null> {
    const rec = await this.opts.store.loadRoom(id);
    if (!rec) return null;
    if (this.rooms.has(id)) return this.rooms.get(id)!;
    const t = this.now();
    if (t - rec.lastActiveAt > this.opts.roomIdleTtlMs || t - rec.createdAt > this.opts.roomMaxAgeMs) {
      this.opts.store.closeRoom(id, 'expired');
      return null;
    }
    const settings = parseGameSettings(rec.selectedGame, rec.gameSettings);
    const room = this.newRoom({
      id: rec.id,
      name: rec.name,
      passcodeHash: rec.passcodeHash,
      maxPlayers: rec.maxPlayers,
      selectedGame: rec.selectedGame,
      gameSettings: settings.ok ? settings.value : defaultSettings(rec.selectedGame),
      createdAt: rec.createdAt,
    });
    for (const p of rec.players) room.addPlayer(p.name, p.tokenHash, { id: p.id, color: p.color, joinedAt: p.joinedAt });
    if (rec.hostPlayerId && room.players.has(rec.hostPlayerId)) room.hostId = rec.hostPlayerId;
    if (rec.history?.length) room.restoreHistory(rec.history);
    if (room.players.size === 0) {
      room.close(null, 'expired', 'Room expired.');
      return null;
    }
    logger.info('Room restored from database', { room: id, players: room.players.size });
    return room;
  }

  async preview(rawId: string): Promise<RoomPreview> {
    const room = await this.getRoom(rawId);
    if (!room) throw new AppError('NOT_FOUND', 'Room not found. It may have expired or been closed.', 404);
    return {
      roomId: room.id,
      name: room.name,
      selectedGame: room.selectedGame,
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers,
      phase: room.phase,
      hostName: room.players.get(room.hostId)?.name ?? null,
    };
  }

  async joinRoom(rawId: string, raw: unknown, clientKey: string): Promise<SessionCredentials> {
    const parsed = joinRoomSchema.safeParse(raw);
    if (!parsed.success) throw new AppError('BAD_REQUEST', 'Please enter your name and the room passcode.');
    const room = await this.getRoom(rawId);
    if (!room) throw new AppError('NOT_FOUND', 'Room not found. Check the code, or the room may have expired.', 404);
    const key = `${clientKey}|${room.id}`;
    if (this.failedJoins.isBlocked(key)) {
      throw new AppError('RATE_LIMITED', 'Too many incorrect passcode attempts. Please wait a few minutes.', 429);
    }
    const ok = await verifyPasscode(parsed.data.passcode, room.passcodeHash);
    if (!ok) {
      this.failedJoins.hit(key);
      throw new AppError('WRONG_PASSCODE', 'Incorrect passcode.', 403);
    }
    this.failedJoins.reset(key);
    if (room.closed) throw new AppError('NOT_FOUND', 'This room has been closed.', 404);
    const name = sanitizeText(parsed.data.name, LIMITS.nameMax);
    if (!name) throw new AppError('BAD_REQUEST', 'Please enter a display name.');
    if (room.isNameTaken(name)) {
      throw new AppError('NAME_TAKEN', 'Someone in this room already uses that name. If it is you, use "Rejoin" on your original device, or pick another name.', 409);
    }
    if (room.players.size >= room.maxPlayers) throw new AppError('ROOM_FULL', 'This room is full.', 409);
    const token = generateToken();
    const player = room.addPlayer(name, hashToken(token));
    this.opts.store.addPlayer(room.id, { id: player.id, name: player.name, color: player.color, tokenHash: player.tokenHash, joinedAt: player.joinedAt });
    room.notice('info', `${player.name} joined the room.`);
    return { roomId: room.id, playerId: player.id, token, name: player.name };
  }

  /** Verify a reconnect token. Used for every socket connection. */
  async authenticate(rawRoomId: unknown, token: unknown): Promise<{ room: Room; player: PlayerRecord } | null> {
    if (typeof rawRoomId !== 'string' || typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const room = await this.getRoom(rawRoomId);
    if (!room || room.closed) return null;
    const player = room.findByTokenHash(hashToken(token));
    if (!player) return null;
    return { room, player };
  }

  /** Remove abandoned rooms. Returns the ids that were removed. */
  cleanup(): string[] {
    const t = this.now();
    const removed: string[] = [];
    for (const room of [...this.rooms.values()]) {
      const idle = room.onlineCount === 0 && t - room.lastActivity > this.opts.roomIdleTtlMs;
      const tooOld = t - room.createdAt > this.opts.roomMaxAgeMs;
      if (!idle && !tooOld && room.onlineCount > 0) {
        // Keep the durable record fresh for rooms that are in use.
        this.opts.store.updateRoom(room.id, { lastActiveAt: t });
      }
      if (idle || tooOld) {
        room.close(null, 'expired', tooOld ? 'This room reached its maximum lifetime.' : 'This room expired due to inactivity.');
        removed.push(room.id);
      }
    }
    this.failedJoins.prune();
    this.opts.store.expireIdleRooms(t - this.opts.roomIdleTtlMs);
    if (removed.length) logger.info('Cleaned up rooms', { count: removed.length });
    return removed;
  }

  shutdown(): void {
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }
}
