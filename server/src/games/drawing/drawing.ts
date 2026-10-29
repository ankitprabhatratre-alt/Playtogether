import type { DrawingAction, DrawingPrivate, DrawingPublic, RoomPhase, StrokeSegment } from '@playtogether/shared';
import { normalizeAnswer, sanitizeText } from '@playtogether/shared';
import { invalidAction, invalidState } from '../../util/errors.js';
import { DRAWING_WORDS } from '../../content/partyContent.js';
import type { GameContext, GameDefinition, GameInstance } from '../types.js';
import { levenshtein, shuffle } from '../util.js';

export interface DrawingSettings {
  cycles: number;
  drawTime: number;
  wordChoices: number;
  difficulty: 'mixed' | 'easy' | 'medium' | 'hard';
  hints: boolean;
}

const CHOOSE_MS = 15_000;
const MAX_SEGMENTS = 5000;
const MAX_POINTS_TOTAL = 400_000;
const FEED_MAX = 40;
const DRAWER_OFFLINE_GRACE_MS = 8000;

/** Points for the n-th correct guesser (0-based). */
export function guessPoints(order: number): number {
  return Math.max(40, 100 - order * 15);
}
export const DRAWER_POINTS_PER_GUESS = 25;

class DrawingGame implements GameInstance<'drawing'> {
  readonly gameId = 'drawing' as const;
  private turnOrder: string[];
  private turnIdx = -1;
  private stage: DrawingPublic['stage'] = 'choosing';
  private drawerId = '';
  private choices: string[] = [];
  private word = '';
  private revealed = new Set<number>();
  private guessed: string[] = [];
  private feed: DrawingPublic['feed'] = [];
  private feedSeq = 0;
  private segments: StrokeSegment[] = [];
  private pointsTotal = 0;
  private usedWords = new Set<string>();
  private results: { playerId: string; points: number }[] = [];
  private cancelAux: (() => void)[] = [];

  constructor(private readonly ctx: GameContext<DrawingSettings>) {
    const ids = ctx.participants().map((p) => p.id);
    this.turnOrder = [];
    for (let c = 0; c < ctx.settings.cycles; c++) this.turnOrder.push(...ids);
  }

  totalRounds() {
    return this.turnOrder.length;
  }
  currentRound() {
    return Math.max(1, this.turnIdx + 1);
  }
  hasNextRound() {
    return this.findNextTurn(this.turnIdx + 1) !== -1;
  }
  startGame() {
    this.beginTurn(this.findNextTurn(0));
  }
  advanceGame() {
    this.beginTurn(this.findNextTurn(this.turnIdx + 1));
  }

  private findNextTurn(from: number): number {
    for (let i = from; i < this.turnOrder.length; i++) {
      const id = this.turnOrder[i];
      if (this.ctx.isParticipant(id) && this.ctx.isOnline(id)) return i;
    }
    return -1;
  }

  private wordPool(): string[] {
    const d = this.ctx.settings.difficulty;
    const all = d === 'mixed' ? [...DRAWING_WORDS.easy, ...DRAWING_WORDS.medium, ...DRAWING_WORDS.hard] : DRAWING_WORDS[d];
    const fresh = all.filter((w) => !this.usedWords.has(w));
    return fresh.length >= 3 ? fresh : all;
  }

  private beginTurn(idx: number) {
    if (idx === -1) {
      // Nobody eligible to draw: close out this round gracefully.
      this.turnIdx = this.turnOrder.length;
      this.stage = 'reveal';
      this.ctx.endRound(1000);
      return;
    }
    this.clearAux();
    this.turnIdx = idx;
    this.drawerId = this.turnOrder[idx];
    this.stage = 'choosing';
    this.word = '';
    this.revealed.clear();
    this.guessed = [];
    this.results = [];
    this.feed = [];
    this.segments = [];
    this.pointsTotal = 0;
    this.ctx.emitCanvas([]);
    this.choices = shuffle(this.wordPool(), this.ctx.random).slice(0, this.ctx.settings.wordChoices);
    this.pushFeed(null, 'system', `${this.ctx.name(this.drawerId)} is choosing a word…`);
    if (this.choices.length === 1) {
      this.startDrawing(0);
    } else {
      this.ctx.setTimer(CHOOSE_MS, () => this.startDrawing(0));
    }
  }

  private startDrawing(choiceIdx: number) {
    if (this.stage !== 'choosing') return;
    this.word = this.choices[choiceIdx] ?? this.choices[0];
    this.usedWords.add(this.word);
    this.stage = 'drawing';
    this.pushFeed(null, 'system', `${this.ctx.name(this.drawerId)} is drawing!`);
    const ms = this.ctx.settings.drawTime * 1000;
    this.ctx.setTimer(ms, () => this.endTurn());
    const letters = this.word.replace(/ /g, '').length;
    if (this.ctx.settings.hints && letters > 3) {
      this.cancelAux.push(this.ctx.setAuxTimer(ms * 0.5, () => this.revealLetter()));
      if (letters > 5) this.cancelAux.push(this.ctx.setAuxTimer(ms * 0.75, () => this.revealLetter()));
    }
  }

  private revealLetter() {
    if (this.stage !== 'drawing') return;
    const hidden = [...this.word].map((ch, i) => (ch !== ' ' && !this.revealed.has(i) ? i : -1)).filter((i) => i >= 0);
    if (hidden.length <= 2) return;
    this.revealed.add(hidden[Math.floor(this.ctx.random() * hidden.length)]);
    this.ctx.changed();
  }

  private endTurn() {
    if (this.stage === 'reveal') return;
    this.clearAux();
    const wasDrawing = this.stage === 'drawing';
    this.stage = 'reveal';
    if (!wasDrawing && !this.word) this.word = this.choices[0] ?? '';
    this.results = this.ctx.participants().map((p) => ({ playerId: p.id, points: 0 }));
    this.guessed.forEach((id, order) => {
      const r = this.results.find((x) => x.playerId === id);
      if (r) r.points = guessPoints(order);
    });
    const drawerRes = this.results.find((x) => x.playerId === this.drawerId);
    if (drawerRes) drawerRes.points = this.guessed.length * DRAWER_POINTS_PER_GUESS;
    this.ctx.endRound(6000);
  }

  private guessers(): string[] {
    return this.ctx.participants().filter((p) => p.id !== this.drawerId && p.online).map((p) => p.id);
  }

  handlePlayerAction(playerId: string, action: DrawingAction, phase: RoomPhase) {
    if (phase !== 'PLAYING') throw invalidState('This turn is over.');
    switch (action.type) {
      case 'chooseWord': {
        if (playerId !== this.drawerId) throw invalidAction('Only the drawer can choose the word.');
        if (this.stage !== 'choosing') throw invalidState('The word has already been chosen.');
        if (action.index >= this.choices.length) throw invalidAction('Invalid choice.');
        this.startDrawing(action.index);
        return;
      }
      case 'clear':
      case 'undo': {
        if (playerId !== this.drawerId) throw invalidAction('Only the drawer can change the canvas.');
        if (this.stage !== 'drawing') throw invalidState('You can only draw during the drawing phase.');
        if (action.type === 'clear') this.segments = [];
        else {
          const last = this.segments[this.segments.length - 1];
          if (last) this.segments = this.segments.filter((s) => s.strokeId !== last.strokeId);
        }
        this.pointsTotal = this.segments.reduce((n, s) => n + s.points.length, 0);
        this.ctx.emitCanvas(this.segments);
        return;
      }
      case 'guess': {
        if (playerId === this.drawerId) throw invalidAction('The drawer cannot guess.');
        if (this.stage !== 'drawing') throw invalidState('Guessing is not open.');
        if (this.guessed.includes(playerId)) throw invalidAction('You already guessed the word!');
        const text = sanitizeText(action.text, 50);
        if (!text) throw invalidAction('Type a guess first.');
        const g = normalizeAnswer(text);
        const target = normalizeAnswer(this.word);
        if (g === target || g.replace(/ /g, '') === target.replace(/ /g, '')) {
          const order = this.guessed.length;
          this.guessed.push(playerId);
          this.ctx.award(playerId, guessPoints(order));
          this.ctx.award(this.drawerId, DRAWER_POINTS_PER_GUESS);
          this.pushFeed(playerId, 'correct', `${this.ctx.name(playerId)} guessed the word!`);
          const remaining = this.guessers().filter((id) => !this.guessed.includes(id));
          if (remaining.length === 0) this.endTurn();
        } else if (target.length >= 4 && levenshtein(g, target) === 1) {
          // Don't broadcast near-miss text: it would give the answer away.
          this.pushFeed(playerId, 'close', `${this.ctx.name(playerId)} is very close!`);
        } else {
          this.pushFeed(playerId, 'guess', text);
        }
        return;
      }
    }
  }

  handleStroke(playerId: string, seg: StrokeSegment) {
    if (playerId !== this.drawerId || this.stage !== 'drawing') return;
    if (this.segments.length >= MAX_SEGMENTS || this.pointsTotal + seg.points.length > MAX_POINTS_TOTAL) return;
    this.segments.push(seg);
    this.pointsTotal += seg.points.length;
    this.ctx.emitStroke(seg, playerId);
  }

  getCanvas(): StrokeSegment[] {
    return this.stage === 'choosing' ? [] : this.segments;
  }

  private pushFeed(playerId: string | null, kind: DrawingPublic['feed'][number]['kind'], text: string) {
    this.feed.push({ id: ++this.feedSeq, playerId, kind, text });
    if (this.feed.length > FEED_MAX) this.feed.splice(0, this.feed.length - FEED_MAX);
    this.ctx.changed();
  }

  private hint(): string {
    if (!this.word) return '';
    return [...this.word].map((ch, i) => (ch === ' ' ? '/' : this.revealed.has(i) ? ch : '_')).join(' ');
  }

  onConnectionChange(playerId: string, online: boolean) {
    if (this.stage === 'reveal') return;
    if (playerId === this.drawerId && !online) {
      this.cancelAux.push(
        this.ctx.setAuxTimer(DRAWER_OFFLINE_GRACE_MS, () => {
          if (!this.ctx.isOnline(this.drawerId) && this.stage !== 'reveal') {
            this.pushFeed(null, 'system', `${this.ctx.name(this.drawerId)} disconnected: skipping this turn.`);
            this.endTurn();
          }
        }),
      );
    } else if (this.stage === 'drawing' && this.guessed.length > 0) {
      if (this.guessers().every((id) => this.guessed.includes(id))) this.endTurn();
    }
  }

  onParticipantRemoved(playerId: string) {
    if (this.stage === 'reveal') return;
    if (playerId === this.drawerId) this.endTurn();
    else this.onConnectionChange(playerId, false);
  }

  getPublicState(): DrawingPublic {
    return {
      stage: this.stage,
      turn: this.turnIdx + 1,
      totalTurns: this.turnOrder.length,
      drawerId: this.drawerId,
      // Never include the word itself before the reveal; only the masked hint.
      hint: this.stage === 'drawing' ? this.hint() : '',
      wordLength: this.stage === 'drawing' ? this.word.replace(/ /g, '').length : 0,
      guessedIds: [...this.guessed],
      feed: this.feed,
      reveal: this.stage === 'reveal' ? { word: this.word, results: this.results } : null,
    };
  }

  getPrivateStateForPlayer(playerId: string): DrawingPrivate {
    const isDrawer = playerId === this.drawerId;
    const guessed = this.guessed.includes(playerId);
    return {
      wordChoices: isDrawer && this.stage === 'choosing' ? this.choices : null,
      word: (isDrawer || guessed) && this.stage !== 'choosing' ? this.word : null,
      guessedCorrectly: guessed,
    };
  }

  private clearAux() {
    for (const c of this.cancelAux) c();
    this.cancelAux = [];
  }

  finishGame() {
    this.clearAux();
    return {};
  }
  cleanupGame() {
    this.clearAux();
    this.segments = [];
  }
}

export const drawingGame: GameDefinition<'drawing'> = {
  id: 'drawing',
  initializeGame: (ctx) => new DrawingGame(ctx as GameContext<DrawingSettings>),
};
