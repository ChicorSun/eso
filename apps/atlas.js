import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import database from '../model/database.js'
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


  async showAtlas (e) {
    let name = this.e.message[0].text
    //logger.info(name)

    if(name.includes("/"))
    {
        return 0
    }

    if((name == "#图鉴") || (name == "#套装") || (name == "*套装"))
    {
      return this.showSetTips(e)
    }
    if((name == "*图鉴") || (name == "*技能") || (name == "#技能"))
    {
      return this.showSkillTips(e)
    }

    if(name.includes("#"))
    {
      await this.showSets(e)
    }
    else if(name.includes("*"))
    {
      await this.showSkills(e)
    }
  }

  async showSets (e) {
    let name = this.e.message[0].text
    let noMaxLimit = false
    let showEnglish = false
    let objSets = await database.name2index(name,1)
    let setNum = objSets.length
    if((name == "#神器") || (name == "#神器图鉴"))
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
      return await this.reply(`抱歉,无法理解您指的是什么`)
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
      //logger.info(objSets)
      for (let setKey of objSets) {
        setData = await database.updateData(setKey, 1)
      	if(setData.atlasData[1].name == name)
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
      
      let img = await this.cache(setData, setImg)
      await this.reply(img)
    }
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

  async showSkills (e) {
    //return await this.reply(`该功能暂不可用，作者@Chicor正在施工中...`)

    let name = this.e.message[0].text
    let noMaxLimit = false
    let showEnglish = false
    let objSkills = await database.name2index(name,2)
    let skillNum = objSkills.length

    //logger.info('skillNum:' + skillNum)
    //logger.info('objSkills:' + objSkills)

    if((objSkills[0] < 0) || (skillNum <= 0))
    {
      return await this.reply(`抱歉,无法理解您指的是什么`)
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
        if(skillData.atlasData[1].new_cn_name == name)
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

  async cache (data, cachedata) {
    let tmp = md5(JSON.stringify(data))
    if (cachedata.md5 == tmp) return cachedata.img

    //cachedata.img = 0
    cachedata.img = await puppeteer.screenshot('eso', data) /*html file saved in folder data/html/eso/ */
    cachedata.md5 = tmp

    return cachedata.img
  }
}
