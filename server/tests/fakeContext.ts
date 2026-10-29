import type { StrokeSegment } from '@playtogether/shared';
import type { GameContext } from '../src/games/types.js';

export function seeded(seed = 42): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** In-memory GameContext with manually-fired timers, for deterministic game-rule tests. */
export function fakeContext<S>(settings: S, ids: string[] = ['p1', 'p2', 'p3']) {
  let now = 1_000_000;
  const participants = [...ids];
  const online = new Set(ids);
  const scores = new Map<string, number>(ids.map((id) => [id, 0]));
  let timer: { cb: () => void; deadline: number } | null = null;
  const aux: { cb: () => void; cancelled: boolean }[] = [];
  const strokes: StrokeSegment[] = [];
  let rounds = 0;
  let skipped = 0;
  const ctx: GameContext<S> = {
    sessionId: 'test',
    settings,
    random: seeded(),
    now: () => now,
    participants: () => participants.map((id) => ({ id, name: id.toUpperCase(), online: online.has(id) })),
    isParticipant: (id) => participants.includes(id),
    isOnline: (id) => online.has(id),
    name: (id) => id.toUpperCase(),
    isHost: (id) => id === ids[0],
    award(id, points) {
      if (!Number.isInteger(points)) throw new Error('non-integer award');
      if (!participants.includes(id)) return;
      scores.set(id, (scores.get(id) ?? 0) + points);
    },
    setTimer(ms, cb) {
      timer = { cb, deadline: now + ms };
      return timer.deadline;
    },
    clearTimer() {
      timer = null;
    },
    setAuxTimer(_ms, cb) {
      const entry = { cb, cancelled: false };
      aux.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
    endRound() {
      timer = null;
      rounds++;
    },
    skipRoundResults() {
      skipped++;
    },
    changed() {},
    emitStroke(seg) {
      strokes.push(seg);
    },
    emitCanvas() {},
  };
  return {
    ctx,
    scores,
    strokes,
    get rounds() {
      return rounds;
    },
    get skipped() {
      return skipped;
    },
    get hasTimer() {
      return timer !== null;
    },
    advance(ms: number) {
      now += ms;
    },
    fireTimer() {
      const t = timer;
      timer = null;
      t?.cb();
    },
    fireAux() {
      for (const a of aux.splice(0)) if (!a.cancelled) a.cb();
    },
    setOnline(id: string, value: boolean) {
      if (value) online.add(id);
      else online.delete(id);
    },
    remove(id: string) {
      participants.splice(participants.indexOf(id), 1);
    },
  };
}
