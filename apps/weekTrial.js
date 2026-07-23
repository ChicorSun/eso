import plugin from '../../../lib/plugins/plugin.js'
import database, { raidNameMap, setAtlasSrcMode } from '../model/database.js'
import gearConfig from '../model/gearConfig.js'
import fetch from 'node-fetch'

const WEEK_TRIAL_API = 'https://api.esocn.com.cn/api/week-trial'

/** 图鉴数据源：'local' 本地数据库（默认）| 'api' ESOCN API */
let srcMode = 'local'

/** 周常试炼 / 周常副本 触发词 */
const WEEK_TRIAL_CMD_REG = '^#*(周常试炼|周常副本)$'

export class weekTrial extends plugin {
  constructor () {
    super({
      name: 'ESO:周常试炼',
      dsc: '查询本周周常试炼（美服/欧服）',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: WEEK_TRIAL_CMD_REG,
          fnc: 'queryWeekTrial'
        }
      ]
    })
  }

  /**
   * 查询周常试炼：拉取 API，结合 raidNameMap 返回中英对照
   */
  async queryWeekTrial (e) {
    srcMode = gearConfig.resolveModuleMode(srcMode)
    setAtlasSrcMode(srcMode)
    await this.reply('正在查询本周周常试炼…')

    let res
    try {
      res = await fetch(WEEK_TRIAL_API)
    } catch (err) {
      logger.error('[周常试炼] 请求失败: ' + (err && err.message))
      await this.reply('接口请求失败，请稍后再试。')
      return
    }

    if (!res || !res.ok) {
      logger.error('[周常试炼] 接口异常: ' + (res && res.status))
      await this.reply('接口返回异常，请稍后再试。')
      return
    }

    let json
    try {
      json = await res.json()
    } catch (err) {
      logger.error('[周常试炼] 解析失败: ' + (err && err.message))
      await this.reply('数据解析失败，请稍后再试。')
      return
    }

    if (!json.success || !json.data) {
      await this.reply('暂无周常试炼数据。')
      return
    }

    await database.init_database()

    const pcna = (json.data.PCNA || '').trim()
    const pceu = (json.data.PCEU || '').trim()
    const scrapeTime = (json.data.ScrapeTime || '').trim()

    const cnNa = raidNameMap[pcna] || pcna
    const cnEu = raidNameMap[pceu] || pceu

    let scrapeStr = ''
    if (scrapeTime) {
      try {
        const d = new Date(scrapeTime)
        scrapeStr = '数据更新时间：' + d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) + '\n'
      } catch (_) {
        scrapeStr = '数据更新时间：' + scrapeTime + '\n'
      }
    }

    const msg = `本周周常为：\n${scrapeStr}美服 ：${cnNa}<${pcna}>\n欧服 ：${cnEu}<${pceu}>`
    await this.reply(msg)
  }
}
