-- Find scores by PP range with pagination
-- Args: minPP, maxPP, modFilter, bpmFilter, offset, chunkSize, maxResults
local ids = redis.call('ZRANGEBYSCORE', KEYS[1], ARGV[1], ARGV[2], 'LIMIT', ARGV[5], ARGV[6])
local result = {}
local count = 0
local maxResults = tonumber(ARGV[7])
local modFilter = ARGV[3]
local bpmFilter = ARGV[4]
local bpmMargin = 10

for _, id in ipairs(ids) do
    if count >= maxResults then break end

    local mods = redis.call('HGET', id, 'mods')
    local precision = tonumber(redis.call('HGET', id, 'precision') or "9")
    local mode = redis.call('HGET', id, 'type')
    local bpm = tonumber(redis.call('HGET', id, 'bpm') or "0")

    if mode == 'osu' then
        if precision <= 3 then
            local bpmMatch = true
            if bpmFilter ~= "none" then
                local targetBpm = tonumber(bpmFilter)
                bpmMatch = math.abs(bpm - targetBpm) <= bpmMargin
            end

            if bpmMatch then
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
    end
end

return result
