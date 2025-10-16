const { DataTypes } = require('sequelize');

module.exports = (sequelizeInstance) => {
    const model = sequelizeInstance.define('beatmap_ratings', {
        user_id: DataTypes.BIGINT,
        beatmap_id: DataTypes.BIGINT,
    }, {
        timestamps: false,
        tableName: 'beatmap_ratings'
    });

    model.existsRating = async function (userId, beatmapId) {
        try {
            const count = await this.count({
                where: {
                    user_id: userId,
                    beatmap_id: beatmapId
                }
            });
            return count > 0;
        } catch (error) {
            throw error;
        }
    };

    return model;
};
