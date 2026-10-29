import { randomBytes, randomInt, createHash } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@playtogether/shared';

/** Cryptographically random room code, e.g. "K7MQ9XTZ" (31^8 ≈ 8.5e11 combinations). */
export function generateRoomCode(): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) out += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return out;
}

export function generateId(bytes = 9): string {
  return randomBytes(bytes).toString('base64url');
}

/** 256-bit bearer token used to re-authenticate a player (stored only as a SHA-256 hash). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const COLORS = ['#7c5cff', '#ff5c8a', '#00c2a8', '#ffb547', '#3fa7ff', '#a855f7', '#ff7a45', '#22c55e', '#f43f5e', '#14b8a6', '#eab308', '#6366f1', '#ec4899', '#0ea5e9', '#84cc16', '#f97316'];
export function pickColor(used: Set<string>): string {
  const free = COLORS.filter((c) => !used.has(c));
  const pool = free.length ? free : COLORS;
  return pool[randomInt(pool.length)];
}
