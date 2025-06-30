const { DataTypes } = require('sequelize');

module.exports = (sequelizeInstance) => {
    return sequelizeInstance.define('suggested_beatmaps', {
        user_id: DataTypes.BIGINT,
        beatmap_id: DataTypes.BIGINT,
        Date: DataTypes.DATE,
        pp_target: DataTypes.FLOAT,
        event_id: DataTypes.BIGINT,
        pp_earled: DataTypes.FLOAT
    }, {
        tableName: 'suggested_beatmaps',
        timestamps: false
    });
};
