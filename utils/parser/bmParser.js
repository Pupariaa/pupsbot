function parseCommandParameters(message) {
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
        KEY9: 'KEY9', '9K': 'KEY9',
    };

    const supportedMods = ['HD', 'HR', 'DT', 'NC', 'EZ', 'NM'];

    const mods = new Set();
    const unsupportedMods = [];
    const unknownTokens = [];
    let precision = null;

    const tokens = input.replace(/[^\w:+]/g, ' ').split(/\s+/).filter(Boolean);

    for (const token of tokens) {
        const precisionMatch = token.match(/^PRECIS[:]?(\d)$/);
        if (precisionMatch) {
            precision = parseInt(precisionMatch[1], 10);
            continue;
        }

        const mod = allKnownMods[token];
        if (mod) {
            if (supportedMods.includes(mod)) {
                mods.add(mod);
            } else {
                unsupportedMods.push(mod);
            }
        } else {
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
        unsupportedMods,
        unknownTokens
    };
}

module.exports = parseCommandParameters;
