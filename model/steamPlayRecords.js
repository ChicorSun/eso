import fs from 'node:fs'
import path from 'node:path'

const STORE_PATH = './data/eso/custome_resources/steam/data/steam_play_records.json'
const KEEP_DAYS = 30
/** 日分界：凌晨 4 点 */
const DAY_BOUNDARY_HOUR = 4

class SteamPlayRecords {
  constructor () {
    this.records = this.load()
  }

  load () {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
        return Array.isArray(data.records) ? data.records : []
      }
    } catch (err) {
      logger.error(`[ESO:Steam排行] 加载记录失败: ${err.message}`)
    }
    return []
  }

  save () {
    try {
      const dir = path.dirname(STORE_PATH)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(STORE_PATH, JSON.stringify({ records: this.records }, null, 2))
    } catch (err) {
      logger.error(`[ESO:Steam排行] 保存记录失败: ${err.message}`)
    }
  }

  /** 追加一条游玩记录 */
  add ({ steamId, name, appid, game, start, end }) {
    if (!start || !end || end <= start) return
    this.records.push({
      steamId: String(steamId),
      name: name || '',
      appid: String(appid || ''),
      game: game || '',
      start,
      end,
      minutes: Math.max(1, Math.round((end - start) / 60000))
    })
    this.prune()
    this.save()
  }

  prune () {
    const cutoff = Date.now() - KEEP_DAYS * 24 * 3600 * 1000
    this.records = this.records.filter(r => r.end >= cutoff)
  }

  /**
   * 将时间戳归到"统计日"（凌晨 4 点为界），返回 YYYY-MM-DD
   */
  statDay (ts) {
    const d = new Date(ts - DAY_BOUNDARY_HOUR * 3600 * 1000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  /**
   * 聚合最近 days 个统计日的数据（含今天）
   * @returns { days, startDay, endDay, perUser: Map(steamId -> {totalMin, games: Map(game -> min)}) }
   */
  aggregate (days = 1, offset = 0) {
    const daySet = new Set()
    for (let i = 0; i < days; i++) {
      daySet.add(this.statDay(Date.now() - (offset + i) * 24 * 3600 * 1000))
    }

    const perUser = new Map()
    for (const r of this.records) {
      const day = this.statDay(r.end)
      if (!daySet.has(day)) continue
      if (!perUser.has(r.steamId)) {
        perUser.set(r.steamId, { totalMin: 0, games: new Map(), name: r.name })
      }
      const u = perUser.get(r.steamId)
      u.totalMin += r.minutes
      u.name = r.name || u.name
      u.games.set(r.game, (u.games.get(r.game) || 0) + r.minutes)
    }

    const sortedDays = [...daySet].sort()
    return {
      days,
      startDay: sortedDays[0],
      endDay: sortedDays[sortedDays.length - 1],
      perUser
    }
  }
}

export default new SteamPlayRecords()
