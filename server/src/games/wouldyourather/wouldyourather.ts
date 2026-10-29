import type { RoomPhase, WouldYouRatherAction, WouldYouRatherPrivate, WouldYouRatherPublic } from '@playtogether/shared';
import { invalidState } from '../../util/errors.js';
import { WOULD_YOU_RATHER } from '../../content/partyContent.js';
import type { GameContext, GameDefinition, GameInstance } from '../types.js';
import { shuffle } from '../util.js';

export interface WouldYouRatherSettings {
  questionCount: number;
  timePerQuestion: number;
  scoring: 'majority' | 'none';
}

class WouldYouRatherGame implements GameInstance<'wouldyourather'> {
  readonly gameId = 'wouldyourather' as const;
  private questions: [string, string][];
  private index = -1;
  private stage: WouldYouRatherPublic['stage'] = 'voting';
  private votes = new Map<string, 'A' | 'B'>();
  private reveal: WouldYouRatherPublic['reveal'] = null;

  constructor(private readonly ctx: GameContext<WouldYouRatherSettings>) {
    this.questions = shuffle(WOULD_YOU_RATHER, ctx.random)
      .slice(0, ctx.settings.questionCount)
      .map(([a, b]) => (ctx.random() < 0.5 ? [a, b] : [b, a]));
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
    this.begin(0);
  }
  advanceGame() {
    this.begin(this.index + 1);
  }

  private begin(i: number) {
    this.index = i;
    this.stage = 'voting';
    this.votes.clear();
    this.reveal = null;
    this.ctx.setTimer(this.ctx.settings.timePerQuestion * 1000, () => this.doReveal());
  }

  private doReveal() {
    if (this.stage !== 'voting') return;
    this.stage = 'reveal';
    let countA = 0;
    let countB = 0;
    for (const v of this.votes.values()) v === 'A' ? countA++ : countB++;
    const total = countA + countB;
    const percentA = total ? Math.round((countA / total) * 100) : 0;
    this.reveal = {
      countA,
      countB,
      percentA,
      percentB: total ? 100 - percentA : 0,
      nonVoterIds: this.ctx.participants().filter((p) => !this.votes.has(p.id)).map((p) => p.id),
    };
    if (this.ctx.settings.scoring === 'majority' && countA !== countB) {
      const majority = countA > countB ? 'A' : 'B';
      for (const [id, v] of this.votes) if (v === majority) this.ctx.award(id, 1);
    }
    this.ctx.endRound(5000);
  }

  handlePlayerAction(playerId: string, action: WouldYouRatherAction, phase: RoomPhase) {
    if (phase !== 'PLAYING' || this.stage !== 'voting') throw invalidState('Voting is closed.');
    // Changing your mind is allowed until everyone has voted.
    this.votes.set(playerId, action.choice);
    this.checkAll();
  }

  private checkAll() {
    const online = this.ctx.participants().filter((p) => p.online);
    if (this.stage === 'voting' && online.length > 0 && online.every((p) => this.votes.has(p.id))) this.doReveal();
  }

  onConnectionChange() {
    this.checkAll();
  }
  onParticipantRemoved(playerId: string) {
    this.votes.delete(playerId);
    this.checkAll();
  }

  getPublicState(): WouldYouRatherPublic {
    const [a, b] = this.questions[this.index];
    return {
      stage: this.stage,
      index: this.index,
      total: this.questions.length,
      optionA: a,
      optionB: b,
      votedIds: [...this.votes.keys()],
      scoring: this.ctx.settings.scoring,
      // Aggregates only — individual votes are never published.
      reveal: this.stage === 'reveal' ? this.reveal : null,
    };
  }
  getPrivateStateForPlayer(playerId: string): WouldYouRatherPrivate {
    return { myVote: this.votes.get(playerId) ?? null };
  }
  finishGame() {
    return {};
  }
  cleanupGame() {
    this.votes.clear();
  }
}

export const wouldYouRatherGame: GameDefinition<'wouldyourather'> = {
  id: 'wouldyourather',
  initializeGame: (ctx) => new WouldYouRatherGame(ctx as GameContext<WouldYouRatherSettings>),
};
