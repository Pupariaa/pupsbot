function parseSetMessageArgs(text) {
    const result = {};
    const re = /--(message|every|focus|command|id)\s+([\s\S]*?)(?=\s--(?:message|every|focus|command|id)\s|$)/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
        result[m[1].toLowerCase()] = m[2].trim();
    }
    return result;
}

module.exports = { parseSetMessageArgs };
