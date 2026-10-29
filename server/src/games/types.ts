import type {
  GameActionMap,
  GameId,
  GamePrivateMap,
  GamePublicMap,
  RoomPhase,
  StrokeSegment,
} from '@playtogether/shared';

export interface ParticipantView {
  id: string;
  name: string;
  online: boolean;
}

/**
 * Services the room infrastructure provides to every game.
 * Games never touch sockets, scores storage, or lifecycle phases directly.
 */
export interface GameContext<TSettings = Record<string, unknown>> {
  readonly sessionId: string;
  readonly settings: TSettings;
  /** Injectable RNG (tests use a seeded one). */
  random(): number;
  now(): number;
  /** Current participants (removed players excluded), in join order. */
  participants(): ParticipantView[];
  isParticipant(playerId: string): boolean;
  isOnline(playerId: string): boolean;
  name(playerId: string): string;
  /** Whether this player is currently the room host (hosts may moderate some games). */
  isHost(playerId: string): boolean;
  /** The ONLY way points are awarded. Validated (finite integer, bounded, participant). */
  award(playerId: string, points: number): void;
  /** Main visible timer: shown to clients as the session deadline. Replaces any previous one. Returns the deadline (epoch ms). */
  setTimer(ms: number, onExpire: () => void): number;
  clearTimer(): void;
  /** Hidden helper timer (e.g. hint reveals). Returns a cancel function. */
  setAuxTimer(ms: number, cb: () => void): () => void;
  /** Finish the current round: PLAYING → ROUND_RESULTS. */
  endRound(resultsMs?: number): void;
  /** Skip the remainder of ROUND_RESULTS (e.g. both players accepted a rematch). */
  skipRoundResults(): void;
  /** Request a state broadcast (coalesced per tick). */
  changed(): void;
  emitStroke(segment: StrokeSegment, exceptPlayerId: string): void;
  emitCanvas(segments: StrokeSegment[]): void;
}

/** The shared lifecycle interface every mini-game implements. */
export interface GameInstance<K extends GameId = GameId> {
  readonly gameId: K;
  /** Number of rounds if known up-front, else null. */
  totalRounds(): number | null;
  currentRound(): number;
  /** Called once when the room enters PLAYING for the first time. */
  startGame(): void;
  /** Called when the room enters PLAYING for each subsequent round. */
  advanceGame(): void;
  hasNextRound(): boolean;
  /** Validated, typed action from an authenticated participant. Throw AppError to reject. */
  handlePlayerAction(playerId: string, action: GameActionMap[K], phase: RoomPhase): void;
  handleStroke?(playerId: string, segment: StrokeSegment): void;
  getCanvas?(): StrokeSegment[];
  getPublicState(): GamePublicMap[K];
  getPrivateStateForPlayer(playerId: string): GamePrivateMap[K];
  onParticipantRemoved?(playerId: string): void;
  onConnectionChange?(playerId: string, online: boolean): void;
  /** Called when the session ends (naturally or early). Optional note shown on the results screen. */
  finishGame(): { note?: string };
  /** Release any resources. Timers are cleared by the infrastructure. */
  cleanupGame(): void;
}

export interface GameDefinition<K extends GameId = GameId> {
  id: K;
  /** Optional extra start validation (beyond min/max players). Return an error message to block start. */
  validateStart?(participantCount: number, settings: Record<string, unknown>): string | null;
  initializeGame(ctx: GameContext<any>): GameInstance<K>;
}
