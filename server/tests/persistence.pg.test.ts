/**
 * PostgreSQL persistence integration test (runs only when TEST_DATABASE_URL is set, against a migrated DB):
 *   TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/playtogether_test npm test -w server
 * Verifies that rooms, players, hashed credentials and finished sessions are written, and that a room
 * survives a full server restart (lazy rehydration) with the same player tokens and no duplicates.
 */
import { describe, expect, it } from 'vitest';
import type { ApiError, SessionCredentials } from '@playtogether/shared';
import { PrismaStore } from '../src/persistence/prismaStore.js';
import { api, startTestServer, TestPlayer, waitFor } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PostgreSQL persistence', () => {
  it('persists rooms and sessions and restores a room after a server restart', async () => {
    const store1 = new PrismaStore(url!);
    await store1.init();
    const s1 = await startTestServer(0.02, {}, store1);
    const created = await api<SessionCredentials>(`${s1.url}/api/rooms`, 'POST', { roomName: 'Persist', hostName: 'Host', passcode: 'secret1', gameId: 'wouldyourather', maxPlayers: 4, gameSettings: { questionCount: 3 } });
    expect(created.status).toBe(201);
    const roomId = created.data.roomId;
    const joined = await api<SessionCredentials>(`${s1.url}/api/rooms/${roomId}/join`, 'POST', { name: 'Guest', passcode: 'secret1' });
    const host = new TestPlayer(created.data);
    const guest = new TestPlayer(joined.data);
    await host.connect(s1.url);
    await guest.connect(s1.url);
    await host.emit('room:start');
    await waitFor(() => host.state?.phase === 'PLAYING', 3000, 'playing');
    await host.emit('room:endGame');
    await waitFor(() => host.state?.phase === 'FINAL_RESULTS', 3000, 'final');
    host.disconnect();
    guest.disconnect();
    await s1.close();
    await store1.close();

    // Inspect the database directly.
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    const room = await prisma.room.findUnique({ where: { id: roomId }, include: { players: true, sessions: true } });
    expect(room).not.toBeNull();
    expect(room!.passcodeHash).not.toContain('secret1');
    expect(room!.players).toHaveLength(2);
    for (const p of room!.players) expect(p.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(room!.sessions).toHaveLength(1);
    expect(room!.sessions[0].endedAt).not.toBeNull();
    await prisma.$disconnect();

    // "Restart": a brand-new server process state with an empty in-memory room table.
    const store2 = new PrismaStore(url!);
    await store2.init();
    const s2 = await startTestServer(0.02, {}, store2);
    try {
      const preview = await api<{ name: string; playerCount: number }>(`${s2.url}/api/rooms/${roomId}`, 'GET');
      expect(preview.status).toBe(200);
      expect(preview.data.name).toBe('Persist');
      const wrong = await api<ApiError>(`${s2.url}/api/rooms/${roomId}/join`, 'POST', { name: 'Eve', passcode: 'nope' });
      expect(wrong.data.code).toBe('WRONG_PASSCODE');
      const back = new TestPlayer(joined.data); // reconnect with the token issued before the restart
      await back.connect(s2.url);
      await waitFor(() => back.state?.phase === 'WAITING_ROOM', 3000, 'rehydrated lobby');
      expect(back.state!.players.map((p) => p.name).sort()).toEqual(['Guest', 'Host']);
      expect(back.state!.history[0]?.gameId).toBe('wouldyourather');
      back.disconnect();
    } finally {
      await s2.close();
      await store2.close();
    }
  });
});
