import fs from 'fs'
import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import Speech from '../model/speech.js'
import getimgs from '../model/getimgs.js'
import md5 from 'md5'

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
          }
        ]
      })
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
                const monthLabels = monthsReversed.map(month => {
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
                        data: monthsReversed.map(month => stat.monthly_data[month] || 0),
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
            fs.mkdirSync(`./data/${e.group_id}_snots`)
        }
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
            await autochuli(temp_data, `./data/${e.group_id}_snots/${date}.json`)
        } else {
            let user_data = {
                user_id: e.user_id,
                nickname: e.sender.card || e.sender.nickname || `用户${e.user_id}`,
                number: 1
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
            await autochuli(temp_data, `./data/${e.group_id}_snots/${month}.json`)
        } else {
            let user_data = {
                user_id: e.user_id,
                nickname: e.sender.card || e.sender.nickname || `用户${e.user_id}`,
                number: 1
            }
            data.push(user_data)
            data = JSON.stringify(data, null, 3)
            fs.writeFileSync(`./data/${e.group_id}_snots/${month}.json`, data, `utf-8`)
        }
        return false
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
    data[0].number++
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
