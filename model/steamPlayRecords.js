import fs from 'node:fs'
import path from 'node:path'

const STORE_PATH = './data/eso/custome_resources/steam/data/steam_play_records.json'
const KEEP_DAYS = 365
/** 日分界：凌晨 4 点 */
const DAY_BOUNDARY_HOUR = 4
/** Steam 版《上古卷轴OL》AppID；排行榜只统计该游戏。 */
const ESO_APPID = '306130'

function isRankedApp (appid) {
  return String(appid || '') === ESO_APPID
}

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
   * 查询原始游玩会话。排行榜可以另行过滤，历史查询保留所有游戏。
   * @param {{ start?: number, end?: number, steamIds?: string[], appid?: string, game?: string, limit?: number, offset?: number }} options
   */
  query ({
    start = 0,
    end = Date.now(),
    steamIds = [],
    appid = '',
    game = '',
    limit = 100,
    offset = 0
  } = {}) {
    const ids = new Set(steamIds.map(id => String(id)))
    const appidText = String(appid || '').trim()
    const gameText = String(game || '').trim().toLowerCase()
    const matched = this.records
      .filter(r => r.end >= start && r.start <= end)
      .filter(r => !ids.size || ids.has(String(r.steamId)))
      .filter(r => !appidText || String(r.appid) === appidText)
      .filter(r => !gameText || String(r.game || '').toLowerCase().includes(gameText))
      .sort((a, b) => b.start - a.start)
    const pageLimit = Math.max(1, Math.min(Number(limit) || 100, 500))
    const pageOffset = Math.max(0, Number(offset) || 0)
    return {
      total: matched.length,
      offset: pageOffset,
      limit: pageLimit,
      records: matched.slice(pageOffset, pageOffset + pageLimit)
    }
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
      // 兼容过滤旧版本写入的其他游戏记录。
      if (!isRankedApp(r.appid)) continue
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
