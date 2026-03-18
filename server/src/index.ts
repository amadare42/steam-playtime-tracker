import { configDotenv } from 'dotenv';
configDotenv();

import 'dotenv/config';
import { closeDb, getDb, getResolvedDbPath } from './db/db';
import { run } from './api';

async function bootstrap(): Promise<void> {
  await getDb();
  await run();
}

void bootstrap().catch((error) => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, closing database connection...`);
  await closeDb();
  process.exit(0);
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
