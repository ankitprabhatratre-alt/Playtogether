import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  AckResponse,
  ClientToServerEvents,
  GamePrivateUnion,
  PlayerPublic,
  RemovalReason,
  RoomSnapshot,
  ServerToClientEvents,
  SessionCredentials,
  StrokeSegment,
} from '@playtogether/shared';
import { sessionStore } from '../lib/session';
import { newActionId } from '../lib/util';
import { useToasts } from '../components/Toasts';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'unauthorized' | 'removed' | 'offline';

/** Holds drawing strokes outside React state so high-frequency updates don't re-render the tree. */
export class CanvasStore {
  segments: StrokeSegment[] = [];
  private listeners = new Set<(e: { type: 'segment'; segment: StrokeSegment } | { type: 'replace' }) => void>();
  push(seg: StrokeSegment) {
    this.segments.push(seg);
    this.listeners.forEach((l) => l({ type: 'segment', segment: seg }));
  }
  replace(segs: StrokeSegment[]) {
    this.segments = [...segs];
    this.listeners.forEach((l) => l({ type: 'replace' }));
  }
  subscribe(l: (e: { type: 'segment'; segment: StrokeSegment } | { type: 'replace' }) => void) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
}

type EmitArgs<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]> extends [...infer A, infer _Ack] ? A : never;

export interface RoomContextValue {
  creds: SessionCredentials;
  status: ConnectionStatus;
  removal: { reason: RemovalReason; message: string } | null;
  snapshot: RoomSnapshot | null;
  priv: GamePrivateUnion | null;
  me: PlayerPublic | null;
  isHost: boolean;
  playersById: Map<string, PlayerPublic>;
  /** serverTime ≈ Date.now() + clockOffset */
  clockOffset: number;
  canvas: CanvasStore;
  emit<E extends Exclude<keyof ClientToServerEvents, 'game:action' | 'game:stroke' | 'time:sync'>>(event: E, ...args: EmitArgs<E>): Promise<AckResponse>;
  sendAction(action: { type: string } & Record<string, unknown>): Promise<AckResponse>;
  sendStroke(seg: StrokeSegment): void;
  retry(): void;
}

const RoomContext = createContext<RoomContextValue | null>(null);

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used inside <RoomProvider>');
  return ctx;
}

const ACK_TIMEOUT = 8000;

export function RoomProvider({ creds, children }: { creds: SessionCredentials; children: ReactNode }) {
  const toasts = useToasts();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [removal, setRemoval] = useState<RoomContextValue['removal']>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [priv, setPriv] = useState<GamePrivateUnion | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const socketRef = useRef<AppSocket | null>(null);
  const canvas = useMemo(() => new CanvasStore(), []);
  const toastRef = useRef(toasts);
  toastRef.current = toasts;

  useEffect(() => {
    const socket: AppSocket = io({
      path: '/socket.io',
      auth: { roomId: creds.roomId, token: creds.token },
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
      timeout: 10000,
    });
    socketRef.current = socket;
    setStatus('connecting');

    const syncClock = async () => {
      const samples: { offset: number; rtt: number }[] = [];
      for (let i = 0; i < 4; i++) {
        const t0 = Date.now();
        const serverNow = await new Promise<number | null>((resolve) => {
          socket.timeout(3000).emit('time:sync', t0, (err: Error | null, now: number) => resolve(err ? null : now));
        });
        if (serverNow === null) continue;
        const t1 = Date.now();
        samples.push({ rtt: t1 - t0, offset: serverNow - (t0 + (t1 - t0) / 2) });
      }
      if (samples.length) {
        samples.sort((a, b) => a.rtt - b.rtt);
        setClockOffset(samples[0].offset);
      }
    };

    socket.on('connect', () => {
      setStatus('connected');
      void syncClock();
    });
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect' || reason === 'io client disconnect') return;
      setStatus('reconnecting');
    });
    socket.io.on('reconnect_attempt', () => setStatus((s) => (s === 'removed' || s === 'unauthorized' ? s : 'reconnecting')));
    socket.on('connect_error', (err: Error & { data?: { code?: string; message?: string } }) => {
      const code = err.data?.code ?? err.message;
      if (code === 'UNAUTHORIZED') {
        socket.disconnect();
        sessionStore.clear(creds.roomId);
        setStatus('unauthorized');
      } else if (code === 'RATE_LIMITED') {
        setStatus('offline');
      } else {
        setStatus((s) => (s === 'connecting' ? 'connecting' : 'reconnecting'));
      }
    });
    socket.on('room:state', (snap) => {
      setSnapshot(snap);
    });
    socket.on('game:private', (p) => setPriv(p));
    socket.on('game:stroke', (seg) => canvas.push(seg));
    socket.on('game:canvas', ({ segments }) => canvas.replace(segments));
    socket.on('room:removed', (r) => {
      setRemoval(r);
      setStatus('removed');
      if (r.reason !== 'replaced') sessionStore.clear(creds.roomId);
      socket.disconnect();
    });
    socket.on('notice', (n) => toastRef.current.push(n.message, n.level));

    const onOnline = () => {
      if (!socket.connected && socket.active === false) socket.connect();
    };
    window.addEventListener('online', onOnline);

    return () => {
      window.removeEventListener('online', onOnline);
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [creds.roomId, creds.token, attempt, canvas]);

  const emitRaw = useCallback((event: string, args: unknown[]): Promise<AckResponse> => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      return Promise.resolve({ ok: false, error: 'Not connected. Reconnecting…', code: 'INTERNAL' });
    }
    return new Promise((resolve) => {
      (socket.timeout(ACK_TIMEOUT).emit as (...a: unknown[]) => void)(event, ...args, (err: Error | null, res: AckResponse) => {
        if (err) resolve({ ok: false, error: 'The server did not respond in time.', code: 'INTERNAL' });
        else resolve(res);
      });
    });
  }, []);

  const emit = useCallback<RoomContextValue['emit']>(
    async (event, ...args) => {
      const res = await emitRaw(event, args);
      if (!res.ok) toastRef.current.push(res.error, 'error');
      return res;
    },
    [emitRaw],
  );

  const sendAction = useCallback<RoomContextValue['sendAction']>(
    async (action) => {
      const actionId = newActionId();
      let res = await emitRaw('game:action', [{ actionId, action }]);
      // Retry once with the SAME actionId: the server de-duplicates, so this is safe.
      if (!res.ok && res.error.startsWith('The server did not respond')) res = await emitRaw('game:action', [{ actionId, action }]);
      return res;
    },
    [emitRaw],
  );

  const sendStroke = useCallback((seg: StrokeSegment) => {
    const s = socketRef.current;
    if (s?.connected) s.emit('game:stroke', seg);
  }, []);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const playersById = useMemo(() => new Map((snapshot?.players ?? []).map((p) => [p.id, p])), [snapshot?.players]);
  const me = playersById.get(creds.playerId) ?? null;
  const isHost = !!snapshot && snapshot.room.hostId === creds.playerId;

  const value: RoomContextValue = {
    creds,
    status,
    removal,
    snapshot,
    priv: priv && snapshot?.session && priv.sessionId === snapshot.session.sessionId ? priv : null,
    me,
    isHost,
    playersById,
    clockOffset,
    canvas,
    emit,
    sendAction,
    sendStroke,
    retry,
  };
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}
