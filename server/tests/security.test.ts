import { describe, expect, it } from 'vitest';
import { parseGameSettings, isValidRoomCode } from '@playtogether/shared';
import { hashPasscode, verifyPasscode } from '../src/security/passcode.js';
import { generateRoomCode, generateToken, hashToken } from '../src/util/ids.js';
import { isOriginAllowed } from '../src/app.js';

describe('passcode hashing', () => {
  it('hashes with a random salt and verifies', async () => {
    const a = await hashPasscode('mango123');
    const b = await hashPasscode('mango123');
    expect(a).not.toBe(b);
    expect(a).not.toContain('mango123');
    expect(await verifyPasscode('mango123', a)).toBe(true);
    expect(await verifyPasscode('mango124', a)).toBe(false);
    expect(await verifyPasscode('mango123', 'garbage')).toBe(false);
  });
});

describe('identifiers', () => {
  it('generates valid, unique room codes and high-entropy tokens', () => {
    const codes = new Set(Array.from({ length: 2000 }, generateRoomCode));
    expect(codes.size).toBe(2000);
    for (const c of codes) expect(isValidRoomCode(c)).toBe(true);
    const t = generateToken();
    expect(t.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(t)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('settings validation', () => {
  it('fills defaults and rejects out-of-range / unknown settings', () => {
    const ok = parseGameSettings('quiz', {});
    expect(ok.ok && ok.value.questionCount).toBe(10);
    expect(parseGameSettings('quiz', { questionCount: 999 }).ok).toBe(false);
    expect(parseGameSettings('quiz', { hacked: true }).ok).toBe(false);
    expect(parseGameSettings('quiz', { categories: [] }).ok).toBe(false);
    expect(parseGameSettings('quiz', { difficulty: 'impossible' }).ok).toBe(false);
    const tod = parseGameSettings('truthordare', { customTruths: ['  hello\u0000 world  ', ''] });
    expect(tod.ok && tod.value.customTruths).toEqual(['hello world']);
  });
});

describe('CORS origin policy', () => {
  it('allows same-origin and listed origins only', () => {
    expect(isOriginAllowed(undefined, 'a.com', [])).toBe(true);
    expect(isOriginAllowed('https://a.com', 'a.com', [])).toBe(true);
    expect(isOriginAllowed('https://evil.com', 'a.com', [])).toBe(false);
    expect(isOriginAllowed('https://friend.com', 'a.com', ['https://friend.com'])).toBe(true);
  });
});

describe('winner labels', () => {
  it('handles single winners, ties and zero scores', async () => {
    const { winnerNames } = await import('@playtogether/shared');
    expect(winnerNames([{ rank: 1, score: 5, name: 'A' }, { rank: 2, score: 1, name: 'B' }])).toBe('A');
    expect(winnerNames([{ rank: 1, score: 5, name: 'A' }, { rank: 1, score: 5, name: 'B' }])).toBe('A & B');
    expect(winnerNames([1, 2, 3].map((i) => ({ rank: 1, score: 2, name: `P${i}` })))).toBe('P1, P2 & P3');
    expect(winnerNames([{ rank: 1, score: 0, name: 'A' }])).toBeNull();
  });
});
