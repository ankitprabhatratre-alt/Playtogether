import type { PrismaClient } from '@prisma/client';
import type { Standing } from '@playtogether/shared';
import { isGameId, winnerNames } from '@playtogether/shared';
import { logger } from '../util/logger.js';
import type { PersistedPlayer, PersistedRoom, PersistenceStore, RoomPatch, SessionStart } from './store.js';

/** PostgreSQL store via Prisma. All writes are serialized through a queue and never throw to callers. */
export class PrismaStore implements PersistenceStore {
  readonly kind = 'postgres' as const;
  private prisma!: PrismaClient;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly databaseUrl: string) {}

  async init(): Promise<void> {
    const { PrismaClient } = await import('@prisma/client');
    this.prisma = new PrismaClient({ datasources: { db: { url: this.databaseUrl } } });
    await this.prisma.$connect();
    await this.prisma.$queryRaw`SELECT 1`;
  }

  private enqueue(label: string, fn: () => Promise<unknown>): void {
    this.queue = this.queue.then(fn).then(
      () => undefined,
      (err: unknown) => logger.error(`persistence: ${label} failed`, { error: String(err) }),
    );
  }

  createRoom(room: PersistedRoom): void {
    this.enqueue('createRoom', () =>
      this.prisma.room.create({
        data: {
          id: room.id,
          name: room.name,
          passcodeHash: room.passcodeHash,
          maxPlayers: room.maxPlayers,
          selectedGame: room.selectedGame,
          gameSettings: room.gameSettings as object,
          hostPlayerId: room.hostPlayerId,
          createdAt: new Date(room.createdAt),
          lastActiveAt: new Date(room.lastActiveAt),
          players: {
            create: room.players.map((p) => ({ id: p.id, name: p.name, color: p.color, tokenHash: p.tokenHash, joinedAt: new Date(p.joinedAt) })),
          },
        },
      }),
    );
  }

  updateRoom(id: string, patch: RoomPatch): void {
    const data: Record<string, unknown> = { ...patch };
    if (patch.lastActiveAt !== undefined) data.lastActiveAt = new Date(patch.lastActiveAt);
    if (patch.gameSettings !== undefined) data.gameSettings = patch.gameSettings as object;
    this.enqueue('updateRoom', () => this.prisma.room.updateMany({ where: { id }, data }));
  }

  closeRoom(id: string, reason: string): void {
    this.enqueue('closeRoom', () => this.prisma.room.updateMany({ where: { id, closedAt: null }, data: { closedAt: new Date(), closeReason: reason } }));
  }

  addPlayer(roomId: string, p: PersistedPlayer): void {
    this.enqueue('addPlayer', () =>
      this.prisma.player.create({ data: { id: p.id, roomId, name: p.name, color: p.color, tokenHash: p.tokenHash, joinedAt: new Date(p.joinedAt) } }),
    );
  }

  removePlayer(playerId: string): void {
    this.enqueue('removePlayer', () => this.prisma.player.updateMany({ where: { id: playerId }, data: { leftAt: new Date() } }));
  }

  async loadRoom(id: string): Promise<PersistedRoom | null> {
    await this.queue; // make sure pending writes for this room landed
    try {
      const r = await this.prisma.room.findFirst({ where: { id, closedAt: null }, include: { players: { where: { leftAt: null }, orderBy: { joinedAt: 'asc' } }, sessions: { where: { endedAt: { not: null } }, orderBy: { endedAt: 'desc' }, take: 10 } } });
      if (!r || !isGameId(r.selectedGame)) return null;
      return {
        id: r.id,
        name: r.name,
        passcodeHash: r.passcodeHash,
        maxPlayers: r.maxPlayers,
        selectedGame: r.selectedGame,
        gameSettings: (r.gameSettings ?? {}) as Record<string, unknown>,
        hostPlayerId: r.hostPlayerId,
        createdAt: r.createdAt.getTime(),
        lastActiveAt: r.lastActiveAt.getTime(),
        players: r.players.map((p) => ({ id: p.id, name: p.name, color: p.color, tokenHash: p.tokenHash, joinedAt: p.joinedAt.getTime() })),
        history: r.sessions.flatMap((s) =>
          isGameId(s.gameId) ? [{ gameId: s.gameId, endedAt: s.endedAt!.getTime(), winnerName: Array.isArray(s.results) ? winnerNames(s.results as unknown as Standing[]) : null }] : [],
        ),
      };
    } catch (err) {
      logger.error('persistence: loadRoom failed', { error: String(err) });
      return null;
    }
  }

  startSession(s: SessionStart): void {
    this.enqueue('startSession', () =>
      this.prisma.gameSession.create({ data: { id: s.id, roomId: s.roomId, gameId: s.gameId, settings: s.settings as object, participants: s.participants } }),
    );
  }

  finishSession(id: string, standings: Standing[], endedEarly: boolean): void {
    this.enqueue('finishSession', () =>
      this.prisma.gameSession.updateMany({ where: { id }, data: { endedAt: new Date(), endedEarly, results: standings as unknown as object } }),
    );
  }

  expireIdleRooms(before: number): void {
    this.enqueue('expireIdleRooms', () =>
      this.prisma.room.updateMany({ where: { closedAt: null, lastActiveAt: { lt: new Date(before) } }, data: { closedAt: new Date(), closeReason: 'expired' } }),
    );
  }

  async flush(): Promise<void> {
    await this.queue;
  }

  async close(): Promise<void> {
    await this.queue;
    await this.prisma?.$disconnect();
  }
}
