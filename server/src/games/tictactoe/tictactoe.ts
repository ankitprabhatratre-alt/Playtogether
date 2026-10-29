import type { Mark, RoomPhase, TicTacToeAction, TicTacToePublic } from '@playtogether/shared';
import { invalidAction, invalidState } from '../../util/errors.js';
import type { GameContext, GameDefinition, GameInstance } from '../types.js';

export interface TicTacToeSettings {
  matches: number;
  moveTime: number;
  rotation: 'winner-stays' | 'rotate';
}

export const WIN_POINTS = 3;
export const DRAW_POINTS = 1;
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

/** Pure board evaluation (exported for tests). */
export function evaluateBoard(board: (Mark | null)[]): { winner: Mark | null; line: number[] | null; full: boolean } {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { winner: board[a], line, full: false };
  }
  return { winner: null, line: null, full: board.every((c) => c !== null) };
}

class TicTacToeGame implements GameInstance<'tictactoe'> {
  readonly gameId = 'tictactoe' as const;
  private match = 0;
  private stage: TicTacToePublic['stage'] = 'playing';
  private board: (Mark | null)[] = Array(9).fill(null);
  private x = '';
  private o = '';
  private turn: Mark = 'X';
  private queue: string[];
  private result: TicTacToePublic['result'] = null;
  private rematch = new Set<string>();
  private records: TicTacToePublic['records'] = {};

  constructor(private readonly ctx: GameContext<TicTacToeSettings>) {
    this.queue = ctx.participants().map((p) => p.id);
    for (const id of this.queue) this.records[id] = { w: 0, l: 0, d: 0 };
  }

  totalRounds() {
    return this.ctx.settings.matches;
  }
  currentRound() {
    return Math.max(1, this.match);
  }
  hasNextRound() {
    return this.match < this.ctx.settings.matches && this.ctx.participants().length >= 2;
  }

  startGame() {
    // Prefer online players at the front of the queue.
    this.queue.sort((a, b) => Number(this.ctx.isOnline(b)) - Number(this.ctx.isOnline(a)));
    const [x, o, ...rest] = this.queue;
    this.x = x;
    this.o = o;
    this.queue = rest;
    this.beginMatch();
  }

  advanceGame() {
    const bothRematch = this.rematch.has(this.x) && this.rematch.has(this.o) && this.ctx.isParticipant(this.x) && this.ctx.isParticipant(this.o);
    if (bothRematch) {
      [this.x, this.o] = [this.o, this.x]; // swap who starts
    } else {
      this.rotatePlayers();
    }
    this.beginMatch();
  }

  private rotatePlayers() {
    const res = this.result;
    const prevX = this.x;
    const prevO = this.o;
    const stillHere = (id: string) => this.ctx.isParticipant(id);
    let stayer: string | null = null;
    const leaving: string[] = [];
    if (this.ctx.settings.rotation === 'winner-stays' && res?.winner) {
      const winner = res.winner === 'X' ? prevX : prevO;
      const loser = res.winner === 'X' ? prevO : prevX;
      stayer = stillHere(winner) ? winner : null;
      leaving.push(loser);
    } else {
      leaving.push(prevX, prevO);
    }
    this.queue.push(...leaving.filter(stillHere));
    this.queue = this.queue.filter((id, i, arr) => stillHere(id) && arr.indexOf(id) === i && id !== stayer);
    // Online challengers first.
    this.queue.sort((a, b) => Number(this.ctx.isOnline(b)) - Number(this.ctx.isOnline(a)));
    const players: string[] = [];
    if (stayer) players.push(stayer);
    while (players.length < 2 && this.queue.length) players.push(this.queue.shift()!);
    this.x = players[0];
    this.o = players[1];
  }

  private beginMatch() {
    this.match++;
    this.stage = 'playing';
    this.board = Array(9).fill(null);
    this.turn = 'X';
    this.result = null;
    this.rematch.clear();
    this.startMoveTimer();
  }

  private startMoveTimer() {
    this.ctx.setTimer(this.ctx.settings.moveTime * 1000, () => {
      if (this.stage !== 'playing') return;
      this.finishMatch(this.turn === 'X' ? 'O' : 'X', null, 'timeout');
    });
  }

  private finishMatch(winner: Mark | null, line: number[] | null, reason: NonNullable<TicTacToePublic['result']>['reason']) {
    this.stage = 'reveal';
    this.result = { winner, line, reason };
    if (winner) {
      const w = winner === 'X' ? this.x : this.o;
      const l = winner === 'X' ? this.o : this.x;
      this.ctx.award(w, WIN_POINTS);
      if (this.records[w]) this.records[w].w++;
      if (this.records[l]) this.records[l].l++;
    } else {
      this.ctx.award(this.x, DRAW_POINTS);
      this.ctx.award(this.o, DRAW_POINTS);
      if (this.records[this.x]) this.records[this.x].d++;
      if (this.records[this.o]) this.records[this.o].d++;
    }
    this.ctx.endRound(7000);
  }

  handlePlayerAction(playerId: string, action: TicTacToeAction, phase: RoomPhase) {
    if (action.type === 'rematch') {
      if (phase !== 'ROUND_RESULTS' || this.stage !== 'reveal') throw invalidState('Rematches can be requested after a match.');
      if (playerId !== this.x && playerId !== this.o) throw invalidAction('Only the two players can request a rematch.');
      if (!this.hasNextRound()) throw invalidState('That was the final match.');
      this.rematch.add(playerId);
      if (this.rematch.has(this.x) && this.rematch.has(this.o)) this.ctx.skipRoundResults();
      return;
    }
    if (phase !== 'PLAYING' || this.stage !== 'playing') throw invalidState('The match is over.');
    const mark: Mark | null = playerId === this.x ? 'X' : playerId === this.o ? 'O' : null;
    if (!mark) throw invalidAction('You are spectating this match.');
    if (mark !== this.turn) throw invalidAction('It is not your turn.');
    if (this.board[action.cell] !== null) throw invalidAction('That square is already taken.');
    this.board[action.cell] = mark;
    const ev = evaluateBoard(this.board);
    if (ev.winner) return this.finishMatch(ev.winner, ev.line, 'line');
    if (ev.full) return this.finishMatch(null, null, 'draw');
    this.turn = this.turn === 'X' ? 'O' : 'X';
    this.startMoveTimer();
  }

  onParticipantRemoved(playerId: string) {
    this.queue = this.queue.filter((id) => id !== playerId);
    if (this.stage === 'playing' && (playerId === this.x || playerId === this.o)) {
      this.finishMatch(playerId === this.x ? 'O' : 'X', null, 'forfeit');
    }
  }

  getPublicState(): TicTacToePublic {
    return {
      stage: this.stage,
      matchNumber: this.match,
      totalMatches: this.ctx.settings.matches,
      board: [...this.board],
      xPlayerId: this.x,
      oPlayerId: this.o,
      turn: this.turn,
      queue: this.queue.filter((id) => this.ctx.isParticipant(id)),
      result: this.result,
      rematchRequests: [...this.rematch],
      records: this.records,
    };
  }
  getPrivateStateForPlayer(): null {
    return null;
  }
  finishGame() {
    return {};
  }
  cleanupGame() {}
}

export const ticTacToeGame: GameDefinition<'tictactoe'> = {
  id: 'tictactoe',
  initializeGame: (ctx) => new TicTacToeGame(ctx as GameContext<TicTacToeSettings>),
};
