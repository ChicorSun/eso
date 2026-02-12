import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import esoCfg from '../model/esoCfg.js'
import fetch from 'node-fetch'
import moment from 'moment'
import md5 from 'md5'

const ENDEAVORS_API = 'https://api.esocn.com.cn/api/endeavors'

const ENDEAVORS_CMD_REG =
  '^#*(勉励|勉励任务|每日勉励|每周勉励|每日勉励任务|每周勉励任务)$'

let endeavorsCache = { md5: '', img: '' }

function formatEndeavorTime (timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return timeStr
  const s = timeStr.trim()
  // "February 11th 2026" -> "2026.2.11"
  const sNoOrdinal = s.replace(/(\d+)(st|nd|rd|th)\b/i, '$1')
  const d = new Date(sNoOrdinal)
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`
  }
  // "Week 07, 2026" -> "2026年第7周，2.9~2.15"
  const mWeek = s.match(/^Week\s*(\d+)\s*,\s*(\d{4})$/i)
  if (mWeek) {
    const weekNum = parseInt(mWeek[1], 10)
    const year = parseInt(mWeek[2], 10)
    const start = moment().year(year).isoWeek(weekNum).startOf('isoWeek')
    const end = moment().year(year).isoWeek(weekNum).endOf('isoWeek')
    if (start.isValid() && end.isValid()) {
      return `${year}年第${weekNum}周，${start.format('M.D')}~${end.format('M.D')}`
    }
  }
  return s
}

function translateEndeavor (nameEn, defSet) {
  if (!nameEn || !defSet) return nameEn
  const exact = defSet.exact || {}
  const patterns = defSet.patterns || []
  if (exact[nameEn]) return exact[nameEn]
  for (const p of patterns) {
    try {
      const re = new RegExp(p.pattern || '')
      const m = nameEn.match(re)
      if (m) {
        let out = (p.replace || '').trim()
        for (let i = 1; i < m.length; i++) {
          out = out.replace(new RegExp('\\$' + i, 'g'), m[i] || '')
        }
        return out
      }
    } catch (_) {}
  }
  return nameEn
}

export class endeavors extends plugin {
  constructor () {
    super({
      name: 'ESO:勉励任务',
      dsc: '查询每日/每周勉励任务',
      event: 'message',
      priority: 5000,
      rule: [{ reg: ENDEAVORS_CMD_REG, fnc: 'queryEndeavors' }]
    })
  }

  async queryEndeavors (e) {
    const data = await this.updateEndeavorsData(e)
    if (!data) return

    const img = await this.cache(data)
    await this.reply(img)
  }

  async updateEndeavorsData (e) {
    const defSet = esoCfg.getdefSet('eso', 'endeavors')
    if (!defSet) {
      logger.error('[勉励任务] defSet/eso/endeavors.yaml 未找到')
      return null
    }

    const _path = process.cwd().replace(/\\/g, '/')
    const data = {
      init: 'done',
      saveId: 'endeavors',
      tplFile: './plugins/eso/resources/html/endeavors/endeavors.html',
      pluResPath: `${_path}/plugins/eso/resources/`,
      headStyle: '',
      updateTime: moment(Date.now()).format('YYYY-MM-DD HH:mm'),
      daily: [],
      weekly: []
    }

    await this.reply('正在为您查询勉励任务，请等待…')

    let res
    try {
      res = await fetch(ENDEAVORS_API)
    } catch (err) {
      logger.error('[勉励任务] 请求失败: ' + (err && err.message))
      await this.reply('接口请求失败，请稍后再试。')
      return null
    }

    if (!res || !res.ok) {
      logger.error('[勉励任务] 接口异常: ' + (res && res.status))
      await this.reply('接口返回异常，请稍后再试。')
      return null
    }

    let json
    try {
      json = await res.json()
    } catch (err) {
      logger.error('[勉励任务] 解析失败: ' + (err && err.message))
      await this.reply('数据解析失败，请稍后再试。')
      return null
    }

    if (!json.success || !json.data) {
      await this.reply('暂无勉励任务数据。')
      return null
    }

    const daily = json.data.daily || []
    const weekly = json.data.weekly || []

    for (const it of daily) {
      const nameEn = (it.name || '').trim()
      const rewards = (it.rewards || '').trim()
      const timeRaw = (it.time || '').trim()
      const nameCn = translateEndeavor(nameEn, defSet)
      data.daily.push({
        name_cn: nameCn,
        name_en: nameEn,
        rewards,
        time: formatEndeavorTime(timeRaw)
      })
    }

    for (const it of weekly) {
      const nameEn = (it.name || '').trim()
      const rewards = (it.rewards || '').trim()
      const timeRaw = (it.time || '').trim()
      const nameCn = translateEndeavor(nameEn, defSet)
      data.weekly.push({
        name_cn: nameCn,
        name_en: nameEn,
        rewards,
        time: formatEndeavorTime(timeRaw)
      })
    }

    return data
  }

  async cache (data) {
    const tmp = md5(JSON.stringify(data))
    if (endeavorsCache.md5 === tmp) return endeavorsCache.img

    endeavorsCache.img = await puppeteer.screenshot('endeavors', data)
    endeavorsCache.md5 = tmp
    return endeavorsCache.img
  }
}
