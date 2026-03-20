# Steam Playtime Tracker

Monorepo with a React client (`client`) and Node/Express server (`server`).

## One-command serve

From repository root:

```bash
npm install
npm run serve
```

What `npm run serve` does:

1. Builds the client with Vite into `server/public`
2. Starts the server, which serves both API endpoints and static client files

## Docker Compose

From repository root:

```bash
docker compose up --build
```

This builds an image that includes the compiled client app in `server/public` and runs one server container for both API and UI.

The server container also applies the `SYNC_ALL_*` environment values from `docker-compose.yml` to run `/sync/all` on a cron schedule.

Stop:

```bash
docker compose down
```

## Notes

- `server/public` is generated output and is ignored by git.
- For local UI development, run `npm run dev:client` in one terminal and `npm run dev:server` in another.


