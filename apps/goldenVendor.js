import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import General from '../model/general.js'
import database from '../model/database.js'
import fetch from 'node-fetch'
import moment from 'moment'
import fs from 'node:fs'
import md5 from 'md5'

let goldenData = {
  md5: '',
  img: ''
}

//黄金商人
let goldenSets = []

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

export class goldenVendor extends plugin {
  constructor () {
    super({
      /** 功能名称 */
      name: 'ESO:黄金商人',
      /** 功能描述 */
      dsc: '查询黄金商人的商品',
      event: 'message',
      /** 优先级，数字越小等级越高 */
      priority: 5000,
      rule: [
        {
          /** 命令正则匹配 */
          reg: '^#*(黄金商人)$',
          /** 执行方法 */
          fnc: 'goldenSets'
        }
      ]
    })
  }

  /**
   * #黄金商人
   * @提供黄金商人商品查询
   */
  async goldenSets (e) {
    let data = await this.updateGoldenSets()
    //logger.info(data.generalData[1].list)

    let img = await this.cache(data)
    await this.reply(img)
  }


  /**
   * @更新黄金商人
   */
  async updateGoldenSets (e) {
    await this.init_database()

    var keysSet = Object.keys(setsData)
    var numSets = keysSet.length

    let data = await General.get(this.e, 'eso', 'goldenVendor', 'goldenVendor')
    if (!data) return

  	/** 黄金商人接口地址 */
    let url = 'https://eso-hub.com/en/golden-vendor/'
    /** 调用接口获取数据 */
    await this.reply('正在为您查询，请稍后...')
    let res = await fetch(url)

    /** 判断接口是否请求成功 */
    if (!res) {
      logger.error('[黄金商人] 接口请求失败')
      return await this.reply('自己查吧！老娘不伺候了!\nhttps://eso-hub.com/en/golden-vendor')
    }

    //logger.info('[黄金商人] 更新黄金商人信息')
    /** 解析接口结果 */
    
    let goldenData = await res.text()
    let tempData = goldenData.split('col-md-9')[1]
    tempData = tempData.split('card mb-3')[1]
    let tempDate = tempData.split('small>')[1]
    tempDate = tempDate.split('<')[0]
    let goldenMsgs = tempData.split('<tr>')
    var msgIndex = 0
    let isFind = false

    data.generalData[1].group = tempDate
    //logger.info(data.generalData[1].group)

    let setsMsg = [];

    for (let oneMsg of goldenMsgs) {
      isFind = false
      if (msgIndex != 0)
      {
        let img = oneMsg.split('image/png')[1]
        img = img.split('">')[0]
        img = img.split('icons/')[1]
        img = img.split('.png')[0]

        let name = oneMsg.split('<a href="')[1]
        name = name.split('</a>')[0]
        name = name.split('>')[1]
        name = name.slice(1, -1)
        name = name.replace("&#039;s", "'s")

        let setID = ""
        for (let setKey of keysSet) {
          if(setsData[setKey].name == name)
          {
            setID = setsData[setKey].id
            isFind = true
            break
          }
        }

        let type = oneMsg.split('<span class="quality-')[1]
        if(!type)
        {
          type = oneMsg.split(' quality-')[1]
        }
        type = type.split('</')[0]
        type = type.split('>')[1]
        if(type.includes('Pauldrons')){type = '肩铠'}
        else if(type.includes('Epaulets')){type = '披肩'}
        else if(type.includes('Arm Cops')){type = '护肩'}
        else if(type.includes('Necklace')){type = '项链'}
        else if(type.includes('Ring')){type = '戒指'}
        else if(type.includes('Helm')){type = '头铠'}
        else if(type.includes('Hat')){type = '头盔'}
        else if(type.includes('Helmet')){type = '帽子'}
        else{type = '护甲'}

        let goldPrice = oneMsg.split('gold.png')[1]
        
        if(goldPrice.split('<br>')[1])
        {
          goldPrice = goldPrice.split('<br>')[0]
          goldPrice = goldPrice.split('> ')[1]
        }
        else
        {
          goldPrice = goldPrice.split('</')[0]
          goldPrice = goldPrice.split('>&nbsp;')[1]
        }
        

        let apPrice = oneMsg.split('alliance_points.png')[1]
        apPrice = apPrice.split('</td>')[0]
        //logger.info(apPrice)
        if(!apPrice.split('> ')[1])
        {
          apPrice = apPrice.split('>&nbsp;')[1]
          apPrice = apPrice.split('<')[0]
        }
        else
        {
          apPrice = apPrice.split('> ')[1]
        }
        apPrice = apPrice.slice(0, -1)

        if(isFind)
        {
          let imgPath = `./plugins/eso/resources/img/sets/${img}.png`
          if (!fs.existsSync(imgPath)) {
            let url = `https://eso-hub.com/storage/icons/${img}.png`
            //logger.info(url)
            let ret = await Bot.download(url, imgPath)
          }
          //logger.info(data.generalData[1].list[0])
          setsMsg.push({
            icon: img,
            title: "[" + type + "]" + setsDataCN[setID].name,
            desc: name + "    " + goldPrice + "G|" + apPrice + "AP",
            item_class: 'item_split2',
          });

          //data.generalData[1].list[msgIndex-1].icon = img
          //data.generalData[1].list[msgIndex-1].title = setsDataCN[setID].name
          //data.generalData[1].list[msgIndex-1].desc = name
          //data.generalData[1].list[msgIndex-1].item_class = 'item_split2'
          //logger.info("[" + type + "]Name:" + setsDataCN[setID].name + "<" + name + "> | " + img + "|" + goldPrice + "|" + apPrice)
        }
      }
      msgIndex++      
    }
    data.generalData[1].list = setsMsg

    return data
  }

  async init_database () {
    setsData   = await database.getSetsEN()
    setsDataCN = await database.getSetsCN()
    numDungeons   = await database.getDgNum()
    dgList   = await database.getdgList()
    dgSetsTable   = await database.getdgSets()
  }

  async cache (data) {
    let tmp = md5(JSON.stringify(data))
    if (goldenData.md5 == tmp) return goldenData.img

    //goldenData.img = 0
    goldenData.img = await puppeteer.screenshot('goldenVendor', data) /*html file saved in folder data/html/eso/ */
    goldenData.md5 = tmp

    return goldenData.img
  }
}
