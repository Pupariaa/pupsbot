"use strict";
class TokenKeyInline {
    static convertBufferToBase64Url(buffer) {
        return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    static convertBase64UrlToBuffer(text) {
        const replaced = text.replace(/-/g, "+").replace(/_/g, "/");
        const mod = replaced.length % 4;
        const paddingLength = mod === 0 ? 0 : 4 - mod;
        const padded = paddingLength === 0 ? replaced : replaced + "=".repeat(paddingLength);
        return Buffer.from(padded, "base64");
    }


    static generateToken(userId, beatmapObject) {
        const buffer = Buffer.alloc(12);

        const userIdNum = parseInt(userId, 10);
        const beatmapsetId = beatmapObject?.beatmapset_id || 0;
        const beatmapId = beatmapObject?.id || 0;

        buffer.writeUInt32BE(userIdNum, 0);
        buffer.writeUInt32BE(beatmapsetId, 4);
        buffer.writeUInt32BE(beatmapId, 8);

        return TokenKeyInline.convertBufferToBase64Url(buffer);
    }

    static verifyToken(token) {
        try {
            if (typeof token !== "string") return { valid: false, reason: "invalid_token_type" };
            const buffer = TokenKeyInline.convertBase64UrlToBuffer(token);
            if (buffer.length !== 12) return { valid: false, reason: "invalid_length" };

            const userId = buffer.readUInt32BE(0);
            const beatmapsetId = buffer.readUInt32BE(4);
            const beatmapId = buffer.readUInt32BE(8);

            const payload = {
                user_id: userId,
                beatmapset_id: beatmapsetId,
                id: beatmapId
            };

            return { valid: true, payload: payload };
        } catch (err) {
            return { valid: false, reason: "exception", detail: err.message };
        }
    }

    static parseToken(token) {
        const verification = TokenKeyInline.verifyToken(token);
        if (!verification.valid) return { ok: false, error: verification.reason, detail: verification.detail || null };
        const payload = verification.payload;
        return {
            ok: true,
            user_id: payload.user_id,
            beatmapset_id: payload.beatmapset_id,
            beatmap_id: payload.id,
            raw: payload
        };
    }

    static isTokenLegit(token) {
        const verification = TokenKeyInline.verifyToken(token);
        return verification.valid === true;
    }
}

module.exports = TokenKeyInline;
