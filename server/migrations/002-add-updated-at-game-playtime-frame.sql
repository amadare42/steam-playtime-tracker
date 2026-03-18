-- Up
ALTER TABLE game_playtime_frame ADD COLUMN updated_at TEXT;

UPDATE game_playtime_frame
SET updated_at = created_at
WHERE updated_at IS NULL;

-- Down
ALTER TABLE game_playtime_frame DROP COLUMN updated_at;
