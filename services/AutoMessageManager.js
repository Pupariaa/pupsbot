const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Logger = require('../utils/Logger');
const { parseSetMessageArgs } = require('../utils/parseSetMessageArgs');

const CONFIG_PATH = path.join(__dirname, '..', 'auto-message.json');
const ALLOWED_COMMANDS = new Set(['727', 'fb', 'help', 'info', 'o', 'release', 'support', 'teams', 'version']);
const ALLOWED_FOCUS = new Set(['main', 'aux']);

class AutoMessageManager {
    constructor(performe) {
        this.performe = performe;
        this._ensureFile();
    }

    _ensureFile() {
        if (!fs.existsSync(CONFIG_PATH)) {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify({ fr: [], en: [] }, null, 2), 'utf8');
        }
    }

    _load() {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        return JSON.parse(raw);
    }

    _save(data) {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
    }

    async _ensureAdmin(event, queue, ctx = {}) {
        const adminNick = (process.env.AUTO_MESSAGE_ADMIN_NICK || 'Puparia').toLowerCase();
        if (event.nick.toLowerCase() !== adminNick) {
            await queue.addToQueue(event.nick, 'Commande réservée.', true, event.id, true);
            return false;
        }
        const explicitPupsbotNick = (process.env.PUPSBOT_IRC_USERNAME || '').trim().toLowerCase();
        const targetNick = (event.target || '').trim().toLowerCase();
        if (explicitPupsbotNick && targetNick === explicitPupsbotNick) {
            return true;
        }
        const { receivingBot, pupsbotIrcSession } = ctx;
        if (pupsbotIrcSession === true || receivingBot === 'pupsbot') {
            return true;
        }
        await queue.addToQueue(
            event.nick,
            'Réessaie depuis un MP avec le bot Pupsbot uniquement (pas l’autre compte IRC du bot).',
            true,
            event.id,
            true
        );
        return false;
    }

    _findRuleIndex(rules, idStr) {
        if (!idStr || !String(idStr).trim()) {
            return { error: 'missing_id' };
        }
        const s = String(idStr).trim().toLowerCase();
        const exact = rules.findIndex((r) => r.id.toLowerCase() === s);
        if (exact >= 0) {
            return { index: exact };
        }
        const prefixed = rules
            .map((r, i) => (r.id.toLowerCase().startsWith(s) ? i : -1))
            .filter((i) => i >= 0);
        if (prefixed.length === 0) {
            return { error: 'not_found' };
        }
        if (prefixed.length > 1) {
            return { error: 'ambiguous' };
        }
        return { index: prefixed[0] };
    }

    async handleSetMessageCommand({ locale, raw, event, queue, receivingBot, pupsbotIrcSession }) {
        if (!(await this._ensureAdmin(event, queue, { receivingBot, pupsbotIrcSession }))) {
            return;
        }

        const parsed = parseSetMessageArgs(raw);
        const message = parsed.message;
        const everyRaw = parsed.every;
        const focusRaw = parsed.focus;
        const commandRaw = parsed.command;

        if (!message || !everyRaw || !focusRaw || !commandRaw) {
            await queue.addToQueue(event.nick, 'Missing required flags: --message, --every, --focus, --command', true, event.id, true);
            return;
        }

        const everyDays = parseInt(everyRaw, 10);
        if (!Number.isFinite(everyDays) || everyDays < 0) {
            await queue.addToQueue(event.nick, '--every must be 0 (once per user, never repeat) or a positive number of days.', true, event.id, true);
            return;
        }

        const focus = focusRaw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        for (const f of focus) {
            if (!ALLOWED_FOCUS.has(f)) {
                await queue.addToQueue(event.nick, `Invalid focus: ${f}. Use main and/or aux.`, true, event.id, true);
                return;
            }
        }

        const commands = commandRaw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        for (const c of commands) {
            if (!ALLOWED_COMMANDS.has(c)) {
                await queue.addToQueue(event.nick, `Invalid command in --command: ${c}`, true, event.id, true);
                return;
            }
        }

        const id = crypto.randomUUID();
        const rule = {
            id,
            message: message.trim(),
            everyDays,
            focus,
            commands
        };

        const data = this._load();
        if (!data[locale]) {
            data[locale] = [];
        }
        data[locale].push(rule);
        this._save(data);

        const everyLabel = everyDays === 0 ? 'once only (never repeat)' : `${everyDays}d`;
        await queue.addToQueue(
            event.nick,
            `Rule ${id.slice(0, 8)} added (${locale}): ${commands.join(', ')} every ${everyLabel}, focus ${focus.join(',')}`,
            true,
            event.id,
            true
        );
    }

    async handleListMessageCommand({ locale, event, queue, receivingBot, pupsbotIrcSession }) {
        if (!(await this._ensureAdmin(event, queue, { receivingBot, pupsbotIrcSession }))) {
            return;
        }

        const data = this._load();
        const rules = data[locale] || [];

        if (rules.length === 0) {
            await queue.addToQueue(event.nick, `No auto-messages for locale "${locale}".`, true, event.id, true);
            return;
        }

        await queue.addToQueue(event.nick, `Auto-messages (${locale}) — ${rules.length} rule(s):`, true, event.id, true);

        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            const everyLabel = rule.everyDays === 0 ? 'once only' : `${rule.everyDays}d`;
            const header = `[${i + 1}] id=${rule.id} | every ${everyLabel} | focus ${rule.focus.join(',')} | commands ${rule.commands.join(',')}`;
            await queue.addToQueue(event.nick, header, true, event.id, true);
            await queue.addToQueue(event.nick, rule.message, true, event.id, true);
        }
    }

    async handleEditMessageCommand({ locale, raw, event, queue, receivingBot, pupsbotIrcSession }) {
        if (!(await this._ensureAdmin(event, queue, { receivingBot, pupsbotIrcSession }))) {
            return;
        }

        const parsed = parseSetMessageArgs(raw);
        const idRaw = parsed.id;
        if (!idRaw) {
            await queue.addToQueue(event.nick, 'Missing --id (full UUID or unique prefix).', true, event.id, true);
            return;
        }

        const data = this._load();
        const rules = data[locale] || [];
        const found = this._findRuleIndex(rules, idRaw);
        if (found.error === 'missing_id') {
            await queue.addToQueue(event.nick, 'Missing --id.', true, event.id, true);
            return;
        }
        if (found.error === 'not_found') {
            await queue.addToQueue(event.nick, `No rule matching id "${idRaw}" in ${locale}.`, true, event.id, true);
            return;
        }
        if (found.error === 'ambiguous') {
            await queue.addToQueue(event.nick, `Multiple rules match prefix "${idRaw}". Use full UUID.`, true, event.id, true);
            return;
        }

        const hasUpdate =
            parsed.message !== undefined ||
            parsed.every !== undefined ||
            parsed.focus !== undefined ||
            parsed.command !== undefined;
        if (!hasUpdate) {
            await queue.addToQueue(event.nick, 'Provide at least one of: --message, --every, --focus, --command', true, event.id, true);
            return;
        }

        const rule = rules[found.index];

        if (parsed.message !== undefined) {
            const nextMsg = parsed.message.trim();
            if (!nextMsg) {
                await queue.addToQueue(event.nick, '--message cannot be empty.', true, event.id, true);
                return;
            }
            rule.message = nextMsg;
        }
        if (parsed.every !== undefined) {
            const everyDays = parseInt(parsed.every, 10);
            if (!Number.isFinite(everyDays) || everyDays < 0) {
                await queue.addToQueue(event.nick, '--every must be 0 (once per user, never repeat) or a positive number of days.', true, event.id, true);
                return;
            }
            rule.everyDays = everyDays;
        }
        if (parsed.focus !== undefined) {
            const focus = parsed.focus.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
            for (const f of focus) {
                if (!ALLOWED_FOCUS.has(f)) {
                    await queue.addToQueue(event.nick, `Invalid focus: ${f}. Use main and/or aux.`, true, event.id, true);
                    return;
                }
            }
            rule.focus = focus;
        }
        if (parsed.command !== undefined) {
            const commands = parsed.command.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
            for (const c of commands) {
                if (!ALLOWED_COMMANDS.has(c)) {
                    await queue.addToQueue(event.nick, `Invalid command in --command: ${c}`, true, event.id, true);
                    return;
                }
            }
            rule.commands = commands;
        }

        this._save(data);

        const everyLabel = rule.everyDays === 0 ? 'once only' : `${rule.everyDays}d`;
        await queue.addToQueue(
            event.nick,
            `Updated rule ${rule.id.slice(0, 8)} (${locale}): every ${everyLabel} | focus ${rule.focus.join(',')} | commands ${rule.commands.join(',')}`,
            true,
            event.id,
            true
        );
    }

    async handleDeleteMessageCommand({ locale, raw, event, queue, receivingBot, pupsbotIrcSession }) {
        if (!(await this._ensureAdmin(event, queue, { receivingBot, pupsbotIrcSession }))) {
            return;
        }

        const parsed = parseSetMessageArgs(raw);
        const idRaw = parsed.id;
        if (!idRaw) {
            await queue.addToQueue(event.nick, 'Missing --id (full UUID or unique prefix).', true, event.id, true);
            return;
        }

        const data = this._load();
        const rules = data[locale] || [];
        const found = this._findRuleIndex(rules, idRaw);
        if (found.error === 'not_found') {
            await queue.addToQueue(event.nick, `No rule matching id "${idRaw}" in ${locale}.`, true, event.id, true);
            return;
        }
        if (found.error === 'ambiguous') {
            await queue.addToQueue(event.nick, `Multiple rules match prefix "${idRaw}". Use full UUID.`, true, event.id, true);
            return;
        }

        const rule = rules[found.index];
        const rid = rule.id;
        rules.splice(found.index, 1);
        data[locale] = rules;
        this._save(data);

        await this.performe.deleteKeysMatching(`automsg:${rid}:*`);

        await queue.addToQueue(event.nick, `Deleted rule ${rid.slice(0, 8)} (${locale}).`, true, event.id, true);
    }

    async trySendAfterCommand({ event, queue, user, commandName, botFocus }) {
        if (!user?.id) {
            return;
        }
        if (
            commandName === 'set-message-fr' ||
            commandName === 'set-message-en' ||
            commandName === 'list-message-fr' ||
            commandName === 'list-message-en' ||
            commandName === 'edit-message-fr' ||
            commandName === 'edit-message-en' ||
            commandName === 'delete-message-fr' ||
            commandName === 'delete-message-en'
        ) {
            return;
        }
        const locale = user.locale === 'FR' ? 'fr' : 'en';
        let data;
        try {
            data = this._load();
        } catch (e) {
            Logger.errorCatch('AutoMessageManager._load', e);
            return;
        }
        const rules = data[locale] || [];
        const focusKey = botFocus === 'aux' ? 'aux' : 'main';

        for (const rule of rules) {
            if (!rule.commands.includes(commandName)) {
                continue;
            }
            if (!rule.focus.includes(focusKey)) {
                continue;
            }

            const key = `automsg:${rule.id}:${user.id}`;
            const prev = await this.performe.get(key);
            const prevTs = prev ? parseInt(prev, 10) : null;
            const now = Date.now();
            if (prevTs !== null && !Number.isNaN(prevTs)) {
                if (rule.everyDays === 0) {
                    continue;
                }
                if ((now - prevTs) < rule.everyDays * 86400000) {
                    continue;
                }
            }

            await queue.addToQueue(event.nick, rule.message, false, event.id, true);
            await this.performe.setValue(key, now.toString());
        }
    }
}

module.exports = AutoMessageManager;
