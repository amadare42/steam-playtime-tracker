import 'dotenv/config';
import { closeDb, getDb, getResolvedDbPath } from '../db/db';

async function runMigrations(): Promise<void> {
  await getDb();

  console.log(`Migrations applied successfully. Database path: ${getResolvedDbPath()}`);
  await closeDb();
}

void runMigrations().catch(async (error) => {
  console.error('Migration failed:', error);
  await closeDb();
  process.exit(1);
});


