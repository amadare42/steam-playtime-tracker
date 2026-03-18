export class SteamApiClient {
    private apiKey: string;

    constructor() {
        this.apiKey = process.env.STEAM_API_KEY!;
        if (!this.apiKey) {
            throw new Error('STEAM_API_KEY environment variable is not set');
        }
    }

    public async getUserInfo(name: string) {
        const rsp = await this.jsonReq<GetUser>(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${this.apiKey}&vanityurl=${encodeURIComponent(name)}`);
        return rsp;
    }

    public async getRecentlyPlayedGames(steamid: string) {
        const rsp = await this.jsonReq<GetRecentlyPlayedGames>(`https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${this.apiKey}&steamid=${steamid}`);
        return rsp;
    }

    private async jsonReq<T>(url: string): Promise<T> {
        const rsp = await fetch(url);
        const json = await rsp.json()
        return json;
    }
}

type SteamRsp<T> = {
    response: T
}

type GetUser = SteamRsp<{
    success: 0 | 1;
    steamid: string;
}>

type PlayedGame = {
    appid: number;
    name: string;
    playtime_2weeks: number;
    playtime_forever: number;
    img_icon_url: string;
    playtime_deck_forever: number;
    playtime_windows_forever: number;
}

type GetRecentlyPlayedGames = SteamRsp<{
    total_count: number;
    games: PlayedGame[];
}>