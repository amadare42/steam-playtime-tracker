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
            const frameRows = this.repository.getPlaytimeFramesByGame(user.id, bucket);
            return {
                username,
                bucket,
                group,
                series: this.groupFramesByGame(frameRows),
            };
        }

        return {
            username,
            bucket,
            group,
            series: this.repository.getPlaytimeBreakdown(user.id, bucket),
        };
    }

    private groupFramesByGame(frameRows: PlaytimeGameFrameRow[]): PlaytimeBreakdownByGameResult['series'] {
        const grouped = new Map<number, PlaytimeBreakdownByGameResult['series'][number]>();

        for (const row of frameRows) {
            if (!grouped.has(row.app_id)) {
                grouped.set(row.app_id, {
                    app_id: row.app_id,
                    name: row.app_name,
                    frames: [],
                });
            }

            grouped.get(row.app_id)!.frames.push({
                from: row.frame_from,
                to: row.frame_to,
                minutes: row.minutes,
            });
        }

        return Array.from(grouped.values());
    }
}