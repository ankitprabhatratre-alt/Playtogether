import type { GameId, Standing } from '@playtogether/shared';

export interface PersistedPlayer {
  id: string;
  name: string;
  color: string;
  tokenHash: string;
  joinedAt: number;
}

export interface PersistedRoom {
  id: string;
  name: string;
  passcodeHash: string;
  maxPlayers: number;
  selectedGame: GameId;
  gameSettings: Record<string, unknown>;
  hostPlayerId: string | null;
  createdAt: number;
  lastActiveAt: number;
  players: PersistedPlayer[];
  /** Recently finished sessions (most recent first); only filled when loading. */
  history?: { gameId: GameId; endedAt: number; winnerName: string | null }[];
}

export type RoomPatch = Partial<Pick<PersistedRoom, 'name' | 'maxPlayers' | 'selectedGame' | 'gameSettings' | 'hostPlayerId' | 'lastActiveAt'>>;

export interface SessionStart {
  id: string;
  roomId: string;
  gameId: GameId;
  settings: Record<string, unknown>;
  participants: string[];
}

/**
 * Durable storage. Writes are best-effort and must never block or break gameplay:
 * implementations queue them and log failures.
 */
export interface PersistenceStore {
  readonly kind: 'memory' | 'postgres';
  init(): Promise<void>;
  createRoom(room: PersistedRoom): void;
  updateRoom(id: string, patch: RoomPatch): void;
  closeRoom(id: string, reason: string): void;
  addPlayer(roomId: string, player: PersistedPlayer): void;
  removePlayer(playerId: string): void;
  /** Load an open (not closed) room with its active players, or null. */
  loadRoom(id: string): Promise<PersistedRoom | null>;
  startSession(s: SessionStart): void;
  finishSession(id: string, standings: Standing[], endedEarly: boolean): void;
  /** Mark rooms idle since `before` as closed (for rooms not loaded in memory). */
  expireIdleRooms(before: number): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}

/** No-op store: live rooms exist only in memory and are lost on restart. */
export class MemoryStore implements PersistenceStore {
  readonly kind = 'memory' as const;
  async init() {}
  createRoom() {}
  updateRoom() {}
  closeRoom() {}
  addPlayer() {}
  removePlayer() {}
  async loadRoom() {
    return null;
  }
  startSession() {}
  finishSession() {}
  expireIdleRooms() {}
  async flush() {}
  async close() {}
}
