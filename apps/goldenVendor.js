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
    let data = await General.get(this.e, 'eso', 'goldenVendor', 'goldenVendor')
    if (!data) return

    let now = moment(new Date().getTime()).format('YYYY'+'-'+'MM'+'-'+'DD').replace(/是0/g, "是").replace(/点0/g, "点")
    data.generalData[0].date = now

    /** 黄金商人接口地址 */
    let url = 'http://esolog.uesp.net/goldenVendor.php'
    /** 调用接口获取数据 */
    await this.reply('正在为您查询黄金商人，请等待(10s)...')

    let res = await fetch(url)

    /** 判断接口是否请求成功 */
    if (!res) {
      logger.error('[黄金商人] 接口请求失败')
      return await this.reply('自己查吧！老娘不伺候了!\nhttps://eso-hub.com/en/golden-vendor')
    }

    //logger.info('[黄金商人] 更新黄金商人信息')
    /** 解析接口结果 */
    
    let goldenData = await res.text()
    //logger.info(goldenData)

    goldenData = goldenData.split('uespesoGoldenItems')[1]
    goldenData = goldenData.split('uespesoGoldenItems')[0]
    //logger.info(goldenData)

    let tempDate = goldenData.split('<h4>')[1]
    tempDate = tempDate.split('<')[0].replace("Vendor Items for ", "").replace("December", "12").replace("November", "11").replace("October", "10").replace("September", "9").replace("August", "8").replace("July", "7").replace("June", "6").replace("May", "5").replace("April", "4").replace("December ", "12").replace("March", "3").replace("January", "1")
    let dataStr = tempDate.split(' ')
    data.generalData[1].group = dataStr[2] + '年' + dataStr[1] + '月' + dataStr[0] + '日'
    //logger.info(data.generalData[1].group)

    let goldenMsgs = goldenData.split('<li>')
    var msgIndex = 0
    let isFind = false

    let setsMsg = [];

    for (let oneMsg of goldenMsgs) {
      isFind = false
      if (msgIndex != 0)
      {
        //logger.info(oneMsg)

        let link = oneMsg.split("a href='")[1]
        link = link.split("' class=")[0]
        //logger.info(link)

        let price = oneMsg.split("-- ")[1]
        price = price.split("<")[0].replace("gp", "G").replace("(Bind on Equip)", "").replace("/", "|")
        //logger.info(price)

        let gearInfo = await this.getGearInfo(link)
        //logger.info(gearInfo)

        let setMsg = []
        let setMsgIndex = 0

        setMsg[setMsgIndex] = price
        setMsgIndex++

        for (let tip of gearInfo.msg) {
          setMsg[setMsgIndex] = tip
          setMsgIndex++
        }

        setsMsg.push({
          icon: gearInfo.icon,
          title: gearInfo.title,
          desc: gearInfo.desc,
          msg: setMsg,
          item_class: gearInfo.item_class
        });
      }
      msgIndex++
    }
    data.generalData[1].list = setsMsg

    return data
  }

  async getGearInfo (link) {
    /** 黄金商人物品详情地址 */
    let url = link
    /** 调用接口获取数据 */
    let setInfo = []

    let res = await fetch(url)

    /** 判断接口是否请求成功 */
    if (!res) {
      return -1
    }

    /** 解析接口结果 */
    let gearData = await res.text()
    //logger.info(gearData)
    gearData = gearData.split('<h2 id="esoil_rawdatalist">Raw Item Data</h2>')[1]
    gearData = gearData.split('</table>')[0]
    //logger.info(gearData)

    let setName = gearData.split("<td id='esoil_rawdata_setName'>")[1]
    setName = setName.split('<')[0]
    //logger.info(setName)

    let icon = gearData.split("icons/")[1]
    icon = icon.split('.png')[0]
    //logger.info(icon)
    let isExist = "不存在"
    let imgPath = `./plugins/eso/resources/img/sets/${icon}.png`
    if (fs.existsSync(imgPath)) {
      isExist = "存在"
      //logger.info("["+setData.atlasData[1].item_class+" " + setData.atlasData[1].type +  "]<" + setData.atlasData[1].weight + ">" + setData.atlasData[1].name+setData.atlasData[1].name_en+" | " + setData.atlasData[1].icon + " | " + isExist)
    }
    else
    {
      let url = `https://eso-hub.com/storage/icons/${icon}.png`
      let dstpath = `./plugins/eso/resources/img/sets/${icon}.png`
      let ret = await Bot.download(url, dstpath)
      //logger.info("["+setData.atlasData[1].item_class+" " + setData.atlasData[1].type +  "]<" + setData.atlasData[1].weight + ">" + setData.atlasData[1].name+setData.atlasData[1].name_en+" | " + setData.atlasData[1].icon + " | " + isExist)
    }

    let title = ''
    let desc = ''
    let msg = []
    let objSets = await database.name2index(setName,1)
    let setNum = objSets.length
    if((objSets[0] < 0) || (setNum <= 0))
    {
      return -1
    }
    let has_find = false
    for (let setKey of objSets) {
      let setData = await database.updateData(setKey, 1)
      name_en: "<Sergeant's Mail>"
      let gearNameEN = '<'+ setName + '>'
      desc = gearNameEN
      if(setData.atlasData[1].name_en.toLowerCase() == gearNameEN.toLowerCase())
      {
        title = setData.atlasData[1].name
        msg = setData.atlasData[1].msg
        //logger.info(setData.atlasData[1].name)
        has_find = true
        break
      }
    }
    if(!has_find)
    {
      title = ''
      desc = '<'+ setName + '>'
    }

    let item_class = 'item_split2 set_info_big'

    let gearInfo = {
      icon,
      title,
      desc,
      msg,
      item_class
      };

    return gearInfo
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
