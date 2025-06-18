const { DataTypes } = require('sequelize');

module.exports = (sequelizeInstance) => {
    return sequelizeInstance.define('suggested_beatmap', {
        user_id: DataTypes.BIGINT,
        beatmap_id: DataTypes.BIGINT,
        Date: DataTypes.DATE,
    }, {
        timestamps: false
    });
};
