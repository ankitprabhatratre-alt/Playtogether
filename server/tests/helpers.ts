import { io as ioClient, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import type { ClientToServerEvents, GamePrivateUnion, RoomSnapshot, ServerToClientEvents, SessionCredentials, AckResponse } from '@playtogether/shared';
import { loadConfig, type AppConfig } from '../src/config.js';
import { createApp, type AppHandle } from '../src/app.js';
import { MemoryStore, type PersistenceStore } from '../src/persistence/store.js';

export type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface TestServer {
  handle: AppHandle;
  url: string;
  close(): Promise<void>;
}

export async function startTestServer(timingScale = 0.02, overrides: Partial<AppConfig> = {}, store: PersistenceStore = new MemoryStore()): Promise<TestServer> {
  const config = loadConfig({ port: 0, host: '127.0.0.1', timingScale, serveClient: false, databaseUrl: null, hostTransferGraceMs: 200, clientOrigins: [], rateLimitMultiplier: 20, ...overrides });
  const handle = createApp(config, store);
  await new Promise<void>((r) => handle.httpServer.listen(0, '127.0.0.1', () => r()));
  const { port } = handle.httpServer.address() as AddressInfo;
  return {
    handle,
    url: `http://127.0.0.1:${port}`,
    async close() {
      await handle.close();
      await new Promise<void>((r) => handle.httpServer.close(() => r()));
    },
  };
}

export async function api<T>(url: string, method: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: (await res.json()) as T };
}

export class TestPlayer {
  socket!: TestSocket;
  state: RoomSnapshot | null = null;
  priv: GamePrivateUnion | null = null;
  removed: { reason: string } | null = null;
  constructor(public creds: SessionCredentials) {}

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = ioClient(url, { auth: { roomId: this.creds.roomId, token: this.creds.token }, transports: ['websocket'], reconnection: false, forceNew: true });
      this.socket.on('room:state', (s) => {
        if (!this.state || s.version >= this.state.version || s.serverNow >= this.state.serverNow) this.state = s;
      });
      this.socket.on('game:private', (p) => (this.priv = p));
      this.socket.on('room:removed', (r) => (this.removed = r));
      this.socket.once('connect', () => resolve());
      this.socket.once('connect_error', (e) => reject(e));
    });
  }

  emit<T = null>(event: keyof ClientToServerEvents, ...args: unknown[]): Promise<AckResponse<T>> {
    return new Promise((resolve) => {
      (this.socket.emit as (...a: unknown[]) => void)(event, ...args, (res: AckResponse<T>) => resolve(res));
    });
  }

  action<T = null>(action: Record<string, unknown>, actionId = Math.random().toString(36).slice(2, 12)): Promise<AckResponse<T>> {
    return this.emit<T>('game:action', { actionId, action });
  }

  disconnect() {
    this.socket.disconnect();
  }
}

export async function waitFor(pred: () => boolean, timeoutMs = 4000, label = 'condition'): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

export async function setupRoom(server: TestServer, gameId: string, gameSettings: Record<string, unknown> = {}, guests = 2) {
  const created = await api<SessionCredentials>(`${server.url}/api/rooms`, 'POST', {
    roomName: 'Test Room',
    hostName: 'Host',
    passcode: 'secret1',
    gameId,
    gameSettings,
    maxPlayers: 8,
  });
  if (created.status !== 201) throw new Error('create failed ' + JSON.stringify(created.data));
  const host = new TestPlayer(created.data);
  await host.connect(server.url);
  const players = [host];
  for (let i = 0; i < guests; i++) {
    const j = await api<SessionCredentials>(`${server.url}/api/rooms/${created.data.roomId}/join`, 'POST', { name: `Guest${i + 1}`, passcode: 'secret1' });
    if (j.status !== 201) throw new Error('join failed ' + JSON.stringify(j.data));
    const p = new TestPlayer(j.data);
    await p.connect(server.url);
    players.push(p);
  }
  await waitFor(() => players.every((p) => p.state?.players.length === guests + 1 && p.state.players.every((x) => x.online)), 4000, 'lobby sync');
  return { roomId: created.data.roomId, host, players };
}
