import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { Database } from 'better-sqlite3';
import lite from 'better-sqlite3';
import { Umzug, type UmzugStorage } from 'umzug';

let dbInstance: Database | null = null;
let initializingDb: Promise<Database> | null = null;

function getDbPathFromEnv(): string {
  const configuredPath = process.env.DB_PATH;

  if (!configuredPath || configuredPath.trim() === '') {
	throw new Error('Missing DB_PATH environment variable. Example: DB_PATH=./data/steam-playtime.sqlite');
  }

  return path.isAbsolute(configuredPath)
	? configuredPath
	: path.resolve(process.cwd(), configuredPath);
}

export function getResolvedDbPath(): string {
  return getDbPathFromEnv();
}

function getMigrationsPath(): string {
  return path.resolve(__dirname, '..', '..', 'migrations');
}

type ParsedSqlMigration = {
  upSql: string;
  downSql: string;
};

type SqlMigration = {
  name: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
};

class SqliteUmzugStorage implements UmzugStorage {
  constructor(private readonly db: Database) {}

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS umzug_migrations (
        name TEXT PRIMARY KEY,
        run_on TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  async executed(): Promise<string[]> {
    this.ensureTable();
    return this.db
      .prepare('SELECT name FROM umzug_migrations ORDER BY name;')
      .all()
      .map((row) => (row as { name: string }).name);
  }

  async logMigration(params: { name: string }): Promise<void> {
    this.ensureTable();
    this.db
      .prepare('INSERT INTO umzug_migrations (name) VALUES (?);')
      .run(params.name);
  }

  async unlogMigration(params: { name: string }): Promise<void> {
    this.ensureTable();
    this.db
      .prepare('DELETE FROM umzug_migrations WHERE name = ?;')
      .run(params.name);
  }
}

function parseSqlMigration(content: string, fileName: string): ParsedSqlMigration {
  const upMarker = /^--\s*up\s*$/im;
  const downMarker = /^--\s*down\s*$/im;
  const upMatch = upMarker.exec(content);
  const downMatch = downMarker.exec(content);

  if (!upMatch || !downMatch || upMatch.index >= downMatch.index) {
    throw new Error(
      `Migration "${fileName}" must contain '-- Up' and '-- Down' sections in order.`,
    );
  }

  const upSql = content
    .slice(upMatch.index + upMatch[0].length, downMatch.index)
    .trim();
  const downSql = content.slice(downMatch.index + downMatch[0].length).trim();

  if (!upSql) {
    throw new Error(`Migration "${fileName}" has an empty '-- Up' section.`);
  }

  return { upSql, downSql };
}

async function loadSqlMigrations(db: Database): Promise<SqlMigration[]> {
  const migrationsPath = getMigrationsPath();
  const migrationFiles = readdirSync(migrationsPath)
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const migrations: SqlMigration[] = [];

  for (const fileName of migrationFiles) {
    const filePath = path.join(migrationsPath, fileName);
    const content = await readFile(filePath, 'utf8');
    const { upSql, downSql } = parseSqlMigration(content, fileName);

    migrations.push({
      name: fileName,
      up: async () => {
        const run = db.transaction(() => {
          db.exec(upSql);
        });
        run();
      },
      down: async () => {
        if (!downSql) {
          return;
        }

        const run = db.transaction(() => {
          db.exec(downSql);
        });
        run();
      },
    });
  }

  return migrations;
}

async function runMigrations(db: Database): Promise<void> {
  const migrations = await loadSqlMigrations(db);
  const umzug = new Umzug({
    migrations,
    context: db,
    storage: new SqliteUmzugStorage(db),
    logger: undefined,
  });

  await umzug.up();
}

async function initializeDb(): Promise<Database> {
  const dbPath = getDbPathFromEnv();
  await mkdir(path.dirname(dbPath), { recursive: true });

  const db = new lite(dbPath);

  db.exec('PRAGMA foreign_keys = ON;');
  await runMigrations(db);

  dbInstance = db;
  return db;
}

export async function getDb(): Promise<Database> {
  if (dbInstance) {
	return dbInstance;
  }

  if (!initializingDb) {
	initializingDb = initializeDb();
  }

  try {
	return await initializingDb;
  } finally {
	initializingDb = null;
  }
}

export async function closeDb(): Promise<void> {
  if (!dbInstance) {
    return;
  }

  dbInstance.close();
  dbInstance = null;
}


