import fs from 'fs';
import path from 'path';
import { TimeUtils } from './TimeUtils.js';
import { AchievementUtils } from './AchievementUtils.js';
import { AchievementDataAdapter } from './AchievementDataAdapter.js';

/**
 * 成就服务类（简化版，适合嵌入式设备）
 * 负责成就的定义、检查、解锁和管理（使用JSON文件存储）
 */
class AchievementService {
    constructor(dataAdapter = null) {
        this.dataAdapter = dataAdapter || new AchievementDataAdapter();
        this.configDir = path.join(process.cwd(), 'plugins', 'eso', 'config', 'achievements');
        this.achievementDefinitions = null;
        this.definitionsLoaded = false;
        this.cacheTimestamp = 0;
        this.cacheTTL = 10 * 60 * 1000; // 10分钟缓存
    }

    /**
     * 获取成就定义（带缓存）
     */
    getAchievementDefinitions() {
        if (this.definitionsLoaded && this.achievementDefinitions &&
            (Date.now() - this.cacheTimestamp) < this.cacheTTL) {
            return this.achievementDefinitions;
        }

        this.achievementDefinitions = this.loadAchievementsFromFile();
        this.definitionsLoaded = true;
        this.cacheTimestamp = Date.now();

        return this.achievementDefinitions;
    }

    /**
     * 从JSON文件加载成就定义
     */
    loadAchievementsFromFile() {
        const achievements = {};

        try {
            if (fs.existsSync(this.configDir) && fs.statSync(this.configDir).isDirectory()) {
                const files = fs.readdirSync(this.configDir).filter(file => file.endsWith('.json'));
                
                for (const file of files) {
                    const filePath = path.join(this.configDir, file);
                    try {
                        const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        Object.assign(achievements, fileData);
                    } catch (fileError) {
                        logger.error(`[成就系统] 加载成就文件失败: ${file}`, fileError);
                    }
                }
            }
        } catch (error) {
            logger.error('[成就系统] 加载成就配置失败:', error);
        }

        return achievements;
    }

    /**
     * 获取所有成就定义
     */
    getAllAchievementDefinitions(groupId) {
        return this.getAchievementDefinitions();
    }

    /**
     * 获取用户成就数据
     */
    async getUserAchievements(groupId, userId) {
        return await this.dataAdapter.getUserAchievements(groupId, userId);
    }

    /**
     * 检查并更新用户成就
     */
    async checkAndUpdateAchievements(groupId, userId, userData) {
        if (!userData) {
            return [];
        }

        const achievementData = await this.getUserAchievements(groupId, userId);
        const allDefinitions = this.getAllAchievementDefinitions(groupId);
        
        const newAchievements = [];

        // 检查每个成就
        for (const [achievementId, definition] of Object.entries(allDefinitions)) {
            // 如果已解锁，跳过
            if (achievementData.achievements[achievementId]?.unlocked) {
                continue;
            }

            // 检查成就条件
            const matched = this.checkAchievementCondition(definition, userData, groupId, userId);
            
            if (matched) {
                // 解锁成就
                const unlockedAt = TimeUtils.formatDateTime(TimeUtils.getUTC8Date());
                
                await this.dataAdapter.saveUserAchievement(groupId, userId, achievementId, {
                    unlocked: true,
                    unlocked_at: unlockedAt,
                    progress: definition.condition?.value || 1
                });

                newAchievements.push({
                    ...definition,
                    id: achievementId,
                    unlockedAt
                });
            }
        }

        return newAchievements;
    }

    /**
     * 检查成就条件（简化版，只支持基础类型）
     */
    checkAchievementCondition(definition, userData, groupId, userId) {
        const { condition } = definition;

        if (!condition || !condition.type) {
            return false;
        }

        switch (condition.type) {
            case 'first_message':
                return (userData.total || 0) >= 1;

            case 'total_count':
                return (userData.total || 0) >= (condition.value || 0);

            case 'daily_count':
                const today = TimeUtils.formatDate(TimeUtils.getUTC8Date());
                return (userData.daily_stats?.[today]?.count || 0) >= (condition.value || 0);

            case 'monthly_count':
                const month = TimeUtils.getMonthString(TimeUtils.getUTC8Date());
                return (userData.monthly_stats?.[month]?.count || 0) >= (condition.value || 0);

            case 'monthly_words':
                const month2 = TimeUtils.getMonthString(TimeUtils.getUTC8Date());
                return (userData.monthly_stats?.[month2]?.words || 0) >= (condition.value || 0);

            case 'total_words':
                return (userData.total_number_of_words || 0) >= (condition.value || 0);

            case 'daily_words':
                const today2 = TimeUtils.formatDate(TimeUtils.getUTC8Date());
                return (userData.daily_stats?.[today2]?.words || 0) >= (condition.value || 0);

            case 'active_days':
                return (userData.active_days || 0) >= (condition.value || 0);

            case 'max_continuous_days':
                return (userData.continuous_days || 0) >= (condition.value || 0);

            case 'text_contains':
                // 简化版：只支持简单的文本包含检查
                const text = this.dataAdapter.getRecentMessageText(groupId, userId);
                if (!text || !condition.value) return false;
                
                if (Array.isArray(condition.value)) {
                    return condition.value.some(v => text.includes(String(v)));
                }
                return text.includes(String(condition.value));

            case 'night_time':
                // 夜间时段：22:00-06:00 (UTC+8)
                return this.isNightTime();

            case 'morning_time':
                // 早晨时段：06:00-09:00 (UTC+8)
                return this.isMorningTime();

            case 'time_window':
                // 时间窗口判断（用于节日等特定日期）
                return this.checkTimeWindow(condition, userData, groupId, userId);

            default:
                return false;
        }
    }

    /**
     * 设置用户显示成就
     */
    async setDisplayAchievement(groupId, userId, achievementId, achievementName, rarity, isManual = true) {
        return await this.dataAdapter.setDisplayAchievement(
            groupId, userId, achievementId, achievementName, rarity, isManual
        );
    }

    /**
     * 判断是否是夜间（UTC+8）
     */
    isNightTime() {
        const now = TimeUtils.getUTC8Date();
        const hour = now.getHours();
        return hour >= 22 || hour < 6;
    }

    /**
     * 判断是否是早晨（UTC+8）
     */
    isMorningTime() {
        const now = TimeUtils.getUTC8Date();
        const hour = now.getHours();
        return hour >= 6 && hour < 9;
    }

    /**
     * 检查时间窗口条件（用于节日等特定日期）
     * 支持两种模式：
     * 1. 实时判断：当前时间是否在时间窗口内（用于时段成就）
     * 2. 历史查询：查询历史数据判断是否在特定日期发言过（用于节日成就）
     */
    checkTimeWindow(condition, userData, groupId, userId) {
        try {
            const { start, end } = condition;
            if (!start || !end) return false;

            const now = TimeUtils.getUTC8Date();
            const nowMs = now.getTime();
            const currentYear = now.getFullYear();

            const parse = (s) => {
                if (typeof s !== 'string') return NaN;
                
                // 支持 MM-DDTHH:mm:ss 格式（自动添加当前年份，用于每年重复的节日）
                if (/^\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) {
                    const dateStr = `${currentYear}-${s}`;
                    return new Date(dateStr).getTime();
                }
                
                // ISO 格式：YYYY-MM-DDTHH:mm:ss
                if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
                    return new Date(s).getTime();
                }
                
                // 简单时间格式：HH:mm（用于时段判断）
                if (/^\d{2}:\d{2}$/.test(s)) {
                    const [hour, minute] = s.split(':').map(Number);
                    const date = new Date(now);
                    date.setHours(hour, minute, 0, 0);
                    return date.getTime();
                }
                
                // 其他格式使用 Date.parse
                return Date.parse(s);
            };

            const startMs = parse(start);
            const endMs = parse(end);

            if (!isFinite(startMs) || !isFinite(endMs)) {
                return false;
            }

            // 判断是否是节日格式（MM-DD格式，用于查询历史数据）
            const isFestivalFormat = /^\d{2}-\d{2}T/.test(start) && /^\d{2}-\d{2}T/.test(end);
            
            if (isFestivalFormat) {
                // 节日成就：查询历史数据
                // 提取日期部分（MM-DD）
                const startDateStr = start.split('T')[0]; // MM-DD
                const endDateStr = end.split('T')[0]; // MM-DD
                
                // 检查当前年份和去年是否在该日期范围内发言过
                const yearsToCheck = [currentYear, currentYear - 1];
                
                for (const year of yearsToCheck) {
                    // 构建日期字符串 YYYY-MM-DD
                    const [month, day] = startDateStr.split('-');
                    const checkDateStr = `${year}-${month}-${day}`;
                    
                    // 检查用户数据中是否有该日期的发言记录
                    if (userData && userData.daily_stats && userData.daily_stats[checkDateStr]) {
                        const dayStats = userData.daily_stats[checkDateStr];
                        if (dayStats.count > 0 || dayStats.words > 0) {
                            return true; // 在该日期发言过
                        }
                    }
                }
                
                return false; // 未在节日日期发言过
            } else {
                // 时段成就：实时判断当前时间
                // 如果 end < start，认为跨天
                let finalEndMs = endMs;
                if (endMs < startMs) {
                    const endDate = new Date(endMs);
                    endDate.setDate(endDate.getDate() + 1);
                    finalEndMs = endDate.getTime();
                }

                return nowMs >= startMs && nowMs <= finalEndMs;
            }
        } catch (err) {
            logger.error('[成就系统] time_window 条件判断失败:', err);
            return false;
        }
    }

    /**
     * 重新加载成就配置
     */
    reloadAchievements() {
        this.achievementDefinitions = null;
        this.definitionsLoaded = false;
        this.cacheTimestamp = 0;
    }
}

export { AchievementService };
export default AchievementService;
