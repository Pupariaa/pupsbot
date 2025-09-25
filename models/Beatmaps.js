const { DataTypes } = require('sequelize');

module.exports = (sequelizeInstance) => {
    return sequelizeInstance.define('beatmaps', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        beatmapId: {
            type: DataTypes.BIGINT,
            allowNull: true,
            field: 'beatmap_id'
        },
        beatmapsetId: {
            type: DataTypes.BIGINT,
            allowNull: true,
            field: 'beatmapsetId'
        },
        title: {
            type: DataTypes.STRING(128),
            allowNull: true
        },
        author: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        mapper: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        diffName: {
            type: DataTypes.STRING(50),
            allowNull: true,
            field: 'diff_name'
        },
        length: {
            type: DataTypes.BIGINT,
            allowNull: true
        },
        cs: {
            type: DataTypes.FLOAT,
            allowNull: true
        },
        od: {
            type: DataTypes.FLOAT,
            allowNull: true
        },
        hp: {
            type: DataTypes.FLOAT,
            allowNull: true
        },
        sr: {
            type: DataTypes.FLOAT,
            allowNull: true
        },
        ar: {
            type: DataTypes.FLOAT,
            allowNull: true
        },
        bpm: {
            type: DataTypes.FLOAT,
            allowNull: true
        },
        cLength: {
            type: DataTypes.BIGINT,
            allowNull: true,
            field: 'c_length'
        },
        cCs: {
            type: DataTypes.FLOAT,
            allowNull: true,
            field: 'c_cs'
        },
        cOd: {
            type: DataTypes.FLOAT,
            allowNull: true,
            field: 'c_od'
        },
        cHp: {
            type: DataTypes.FLOAT,
            allowNull: true,
            field: 'c_hp'
        },
        cSr: {
            type: DataTypes.FLOAT,
            allowNull: true,
            field: 'c_sr'
        },
        cAr: {
            type: DataTypes.FLOAT,
            allowNull: true,
            field: 'c_ar'
        },
        cBpm: {
            type: DataTypes.FLOAT,
            allowNull: true,
            field: 'c_bpm'
        },
        mods: {
            type: DataTypes.INTEGER,
            allowNull: true
        }
    }, {
        timestamps: false,
        tableName: 'beatmaps',
        indexes: [
            { fields: ['beatmap_id'] },
            { unique: true, fields: ['beatmap_id', 'mods'] }
        ]
    });
};
