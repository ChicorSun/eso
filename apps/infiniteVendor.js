import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import fetch from 'node-fetch'
import moment from 'moment'
import md5 from 'md5'

const INFINITE_VENDOR_API = 'https://api.esocn.com.cn/api/infinite-vendor'

const INFINITE_CMD_REG = '^#*(无限档案塔|档案塔商人|无限商人)$'

let infiniteCache = { md5: '', img: '' }

function formatValue (val) {
  const s = String(val ?? '').trim()
  if (!s) return ''
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export class infiniteVendor extends plugin {
  constructor () {
    super({
      name: 'ESO:无限档案塔',
      dsc: '查询无限档案塔商人的商品',
      event: 'message',
      priority: 5000,
      rule: [{ reg: INFINITE_CMD_REG, fnc: 'queryInfiniteVendor' }]
    })
  }

  async queryInfiniteVendor (e) {
    const data = await this.updateInfiniteData(e)
    if (!data) return

    const img = await this.cache(data)
    await this.reply(img)
  }

  async updateInfiniteData (e) {
    const _path = process.cwd().replace(/\\/g, '/')
    const data = {
      init: 'done',
      saveId: 'infiniteVendor',
      tplFile: './plugins/eso/resources/html/infiniteVendor/infiniteVendor.html',
      pluResPath: `${_path}/plugins/eso/resources/`,
      headStyle: '',
      updateTime: moment(Date.now()).format('YYYY-MM-DD HH:mm'),
      period: '',
      items: []
    }

    await this.reply('正在为您查询无限档案塔商人，请等待…')

    let res
    try {
      res = await fetch(INFINITE_VENDOR_API)
    } catch (err) {
      logger.error('[无限档案塔] 请求失败: ' + (err && err.message))
      await this.reply('接口请求失败，请稍后再试。')
      return null
    }

    if (!res || !res.ok) {
      logger.error('[无限档案塔] 接口异常: ' + (res && res.status))
      await this.reply('接口返回异常，请稍后再试。')
      return null
    }

    let json
    try {
      json = await res.json()
    } catch (err) {
      logger.error('[无限档案塔] 解析失败: ' + (err && err.message))
      await this.reply('数据解析失败，请稍后再试。')
      return null
    }

    if (!json.success || !json.data || !Array.isArray(json.data.items)) {
      await this.reply('暂无无限档案塔商人数据。')
      return null
    }

    data.period = (json.data.time || '').trim()

    for (const it of json.data.items) {
      data.items.push({
        icon: (it.icon || '').trim(),
        name: (it.name || '').trim(),
        name_en: (it.enName || '').trim(),
        value: formatValue(it.value),
        color: (it.color || '').trim()
      })
    }

    return data
  }

  async cache (data) {
    const tmp = md5(JSON.stringify(data))
    if (infiniteCache.md5 === tmp) return infiniteCache.img

    infiniteCache.img = await puppeteer.screenshot('infiniteVendor', data)
    infiniteCache.md5 = tmp
    return infiniteCache.img
  }
}
