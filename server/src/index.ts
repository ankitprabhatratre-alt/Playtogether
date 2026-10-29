import { loadConfig } from './config.js';
import { createStore } from './persistence/index.js';
import { createApp } from './app.js';
import { logger } from './util/logger.js';

async function main() {
  const config = loadConfig();
  const store = await createStore(config.databaseUrl);
  const handle = createApp(config, store);

  handle.httpServer.listen(config.port, config.host, () => {
    logger.info(`PlayTogether server listening on http://${config.host}:${config.port}`, {
      env: config.isProduction ? 'production' : 'development',
      persistence: store.kind,
    });
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down…`);
    const force = setTimeout(() => process.exit(1), 8000);
    force.unref();
    await handle.close();
    await store.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => logger.error('Unhandled rejection', { error: String(err) }));
}

main().catch((err) => {
  logger.error('Fatal startup error', { error: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
});
