import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import General from '../model/general.js'
import database, { isSetIndexResultEmpty } from '../model/database.js'
import getimgs from '../model/getimgs.js'
import fetch from 'node-fetch'
import moment from 'moment'
import fs from 'node:fs'
import md5 from 'md5'

/** 1=ESOCN API, 2=uesp 页面；失败后切换并重试一次 */
let src_mode = 2

const GOLDEN_VENDOR_API = 'https://api.esocn.com.cn/api/golden-vendor'
const UESP_GOLDEN_URL = 'http://esolog.uesp.net/goldenVendor.php'

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
    const data = await this.updateGoldenSets()
    if (!data) return

    const img = await this.cache(data)
    await this.reply(img)
  }

  /**
   * 更新黄金商人：按 src_mode 选源，失败则切换源重试一次，不向用户暴露来源
   */
  async updateGoldenSets () {
    const data = await General.get(this.e, 'eso', 'goldenVendor', 'goldenVendor')
    if (!data) return null

    const now = moment(Date.now()).format('YYYY-MM-DD').replace(/是0/g, '是').replace(/点0/g, '点')
    data.generalData[0].date = now

    await this.reply('正在为您查询黄金商人，请等待(10s)...')

    let result = null

    result = src_mode === 1 ? await this.fetchFromApi(data) : await this.fetchFromUesp(data)
    if (result) return result

    src_mode = src_mode === 1 ? 2 : 1
    result = src_mode === 1 ? await this.fetchFromApi(data) : await this.fetchFromUesp(data)
    if (result) return result

    await this.reply('自己查吧！老娘不伺候了!\nhttps://esocn.com.cn/golden-vendor')
    return null
  }

  /**
   * 从 ESOCN API 获取黄金商人数据
   */
  async fetchFromApi (data) {
    try {
      const res = await fetch(GOLDEN_VENDOR_API)
      if (!res || !res.ok) return null
      const json = await res.json()
      if (!json.success || !json.data || !Array.isArray(json.data.items)) return null

      const period = (json.data.time || '').trim() || ''
      data.generalData[1].group = period

      const setsMsg = []
      for (const it of json.data.items) {
        const setName = (it.setName || '').trim()
        const gp_str = (it.gp != null && it.gp !== '') ? String(it.gp).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + 'G' : ''
        const ap_str = (it.ap != null && it.ap !== '') ? String(it.ap).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' AP' : ''
        const gp_value = gp_str ? gp_str.replace(/\s*G\s*$/i, '').trim() : ''
        const ap_value = ap_str ? ap_str.replace(/\s*AP\s*$/i, '').trim() : ''

        const gearInfo = await this.getGearInfoFromSetName(setName, it.icon)
        if (!gearInfo) {
          let fallbackIcon = ''
          if (it.icon && typeof it.icon === 'string') {
            const name = it.icon.split('/').pop().replace(/\.webp$/i, '').replace(/\.png$/i, '')
            if (name) {
              const imgPath = await getimgs.realpath(name, 'sets')
              fallbackIcon = `../../../../../` + imgPath
            }
          }
          if (!fallbackIcon) {
            const imgPath = await getimgs.realpath('gear_breton_neck_a', 'sets')
            fallbackIcon = `../../../../../` + imgPath
          }
          setsMsg.push({
            icon: fallbackIcon,
            title: setName,
            desc: '<' + setName + '>',
            msg: [],
            gp_value,
            ap_value,
            type: '',
            place: '',
            item_class: 'item_split2 set_info_big'
          })
          continue
        }
        setsMsg.push({
          icon: gearInfo.icon,
          title: gearInfo.title,
          desc: gearInfo.desc,
          msg: gearInfo.msg || [],
          gp_value,
          ap_value,
          type: gearInfo.type || '',
          place: gearInfo.place || '',
          item_class: gearInfo.item_class
        })
      }
      data.generalData[1].list = setsMsg
      return data
    } catch (err) {
      logger.error('[黄金商人] API 获取失败: ' + (err && err.message))
      return null
    }
  }

  /**
   * 根据套装英文名与 API 图标路径拼装展示信息（供 API 源使用）
   */
  async getGearInfoFromSetName (setName, iconPath, priceLine) {
    let icon = ''
    if (iconPath && typeof iconPath === 'string') {
      const name = iconPath.split('/').pop().replace(/\.webp$/i, '').replace(/\.png$/i, '')
      if (name) {
        const imgPath = await getimgs.realpath(name, 'sets')
        icon = `../../../../../` + imgPath
      }
    }
    let title = ''
    let desc = '<' + setName + '>'
    let msg = []
    const objSets = await database.name2index(setName, 1)
    if (isSetIndexResultEmpty(objSets)) {
      return icon ? { icon, title: '', desc, msg, item_class: 'item_split2 set_info_big' } : null
    }
    let type = ''
    let place = ''
    for (const setKey of objSets) {
      const setData = await database.updateData(setKey, 1)
      const gearNameEN = '<' + setName + '>'
      if (setData && setData.atlasData && setData.atlasData[1] && setData.atlasData[1].name_en && setData.atlasData[1].name_en.toLowerCase() === gearNameEN.toLowerCase()) {
        title = setData.atlasData[1].name || ''
        msg = setData.atlasData[1].msg || []
        type = setData.atlasData[1].type || ''
        place = setData.atlasData[1].place || ''
        break
      }
    }
    return {
      icon: icon || '',
      title,
      desc,
      msg,
      type,
      place,
      item_class: 'item_split2 set_info_big'
    }
  }

  /**
   * 从 uesp 页面获取黄金商人数据
   */
  async fetchFromUesp (data) {
    try {
      const res = await fetch(UESP_GOLDEN_URL)
      if (!res) {
        logger.error('[黄金商人] uesp 请求失败')
        return null
      }
      let html = await res.text()
      const part = html.split('uespesoGoldenItems')[1]
      if (!part) return null
      html = part.split('uespesoGoldenItems')[0]

      const tempDate = html.split('<h4>')[1]
      if (!tempDate) return null
      const dateStr = tempDate.split('<')[0]
        .replace("Vendor Items for ", "")
        .replace("December", "12").replace("November", "11").replace("October", "10")
        .replace("September", "9").replace("August", "8").replace("July", "7")
        .replace("June", "6").replace("May", "5").replace("April", "4")
        .replace("December ", "12").replace("March", "3").replace("January", "1")
      const dataStr = dateStr.split(' ')
      if (dataStr.length >= 3) data.generalData[1].group = dataStr[2] + '年' + dataStr[1] + '月' + dataStr[0] + '日'

      const goldenMsgs = html.split('<li>')
      const setsMsg = []
      for (let i = 1; i < goldenMsgs.length; i++) {
        const oneMsg = goldenMsgs[i]
        let link
        try {
          link = oneMsg.split("a href='")[1]
          if (!link) continue
          link = link.split("' class=")[0]
        } catch (_) { continue }
        let price
        try {
          price = oneMsg.split("-- ")[1]
          if (!price) continue
          price = price.split("<")[0].replace("gp", "G").replace("(Bind on Equip)", "").replace("/", "|").trim()
        } catch (_) { continue }

        const parts = price.split('|').map(s => s.trim()).filter(Boolean)
        const gp_str = parts.find(p => p.includes('G')) || ''
        const ap_str = parts.find(p => p.toUpperCase().includes('AP')) || ''
        const gp_value = gp_str ? gp_str.replace(/\s*G\s*$/i, '').trim() : ''
        const ap_value = ap_str ? ap_str.replace(/\s*AP\s*$/i, '').trim() : ''

        const gearInfo = await this.getGearInfo(link)
        if (gearInfo === -1) continue
        setsMsg.push({
          icon: gearInfo.icon,
          title: gearInfo.title,
          desc: gearInfo.desc,
          msg: gearInfo.msg || [],
          gp_value,
          ap_value,
          type: gearInfo.type || '',
          place: gearInfo.place || '',
          item_class: gearInfo.item_class
        })
      }
      data.generalData[1].list = setsMsg
      return data
    } catch (err) {
      logger.error('[黄金商人] uesp 解析失败: ' + (err && err.message))
      return null
    }
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
    let imgPath = await getimgs.realpath(icon, "sets")
    icon = `../../../../../` + imgPath

    let title = ''
    let desc = ''
    let msg = []
    let type = ''
    let place = ''
    let objSets = await database.name2index(setName,1)
    let setNum = objSets.length
    if(isSetIndexResultEmpty(objSets) || (setNum <= 0))
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
        type = setData.atlasData[1].type || ''
        place = setData.atlasData[1].place || ''
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
      type,
      place,
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
