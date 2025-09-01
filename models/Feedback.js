const { DataTypes } = require('sequelize');

module.exports = (sequelizeInstance) => {
    return sequelizeInstance.define('feedback', {
        user_id: DataTypes.BIGINT,
        response: DataTypes.STRING,
        username: DataTypes.STRING,
        locale: DataTypes.STRING,
        Date: DataTypes.DATE,
    }, {
        timestamps: false,
        tableName: 'feedback'
    });
};
