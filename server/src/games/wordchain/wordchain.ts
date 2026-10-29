import type { RoomPhase, WordChainAction, WordChainPublic } from '@playtogether/shared';
import { invalidAction, invalidState } from '../../util/errors.js';
import type { GameContext, GameDefinition, GameInstance } from '../types.js';
import { pick } from '../util.js';
import { getDictionary } from './dictionary.js';

export interface WordChainSettings {
  rounds: number;
  turnTime: number;
  minLength: number;
  validation: 'dictionary' | 'basic';
  maxWords: number;
}

const START_LETTERS = 'abcdefghilmnoprstw'.split('');
export const POINTS_PER_WORD = 10;
export const LONG_WORD_BONUS = 5;
export const SURVIVOR_BONUS = 20;

export type WordCheck = { ok: true; word: string } | { ok: false; reason: string };

/** Pure validation of a submitted word (exported for tests). */
export function checkWord(raw: string, opts: { requiredLetter: string; minLength: number; used: Set<string>; dictionary: Set<string> | null }): WordCheck {
  const word = raw.trim().toLowerCase();
  if (!word) return { ok: false, reason: 'Please type a word.' };
  if (!/^[a-z]+$/.test(word)) return { ok: false, reason: 'Use letters A–Z only (no spaces, digits or symbols).' };
  if (word.length < opts.minLength) return { ok: false, reason: `Words must be at least ${opts.minLength} letters.` };
  if (word[0] !== opts.requiredLetter) return { ok: false, reason: `Your word must start with "${opts.requiredLetter.toUpperCase()}".` };
  if (opts.used.has(word)) return { ok: false, reason: `"${word}" was already used this round.` };
  if (opts.dictionary && !opts.dictionary.has(word)) return { ok: false, reason: `"${word}" is not in the dictionary.` };
  return { ok: true, word };
}

class WordChainGame implements GameInstance<'wordchain'> {
  readonly gameId = 'wordchain' as const;
  private round = 0;
  private stage: WordChainPublic['stage'] = 'turn';
  private order: string[] = [];
  private alive: string[] = [];
  private eliminated: string[] = [];
  private chain: WordChainPublic['chain'] = [];
  private used = new Set<string>();
  private current: string | null = null;
  private requiredLetter = 'a';
  private lastEvent: WordChainPublic['lastEvent'] = null;
  private roundWinnerId: string | null = null;
  private readonly dictionary: Set<string> | null;

  constructor(private readonly ctx: GameContext<WordChainSettings>) {
    this.dictionary = ctx.settings.validation === 'dictionary' ? getDictionary() : null;
  }

  totalRounds() {
    return this.ctx.settings.rounds;
  }
  currentRound() {
    return Math.max(1, this.round);
  }
  hasNextRound() {
    return this.round < this.ctx.settings.rounds;
  }
  startGame() {
    this.beginRound();
  }
  advanceGame() {
    this.beginRound();
  }

  private beginRound() {
    this.round++;
    this.stage = 'turn';
    const ps = this.ctx.participants();
    // Rotate who starts each round.
    const shift = (this.round - 1) % ps.length;
    this.order = [...ps.slice(shift), ...ps.slice(0, shift)].map((p) => p.id);
    this.alive = [...this.order];
    this.eliminated = [];
    this.chain = [];
    this.used.clear();
    this.lastEvent = null;
    this.roundWinnerId = null;
    this.requiredLetter = pick(START_LETTERS, this.ctx.random);
    this.current = null;
    this.nextTurn();
  }

  /** Move to the next alive player after the current one; eliminates offline players on their turn. */
  private nextTurn(candidate?: string | null) {
    if (this.stage !== 'turn') return;
    let explicit = candidate !== undefined;
    for (let guard = 0; guard < this.order.length + 1; guard++) {
      if (this.checkRoundOver()) return;
      const next = explicit ? candidate! : this.nextAliveAfter(this.current);
      explicit = false;
      if (!next) return this.finishRound();
      this.current = next;
      if (!this.ctx.isOnline(next)) {
        this.eliminate(next);
        this.lastEvent = { kind: 'skipped-offline', playerId: next };
        continue;
      }
      this.ctx.setTimer(this.ctx.settings.turnTime * 1000, () => this.onTimeout());
      this.ctx.changed();
      return;
    }
    this.finishRound();
  }

  private nextAliveAfter(id: string | null): string | null {
    if (this.alive.length === 0) return null;
    if (id === null) return this.alive[0];
    const idx = this.order.indexOf(id);
    for (let i = 1; i <= this.order.length; i++) {
      const cand = this.order[(idx + i) % this.order.length];
      if (this.alive.includes(cand)) return cand;
    }
    return null;
  }

  private eliminate(id: string) {
    this.alive = this.alive.filter((p) => p !== id);
    if (!this.eliminated.includes(id)) this.eliminated.push(id);
  }

  private checkRoundOver(): boolean {
    if (this.alive.length <= 1 || this.chain.length >= this.ctx.settings.maxWords) {
      this.finishRound();
      return true;
    }
    return false;
  }

  private onTimeout() {
    if (this.stage !== 'turn' || !this.current) return;
    const timedOut = this.current;
    this.eliminate(timedOut);
    this.lastEvent = { kind: 'timeout', playerId: timedOut };
    this.nextTurn();
  }

  private finishRound() {
    if (this.stage !== 'turn') return;
    this.stage = 'reveal';
    this.current = null;
    this.ctx.clearTimer();
    if (this.alive.length === 1) {
      this.roundWinnerId = this.alive[0];
      this.ctx.award(this.alive[0], SURVIVOR_BONUS);
    } else if (this.alive.length > 1) {
      // Max words reached: everyone still standing shares a smaller bonus.
      for (const id of this.alive) this.ctx.award(id, Math.round(SURVIVOR_BONUS / 2));
    }
    this.ctx.endRound(6000);
  }

  handlePlayerAction(playerId: string, action: WordChainAction, phase: RoomPhase) {
    if (phase !== 'PLAYING' || this.stage !== 'turn') throw invalidState('The round is over.');
    if (playerId !== this.current) throw invalidAction('It is not your turn.');
    const res = checkWord(action.word, { requiredLetter: this.requiredLetter, minLength: this.ctx.settings.minLength, used: this.used, dictionary: this.dictionary });
    if (!res.ok) throw invalidAction(res.reason);
    this.used.add(res.word);
    this.chain.push({ word: res.word, playerId });
    this.ctx.award(playerId, POINTS_PER_WORD + (res.word.length >= 7 ? LONG_WORD_BONUS : 0));
    this.requiredLetter = res.word[res.word.length - 1];
    this.lastEvent = { kind: 'accepted', playerId, word: res.word };
    this.nextTurn();
  }

  onParticipantRemoved(playerId: string) {
    const wasCurrent = this.current === playerId;
    // Compute the successor while the removed player is still in the turn order.
    this.alive = this.alive.filter((p) => p !== playerId);
    const successor = wasCurrent ? this.nextAliveAfter(playerId) : null;
    this.order = this.order.filter((p) => p !== playerId);
    if (this.stage !== 'turn') return;
    if (wasCurrent) {
      this.current = null;
      this.ctx.clearTimer();
      this.nextTurn(successor);
    } else {
      this.checkRoundOver();
    }
  }

  getPublicState(): WordChainPublic {
    return {
      stage: this.stage,
      round: this.round,
      requiredLetter: this.requiredLetter,
      currentPlayerId: this.current,
      chain: this.chain.slice(-40),
      alive: [...this.alive],
      eliminated: [...this.eliminated],
      validation: this.dictionary ? 'dictionary' : 'basic',
      minLength: this.ctx.settings.minLength,
      lastEvent: this.lastEvent,
      roundWinnerId: this.roundWinnerId,
    };
  }
  getPrivateStateForPlayer(): null {
    return null;
  }
  finishGame() {
    return {};
  }
  cleanupGame() {
    this.used.clear();
  }
}

export const wordChainGame: GameDefinition<'wordchain'> = {
  id: 'wordchain',
  validateStart(_n, settings) {
    if (settings.validation === 'dictionary' && !getDictionary()) {
      return 'The dictionary file is missing on the server. Choose "Basic" validation instead.';
    }
    return null;
  },
  initializeGame: (ctx) => new WordChainGame(ctx as GameContext<WordChainSettings>),
};
