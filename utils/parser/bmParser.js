function parseCommandParameters(message) {
    const commandParts = message.trim().split(/\s+/);
    const rawArgs = commandParts[1] || '';
    const input = rawArgs.toUpperCase();
    const hasPlus = input.includes('+');

    const mods = new Set();
    let precision = null;

    const tokens = input.replace(/[^\w:+]/g, ' ').split(/\s+/).filter(Boolean);

    for (const token of tokens) {
        const modMatches = token.match(/HD|HR|DT|NC|FL|EZ|NM/g);
        if (modMatches) {
            modMatches.forEach(mod => mods.add(mod));
        }

        const precisionMatch = token.match(/^PRECIS[:]?(\d)$/);
        if (precisionMatch) {
            precision = parseInt(precisionMatch[1], 10);
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
        parameters: commandParts.slice(2).join(' ')
    };
}

module.exports = parseCommandParameters;
