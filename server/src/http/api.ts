import express, { type NextFunction, type Request, type Response, Router } from 'express';
import { GAME_LIST, type ApiError } from '@playtogether/shared';
import { AppError } from '../util/errors.js';
import { logger } from '../util/logger.js';
import { WindowCounter } from '../util/rateLimit.js';
import type { RoomManager } from '../rooms/RoomManager.js';
import type { PersistenceStore } from '../persistence/store.js';

function limit(counter: WindowCounter, name: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = `${name}|${req.ip}`;
    if (counter.isBlocked(key)) return next(new AppError('RATE_LIMITED', 'Too many requests. Please slow down and try again shortly.', 429));
    counter.hit(key);
    next();
  };
}

export function createApiRouter(manager: RoomManager, store: PersistenceStore, rateLimitMultiplier = 1): Router {
  const router = Router();
  const createLimiter = new WindowCounter(15 * rateLimitMultiplier, 60_000);
  const joinLimiter = new WindowCounter(40 * rateLimitMultiplier, 60_000);
  const readLimiter = new WindowCounter(240 * rateLimitMultiplier, 60_000);
  setInterval(() => {
    createLimiter.prune();
    joinLimiter.prune();
    readLimiter.prune();
  }, 60_000).unref();

  router.use(express.json({ limit: '32kb' }));

  router.get('/health', (_req, res) => {
    res.json({ ok: true, persistence: store.kind, rooms: manager.rooms.size, uptimeSec: Math.round(process.uptime()) });
  });

  router.get('/games', (_req, res) => {
    res.json(GAME_LIST);
  });

  router.post('/rooms', limit(createLimiter, 'create'), async (req, res, next) => {
    try {
      res.status(201).json(await manager.createRoom(req.body));
    } catch (e) {
      next(e);
    }
  });

  router.get('/rooms/:id', limit(readLimiter, 'read'), async (req, res, next) => {
    try {
      res.json(await manager.preview(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  router.post('/rooms/:id/join', limit(joinLimiter, 'join'), async (req, res, next) => {
    try {
      res.status(201).json(await manager.joinRoom(req.params.id, req.body, req.ip ?? 'unknown'));
    } catch (e) {
      next(e);
    }
  });

  router.use((_req, _res, next) => next(new AppError('NOT_FOUND', 'Not found', 404)));

  // Consistent JSON error responses.
  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let body: ApiError;
    let status = 500;
    if (err instanceof AppError) {
      status = err.httpStatus;
      body = { error: err.message, code: err.code };
    } else if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
      status = 400;
      body = { error: 'Malformed JSON body.', code: 'BAD_REQUEST' };
    } else if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
      status = 413;
      body = { error: 'Request body too large.', code: 'BAD_REQUEST' };
    } else {
      logger.error('Unhandled API error', { error: err instanceof Error ? err.stack : String(err) });
      body = { error: 'Something went wrong on the server.', code: 'INTERNAL' };
    }
    res.status(status).json(body);
  });

  return router;
}
