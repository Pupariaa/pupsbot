function parseCommandParameters(message, gamemode, userPreferences = null) {
    const parts = message.trim().split(/\s+/);
    const rawArgs = parts.slice(1).join(' ');
    const input = rawArgs.toUpperCase();
    const hasPlus = input.includes('+');

    const allKnownMods = {
        NM: 'NM', NOMOD: 'NM', NOMODS: 'NM',
        HD: 'HD', HIDDEN: 'HD',
        HR: 'HR', HARDROCK: 'HR',
        DT: 'DT', DOUBLETIME: 'DT',
        NC: 'NC', NIGHTCORE: 'NC',
        EZ: 'EZ', EASY: 'EZ',
        HT: 'HT', HALFTIME: 'HT',
        FL: 'FL', FLASHLIGHT: 'FL',
        SD: 'SD', SUDDENDEATH: 'SD',
        PF: 'PF', PERFECT: 'PF',
        SO: 'SO', SPUNOUT: 'SO',
        RX: 'RX', RELAX: 'RX',
        AP: 'AP', AUTOPILOT: 'AP',
        AT: 'AT', AUTO: 'AT',
        V2: 'V2', SCOREV2: 'V2',
        FI: 'FI', FADEIN: 'FI',
        TP: 'TP', TIMEWARP: 'TP',
        CN: 'CN', CINEMA: 'CN',
        COOP: 'COOP',
        KEY1: 'KEY1', '1K': 'KEY1',
        KEY2: 'KEY2', '2K': 'KEY2',
        KEY3: 'KEY3', '3K': 'KEY3',
        KEY4: 'KEY4', '4K': 'KEY4',
        KEY5: 'KEY5', '5K': 'KEY5',
        KEY6: 'KEY6', '6K': 'KEY6',
        KEY7: 'KEY7', '7K': 'KEY7',
        KEY8: 'KEY8', '8K': 'KEY8',
        KEY9: 'KEY9', '9K': 'KEY9'
    };

    const mode = (gamemode || 'osu').toLowerCase();
    const supportedMods = mode === 'mania'
        ? ['NF', 'EZ', 'HD', 'FL', 'DT', 'NC', 'FI', 'KEY1', 'KEY2', 'KEY3', 'KEY4', 'KEY5', 'KEY6', 'KEY7', 'KEY8', 'KEY9']
        : ['HD', 'HR', 'DT', 'NC', 'EZ', 'NM'];

    const mods = new Set();
    const unsupportedMods = [];
    const unknownTokens = [];
    let bpm = null;
    let pp = null;
    let accFilter = null;
    let pendingAccOperator = '>';
    let awaitingAccValue = false;
    let lengthFilter = null;
    let pendingLengthOperator = '>';
    let awaitingLengthValue = false;
    let precision = null;
    let fcOnly = false;

    const tokens = input.replace(/[^\w:+<>]/g, ' ').split(/\s+/).filter(Boolean);

    const applyAccFilter = (operator, value) => {
        if (value === null || value === undefined) return;
        const numericValue = typeof value === 'number' ? value : parseFloat(value);
        if (Number.isNaN(numericValue)) return;
        accFilter = {
            operator: operator === '<' ? '<' : '>',
            value: numericValue
        };
    };

    const applyLengthFilter = (operator, value) => {
        if (value === null || value === undefined) return;
        const numericValue = typeof value === 'number' ? value : parseFloat(value);
        if (Number.isNaN(numericValue)) return;
        lengthFilter = {
            operator: operator === '<' ? '<' : '>',
            value: numericValue
        };
    };

    for (const token of tokens) {
        if (token === '+') continue;

        if (awaitingAccValue) {
            const numeric = parseFloat(token.replace(',', '.'));
            if (!Number.isNaN(numeric)) {
                applyAccFilter(pendingAccOperator, numeric);
                awaitingAccValue = false;
                continue;
            }
            awaitingAccValue = false;
        }

        if (awaitingLengthValue) {
            const seconds = parseLengthToSeconds(token);
            if (seconds !== null) {
                applyLengthFilter(pendingLengthOperator, seconds);
                awaitingLengthValue = false;
                continue;
            }
            awaitingLengthValue = false;
        }

        const precisionMatch = token.match(/^PRECIS[:]?(\d)$/);
        if (precisionMatch) {
            precision = parseInt(precisionMatch[1], 10);
            continue;
        }

        const bpmMatch = token.match(/^BPM[:]?(\d+)$/);
        if (bpmMatch) {
            bpm = parseInt(bpmMatch[1], 10);
            continue;
        }

        const ppMatch = token.match(/^PP[:]?(\d+)$/);
        if (ppMatch) {
            pp = parseInt(ppMatch[1], 10);
            continue;
        }

        const accMatch = token.match(/^ACC([<>])?[:]?(\d+(?:[.,]\d+)?)?$/);
        if (accMatch) {
            const operator = accMatch[1] || '>';
            if (accMatch[2]) {
                applyAccFilter(operator, parseFloat(accMatch[2].replace(',', '.')));
            } else {
                pendingAccOperator = operator;
                awaitingAccValue = true;
            }
            continue;
        }

        const lengthMatch = token.match(/^LENGTH([<>])?[:]?(.+)?$/);
        const dureeMatch = token.match(/^DUREE([<>])?[:]?(.+)?$/);

        if (lengthMatch || dureeMatch) {
            const match = lengthMatch || dureeMatch;
            const operator = match[1] || '>';
            const valuePart = match[2]?.trim();
            if (valuePart) {
                const seconds = parseLengthToSeconds(valuePart);
                if (seconds !== null) {
                    applyLengthFilter(operator, seconds);
                }
            } else {
                pendingLengthOperator = operator;
                awaitingLengthValue = true;
            }
            continue;
        }


        if (token === 'FC' || token === 'FULLCOMBO' || token === 'MISS') {
            fcOnly = true;
            continue;
        }

        const mapped = allKnownMods[token];
        if (mapped) {
            let modToAdd = mapped;
            if (mode === 'mania' && mapped === 'NC') modToAdd = 'DT';
            if (supportedMods.includes(modToAdd)) {
                mods.add(modToAdd);
            } else {
                unsupportedMods.push(mapped);
            }
            continue;
        }

        let matched = false;
        if (!hasPlus && token.length % 2 === 0) {
            const tempMods = [];
            for (let i = 0; i < token.length; i += 2) {
                const chunk = token.substring(i, i + 2);
                const splitMapped = allKnownMods[chunk];
                if (splitMapped) {
                    let splitToAdd = splitMapped;
                    if (mode === 'mania' && splitMapped === 'NC') splitToAdd = 'DT';
                    tempMods.push({ original: splitMapped, normalized: splitToAdd });
                } else {
                    tempMods.length = 0;
                    break;
                }
            }
            if (tempMods.length > 0) {
                matched = true;
                for (const m of tempMods) {
                    if (supportedMods.includes(m.normalized)) {
                        mods.add(m.normalized);
                    } else {
                        unsupportedMods.push(m.original);
                    }
                }
            }
        }

        if (!matched) {
            unknownTokens.push(token);
        }
    }

    const hasNM = mods.has('NM');
    mods.delete('NM');

    let allowOtherMods =
        hasPlus ||
        (mods.size === 0 && !hasNM && tokens.length === 0);

    let finalMods = Array.from(mods);
    let finalAllowOtherMods = allowOtherMods;
    let finalBpm = bpm;
    let finalPp = pp;
    let finalAlgorithm = 'Base';

    // Apply user preferences if not in auto mode AND no command parameters provided
    if (userPreferences) {
        if (!userPreferences.autoMods && mods.size === 0) {
            finalMods = userPreferences.mods || [];
            finalAllowOtherMods = userPreferences.allowAnyMods !== undefined ? userPreferences.allowAnyMods : true;
        }

        if (!userPreferences.autoAlgorithm) {
            finalAlgorithm = userPreferences.algorithm || 'Base';
        }

        if (!userPreferences.autoPP && pp === null) {
            finalPp = userPreferences.pp || pp;
        }

        if (!userPreferences.autoBPM && bpm === null) {
            finalBpm = userPreferences.bpm || bpm;
        }
    }

    // Rebuild parameters string with final values
    let finalParameters = rawArgs.trim();
    if (userPreferences && (
        (!userPreferences.autoMods && mods.size === 0) ||
        (!userPreferences.autoPP && pp === null) ||
        (!userPreferences.autoBPM && bpm === null)
    )) {
        const paramParts = [];
        if (finalMods.length > 0) paramParts.push(...finalMods);
        if (finalPp) paramParts.push(`pp:${finalPp}`);
        if (finalBpm) paramParts.push(`bpm:${finalBpm}`);
        finalParameters = paramParts.join(' ');
    }

    const finalAccFilter = accFilter && accFilter.value !== null && accFilter.value !== undefined ? accFilter : null;
    const finalLengthFilter = lengthFilter && lengthFilter.value !== null && lengthFilter.value !== undefined ? lengthFilter : null;

    return {
        allowOtherMods: finalAllowOtherMods,
        mods: finalMods,
        precis: precision !== null ? [precision] : [1, 2, 3, 4],
        parameters: finalParameters,
        bpm: finalBpm,
        pp: finalPp,
        unsupportedMods,
        unknownTokens,
        algorithm: finalAlgorithm,
        fcOnly: fcOnly,
        minAcc: finalAccFilter ? finalAccFilter.value : null,
        minLengthSeconds: finalLengthFilter ? finalLengthFilter.value : null,
        accFilter: finalAccFilter,
        lengthFilter: finalLengthFilter
    };
}

module.exports = parseCommandParameters;

function parseLengthToSeconds(value) {
    if (!value) return null;
    let str = value.trim().toUpperCase();
    str = str.replace(/,/g, '.');

    if (str.includes(':')) {
        const parts = str.split(':');
        if (parts.length === 2) {
            const minutes = parseInt(parts[0], 10);
            const seconds = parseFloat(parts[1]);
            if (!Number.isNaN(minutes) && !Number.isNaN(seconds)) {
                return minutes * 60 + seconds;
            }
        }
    }

    const minuteMatch = str.match(/^(\d+(?:\.\d+)?)(?:\s*)(M|MIN|MINS|MINUTES)$/);
    if (minuteMatch) {
        const minutes = parseFloat(minuteMatch[1]);
        if (!Number.isNaN(minutes)) {
            return minutes * 60;
        }
    }

    const secondMatch = str.match(/^(\d+(?:\.\d+)?)(?:\s*)(S|SEC|SECS|SECONDS)$/);
    if (secondMatch) {
        const seconds = parseFloat(secondMatch[1]);
        if (!Number.isNaN(seconds)) {
            return seconds;
        }
    }

    const numeric = parseFloat(str);
    if (!Number.isNaN(numeric)) {
        return numeric;
    }

    return null;
}
