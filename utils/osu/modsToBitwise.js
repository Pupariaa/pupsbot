function modsToBitwise(modList) {
    const ModEnum = {
        HD: 8,
        HR: 16,
        DT: 64,
        NC: 64, // NC = DT
        FL: 1024,
        NF: 1,
        EZ: 2,
        SD: 32,
        PF: 16384,
        FI: 1048576,
        SO: 4096,
        RX: 128,
        AP: 8192
    };

    let bitwise = 0;
    for (const mod of modList) {
        const key = mod.trim().toUpperCase();
        if (ModEnum[key]) {
            bitwise |= ModEnum[key];
        }
    }
    return bitwise;
}

module.exports = modsToBitwise;