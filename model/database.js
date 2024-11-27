import { createRequire } from 'module'
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

let setsDataCN = [{
}]
let recipesDataCN = [{
}]
let furnituresDataCN = [{
}]
let collfurnituresDataCN = [{
}]

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
}

export default new database()