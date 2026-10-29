import { logger } from '../util/logger.js';
import { MemoryStore, type PersistenceStore } from './store.js';

export async function createStore(databaseUrl: string | null): Promise<PersistenceStore> {
  if (!databaseUrl) {
    logger.warn('DATABASE_URL not set: running with in-memory storage only (rooms are lost on restart).');
    return new MemoryStore();
  }
  const { PrismaStore } = await import('./prismaStore.js');
  const store = new PrismaStore(databaseUrl);
  try {
    await store.init();
    logger.info('Connected to PostgreSQL: rooms and sessions will be persisted.');
    return store;
  } catch (err) {
    logger.error('Could not connect to the database. Falling back to in-memory storage.', { error: String(err) });
    return new MemoryStore();
  }
}
