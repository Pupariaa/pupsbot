const RedisManager = require('../../services/Redis');
const RedisStore = require('../../services/RedisStore');
const fs = require('fs');
const path = require('path');

async function findScoresByPPRange(range, mods, id, bpm = null) {
    const performe = new RedisStore();
    await performe.init();
    const t = performe.startTimer();
    if (!range || typeof range.min !== 'number' || typeof range.max !== 'number') {
        await performe.logDuration('FSBPR', await t.stop('FSBPR'))
        await performe.close();
        throw new Error(`${new Date().toLocaleString('fr-FR')} ${id} Invalid range object`);
    }

    const redis = new RedisManager();
    await redis.connect();

    const useModsFilter = mods.length > 0;
    const chunkSize = 1000; // Process in chunks of 1000
    const maxResults = 50000; // Limit total results
    let allResults = [];
    let offset = 0;

    const luaScriptPath = path.join(__dirname, '../../scripts/lua/findScoresByPPRange.lua');
    const luaScript = fs.readFileSync(luaScriptPath, 'utf8');

    const t2 = performe.startTimer();

    while (allResults.length < maxResults) {
        const chunkResults = await redis.instance.eval(luaScript, {
            keys: ['scores_by_pp'],
            arguments: [
                range.min.toString(),
                range.max.toString(),
                useModsFilter ? 'true' : 'any',
                bpm !== null ? bpm.toString() : 'none',
                offset.toString(),
                chunkSize.toString(),
                (maxResults - allResults.length).toString()
            ]
        });

        if (chunkResults.length === 0) {
            break; // No more data
        }

        allResults = allResults.concat(chunkResults);
        offset += chunkSize;

        // If we got fewer results than chunk size, we've reached the end
        if (chunkResults.length < chunkSize) {
            break;
        }
    }

    // Limit to maxResults
    allResults = allResults.slice(0, maxResults);

    const scores = await Promise.all(
        allResults.map(async (id) => {
            const data = await redis.instance.hGetAll(id);
            return { scoreId: id, ...data };
        })
    );

    await performe.logDuration('RREAD', await t2.stop('RREAD'))
    await performe.logDuration('FSBPR', await t.stop('FSBPR'))
    await performe.close();
    await redis.quit();
    return scores;
}

module.exports = findScoresByPPRange;
