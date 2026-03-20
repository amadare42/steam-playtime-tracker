# Server

The server initializes SQLite using `DB_PATH`, runs pending SQL migrations, and exposes API endpoints.

## Environment

Copy `server/.env.example` to `server/.env` and fill values:

```env
STEAM_API_KEY=your_key
DB_PATH=./data/steam-playtime.sqlite
PORT=3000
SYNC_ALL_ENABLED=true
SYNC_ALL_CRON=0 * * * *
SYNC_ALL_TIMEZONE=UTC
SYNC_ALL_TIMEOUT_SECONDS=120
```

- `SYNC_ALL_ENABLED`: enables periodic calls to `/sync/all` when running in Docker.
- `SYNC_ALL_CRON`: cron expression used by the container scheduler.
- `SYNC_ALL_TIMEZONE`: IANA timezone used by cron (for example `UTC`, `Europe/London`).
- `SYNC_ALL_TIMEOUT_SECONDS`: max request time for each `/sync/all` trigger.

## Scripts

```bash
npm install
npm run db:migrate
npm run start
npm run start:prod
```

- `db:migrate`: runs migrations once and exits.
- `start`: starts in watch mode (development).
- `start:prod`: starts once (production/container mode).

## Docker Compose

From repository root:

```bash
docker compose up --build
```

This builds the client into `server/public`, starts the server, and mounts `./server/data` to persist SQLite data.

When `SYNC_ALL_ENABLED=true`, the container entrypoint also starts `crond` and schedules `/app/docker/sync-all.sh` using `SYNC_ALL_CRON`.

Stop:

```bash
docker compose down
```

## Migrations

Place SQL migration files in `server/migrations` with `-- Up` and `-- Down` sections.

