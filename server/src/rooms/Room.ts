import {
  winnerNames,
  GAME_ACTION_SCHEMAS,
  GAME_CATALOG,
  PHASE_TRANSITIONS,
  LIMITS,
  isGameId,
  parseGameSettings,
  sanitizeText,
  strokeSchema,
  type AckResponse,
  type GameActionEnvelope,
  type GameId,
  type GamePrivateUnion,
  type GameStateUnion,
  type PlayerPublic,
  type RemovalReason,
  type RoomPhase,
  type RoomSnapshot,
  type ServerToClientEvents,
  type SessionPublic,
  type Standing,
  type StrokeSegment,
  type UpdateSettingsPayload,
} from '@playtogether/shared';
import { AppError, forbidden, invalidAction, invalidState } from '../util/errors.js';
import { generateId, pickColor } from '../util/ids.js';
import { logger } from '../util/logger.js';
import type { PersistenceStore } from '../persistence/store.js';
import type { GameContext, GameInstance, ParticipantView } from '../games/types.js';
import { GAME_REGISTRY } from '../games/registry.js';

/** Abstraction over Socket.IO so rooms are testable without a network. */
export interface RoomIO {
  toRoom<E extends keyof ServerToClientEvents>(roomId: string, event: E, ...args: Parameters<ServerToClientEvents[E]>): void;
  toSocket<E extends keyof ServerToClientEvents>(socketId: string, event: E, ...args: Parameters<ServerToClientEvents[E]>): void;
  disconnect(socketId: string): void;
}

export interface RoomTiming {
  startingMs: number;
  nextRoundMs: number;
  defaultResultsMs: number;
  /** Multiplies every timer (tests use small values). */
  scale: number;
  hostGraceMs: number;
}

export const DEFAULT_TIMING: RoomTiming = {
  startingMs: 3000,
  nextRoundMs: 2000,
  defaultResultsMs: 6000,
  scale: 1,
  hostGraceMs: 30_000,
};

export interface PlayerRecord {
  id: string;
  name: string;
  color: string;
  tokenHash: string;
  joinedAt: number;
  online: boolean;
  socketId: string | null;
  lastSeen: number;
  spectator: boolean;
  /** Idempotency cache: actionId → ack result. */
  recentActions: Map<string, AckResponse>;
}

interface SessionRuntime {
  id: string;
  gameId: GameId;
  settings: Record<string, unknown>;
  participants: string[];
  names: Map<string, string>;
  scores: Map<string, number>;
  roundDeltas: Map<string, number>;
  instance: GameInstance;
  deadline: number | null;
  deadlineTotal: number | null;
  mainTimer: NodeJS.Timeout | null;
  auxTimers: Set<NodeJS.Timeout>;
  final: SessionPublic['final'];
  started: boolean;
}

export interface RoomInit {
  id: string;
  name: string;
  passcodeHash: string;
  maxPlayers: number;
  selectedGame: GameId;
  gameSettings: Record<string, unknown>;
  createdAt: number;
}

export interface RoomDeps {
  io: RoomIO;
  store: PersistenceStore;
  timing: RoomTiming;
  random?: () => number;
  now?: () => number;
  onClosed: (room: Room) => void;
}

const ACTION_CACHE_SIZE = 64;
const MAX_POINTS_PER_AWARD = 1000;

export class Room {
  readonly id: string;
  name: string;
  readonly passcodeHash: string;
  maxPlayers: number;
  readonly createdAt: number;
  selectedGame: GameId;
  gameSettings: Record<string, unknown>;
  hostId = '';
  phase: RoomPhase = 'WAITING_ROOM';
  readonly players = new Map<string, PlayerRecord>();
  lastActivity: number;
  closed = false;

  private phaseDeadline: number | null = null;
  private phaseDeadlineTotal: number | null = null;
  private phaseTimer: NodeJS.Timeout | null = null;
  private phaseCallback: (() => void) | null = null;
  private hostTimer: NodeJS.Timeout | null = null;
  private session: SessionRuntime | null = null;
  private history: RoomSnapshot['history'] = [];

  /** Used when rehydrating a room from the database after a restart. */
  restoreHistory(entries: RoomSnapshot['history']): void {
    this.history = entries.slice(0, 10);
  }
  private version = 0;
  private broadcastPending = false;
  private lastPersistedActivity = 0;
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(
    init: RoomInit,
    private readonly deps: RoomDeps,
  ) {
    this.id = init.id;
    this.name = init.name;
    this.passcodeHash = init.passcodeHash;
    this.maxPlayers = init.maxPlayers;
    this.createdAt = init.createdAt;
    this.selectedGame = init.selectedGame;
    this.gameSettings = init.gameSettings;
    this.random = deps.random ?? Math.random;
    this.now = deps.now ?? Date.now;
    this.lastActivity = this.now();
  }

  /* ============================== Players ============================== */

  get onlineCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.online) n++;
    return n;
  }

  isNameTaken(name: string): boolean {
    const n = name.toLocaleLowerCase();
    for (const p of this.players.values()) if (p.name.toLocaleLowerCase() === n) return true;
    return false;
  }

  addPlayer(name: string, tokenHash: string, opts: { id?: string; color?: string; joinedAt?: number } = {}): PlayerRecord {
    const used = new Set([...this.players.values()].map((p) => p.color));
    const player: PlayerRecord = {
      id: opts.id ?? generateId(),
      name,
      color: opts.color ?? pickColor(used),
      tokenHash,
      joinedAt: opts.joinedAt ?? this.now(),
      online: false,
      socketId: null,
      lastSeen: this.now(),
      spectator: this.phase !== 'WAITING_ROOM',
      recentActions: new Map(),
    };
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;
    this.touch();
    this.scheduleBroadcast();
    return player;
  }

  findByTokenHash(tokenHash: string): PlayerRecord | undefined {
    for (const p of this.players.values()) if (p.tokenHash === tokenHash) return p;
    return undefined;
  }

  /** Bind a socket to a player. Returns the previous socket id if the player was connected elsewhere. */
  attachSocket(playerId: string, socketId: string): string | null {
    const p = this.mustPlayer(playerId);
    const previous = p.socketId && p.socketId !== socketId ? p.socketId : null;
    p.socketId = socketId;
    const wasOnline = p.online;
    p.online = true;
    p.lastSeen = this.now();
    this.touch();
    if (playerId === this.hostId) this.clearHostTimer();
    if (!wasOnline) this.session?.instance.onConnectionChange?.(playerId, true);
    // If nobody online was host-eligible before, make sure a host exists.
    if (!this.players.get(this.hostId)) this.hostId = playerId;
    this.scheduleBroadcast();
    return previous;
  }

  detachSocket(playerId: string, socketId: string): void {
    const p = this.players.get(playerId);
    if (!p || p.socketId !== socketId) return; // stale socket (already replaced)
    p.socketId = null;
    p.online = false;
    p.lastSeen = this.now();
    this.touch();
    this.safe(() => this.session?.instance.onConnectionChange?.(playerId, false));
    if (playerId === this.hostId) this.startHostTimer();
    this.scheduleBroadcast();
  }

  leave(playerId: string): void {
    this.removePlayer(playerId, 'left', 'You left the room.');
  }

  kick(byId: string, targetId: string): void {
    this.requireHost(byId);
    if (targetId === byId) throw invalidAction('You cannot remove yourself. Use "Close room" instead.');
    const target = this.players.get(targetId);
    if (!target) throw new AppError('NOT_FOUND', 'That player is no longer in the room.', 404);
    this.removePlayer(targetId, 'kicked', 'The host removed you from the room.');
    this.notice('info', `${target.name} was removed by the host.`);
  }

  transferHost(byId: string, targetId: string): void {
    this.requireHost(byId);
    const target = this.players.get(targetId);
    if (!target) throw new AppError('NOT_FOUND', 'That player is no longer in the room.', 404);
    if (targetId === byId) return;
    this.setHost(targetId, `${target.name} is now the host.`);
  }

  close(byId: string | null, reason: RemovalReason = 'closed', message = 'The host closed the room.'): void {
    if (byId !== null) this.requireHost(byId);
    if (this.closed) return;
    this.closed = true;
    for (const p of this.players.values()) {
      if (p.socketId) {
        this.deps.io.toSocket(p.socketId, 'room:removed', { reason, message });
        this.deps.io.disconnect(p.socketId);
      }
    }
    this.dispose();
    this.deps.store.closeRoom(this.id, reason);
    this.deps.onClosed(this);
  }

  private removePlayer(playerId: string, reason: RemovalReason, message: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    this.players.delete(playerId);
    this.deps.store.removePlayer(playerId);
    if (p.socketId) {
      this.deps.io.toSocket(p.socketId, 'room:removed', { reason, message });
      this.deps.io.disconnect(p.socketId);
    }
    if (this.players.size === 0) {
      this.close(null, 'closed', 'Everyone left the room.');
      return;
    }
    if (playerId === this.hostId) {
      const next = this.pickNewHost();
      if (next) this.setHost(next.id, `${next.name} is now the host.`);
    }
    const s = this.session;
    if (s && s.participants.includes(playerId)) {
      s.participants = s.participants.filter((id) => id !== playerId);
      s.scores.delete(playerId);
      s.roundDeltas.delete(playerId);
      const inGame = this.phase !== 'WAITING_ROOM' && this.phase !== 'FINAL_RESULTS';
      if (inGame) {
        const min = GAME_CATALOG[s.gameId].minPlayers;
        if (s.participants.length < min) {
          this.finishSession(true, 'The game ended early because there are not enough players left.');
        } else {
          this.safe(() => s.instance.onParticipantRemoved?.(playerId));
        }
      }
    }
    this.touch();
    this.scheduleBroadcast();
  }

  private pickNewHost(): PlayerRecord | undefined {
    const candidates = [...this.players.values()].filter((p) => p.id !== this.hostId).sort((a, b) => a.joinedAt - b.joinedAt);
    return candidates.find((p) => p.online) ?? candidates[0];
  }

  private setHost(playerId: string, message: string): void {
    this.hostId = playerId;
    this.clearHostTimer();
    const host = this.players.get(playerId);
    if (host && !host.online) this.startHostTimer();
    this.deps.store.updateRoom(this.id, { hostPlayerId: playerId });
    this.notice('info', message);
    this.scheduleBroadcast();
  }

  private startHostTimer(): void {
    this.clearHostTimer();
    const ms = this.deps.timing.hostGraceMs;
    if (ms <= 0) return;
    this.hostTimer = setTimeout(() => {
      this.hostTimer = null;
      const host = this.players.get(this.hostId);
      if (host?.online) return;
      const next = [...this.players.values()].filter((p) => p.online && p.id !== this.hostId).sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (next) this.setHost(next.id, `The host disconnected. ${next.name} is now the host.`);
    }, ms);
  }

  private clearHostTimer(): void {
    if (this.hostTimer) clearTimeout(this.hostTimer);
    this.hostTimer = null;
  }

  /* ============================== Settings ============================= */

  updateSettings(byId: string, payload: UpdateSettingsPayload): void {
    this.requireHost(byId);
    if (this.phase !== 'WAITING_ROOM' && this.phase !== 'FINAL_RESULTS') {
      throw invalidState('Settings can only be changed between games.');
    }
    if (payload.roomName !== undefined) {
      const n = sanitizeText(payload.roomName, LIMITS.roomNameMax);
      if (!n) throw invalidAction('Room name cannot be empty.');
      this.name = n;
    }
    if (payload.maxPlayers !== undefined) {
      if (payload.maxPlayers < this.players.size) throw invalidAction(`There are already ${this.players.size} players in the room.`);
      this.maxPlayers = payload.maxPlayers;
    }
    let gameId = this.selectedGame;
    if (payload.gameId !== undefined) {
      if (!isGameId(payload.gameId)) throw invalidAction('Unknown game.');
      if (GAME_CATALOG[payload.gameId].status !== 'ready') throw invalidAction('That game is not available yet.');
      gameId = payload.gameId;
    }
    if (gameId !== this.selectedGame || payload.gameSettings !== undefined) {
      const parsed = parseGameSettings(gameId, payload.gameSettings ?? {});
      if (!parsed.ok) throw invalidAction(parsed.error);
      this.selectedGame = gameId;
      this.gameSettings = parsed.value;
    }
    this.deps.store.updateRoom(this.id, {
      name: this.name,
      maxPlayers: this.maxPlayers,
      selectedGame: this.selectedGame,
      gameSettings: this.gameSettings,
    });
    this.touch();
    this.scheduleBroadcast();
  }

  /* ============================== Lifecycle ============================ */

  private transition(next: RoomPhase, waitMs: number | null, onDeadline?: () => void): void {
    if (!PHASE_TRANSITIONS[this.phase].includes(next)) {
      throw invalidState(`Invalid transition ${this.phase} → ${next}`);
    }
    this.clearPhaseTimer();
    this.phase = next;
    if (waitMs !== null && onDeadline) {
      const ms = Math.max(0, Math.round(waitMs * this.deps.timing.scale));
      this.phaseDeadline = this.now() + ms;
      this.phaseDeadlineTotal = ms;
      this.phaseCallback = onDeadline;
      this.phaseTimer = setTimeout(() => this.firePhaseCallback(), ms);
    }
    this.scheduleBroadcast();
  }

  private firePhaseCallback(): void {
    const cb = this.phaseCallback;
    this.clearPhaseTimer();
    if (cb) this.safe(cb);
    this.scheduleBroadcast();
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
    this.phaseCallback = null;
    this.phaseDeadline = null;
    this.phaseDeadlineTotal = null;
  }

  start(byId: string): void {
    this.requireHost(byId);
    if (this.phase === 'FINAL_RESULTS') this.returnToLobby(byId);
    if (this.phase !== 'WAITING_ROOM') throw invalidState('A game is already in progress.');
    const meta = GAME_CATALOG[this.selectedGame];
    if (meta.status !== 'ready') throw invalidAction('That game is not available yet.');
    const participants = [...this.players.values()].filter((p) => p.online).sort((a, b) => a.joinedAt - b.joinedAt);
    if (participants.length < meta.minPlayers) {
      throw invalidAction(`${meta.name} needs at least ${meta.minPlayers} online player${meta.minPlayers === 1 ? '' : 's'}.`);
    }
    if (participants.length > meta.maxPlayers) {
      throw invalidAction(`${meta.name} supports at most ${meta.maxPlayers} players.`);
    }
    const parsed = parseGameSettings(this.selectedGame, this.gameSettings);
    if (!parsed.ok) throw invalidAction(parsed.error);
    const def = GAME_REGISTRY[this.selectedGame];
    const extra = def.validateStart?.(participants.length, parsed.value);
    if (extra) throw invalidAction(extra);

    const sessionId = generateId(12);
    const runtime: SessionRuntime = {
      id: sessionId,
      gameId: this.selectedGame,
      settings: parsed.value,
      participants: participants.map((p) => p.id),
      names: new Map(participants.map((p) => [p.id, p.name])),
      scores: new Map(participants.map((p) => [p.id, 0])),
      roundDeltas: new Map(),
      instance: undefined as unknown as GameInstance,
      deadline: null,
      deadlineTotal: null,
      mainTimer: null,
      auxTimers: new Set(),
      final: null,
      started: false,
    };
    this.session = runtime;
    runtime.instance = def.initializeGame(this.createContext(runtime));
    for (const p of this.players.values()) p.spectator = !runtime.participants.includes(p.id);
    this.deps.store.startSession({ id: sessionId, roomId: this.id, gameId: runtime.gameId, settings: runtime.settings, participants: runtime.participants });
    this.transition('GAME_STARTING', this.deps.timing.startingMs, () => this.enterPlaying());
    this.touch();
  }

  private enterPlaying(): void {
    const s = this.session;
    if (!s) return;
    this.transition('PLAYING', null);
    s.roundDeltas.clear();
    if (!s.started) {
      s.started = true;
      s.instance.startGame();
    } else {
      s.instance.advanceGame();
    }
    this.scheduleBroadcast();
  }

  private endRound(s: SessionRuntime, resultsMs?: number): void {
    if (this.session !== s || this.phase !== 'PLAYING') return;
    this.clearMainTimer(s);
    this.transition('ROUND_RESULTS', resultsMs ?? this.deps.timing.defaultResultsMs, () => this.afterRoundResults());
  }

  private afterRoundResults(): void {
    const s = this.session;
    if (!s) return;
    if (s.instance.hasNextRound()) {
      this.transition('NEXT_ROUND', this.deps.timing.nextRoundMs, () => this.enterPlaying());
    } else {
      this.finishSession(false);
    }
  }

  private finishSession(endedEarly: boolean, note?: string): void {
    const s = this.session;
    if (!s || this.phase === 'FINAL_RESULTS' || this.phase === 'WAITING_ROOM') return;
    this.clearSessionTimers(s);
    let gameNote: string | undefined;
    this.safe(() => {
      gameNote = s.instance.finishGame().note;
    });
    const standings = this.computeStandings(s);
    s.final = { standings, endedEarly, note: note ?? gameNote };
    this.transition('FINAL_RESULTS', null);
    this.deps.store.finishSession(s.id, standings, endedEarly);
    this.history.unshift({ gameId: s.gameId, endedAt: this.now(), winnerName: winnerNames(standings) });
    this.history = this.history.slice(0, 10);
    this.touch();
  }

  next(byId: string): void {
    this.requireHost(byId);
    if (!['GAME_STARTING', 'ROUND_RESULTS', 'NEXT_ROUND'].includes(this.phase) || !this.phaseCallback) {
      throw invalidState('Nothing to skip right now.');
    }
    this.firePhaseCallback();
  }

  endGame(byId: string): void {
    this.requireHost(byId);
    if (!['GAME_STARTING', 'PLAYING', 'ROUND_RESULTS', 'NEXT_ROUND'].includes(this.phase)) {
      throw invalidState('No game is running.');
    }
    this.finishSession(true, 'The host ended the game early.');
  }

  returnToLobby(byId: string): void {
    this.requireHost(byId);
    if (this.phase !== 'FINAL_RESULTS') throw invalidState('Finish or end the current game first.');
    this.transition('WAITING_ROOM', null);
    if (this.session) {
      this.clearSessionTimers(this.session);
      this.safe(() => this.session?.instance.cleanupGame());
    }
    this.session = null;
    for (const p of this.players.values()) p.spectator = false;
    this.touch();
    this.scheduleBroadcast();
  }

  /* =============================== Actions ============================= */

  handleGameAction(playerId: string, envelope: GameActionEnvelope): AckResponse {
    const player = this.mustPlayer(playerId);
    const cached = player.recentActions.get(envelope.actionId);
    if (cached) return cached; // idempotent retry
    let result: AckResponse;
    try {
      const s = this.session;
      if (!s || (this.phase !== 'PLAYING' && this.phase !== 'ROUND_RESULTS')) {
        throw invalidState('There is no active round right now.');
      }
      if (!s.participants.includes(playerId)) throw forbidden('You are spectating this game.');
      const parsed = GAME_ACTION_SCHEMAS[s.gameId].safeParse(envelope.action);
      if (!parsed.success) throw invalidAction('Malformed action.');
      s.instance.handlePlayerAction(playerId, parsed.data as never, this.phase);
      this.touch();
      this.scheduleBroadcast();
      result = { ok: true, data: null };
    } catch (err) {
      result = this.toAckError(err);
    }
    player.recentActions.set(envelope.actionId, result);
    if (player.recentActions.size > ACTION_CACHE_SIZE) {
      const first = player.recentActions.keys().next().value;
      if (first !== undefined) player.recentActions.delete(first);
    }
    return result;
  }

  handleStroke(playerId: string, raw: unknown): void {
    const s = this.session;
    if (!s || this.phase !== 'PLAYING' || !s.instance.handleStroke) return;
    if (!s.participants.includes(playerId)) return;
    const parsed = strokeSchema.safeParse(raw);
    if (!parsed.success) return;
    this.safe(() => s.instance.handleStroke!(playerId, parsed.data));
  }

  /* ============================== Snapshots ============================ */

  snapshot(): RoomSnapshot {
    const players: PlayerPublic[] = [...this.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({ id: p.id, name: p.name, color: p.color, isHost: p.id === this.hostId, online: p.online, joinedAt: p.joinedAt, spectator: p.spectator }));
    return {
      version: this.version,
      serverNow: this.now(),
      room: { id: this.id, name: this.name, maxPlayers: this.maxPlayers, hostId: this.hostId, createdAt: this.createdAt },
      phase: this.phase,
      phaseDeadline: this.phaseDeadline,
      phaseDeadlineTotal: this.phaseDeadlineTotal,
      players,
      selectedGame: this.selectedGame,
      gameSettings: this.gameSettings,
      session: this.sessionPublic(),
      history: this.history,
    };
  }

  private sessionPublic(): SessionPublic | null {
    const s = this.session;
    if (!s) return null;
    let state: GameStateUnion | null = null;
    if (s.started) {
      try {
        state = { gameId: s.gameId, public: s.instance.getPublicState() } as GameStateUnion;
      } catch (err) {
        logger.error('getPublicState failed', { room: this.id, error: String(err) });
      }
    }
    return {
      sessionId: s.id,
      gameId: s.gameId,
      round: s.instance.currentRound(),
      totalRounds: s.instance.totalRounds(),
      participants: [...s.participants],
      scores: Object.fromEntries(s.scores),
      roundDeltas: Object.fromEntries(s.roundDeltas),
      deadline: s.deadline,
      deadlineTotal: s.deadlineTotal,
      state,
      final: s.final,
    };
  }

  privateFor(playerId: string): GamePrivateUnion | null {
    const s = this.session;
    if (!s || !s.started || !s.participants.includes(playerId)) return null;
    try {
      return { gameId: s.gameId, sessionId: s.id, data: s.instance.getPrivateStateForPlayer(playerId) } as GamePrivateUnion;
    } catch (err) {
      logger.error('getPrivateStateForPlayer failed', { room: this.id, error: String(err) });
      return null;
    }
  }

  /** Full resync for one player (on connect / reconnect / explicit request). */
  sendFullStateTo(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p?.socketId) return;
    this.version++;
    this.deps.io.toSocket(p.socketId, 'room:state', this.snapshot());
    this.deps.io.toSocket(p.socketId, 'game:private', this.privateFor(playerId));
    const canvas = this.session?.instance.getCanvas?.();
    if (canvas) this.deps.io.toSocket(p.socketId, 'game:canvas', { segments: canvas });
  }

  /** Coalesce many state changes in the same tick into one broadcast. */
  scheduleBroadcast(): void {
    if (this.broadcastPending || this.closed) return;
    this.broadcastPending = true;
    queueMicrotask(() => this.flush());
  }

  flush(): void {
    this.broadcastPending = false;
    if (this.closed) return;
    this.version++;
    this.deps.io.toRoom(this.id, 'room:state', this.snapshot());
    for (const p of this.players.values()) {
      if (p.online && p.socketId) this.deps.io.toSocket(p.socketId, 'game:private', this.privateFor(p.id));
    }
  }

  notice(level: 'info' | 'warn' | 'error', message: string): void {
    this.deps.io.toRoom(this.id, 'notice', { level, message });
  }

  /* =============================== Helpers ============================= */

  private createContext(s: SessionRuntime): GameContext {
    const room = this;
    const scale = this.deps.timing.scale;
    const current = () => room.session === s && !room.closed;
    return {
      sessionId: s.id,
      settings: s.settings,
      random: () => room.random(),
      now: () => room.now(),
      participants(): ParticipantView[] {
        return s.participants.map((id) => {
          const p = room.players.get(id);
          return { id, name: p?.name ?? s.names.get(id) ?? '?', online: !!p?.online };
        });
      },
      isParticipant: (id) => s.participants.includes(id),
      isOnline: (id) => !!room.players.get(id)?.online,
      name: (id) => room.players.get(id)?.name ?? s.names.get(id) ?? 'Someone',
      isHost: (id) => room.hostId === id,
      award(playerId, points) {
        if (!current()) return;
        if (!Number.isInteger(points) || Math.abs(points) > MAX_POINTS_PER_AWARD) {
          throw new AppError('INTERNAL', `Refusing invalid award ${points}`);
        }
        if (!s.participants.includes(playerId) || points === 0) return;
        s.scores.set(playerId, (s.scores.get(playerId) ?? 0) + points);
        s.roundDeltas.set(playerId, (s.roundDeltas.get(playerId) ?? 0) + points);
        room.scheduleBroadcast();
      },
      setTimer(ms, onExpire) {
        if (!current()) return room.now();
        room.clearMainTimer(s);
        const real = Math.max(0, Math.round(ms * scale));
        s.deadline = room.now() + real;
        s.deadlineTotal = real;
        s.mainTimer = setTimeout(() => {
          s.mainTimer = null;
          s.deadline = null;
          s.deadlineTotal = null;
          if (!current()) return;
          room.safe(onExpire);
          room.scheduleBroadcast();
        }, real);
        room.scheduleBroadcast();
        return s.deadline;
      },
      clearTimer() {
        room.clearMainTimer(s);
        room.scheduleBroadcast();
      },
      setAuxTimer(ms, cb) {
        const t = setTimeout(() => {
          s.auxTimers.delete(t);
          if (!current()) return;
          room.safe(cb);
          room.scheduleBroadcast();
        }, Math.max(0, Math.round(ms * scale)));
        s.auxTimers.add(t);
        return () => {
          clearTimeout(t);
          s.auxTimers.delete(t);
        };
      },
      endRound: (resultsMs) => room.endRound(s, resultsMs),
      skipRoundResults() {
        queueMicrotask(() => {
          if (current() && room.phase === 'ROUND_RESULTS' && room.phaseCallback) room.firePhaseCallback();
        });
      },
      changed: () => room.scheduleBroadcast(),
      emitStroke(segment, exceptPlayerId) {
        if (!current()) return;
        for (const p of room.players.values()) {
          if (p.id !== exceptPlayerId && p.socketId) room.deps.io.toSocket(p.socketId, 'game:stroke', segment);
        }
      },
      emitCanvas(segments: StrokeSegment[]) {
        if (!current()) return;
        room.deps.io.toRoom(room.id, 'game:canvas', { segments });
      },
    };
  }

  private computeStandings(s: SessionRuntime): Standing[] {
    const rows = s.participants.map((id) => ({ playerId: id, name: this.players.get(id)?.name ?? s.names.get(id) ?? '?', score: s.scores.get(id) ?? 0 }));
    rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    let rank = 0;
    let prev: number | null = null;
    return rows.map((r, i) => {
      if (r.score !== prev) rank = i + 1;
      prev = r.score;
      return { ...r, rank };
    });
  }

  private clearMainTimer(s: SessionRuntime): void {
    if (s.mainTimer) clearTimeout(s.mainTimer);
    s.mainTimer = null;
    s.deadline = null;
    s.deadlineTotal = null;
  }

  private clearSessionTimers(s: SessionRuntime): void {
    this.clearMainTimer(s);
    for (const t of s.auxTimers) clearTimeout(t);
    s.auxTimers.clear();
  }

  requireHost(playerId: string): void {
    if (playerId !== this.hostId) throw forbidden();
  }

  mustPlayer(playerId: string): PlayerRecord {
    const p = this.players.get(playerId);
    if (!p) throw new AppError('UNAUTHORIZED', 'You are not a member of this room.', 401);
    return p;
  }

  touch(): void {
    this.lastActivity = this.now();
    if (this.lastActivity - this.lastPersistedActivity > 60_000) {
      this.lastPersistedActivity = this.lastActivity;
      this.deps.store.updateRoom(this.id, { lastActiveAt: this.lastActivity });
    }
  }

  toAckError(err: unknown): AckResponse {
    if (err instanceof AppError) return { ok: false, error: err.message, code: err.code };
    logger.error('Unexpected error in room', { room: this.id, error: err instanceof Error ? err.stack : String(err) });
    return { ok: false, error: 'Something went wrong on the server.', code: 'INTERNAL' };
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      if (!(err instanceof AppError)) logger.error('Error in room timer/callback', { room: this.id, error: err instanceof Error ? err.stack : String(err) });
    }
  }

  /** Stop all timers and release game resources. */
  dispose(): void {
    this.clearPhaseTimer();
    this.clearHostTimer();
    if (this.session) {
      this.clearSessionTimers(this.session);
      const inst = this.session.instance;
      this.safe(() => inst.cleanupGame());
    }
    this.session = null;
  }

  /* Test helpers */
  get currentSession(): Readonly<SessionRuntime> | null {
    return this.session;
  }
}
