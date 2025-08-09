function durationModifier(duration, mods) {
    const MODS = {
        DT: 1 << 6,
        HT: 1 << 8,
        NC: 1 << 9
    };

    let speedMultiplier = 1;

    if ((mods & MODS.DT) || (mods & MODS.NC)) speedMultiplier = 1.5;
    if (mods & MODS.HT) speedMultiplier = 0.75;

    return duration / speedMultiplier;
}
module.exports = durationModifier





