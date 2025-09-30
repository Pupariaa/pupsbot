function parseCommandParameters(message, gamemode) {
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
        : ['HD', 'HR', 'DT', 'NC', 'EZ', 'NM', 'HT'];

    const mods = new Set();
    const unsupportedMods = [];
    const unknownTokens = [];
    let bpm = null;
    let pp = null;
    let precision = null;

    const tokens = input.replace(/[^\w:+]/g, ' ').split(/\s+/).filter(Boolean);

    for (const token of tokens) {
        if (token === '+') continue;

        const precisionMatch = token.match(/^PRECIS[:]?(\d)$/);
        if (precisionMatch) {
            precision = parseInt(precisionMatch[1], 10);
            continue;
        }

        // Parse bpm:xxx (integer)
        const bpmMatch = token.match(/^BPM[:]?(\d+)$/);
        if (bpmMatch) {
            bpm = parseInt(bpmMatch[1], 10);
            continue;
        }

        // Parse pp:xxx (integer)
        const ppMatch = token.match(/^PP[:]?(\d+)$/);
        if (ppMatch) {
            pp = parseInt(ppMatch[1], 10);
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

    const allowOtherMods =
        hasPlus ||
        (mods.size === 0 && !hasNM && tokens.length === 0);

    return {
        allowOtherMods,
        mods: Array.from(mods),
        precis: precision !== null ? [precision] : [1, 2, 3, 4],
        parameters: rawArgs.trim(),
        bpm,
        pp,
        unsupportedMods,
        unknownTokens
    };
}

module.exports = parseCommandParameters;
