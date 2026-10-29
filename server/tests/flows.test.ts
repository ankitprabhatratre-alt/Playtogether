import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GAME_IDS, type QuizPublic } from '@playtogether/shared';
import { setupRoom, startTestServer, waitFor, type TestServer } from './helpers.js';

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer(0.02);
});
afterAll(async () => {
  await server.close();
});

describe('end-to-end flows over Socket.IO', () => {
  it('plays a full Quiz Battle with 3 players and consistent results for everyone', async () => {
    const { host, players } = await setupRoom(server, 'quiz', { questionCount: 3, timePerQuestion: 10 }, 2);
    await host.emit('room:start');
    await waitFor(() => players.every((p) => p.state?.phase === 'GAME_STARTING' || p.state?.phase === 'PLAYING'), 2000, 'starting');
    for (let q = 0; q < 3; q++) {
      await waitFor(() => players.every((p) => p.state?.phase === 'PLAYING' && (p.state.session?.state?.public as QuizPublic)?.questionIndex === q), 3000, `q${q}`);
      // Everyone sees the same question and the same deadline.
      const deadlines = new Set(players.map((p) => p.state!.session!.deadline));
      expect(deadlines.size).toBe(1);
      for (const [i, p] of players.entries()) expect((await p.action({ type: 'answer', choice: i % 4 })).ok).toBe(true);
      await waitFor(() => players.every((p) => p.state?.phase === 'ROUND_RESULTS'), 2000, 'results');
    }
    await waitFor(() => players.every((p) => p.state?.phase === 'FINAL_RESULTS'), 3000, 'final');
    const finals = players.map((p) => JSON.stringify(p.state!.session!.final));
    expect(new Set(finals).size).toBe(1);
    const scores = host.state!.session!.scores;
    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    // Back to lobby and switch game.
    expect((await host.emit('room:returnToLobby')).ok).toBe(true);
    await waitFor(() => players.every((p) => p.state?.phase === 'WAITING_ROOM'), 2000, 'lobby');
    expect((await host.emit('room:updateSettings', { gameId: 'wouldyourather' })).ok).toBe(true);
    await waitFor(() => players.every((p) => p.state?.selectedGame === 'wouldyourather'), 2000, 'game switch');
  });

  it.each(GAME_IDS)('starts %s, delivers state to all players, ends early and returns to the lobby', async (gameId) => {
    const { host, players } = await setupRoom(server, gameId, {}, 2);
    expect((await host.emit('room:start')).ok).toBe(true);
    await waitFor(() => players.every((p) => p.state?.phase === 'PLAYING' && p.state.session?.state?.gameId === gameId), 3000, `${gameId} playing`);
    // Every participant receives (possibly null) private state for this session, never someone else's.
    for (const p of players) {
      expect(p.state!.session!.participants).toContain(p.creds.playerId);
    }
    expect((await host.emit('room:endGame')).ok).toBe(true);
    await waitFor(() => players.every((p) => p.state?.phase === 'FINAL_RESULTS' && p.state.session?.final?.endedEarly), 2000, 'ended');
    expect((await host.emit('room:returnToLobby')).ok).toBe(true);
    await waitFor(() => players.every((p) => p.state?.phase === 'WAITING_ROOM' && p.state.session === null), 2000, 'lobby');
  });
});
