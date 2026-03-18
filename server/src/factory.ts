import { Service } from './service';
import { getDb } from './db/db';
import { Repository } from './repository';
import { SteamApiClient } from './steamApiClient';

export async function create() {
    const db = await getDb();
    const repo = new Repository(db);
    const api = new SteamApiClient();
    const service = new Service(repo, api);

    return {
        db,
        repo,
        service
    }
}