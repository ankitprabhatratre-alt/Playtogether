import type { ImpostorAction, ImpostorPrivate, ImpostorPublic, RoomPhase } from '@playtogether/shared';
import { normalizeAnswer, sanitizeText } from '@playtogether/shared';
import { invalidAction, invalidState } from '../../util/errors.js';
import { IMPOSTOR_PAIRS, type ImpostorPair } from '../../content/partyContent.js';
import type { GameContext, GameDefinition, GameInstance } from '../types.js';
import { shuffle } from '../util.js';

export interface ImpostorSettings {
  rounds: number;
  variant: 'different-word' | 'blank';
  clueTime: number;
  voteTime: number;
}

export const CORRECT_VOTE_POINTS = 2;
export const ESCAPE_POINTS = 3;

/** Majority logic: impostor is caught only if they alone received the most votes. */
export function tallyVotes(votes: Map<string, string>): { tally: Record<string, number>; top: string | null } {
  const tally: Record<string, number> = {};
  for (const target of votes.values()) tally[target] = (tally[target] ?? 0) + 1;
  let top: string | null = null;
  let best = 0;
  let tie = false;
  for (const [id, n] of Object.entries(tally)) {
    if (n > best) {
      best = n;
      top = id;
      tie = false;
    } else if (n === best) tie = true;
  }
  return { tally, top: tie ? null : top };
}

class ImpostorGame implements GameInstance<'impostor'> {
  readonly gameId = 'impostor' as const;
  private round = 0;
  private stage: ImpostorPublic['stage'] = 'clues';
  private pairs: ImpostorPair[];
  private pair!: ImpostorPair;
  private players: string[] = [];
  private impostorId = '';
  private lastImpostor: string | null = null;
  private clues = new Map<string, string>();
  private votes = new Map<string, string>();
  private reveal: ImpostorPublic['reveal'] = null;

  constructor(private readonly ctx: GameContext<ImpostorSettings>) {
    this.pairs = shuffle(IMPOSTOR_PAIRS, ctx.random);
  }

  totalRounds() {
    return this.ctx.settings.rounds;
  }
  currentRound() {
    return Math.max(1, this.round);
  }
  hasNextRound() {
    return this.round < this.ctx.settings.rounds && this.ctx.participants().length >= 3;
  }
  startGame() {
    this.beginRound();
  }
  advanceGame() {
    this.beginRound();
  }

  private beginRound() {
    this.round++;
    this.stage = 'clues';
    this.pair = this.pairs[(this.round - 1) % this.pairs.length];
    // Randomly swap which word the impostor gets so it is not predictable.
    if (this.ctx.random() < 0.5) this.pair = { ...this.pair, crew: this.pair.impostor, impostor: this.pair.crew };
    this.players = this.ctx.participants().map((p) => p.id);
    let candidates = this.players.filter((id) => id !== this.lastImpostor);
    if (candidates.length === 0) candidates = this.players;
    this.impostorId = candidates[Math.floor(this.ctx.random() * candidates.length)];
    this.lastImpostor = this.impostorId;
    this.clues.clear();
    this.votes.clear();
    this.reveal = null;
    this.ctx.setTimer(this.ctx.settings.clueTime * 1000, () => this.toVoting());
  }

  private wordFor(id: string): string | null {
    if (id !== this.impostorId) return this.pair.crew;
    return this.ctx.settings.variant === 'blank' ? null : this.pair.impostor;
  }

  private activeOnline(): string[] {
    return this.players.filter((id) => this.ctx.isParticipant(id) && this.ctx.isOnline(id));
  }

  private toVoting() {
    if (this.stage !== 'clues') return;
    this.stage = 'voting';
    this.ctx.setTimer(this.ctx.settings.voteTime * 1000, () => this.doReveal());
  }

  private doReveal() {
    if (this.stage === 'reveal') return;
    this.stage = 'reveal';
    const { tally, top } = tallyVotes(this.votes);
    const caught = top === this.impostorId;
    for (const [voter, target] of this.votes) {
      if (voter !== this.impostorId && target === this.impostorId) this.ctx.award(voter, CORRECT_VOTE_POINTS);
    }
    if (!caught) this.ctx.award(this.impostorId, ESCAPE_POINTS);
    this.reveal = {
      impostorId: this.impostorId,
      crewWord: this.pair.crew,
      impostorWord: this.ctx.settings.variant === 'blank' ? null : this.pair.impostor,
      votes: [...this.votes].map(([voterId, targetId]) => ({ voterId, targetId })),
      tally,
      caught,
    };
    this.ctx.endRound(9000);
  }

  handlePlayerAction(playerId: string, action: ImpostorAction, phase: RoomPhase) {
    if (phase !== 'PLAYING') throw invalidState('This round is over.');
    if (!this.players.includes(playerId)) throw invalidAction('You joined after this round started.');
    if (action.type === 'clue') {
      if (this.stage !== 'clues') throw invalidState('Clue time is over.');
      if (this.clues.has(playerId)) throw invalidAction('You already submitted a clue.');
      const clue = sanitizeText(action.text, 60);
      if (!clue) throw invalidAction('Your clue cannot be empty.');
      const word = this.wordFor(playerId);
      if (word) {
        const nClue = ` ${normalizeAnswer(clue)} `;
        for (const part of normalizeAnswer(word).split(' ')) {
          if (part.length >= 3 && nClue.includes(part)) throw invalidAction('Your clue cannot contain the secret word!');
        }
      }
      this.clues.set(playerId, clue);
      if (this.activeOnline().every((id) => this.clues.has(id))) this.toVoting();
      return;
    }
    if (action.type === 'vote') {
      if (this.stage !== 'voting') throw invalidState('Voting is not open.');
      if (!this.players.includes(action.targetId) || !this.ctx.isParticipant(action.targetId)) throw invalidAction('Invalid vote target.');
      if (action.targetId === playerId) throw invalidAction('You cannot vote for yourself.');
      this.votes.set(playerId, action.targetId);
      if (this.activeOnline().every((id) => this.votes.has(id))) this.doReveal();
    }
  }

  onParticipantRemoved(playerId: string) {
    this.players = this.players.filter((id) => id !== playerId);
    this.clues.delete(playerId);
    this.votes.delete(playerId);
    for (const [voter, target] of [...this.votes]) if (target === playerId) this.votes.delete(voter);
    if (this.stage === 'reveal') return;
    if (playerId === this.impostorId) {
      this.doReveal();
      return;
    }
    this.onConnectionChange();
  }

  onConnectionChange() {
    const active = this.activeOnline();
    if (active.length === 0) return;
    if (this.stage === 'clues' && active.every((id) => this.clues.has(id))) this.toVoting();
    else if (this.stage === 'voting' && active.every((id) => this.votes.has(id))) this.doReveal();
  }

  getPublicState(): ImpostorPublic {
    return {
      stage: this.stage,
      round: this.round,
      totalRounds: this.ctx.settings.rounds,
      variant: this.ctx.settings.variant,
      category: this.pair.category,
      submittedIds: [...this.clues.keys()],
      // Clue texts become public only once the clue phase ends.
      clues: this.stage === 'clues' ? null : this.players.map((id) => ({ playerId: id, clue: this.clues.get(id) ?? null })),
      votedIds: [...this.votes.keys()],
      // Impostor identity, words and individual votes only after the reveal.
      reveal: this.stage === 'reveal' ? this.reveal : null,
    };
  }

  getPrivateStateForPlayer(playerId: string): ImpostorPrivate {
    const inRound = this.players.includes(playerId);
    return {
      word: inRound ? this.wordFor(playerId) : null,
      knownRole: inRound && playerId === this.impostorId && this.ctx.settings.variant === 'blank' ? 'impostor' : null,
      myClue: this.clues.get(playerId) ?? null,
      myVote: this.votes.get(playerId) ?? null,
    };
  }

  finishGame() {
    return {};
  }
  cleanupGame() {
    this.clues.clear();
    this.votes.clear();
  }
}

export const impostorGame: GameDefinition<'impostor'> = {
  id: 'impostor',
  initializeGame: (ctx) => new ImpostorGame(ctx as GameContext<ImpostorSettings>),
};
