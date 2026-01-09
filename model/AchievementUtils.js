/**
 * 成就工具类（简化版）
 * 提供成就相关的通用方法和配置
 */
class AchievementUtils {
    /**
     * 稀有度配置（用于排序和比较）
     */
    static RARITY_ORDER = {
        'common': 1,
        'uncommon': 2,
        'rare': 3,
        'epic': 4,
        'legendary': 5,
        'festival': 5,
        'mythic': 6,
        'special': 7
    };

    /**
     * 判断是否为全局成就（特殊成就或节日成就）
     */
    static isGlobalAchievement(rarity) {
        const lowerRarity = (rarity || '').toLowerCase();
        return lowerRarity === 'festival' || lowerRarity === 'special';
    }

    /**
     * 获取稀有度的排序值
     */
    static getRarityOrder(rarity) {
        return this.RARITY_ORDER[rarity?.toLowerCase()] || 0;
    }

    /**
     * 比较两个稀有度
     */
    static compareRarity(rarityA, rarityB) {
        const orderA = this.getRarityOrder(rarityA);
        const orderB = this.getRarityOrder(rarityB);
        return orderB - orderA; // 降序排列
    }

    /**
     * 判断稀有度是否达到指定级别或更高
     */
    static isRarityOrHigher(rarity, minRarity) {
        return this.getRarityOrder(rarity) >= this.getRarityOrder(minRarity);
    }

    /**
     * 按稀有度排序成就（降序）
     */
    static sortByRarity(achievements, getRarity, getSecondarySort = null) {
        return achievements.sort((a, b) => {
            const rarityA = getRarity(a);
            const rarityB = getRarity(b);
            const rarityCompare = this.compareRarity(rarityA, rarityB);
            
            if (rarityCompare !== 0) {
                return rarityCompare;
            }
            
            if (getSecondarySort) {
                return getSecondarySort(a, b);
            }
            
            return 0;
        });
    }
}

export { AchievementUtils };
export default AchievementUtils;
