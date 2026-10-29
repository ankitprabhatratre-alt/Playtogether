import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${name} must be a number`);
  return n;
}

export interface AppConfig {
  port: number;
  host: string;
  isProduction: boolean;
  /** Extra allowed origins for CORS (comma separated). Same-origin is always allowed. */
  clientOrigins: string[];
  databaseUrl: string | null;
  roomIdleTtlMs: number;
  roomMaxAgeMs: number;
  hostTransferGraceMs: number;
  cleanupIntervalMs: number;
  trustProxy: boolean;
  /** CSP frame-ancestors values; empty = deny framing. */
  frameAncestors: string[];
  serveClient: boolean;
  clientDist: string;
  /** Multiplies every server timer. 1 in production; tests use a small value. */
  timingScale: number;
  /** Multiplies the generic HTTP rate limits (room creation / join / reads). Passcode lockout is unaffected. */
  rateLimitMultiplier: number;
  /** Set HTTPS_ONLY=true when served over TLS: enables HSTS and upgrade-insecure-requests. */
  httpsOnly: boolean;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const base: AppConfig = {
    port: num('PORT', 3001),
    host: process.env.HOST || '0.0.0.0',
    isProduction,
    clientOrigins: (process.env.CLIENT_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    databaseUrl: process.env.DATABASE_URL?.trim() || null,
    roomIdleTtlMs: num('ROOM_IDLE_TTL_MINUTES', 30) * 60_000,
    roomMaxAgeMs: num('ROOM_MAX_AGE_HOURS', 12) * 3_600_000,
    hostTransferGraceMs: num('HOST_TRANSFER_GRACE_SECONDS', 30) * 1000,
    cleanupIntervalMs: num('CLEANUP_INTERVAL_SECONDS', 60) * 1000,
    trustProxy: process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1',
    frameAncestors: (process.env.FRAME_ANCESTORS || '')
      .split(/[ ,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    serveClient: process.env.SERVE_CLIENT ? process.env.SERVE_CLIENT === 'true' : isProduction,
    clientDist: process.env.CLIENT_DIST || path.resolve(__dirname, '../../client/dist'),
    timingScale: num('TIMING_SCALE', 1),
    rateLimitMultiplier: Math.max(1, num('RATE_LIMIT_MULTIPLIER', 1)),
    httpsOnly: process.env.HTTPS_ONLY === 'true' || process.env.HTTPS_ONLY === '1',
  };
  return { ...base, ...overrides };
}
