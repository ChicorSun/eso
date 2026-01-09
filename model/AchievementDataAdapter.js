import fs from 'fs';
import path from 'path';
import { TimeUtils } from './TimeUtils.js';

/**
 * 成就数据适配器（JSON文件存储，适合嵌入式设备）
 * 负责将JSON文件数据转换为成就系统需要的格式
 */
class AchievementDataAdapter {
    constructor() {
        this.dataDir = './data';
        this.recentMessages = new Map(); // 缓存最新消息（1分钟TTL）
        this.userDataCache = new Map(); // 用户数据缓存（5分钟TTL）
        this.cacheCleanupInterval = null;
        
        // 定期清理过期缓存（每10分钟）
        this.startCacheCleanup();
    }

    /**
     * 启动缓存清理
     */
    startCacheCleanup() {
        if (this.cacheCleanupInterval) return;
        
        this.cacheCleanupInterval = setInterval(() => {
            this.cleanupCache();
        }, 10 * 60 * 1000); // 10分钟
    }

    /**
     * 清理过期缓存
     */
    cleanupCache() {
        const now = Date.now();
        
        // 清理消息缓存（1分钟TTL）
        for (const [key, data] of this.recentMessages.entries()) {
            if (now - data.timestamp > 60 * 1000) {
                this.recentMessages.delete(key);
            }
        }
        
        // 清理用户数据缓存（5分钟TTL）
        for (const [key, data] of this.userDataCache.entries()) {
            if (now - data.timestamp > 5 * 60 * 1000) {
                this.userDataCache.delete(key);
            }
        }
        
        // 限制缓存大小（最多保留1000个条目）
        if (this.recentMessages.size > 1000) {
            const keysToDelete = Array.from(this.recentMessages.keys()).slice(0, 500);
            keysToDelete.forEach(key => this.recentMessages.delete(key));
        }
        
        if (this.userDataCache.size > 500) {
            const keysToDelete = Array.from(this.userDataCache.keys()).slice(0, 250);
            keysToDelete.forEach(key => this.userDataCache.delete(key));
        }
    }

    /**
     * 获取成就数据文件路径
     */
    getAchievementFilePath(groupId) {
        return path.join(this.dataDir, `${groupId}_achievements.json`);
    }

    /**
     * 读取成就数据
     */
    readAchievementData(groupId) {
        try {
            const filePath = this.getAchievementFilePath(groupId);
            if (!fs.existsSync(filePath)) {
                return { users: {} };
            }
            const content = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            logger.error(`[成就系统] 读取成就数据失败: ${groupId}`, error);
            return { users: {} };
        }
    }

    /**
     * 保存成就数据
     */
    saveAchievementData(groupId, data) {
        try {
            const filePath = this.getAchievementFilePath(groupId);
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
            return true;
        } catch (error) {
            logger.error(`[成就系统] 保存成就数据失败: ${groupId}`, error);
            return false;
        }
    }

    /**
     * 获取用户数据（从JSON文件转换为成就系统格式）
     */
    async getUserData(groupId, userId) {
        const cacheKey = `${groupId}_${userId}`;
        const cached = this.userDataCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
            return cached.data;
        }

        try {
            const timeInfo = TimeUtils.getCurrentDateTime();
            const today = timeInfo.formattedDate;
            const month = timeInfo.monthKey;
            
            // 读取日统计文件
            const dailyStats = {};
            const dailyFilePath = path.join(this.dataDir, `${groupId}_snots`, `${today}.json`);
            if (fs.existsSync(dailyFilePath)) {
                const dailyData = JSON.parse(fs.readFileSync(dailyFilePath, 'utf-8'));
                const userData = dailyData.find(item => String(item.user_id) === String(userId));
                if (userData) {
                    dailyStats[today] = {
                        count: userData.number || 0,
                        words: userData.words || 0
                    };
                }
            }

            // 读取月统计文件
            const monthlyStats = {};
            const monthFilePath = path.join(this.dataDir, `${groupId}_snots`, `${month}.json`);
            if (fs.existsSync(monthFilePath)) {
                const monthData = JSON.parse(fs.readFileSync(monthFilePath, 'utf-8'));
                const userData = monthData.find(item => String(item.user_id) === String(userId));
                if (userData) {
                    monthlyStats[month] = {
                        count: userData.number || 0,
                        words: userData.words || 0
                    };
                }
            }

            // 计算总数据（从所有日统计文件累加，为了支持节日成就，需要读取所有历史数据）
            // 但为了性能考虑，限制最多读取365天
            let total = 0;
            let totalWords = 0;
            let activeDays = 0;
            const now = TimeUtils.getUTC8Date();
            
            // 读取最近365天的数据（支持年度成就和节日成就）
            for (let i = 0; i < 365; i++) {
                const checkDate = new Date(now);
                checkDate.setDate(checkDate.getDate() - i);
                const dateStr = TimeUtils.formatDate(checkDate);
                const filePath = path.join(this.dataDir, `${groupId}_snots`, `${dateStr}.json`);
                
                if (fs.existsSync(filePath)) {
                    try {
                        const dayData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                        const userData = dayData.find(item => String(item.user_id) === String(userId));
                        if (userData) {
                            dailyStats[dateStr] = {
                                count: userData.number || 0,
                                words: userData.words || 0
                            };
                            total += userData.number || 0;
                            totalWords += userData.words || 0;
                            if (userData.number > 0) activeDays++;
                        }
                    } catch (err) {
                        // 忽略单个文件错误
                    }
                }
            }

            // 计算连续天数
            const continuousDays = TimeUtils.calculateContinuousDays(dailyStats, false);

            const userData = {
                user_id: userId,
                nickname: '',
                total: total,
                total_number_of_words: totalWords,
                active_days: activeDays,
                continuous_days: continuousDays,
                last_speaking_time: timeInfo.formattedDateTime,
                daily_stats: dailyStats,
                weekly_stats: {}, // 简化版暂不支持周统计
                monthly_stats: monthlyStats,
                yearly_stats: {}
            };

            // 缓存数据
            this.userDataCache.set(cacheKey, {
                data: userData,
                timestamp: Date.now()
            });

            return userData;
        } catch (error) {
            logger.error(`[成就系统] 获取用户数据失败: ${groupId}/${userId}`, error);
            return null;
        }
    }

    /**
     * 保存用户成就数据
     */
    async saveUserAchievement(groupId, userId, achievementId, achievementData) {
        try {
            const data = this.readAchievementData(groupId);
            if (!data.users[userId]) {
                data.users[userId] = {
                    achievements: {},
                    display_achievement: null
                };
            }
            
            data.users[userId].achievements[achievementId] = {
                unlocked: achievementData.unlocked || false,
                unlocked_at: achievementData.unlocked_at || null,
                progress: achievementData.progress || 0
            };

            return this.saveAchievementData(groupId, data);
        } catch (error) {
            logger.error(`[成就系统] 保存用户成就失败: ${groupId}/${userId}/${achievementId}`, error);
            return false;
        }
    }

    /**
     * 获取用户成就数据
     */
    async getUserAchievements(groupId, userId) {
        try {
            const data = this.readAchievementData(groupId);
            const userData = data.users[userId];
            
            if (!userData) {
                return {
                    achievements: {},
                    unlockedCount: 0,
                    displayAchievement: null
                };
            }

            const achievements = {};
            let unlockedCount = 0;

            for (const [achievementId, achievement] of Object.entries(userData.achievements || {})) {
                achievements[achievementId] = {
                    unlocked: achievement.unlocked === true,
                    unlocked_at: achievement.unlocked_at,
                    progress: achievement.progress || 0
                };
                if (achievement.unlocked === true) {
                    unlockedCount++;
                }
            }

            return {
                achievements,
                unlockedCount,
                displayAchievement: userData.display_achievement || null
            };
        } catch (error) {
            logger.error(`[成就系统] 获取用户成就失败: ${groupId}/${userId}`, error);
            return {
                achievements: {},
                unlockedCount: 0,
                displayAchievement: null
            };
        }
    }

    /**
     * 设置显示成就
     */
    async setDisplayAchievement(groupId, userId, achievementId, achievementName, rarity, isManual = true) {
        try {
            const data = this.readAchievementData(groupId);
            if (!data.users[userId]) {
                data.users[userId] = {
                    achievements: {},
                    display_achievement: null
                };
            }

            data.users[userId].display_achievement = {
                achievement_id: achievementId,
                achievement_name: achievementName,
                rarity: rarity,
                is_manual: isManual
            };

            return this.saveAchievementData(groupId, data);
        } catch (error) {
            logger.error(`[成就系统] 设置显示成就失败: ${groupId}/${userId}`, error);
            return false;
        }
    }

    /**
     * 保存最新消息文本（用于文本匹配成就）
     */
    saveRecentMessage(groupId, userId, text) {
        const key = `${groupId}_${userId}`;
        this.recentMessages.set(key, {
            text: text || '',
            timestamp: Date.now()
        });
    }

    /**
     * 获取最新消息文本
     */
    getRecentMessageText(groupId, userId) {
        const key = `${groupId}_${userId}`;
        const data = this.recentMessages.get(key);
        if (data && Date.now() - data.timestamp < 60 * 1000) {
            return data.text;
        }
        return '';
    }

    /**
     * 清除用户数据缓存
     */
    clearUserCache(groupId, userId) {
        const cacheKey = `${groupId}_${userId}`;
        this.userDataCache.delete(cacheKey);
    }
}

export { AchievementDataAdapter };
export default AchievementDataAdapter;
