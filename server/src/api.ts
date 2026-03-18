import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { create } from './factory';
import type { BreakdownBucket, BreakdownGroup } from './repository';

const app = express()
const port = process.env.PORT || 3000
let isSyncAllRunning = false;

export async function run() {
    console.log('Initializing server...')
    const { service } = await create();
    const publicDir = path.resolve(process.cwd(), 'public');
    const indexPath = path.join(publicDir, 'index.html');

    app.use(express.static(publicDir));

    app.get('/sync/users/:username', async (rq, rs) => {
        const { username } = rq.params;

        const syncedGames = await service.syncUser(username)
        rs.status(200).json({ message: 'Sync complete', syncedGames });
    });

    app.get('/users/:username', async (rq, rs) => {
        const { username } = rq.params;
        const bucketRaw = String(rq.query.bucket ?? rq.query.by ?? rq.query.timeframe ?? 'day').toLowerCase();
        const groupRaw = String(rq.query.group ?? rq.query.mode ?? 'game').toLowerCase();

        if (!isBreakdownBucket(bucketRaw)) {
            rs.status(400).json({
                error: "Invalid bucket. Use one of: 'hour', 'day', 'week'.",
            });
            return;
        }

        if (!isBreakdownGroup(groupRaw)) {
            rs.status(400).json({
                error: "Invalid group. Use one of: 'total', 'game'.",
            });
            return;
        }

        const breakdown = service.getPlaytimeBreakdown(username, bucketRaw, groupRaw);
        if (!breakdown) {
            rs.status(404).json({ error: 'User not found' });
            return;
        }

        if (breakdown.group === 'game') {
            rs.status(200).json(breakdown.series);
            return;
        }

        rs.status(200).json(breakdown);

    })

    app.get('/sync/all', async (rq, rs) => {
        if (isSyncAllRunning) {
            rs.status(409).json({ error: 'Sync already running' });
            return;
        }

        isSyncAllRunning = true;
        try {
            const result = await service.syncAll();
            rs.status(200).json({ message: 'Sync complete', ...result });
        } finally {
            isSyncAllRunning = false;
        }
    });

    app.use((rq, rs, next) => {
        if (rq.method !== 'GET') {
            next();
            return;
        }

        if (rq.path.startsWith('/users') || rq.path.startsWith('/sync')) {
            next();
            return;
        }

        if (fs.existsSync(indexPath)) {
            rs.sendFile(indexPath);
            return;
        }

        next();
    });

    app.use((rq, rs) => {
        if (rq.path.startsWith('/users') || rq.path.startsWith('/sync')) {
            rs.status(404).json({ error: 'Not found' });
            return;
        }

        rs.status(404).send('Not found');
    });

    function isBreakdownBucket(value: string): value is BreakdownBucket {
        return value === 'hour' || value === 'day' || value === 'week';

    }

    function isBreakdownGroup(value: string): value is BreakdownGroup {
        return value === 'total' || value === 'game';
    }

    return app.listen(port, () => {
        console.log(`Server listening on port ${port}`)
    })
}

