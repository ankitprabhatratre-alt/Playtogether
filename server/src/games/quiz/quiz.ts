import type { QuizAction, QuizPrivate, QuizPublic, RoomPhase } from '@playtogether/shared';
import { QUIZ_CATEGORIES } from '@playtogether/shared';
import { invalidAction, invalidState } from '../../util/errors.js';
import { QUIZ_QUESTIONS, type QuizQuestion } from '../../content/quizQuestions.js';
import type { GameContext, GameDefinition, GameInstance } from '../types.js';
import { shuffle } from '../util.js';

export interface QuizSettings {
  questionCount: number;
  timePerQuestion: number;
  difficulty: 'mixed' | 'easy' | 'medium' | 'hard';
  categories: string[];
  speedBonus: boolean;
}

export const BASE_POINTS = 100;
export const MAX_SPEED_BONUS = 50;

interface Prepared {
  q: QuizQuestion;
  choices: string[];
  correctIndex: number;
}

export function selectQuestions(settings: QuizSettings, random: () => number, bank = QUIZ_QUESTIONS): QuizQuestion[] {
  const pool = bank.filter((q) => settings.categories.includes(q.c) && (settings.difficulty === 'mixed' || q.d === settings.difficulty));
  return shuffle(pool, random).slice(0, settings.questionCount);
}

class QuizGame implements GameInstance<'quiz'> {
  readonly gameId = 'quiz' as const;
  private questions: Prepared[];
  private index = -1;
  private stage: QuizPublic['stage'] = 'question';
  private answers = new Map<string, { choice: number; at: number }>();
  private startedAt = 0;
  private deadline = 0;
  private lastResults: NonNullable<QuizPublic['reveal']> | null = null;

  constructor(private readonly ctx: GameContext<QuizSettings>) {
    this.questions = selectQuestions(ctx.settings, ctx.random).map((q) => {
      const choices = shuffle(q.a, ctx.random);
      return { q, choices, correctIndex: choices.indexOf(q.a[0]) };
    });
  }

  totalRounds() {
    return this.questions.length;
  }
  currentRound() {
    return Math.max(1, this.index + 1);
  }
  hasNextRound() {
    return this.index + 1 < this.questions.length;
  }

  startGame() {
    this.beginQuestion(0);
  }
  advanceGame() {
    this.beginQuestion(this.index + 1);
  }

  private beginQuestion(i: number) {
    this.index = i;
    this.stage = 'question';
    this.answers.clear();
    this.lastResults = null;
    this.startedAt = this.ctx.now();
    this.deadline = this.ctx.setTimer(this.ctx.settings.timePerQuestion * 1000, () => this.reveal());
    this.ctx.changed();
  }

  handlePlayerAction(playerId: string, action: QuizAction, phase: RoomPhase) {
    if (phase !== 'PLAYING' || this.stage !== 'question') throw invalidState('Answers are closed for this question.');
    if (this.answers.has(playerId)) throw invalidAction('You already answered this question.');
    const current = this.questions[this.index];
    if (action.choice >= current.choices.length) throw invalidAction('Invalid choice.');
    this.answers.set(playerId, { choice: action.choice, at: this.ctx.now() });
    this.checkAllAnswered();
  }

  private checkAllAnswered() {
    if (this.stage !== 'question') return;
    const online = this.ctx.participants().filter((p) => p.online);
    if (online.length > 0 && online.every((p) => this.answers.has(p.id))) this.reveal();
  }

  /** Score a single answer. Exported logic for tests via computePoints. */
  private reveal() {
    if (this.stage !== 'question') return;
    this.stage = 'reveal';
    const current = this.questions[this.index];
    const counts = current.choices.map(() => 0);
    const results: NonNullable<QuizPublic['reveal']>['results'] = [];
    for (const p of this.ctx.participants()) {
      const a = this.answers.get(p.id);
      if (a) counts[a.choice]++;
      const correct = !!a && a.choice === current.correctIndex;
      const points = correct ? computePoints(a!.at, this.startedAt, this.deadline, this.ctx.settings.speedBonus) : 0;
      if (points) this.ctx.award(p.id, points);
      results.push({ playerId: p.id, choice: a ? a.choice : null, correct, points });
    }
    this.lastResults = { correctIndex: current.correctIndex, counts, results };
    this.ctx.endRound(5000);
  }

  getPublicState(): QuizPublic {
    const current = this.questions[this.index];
    return {
      stage: this.stage,
      questionIndex: this.index,
      total: this.questions.length,
      category: QUIZ_CATEGORIES.find((c) => c.value === current.q.c)?.label ?? current.q.c,
      difficulty: current.q.d,
      prompt: current.q.q,
      choices: current.choices,
      answeredIds: [...this.answers.keys()],
      // The correct answer is only included once the reveal stage has been reached.
      reveal: this.stage === 'reveal' ? this.lastResults : null,
    };
  }

  getPrivateStateForPlayer(playerId: string): QuizPrivate {
    return { myChoice: this.answers.get(playerId)?.choice ?? null };
  }

  onConnectionChange() {
    this.checkAllAnswered();
  }
  onParticipantRemoved() {
    this.checkAllAnswered();
  }
  finishGame() {
    return {};
  }
  cleanupGame() {
    this.answers.clear();
  }
}

export function computePoints(answeredAt: number, startedAt: number, deadline: number, speedBonus: boolean): number {
  if (!speedBonus) return BASE_POINTS;
  const total = Math.max(1, deadline - startedAt);
  const remaining = Math.min(total, Math.max(0, deadline - answeredAt));
  return BASE_POINTS + Math.round((MAX_SPEED_BONUS * remaining) / total);
}

export const quizGame: GameDefinition<'quiz'> = {
  id: 'quiz',
  validateStart(_n, settings) {
    const s = settings as unknown as QuizSettings;
    return selectQuestions(s, Math.random).length === 0 ? 'No questions match the selected categories and difficulty.' : null;
  },
  initializeGame: (ctx) => new QuizGame(ctx as GameContext<QuizSettings>),
};
