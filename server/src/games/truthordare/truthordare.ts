import type { RoomPhase, TruthOrDareAction, TruthOrDarePublic } from '@playtogether/shared';
import { TOD_CATEGORIES } from '@playtogether/shared';
import { forbidden, invalidState } from '../../util/errors.js';
import { TRUTH_OR_DARE } from '../../content/partyContent.js';
import type { GameContext, GameDefinition, GameInstance } from '../types.js';

export interface TruthOrDareSettings {
  cycles: number;
  categories: ('family' | 'friends' | 'classroom')[];
  customTruths: string[];
  customDares: string[];
}

const OFFLINE_SKIP_MS = 15_000;
export const TRUTH_POINTS = 1;
export const DARE_POINTS = 2;

interface Prompt {
  text: string;
  category: string;
}

class TruthOrDareGame implements GameInstance<'truthordare'> {
  readonly gameId = 'truthordare' as const;
  private cycle = 0;
  private turnInCycle = -1;
  private turnCount = 0;
  private cycleOrder: string[] = [];
  private stage: TruthOrDarePublic['stage'] = 'choosing';
  private current = '';
  private choice: 'truth' | 'dare' | null = null;
  private prompt: Prompt | null = null;
  private history: TruthOrDarePublic['history'] = [];
  private pools: Record<'truth' | 'dare', Prompt[]>;
  private used = new Set<string>();
  private cancelOffline: (() => void) | null = null;

  constructor(private readonly ctx: GameContext<TruthOrDareSettings>) {
    const s = ctx.settings;
    const label = (c: string) => TOD_CATEGORIES.find((x) => x.value === c)?.label ?? c;
    this.pools = { truth: [], dare: [] };
    for (const c of s.categories) {
      this.pools.truth.push(...TRUTH_OR_DARE[c].truths.map((text) => ({ text, category: label(c) })));
      this.pools.dare.push(...TRUTH_OR_DARE[c].dares.map((text) => ({ text, category: label(c) })));
    }
    this.pools.truth.push(...s.customTruths.map((text) => ({ text, category: 'Custom' })));
    this.pools.dare.push(...s.customDares.map((text) => ({ text, category: 'Custom' })));
  }

  totalRounds() {
    return this.ctx.settings.cycles;
  }
  currentRound() {
    return Math.max(1, this.cycle);
  }
  hasNextRound() {
    return this.cycle < this.ctx.settings.cycles;
  }
  startGame() {
    this.beginCycle();
  }
  advanceGame() {
    this.beginCycle();
  }

  private beginCycle() {
    this.cycle++;
    this.cycleOrder = this.ctx.participants().map((p) => p.id);
    this.turnInCycle = -1;
    this.nextTurn();
  }

  private nextTurn() {
    this.clearOffline();
    this.turnInCycle++;
    while (this.turnInCycle < this.cycleOrder.length && !this.ctx.isParticipant(this.cycleOrder[this.turnInCycle])) this.turnInCycle++;
    if (this.turnInCycle >= this.cycleOrder.length) {
      this.stage = 'reveal';
      this.ctx.endRound(5000);
      return;
    }
    this.turnCount++;
    this.current = this.cycleOrder[this.turnInCycle];
    this.stage = 'choosing';
    this.choice = null;
    this.prompt = null;
    if (!this.ctx.isOnline(this.current)) this.scheduleOfflineSkip();
    this.ctx.changed();
  }

  private scheduleOfflineSkip() {
    this.clearOffline();
    const who = this.current;
    this.cancelOffline = this.ctx.setAuxTimer(OFFLINE_SKIP_MS, () => {
      if (this.current === who && !this.ctx.isOnline(who) && this.stage !== 'reveal') this.finishTurn('skipped');
    });
  }

  private clearOffline() {
    this.cancelOffline?.();
    this.cancelOffline = null;
  }

  private drawPrompt(kind: 'truth' | 'dare'): Prompt {
    const pool = this.pools[kind];
    let fresh = pool.filter((p) => !this.used.has(p.text));
    if (fresh.length === 0) {
      for (const p of pool) this.used.delete(p.text);
      fresh = pool;
    }
    const p = fresh[Math.floor(this.ctx.random() * fresh.length)];
    this.used.add(p.text);
    return p;
  }

  private finishTurn(outcome: 'done' | 'skipped') {
    if (this.choice && this.prompt) {
      this.history.unshift({ playerId: this.current, choice: this.choice, prompt: this.prompt.text, outcome });
      this.history = this.history.slice(0, 12);
      if (outcome === 'done') this.ctx.award(this.current, this.choice === 'dare' ? DARE_POINTS : TRUTH_POINTS);
    }
    this.nextTurn();
  }

  handlePlayerAction(playerId: string, action: TruthOrDareAction, phase: RoomPhase) {
    if (phase !== 'PLAYING' || this.stage === 'reveal') throw invalidState('Wait for the next turn.');
    const isHost = this.ctx.isHost(playerId);
    if (playerId !== this.current && !isHost) throw forbidden('It is not your turn.');
    switch (action.type) {
      case 'choose':
        if (this.stage !== 'choosing') throw invalidState('A prompt has already been chosen.');
        this.choice = action.choice;
        this.prompt = this.drawPrompt(action.choice);
        this.stage = 'prompt';
        return;
      case 'complete':
        if (this.stage !== 'prompt') throw invalidState('Choose truth or dare first.');
        this.finishTurn('done');
        return;
      case 'skip':
        this.finishTurn('skipped');
        return;
    }
  }

  onConnectionChange(playerId: string, online: boolean) {
    if (playerId !== this.current || this.stage === 'reveal') return;
    if (online) this.clearOffline();
    else this.scheduleOfflineSkip();
  }

  onParticipantRemoved(playerId: string) {
    if (playerId === this.current && this.stage !== 'reveal') this.nextTurn();
  }

  getPublicState(): TruthOrDarePublic {
    return {
      stage: this.stage,
      turn: this.turnCount,
      totalTurns: this.cycleOrder.length * this.ctx.settings.cycles,
      cycle: this.cycle,
      currentPlayerId: this.current,
      choice: this.choice,
      prompt: this.prompt?.text ?? null,
      promptCategory: this.prompt?.category ?? null,
      history: this.history,
    };
  }
  getPrivateStateForPlayer(): null {
    return null;
  }
  finishGame() {
    this.clearOffline();
    return {};
  }
  cleanupGame() {
    this.clearOffline();
  }
}

export const truthOrDareGame: GameDefinition<'truthordare'> = {
  id: 'truthordare',
  initializeGame: (ctx) => new TruthOrDareGame(ctx as GameContext<TruthOrDareSettings>),
};
