import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../util/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let words: Set<string> | null = null;
let attempted = false;

function candidates(): string[] {
  return [
    process.env.WORDLIST_PATH,
    path.resolve(__dirname, '../../../data/words-enable.txt'), // src/games/wordchain → server/data
    path.resolve(__dirname, '../data/words-enable.txt'), // dist → server/data
    path.resolve(process.cwd(), 'data/words-enable.txt'),
    path.resolve(process.cwd(), 'server/data/words-enable.txt'),
  ].filter((p): p is string => !!p);
}

/** Lazily loads the ENABLE word list (public domain, ~172k lower-case English words). */
export function getDictionary(): Set<string> | null {
  if (words || attempted) return words;
  attempted = true;
  for (const file of candidates()) {
    try {
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      words = new Set(text.split(/\r?\n/).map((w) => w.trim().toLowerCase()).filter(Boolean));
      logger.info('Loaded word list', { file, words: words.size });
      return words;
    } catch (err) {
      logger.warn('Failed to read word list', { file, error: String(err) });
    }
  }
  logger.warn('Word list not found: Word Chain dictionary mode is unavailable.');
  return null;
}
