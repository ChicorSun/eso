/**
 * 时间工具类（简化版，适合嵌入式设备）
 * 提供各种时间格式化和计算功能
 * 统一使用 UTC+8 时区
 */
class TimeUtils {
    /**
     * 获取 UTC+8 时区的当前时间
     * @returns {Date} UTC+8 时区的日期对象
     */
    static getUTC8Date() {
        const now = new Date();
        const utc8Offset = 8 * 60 * 60 * 1000;
        const utc8Timestamp = now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + utc8Offset;
        return new Date(utc8Timestamp);
    }

    /**
     * 获取当前日期时间的完整信息（UTC+8）
     * @returns {Object} 包含格式化日期时间和各种时间标识的对象
     */
    static getCurrentDateTime() {
        const now = this.getUTC8Date();
        return {
            timestamp: now.getTime(),
            formattedDate: this.formatDate(now),
            formattedTime: this.formatTime(now),
            formattedDateTime: this.formatDateTime(now),
            yearKey: now.getFullYear().toString(),
            monthKey: this.getMonthString(now),
            weekKey: this.getWeekNumber(now),
            year: now.getFullYear(),
            month: this.padZero(now.getMonth() + 1),
            day: this.padZero(now.getDate())
        };
    }

    /**
     * 格式化日期为 YYYY-MM-DD（UTC+8）
     */
    static formatDate(date) {
        return `${date.getFullYear()}-${this.padZero(date.getMonth() + 1)}-${this.padZero(date.getDate())}`;
    }

    /**
     * 格式化时间为 HH:mm:ss（UTC+8）
     */
    static formatTime(date) {
        return `${this.padZero(date.getHours())}:${this.padZero(date.getMinutes())}:${this.padZero(date.getSeconds())}`;
    }

    /**
     * 格式化完整日期时间为 YYYY-MM-DD HH:mm:ss（UTC+8）
     */
    static formatDateTime(date) {
        return `${this.formatDate(date)} ${this.formatTime(date)}`;
    }

    /**
     * 获取日期所在的ISO周数
     */
    static getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return `${d.getUTCFullYear()}-W${this.padZero(weekNo)}`;
    }

    /**
     * 获取月份格式化字符串
     */
    static getMonthString(date) {
        return `${date.getFullYear()}-${this.padZero(date.getMonth() + 1)}`;
    }

    /**
     * 数字补零
     */
    static padZero(num) {
        return num.toString().padStart(2, '0');
    }

    /**
     * 计算连续天数（简化版，从今天往前）
     * @param {Object} dailyStats 日统计数据对象，key 为日期字符串 YYYY-MM-DD
     * @param {boolean} maxStreak 是否计算最大连续天数
     * @returns {number} 连续天数
     */
    static calculateContinuousDays(dailyStats, maxStreak = true) {
        if (!dailyStats || Object.keys(dailyStats).length === 0) {
            return 0;
        }

        const now = this.getUTC8Date();
        let continuousDays = 0;
        let maxContinuousDays = 0;
        let currentStreak = 0;

        // 从今天开始往前检查（最多365天）
        for (let i = 0; i < 365; i++) {
            const checkDate = new Date(now);
            checkDate.setDate(checkDate.getDate() - i);
            const dateStr = this.formatDate(checkDate);
            
            const hasData = dailyStats[dateStr] && (dailyStats[dateStr].count > 0 || dailyStats[dateStr].words > 0);
            
            if (hasData) {
                currentStreak++;
                if (maxStreak) {
                    maxContinuousDays = Math.max(maxContinuousDays, currentStreak);
                } else {
                    continuousDays = currentStreak;
                }
            } else {
                if (!maxStreak && continuousDays > 0) {
                    break; // 遇到中断即停止
                }
                currentStreak = 0;
            }
        }

        return maxStreak ? maxContinuousDays : continuousDays;
    }
}

export { TimeUtils };
export default TimeUtils;
