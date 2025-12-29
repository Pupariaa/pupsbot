const { DataTypes } = require('sequelize');

module.exports = (sequelizeInstance) => {
    return sequelizeInstance.define('commands_history', {
        command_id: DataTypes.BIGINT,
        command_input: DataTypes.STRING,
        response: DataTypes.STRING,
        user_id: DataTypes.BIGINT,
        username: DataTypes.TEXT,
        used_thread: DataTypes.INTEGER,
        Date: DataTypes.DATE,
        Success: DataTypes.BOOLEAN,
        elapsed_time: DataTypes.FLOAT,
        locale: DataTypes.STRING,
        from: DataTypes.STRING
    }, {
        timestamps: false,
        tableName: 'commands_history'
    });
};

