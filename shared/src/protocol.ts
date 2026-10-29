/**
 * Typed REST + Socket.IO contracts shared by client and server.
 */
import { z } from 'zod';
import type { GameId } from './catalog.js';
import type { GamePrivateUnion, GameStateUnion, StrokeSegment } from './gameStates.js';

/* ------------------------------ Lifecycle ------------------------------- */
export const ROOM_PHASES = [
  'WAITING_ROOM',
  'GAME_STARTING',
  'PLAYING',
  'ROUND_RESULTS',
  'NEXT_ROUND',
  'FINAL_RESULTS',
] as const;
export type RoomPhase = (typeof ROOM_PHASES)[number];

/** Allowed phase transitions. Anything else is rejected by the server. */
export const PHASE_TRANSITIONS: Record<RoomPhase, RoomPhase[]> = {
  WAITING_ROOM: ['GAME_STARTING'],
  GAME_STARTING: ['PLAYING', 'FINAL_RESULTS'],
  PLAYING: ['ROUND_RESULTS', 'FINAL_RESULTS'],
  ROUND_RESULTS: ['NEXT_ROUND', 'FINAL_RESULTS'],
  NEXT_ROUND: ['PLAYING', 'FINAL_RESULTS'],
  FINAL_RESULTS: ['WAITING_ROOM'],
};

/* -------------------------------- Limits -------------------------------- */
export const LIMITS = {
  nameMax: 20,
  roomNameMax: 40,
  passcodeMin: 4,
  passcodeMax: 32,
  maxPlayersMin: 2,
  maxPlayersMax: 16,
} as const;

/* ------------------------------ Snapshots ------------------------------- */
export interface PlayerPublic {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  online: boolean;
  joinedAt: number;
  /** Joined while a game was running; plays from the next game. */
  spectator: boolean;
}

export interface Standing {
  playerId: string;
  name: string;
  score: number;
  rank: number;
}

export interface SessionPublic {
  sessionId: string;
  gameId: GameId;
  round: number;
  totalRounds: number | null;
  participants: string[];
  scores: Record<string, number>;
  /** Points gained in the most recent round (for result animations). */
  roundDeltas: Record<string, number>;
  /** Server-time epoch ms for the active in-game timer (null = none). */
  deadline: number | null;
  /** Total length of the active timer in ms, for progress bars. */
  deadlineTotal: number | null;
  state: GameStateUnion | null;
  final: null | { standings: Standing[]; endedEarly: boolean; note?: string };
}

export interface RoomSnapshot {
  version: number;
  serverNow: number;
  room: {
    id: string;
    name: string;
    maxPlayers: number;
    hostId: string;
    createdAt: number;
  };
  phase: RoomPhase;
  /** Server-time epoch ms when the current lifecycle phase auto-advances (null = waits for host). */
  phaseDeadline: number | null;
  phaseDeadlineTotal: number | null;
  players: PlayerPublic[];
  selectedGame: GameId;
  gameSettings: Record<string, unknown>;
  session: SessionPublic | null;
  /** Sessions finished in this room (most recent first), for the lobby history panel. */
  history: { gameId: GameId; endedAt: number; winnerName: string | null }[];
}

/* ------------------------------ REST API -------------------------------- */
const nameField = z.string().min(1).max(60);
export const createRoomSchema = z.object({
  roomName: z.string().max(80),
  hostName: nameField,
  passcode: z.string().min(LIMITS.passcodeMin).max(LIMITS.passcodeMax),
  gameId: z.string(),
  gameSettings: z.record(z.unknown()).optional(),
  maxPlayers: z.number().int().min(LIMITS.maxPlayersMin).max(LIMITS.maxPlayersMax),
});
export type CreateRoomRequest = z.infer<typeof createRoomSchema>;

export const joinRoomSchema = z.object({
  name: nameField,
  passcode: z.string().min(1).max(LIMITS.passcodeMax),
});
export type JoinRoomRequest = z.infer<typeof joinRoomSchema>;

export interface SessionCredentials {
  roomId: string;
  playerId: string;
  token: string;
  name: string;
}
export interface RoomPreview {
  roomId: string;
  name: string;
  selectedGame: GameId;
  playerCount: number;
  maxPlayers: number;
  phase: RoomPhase;
  hostName: string | null;
}
export interface ApiError {
  error: string;
  code: ErrorCode;
}

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'WRONG_PASSCODE'
  | 'ROOM_FULL'
  | 'NAME_TAKEN'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'INVALID_ACTION'
  | 'INTERNAL';

/* ------------------------------ Socket.IO ------------------------------- */
export type AckResponse<T = null> = { ok: true; data: T } | { ok: false; error: string; code: ErrorCode };
export type Ack<T = null> = (res: AckResponse<T>) => void;

export const updateSettingsSchema = z
  .object({
    roomName: z.string().max(80).optional(),
    maxPlayers: z.number().int().min(LIMITS.maxPlayersMin).max(LIMITS.maxPlayersMax).optional(),
    gameId: z.string().optional(),
    gameSettings: z.record(z.unknown()).optional(),
  })
  .strict();
export type UpdateSettingsPayload = z.infer<typeof updateSettingsSchema>;

export const targetPlayerSchema = z.object({ playerId: z.string().min(1).max(64) }).strict();

export const gameActionEnvelopeSchema = z.object({
  /** Client-generated id; the server de-duplicates retries of the same action. */
  actionId: z.string().min(8).max(64),
  action: z.object({ type: z.string().max(32) }).passthrough(),
});
export type GameActionEnvelope = z.infer<typeof gameActionEnvelopeSchema>;

export type RemovalReason = 'kicked' | 'closed' | 'left' | 'expired' | 'replaced';

export interface ClientToServerEvents {
  'time:sync': (clientSentAt: number, ack: (serverNow: number) => void) => void;
  'room:sync': (ack: Ack) => void;
  'room:updateSettings': (payload: UpdateSettingsPayload, ack: Ack) => void;
  'room:start': (ack: Ack) => void;
  'room:kick': (payload: { playerId: string }, ack: Ack) => void;
  'room:transferHost': (payload: { playerId: string }, ack: Ack) => void;
  'room:close': (ack: Ack) => void;
  'room:leave': (ack: Ack) => void;
  'room:next': (ack: Ack) => void;
  'room:endGame': (ack: Ack) => void;
  'room:returnToLobby': (ack: Ack) => void;
  'game:action': (payload: GameActionEnvelope, ack: Ack) => void;
  'game:stroke': (segment: StrokeSegment) => void;
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshot) => void;
  'game:private': (payload: GamePrivateUnion | null) => void;
  'game:stroke': (segment: StrokeSegment) => void;
  /** Full canvas replacement (after clear/undo or on resync). */
  'game:canvas': (payload: { segments: StrokeSegment[] }) => void;
  'room:removed': (payload: { reason: RemovalReason; message: string }) => void;
  notice: (payload: { level: 'info' | 'warn' | 'error'; message: string }) => void;
}

export interface SocketAuth {
  roomId: string;
  token: string;
}

export interface InterServerEvents {
  ping: () => void;
}
