import { createRequire } from 'module'
import Atlas from './atlas.js'
import Skills from './skills.js'
import fs from 'node:fs'

const require = createRequire(import.meta.url);

let dataExtractorItemsENPath = './plugins/eso/resources/data/DataExtractor-Items-en.lua'
let dataExtractorItemsCNPath = './plugins/eso/resources/data/DataExtractor-Items-cn.lua'
let dataExtractorSkillsENPath = './plugins/eso/resources/data/DataExtractor-Skills-en.lua'
let dataExtractorSkillsCNPath = './plugins/eso/resources/data/DataExtractor-Skills-cn.lua'

//数据库
let setsData = [{
}]
let recipesData = [{
}]
let furnituresData = [{
}]
let collfurnituresData = [{
}]
let skillsData = [{
}]

let setsDataCN = [{
}]
let recipesDataCN = [{
}]
let furnituresDataCN = [{
}]
let collfurnituresDataCN = [{
}]
let skillsDataCN = [{
}]

//装备别名数据库
let addrSet = [{
}]

//技能别名数据库
let addrSkill = [{
}]

//匹配到的项目序号的集合数组
let objSets = [-1]
let objSkills = [-1]

//技能ID转中文序号对照表
let skillID2IndexCN = {
  init: '-1',
}

//装备图鉴结构体变量
let setData = {
}
//技能图鉴结构体变量
let skillData = {
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

let setsBlackList = [
  "Armor of the Code",
  "Arms of the Ancestors",
  "Arms of Infernace",
  "The Destruction Suite",
  "Giant Spider",
  "Relics of the Physician, Ansur",
  "Relics of the Rebellion",
  "Treasures of the Earthforge",
  "Prophet's",
  "Broken Soul"
]

let numDungeons = 0
let dgList = [
  "Spindleclutch II",
  "The Banished Cells I",
  "Fungal Grotto II",
  "Spindleclutch I",
  "Darkshade Caverns II",
  "Elden Hollow I",
  "Wayrest Sewers II",
  "Fungal Grotto I",
  "The Banished Cells II",
  "Darkshade Caverns I",
  "Elden Hollow II",
  "Wayrest Sewers I",
  "Direfrost Keep",
  "Vaults of Madness",
  "Crypt of Hearts II",
  "City of Ash I",
  "Tempest Island",
  "Blackheart Haven",
  "Arx Corinium",
  "Selene's Web",
  "City of Ash II",
  "Crypt of Hearts I",
  "Volenfell",
  "Blessed Crucible",
  "Imperial City Prison",
  "Ruins of Mazzatun",
  "White-Gold Tower",
  "Cradle of Shadows",
  "Bloodroot Forge",
  "Falkreath Hold",
  "Fang Lair",
  "Scalecaller Peak",
  "Moon Hunter Keep",
  "March of Sacrifices",
  "Depths of Malatar",
  "Frostvault",
  "Moongrave Fane",
  "Lair of Maarselok",
  "Icereach",
  "Unhallowed Grave",
  "Stone Garden",
  "Castle Thorn",
  "Black Drake Villa",
  "The Cauldron",
  "Red Petal Bastion",
  "The Dread Cellar",
  "Coral Aerie",
  "Shipwright's Regret",
  "Earthen Root Enclave",
  "Graven Deep",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA"
]

let dgSetsTable = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]

class database {
  async isInList (keyword, objectList) {
    var index = 0
    for (let sgOBJ of objectList) {
      if (keyword == sgOBJ)
      {
        return index
      }
      index = index + 1
    }
    return -1
  }

  async getSetsEN () {
    await this.init_database()
    return setsData
  }

  async getSetsCN () {
    await this.init_database()
    return setsDataCN
  }

  async getDgNum () {
    await this.init_database()
    return numDungeons
  }

  async getdgList () {
    await this.init_database()
    return dgList
  }

  async getdgSets () {
    await this.init_database()
    return dgSetsTable
  }

  async init_database () {
    await this.init_databaseEN()
    await this.init_databaseCN()

    await this.enhance_database()
    await this.init_databaseDG()
  }

  async enhance_database () {
    await this.enhance_setsData()
    await this.enhance_skillsData()
  }

  async enhance_setsData () {
    var keysSet = Object.keys(setsData)
    var numSets = keysSet.length

    for (let setKey of keysSet) {
      if(setsData[setKey].type == 15)
      {
        setsDataCN[setsData[setKey].id].place = "无尽档案塔"
      }

      if(setsData[setKey].name == "Undaunted Bastion")
      {
        if (setsData[setKey].styles.Apparel.Head.Light)
        {
          delete setsData[setKey].styles.Apparel.Head.Light
        }
        if (setsData[setKey].styles.Apparel.Head.Medium)
        {
          delete setsData[setKey].styles.Apparel.Head.Medium
        }
      }
      
      var indexInList = await this.isInList(setsData[setKey].name, setsBlackList)
      if(indexInList > -1)
      {
        //logger.info("||SetID:" + setKey + " name:" + setsDataCN[setsData[setKey].id].name + " " + " <"+setsData[setKey].name + ">")  
        delete setsData[setKey]
      }
    }
  }


  async enhance_skillsData () {
    if('done' == skillID2IndexCN.init)
    {
      //logger.info("skillID2IndexCN table is ready, no need to update.")
      return
    }

    //logger.info("Update skillID2IndexCN table.")
    let allSkillData = skillsDataCN
    var keysLine = Object.keys(allSkillData)
    var numLines = keysLine.length

    for (let lineKey of keysLine) {
      if(lineKey == 9)
      {
        continue
      }
      //logger.info('---' + allSkillData[lineKey].name)
      var keysClass = Object.keys(allSkillData[lineKey])
      var numClass = keysClass.length
      for (let classKey of keysClass) {
        if(classKey == "name")
        {
          continue
        }
        //logger.info('       |---' + allSkillData[lineKey][classKey].name)
        var keysSkill = Object.keys(allSkillData[lineKey][classKey].skills)
        var numSkill = keysSkill.length
        for (let skillKey of keysSkill) {
          if(skillKey == "name" || skillKey == "id" || allSkillData[lineKey][classKey].skills[skillKey].id == 0)
          {
            continue
          }
          var oneSkill = allSkillData[lineKey][classKey].skills[skillKey]
          skillID2IndexCN[oneSkill.id] = []
          skillID2IndexCN[oneSkill.id][0] = lineKey
          skillID2IndexCN[oneSkill.id][1] = classKey
          skillID2IndexCN[oneSkill.id][2] = skillKey
          skillID2IndexCN[oneSkill.id][3] = '0'
          if(oneSkill.passive == false)
          {
            skillID2IndexCN[oneSkill[1].id] = []
            skillID2IndexCN[oneSkill[1].id][0] = lineKey
            skillID2IndexCN[oneSkill[1].id][1] = classKey
            skillID2IndexCN[oneSkill[1].id][2] = skillKey
            skillID2IndexCN[oneSkill[1].id][3] = '1'

            skillID2IndexCN[oneSkill[2].id] = []
            skillID2IndexCN[oneSkill[2].id][0] = lineKey
            skillID2IndexCN[oneSkill[2].id][1] = classKey
            skillID2IndexCN[oneSkill[2].id][2] = skillKey
            skillID2IndexCN[oneSkill[2].id][3] = '2'
          }
        }
      }
    }
    skillID2IndexCN.init = 'done'
  }

  async init_databaseDG () {
    if (numDungeons > 0)
    {
      //logger.info("DataBaseDG is ready, no need to update.")
      return
    }
    //logger.info("Init ESOdataBaseDG")

    var dgIndex = 0
    var keysSet = Object.keys(setsData)
    var numSets = keysSet.length

    for (let setKey of keysSet) {
      if(setsData[setKey].type == 8)
      {
        var indexInList = await this.isInList(setsData[setKey].place.split(',')[0], dgList)
        if(indexInList > -1)
        {
          dgSetsTable[indexInList][0] = setsData[setKey].id
          //logger.info("[Y][No." + dgIndex + "]" + setsData[setKey].place.split(',')[0] + "|" + setsDataCN[setsData[setKey].id].place.split(',')[0] + "|")
        }
        else
        {
          dgSetsTable[dgIndex][0] = setsData[setKey].id
          //logger.info("[N][No." + dgIndex + "]" + setsData[setKey].place.split(',')[0] + "|" + setsDataCN[setsData[setKey].id].place.split(',')[0] + "|")
          dgList[dgIndex] = setsData[setKey].place.split(',')[0]
        }
        dgIndex = dgIndex+1
        //logger.info("[No." + dgIndex + "]SetID:" + setKey + " " + setsData[setKey].name + " [" + setsData[setKey].place + "]")
        //logger.info("[No." + dgIndex + "]" + setsData[setKey].place.split(',')[0] + "|" + setsDataCN[setsData[setKey].id].place.split(',')[0] + "|")
        //logger.info(setsDataCN[setsData[setKey].id].bonuses)
      }
    }
    numDungeons = dgIndex
    //logger.info("[EN]Num of dungeons is " + numDungeons)
    
    for (let setKey of keysSet) {
      if(setsData[setKey].type == 6)
      {
        for (let setPlace of setsData[setKey].place.split(',')) {
          var indexInList = await this.isInList(setPlace, dgList)
          if(indexInList > -1)
          {
            if (setsData[setKey].styles.Apparel.Head.Light)
            {
              dgSetsTable[indexInList][1] = setsData[setKey].id
              //logger.info("[L]" + setsDataCN[setsData[setKey].id].name + "|" + setPlace)
            }
            if (setsData[setKey].styles.Apparel.Head.Medium)
            {
              dgSetsTable[indexInList][2] = setsData[setKey].id
              //logger.info("[M]" + setsDataCN[setsData[setKey].id].name + "|" + setPlace)
            }
            if (setsData[setKey].styles.Apparel.Head.Heavy)
            {
              dgSetsTable[indexInList][3] = setsData[setKey].id
              //logger.info("[H]" + setsDataCN[setsData[setKey].id].name + "|" + setPlace)
            }
          }
        }
      }
    }
  }

  async init_databaseEN () {
    //Update english sets database
    var keysSet = Object.keys(setsData)
    var numSets = keysSet.length
    if (numSets > 10)
    {
      //logger.info("DataBaseEN is ready, no need to update.")
    }
    else
    {    
      //logger.info("Init ESOdataBaseEN")
      var luaToJson = require('lua-to-json')
      var luaSrc = fs.readFileSync(dataExtractorItemsENPath, 'utf8')
      var lua_code = luaToJson(luaSrc)
      var allAccounts = lua_code.DataExtractorSavedVariables.Default
      var accounts = Object.keys(allAccounts)
      var account_index = 0

      for (let account of accounts) {
        account_index = account_index+1
        if (account_index > 1)
          break

        //logger.info(account)
        var aData = allAccounts[account]['$AccountWide']
        var itemsData = aData.dataItems
        setsData = itemsData['Sets']
        recipesData = itemsData['Recipes']
        furnituresData = itemsData['Furniture']
        collfurnituresData = itemsData['CollectibleFurniture']
      }
    }

    //Update english skills database
    var keysSkill = Object.keys(skillsData)
    var numSkills = keysSkill.length
    //logger.info(numSkills)
    if (numSkills > 3)
    {
      //logger.info("SkillsDataEN is ready, no need to update.")
    }
    else
    {
      //logger.info("Init ESOskillsDataEN")
      var luaToJson = require('lua-to-json')
      var luaSrc = fs.readFileSync(dataExtractorSkillsENPath, 'utf8')
      var lua_code = luaToJson(luaSrc)
      var allAccounts = lua_code.DataExtractorSavedVariables.Default
      var accounts = Object.keys(allAccounts)
      var account_index = 0

      for (let account of accounts) {
        account_index = account_index+1
        if (account_index > 1)
          break

        //logger.info(account)
        var aData = allAccounts[account]['$AccountWide']
        skillsData = aData['dataSkills']
        //logger.info(skillsData)
      }
    }
  }

  async init_databaseCN () {
    //Update chinses sets database
    var keysSet = Object.keys(setsDataCN)
    var numSets = keysSet.length

    if (numSets > 10)
    {
      //logger.info("DataBaseCN is ready, no need to update.")
    }
    else
    {
      //logger.info("Init ESOdataBaseCN")
      var luaToJson = require('lua-to-json')
      var luaSrc = fs.readFileSync(dataExtractorItemsCNPath, 'utf8')
      var lua_code = luaToJson(luaSrc)
      var allAccounts = lua_code.DataExtractorSavedVariables.Default
      var accounts = Object.keys(allAccounts)
      var account_index = 0

      for (let account of accounts) {
        account_index = account_index+1
        if (account_index > 1)
          break

        //logger.info(account)
        var aData = allAccounts[account]['$AccountWide']
        var itemsData = aData.dataItems
        setsDataCN = itemsData['Sets']
        recipesDataCN = itemsData['Recipes']
        furnituresDataCN = itemsData['Furniture']
        collfurnituresDataCN = itemsData['CollectibleFurniture']
      }
    }

    //Update chinses skills database
    var keysSkill = Object.keys(skillsDataCN)
    var numSkills = keysSkill.length
    //logger.info(numSkills)
    if (numSkills > 3)
    {
      //logger.info("SkillsDataCN is ready, no need to update.")
    }
    else
    {
      //logger.info("Init ESOskillsDataCN")
      var luaToJson = require('lua-to-json')
      var luaSrc = fs.readFileSync(dataExtractorSkillsCNPath, 'utf8')
      var lua_code = luaToJson(luaSrc)
      var allAccounts = lua_code.DataExtractorSavedVariables.Default
      var accounts = Object.keys(allAccounts)
      var account_index = 0

      for (let account of accounts) {
        account_index = account_index+1
        if (account_index > 1)
          break

        //logger.info(account)
        var aData = allAccounts[account]['$AccountWide']
        skillsDataCN = aData['dataSkills']
        //logger.info(skillsDataCN)
      }
    }
  }

  async setsName2Index (keyword) {
    objSets = [-1]
    let name = keyword
    let enFindByPlace = true
    let enFindByMsg = true
    let enFindByType = false
    let onlyNormal = false
    let notAbbrSet = true
    let index = 0
    let isThisOne = false
    var keysSet = Object.keys(setsData)
    var numSets = keysSet.length
    let keyType = 0

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
    if((name == "#神器") || (name == "#神器图鉴"))
    {
      enFindByType = true
      keyType = 12
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
      //logger.info('[ESO:图鉴] 初始化装备别名对照表')
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
      if(enFindByType)
      {
        if(setsData[setKey].type == keyType)
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
  }

  async skillsName2Index (keyword, mode) {
    objSkills = [-1]
    let name = keyword
    let cnName = ''
    let cnWayOneName = ''
    let cnWayTwoName = ''
    /*
    let enFindByPlace = true
    let enFindByMsg = true
    let enFindByType = false
    */
    let notAbbrSkill = true
    let index = 0
    let isThisOne = false    
    let allSkillData = []
    let allList = ""
    let baseIndex = 1

    if(mode == 0)
    {
      //logger.info(name)
      name = name.replace("图鉴", "").replace("#", "").replace("*", "").replace("技能线", "").replace("技能", "")
      name = name.toLowerCase()
      name = name.replace("工会", "公会").replace("法会", "法师公会").replace("战会", "斗士公会").replace("战士公会", "斗士公会")
      name = name.replace("奶杖", "恢复法杖").replace("治疗杖", "恢复法杖")
      name = name.replace("1", "一").replace("2", "二").replace("3", "三").replace("4", "四").replace("5", "五").replace("6", "六")
      if(name.includes('杖') || name.includes('大') || name.includes('一') || name.includes('二') || name.includes('三') || name.includes('四') || name.includes('五') || name.includes('六'))
      {
        name = name.replace("毁灭杖", "毁灭法杖")
        if(!name.includes('杖'))
        {
          name = name.replace("毁灭", "毁灭法杖")
        }
      }
      if(name.length<4 && /^[A-Za-z]+$/.test(name))
      {
        notAbbrSkill = false
      }
      if('done' != addrSkill[0].init)
      {
        let data = await Skills.get(this.e, 'skills', 'abbrSkill', 'abbrSkill')
        addrSkill = data.atlasData
        //logger.info('[ESO:图鉴] 初始化技能别名对照表')
      }
    }


    if(mode == 1)//根据ID寻找中文索引
    {
      allSkillData = skillsDataCN

    }else
    {
      allSkillData = skillsData
    }
    var keysLine = Object.keys(allSkillData)
    var numLines = keysLine.length

    isThisOne = false
    allList = ''
    for (let lineKey of keysLine) {
      if(lineKey == 9)
      {
        continue
      }

      //logger.info('---' + allSkillData[lineKey].name)
      var keysClass = Object.keys(allSkillData[lineKey])
      var numClass = keysClass.length
      for (let classKey of keysClass) {
        if(classKey == "name")
        {
          continue
        }
        //logger.info('       |---' + allSkillData[lineKey][classKey].name)
        var keysSkill = Object.keys(allSkillData[lineKey][classKey].skills)
        var numSkill = keysSkill.length
        for (let skillKey of keysSkill) {
          if(skillKey == "name" || skillKey == "id" || allSkillData[lineKey][classKey].skills[skillKey].id == 0)
          {
            continue
          }
          var oneSkill = allSkillData[lineKey][classKey].skills[skillKey]
          if(mode == 1) //根据ID匹配
          {
            if(oneSkill.id == name)
            {
              isThisOne = true
              objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_0'
              index++
              //logger.info('              |---[' + lineKey + '_' + classKey + '_' + skillKey + '_0|' + oneSkill.id + ']' + oneSkill.name)
            }
            if(oneSkill.passive == false)
            {
              if(oneSkill[1].id == name)
              {
                isThisOne = true
                objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_1'
                index++
                //logger.info('                     |---[' + lineKey + '_' + classKey + '_' + skillKey + '_1|' + oneSkill[1].id + ']' + oneSkill[1].name)
              }
              if(oneSkill[2].id == name)
              {
                isThisOne = true
                objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_2'
                index++
                //logger.info('                     |---[' + lineKey + '_' + classKey + '_' + skillKey + '_2|' + oneSkill[2].id + ']' + oneSkill[2].name)
              }
            }
          }
          else if(mode == 0) //根据名称匹配
          {
            let cnID = skillID2IndexCN[oneSkill.id]
            let cnWayOneID = 0
            let cnWayTwoID = 0
            if(cnID[3] == '0')
            {
              cnName = skillsDataCN[cnID[0]][cnID[1]].skills[cnID[2]].name
            }
            else
            {
              cnName = skillsDataCN[cnID[0]][cnID[1]].skills[cnID[2]][cnID[3]].name
            }
            if(oneSkill.passive == false)
            {
              cnWayOneID = skillID2IndexCN[oneSkill[1].id]
              if(cnWayOneID[3] == '0')
              {
                cnWayOneName = skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].skills[cnWayOneID[2]].name
              }
              else
              {
                cnWayOneName = skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].skills[cnWayOneID[2]][cnWayOneID[3]].name
              }
              //--------------------------------------------------
              cnWayTwoID = skillID2IndexCN[oneSkill[2].id]
              if(cnWayTwoID[3] == '0')
              {
                cnWayTwoName = skillsDataCN[cnWayTwoID[0]][cnWayTwoID[1]].skills[cnWayTwoID[2]].name
              }
              else
              {
                cnWayTwoName = skillsDataCN[cnWayTwoID[0]][cnWayTwoID[1]].skills[cnWayTwoID[2]][cnWayTwoID[3]].name
              }
            }

            /*
            if(oneSkill.passive == false)
            {
              baseIndex = 1
              if(skillsDataCN[cnWayTwoID[0]][cnWayTwoID[1]].skills['1'].ultimate)
              {
                if(skillsDataCN[cnWayTwoID[0]][cnWayTwoID[1]].skills['2'].id)
                {
                  baseIndex = 1
                }
                else if(skillsDataCN[cnWayTwoID[0]][cnWayTwoID[1]].skills['3'].id)
                {
                  baseIndex = 2
                }
                else if(skillsDataCN[cnWayTwoID[0]][cnWayTwoID[1]].skills['4'].id)
                {
                  baseIndex = 3
                }
                else if(skillsDataCN[cnWayTwoID[0]][cnWayTwoID[1]].skills['5'].id)
                {
                  baseIndex = 4
                }
              }
              //--------------------------------------------------------
              allList += '- name: "' + oneSkill.name + '"\n'
              allList += '  cnName: "' + cnName + '"\n'
              allList += '  abbr:\n'
              if(oneSkill.ultimate)
              {
                allList += '    - "' + skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].name + '大招"\n'
              }
              else
              {
                let thisIndex = cnWayOneID[2] - baseIndex
                allList += '    - "' + skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].name + thisIndex + '"\n'
              }
              //--------------------------------------------------------
              allList += '- name: "' + oneSkill[1].name + '"\n'
              allList += '  cnName: "' + cnWayOneName + '"\n'
              allList += '  abbr:\n'
              if(oneSkill.ultimate)
              {
                allList += '    - "' + skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].name + '大招"\n'
              }
              else
              {
                let thisIndex = cnWayOneID[2] - baseIndex
                allList += '    - "' + skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].name + thisIndex + '"\n'
              }
              //--------------------------------------------------------
              allList += '- name: "' + oneSkill[2].name + '"\n'
              allList += '  cnName: "' + cnWayTwoName + '"\n'
              allList += '  abbr:\n'
              if(oneSkill.ultimate)
              {
                allList += '    - "' + skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].name + '大招"\n'
              }
              else
              {
                let thisIndex = cnWayOneID[2] - baseIndex
                allList += '    - "' + skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].name + thisIndex + '"\n'
              }
              //--------------------------------------------------------
            }
            */
            
            if(notAbbrSkill && (oneSkill.name.toLowerCase().includes(name) || cnName.includes(name)))
            {
              isThisOne = true
              objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_0'
              index++
              //logger.info('              |---[' + lineKey + '_' + classKey + '_' + skillKey + '_0|' + oneSkill.id + ']' + oneSkill.name + '|' + cnName)
            }
            else
            {
              isThisOne = false
              let srcName = name
              let abbrIndex = -1
              for (let eachAbbr of addrSkill) {
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
                      if(oneSkill.name.toLowerCase() == eachAbbr.name.toLowerCase())
                      {
                        isThisOne = true
                        objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_0'
                        index++
                        break;
                      }
                    }
                  }
                }
              }
            }
            if(oneSkill.passive == false)
            {
              if(notAbbrSkill && (oneSkill[1].name.toLowerCase().includes(name) || cnWayOneName.includes(name)))
              {
                isThisOne = true
                objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_1'
                index++
                //logger.info('                     |---[' + lineKey + '_' + classKey + '_' + skillKey + '_1|' + oneSkill[1].id + ']' + oneSkill[1].name + '|' + cnWayOneName)
              }
              else
              {
                isThisOne = false
                let srcName = name
                let abbrIndex = -1
                for (let eachAbbr of addrSkill) {
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
                        if(oneSkill[1].name.toLowerCase() == eachAbbr.name.toLowerCase())
                        {
                          isThisOne = true
                          objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_1'
                          index++
                          break;
                        }
                      }
                    }
                  }
                }
              }

              if(notAbbrSkill && (oneSkill[2].name.toLowerCase().includes(name) || cnWayTwoName.includes(name)))
              {
                isThisOne = true
                objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_2'
                index++
                //logger.info('                     |---[' + lineKey + '_' + classKey + '_' + skillKey + '_2|' + oneSkill[2].id + ']' + oneSkill[2].name + '|' + cnWayTwoName)
              }
              else
              {
                isThisOne = false
                let srcName = name
                let abbrIndex = -1
                for (let eachAbbr of addrSkill) {
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
                        if(oneSkill[2].name.toLowerCase() == eachAbbr.name.toLowerCase())
                        {
                          isThisOne = true
                          objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_2'
                          index++
                          break;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    //logger.info(allList)
  }

  async name2index (name, type) {
    await this.init_database()
    let ret = []
    if(type == 1) //this is name for sets
    {
      await this.setsName2Index(name)
      return objSets
    }
    if(type == 2) //this is name for skills
    {
      await this.skillsName2Index(name, 0)
      return objSkills
    }

    return ret
  }

  async updateSetData (setKey) {
    if('done' != setData.init)
    {
      let data = await Atlas.get(this.e, 'atlas', 'set', 'sets')
      if (!data)
      {
        logger.error('[ESO:图鉴] 初始化结构体失败')
        return
      }
      setData = data
      //logger.info('[ESO:图鉴] 初始化结构体变量')
    }

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
  }

  async updateSkillData (objects) {
    let enID = []
    let cnID = []
    let newENSkillData = []
    let newCNSkillData = []
    let srcENSkillData = []
    let srcCNSkillData = []

    //logger.info(objects)

    if('done' != skillData.init)
    {
      let data = await Skills.get(this.e, 'skills', 'skill', 'skills')
      if (!data)
      {
        logger.error('[ESO:图鉴] 初始化技能结构体失败')
        return
      }
      skillData = data
      logger.info('[ESO:图鉴] 初始化技能结构体变量')
    }

    enID = objects.split('_')

    if(enID[3] == '0')
    {
      newENSkillData = skillsData[enID[0]][enID[1]].skills[enID[2]]
      cnID = skillID2IndexCN[newENSkillData.id]
      newCNSkillData = skillsDataCN[cnID[0]][cnID[1]].skills[cnID[2]]
    }
    else
    {
      newENSkillData = skillsData[enID[0]][enID[1]].skills[enID[2]][enID[3]]
      cnID = skillID2IndexCN[newENSkillData.id]
      newCNSkillData = skillsDataCN[cnID[0]][cnID[1]].skills[cnID[2]][cnID[3]]
    }
    srcENSkillData = skillsData[enID[0]][enID[1]].skills[enID[2]]
    srcCNSkillData = skillsDataCN[cnID[0]][cnID[1]].skills[cnID[2]]

    /*
    logger.info(srcENSkillData.name)
    logger.info(srcCNSkillData.name)
    logger.info(newENSkillData.name)
    logger.info(newCNSkillData.name)
    */
    
    skillData.atlasData[1].src_icon = srcENSkillData.icon.split('.')[0].split('icons/')[1]
    skillData.atlasData[1].new_icon = newENSkillData.icon.split('.')[0].split('icons/')[1]
    let isExist = "不存在"
    let imgPath = `./plugins/eso/resources/img/skills/${skillData.atlasData[1].src_icon}.png`
    if (fs.existsSync(imgPath)) {
      isExist = "存在"
    }
    else
    {
      let url = `https://eso-hub.com/storage/icons/${skillData.atlasData[1].src_icon}.png`
      let dstpath = `./plugins/eso/resources/img/skills/${skillData.atlasData[1].src_icon}.png`
      let ret = await Bot.download(url, dstpath)
    }

    skillData.atlasData[1].src_cn_name = srcCNSkillData.name
    skillData.atlasData[1].src_en_name = '<' + srcENSkillData.name + '>'

    skillData.atlasData[1].new_cn_name = newCNSkillData.name
    skillData.atlasData[1].new_en_name = '<' + newENSkillData.name + '>'


    skillData.atlasData[1].type_cn = skillsDataCN[cnID[0]].name
    skillData.atlasData[1].type_en = skillsData[enID[0]].name

    skillData.atlasData[1].place_cn = skillsDataCN[cnID[0]][cnID[1]].name
    skillData.atlasData[1].place_en = skillsData[enID[0]][enID[1]].name

    if(enID[3] == '0')
    {
      skillData.atlasData[1].src_Skills_class = 'src_Skills_middle_class'
      skillData.atlasData[1].arrow_class = 'arrow_class_hide'
      skillData.atlasData[1].new_Skills_class = 'new_Skills_class_hide'
    }
    else
    {
      skillData.atlasData[1].src_Skills_class = 'src_Skills_left_class'
      skillData.atlasData[1].arrow_class = 'arrow_class_show'
      skillData.atlasData[1].new_Skills_class = 'new_Skills_class_show'
    }

    if(newENSkillData.passive == false)
    {
      skillData.atlasData[1].parameter_class = 'parameter_class_show'
    }
    else
    {
      skillData.atlasData[1].parameter_class = 'parameter_class_hide'
    }

    //logger.info(newCNSkillData)
    if(enID[3] != '0' && (newENSkillData.passive == false))
    {
      skillData.atlasData[1].new_msg = await this.transColor(newCNSkillData.newEffect)
    }
    else
    {
      skillData.atlasData[1].new_msg = ''
    }
    
    skillData.atlasData[1].msg = await this.transColor(newCNSkillData.description)
    
    skillData.atlasData[1].p_name = []
    skillData.atlasData[1].p_value = []

    let index = 0
    /*---------------------------------------------------------------*/
    skillData.atlasData[1].p_name[index] = '消耗'
    if(newCNSkillData.ultimate)
    {
      skillData.atlasData[1].p_value[index] = newCNSkillData.cost + ' 终极点'
    }
    else
    {
      skillData.atlasData[1].p_value[index] = newCNSkillData.cost
    }
    index++
    /*---------------------------------------------------------------*/
    skillData.atlasData[1].p_name[index] = '施法时间'
    if(newCNSkillData.castTime > 0)
    {
      skillData.atlasData[1].p_value[index] = newCNSkillData.castTime/1000 + '秒'
    }
    else
    {
      skillData.atlasData[1].p_value[index] = '瞬发'
    }
    
    index++
    /*---------------------------------------------------------------*/
    skillData.atlasData[1].p_name[index] = '目标'
    skillData.atlasData[1].p_value[index] = newCNSkillData.target
    index++
    /*---------------------------------------------------------------*/
    if(newCNSkillData.duration > 0)
    {
      skillData.atlasData[1].p_name[index] = '持续时间'
      skillData.atlasData[1].p_value[index] = newCNSkillData.duration/1000 + '秒'
      index++
    }
    /*---------------------------------------------------------------*/
    if(newCNSkillData.radius > 0)
    {
      skillData.atlasData[1].p_name[index] = '技能范围'
      skillData.atlasData[1].p_value[index] = newCNSkillData.radius/100 + '米'
      index++
    }
    /*---------------------------------------------------------------*/
    if(newCNSkillData.maxRange > 0)
    {
      skillData.atlasData[1].p_name[index] = '施法距离'
      skillData.atlasData[1].p_value[index] = newCNSkillData.maxRange/100 + '米'
      index++
    }
    /*---------------------------------------------------------------*/
  }

  async updateData (setKey, type) {
    if(type == 1) //this is name for sets
    {
      await this.updateSetData(setKey)
      return setData
    }
    if(type == 2) //this is name for skills
    {
      await this.updateSkillData(setKey)
      return skillData
    }
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
}

export default new database()