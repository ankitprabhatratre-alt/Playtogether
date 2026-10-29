import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors, { type CorsOptions } from 'cors';
import { Server } from 'socket.io';
import type { AppConfig } from './config.js';
import { createApiRouter } from './http/api.js';
import { RoomManager } from './rooms/RoomManager.js';
import { DEFAULT_TIMING } from './rooms/Room.js';
import type { PersistenceStore } from './persistence/store.js';
import { createRoomIO, registerSocketHandlers, type IOServer } from './socket/handlers.js';
import { logger } from './util/logger.js';

/** Origin check: same-origin always allowed, plus explicit CLIENT_ORIGINS. */
export function isOriginAllowed(origin: string | undefined, host: string | undefined, allowList: string[]): boolean {
  if (!origin) return true; // same-origin navigation / non-browser clients
  try {
    if (host && new URL(origin).host === host) return true;
  } catch {
    return false;
  }
  return allowList.includes(origin);
}

export interface AppHandle {
  app: express.Express;
  httpServer: http.Server;
  io: IOServer;
  manager: RoomManager;
  close(): Promise<void>;
}

export function createApp(config: AppConfig, store: PersistenceStore): AppHandle {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: config.frameAncestors.length ? config.frameAncestors : ["'none'"],
          // Only when served over HTTPS; on plain-HTTP LAN testing it would break asset loading.
          upgradeInsecureRequests: config.httpsOnly ? [] : null,
        },
      },
      frameguard: config.frameAncestors.length ? false : { action: 'deny' },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: config.httpsOnly ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  const corsDelegate = (req: cors.CorsRequest, cb: (err: Error | null, opts?: CorsOptions) => void) => {
    const origin = req.headers.origin;
    cb(null, { origin: isOriginAllowed(origin, req.headers.host, config.clientOrigins) ? (origin ?? false) : false });
  };
  app.use('/api', cors(corsDelegate));

  const httpServer = http.createServer(app);
  let ioRef: IOServer | null = null;
  const manager = new RoomManager({
    io: createRoomIO(() => ioRef!),
    store,
    timing: { ...DEFAULT_TIMING, scale: config.timingScale, hostGraceMs: config.hostTransferGraceMs },
    roomIdleTtlMs: config.roomIdleTtlMs,
    roomMaxAgeMs: config.roomMaxAgeMs,
  });

  app.use('/api', createApiRouter(manager, store, config.rateLimitMultiplier));

  const io: IOServer = new Server(httpServer, {
    path: '/socket.io',
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    // Same-origin requests need no CORS headers; extra origins must be listed explicitly.
    cors: { origin: config.clientOrigins.length ? config.clientOrigins : false },
    allowRequest: (req, cb) => {
      cb(null, isOriginAllowed(req.headers.origin, req.headers.host, config.clientOrigins));
    },
  });
  ioRef = io;
  registerSocketHandlers(io, manager);

  if (config.serveClient) {
    const index = path.join(config.clientDist, 'index.html');
    if (fs.existsSync(index)) {
      app.use(
        express.static(config.clientDist, {
          index: false,
          setHeaders(res, file) {
            if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          },
        }),
      );
      app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(index);
      });
      logger.info('Serving client build', { dir: config.clientDist });
    } else {
      logger.warn('SERVE_CLIENT is enabled but the client build was not found. Run "npm run build" first.', { dir: config.clientDist });
    }
  }

  const cleanupTimer = setInterval(() => manager.cleanup(), config.cleanupIntervalMs);
  cleanupTimer.unref();

  return {
    app,
    httpServer,
    io,
    manager,
    async close() {
      clearInterval(cleanupTimer);
      manager.shutdown();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await store.flush();
    },
  };
}
