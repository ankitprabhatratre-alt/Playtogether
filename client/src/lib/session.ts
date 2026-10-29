import type { SessionCredentials } from '@playtogether/shared';

/**
 * Credentials are kept per tab in sessionStorage (so several tabs in one browser can be
 * different players while testing) and remembered in localStorage so a player who closes
 * the tab can explicitly "Rejoin" later. Tokens are opaque; the server only stores hashes.
 */
const sessKey = (roomId: string) => `pt:session:${roomId}`;
const memKey = (roomId: string) => `pt:remember:${roomId}`;
const passKey = (roomId: string) => `pt:passcode:${roomId}`;

function read(storage: Storage, key: string): SessionCredentials | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as SessionCredentials;
    return v && typeof v.token === 'string' && typeof v.roomId === 'string' ? v : null;
  } catch {
    return null;
  }
}

export const sessionStore = {
  get(roomId: string): SessionCredentials | null {
    return read(sessionStorage, sessKey(roomId));
  },
  remembered(roomId: string): SessionCredentials | null {
    return read(localStorage, memKey(roomId));
  },
  save(creds: SessionCredentials) {
    try {
      sessionStorage.setItem(sessKey(creds.roomId), JSON.stringify(creds));
      localStorage.setItem(memKey(creds.roomId), JSON.stringify(creds));
    } catch {
      /* storage may be unavailable (private mode) */
    }
  },
  /** Adopt remembered credentials into this tab. */
  adopt(roomId: string): SessionCredentials | null {
    const c = read(localStorage, memKey(roomId));
    if (c) sessionStorage.setItem(sessKey(roomId), JSON.stringify(c));
    return c;
  },
  clear(roomId: string) {
    try {
      sessionStorage.removeItem(sessKey(roomId));
      localStorage.removeItem(memKey(roomId));
      sessionStorage.removeItem(passKey(roomId));
    } catch {
      /* ignore */
    }
  },
  savePasscode(roomId: string, passcode: string) {
    try {
      sessionStorage.setItem(passKey(roomId), passcode);
    } catch {
      /* ignore */
    }
  },
  passcode(roomId: string): string | null {
    try {
      return sessionStorage.getItem(passKey(roomId));
    } catch {
      return null;
    }
  },
};
