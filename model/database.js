import { createRequire } from 'module'
import Atlas from './atlas.js'
import fs from 'node:fs'

const require = createRequire(import.meta.url);

let dataExtractorItemsENPath = './plugins/eso/resources/data/DataExtractor-Items-en.lua'
let dataExtractorItemsCNPath = './plugins/eso/resources/data/DataExtractor-Items-cn.lua'

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
    var keysSet = Object.keys(setsData)
    var numSets = keysSet.length

    if (numSets > 10)
    {
      //logger.info("DataBaseEN is ready, no need to update.")
      return
    }

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

  async init_databaseCN () {
    var keysSet = Object.keys(setsDataCN)
    var numSets = keysSet.length

    if (numSets > 10)
    {
      //logger.info("DataBaseCN is ready, no need to update.")
      return
    }

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

  async skillsName2Index (name) {
    objSkills = [-1]
    logger.info("run skillsName2Index.")
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
      await this.skillsName2Index(name)
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
      logger.info('[ESO:图鉴] 初始化结构体变量')
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

  async updateSkillData (setKey) {
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