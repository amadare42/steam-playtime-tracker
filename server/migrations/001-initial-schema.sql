-- Up
CREATE TABLE IF NOT EXISTS players
(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    steam_id   TEXT NOT NULL UNIQUE,
    steam_name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_playtime_frame
(
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id              INTEGER NOT NULL,
    app_id                 INTEGER NOT NULL,
    app_name               TEXT NOT NULL,
    playtime_total_minutes INTEGER NOT NULL DEFAULT 0,
    playtime_delta_minutes INTEGER NOT NULL DEFAULT 0,
    playtime_deck_total_minutes INTEGER NOT NULL DEFAULT 0,
    playtime_deck_delta_minutes INTEGER NOT NULL DEFAULT 0,
    playtime_win_total_minutes INTEGER NOT NULL DEFAULT 0,
    playtime_win_delta_minutes INTEGER NOT NULL DEFAULT 0,
    initial BOOLEAN NOT NULL DEFAULT 0,
    created_at             TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_runs
(
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id   INTEGER,
    status      TEXT NOT NULL,
    message     TEXT,
    started_at  TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE SET NULL
);

-- Down
DROP TABLE IF EXISTS sync_runs;
DROP TABLE IF EXISTS game_playtime_frame;
DROP TABLE IF EXISTS players;

