import type { CategoriesAction, CategoriesPrivate, CategoriesPublic, RoomPhase } from '@playtogether/shared';
import { normalizeAnswer, sanitizeText } from '@playtogether/shared';
import { invalidAction, invalidState } from '../../util/errors.js';
import { CATEGORY_LISTS } from '../../content/categoryLists.js';
import type { GameContext, GameDefinition, GameInstance } from '../types.js';
import { shuffle } from '../util.js';

export interface CategoriesSettings {
  rounds: number;
  roundTime: number;
  mode: 'lenient' | 'strict';
  categories: string[];
}

export const UNVERIFIED_POINTS = 4;
export function verifiedPoints(order: number): number {
  return 10 + Math.max(0, 6 - order * 2);
}

const normalizedLists = new Map<string, Set<string>>();
function listFor(cat: string): Set<string> {
  let s = normalizedLists.get(cat);
  if (!s) {
    s = new Set((CATEGORY_LISTS[cat]?.answers ?? []).map(normalizeAnswer));
    normalizedLists.set(cat, s);
  }
  return s;
}

/** Is the (normalized) answer in the category list? Tolerates simple plurals and a leading "the". */
export function isVerified(cat: string, normalized: string): boolean {
  const list = listFor(cat);
  const base = normalized.replace(/^the /, '');
  if (list.has(base)) return true;
  if (base.endsWith('es') && list.has(base.slice(0, -2))) return true;
  if (base.endsWith('s') && list.has(base.slice(0, -1))) return true;
  return false;
}

interface Combo {
  cat: string;
  letter: string;
}

/** Build a fair sequence of category+letter combos: each letter has at least 3 listed answers. */
export function buildCombos(categories: string[], rounds: number, random: () => number): Combo[] {
  const all: Combo[] = [];
  for (const cat of categories) {
    const counts = new Map<string, number>();
    for (const a of listFor(cat)) counts.set(a[0], (counts.get(a[0]) ?? 0) + 1);
    for (const [letter, n] of counts) if (n >= 3 && /[a-z]/.test(letter)) all.push({ cat, letter });
  }
  const shuffled = shuffle(all, random);
  // Spread categories out: avoid the same category twice in a row where possible.
  const out: Combo[] = [];
  while (out.length < rounds && shuffled.length) {
    const prev = out[out.length - 1];
    let idx = shuffled.findIndex((c) => !prev || c.cat !== prev.cat);
    if (idx === -1) idx = 0;
    out.push(shuffled.splice(idx, 1)[0]);
  }
  return out;
}

class CategoriesGame implements GameInstance<'categories'> {
  readonly gameId = 'categories' as const;
  private combos: Combo[];
  private index = -1;
  private stage: CategoriesPublic['stage'] = 'answering';
  private answers = new Map<string, { answer: string; normalized: string; verified: boolean; order: number }>();
  private reveal: CategoriesPublic['reveal'] = null;

  constructor(private readonly ctx: GameContext<CategoriesSettings>) {
    this.combos = buildCombos(ctx.settings.categories, ctx.settings.rounds, ctx.random);
  }

  totalRounds() {
    return this.combos.length;
  }
  currentRound() {
    return Math.max(1, this.index + 1);
  }
  hasNextRound() {
    return this.index + 1 < this.combos.length;
  }
  startGame() {
    this.begin(0);
  }
  advanceGame() {
    this.begin(this.index + 1);
  }

  private begin(i: number) {
    this.index = i;
    this.stage = 'answering';
    this.answers.clear();
    this.reveal = null;
    this.ctx.setTimer(this.ctx.settings.roundTime * 1000, () => this.doReveal());
  }

  private doReveal() {
    if (this.stage !== 'answering') return;
    this.stage = 'reveal';
    const combo = this.combos[this.index];
    let verifiedOrder = 0;
    const rows = [...this.answers.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([playerId, a]) => {
        const points = a.verified ? verifiedPoints(verifiedOrder++) : UNVERIFIED_POINTS;
        this.ctx.award(playerId, points);
        return { playerId, answer: a.answer, verified: a.verified, points, order: a.order };
      });
    const taken = new Set([...this.answers.values()].map((a) => a.normalized));
    const examples = shuffle(
      [...listFor(combo.cat)].filter((w) => w[0] === combo.letter && !taken.has(w)),
      this.ctx.random,
    ).slice(0, 5);
    this.reveal = { answers: rows, examples };
    this.ctx.endRound(6000);
  }

  handlePlayerAction(playerId: string, action: CategoriesAction, phase: RoomPhase) {
    if (phase !== 'PLAYING' || this.stage !== 'answering') throw invalidState('Time is up for this round.');
    if (this.answers.has(playerId)) throw invalidAction('You already locked in an answer this round.');
    const combo = this.combos[this.index];
    const text = sanitizeText(action.text, 40);
    const normalized = normalizeAnswer(text);
    if (normalized.length < 2) throw invalidAction('Answer is too short.');
    if (!/^[a-z][a-z0-9 ]*$/.test(normalized)) throw invalidAction('Use letters only.');
    if (normalized.replace(/^the /, '')[0] !== combo.letter) throw invalidAction(`Your answer must start with "${combo.letter.toUpperCase()}".`);
    for (const [other, a] of this.answers) {
      if (a.normalized.replace(/^the /, '') === normalized.replace(/^the /, '')) {
        throw invalidAction(`${this.ctx.name(other)} already claimed that one, try another!`);
      }
    }
    const verified = isVerified(combo.cat, normalized);
    if (!verified && this.ctx.settings.mode === 'strict') {
      throw invalidAction('Not in our list for this category (strict mode). Try another!');
    }
    this.answers.set(playerId, { answer: text, normalized, verified, order: this.answers.size });
    this.checkAll();
  }

  private checkAll() {
    const online = this.ctx.participants().filter((p) => p.online);
    if (this.stage === 'answering' && online.length > 0 && online.every((p) => this.answers.has(p.id))) this.doReveal();
  }
  onConnectionChange() {
    this.checkAll();
  }
  onParticipantRemoved(playerId: string) {
    this.answers.delete(playerId);
    this.checkAll();
  }

  getPublicState(): CategoriesPublic {
    const combo = this.combos[this.index];
    return {
      stage: this.stage,
      round: this.index + 1,
      totalRounds: this.combos.length,
      category: CATEGORY_LISTS[combo.cat]?.label ?? combo.cat,
      letter: combo.letter.toUpperCase(),
      mode: this.ctx.settings.mode,
      submittedIds: [...this.answers.keys()],
      reveal: this.stage === 'reveal' ? this.reveal : null,
    };
  }
  getPrivateStateForPlayer(playerId: string): CategoriesPrivate {
    const a = this.answers.get(playerId);
    // Verified status is withheld until the reveal so scores can't be inferred mid-round.
    return { myAnswer: a?.answer ?? null, verified: a && this.stage === 'reveal' ? a.verified : null };
  }
  finishGame() {
    return {};
  }
  cleanupGame() {
    this.answers.clear();
  }
}

export const categoriesGame: GameDefinition<'categories'> = {
  id: 'categories',
  validateStart(_n, settings) {
    const s = settings as unknown as CategoriesSettings;
    return buildCombos(s.categories, 1, Math.random).length === 0 ? 'No playable category/letter combinations.' : null;
  },
  initializeGame: (ctx) => new CategoriesGame(ctx as GameContext<CategoriesSettings>),
};
