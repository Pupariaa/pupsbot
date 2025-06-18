const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.LOGS_DB_NAME, process.env.LOGS_DB_USER, process.env.LOGS_DB_PASS, {
    host: process.env.LOGS_DB_HOST,
    dialect: 'mysql',
    logging: false,
});

module.exports = sequelize;
