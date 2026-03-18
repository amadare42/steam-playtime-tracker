import { Database } from 'better-sqlite3';

interface User {
    id: number;
    steam_id: string;
    steam_name: string;
    created_at: string;
}

interface GameTimeframe {
    id: number;
    player_id: number;
    app_id: number;
    app_name: string;
    playtime_total_minutes: number;
    playtime_delta_minutes: number;
    playtime_deck_total_minutes: number;
    playtime_deck_delta_minutes: number;
    playtime_win_total_minutes: number;
    playtime_win_delta_minutes: number;
    created_at: string;
    updated_at: string;
}

export type BreakdownBucket = 'hour' | 'day' | 'week';
export type BreakdownGroup = 'total' | 'game';

export interface PlaytimeBreakdownRow {
    bucket_start: string;
    total_minutes: number;
    deck_minutes: number;
    windows_minutes: number;
}

export interface PlaytimeBreakdownByGameRow extends PlaytimeBreakdownRow {
    app_name: string;
    app_id: number;
}

export interface PlaytimeGameFrameRow {
    app_id: number;
    app_name: string;
    frame_from: string;
    frame_to: string;
    minutes: number;
}

export interface SyncRunInput {
    playerId: number;
    status: string;
}

type CreateGameTimeframeInput = {
    player_id: number;
    app_id: number;
    app_name: string;
    playtime_total_minutes?: number;
    playtime_delta_minutes?: number;
    playtime_deck_total_minutes?: number;
    playtime_deck_delta_minutes?: number;
    playtime_win_total_minutes?: number;
    playtime_win_delta_minutes?: number;
};

export class Repository {
    constructor(private db: Database) {
    }

    public getAllUsers(): User[] {
        const users = this.db.prepare('SELECT * FROM players').all();
        return users as User[];
    }
    public addSyncRun(input: SyncRunInput): number {
        const result = this.db.prepare('INSERT INTO sync_runs (player_id, status) VALUES (?, ?)')
            .run(input.playerId, input.status);

        return Number(result.lastInsertRowid);
    }

    public setSyncRunStatus(id: number, status: string, message: string | null = null) {
        this.db.prepare('UPDATE sync_runs SET status = ?, message = ? WHERE id = ?')
            .run(status, message, id);
    }

    public getSingleUser(username: string): User | null {
        const user = this.db.prepare('SELECT * FROM players WHERE steam_name = ?').get(username);
        return (user as User | undefined) ?? null;
    }

    public createUser(user: Omit<User, 'id' | 'created_at'>): User {
        const { steam_id, steam_name } = user;
        const insertQuery = this.db.prepare('INSERT INTO players (steam_id, steam_name) VALUES (?, ?)');
        insertQuery.run(steam_id, steam_name);
        return this.getSingleUser(steam_name)!;
    }

    public getLatestGameTimeframe(player_id: number, app_id: number): GameTimeframe | null {
        const latest = this.db
            .prepare('SELECT * FROM game_playtime_frame WHERE player_id = ? AND app_id = ? ORDER BY id DESC LIMIT 1')
            .get(player_id, app_id);
        return latest as GameTimeframe | null;
    }

    public addGameTimeframe(frame: CreateGameTimeframeInput): GameTimeframe {
        const {
            player_id,
            app_id,
            app_name,
            playtime_total_minutes = 0,
            playtime_delta_minutes = 0,
            playtime_deck_total_minutes = 0,
            playtime_deck_delta_minutes = 0,
            playtime_win_total_minutes = 0,
            playtime_win_delta_minutes = 0,
        } = frame;

        const insertQuery = this.db.prepare(`
            INSERT INTO game_playtime_frame (
                player_id,
                app_id,
                app_name,
                playtime_total_minutes,
                playtime_delta_minutes,
                playtime_deck_total_minutes,
                playtime_deck_delta_minutes,
                playtime_win_total_minutes,
                playtime_win_delta_minutes,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `);

        const result = insertQuery.run(
            player_id,
            app_id,
            app_name,
            playtime_total_minutes,
            playtime_delta_minutes,
            playtime_deck_total_minutes,
            playtime_deck_delta_minutes,
            playtime_win_total_minutes,
            playtime_win_delta_minutes,
        );

        const inserted = this.db
            .prepare('SELECT * FROM game_playtime_frame WHERE id = ?')
            .get(Number(result.lastInsertRowid));

        return inserted as GameTimeframe;
    }

    public touchGameTimeframe(id: number): void {
        this.db.prepare("UPDATE game_playtime_frame SET updated_at = datetime('now') WHERE id = ?")
            .run(id);
    }

    public getPlaytimeBreakdown(player_id: number, bucket: BreakdownBucket): PlaytimeBreakdownRow[] {
        const bucketExpressionByType: Record<BreakdownBucket, string> = {
            hour: "strftime('%Y-%m-%d %H:00:00', created_at)",
            day: "date(created_at)",
            week: "date(created_at, '-' || ((CAST(strftime('%w', created_at) AS integer) + 6) % 7) || ' days')",
        };

        const bucketExpression = bucketExpressionByType[bucket];
        const query = `
            SELECT
                ${bucketExpression} AS bucket_start,
                SUM(playtime_delta_minutes) AS total_minutes,
                SUM(playtime_deck_delta_minutes) AS deck_minutes,
                SUM(playtime_win_delta_minutes) AS windows_minutes
            FROM game_playtime_frame
            WHERE player_id = ?
            GROUP BY bucket_start
            ORDER BY bucket_start DESC
        `;

        const rows = this.db.prepare(query).all(player_id);
        return rows as PlaytimeBreakdownRow[];
    }

    public getPlaytimeBreakdownByGame(player_id: number, bucket: BreakdownBucket): PlaytimeBreakdownByGameRow[] {
        const bucketExpressionByType: Record<BreakdownBucket, string> = {
            hour: "strftime('%Y-%m-%d %H:00:00', created_at)",
            day: "date(created_at)",
            week: "date(created_at, '-' || ((CAST(strftime('%w', created_at) AS integer) + 6) % 7) || ' days')",
        };

        const bucketExpression = bucketExpressionByType[bucket];
        const query = `
            SELECT
                app_id,
                app_name,
                ${bucketExpression} AS bucket_start,
                SUM(playtime_delta_minutes) AS total_minutes,
                SUM(playtime_deck_delta_minutes) AS deck_minutes,
                SUM(playtime_win_delta_minutes) AS windows_minutes
            FROM game_playtime_frame
            WHERE player_id = ?
            GROUP BY app_id, app_name, bucket_start
            ORDER BY app_name ASC, bucket_start DESC
        `;

        const rows = this.db.prepare(query).all(player_id);
        return rows as PlaytimeBreakdownByGameRow[];
    }

    public getPlaytimeFramesByGame(player_id: number, bucket: BreakdownBucket): PlaytimeGameFrameRow[] {
        const bucketStartByType: Record<BreakdownBucket, string> = {
            hour: "strftime('%Y-%m-%d %H:00:00', created_at)",
            day: "datetime(date(created_at))",
            week: "datetime(date(created_at, '-' || ((CAST(strftime('%w', created_at) AS integer) + 6) % 7) || ' days'))",
        };

        const bucketEndByType: Record<BreakdownBucket, string> = {
            hour: "datetime(strftime('%Y-%m-%d %H:00:00', created_at), '+1 hour')",
            day: "datetime(date(created_at), '+1 day')",
            week: "datetime(date(created_at, '-' || ((CAST(strftime('%w', created_at) AS integer) + 6) % 7) || ' days'), '+7 days')",
        };

        const query = `
            SELECT
                app_id,
                app_name,
                ${bucketStartByType[bucket]} AS frame_from,
                ${bucketEndByType[bucket]} AS frame_to,
                SUM(playtime_delta_minutes) AS minutes
            FROM game_playtime_frame
            WHERE player_id = ?
            GROUP BY app_id, app_name, frame_from, frame_to
            ORDER BY app_name ASC, frame_from DESC
        `;

        const rows = this.db.prepare(query).all(player_id);
        return rows as PlaytimeGameFrameRow[];
    }
}