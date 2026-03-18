# Server

The server initializes SQLite using `DB_PATH`, runs pending SQL migrations, and exposes API endpoints.

## Environment

Copy `server/.env.example` to `server/.env` and fill values:

```env
STEAM_API_KEY=your_key
DB_PATH=./data/steam-playtime.sqlite
PORT=3000
```

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

Stop:

```bash
docker compose down
```

## Migrations

Place SQL migration files in `server/migrations` with `-- Up` and `-- Down` sections.

