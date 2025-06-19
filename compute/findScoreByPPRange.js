const RedisManager = require('../services/Redis');
const Performe = require('../services/Performe');

async function findScoresByPPRange(range, mods, id) {
    const performe = new Performe();
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

    const luaScript = `
        local ids = redis.call('ZRANGEBYSCORE', KEYS[1], ARGV[1], ARGV[2], 'LIMIT', 0, 1000000)
        local result = {}
        local count = 0
        local maxResults = 100000
        local modFilter = ARGV[3]

    for _, id in ipairs(ids) do
        if count >= maxResults then break end

            local mods = redis.call('HGET', id, 'mods')
            local precision = tonumber(redis.call('HGET', id, 'precision') or "9")

    if precision <= 5 then
    if modFilter == "any" then
    table.insert(result, id)
    count = count + 1
                else
    if mods ~= "0" and mods ~= false and mods ~= "" then
    table.insert(result, id)
    count = count + 1
    end
    end
    end
    end

    return result
        `;

    const t2 = performe.startTimer();
    const rawIds = await redis.instance.eval(luaScript, {
        keys: ['scores_by_pp'],
        arguments: [
            range.min.toString(),
            range.max.toString(),
            useModsFilter ? 'true' : 'any'
        ]
    });

    const scores = await Promise.all(
        rawIds.map(async (id) => {
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
