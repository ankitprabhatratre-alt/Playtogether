import type { Server, Socket } from 'socket.io';
import {
  gameActionEnvelopeSchema,
  targetPlayerSchema,
  updateSettingsSchema,
  type Ack,
  type AckResponse,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketAuth,
} from '@playtogether/shared';
import { AppError } from '../util/errors.js';
import { logger } from '../util/logger.js';
import { TokenBucket, WindowCounter } from '../util/rateLimit.js';
import type { RoomManager } from '../rooms/RoomManager.js';
import type { Room, RoomIO } from '../rooms/Room.js';

export interface SocketData {
  roomId: string;
  playerId: string;
}

export type IOServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export const roomChannel = (roomId: string) => `room:${roomId}`;

export function createRoomIO(getIo: () => IOServer): RoomIO {
  return {
    toRoom(roomId, event, ...args) {
      (getIo().to(roomChannel(roomId)).emit as (e: string, ...a: unknown[]) => void)(event, ...args);
    },
    toSocket(socketId, event, ...args) {
      (getIo().to(socketId).emit as (e: string, ...a: unknown[]) => void)(event, ...args);
    },
    disconnect(socketId) {
      const s = getIo().sockets.sockets.get(socketId);
      if (!s) return;
      s.leave(roomChannel(s.data.roomId));
      // Give the final "room:removed" packet time to flush before closing.
      setTimeout(() => s.disconnect(true), 250);
    },
  };
}

const noopAck = () => {};
function safeAck<T>(ack: unknown): Ack<T> {
  return typeof ack === 'function' ? (ack as Ack<T>) : noopAck;
}

export function registerSocketHandlers(io: IOServer, manager: RoomManager): void {
  const failedAuth = new WindowCounter(40, 5 * 60_000);
  setInterval(() => failedAuth.prune(), 60_000).unref();

  // Every connection must present a valid room id + reconnect token.
  io.use(async (socket, next) => {
    const ip = socket.handshake.address;
    if (failedAuth.isBlocked(ip)) {
      return next(Object.assign(new Error('RATE_LIMITED'), { data: { code: 'RATE_LIMITED', message: 'Too many failed attempts. Try again later.' } }));
    }
    try {
      const auth = (socket.handshake.auth ?? {}) as Partial<SocketAuth>;
      const res = await manager.authenticate(auth.roomId, auth.token);
      if (!res) {
        failedAuth.hit(ip);
        return next(Object.assign(new Error('UNAUTHORIZED'), { data: { code: 'UNAUTHORIZED', message: 'Your session for this room is not valid. Please join again.' } }));
      }
      socket.data.roomId = res.room.id;
      socket.data.playerId = res.player.id;
      next();
    } catch (err) {
      logger.error('Socket auth error', { error: String(err) });
      next(Object.assign(new Error('INTERNAL'), { data: { code: 'INTERNAL', message: 'Server error' } }));
    }
  });

  io.on('connection', (socket: IOSocket) => {
    const { roomId, playerId } = socket.data;
    const room = manager.rooms.get(roomId);
    if (!room || !room.players.has(playerId)) {
      socket.disconnect(true);
      return;
    }
    socket.join(roomChannel(roomId));
    const previous = room.attachSocket(playerId, socket.id);
    if (previous) {
      io.to(previous).emit('room:removed', { reason: 'replaced', message: 'You opened this room in another tab or device.' });
      const old = io.sockets.sockets.get(previous);
      if (old) {
        old.leave(roomChannel(roomId));
        setTimeout(() => old.disconnect(true), 250);
      }
    }
    room.sendFullStateTo(playerId);

    // Per-socket rate limits.
    const actions = new TokenBucket(15, 8); // burst 15, 8/s sustained
    const strokes = new TokenBucket(120, 60);

    /** Resolve the room/player for every event and convert errors to acks. */
    const run = (ackRaw: unknown, fn: (room: Room) => AckResponse | void, rateLimited = true) => {
      const ack = safeAck(ackRaw);
      if (rateLimited && !actions.take()) return ack({ ok: false, error: 'You are doing that too fast.', code: 'RATE_LIMITED' });
      const r = manager.rooms.get(roomId);
      if (!r || r.closed) return ack({ ok: false, error: 'This room no longer exists.', code: 'NOT_FOUND' });
      if (!r.players.has(playerId)) {
        ack({ ok: false, error: 'You are no longer in this room.', code: 'UNAUTHORIZED' });
        socket.disconnect(true);
        return;
      }
      try {
        const res = fn(r);
        ack(res ?? { ok: true, data: null });
      } catch (err) {
        ack(r.toAckError(err));
      }
    };
    const bad = (msg = 'Malformed request.') => new AppError('BAD_REQUEST', msg);

    socket.on('time:sync', (_clientSentAt, ack) => {
      if (typeof ack === 'function') ack(Date.now());
    });

    socket.on('room:sync', (ack) =>
      run(ack, (r) => {
        r.sendFullStateTo(playerId);
      }),
    );

    socket.on('room:updateSettings', (payload, ack) =>
      run(ack, (r) => {
        const p = updateSettingsSchema.safeParse(payload);
        if (!p.success) throw bad('Invalid settings.');
        r.updateSettings(playerId, p.data);
      }),
    );

    socket.on('room:start', (ack) => run(ack, (r) => r.start(playerId)));
    socket.on('room:next', (ack) => run(ack, (r) => r.next(playerId)));
    socket.on('room:endGame', (ack) => run(ack, (r) => r.endGame(playerId)));
    socket.on('room:returnToLobby', (ack) => run(ack, (r) => r.returnToLobby(playerId)));
    socket.on('room:close', (ack) => run(ack, (r) => r.close(playerId)));
    socket.on('room:leave', (ack) => run(ack, (r) => r.leave(playerId)));

    socket.on('room:kick', (payload, ack) =>
      run(ack, (r) => {
        const p = targetPlayerSchema.safeParse(payload);
        if (!p.success) throw bad();
        r.kick(playerId, p.data.playerId);
      }),
    );

    socket.on('room:transferHost', (payload, ack) =>
      run(ack, (r) => {
        const p = targetPlayerSchema.safeParse(payload);
        if (!p.success) throw bad();
        r.transferHost(playerId, p.data.playerId);
      }),
    );

    socket.on('game:action', (payload, ack) =>
      run(ack, (r) => {
        const p = gameActionEnvelopeSchema.safeParse(payload);
        if (!p.success) throw bad('Malformed game action.');
        return r.handleGameAction(playerId, p.data);
      }),
    );

    socket.on('game:stroke', (segment) => {
      if (!strokes.take()) return;
      manager.rooms.get(roomId)?.handleStroke(playerId, segment);
    });

    socket.on('disconnect', () => {
      manager.rooms.get(roomId)?.detachSocket(playerId, socket.id);
    });
  });
}
