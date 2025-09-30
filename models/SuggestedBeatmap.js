const { DataTypes } = require('sequelize');

module.exports = (sequelizeInstance) => {
    return sequelizeInstance.define('suggested_beatmaps', {
        user_id: DataTypes.BIGINT,
        beatmap_id: DataTypes.BIGINT,
        Date: DataTypes.DATE,
        pp_target: DataTypes.FLOAT,
        event_id: DataTypes.BIGINT,
        pp_earled: DataTypes.FLOAT,
        mods: DataTypes.INTEGER,
        nv: DataTypes.INTEGER,
        algo: DataTypes.STRING,
        score_id: DataTypes.BIGINT,
        used_mods: DataTypes.INTEGER
    }, {
        tableName: 'suggested_beatmaps',
        timestamps: false
    });
};
