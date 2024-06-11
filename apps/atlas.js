import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import database from '../model/database.js'
import Atlas from '../model/atlas.js'
import fs from 'node:fs'
import md5 from 'md5'

//数据库
let setsData = [{
}]

let setsDataCN = [{
}]

let numDungeons = 0
let dgList = [
]

let dgSetsTable = [
]

//装备别名数据库
let addrSet = [{
}]

//装备图鉴结构体变量
let setData = {
}

//cacheData to save img
let setImg = {
  md5: '',
  img: ''
}

let setType = [
  "竞技场",
  "PvP",
  "制造",
  "PvP",
  "PvP",

  "副本",
  "PvP",
  "怪物",
  "区域",
  "废弃",

  "试炼",
  "神话",
  "怪物",
  "怪物",
  "职业专属"
  ]

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
          reg: '^#*(图鉴|套装)$',
          /** 执行方法 */
          fnc: 'showSetTips'
        },
        {
          /** 命令正则匹配 */
          reg: '^#.*$',
          /** 执行方法 */
          fnc: 'showSet'
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

  async showSet () {
    await this.init_database()

    let enFindByPlace = true
    let enFindByMsg = true
    let onlyNormal = false
    let notAbbrSet = true
    let objSets = [-1]
    let index = 0
    let isThisOne = false
    var keysSet = Object.keys(setsData)
    var numSets = keysSet.length
    let name = this.e.message[0].text

    if(name.includes("图鉴") || name.includes("套装"))
    {
      enFindByPlace = true
      enFindByMsg = true
    }
    if(name.includes("熊头"))
    {
      enFindByPlace = false
      enFindByMsg = false
    }
    if(name.includes("普通"))
    {
      onlyNormal = true
    }
    name = name.replace("图鉴", "").replace("#", "").replace("套装", "").replace("套", "").replace("完美", "").replace("普通", "")
    name = name.toLowerCase()
    if(name.length<4 && /^[A-Za-z]+$/.test(name))
    {
      notAbbrSet = false
    }

    if(name == "爬塔")
    {
      name = "无尽档案塔"
    }
    if('done' != addrSet[0].init)
    {
      let data = await Atlas.get(this.e, 'atlas', 'abbrSet', 'abbrSet')
      addrSet = data.atlasData
      //logger.info('[ESO:图鉴] 初始化别名对照表')
    }

    for (let setKey of keysSet) {
      isThisOne = false
      if(notAbbrSet && (setsDataCN[setsData[setKey].id].name).toLowerCase().includes(name))
      {
        isThisOne = true
      }
      if(notAbbrSet && (setsData[setKey].name).toLowerCase().includes(name))
      {
        isThisOne = true
      }
      if(enFindByPlace)
      {
        if(notAbbrSet && (setsDataCN[setsData[setKey].id].place.split(',')[0]).toLowerCase().includes(name))
        {
          isThisOne = true
        }
        if(notAbbrSet && (setsData[setKey].place.split(',')[0]).toLowerCase().includes(name))
        {
          isThisOne = true
        }
      }

      let srcName = name
      let abbrIndex = -1
      for (let eachAbbr of addrSet) {
        if(isThisOne)
        {
          break;
        }
        abbrIndex += 1
        if(abbrIndex > 0)
        {
          //logger.info(eachAbbr.name)
          for (let eachAbbrName of eachAbbr.abbr) {
            //logger.info('---'+eachAbbrName)
            if(eachAbbrName.toLowerCase().includes(name))
            {
              if((setsDataCN[setsData[setKey].id].name).toLowerCase().includes(eachAbbr.name))
              {
                isThisOne = true
                break;
              }
              if(enFindByPlace)
              {
                if((setsDataCN[setsData[setKey].id].place.split(',')[0]).toLowerCase().includes(eachAbbr.name))
                {
                  isThisOne = true
                  break;
                }
              }
            }
          }
        }
      }

      if(isThisOne)
      {
        objSets[index] = setKey
        index++
      }
    }
    let setNum = index

    //如果要求显示普通版本的装备，去除结果中的完美版本
    if(setNum > 1 && onlyNormal)
    {
    	for (let i = 0; i < setNum; i++) {
    		//logger.info('[' + i + '|' + objSets[i] + ']' + setsDataCN[objSets[i]].name)
    		if(setsDataCN[objSets[i]].name.includes("完美"))
    		{
    			//logger.info('Delete [' + i + '|' + objSets[i] + ']' + setsDataCN[objSets[i]].name)
    			objSets.splice(i, 1)
    			i--
    			setNum--
    		}
    	}
    }
    else if(setNum > 1)//对于有完美版本的装备，只保留完美版本
    {
    	for (let i = 0; i < setNum; i++) {
    		//logger.info('[' + i + '|' + objSets[i] + ']' + setsDataCN[objSets[i]].name)
    		if(!setsDataCN[objSets[i]].name.includes("完美"))
    		{
    			let isNormal = false
    			let tmpObjName = setsDataCN[objSets[i]].name
    			tmpObjName = tmpObjName.replace("的", "").replace("的", "").replace("的", "")
    			let tmpName = '完美' + tmpObjName
    			for (let n = 0; n < setNum; n++) {
    				if(tmpName == setsDataCN[objSets[n]].name.replace("的", "").replace("的", "").replace("的", "")){
    					isNormal = true
    					break
    				}
    			}
    			if(isNormal)
    			{
    				//logger.info('Delete [' + i + '|' + objSets[i] + ']' + setsDataCN[objSets[i]].name)
    				objSets.splice(i, 1)
    				i--
    				setNum--
    			}
    		}
    	}

    }

    //logger.info('setNum:' + setNum)
    if((objSets[0] < 0) || (setNum <= 0))
    {
      return await this.reply(`抱歉,无法理解您指的是什么`)
    }
    if(setNum >= 5 && setNum <= 20)
    {
      let msgList = '我猜您想问的是以下装备之一？'
      for (let setKey of objSets) {
        msgList += `\n#`+setsDataCN[setsData[setKey].id].name+'图鉴'
      }
      msgList += `\n`+'图片太多，不再一一列出'
      await this.reply(msgList)
      //logger.info(objSets)
      for (let setKey of objSets) {
      	if(setsDataCN[setsData[setKey].id].name == name)
      	{
      		await this.showSetsInfo([setKey])
      		break
      	}
      }

      return 1
    }
    if(setNum > 1 && setNum < 22)
    {
      let msgList = '我猜您想问的是以下装备之一？'
      for (let setKey of objSets) {
        msgList += `\n#`+setsDataCN[setsData[setKey].id].name+'图鉴'
      }
      await this.reply(msgList)
    }
    if(setNum >= 22)
    {
      return await this.reply(`对不起，请描述的再详细一点`)
    }
    if(setNum > 1 && setNum < 2)
    {
      await this.reply(`我猜您想问的是以下装备之一？`)
      for (let setKey of objSets) {
        await this.reply(`#`+setsDataCN[setsData[setKey].id].name+'图鉴')
      }
    }

    if(setNum <= 0 || setNum > 5)
    {
      return 1
    }

    await this.showSetsInfo(objSets)
  }

  async showSetsInfo (objSets) {
    if('done' != setData.init)
    {
      let data = await Atlas.get(this.e, 'atlas', 'set', 'sets')
      if (!data)
      {
        logger.error('[ESO:图鉴] 初始化结构体失败')
        return
      }
      setData = data
      logger.info('[ESO:图鉴] 初始化结构体变量')
    }

    //for (let setKey of Object.keys(setsData)) {
    for (let setKey of objSets) {
      //更新装备图鉴变量
      setData.atlasData[1].name = setsDataCN[setsData[setKey].id].name
      setData.atlasData[1].name_en = '<'+setsData[setKey].name+'>'
      setData.atlasData[1].item_class = setsData[setKey].type
      setData.atlasData[1].type = setType[setsData[setKey].type - 1]

      if(setsData[setKey].type == 3)
      {
        setData.atlasData[1].weight = '自选护甲类型'
        setData.atlasData[1].icon = setsData[setKey].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      }
      else if((setsData[setKey].type == 8) || (setsData[setKey].type == 13) || (setsData[setKey].type == 14))
      {
        setData.atlasData[1].weight = '随机护甲类型'
        setData.atlasData[1].icon = setsData[setKey].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      }
      else
      {
        let tag = 0
        if (setsData[setKey].styles.Apparel)
        {
          if (setsData[setKey].styles.Apparel.Head)
          {
            if (setsData[setKey].styles.Apparel.Head.Heavy)
            {
              tag += 1
            }
            if (setsData[setKey].styles.Apparel.Head.Medium)
            {
              tag += 2
            }
            if (setsData[setKey].styles.Apparel.Head.Light)
            {
              tag += 4
            }
          }
          else
          {
            tag += 32
          }
        }
        else if (setsData[setKey].styles.Weapon)
        {
          tag += 8
        }
        else
        {
          tag += 16
        }

        if(tag == 1)
        {
          setData.atlasData[1].weight = '重甲'
          setData.atlasData[1].icon = setsData[setKey].styles.Apparel.Head.Heavy.icon.split('.')[0].split('icons/')[1]
        }
        else if(tag == 2)
        {
          setData.atlasData[1].weight = '中甲'
          setData.atlasData[1].icon = setsData[setKey].styles.Apparel.Head.Medium.icon.split('.')[0].split('icons/')[1]
        }
        else if(tag == 4)
        {
          setData.atlasData[1].weight = '轻甲'
          setData.atlasData[1].icon = setsData[setKey].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
        }
        else if(tag == 7)
        {
          setData.atlasData[1].weight = '随机护甲类型'
          setData.atlasData[1].icon = setsData[setKey].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
        }
        else if(tag == 32)
        {
          tag = 0
          setData.atlasData[1].weight = ''
          let apparelInfo = setsData[setKey].styles.Apparel
          var keysApparelInfo = Object.keys(apparelInfo)
          for (let apparelWeight of keysApparelInfo) {
            //logger.info(apparelInfo[apparelWeight])
            let apparelMsg = apparelInfo[apparelWeight]
            var keysApparelMsg = Object.keys(apparelMsg)
            for (let apparelType of keysApparelMsg) {
              if(apparelType == 'Heavy')
              {
                tag += 1
              }
              if(apparelType == 'Medium')
              {
                tag += 2
              }
              if(apparelType == 'Light')
              {
                tag += 4
              }
              //logger.info(apparelMsg[apparelType])
              setData.atlasData[1].icon = apparelMsg[apparelType].icon.split('.')[0].split('icons/')[1]
            }
          }
          if(tag == 1)
          {
            setData.atlasData[1].weight = '重甲'
          }
          else if (tag == 2)
          {
            setData.atlasData[1].weight = '中甲'
          }
          else if(tag == 4)
          {
            setData.atlasData[1].weight = '轻甲'
          }
          else if(tag == 7)
          {
            setData.atlasData[1].weight = '随机护甲类型'
          }
          else
          {
            if (setsData[setKey].styles.Weapon)
            {
              setData.atlasData[1].weight = '护符,武器'
            }
            else
            {
              setData.atlasData[1].weight = '护符'
            }
          }
        }
        else if(tag == 8)
        {
          setData.atlasData[1].weight = '武器'
          let weaponInfo = setsData[setKey].styles.Weapon
          var keysWeaponInfo = Object.keys(weaponInfo)
          for (let weaponWeight of keysWeaponInfo) {
            //logger.info(weaponInfo[weaponWeight])
            let weaponMsg = weaponInfo[weaponWeight]
            var keysWeaponMsg = Object.keys(weaponMsg)
            for (let weaponType of keysWeaponMsg) {
              //logger.info(weaponMsg[weaponType])
              setData.atlasData[1].icon = weaponMsg[weaponType].icon.split('.')[0].split('icons/')[1]
            }
          }
        }
        else
        {
          setData.atlasData[1].weight = ''
        }
      }     

      if(setsData[setKey].type == 12)
      {
        setData.atlasData[1].place = '考古'
        setData.atlasData[1].place_en = ''
      }
      else if(setsData[setKey].type == 2)
      {
        setData.atlasData[1].place = '角斗场'
        setData.atlasData[1].place_en = ''
      }
      else if(setsData[setKey].type == 6)
      {
        setData.atlasData[1].place = (setsDataCN[setsData[setKey].id].place.split(',')[0]).replace(" II", "").replace(" I", "")
        setData.atlasData[1].place_en = (setsData[setKey].place.split(',')[0]).replace(" II", "").replace(" I", "")
      }
      else
      {
        setData.atlasData[1].place = setsDataCN[setsData[setKey].id].place.split(',')[0]
        setData.atlasData[1].place_en = setsData[setKey].place.split(',')[0]
      }

      setData.atlasData[1].msg = await this.bonuses2msg(setsDataCN[setsData[setKey].id].bonuses)

      /*
        icon: gear_dunmer_heavy_head_d
        name: "中士的锁甲"
        name_en: "<Sergeant's Mail>"
        item_class: item_dungeon
        weight: "重甲"
        type: "副本"
        type_en: "<dungeon>"
        place: "途歇城下水道"
        place_en: "<Wayrest Sewers>"
        msg:
      */

      let isExist = "不存在"
      let imgPath = `./plugins/eso/resources/img/sets/${setData.atlasData[1].icon}.png`
      if (fs.existsSync(imgPath)) {
      	isExist = "存在"
      	//logger.info("["+setData.atlasData[1].item_class+" " + setData.atlasData[1].type +  "]<" + setData.atlasData[1].weight + ">" + setData.atlasData[1].name+setData.atlasData[1].name_en+" | " + setData.atlasData[1].icon + " | " + isExist)
      }
      else
      {
      	let url = `https://eso-hub.com/storage/icons/${setData.atlasData[1].icon}.png`
      	let dstpath = `./plugins/eso/resources/img/sets/${setData.atlasData[1].icon}.png`
      	let ret = await Bot.download(url, dstpath)
      	//logger.info("["+setData.atlasData[1].item_class+" " + setData.atlasData[1].type +  "]<" + setData.atlasData[1].weight + ">" + setData.atlasData[1].name+setData.atlasData[1].name_en+" | " + setData.atlasData[1].icon + " | " + isExist)
      }
      //logger.info("["+setData.atlasData[1].item_class+" " + setData.atlasData[1].type +  "]<" + setData.atlasData[1].weight + ">" + setData.atlasData[1].name+setData.atlasData[1].name_en+" | " + setData.atlasData[1].place + "<"+setData.atlasData[1].place_en+"> | " + setData.atlasData[1].icon)

      let img = await this.cache(setData, setImg)
      await this.reply(img)
    }
  }

  async init_database () {
    setsData   = await database.getSetsEN()
    setsDataCN = await database.getSetsCN()
    numDungeons   = await database.getDgNum()
    dgList   = await database.getdgList()
    dgSetsTable   = await database.getdgSets()
  }

  async bonuses2msg (bonuses) {
    let msg = []
    var msgIndex = 0
    var keysBonuses = Object.keys(bonuses)
    var numBonuses = keysBonuses.length

    for (let bonuseKey of keysBonuses) {
      msg[msgIndex] = await this.transColor(bonuses[bonuseKey])
      msgIndex = msgIndex + 1
    }

    //logger.info(msg)
    return msg
  }

  async transColor (source) {
    let msg = []
    var msgIndex = 0
    let colorMsgs = source.split('|c')

    for (let oneColor of colorMsgs) {
      if (msgIndex == 0)
      {
        msg = msg + oneColor
      }
      else
      {
        //msg = msg + "<div style=\"color:#" + oneColor.split('|r')[0].substring(0,6) + ";\">" + oneColor.split('|r')[0].slice(6) + "</div>" + oneColor.split('|r')[1]
        msg = msg + oneColor.split('|r')[0].slice(6) + oneColor.split('|r')[1]
      }
      //logger.info(oneColor)
      msgIndex = msgIndex + 1
    }

    //logger.info(msg)
    return msg
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
