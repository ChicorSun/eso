import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import database from '../model/database.js'
import moment from 'moment'
import md5 from 'md5'

//装备图鉴结构体变量
let setData = {
}

//cacheData to save img
let setImg = {
  md5: '',
  img: ''
}

//技能图鉴结构体变量
let skillData = {
}

//cacheData to save img
let skillImg = {
  md5: '',
  img: ''
}

//食物图鉴结构体变量
let foodData = {
}

//cacheData to save img
let foodImg = {
  md5: '',
  img: ''
}

export class atlas extends plugin {
  constructor (e) {
    super({
      /** 功能名称 */
      name: 'ESO:图鉴',
      /** 功能描述 */
      dsc: '装备图鉴查询',
      event: 'message',
      /** 优先级，数字越小等级越高 */
      priority: 5001,
      /** 匹配不同的关键词 */
      rule: [
        {
          /** 命令正则匹配 */
          reg: '^#.*$',
          /** 执行方法 */
          fnc: 'showAtlas'
        }
      ]
    })
  }

  async skipBipu (e) {
    //await this.reply(`*哔噗！*`)
    return 0
  }

  async showSetTips (e) {
    await this.reply(`查看装备图鉴请使用\n`
                      +`#装备名+图鉴 的格式，如: \n`
                      +`#法力治愈图鉴(正常查询)\n`
                      +`#法力治愈(可省略"图鉴")\n`
                      +`#技能治愈(曾用名)\n`
                      +`#spc(常用简称)\n`
                      +`#治愈(模糊匹配)\n`
                      +`#太阳尖顶套装\n`
                      +`#太阳尖顶图鉴`)
  }

  async showSkillTips (e) {
    await this.reply(`查看技能图鉴请使用\n`
                      +`*技能名+图鉴 的格式，如: \n`
                      +`*法师之光图鉴(正常查询)\n`
                      +`*法师之光(可省略"图鉴")\n`
                      +`*法师(模糊匹配)\n`
                      +`*法会一(所在技能线位置)`)
  }

  async showFoodTips (e) {
    await this.reply(`查看食物图鉴请使用\n`
                      +`%食物名+图鉴 的格式，如: \n`
                      +`%强效巫母之酿图鉴(正常查询)\n`
                      +`%强效巫母之酿(可省略"图鉴")\n`
                      +`%巫母汤(常用简称)\n`
                      +`%巫母(模糊匹配)`)
  }


  async showAtlas (e) {
    let name = await this.trimText(e)
    //logger.info(name)

    if(name.includes("/"))
    {
        return 0
    }

    if((name == "*哔噗！*"))
    {
      return this.skipBipu(e)
    }
    if((name == "#图鉴") || (name == "#套装") || (name == "*套装") || (name == "%套装"))
    {
      return this.showSetTips(e)
    }
    if((name == "*图鉴") || (name == "*技能") || (name == "#技能") || (name == "%技能"))
    {
      return this.showSkillTips(e)
    }
    if((name == "%图鉴") || (name == "%食物") || (name == "#食物") || (name == "*食物"))
    {
      return this.showFoodTips(e)
    }

    if(name.includes("#"))
    {
      await this.showSets(e)
    }
    else if(name.includes("*"))
    {
      await this.showSkills(e)
    }
    else if(name.includes("%"))
    {
      await this.showFoods(e)
    }
  }

  async showSets (e) {
    let name = await this.trimText(e)
    let noMaxLimit = false
    let showEnglish = false
    let objSets = await database.name2index(name,1)
    let setNum = objSets.length
    if((name == "#神器") || (name == "#神器图鉴") || (name == "#怪物") || (name == "#怪物套") || (name == "#怪物图鉴") || (name == "#怪物套图鉴") || (name == "#爬塔") || (name == "#爬塔套") || (name == "#爬塔套图鉴"))
    {
      noMaxLimit = true
    }
    if(name.includes("英文") || name.includes("英语"))
    {
      showEnglish = true
    }

    //logger.info('setNum:' + setNum)
    //logger.info('objSets:' + objSets)
    if((objSets[0] < 0) || (setNum <= 0))
    {
      return await this.reply(`抱歉,无法理解您的意思\n您或许需要以*开头查询技能或以%开头查询食物`)
    }

    if((setNum >= 5 && setNum <= 20) || noMaxLimit)
    {
      let msgList = '我猜您想问的是以下装备之一？'
      for (let setKey of objSets) {
        setData = await database.updateData(setKey, 1)
        msgList += `\n#`+setData.atlasData[1].name+'图鉴'
      }
      msgList += `\n`+'图片太多，不再一一列出'
      await this.reply(msgList)
      //logger.info(name)
      for (let setKey of objSets) {
        setData = await database.updateData(setKey, 1)
      	if(('#' + setData.atlasData[1].name) == name)
      	{
      		await this.showSetsInfo([setKey], showEnglish)
      		break
      	}
      }

      return 1
    }

    if(setNum > 1 && setNum < 5)
    {
      let msgList = '我猜您想问的是以下装备之一？'
      for (let setKey of objSets) {
        setData = await database.updateData(setKey, 1)
        msgList += `\n#`+setData.atlasData[1].name+'图鉴'
      }
      await this.reply(msgList)
    }

    if(setNum == 1)
    {
      for (let setKey of objSets) {
        setData = await database.updateData(setKey, 1)
        logger.info(setData.atlasData[1].name)
      }
    }

    if(setNum >= 21 && noMaxLimit==0)
    {
      return await this.reply(`对不起，请描述的再详细一点`)
    }

    if(setNum <= 0 || setNum > 5)
    {
      return 1
    }

    await this.showSetsInfo(objSets, showEnglish)
  }

  async showSetsInfo (objSets, showEnglish) {
    for (let setKey of objSets) {
      //更新装备图鉴变量
      if(showEnglish)
      {
        setData = await database.updateData(setKey, 11)
      }
      else
      {
        setData = await database.updateData(setKey, 1)
      }
      
      // 如果装备类型为"副本"（type=6），添加无畏者副本日期信息
      //logger.info(setData.atlasData[1].type)
      if (setData.atlasData[1].type == "副本" || setData.atlasData[1].type == "怪物") {
        const undauntedDates = await this.getUndauntedDates(setData.atlasData[1].name)
        //logger.info(undauntedDates)
        if (undauntedDates.length > 0) {
          // 将无畏者日期数据添加到atlasData中
          setData.atlasData[1].undauntedDates = undauntedDates
        }
      }
      
      let img = await this.cache(setData, setImg)
      await this.reply(img)
    }
  }

  // 计算未来两次无畏者副本出现特定装备的日期
  async getUndauntedDates(setName) {
    try {
      // 获取无畏者数据库
      const setsData = await database.getSetsEN()
      const setsDataCN = await database.getSetsCN()
      const dgSetsTable = await database.getdgSets()
      const numDungeons = await database.getDgNum()

      // 无畏者副本序号校准码
      const adjust = [4, 4, 1]
      const num0 = 12
      const num1 = 12
      const num2 = numDungeons-24

      // 找到目标装备在dgSetsTable中的所有索引
      // 同一个装备可能出现在多个副本中
      const targetIndices = []
      
      // 遍历dgSetsTable找到目标装备的所有位置
      for (let i = 0; i < dgSetsTable.length; i++) {
        for (let j = 0; j < 4; j++) { // 每个副本有4个装备位置
          if (dgSetsTable[i][j] > 0) {
            const setId = dgSetsTable[i][j]
            const setNameFromId = setsDataCN[setId].name
            //logger.info(`检查装备 ${i}-${j}: ${setNameFromId} | 目标: ${setName}`)
            if (setNameFromId === setName) {
              //logger.info(`找到装备ID: ${setId} 在副本索引: ${i}`)
              if (!targetIndices.includes(i)) {
                targetIndices.push(i)
              }
            }
          }
        }
      }

      if (targetIndices.length === 0) {
        return []
      }

      // 计算当前日期
      const now = moment(new Date().getTime()).format('YYYY-MM-DD')
      const passSeconds = new Date().getTime() - 57600000
      const passDays = Math.floor((passSeconds - (passSeconds % 86400000)) / 86400000)

      // 收集所有可能的日期
      const allDates = []
      let checkDays = -2 // 从当前日期的前一天开始

      // 检查从昨天开始的365天内的无畏者副本
      while (checkDays < 365) {
        checkDays++
        
        // 计算第checkDays天的无畏者序号（checkDays=0是昨天，checkDays=1是今天）
        const targetDay = passDays + checkDays
        const t0 = (targetDay + adjust[0]) % num0
        const t1 = (targetDay + adjust[1]) % num1 + 12
        const t2 = (targetDay + adjust[2]) % num2 + 24

        // 检查是否匹配任何目标副本
        if (targetIndices.includes(t0) || targetIndices.includes(t1) || targetIndices.includes(t2)) {
          const targetDate = moment().add(checkDays, 'days').format('YYYY-MM-DD')
          const dayOfWeek = moment().add(checkDays, 'days').format('dddd')
          const dayOfWeekCN = this.getDayOfWeekCN(dayOfWeek)
          
          allDates.push(`${targetDate} (${dayOfWeekCN})`)
        }
      }

      // 去重并排序，取最早的两个不同日期
      const uniqueDates = [...new Set(allDates)]
      const sortedDates = uniqueDates.sort((a, b) => {
        const dateA = moment(a.split(' ')[0], 'YYYY-MM-DD')
        const dateB = moment(b.split(' ')[0], 'YYYY-MM-DD')
        return dateA.diff(dateB)
      })

      return sortedDates.slice(0, 2)
    } catch (error) {
      //logger.error(`[ESO:图鉴] 计算无畏者副本日期失败: ${error.message}`)
      return []
    }
  }

  // 获取中文星期名称
  getDayOfWeekCN(dayOfWeek) {
    const dayMap = {
      'Monday': '周一',
      'Tuesday': '周二', 
      'Wednesday': '周三',
      'Thursday': '周四',
      'Friday': '周五',
      'Saturday': '周六',
      'Sunday': '周日'
    }
    return dayMap[dayOfWeek] || dayOfWeek
  }

  async showSkills (e) {
    //return await this.reply(`该功能暂不可用，作者@Chicor正在施工中...`)

    let name = await this.trimText(e)
    let noMaxLimit = false
    let showEnglish = false
    let objSkills = await database.name2index(name,2)
    let skillNum = objSkills.length

    //logger.info('skillNum:' + skillNum)
    //logger.info('objSkills:' + objSkills)

    if((objSkills[0] < 0) || (skillNum <= 0))
    {
      return await this.reply(`抱歉,无法理解您的意思\n您或许需要以#开头查询装备或以%开头查询食物`)
    }

    if(name.includes("英文") || name.includes("英语"))
    {
      showEnglish = true
    }


    if((skillNum >= 4 && skillNum <= 25) || noMaxLimit)
    {
      let msgList = '我猜您想问的是以下技能之一？'
      for (let skillKey of objSkills) {
        skillData = await database.updateData(skillKey, 2)
        msgList += `\n*`+skillData.atlasData[1].new_cn_name+'图鉴'
      }
      msgList += `\n`+'图片太多，不再一一列出'
      await this.reply(msgList)
      for (let skillKey of objSkills) {
        skillData = await database.updateData(skillKey, 2)
        if(('*' + skillData.atlasData[1].new_cn_name) == name)
        {
          await this.showSkillsInfo([skillKey], showEnglish)
          break
        }
      }

      return 1
    }

    if(skillNum > 1 && skillNum < 4)
    {
      let msgList = '我猜您想问的是以下技能之一？'
      for (let skillKey of objSkills) {
        skillData = await database.updateData(skillKey, 2)
        msgList += `\n*`+skillData.atlasData[1].new_cn_name+'图鉴'
      }
      await this.reply(msgList)
    }

    if(skillNum >= 26 && noMaxLimit==0)
    {
      return await this.reply(`对不起，请描述的再详细一点`)
    }

    if(skillNum <= 0 || skillNum > 4)
    {
      return 1
    }

    await this.showSkillsInfo(objSkills, showEnglish)
  }

  async showSkillsInfo (objSets, showEnglish) {
    for (let skillKey of objSets) {
      //更新技能图鉴变量
      if(showEnglish)
      {
        skillData = await database.updateData(skillKey, 21)
      }
      else
      {
        skillData = await database.updateData(skillKey, 2)
      }
      
      let img = await this.cache(skillData, skillImg)
      await this.reply(img)
    }
  }

  async showFoods (e) {
    //return await this.reply(`该功能暂不可用，作者@Chicor正在施工中...`)

    let name = await this.trimText(e)
    let noMaxLimit = false
    let showEnglish = false
    let objFoods = await database.name2index(name,3)
    let foodNum = objFoods.length

    //logger.info('foodNum:' + foodNum)
    //logger.info('objFoods:' + objFoods)

    if((objFoods[0] < 0) || (foodNum <= 0))
    {
      return await this.reply(`抱歉,无法理解您的意思\n您或许需要以#开头查询装备或以*开头查询技能`)
    }

    if(name.includes("英文") || name.includes("英语"))
    {
      showEnglish = true
    }

    
    if((foodNum >= 4 && foodNum <= 25) || noMaxLimit)
    {
      let msgList = '我猜您想问的是以下食物之一？'
      for (let foodKey of objFoods) {
        foodData = await database.updateData(foodKey, 6)
        msgList += `\n%`+foodData.atlasData[1].new_cn_name+'图鉴'
      }
      msgList += `\n`+'图片太多，不再一一列出'
      await this.reply(msgList)
      for (let foodKey of objFoods) {
        foodData = await database.updateData(foodKey, 6)
        if(('%' + foodData.atlasData[1].new_cn_name) == name)
        {
          await this.showFoodsInfo([foodKey], showEnglish)
          break
        }
      }

      return 1
    }

    if(foodNum > 1 && foodNum < 4)
    {
      let msgList = '我猜您想问的是以下食物之一？'
      for (let foodKey of objFoods) {
        foodData = await database.updateData(foodKey, 6)
        msgList += `\n%`+foodData.atlasData[1].new_cn_name+'图鉴'
      }
      await this.reply(msgList)
    }

    if(foodNum >= 26 && noMaxLimit==0)
    {
      return await this.reply(`对不起，请描述的再详细一点`)
    }

    if(foodNum <= 0 || foodNum > 4)
    {
      return 1
    }

    await this.showFoodsInfo(objFoods, showEnglish)
  }
  
  async showFoodsInfo (objFoods, showEnglish) {
    for (let foodKey of objFoods) {
      //更新食物图鉴变量
      if(showEnglish)
      {
        foodData = await database.updateData(foodKey, 61)
      }
      else
      {
        foodData = await database.updateData(foodKey, 6)
      }
      
      let img = await this.cache(foodData, foodImg)
      await this.reply(img)
    }
  }


  async trimText(e) {
    let text = '';
    for (let eachArry of e.message) {
        if ((typeof eachArry.type !== "undefined") && (eachArry.type === 'text')) {
            if (typeof eachArry.text !== "undefined") {
                text = eachArry.text;

                // 手动去掉开头的空格
                let firstNonSpacePos = 0;
                while (firstNonSpacePos < text.length && /\s/.test(text[firstNonSpacePos])) {
                    firstNonSpacePos++;
                }
                text = text.substring(firstNonSpacePos);
                break;
            }
        }
    }

    return text;
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
