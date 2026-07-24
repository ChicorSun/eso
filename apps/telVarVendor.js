import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import fetch from 'node-fetch'
import moment from 'moment'
import md5 from 'md5'

const TEL_VAR_VENDOR_API = 'https://api.esocn.com.cn/api/tel-var-vendor'

const TEL_VAR_CMD_REG = '^#*(泰尔瓦石商人|泰尔瓦商人)$'

let telVarCache = { md5: '', img: '' }

function formatValue (val) {
  const s = String(val ?? '').trim()
  if (!s) return ''
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export class telVarVendor extends plugin {
  constructor () {
    super({
      name: 'ESO:泰尔瓦石商人',
      dsc: '查询泰尔瓦石商人的商品',
      event: 'message',
      priority: 5000,
      rule: [{ reg: TEL_VAR_CMD_REG, fnc: 'queryTelVarVendor' }]
    })
  }

  async queryTelVarVendor (e) {
    const data = await this.updateTelVarData(e)
    if (!data) return

    const img = await this.cache(data)
    await this.reply(img)
  }

  async updateTelVarData (e) {
    const _path = process.cwd().replace(/\\/g, '/')
    const data = {
      init: 'done',
      saveId: 'telVarVendor',
      tplFile: './plugins/eso/resources/html/telVarVendor/telVarVendor.html',
      pluResPath: `${_path}/plugins/eso/resources/`,
      headStyle: '',
      updateTime: moment(Date.now()).format('YYYY-MM-DD HH:mm'),
      period: '',
      items: []
    }

    await this.reply('正在为您查询泰尔瓦石商人，请等待…')

    let res
    try {
      res = await fetch(TEL_VAR_VENDOR_API)
    } catch (err) {
      logger.error('[泰尔瓦石商人] 请求失败: ' + (err && err.message))
      await this.reply('接口请求失败，请稍后再试。')
      return null
    }

    if (!res || !res.ok) {
      logger.error('[泰尔瓦石商人] 接口异常: ' + (res && res.status))
      await this.reply('接口返回异常，请稍后再试。')
      return null
    }

    let json
    try {
      json = await res.json()
    } catch (err) {
      logger.error('[泰尔瓦石商人] 解析失败: ' + (err && err.message))
      await this.reply('数据解析失败，请稍后再试。')
      return null
    }

    if (!json.success || !json.data || !Array.isArray(json.data.items)) {
      await this.reply('暂无泰尔瓦石商人数据。')
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
    if (telVarCache.md5 === tmp) return telVarCache.img

    telVarCache.img = await puppeteer.screenshot('telVarVendor', data)
    telVarCache.md5 = tmp
    return telVarCache.img
  }
}
