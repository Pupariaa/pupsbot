function specsModifier(mods, stats) {
    const MODS = {
        HR: 1 << 4,
        EZ: 1 << 1,
        DT: 1 << 6,
        HT: 1 << 8,
        NC: 1 << 9
    };

    const result = {
        ar: stats.ar,
        od: stats.od,
        cs: stats.cs,
        hp: stats.hp,
        bpm: stats.bpm
    };

    let speedMultiplier = 1;

    if ((mods & MODS.DT) || (mods & MODS.NC)) speedMultiplier = 1.5;
    if (mods & MODS.HT) speedMultiplier = 0.75;

    if (mods & MODS.HR) {
        result.ar *= 1.4;
        result.od *= 1.4;
        result.hp *= 1.4;
        result.cs *= 1.3;
    }

    if (mods & MODS.EZ) {
        result.ar *= 0.5;
        result.od *= 0.5;
        result.hp *= 0.5;
    }

    function arToMs(ar) {
        if (ar < 0) ar = 0;
        if (ar > 10) ar = 10;
        if (ar <= 5) return 1800 - 120 * ar;
        return 1200 - 150 * (ar - 5);
    }

    function msToAr(ms) {
        if (ms > 1800) return 0;
        if (ms < 300) return 10;
        if (ms >= 1200) return (1800 - ms) / 120;
        return 5 + (1200 - ms) / 150;
    }

    function odToMs(od) {
        if (od < 0) od = 0;
        if (od > 10) od = 10;
        return 79.5 - 6 * od;
    }

    function msToOd(ms) {
        if (ms > 79.5) return 0;
        if (ms < 19.5) return 10;
        return (79.5 - ms) / 6;
    }

    const arMs = arToMs(result.ar) / speedMultiplier;
    result.ar = msToAr(arMs);

    const odMs = odToMs(result.od) / speedMultiplier;
    result.od = msToOd(odMs);

    result.bpm *= speedMultiplier;

    if (result.ar > 11) result.ar = 11;
    if (result.od > 11) result.od = 11;
    if (result.cs > 10) result.cs = 10;
    if (result.hp > 10) result.hp = 10;

    result.ar = Math.round(result.ar * 10) / 10;
    result.od = Math.round(result.od * 10) / 10;
    result.cs = Math.round(result.cs * 10) / 10;
    result.hp = Math.round(result.hp * 10) / 10;
    result.bpm = Math.round(result.bpm);

    return result;
}
module.exports = specsModifier;
