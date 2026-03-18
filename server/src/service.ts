import { Repository } from './repository';
import { SteamApiClient } from './steamApiClient';
import type {
    BreakdownBucket,
    BreakdownGroup,
    PlaytimeGameFrameRow,
    PlaytimeBreakdownRow,
} from './repository';

type PlaytimeBreakdownTotalResult = {
    username: string;
    bucket: BreakdownBucket;
    group: 'total';
    series: PlaytimeBreakdownRow[];
};

type PlaytimeBreakdownByGameResult = {
    username: string;
    bucket: BreakdownBucket;
    group: 'game';
    series: Array<{
        app_id: number;
        name: string;
        frames: Array<{
            from: string;
            to: string;
            minutes: number;
            day_total_minutes?: number;
            week_total_minutes?: number;
            platform_percentages: {
                deck: number;
                windows: number;
                other: number;
            };
        }>;
    }>;
};

type PlaytimeBreakdownResult = PlaytimeBreakdownTotalResult | PlaytimeBreakdownByGameResult;

export class Service {
    constructor(private repository: Repository, private api: SteamApiClient) {
    }

    public async syncAll(): Promise<{ syncedUsers: number; syncedGames: number }> {
        const users = await this.repository.getAllUsers();
        let syncedGames = 0;

        for (const user of users) {
            const syncId = this.repository.addSyncRun({ playerId: user.id, status: 'started' });
            try {
                syncedGames += await this.syncUser(user.steam_name);
                this.repository.setSyncRunStatus(syncId, 'completed');
            }
            catch (err) {
                this.repository.setSyncRunStatus(syncId, 'failed', '' + err);
            }
        }

        return {
            syncedUsers: users.length,
            syncedGames,
        };
    }

    public async syncUser(username: string): Promise<number> {
        let user = this.repository.getSingleUser(username);
        if (!user) {
            user = await this.addUser(username);
        }

        const rsp = await this.api.getRecentlyPlayedGames(user.steam_id);
        const games = rsp.response.games ?? [];

        for (const game of games) {
            const latest = this.repository.getLatestGameTimeframe(user.id, game.appid);

            const playtimeTotalMinutes = game.playtime_forever ?? 0;
            const playtimeDeckTotalMinutes = game.playtime_deck_forever ?? 0;
            const playtimeWinTotalMinutes = game.playtime_windows_forever ?? 0;

            if (
                latest
                && latest.playtime_total_minutes === playtimeTotalMinutes
                && latest.playtime_deck_total_minutes === playtimeDeckTotalMinutes
                && latest.playtime_win_total_minutes === playtimeWinTotalMinutes
            ) {
                this.repository.touchGameTimeframe(latest.id);
                continue;
            }

            // If this is the first snapshot for the game, deltas equal totals from a zero baseline.
            this.repository.addGameTimeframe({
                player_id: user.id,
                app_id: game.appid,
                app_name: game.name,
                playtime_total_minutes: playtimeTotalMinutes,
                playtime_delta_minutes: latest
                    ? Math.max(0, playtimeTotalMinutes - latest.playtime_total_minutes)
                    : playtimeTotalMinutes,
                playtime_deck_total_minutes: playtimeDeckTotalMinutes,
                playtime_deck_delta_minutes: latest
                    ? Math.max(0, playtimeDeckTotalMinutes - latest.playtime_deck_total_minutes)
                    : playtimeDeckTotalMinutes,
                playtime_win_total_minutes: playtimeWinTotalMinutes,
                playtime_win_delta_minutes: latest
                    ? Math.max(0, playtimeWinTotalMinutes - latest.playtime_win_total_minutes)
                    : playtimeWinTotalMinutes,
            });
        }

        return games.length;
    }

    public async addUser(username: string) {
        const steamUser = await this.api.getUserInfo(username);
        return this.repository.createUser({
            steam_id: steamUser.response.steamid,
            steam_name: username
        });
    }

    public getPlaytimeBreakdown(
        username: string,
        bucket: BreakdownBucket,
        group: BreakdownGroup = 'total',
    ): PlaytimeBreakdownResult | null {
        const user = this.repository.getSingleUser(username);
        if (!user) {
            return null;
        }

        if (group === 'game') {
            const frameRows = this.repository
                .getPlaytimeFramesByGame(user.id, bucket)
                .filter((row) => this.hasFrameMinutes(row));

            return {
                username,
                bucket,
                group,
                series: this.groupFramesByGame(bucket, frameRows),
            };
        }

        return {
            username,
            bucket,
            group,
            series: this.repository
                .getPlaytimeBreakdown(user.id, bucket)
                .filter((row) => this.hasBreakdownMinutes(row)),
        };
    }

    private hasBreakdownMinutes(row: PlaytimeBreakdownRow): boolean {
        return row.total_minutes > 0 || row.deck_minutes > 0 || row.windows_minutes > 0;
    }

    private hasFrameMinutes(row: Pick<PlaytimeGameFrameRow, 'minutes'>): boolean {
        return row.minutes > 0;
    }

    private groupFramesByGame(
        bucket: BreakdownBucket,
        frameRows: PlaytimeGameFrameRow[],
    ): PlaytimeBreakdownByGameResult['series'] {
        const grouped = new Map<number, PlaytimeBreakdownByGameResult['series'][number]>();
        const periodTotalsByGame = this.getPeriodTotalsByGame(bucket, frameRows);

        for (const row of frameRows) {
            if (!grouped.has(row.app_id)) {
                grouped.set(row.app_id, {
                    app_id: row.app_id,
                    name: row.app_name,
                    frames: [],
                });
            }

            const periodKey = this.getPeriodKey(bucket, row.frame_from);
            const periodTotal = periodKey
                ? periodTotalsByGame.get(row.app_id)?.get(periodKey)
                : undefined;

            const periodTotalField = bucket === 'hour'
                ? { day_total_minutes: periodTotal }
                : bucket === 'day'
                    ? { week_total_minutes: periodTotal }
                    : {};

            grouped.get(row.app_id)!.frames.push({
                from: row.frame_from,
                to: row.frame_to,
                minutes: row.minutes,
                ...periodTotalField,
                platform_percentages: this.getPlatformPercentages(row),
            });
        }

        return Array.from(grouped.values());
    }

    private getPeriodTotalsByGame(
        bucket: BreakdownBucket,
        frameRows: PlaytimeGameFrameRow[],
    ): Map<number, Map<string, number>> {
        const totalsByGame = new Map<number, Map<string, number>>();

        if (bucket === 'week') {
            return totalsByGame;
        }

        for (const row of frameRows) {
            const periodKey = this.getPeriodKey(bucket, row.frame_from);
            if (!periodKey) {
                continue;
            }

            if (!totalsByGame.has(row.app_id)) {
                totalsByGame.set(row.app_id, new Map<string, number>());
            }

            const gameTotals = totalsByGame.get(row.app_id)!;
            gameTotals.set(periodKey, (gameTotals.get(periodKey) ?? 0) + row.minutes);
        }

        return totalsByGame;
    }

    private getPeriodKey(bucket: BreakdownBucket, frameFrom: string): string | null {
        if (bucket === 'hour') {
            return frameFrom.slice(0, 10);
        }

        if (bucket === 'day') {
            const date = this.toDate(frameFrom);
            if (!date) {
                return null;
            }

            const dayOffset = (date.getDay() + 6) % 7;
            date.setDate(date.getDate() - dayOffset);
            return this.toDateKey(date);
        }

        return null;
    }

    private toDate(value: string): Date | null {
        const parsed = new Date(value.replace(' ', 'T'));
        if (Number.isNaN(parsed.getTime())) {
            return null;
        }

        parsed.setHours(0, 0, 0, 0);
        return parsed;
    }

    private toDateKey(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private getPlatformPercentages(
        row: Pick<PlaytimeGameFrameRow, 'minutes' | 'deck_minutes' | 'windows_minutes'>,
    ): { deck: number; windows: number; other: number } {
        const totalMinutes = Math.max(0, row.minutes);
        if (totalMinutes <= 0) {
            return { deck: 0, windows: 0, other: 0 };
        }

        const deckMinutes = Math.max(0, row.deck_minutes);
        const windowsMinutes = Math.max(0, row.windows_minutes);
        const knownMinutes = deckMinutes + windowsMinutes;

        // Guard against source data where known platform deltas exceed total delta.
        if (knownMinutes > totalMinutes) {
            return {
                deck: this.roundPercent((deckMinutes / knownMinutes) * 100),
                windows: this.roundPercent((windowsMinutes / knownMinutes) * 100),
                other: 0,
            };
        }

        const deck = this.roundPercent((deckMinutes / totalMinutes) * 100);
        const windows = this.roundPercent((windowsMinutes / totalMinutes) * 100);
        const other = this.roundPercent(Math.max(0, 100 - deck - windows));

        return { deck, windows, other };
    }

    private roundPercent(value: number): number {
        return Math.round(value * 10) / 10;
    }
}