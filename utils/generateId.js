function generateId() {
    const digits = '0123456789';
    const randomChar = (options) => options[Math.floor(Math.random() * options.length)];
    let id = '';
    id += randomChar(digits);
    id += randomChar(digits);
    id += randomChar(digits);
    id += randomChar(digits);
    id += randomChar(digits);
    id += randomChar(digits);
    return id;
}
module.exports = generateId;
