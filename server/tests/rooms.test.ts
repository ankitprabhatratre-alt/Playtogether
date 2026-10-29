import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import type { ApiError, QuizPublic, SessionCredentials } from '@playtogether/shared';
import { api, setupRoom, startTestServer, TestPlayer, waitFor, type TestServer } from './helpers.js';

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer(0.02);
});
afterAll(async () => {
  await server.close();
});

const create = (extra: Record<string, unknown> = {}) =>
  api<SessionCredentials>(`${server.url}/api/rooms`, 'POST', { roomName: 'R', hostName: 'Host', passcode: 'secret1', gameId: 'quiz', maxPlayers: 3, ...extra });

describe('room creation & passcode authentication', () => {
  it('creates a room with a valid code and rejects invalid input', async () => {
    const r = await create();
    expect(r.status).toBe(201);
    expect(r.data.roomId).toMatch(/^[A-Z2-9]{8}$/);
    expect(r.data.token.length).toBeGreaterThan(40);
    expect((await create({ passcode: 'ab' })).status).toBe(400);
    expect((await create({ gameId: 'nope' })).status).toBe(400);
    expect((await create({ gameSettings: { questionCount: 1000 } })).status).toBe(400);
  });

  it('requires the correct passcode (validated on the server)', async () => {
    const { data } = await create();
    const preview = await api<{ name: string }>(`${server.url}/api/rooms/${data.roomId}`, 'GET');
    expect(preview.status).toBe(200);
    expect(JSON.stringify(preview.data)).not.toMatch(/passcode|scrypt/i);
    const bad = await api<ApiError>(`${server.url}/api/rooms/${data.roomId}/join`, 'POST', { name: 'Eve', passcode: 'wrong' });
    expect(bad.status).toBe(403);
    expect(bad.data.code).toBe('WRONG_PASSCODE');
    const good = await api<SessionCredentials>(`${server.url}/api/rooms/${data.roomId}/join`, 'POST', { name: 'Bob', passcode: 'secret1' });
    expect(good.status).toBe(201);
  });

  it('rejects duplicate names, full rooms and unknown rooms', async () => {
    const { data } = await create({ maxPlayers: 2 });
    const url = `${server.url}/api/rooms/${data.roomId}/join`;
    expect((await api<ApiError>(url, 'POST', { name: 'host', passcode: 'secret1' })).data.code).toBe('NAME_TAKEN');
    expect((await api(url, 'POST', { name: 'Bob', passcode: 'secret1' })).status).toBe(201);
    expect((await api<ApiError>(url, 'POST', { name: 'Cat', passcode: 'secret1' })).data.code).toBe('ROOM_FULL');
    expect((await api(`${server.url}/api/rooms/AAAAAAAA/join`, 'POST', { name: 'X', passcode: 'secret1' })).status).toBe(404);
  });

  it('locks out brute-force passcode guessing', async () => {
    const { data } = await create();
    const url = `${server.url}/api/rooms/${data.roomId}/join`;
    for (let i = 0; i < 8; i++) expect((await api(url, 'POST', { name: 'Eve', passcode: `guess${i}` })).status).toBe(403);
    const locked = await api<ApiError>(url, 'POST', { name: 'Eve', passcode: 'secret1' });
    expect(locked.status).toBe(429);
  });

  it('rejects socket connections without a valid token for that room', async () => {
    const a = (await create()).data;
    const b = (await create()).data;
    const tryConnect = (auth: Record<string, unknown>) =>
      new Promise<string>((resolve) => {
        const s = ioClient(server.url, { auth, transports: ['websocket'], reconnection: false, forceNew: true });
        s.on('connect', () => (s.disconnect(), resolve('connected')));
        s.on('connect_error', (e) => (s.disconnect(), resolve(e.message)));
      });
    expect(await tryConnect({})).toBe('UNAUTHORIZED');
    expect(await tryConnect({ roomId: a.roomId, token: 'x'.repeat(43) })).toBe('UNAUTHORIZED');
    expect(await tryConnect({ roomId: b.roomId, token: a.token })).toBe('UNAUTHORIZED'); // token from another room
    expect(await tryConnect({ roomId: a.roomId, token: a.token })).toBe('connected');
  });
});

describe('permissions & unauthorized actions', () => {
  it('rejects host-only operations from guests', async () => {
    const { host, players } = await setupRoom(server, 'quiz', {}, 2);
    const guest = players[1];
    for (const ev of ['room:start', 'room:close', 'room:endGame', 'room:returnToLobby', 'room:next'] as const) {
      const res = await guest.emit(ev);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('FORBIDDEN');
    }
    expect((await guest.emit('room:kick', { playerId: host.creds.playerId })).ok).toBe(false);
    expect((await guest.emit('room:transferHost', { playerId: guest.creds.playerId })).ok).toBe(false);
    expect((await guest.emit('room:updateSettings', { gameId: 'drawing' })).ok).toBe(false);
    expect((await host.emit('room:updateSettings', { gameId: 'drawing', bogus: 1 })).ok).toBe(false); // strict schema
    expect((await host.emit('room:updateSettings', { gameId: 'drawing' })).ok).toBe(true);
    await waitFor(() => guest.state?.selectedGame === 'drawing', 2000, 'settings sync');
  });

  it('rejects invalid transitions, malformed actions, spectator actions and client-supplied scores', async () => {
    const { host, players } = await setupRoom(server, 'quiz', { questionCount: 3 }, 2);
    expect((await host.action({ type: 'answer', choice: 0 })).ok).toBe(false); // no game yet
    expect((await host.emit('room:returnToLobby')).ok).toBe(false);
    expect((await host.emit('room:start')).ok).toBe(true);
    expect((await host.emit('room:start')).ok).toBe(false); // already running
    await waitFor(() => players.every((p) => p.state?.phase === 'PLAYING'), 3000, 'playing');
    expect((await host.emit('room:updateSettings', { gameId: 'drawing' })).ok).toBe(false);
    expect((await host.action({ type: 'setScore', score: 9999 })).ok).toBe(false);
    expect((await host.action({ type: 'answer', choice: 7 })).ok).toBe(false);
    // Extra fields (e.g. "points") are stripped; the server computes points.
    expect((await host.action({ type: 'answer', choice: 0, points: 9999 })).ok).toBe(true);
    const pub = host.state!.session!.state!.public as QuizPublic;
    expect(pub.reveal).toBeNull();
    expect(host.state!.session!.scores[host.creds.playerId]).toBe(0);
    // Late joiner is a spectator and cannot act.
    const late = await api<SessionCredentials>(`${server.url}/api/rooms/${host.creds.roomId}/join`, 'POST', { name: 'Late', passcode: 'secret1' });
    const lp = new TestPlayer(late.data);
    await lp.connect(server.url);
    await waitFor(() => !!lp.state, 2000, 'late state');
    expect(lp.state!.players.find((p) => p.id === lp.creds.playerId)?.spectator).toBe(true);
    const res = await lp.action({ type: 'answer', choice: 0 });
    expect(res.ok).toBe(false);
    expect(lp.priv).toBeNull(); // no private game data for spectators
  });

  it('handles duplicate actions idempotently', async () => {
    const { host, players } = await setupRoom(server, 'quiz', { questionCount: 3 }, 2);
    await host.emit('room:start');
    await waitFor(() => players.every((p) => p.state?.phase === 'PLAYING'), 3000, 'playing');
    const a = await players[1].action({ type: 'answer', choice: 1 }, 'same-action-id-123');
    const b = await players[1].action({ type: 'answer', choice: 1 }, 'same-action-id-123'); // retry
    expect(a).toEqual({ ok: true, data: null });
    expect(b).toEqual(a);
    const c = await players[1].action({ type: 'answer', choice: 2 }, 'another-action-1');
    expect(c.ok).toBe(false);
    await waitFor(() => (host.state?.session?.state?.public as QuizPublic).answeredIds.length === 1, 2000, 'answered');
  });

  it('kicked players lose access; closing the room removes everyone', async () => {
    const { host, players } = await setupRoom(server, 'quiz', {}, 2);
    const victim = players[2];
    expect((await host.emit('room:kick', { playerId: victim.creds.playerId })).ok).toBe(true);
    await waitFor(() => victim.removed?.reason === 'kicked', 2000, 'kicked');
    await waitFor(() => host.state?.players.length === 2, 2000, 'list updated');
    const again = new TestPlayer(victim.creds);
    await expect(again.connect(server.url)).rejects.toThrow('UNAUTHORIZED');
    expect((await host.emit('room:close')).ok).toBe(true);
    await waitFor(() => players[1].removed?.reason === 'closed', 2000, 'closed');
    expect((await api(`${server.url}/api/rooms/${host.creds.roomId}`, 'GET')).status).toBe(404);
  });
});

describe('reconnection & host handling', () => {
  it('reconnects to the same player with current game state and no duplicates', async () => {
    const { host, players } = await setupRoom(server, 'quiz', { questionCount: 3, timePerQuestion: 60 }, 2);
    await host.emit('room:start');
    await waitFor(() => players.every((p) => p.state?.phase === 'PLAYING'), 3000, 'playing');
    const guest = players[1];
    await guest.action({ type: 'answer', choice: 2 });
    guest.disconnect();
    await waitFor(() => host.state!.players.find((p) => p.id === guest.creds.playerId)?.online === false, 2000, 'offline shown');
    const back = new TestPlayer(guest.creds);
    await back.connect(server.url);
    await waitFor(() => back.state?.phase === 'PLAYING' && back.priv?.gameId === 'quiz', 2000, 'resync');
    expect(back.priv?.gameId === 'quiz' && back.priv.data.myChoice).toBe(2); // progress kept
    expect(back.state!.players).toHaveLength(3);
    await waitFor(() => host.state!.players.find((p) => p.id === guest.creds.playerId)?.online === true, 2000, 'online again');
  });

  it('a second tab with the same token replaces the first one', async () => {
    const { host, players } = await setupRoom(server, 'quiz', {}, 1);
    const tab2 = new TestPlayer(players[1].creds);
    await tab2.connect(server.url);
    await waitFor(() => players[1].removed?.reason === 'replaced', 2000, 'replaced');
    expect(host.state!.players).toHaveLength(2);
  });

  it('transfers host after the host disconnects (grace period)', async () => {
    const { host, players } = await setupRoom(server, 'quiz', {}, 2);
    host.disconnect();
    await waitFor(() => players[1].state?.room.hostId === players[1].creds.playerId, 3000, 'host transfer');
    expect((await players[1].emit('room:start')).ok).toBe(true);
  });

  it('host can transfer host manually and leaving host passes it on', async () => {
    const { host, players } = await setupRoom(server, 'quiz', {}, 2);
    expect((await host.emit('room:transferHost', { playerId: players[2].creds.playerId })).ok).toBe(true);
    await waitFor(() => host.state?.room.hostId === players[2].creds.playerId, 2000, 'manual transfer');
    expect((await players[2].emit('room:leave')).ok).toBe(true);
    await waitFor(() => host.state?.players.length === 2 && host.state.room.hostId !== players[2].creds.playerId, 2000, 'leave transfer');
  });
});

describe('HTTP rate limiting', () => {
  it('limits room creation per client', async () => {
    const strict = await startTestServer(0.02, { rateLimitMultiplier: 1 });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 17; i++) {
        statuses.push((await api(`${strict.url}/api/rooms`, 'POST', { roomName: 'R', hostName: 'H', passcode: 'secret1', gameId: 'quiz', maxPlayers: 4 })).status);
      }
      expect(statuses.slice(0, 15).every((s) => s === 201)).toBe(true);
      expect(statuses.at(-1)).toBe(429);
    } finally {
      await strict.close();
    }
  });
});
