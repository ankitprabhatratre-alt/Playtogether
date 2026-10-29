/**
 * Public (broadcast to the whole room) and private (sent only to one player)
 * state shapes for every game, plus their typed action schemas.
 *
 * RULE: public state must never contain secrets (answers, roles, words, individual
 * votes) until the corresponding reveal stage.
 */
import { z } from 'zod';
import type { GameId } from './catalog.js';

/* ------------------------------ Quiz Battle ------------------------------ */
export interface QuizPublic {
  stage: 'question' | 'reveal';
  questionIndex: number;
  total: number;
  category: string;
  difficulty: string;
  prompt: string;
  choices: string[];
  answeredIds: string[];
  reveal: null | {
    correctIndex: number;
    counts: number[];
    results: { playerId: string; choice: number | null; correct: boolean; points: number }[];
  };
}
export interface QuizPrivate {
  myChoice: number | null;
}
export const quizActionSchema = z.object({ type: z.literal('answer'), choice: z.number().int().min(0).max(3) });

/* ------------------------------- Word Chain ------------------------------ */
export interface WordChainPublic {
  stage: 'turn' | 'reveal';
  round: number;
  requiredLetter: string;
  currentPlayerId: string | null;
  chain: { word: string; playerId: string }[];
  alive: string[];
  eliminated: string[];
  validation: 'dictionary' | 'basic';
  minLength: number;
  lastEvent: null | { kind: 'accepted' | 'timeout' | 'skipped-offline'; playerId: string; word?: string };
  roundWinnerId: string | null;
}
export const wordChainActionSchema = z.object({ type: z.literal('submit'), word: z.string().max(60) });

/* -------------------------------- Impostor ------------------------------- */
export interface ImpostorPublic {
  stage: 'clues' | 'voting' | 'reveal';
  round: number;
  totalRounds: number;
  variant: 'different-word' | 'blank';
  category: string;
  submittedIds: string[];
  clues: { playerId: string; clue: string | null }[] | null;
  votedIds: string[];
  reveal: null | {
    impostorId: string;
    crewWord: string;
    impostorWord: string | null;
    votes: { voterId: string; targetId: string }[];
    tally: Record<string, number>;
    caught: boolean;
  };
}
export interface ImpostorPrivate {
  /** In the undercover variant the impostor is NOT told their role. */
  word: string | null;
  knownRole: 'impostor' | null;
  myClue: string | null;
  myVote: string | null;
}
export const impostorActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('clue'), text: z.string().max(120) }),
  z.object({ type: z.literal('vote'), targetId: z.string().max(64) }),
]);

/* ------------------------------ Draw & Guess ----------------------------- */
export interface DrawingPublic {
  stage: 'choosing' | 'drawing' | 'reveal';
  turn: number;
  totalTurns: number;
  drawerId: string;
  hint: string; // e.g. "_ _ a _" (spaces preserved as "/")
  wordLength: number;
  guessedIds: string[];
  feed: { id: number; playerId: string | null; kind: 'guess' | 'correct' | 'system' | 'close'; text: string }[];
  reveal: null | { word: string; results: { playerId: string; points: number }[] };
}
export interface DrawingPrivate {
  wordChoices: string[] | null;
  word: string | null;
  guessedCorrectly: boolean;
}
export const drawingActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('chooseWord'), index: z.number().int().min(0).max(2) }),
  z.object({ type: z.literal('guess'), text: z.string().max(80) }),
  z.object({ type: z.literal('clear') }),
  z.object({ type: z.literal('undo') }),
]);
/** One stroke segment. Coordinates are integers 0..10000 (normalized canvas space), flattened [x,y,x,y,...]. */
export interface StrokeSegment {
  strokeId: string;
  color: string;
  size: number;
  points: number[];
}
export const strokeSchema = z.object({
  strokeId: z.string().min(1).max(24).regex(/^[A-Za-z0-9_-]+$/),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  size: z.number().int().min(1).max(60),
  points: z
    .array(z.number().int().min(0).max(10000))
    .min(2)
    .max(400)
    .refine((p) => p.length % 2 === 0, 'points must be x,y pairs'),
});

/* ------------------------------ Tic-Tac-Toe ------------------------------ */
export type Mark = 'X' | 'O';
export interface TicTacToePublic {
  stage: 'playing' | 'reveal';
  matchNumber: number;
  totalMatches: number;
  board: (Mark | null)[];
  xPlayerId: string;
  oPlayerId: string;
  turn: Mark;
  queue: string[];
  result: null | { winner: Mark | null; line: number[] | null; reason: 'line' | 'draw' | 'timeout' | 'forfeit' };
  rematchRequests: string[];
  records: Record<string, { w: number; l: number; d: number }>;
}
export const ticTacToeActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), cell: z.number().int().min(0).max(8) }),
  z.object({ type: z.literal('rematch') }),
]);

/* ---------------------------- Would You Rather --------------------------- */
export interface WouldYouRatherPublic {
  stage: 'voting' | 'reveal';
  index: number;
  total: number;
  optionA: string;
  optionB: string;
  votedIds: string[];
  scoring: 'majority' | 'none';
  reveal: null | { countA: number; countB: number; percentA: number; percentB: number; nonVoterIds: string[] };
}
export interface WouldYouRatherPrivate {
  myVote: 'A' | 'B' | null;
}
export const wouldYouRatherActionSchema = z.object({ type: z.literal('vote'), choice: z.enum(['A', 'B']) });

/* ------------------------------ Truth or Dare ---------------------------- */
export interface TruthOrDarePublic {
  stage: 'choosing' | 'prompt' | 'reveal';
  turn: number;
  totalTurns: number;
  cycle: number;
  currentPlayerId: string;
  choice: 'truth' | 'dare' | null;
  prompt: string | null;
  promptCategory: string | null;
  history: { playerId: string; choice: 'truth' | 'dare'; prompt: string; outcome: 'done' | 'skipped' }[];
}
export const truthOrDareActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('choose'), choice: z.enum(['truth', 'dare']) }),
  z.object({ type: z.literal('complete') }),
  z.object({ type: z.literal('skip') }),
]);

/* ---------------------------- Rapid Categories --------------------------- */
export interface CategoriesPublic {
  stage: 'answering' | 'reveal';
  round: number;
  totalRounds: number;
  category: string;
  letter: string;
  mode: 'lenient' | 'strict';
  submittedIds: string[];
  reveal: null | {
    answers: { playerId: string; answer: string; verified: boolean; points: number; order: number }[];
    examples: string[];
  };
}
export interface CategoriesPrivate {
  myAnswer: string | null;
  verified: boolean | null;
}
export const categoriesActionSchema = z.object({ type: z.literal('answer'), text: z.string().max(80) });

/* -------------------------------- Mapping -------------------------------- */
export interface GamePublicMap {
  quiz: QuizPublic;
  wordchain: WordChainPublic;
  impostor: ImpostorPublic;
  drawing: DrawingPublic;
  tictactoe: TicTacToePublic;
  wouldyourather: WouldYouRatherPublic;
  truthordare: TruthOrDarePublic;
  categories: CategoriesPublic;
}
export interface GamePrivateMap {
  quiz: QuizPrivate;
  wordchain: null;
  impostor: ImpostorPrivate;
  drawing: DrawingPrivate;
  tictactoe: null;
  wouldyourather: WouldYouRatherPrivate;
  truthordare: null;
  categories: CategoriesPrivate;
}

export type GameStateUnion = { [K in GameId]: { gameId: K; public: GamePublicMap[K] } }[GameId];
export type GamePrivateUnion = { [K in GameId]: { gameId: K; sessionId: string; data: GamePrivateMap[K] } }[GameId];

export const GAME_ACTION_SCHEMAS: Record<GameId, z.ZodTypeAny> = {
  quiz: quizActionSchema,
  wordchain: wordChainActionSchema,
  impostor: impostorActionSchema,
  drawing: drawingActionSchema,
  tictactoe: ticTacToeActionSchema,
  wouldyourather: wouldYouRatherActionSchema,
  truthordare: truthOrDareActionSchema,
  categories: categoriesActionSchema,
};

export type QuizAction = z.infer<typeof quizActionSchema>;
export type WordChainAction = z.infer<typeof wordChainActionSchema>;
export type ImpostorAction = z.infer<typeof impostorActionSchema>;
export type DrawingAction = z.infer<typeof drawingActionSchema>;
export type TicTacToeAction = z.infer<typeof ticTacToeActionSchema>;
export type WouldYouRatherAction = z.infer<typeof wouldYouRatherActionSchema>;
export type TruthOrDareAction = z.infer<typeof truthOrDareActionSchema>;
export type CategoriesAction = z.infer<typeof categoriesActionSchema>;
export interface GameActionMap {
  quiz: QuizAction;
  wordchain: WordChainAction;
  impostor: ImpostorAction;
  drawing: DrawingAction;
  tictactoe: TicTacToeAction;
  wouldyourather: WouldYouRatherAction;
  truthordare: TruthOrDareAction;
  categories: CategoriesAction;
}
