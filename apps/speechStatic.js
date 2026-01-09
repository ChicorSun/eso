import fs from 'fs'
import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import Speech from '../model/speech.js'
import getimgs from '../model/getimgs.js'
import md5 from 'md5'
import AchievementService from '../model/AchievementService.js'
import AchievementDataAdapter from '../model/AchievementDataAdapter.js'
import { TimeUtils } from '../model/TimeUtils.js'
import { AchievementUtils } from '../model/AchievementUtils.js'

//发言榜榜单上限人数
let lul = 20

//speech结构体变量
let speechData = {
}

//cacheData to save img
let speechImg = {
  md5: '',
  img: ''
}

//cacheData to save chart img
let speechChartImg = {
  md5: '',
  img: ''
}

//cacheData to save achievements img
let achievementsImg = {
  md5: '',
  img: ''
}

export class speechStatic extends plugin {
    constructor () {
      super({
        name: 'ESO:发言次数统计',
        dsc: '发言次数统计',
        event: 'message',
        priority: -1,
        rule: [
          {
            reg: '',
            fnc: 'snots',
            log: false
          }, {
            reg: '^#发言榜(日榜|月榜|年榜)?$',
            fnc: 'speechTally'
          }, {
            reg: '^#发言统计$',
            fnc: 'speechStatistics'
          }, {
            reg: '^#发言成就(列表)?$',
            fnc: 'showAchievementList'
          }, {
            reg: '^#发言设置显示成就\\s+(.+)$',
            fnc: 'setDisplayAchievement'
          }
        ]
      })
      
      // 延迟初始化成就系统（减少启动开销）
      this.achievementService = null
      this.dataAdapter = null
      this.achievementCheckQueue = new Set()
      this.achievementCheckTimer = null
    }
    
    /**
     * 获取成就服务实例（延迟初始化）
     */
    getAchievementService() {
      if (!this.achievementService) {
        try {
          this.dataAdapter = new AchievementDataAdapter()
          this.achievementService = new AchievementService(this.dataAdapter)
        } catch (error) {
          logger.error('[ESO:发言统计] 初始化成就系统失败:', error)
          return null
        }
      }
      return this.achievementService
    }
    async speechTally(e) {
        let user_msg = e.msg.match(/^#发言榜(日榜|月榜|年榜)?$/)
        let data
        let isYear = user_msg[1] == '年榜'
        
        try {
            if(isYear) {
                // 处理12个月数据
                data = await this.getYearData(e.group_id)
            } else if(!user_msg[1] || user_msg[1] == `日榜`) {
                let date = await gettoday()
                data = fs.readFileSync(`./data/${e.group_id}_snots/${date}.json`, `utf-8`)
                data = JSON.parse(data)
            } else {
                let month = await getmonth()
                data = fs.readFileSync(`./data/${e.group_id}_snots/${month}.json`, `utf-8`)
                data = JSON.parse(data)
            }
        } catch {
            e.reply(`本群好像还没人说过话呢~`)
            return true
        }
        
        if(!data || data.length === 0) {
            e.reply(`本群好像还没人说过话呢~`)
            return true
        }
        
        data.sort((a, b) => b.number - a.number)
        data = data.slice(0, lul)
        
        if('done' != speechData.init)
        {
            let spData = await Speech.get(this.e, 'speech', 'speech', 'speechStatic')
            if (!spData)
            {
                logger.error('[ESO:发言次数统计] 初始化结构体失败')
                return
            }
            speechData = spData
            //logger.info('[ESO:图鉴] 初始化结构体变量')
        }
        if(isYear)
        {
            speechData.speechData[1].type = '(Last 12 Months)'
        }
        else if(!user_msg[1] || user_msg[1] == `日榜`)
        {
            speechData.speechData[1].type = '(Today)'
        }
        else
        {
            speechData.speechData[1].type = '(This Month)'
        }
        
        //logger.info(data)
        speechData.speechData[1].person = []

        let msg = [`本群发言榜${isYear ? '年榜' : (user_msg[1] || `日榜`)}如下:\n--------`]
        let paiming = 0
        let maxValue = 1
        for (let item of data) {
            let onePerson = {
                id: `id`,
                value: `100`,
                width: `390`,
                bar_color: 'rgb(58, 146, 254)',
                index: '',
                name: `name`
            };

            let imgPath = await getimgs.realpath(item.user_id, "avatar")
            onePerson.id = `../../../../../` + imgPath

            if(paiming == 0)
            {
                onePerson.width = 391
                maxValue = item.number
            }
            else
            {
                onePerson.width = 391*item.number/maxValue
            }

            onePerson.value = item.number
            
            if(paiming<9)
            {
                onePerson.index = `0${paiming+1}.`
            }
            else
            {
                onePerson.index = `${paiming+1}.`
            }

            onePerson.name = item.nickname
            if(item.nickname)
            {
                onePerson.name = item.nickname
            }
            else
            {
                onePerson.name = `qq${item.user_id}`
            }

            if (onePerson.name.length > 18) {
                onePerson.name = onePerson.name.substring(0, 18) + '...';
            }
            
            speechData.speechData[1].person.push(onePerson);
            paiming++
            msg.push(`\n第${paiming}名：${onePerson.name}·${item.number}次`)
        }
        //await e.reply(msg)

        //logger.info(speechData.speechData[1])
        let img = await this.cache(speechData, speechImg)
        await this.reply(img)
        return true
    }
    
    /**
     * 获取最近12个月的数据
     * @param {string} groupId 群号
     * @returns {Array} 合并后的数据数组
     */
    async getYearData(groupId) {
        return await getYearData(groupId);
    }
    
    /**
     * 发言统计 - 统计最近12个月中进入过前lul名的用户数据
     * @param {*} e 事件对象
     */
    async speechStatistics(e) {
        try {
            const months = await getLastTwelveMonths();
            const topUserIds = new Set(); // 用于存储所有进入过前lul名的用户ID（去重）
            const monthlyData = {}; // 存储每个月的数据
            
            // 第一步：遍历12个月，收集每个月前lul名用户的ID
            for (const month of months) {
                const filePath = `./data/${e.group_id}_snots/${month}.json`;
                try {
                    if (fs.existsSync(filePath)) {
                        let data = fs.readFileSync(filePath, 'utf-8');
                        data = JSON.parse(data);
                        
                        // 排序并取前lul名
                        data.sort((a, b) => b.number - a.number);
                        const topUsers = data.slice(0, lul);
                        
                        // 记录前lul名用户的ID
                        for (const user of topUsers) {
                            topUserIds.add(user.user_id);
                        }
                        
                        // 保存该月的完整数据
                        monthlyData[month] = data;
                    } else {
                        // 文件不存在，该月数据为空
                        monthlyData[month] = [];
                    }
                } catch (error) {
                    //logger.warn(`[ESO:发言统计] 读取${month}.json失败: ${error.message}`);
                    monthlyData[month] = [];
                }
            }
            
            // 第二步：统计每个ID在12个月中的发言数据
            const userIds = Array.from(topUserIds);
            const statistics = [];
            
            for (const userId of userIds) {
                const userStats = {
                    user_id: userId,
                    nickname: '',
                    monthly_data: {}
                };
                
                // 遍历12个月，统计该用户每个月的发言次数
                for (const month of months) {
                    const monthData = monthlyData[month] || [];
                    const userData = monthData.find(item => item.user_id === userId);
                    
                    if (userData) {
                        userStats.monthly_data[month] = userData.number;
                        // 使用最新的昵称
                        if (userData.nickname && (!userStats.nickname || userStats.nickname.startsWith('qq') || userStats.nickname.startsWith('用户'))) {
                            userStats.nickname = userData.nickname;
                        }
                    } else {
                        userStats.monthly_data[month] = 0;
                    }
                    
                    // 如果没有昵称，设置默认值
                    if (!userStats.nickname) {
                        userStats.nickname = `用户${userId}`;
                    }
                }
                
                statistics.push(userStats);
            }
            
            // 第三步：使用logger.info打印结果
            //logger.info('========== 发言统计结果 ==========');
            //logger.info(`统计时间范围: 最近12个月`);
            //logger.info(`统计用户数量: ${userIds.length}人（这些用户至少在某个月进入过前${lul}名）`);
            //logger.info(`月份列表: ${months.join(', ')}`);
            //logger.info('');
            
            for (const stat of statistics) {
                //logger.info(`用户ID: ${stat.user_id}`);
                //logger.info(`用户昵称: ${stat.nickname}`);
                //logger.info('各月发言次数:');
                
                for (const month of months) {
                    const count = stat.monthly_data[month] || 0;
                    //logger.info(`  ${month}: ${count}次`);
                }
                
                // 计算总计
                const total = Object.values(stat.monthly_data).reduce((sum, count) => sum + count, 0);
                //logger.info(`总计: ${total}次`);
                //logger.info('---');
            }
            
            //logger.info('========== 统计结束 ==========');
            
            // 第四步：准备折线图数据并生成图片
            if (statistics.length > 0) {
                // 准备月份标签（反转顺序，从最早到最新）
                const monthsReversed = [...months].reverse()
                
                // 找出第一个有数据的月份索引（删除前面所有数据为0的月份）
                let firstDataIndex = 0
                for (let i = 0; i < monthsReversed.length; i++) {
                    const month = monthsReversed[i]
                    // 检查是否有任何用户在该月有数据
                    const hasData = statistics.some(stat => (stat.monthly_data[month] || 0) > 0)
                    if (hasData) {
                        firstDataIndex = i
                        break
                    }
                }
                
                // 删除前面所有数据为0的月份
                const filteredMonths = monthsReversed.slice(firstDataIndex)
                const monthLabels = filteredMonths.map(month => {
                    const date = new Date(month + '-01')
                    const year = date.getFullYear()
                    const monthNum = date.getMonth() + 1
                    return `${year}-${monthNum.toString().padStart(2, '0')}`
                })
                
                // 准备用户数据（每个用户一条折线）
                const usersData = []
                const colors = [
                    'rgb(58, 146, 254)',   // 蓝色
                    'rgb(255, 99, 132)',   // 红色
                    'rgb(75, 192, 192)',   // 青色
                    'rgb(255, 206, 86)',   // 黄色
                    'rgb(153, 102, 255)',  // 紫色
                    'rgb(255, 159, 64)',   // 橙色
                    'rgb(54, 162, 235)',   // 蓝色2
                    'rgb(201, 203, 207)',  // 灰色
                    'rgb(255, 99, 255)',   // 粉色
                    'rgb(99, 255, 132)',   // 绿色
                    'rgb(255, 192, 203)',  // 浅粉色
                    'rgb(173, 216, 230)',  // 浅蓝色
                    'rgb(255, 218, 185)',  // 浅橙色
                    'rgb(221, 160, 221)',  // 浅紫色
                    'rgb(152, 251, 152)',  // 浅绿色
                    'rgb(255, 228, 196)',  // 浅黄色
                    'rgb(176, 224, 230)',  // 浅青色
                    'rgb(240, 128, 128)',  // 浅红色
                    'rgb(144, 238, 144)',  // 浅绿色2
                    'rgb(255, 182, 193)'   // 浅粉色2
                ]
                
                for (let i = 0; i < statistics.length; i++) {
                    const stat = statistics[i]
                    // 获取用户头像路径（与speechTally保持一致）
                    let imgPath = await getimgs.realpath(stat.user_id, "avatar")
                    // 提取文件名（去掉路径前缀，只保留文件名部分）
                    // getimgs.realpath 返回格式：./plugins/eso/resources/img/avatar/123456 或 ./plugins/eso/custome_resources/img/avatar/123456
                    // 需要提取出文件名部分，以便在模板中使用 {{pluResPath}}img/avatar/{{avatar}}.png 格式
                    let avatarFileName = imgPath.replace(/^.*[\\\/]/, '') // 提取文件名
                    // 如果提取失败或为空，使用stdin作为默认值
                    if (!avatarFileName || avatarFileName === '') {
                        avatarFileName = 'stdin'
                    }
                    
                    const userData = {
                        name: stat.nickname.length > 15 ? stat.nickname.substring(0, 15) + '...' : stat.nickname,
                        data: filteredMonths.map(month => stat.monthly_data[month] || 0),
                        color: colors[i % colors.length],
                        avatar: avatarFileName,
                        userId: stat.user_id
                    }
                    usersData.push(userData)
                }
                
                // 构建speechData结构
                const chartSpeechData = {
                    init: 'done',
                    saveId: 'speechChart',
                    cwd: process.cwd().replace(/\\/g, '/'),
                    tplFile: `./plugins/eso/resources/html/speech/speechChart.html`,
                    pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`,
                    headStyle: ``,
                    speechData: [
                        {
                            pic: 'bg2',
                            des: '发言统计'
                        },
                        {
                            title: 'Discussion Statistics',
                            type: '(Last 12 Months)',
                            months: monthLabels,
                            users: usersData
                        }
                    ]
                }
                
                // 生成图片
                let img = await this.cache(chartSpeechData, speechChartImg)
                await e.reply(img)
            } else {
                e.reply(`本群好像还没人说过话呢~`)
            }
            
            return true;
        } catch (error) {
            //logger.error(`[ESO:发言统计] 统计失败: ${error.message}`);
            if (error.stack) {
                //logger.error(`[ESO:发言统计] 错误堆栈: ${error.stack}`);
            }
            e.reply(`发言统计失败: ${error.message}`);
            return true;
        }
    }
    
    async snots(e){
        if(!fs.existsSync(`./data/${e.group_id}_snots`)) {
            fs.mkdirSync(`./data/${e.group_id}_snots`, { recursive: true })
        }
        
        // 提取消息文本和计算字数
        const messageText = this.extractMessageText(e)
        const wordCount = this.calculateWordCount(messageText)
        
        let data;
        let date = await gettoday()
        try {
            data = fs.readFileSync(`./data/${e.group_id}_snots/${date}.json`, `utf-8`)
            data = JSON.parse(data)
        } catch {
            data = []
        }
        let temp_data = []
        for (let item of data) {
            if(item.user_id == e.user_id) temp_data.push(item)
        }
        if (temp_data.length > 0) {
            await deljson(temp_data[0], `./data/${e.group_id}_snots/${date}.json`)
            temp_data[0].number++
            temp_data[0].words = (temp_data[0].words || 0) + wordCount
            await autochuli(temp_data, `./data/${e.group_id}_snots/${date}.json`)
        } else {
            let user_data = {
                user_id: e.user_id,
                nickname: e.sender.card || e.sender.nickname || `用户${e.user_id}`,
                number: 1,
                words: wordCount
            }
            data.push(user_data)
            data = JSON.stringify(data, null, 3)
            fs.writeFileSync(`./data/${e.group_id}_snots/${date}.json`, data, `utf-8`)
        }
        let month = await getmonth()
        try {
            data = fs.readFileSync(`./data/${e.group_id}_snots/${month}.json`, `utf-8`)
            data = JSON.parse(data)
        } catch {
            data = []
        }
        temp_data = []
        for (let item of data) {
            if(item.user_id == e.user_id) temp_data.push(item)
        }
        if(temp_data.length > 0) { 
            await deljson(temp_data[0], `./data/${e.group_id}_snots/${month}.json`)
            temp_data[0].number++
            temp_data[0].words = (temp_data[0].words || 0) + wordCount
            await autochuli(temp_data, `./data/${e.group_id}_snots/${month}.json`)
        } else {
            let user_data = {
                user_id: e.user_id,
                nickname: e.sender.card || e.sender.nickname || `用户${e.user_id}`,
                number: 1,
                words: wordCount
            }
            data.push(user_data)
            data = JSON.stringify(data, null, 3)
            fs.writeFileSync(`./data/${e.group_id}_snots/${month}.json`, data, `utf-8`)
        }
        
        // 成就系统检查（异步，不阻塞消息处理）
        this.checkAchievements(e, messageText).catch(err => {
            logger.error('[ESO:发言统计] 成就检查失败:', err)
        })
        
        return false
    }
    
    /**
     * 提取消息文本
     */
    extractMessageText(e) {
        if (typeof e.msg === 'string') return e.msg
        if (Array.isArray(e.msg)) {
            return e.msg.filter(item => item.type === 'text')
                .map(item => item.text || '').join('')
        }
        return ''
    }
    
    /**
     * 计算字数（简化版）
     */
    calculateWordCount(text) {
        if (!text || typeof text !== 'string') return 0
        // 移除空白字符后计算长度
        return text.trim().length
    }
    
    /**
     * 检查成就（批量处理，减少开销）
     */
    async checkAchievements(e, messageText) {
        const achievementService = this.getAchievementService()
        if (!achievementService || !this.dataAdapter) {
            return
        }
        
        const groupId = String(e.group_id)
        const userId = String(e.user_id)
        
        // 保存最新消息文本（用于文本匹配成就）
        this.dataAdapter.saveRecentMessage(groupId, userId, messageText)
        
        // 添加到检查队列（批量处理）
        this.achievementCheckQueue.add(`${groupId}_${userId}`)
        
        // 延迟检查（1秒后批量处理，减少频繁检查）
        if (this.achievementCheckTimer) {
            return
        }
        
        this.achievementCheckTimer = setTimeout(async () => {
            this.achievementCheckTimer = null
            const queue = Array.from(this.achievementCheckQueue)
            this.achievementCheckQueue.clear()
            
            for (const key of queue) {
                try {
                    const [gId, uId] = key.split('_')
                    const userData = await this.dataAdapter.getUserData(gId, uId)
                    if (userData) {
                        const newAchievements = await achievementService.checkAndUpdateAchievements(
                            gId, uId, userData
                        )
                        
                        // 输出成就解锁日志
                        if (newAchievements.length > 0) {
                            for (const achievement of newAchievements) {
                                logger.mark(`[ESO:发言统计] 🏆 ${userData.nickname || uId}(${uId}) 解锁成就: ${achievement.name || achievement.id}`)
                            }
                        }
                    }
                } catch (err) {
                    logger.error(`[ESO:发言统计] 成就检查失败 ${key}:`, err)
                }
            }
        }, 1000)
    }
    
    /**
     * 解析@用户信息
     */
    parseMentionedUser(e) {
        // 检查 e.at 属性（Yunzai-Bot 可能提供的简化属性）
        if (e.at && e.at !== e.user_id) {
            return {
                userId: String(e.at),
                isMentioned: true
            }
        }
        
        // 检查 e.message 数组中的 @ 消息
        if (e.message && Array.isArray(e.message)) {
            for (const item of e.message) {
                if (item.type === 'at' && item.qq && item.qq !== e.user_id) {
                    return {
                        userId: String(item.qq),
                        isMentioned: true
                    }
                }
            }
        }
        
        // 默认返回发送者
        return {
            userId: String(e.user_id),
            isMentioned: false
        }
    }
    
    /**
     * 获取用户显示名称
     */
    getUserDisplayName(userId, groupId, userData) {
        let displayName = userData?.nickname || `用户${userId}`
        
        try {
            // 尝试从群成员列表中获取用户信息
            if (typeof Bot !== 'undefined' && Bot.gml) {
                const userList = Bot.gml.get(groupId)
                if (userList) {
                    const userInfo = userList.get(userId)
                    if (userInfo) {
                        displayName = userInfo.card || userInfo.nickname || userData?.nickname || `用户${userId}`
                        // 清理不可见字符
                        displayName = displayName.replace(/[^\p{L}\p{N}\p{P}\p{S}\p{Z}]/gu, '').trim()
                        if (!displayName) {
                            displayName = userData?.nickname || `用户${userId}`
                        }
                    }
                }
            }
        } catch (err) {
            // 如果获取失败，使用默认名称
            displayName = userData?.nickname || `用户${userId}`
        }
        
        return displayName
    }
    
    /**
     * 显示成就列表
     */
    async showAchievementList(e) {
        try {
            const achievementService = this.getAchievementService()
            if (!achievementService || !this.dataAdapter) {
                return e.reply('成就系统未初始化')
            }
            
            const groupId = String(e.group_id)
            
            // 解析目标用户（支持@用户）
            const targetUser = this.parseMentionedUser(e)
            const targetUserId = targetUser.userId
            
            // 获取用户数据（用于显示昵称）
            const userData = await this.dataAdapter.getUserData(groupId, targetUserId)
            const userNickname = this.getUserDisplayName(targetUserId, groupId, userData)
            
            // 获取所有成就定义
            const allDefinitions = achievementService.getAllAchievementDefinitions(groupId)
            
            // 获取用户的成就数据
            const userAchievements = await achievementService.getUserAchievements(groupId, targetUserId)
            
            // 获取显示成就信息
            const displayAchievement = userAchievements.displayAchievement
            
            // 分离已解锁和未解锁的成就
            const unlockedAchievements = []
            const lockedAchievements = []
            
            // 稀有度图标映射
            const rarityEmoji = {
                common: '🥉',
                uncommon: '🥈',
                rare: '🥇',
                epic: '💎',
                legendary: '👑',
                festival: '🎉'
            }
            
            for (const [id, definition] of Object.entries(allDefinitions)) {
                const achievementData = userAchievements.achievements[id]
                const isUnlocked = achievementData?.unlocked || false
                const unlockTime = achievementData?.unlocked_at || null
                
                const emoji = rarityEmoji[definition.rarity] || '🏆'
                const isDisplayed = displayAchievement && displayAchievement.id === id
                
                if (isUnlocked) {
                    // 格式化解锁时间
                    let formattedTime = ''
                    if (unlockTime) {
                        try {
                            const date = new Date(unlockTime)
                            const month = String(date.getMonth() + 1).padStart(2, '0')
                            const day = String(date.getDate()).padStart(2, '0')
                            const hour = String(date.getHours()).padStart(2, '0')
                            const minute = String(date.getMinutes()).padStart(2, '0')
                            formattedTime = `${month}-${day} ${hour}:${minute}`
                        } catch (err) {
                            formattedTime = unlockTime
                        }
                    }
                    
                    unlockedAchievements.push({
                        id,
                        name: definition.name,
                        description: definition.description || '暂无描述',
                        rarity: definition.rarity || 'common',
                        emoji: emoji,
                        unlockTime: formattedTime,
                        isDisplayed: isDisplayed
                    })
                } else {
                    lockedAchievements.push({
                        id,
                        name: definition.name,
                        description: definition.description || '暂无描述',
                        rarity: definition.rarity || 'common',
                        emoji: emoji
                    })
                }
            }
            
            // 已解锁成就排序：先按稀有度（低到高），再按解锁时间（新到旧）
            unlockedAchievements.sort((a, b) => {
                const orderA = AchievementUtils.getRarityOrder(a.rarity)
                const orderB = AchievementUtils.getRarityOrder(b.rarity)
                
                // 先按排序值升序
                if (orderA !== orderB) {
                    return orderA - orderB
                }
                
                // 排序值相同（如 legendary 和 festival），legendary 优先于 festival
                const rarityA = (a.rarity || '').toLowerCase()
                const rarityB = (b.rarity || '').toLowerCase()
                if (rarityA !== rarityB) {
                    // legendary 应该排在 festival 之前
                    if (rarityA === 'legendary' && rarityB === 'festival') {
                        return -1
                    }
                    if (rarityA === 'festival' && rarityB === 'legendary') {
                        return 1
                    }
                    // 其他情况按字母顺序
                    return rarityA.localeCompare(rarityB, 'en')
                }
                
                // 稀有度相同，按解锁时间倒序（新的在前）
                let timeA = 0
                let timeB = 0
                if (a.unlockTime) {
                    const dateA = new Date(a.unlockTime)
                    if (!isNaN(dateA.getTime())) {
                        timeA = dateA.getTime()
                    }
                }
                if (b.unlockTime) {
                    const dateB = new Date(b.unlockTime)
                    if (!isNaN(dateB.getTime())) {
                        timeB = dateB.getTime()
                    }
                }
                return timeB - timeA
            })
            
            // 未解锁成就排序：按稀有度（低到高），稀有度相同时按名称
            lockedAchievements.sort((a, b) => {
                const orderA = AchievementUtils.getRarityOrder(a.rarity)
                const orderB = AchievementUtils.getRarityOrder(b.rarity)
                
                // 先按排序值升序
                if (orderA !== orderB) {
                    return orderA - orderB
                }
                
                // 排序值相同（如 legendary 和 festival），legendary 优先于 festival
                const rarityA = (a.rarity || '').toLowerCase()
                const rarityB = (b.rarity || '').toLowerCase()
                if (rarityA !== rarityB) {
                    // legendary 应该排在 festival 之前
                    if (rarityA === 'legendary' && rarityB === 'festival') {
                        return -1
                    }
                    if (rarityA === 'festival' && rarityB === 'legendary') {
                        return 1
                    }
                    // 其他情况按字母顺序
                    return rarityA.localeCompare(rarityB, 'en')
                }
                
                // 稀有度相同，按名称排序
                return (a.name || '').localeCompare(b.name || '', 'zh-CN')
            })
            
            // 准备显示成就数据
            let displayAchievementData = null
            if (displayAchievement) {
                displayAchievementData = {
                    name: displayAchievement.name,
                    rarity: displayAchievement.rarity || 'common',
                    emoji: rarityEmoji[displayAchievement.rarity] || '🏆'
                }
            }
            
            // 获取用户头像（参考#发言榜和#发言统计的做法）
            let avatarFileName = 'stdin'
            try {
                let imgPath = await getimgs.realpath(targetUserId, "avatar")
                // 提取文件名（去掉路径前缀，只保留文件名部分）
                avatarFileName = imgPath.replace(/^.*[\\\/]/, '')
                if (!avatarFileName || avatarFileName === '') {
                    avatarFileName = 'stdin'
                }
            } catch (error) {
                logger.warn('[ESO:发言统计] 获取用户头像失败:', error)
            }
            
            // 读取成就配置，获取每个等级的颜色
            let rarityColors = {}
            try {
                const configPath = './plugins/eso/config/achievements-config.json'
                if (fs.existsSync(configPath)) {
                    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
                    if (config.rarities) {
                        for (const [rarity, data] of Object.entries(config.rarities)) {
                            rarityColors[rarity] = data.color || '#EEEDEE'
                        }
                    }
                }
            } catch (error) {
                logger.warn('[ESO:发言统计] 读取成就配置失败:', error)
                // 使用默认颜色
                rarityColors = {
                    common: '#EEEDEE',
                    uncommon: '#2CBC0C',
                    rare: '#3992FE',
                    epic: '#9F2DF6',
                    legendary: '#E4C228',
                    festival: '#FF6E00'
                }
            }
            
            // 为每个成就添加颜色信息
            unlockedAchievements.forEach(achievement => {
                achievement.color = rarityColors[achievement.rarity] || '#EEEDEE'
            })
            lockedAchievements.forEach(achievement => {
                achievement.color = rarityColors[achievement.rarity] || '#EEEDEE'
            })
            
            // 构建speechData结构（用于HTML模板）
            const achievementsSpeechData = {
                init: 'done',
                saveId: 'achievements',
                cwd: process.cwd().replace(/\\/g, '/'),
                tplFile: `./plugins/eso/resources/html/speech/achievements.html`,
                pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`,
                headStyle: `
                    <style>
                        * {
                            -webkit-font-smoothing: antialiased;
                            -moz-osx-font-smoothing: grayscale;
                            text-rendering: optimizeLegibility;
                        }
                    </style>
                `,
                speechData: [
                    {
                        pic: 'bg2',
                        des: '成就列表'
                    },
                    {
                        title: '🏆 成就列表',
                        userNickname: userNickname,
                        userAvatar: avatarFileName,
                        subtitle: `群 ${groupId}`,
                        unlockedCount: userAchievements.unlockedCount,
                        totalCount: Object.keys(allDefinitions).length,
                        displayAchievement: displayAchievementData,
                        unlockedAchievements: unlockedAchievements,
                        lockedAchievements: lockedAchievements
                    }
                ]
            }
            
            // 生成图片
            try {
                let img = await this.cache(achievementsSpeechData, achievementsImg)
                if (targetUser.isMentioned) {
                    return e.reply([
                        { type: 'at', qq: targetUserId },
                        img
                    ])
                } else {
                    return e.reply(img)
                }
            } catch (error) {
                logger.error('[ESO:发言统计] 生成成就列表图片失败:', error)
                // 回退到文本模式
                let text = `🏆 成就列表`
                if (targetUser.isMentioned) {
                    text += ` - ${userNickname}`
                }
                text += `\n\n`
                text += `解锁进度: ${userAchievements.unlockedCount} / ${Object.keys(allDefinitions).length} 个\n`
                
                if (displayAchievement) {
                    text += `当前佩戴: ${displayAchievementData.emoji} ${displayAchievement.name}\n`
                }
                text += `\n`
                
                if (unlockedAchievements.length > 0) {
                    text += `━━━━━━━━━━━━━━━━━━━━\n`
                    text += `✅ 已解锁成就 (${unlockedAchievements.length}个)\n`
                    text += `━━━━━━━━━━━━━━━━━━━━\n\n`
                    
                    for (const achievement of unlockedAchievements) {
                        text += `✅ ${achievement.emoji} ${achievement.name}${achievement.isDisplayed ? ' ⭐' : ''}\n`
                        text += `   ${achievement.description}\n`
                        if (achievement.unlockTime) {
                            text += `   解锁于: ${achievement.unlockTime}\n`
                        }
                        text += `\n`
                    }
                }
                
                if (lockedAchievements.length > 0) {
                    text += `━━━━━━━━━━━━━━━━━━━━\n`
                    text += `🔒 未解锁成就 (${lockedAchievements.length}个)\n`
                    text += `━━━━━━━━━━━━━━━━━━━━\n\n`
                    
                    for (const achievement of lockedAchievements) {
                        text += `🔒 ${achievement.emoji} ${achievement.name}\n`
                        text += `   ${achievement.description}\n\n`
                    }
                }
                
                if (targetUser.isMentioned) {
                    return e.reply([
                        { type: 'at', qq: targetUserId },
                        { type: 'text', text: `\n${text}` }
                    ])
                } else {
                    return e.reply(text)
                }
            }
        } catch (error) {
            logger.error('[ESO:发言统计] 显示成就列表失败:', error)
            return e.reply('查询失败，请稍后重试')
        }
    }
    
    /**
     * 设置显示成就
     */
    async setDisplayAchievement(e) {
        try {
            const achievementService = this.getAchievementService()
            if (!achievementService) {
                return e.reply('成就系统未初始化')
            }
            
            const match = e.msg.match(/^#发言设置显示成就\s+(.+)$/)
            if (!match) {
                return e.reply('格式错误，正确格式：#发言设置显示成就 [成就名]')
            }
            
            const achievementName = match[1].trim()
            const groupId = String(e.group_id)
            const userId = String(e.user_id)
            
            // 查找成就
            const definitions = achievementService.getAllAchievementDefinitions(groupId)
            let foundAchievement = null
            
            for (const [id, def] of Object.entries(definitions)) {
                if (def.name === achievementName || id === achievementName) {
                    foundAchievement = { id, ...def }
                    break
                }
            }
            
            if (!foundAchievement) {
                return e.reply(`未找到成就: ${achievementName}`)
            }
            
            // 检查是否已解锁
            const achievementData = await achievementService.getUserAchievements(groupId, userId)
            if (!achievementData.achievements[foundAchievement.id]?.unlocked) {
                return e.reply(`你尚未解锁成就: ${foundAchievement.name}`)
            }
            
            // 设置显示成就
            await achievementService.setDisplayAchievement(
                groupId,
                userId,
                foundAchievement.id,
                foundAchievement.name,
                foundAchievement.rarity || 'common',
                true
            )
            
            return e.reply(`✅ 已设置显示成就: ${foundAchievement.name}`)
        } catch (error) {
            logger.error('[ESO:发言统计] 设置显示成就失败:', error)
            return e.reply('设置失败，请稍后重试')
        }
    }

    async cache (data, cachedata) {
        let tmp = md5(JSON.stringify(data))
        if (cachedata.md5 == tmp) return cachedata.img

        //cachedata.img = 0
        cachedata.img = await puppeteer.screenshot('eso', data) /*html file saved in folder data/html/eso/ */
        cachedata.md5 = tmp

        return cachedata.img
    }
}

async function autochuli(data, filePath) {
    // number已在调用前递增，这里不需要再次递增
    let new_data = fs.readFileSync(filePath, `utf-8`)
    new_data = JSON.parse(new_data)
    new_data.push(data[0])
    new_data = JSON.stringify(new_data, null, 3)
    fs.writeFileSync(filePath, new_data)
}
/**
 * 删除JSON数组内容
 * @param {*} deldata 要删除的数据
 * @param {string} filePath 路径
 */
async function deljson(deldata, filePath) {
    try {
        let data = fs.readFileSync(filePath, 'utf-8');
        data = JSON.parse(data);
        if (!Array.isArray(data)) return false;
        let filteredData = []
        for (let item of data) {
            item = JSON.stringify(item)
            deldata = JSON.stringify(deldata)
            if(item != deldata) {
                item = JSON.parse(item)
                filteredData.push(item)
                deldata = JSON.parse(deldata)
            }
        }

        const tempData = JSON.stringify(filteredData, null, 3);
        fs.writeFileSync(filePath, tempData, 'utf-8');
        return true;
    } catch (error) {
        console.error('Error processing the file', error);
        return false;
    }
}

async function gettoday(){
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const day = currentDate.getDate().toString().padStart(2, '0');
    const date_time = `${year}-${month}-${day}`;
    return date_time;
}

async function getmonth() {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const date_time = `${year}-${month}`;
    return date_time;
}

/**
 * 获取最近12个月的月份列表
 * @returns {Array<string>} 月份数组，格式：['YYYY-MM', ...]
 */
async function getLastTwelveMonths() {
    const months = [];
    const currentDate = new Date();
    
    for (let i = 0; i < 12; i++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        months.push(`${year}-${month}`);
    }
    
    return months;
}

/**
 * 合并12个月的数据
 * @param {string} groupId 群号
 * @returns {Array} 合并后的数据数组
 */
async function getYearData(groupId) {
    const months = await getLastTwelveMonths();
    const userMap = new Map(); // 使用Map来累加每个用户的发言次数
    
    // 遍历每个月的文件
    for (const month of months) {
        const filePath = `./data/${groupId}_snots/${month}.json`;
        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf-8');
                const monthData = JSON.parse(data);
                
                // 累加每个用户的数据
                for (const item of monthData) {
                    if (userMap.has(item.user_id)) {
                        // 如果用户已存在，累加发言次数，更新昵称（使用最新的）
                        const existing = userMap.get(item.user_id);
                        existing.number += item.number;
                        // 如果新数据有昵称且旧数据没有，或者新数据昵称不是默认的，则更新
                        if (item.nickname && (!existing.nickname || existing.nickname.startsWith('qq') || existing.nickname.startsWith('用户'))) {
                            existing.nickname = item.nickname;
                        }
                    } else {
                        // 新用户，直接添加
                        userMap.set(item.user_id, {
                            user_id: item.user_id,
                            nickname: item.nickname || `用户${item.user_id}`,
                            number: item.number
                        });
                    }
                }
            }
            // 如果文件不存在，不处理（相当于该月数据为0，用户不会出现在结果中）
        } catch (error) {
            // 文件读取失败，跳过该月（相当于该月数据为0）
            continue;
        }
    }
    
    // 将Map转换为数组
    return Array.from(userMap.values());
}
