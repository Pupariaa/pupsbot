const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize_logs');

module.exports = sequelize.define('commands_errors', {
    command_id: DataTypes.BIGINT,
    exepted_string: DataTypes.TEXT,
    Date: DataTypes.DATE,
}, {
    timestamps: false,
});

