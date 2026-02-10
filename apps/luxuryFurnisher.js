import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import database from '../model/database.js'
import getimgs from '../model/getimgs.js'
import esoCfg from '../model/esoCfg.js'
import fetch from 'node-fetch'
import moment from 'moment'
import md5 from 'md5'

const LUXURY_FURNISHER_API = 'https://api.esocn.com.cn/api/luxury-furnisher'

/** 豪华家具商 / 冷港商人 - 触发词 */
const LUXURY_CMD_REG =
  '^#*(家具商人|冷港商人|冷港家具商人|冷港家具|奢侈品家具|奢侈品商人|豪华家具|豪华家具商人|豪华家具商)$'

let luxuryCache = {
  md5: '',
  img: ''
}

export class luxuryFurnisher extends plugin {
  constructor () {
    super({
      name: 'ESO:豪华家具商',
      dsc: '查询豪华家具商（冷港商人）出售的家具与价格',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: LUXURY_CMD_REG,
          fnc: 'queryLuxuryFurnisher'
        }
      ]
    })
  }

  /**
   * 查询豪华家具商：拉取 API，拼装 generalData，用 HTML 模板截图后回复
   */
  async queryLuxuryFurnisher (e) {
    const data = await this.updateLuxuryFurnisherData(e)
    if (!data) return

    const img = await this.cache(data)
    await this.reply(img)
  }

  /**
   * 拉取豪华家具商数据并拼装为模板所需结构（与 goldenVendor 一致）
   */
  async updateLuxuryFurnisherData (e) {
    const defSet = esoCfg.getdefSet('eso', 'luxuryFurnisher')
    if (!defSet || !Array.isArray(defSet) || defSet.length < 2) {
      logger.error('[豪华家具商] defSet/eso/luxuryFurnisher.yaml 格式错误')
      return null
    }

    const _path = process.cwd().replace(/\\/g, '/')
    const data = {
      init: 'done',
      saveId: 'luxuryFurnisher',
      tplFile: './plugins/eso/resources/html/luxuryFurnisher/luxuryFurnisher.html',
      pluResPath: `${_path}/plugins/eso/resources/`,
      headStyle: '',
      generalData: [
        { ...defSet[0], date: moment(Date.now()).format('YYYY-MM-DD') },
        { ...defSet[1], list: [] }
      ]
    }

    await this.reply('正在为您查询豪华家具商，请等待…')

    let res
    try {
      res = await fetch(LUXURY_FURNISHER_API)
    } catch (err) {
      logger.error('[豪华家具商] 请求失败: ' + (err && err.message))
      await this.reply('接口请求失败，请稍后再试。')
      return null
    }

    if (!res || !res.ok) {
      logger.error('[豪华家具商] 接口异常: ' + (res && res.status))
      await this.reply('接口返回异常，请稍后再试。')
      return null
    }

    let json
    try {
      json = await res.json()
    } catch (err) {
      logger.error('[豪华家具商] 解析失败: ' + (err && err.message))
      await this.reply('数据解析失败，请稍后再试。')
      return null
    }

    if (!json.success || !json.data || !Array.isArray(json.data.items)) {
      await this.reply('暂无豪华家具商数据。')
      return null
    }

    const items = json.data.items
    const period = (json.data.timestamp || '').trim() || '当期'
    data.generalData[1].group = period

    const list = []
    for (const it of items) {
      const nameEn = (it.name || '').trim()
      const cost = it.cost != null ? Number(it.cost) : 0
      const costStr = Number.isNaN(cost) ? '?' : cost.toLocaleString() + 'G'

      let title = nameEn
      let desc = '<' + nameEn + '>'
      let name_color = ''
      let type_cn = ''
      let type_en = ''
      let msg = []
      let icon = ''

      try {
        const keys = await database.name2index(nameEn, 4)
        if (keys && keys.length > 0 && keys[0] >= 0) {
          const furnitureData = await database.updateData(keys[0], 8)
          if (furnitureData?.atlasData?.[1]) {
            const d = furnitureData.atlasData[1]
            title = (d.new_cn_name || '').trim() || title
            desc = (d.new_en_name || '').trim() || desc
            name_color = (d.name_color || '').trim()
            type_cn = (d.type_cn || '').trim()
            type_en = (d.type_en || '').trim()
            msg = Array.isArray(d.msg) ? d.msg : []
            const iconPath = (d.new_icon || '').trim()
            const iconName = iconPath ? iconPath.split('/').pop() || '' : ''
            if (iconName) {
              const imgPath = await getimgs.realpath(iconName, 'furniture')
              icon = `../../../../../` + imgPath
            }
          }
        }
      } catch (dbErr) {
        logger.debug('[豪华家具商] 家具解析: ' + (dbErr?.message || ''))
      }

      list.push({
        icon: icon || 'furniture',
        type_cn: type_cn || '',
        type_en: type_en || '',
        title,
        desc,
        name_color: name_color || undefined,
        msg,
        new_msg: costStr,
        item_class: 'item_split2 set_info_big'
      })
    }

    data.generalData[1].list = list
    return data
  }

  async cache (data) {
    const tmp = md5(JSON.stringify(data))
    if (luxuryCache.md5 === tmp) return luxuryCache.img

    luxuryCache.img = await puppeteer.screenshot('luxuryFurnisher', data)
    luxuryCache.md5 = tmp
    return luxuryCache.img
  }
}
