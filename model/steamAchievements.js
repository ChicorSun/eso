import fs from 'node:fs'
import path from 'node:path'
import Steam from './steam.js'

const STORE_PATH = './data/eso/custome_resources/steam/data/steam_achievements.json'

/** 游戏期间成就检查间隔 */
const CHECK_INTERVAL = 20 * 60 * 1000
/** 单次推送最多展示的成就数 */
const MAX_PUSH_PER_TICK = 3

class SteamAchievements {
  constructor () {
    this.store = this.load()
    /** 成就元数据缓存: appid -> Map(apiname -> {displayName, description, icon}) */
    this.schemaCache = new Map()
    /** 全球解锁率缓存: appid -> Map(apiname -> percent) */
    this.percentCache = new Map()
  }

  load () {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
        return {
          snapshots: data.snapshots || {},
          blacklist: data.blacklist || []
        }
      }
    } catch (err) {
      logger.error(`[ESO:Steam成就] 加载数据失败: ${err.message}`)
    }
    return { snapshots: {}, blacklist: [] }
  }

  save () {
    try {
      const dir = path.dirname(STORE_PATH)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(STORE_PATH, JSON.stringify(this.store, null, 2))
    } catch (err) {
      logger.error(`[ESO:Steam成就] 保存数据失败: ${err.message}`)
    }
  }

  isBlacklisted (appid) {
    return this.store.blacklist.includes(String(appid))
  }

  blacklist (appid) {
    const id = String(appid)
    if (!this.store.blacklist.includes(id)) {
      this.store.blacklist.push(id)
      this.save()
      logger.info(`[ESO:Steam成就] 游戏 ${id} 无成就数据，加入黑名单`)
    }
  }

  /** 成就元数据（名称/描述/图标），按 appid 缓存 */
  async getSchema (appid) {
    if (this.schemaCache.has(String(appid))) return this.schemaCache.get(String(appid))
    const map = new Map()
    try {
      const apiKey = Steam.getCurrentApiKey()
      const data = await Steam.callApi(
        `/ISteamUserStats/GetSchemaForGame/v2/?key=${apiKey}&appid=${appid}&l=schinese`, {}, 1)
      const list = data?.game?.availableGameStats?.achievements || []
      for (const a of list) {
        map.set(a.name, {
          displayName: a.displayName || a.name,
          description: a.description || '',
          icon: a.icon || ''
        })
      }
    } catch (err) {
      logger.error(`[ESO:Steam成就] 获取成就元数据失败 ${appid}: ${err.message}`)
    }
    this.schemaCache.set(String(appid), map)
    return map
  }

  /** 全球解锁率，按 appid 缓存 */
  async getPercents (appid) {
    if (this.percentCache.has(String(appid))) return this.percentCache.get(String(appid))
    const map = new Map()
    try {
      const data = await Steam.callApi(
        `/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?appid=${appid}`, {}, 1)
      const list = data?.achievementpercentages?.achievements || []
      for (const a of list) {
        const pct = parseFloat(a.percent)
        if (!isNaN(pct)) map.set(a.name, pct)
      }
    } catch (err) {
      logger.error(`[ESO:Steam成就] 获取全球解锁率失败 ${appid}: ${err.message}`)
    }
    this.percentCache.set(String(appid), map)
    return map
  }

  /**
   * 检查某绑定当前游戏的成就变化
   * @param b 监控绑定 {userId, steamId, steamName}
   * @param player GetPlayerSummaries 玩家对象（需含 gameid）
   * @param opts.force 忽略检查间隔（用于游戏结束后的补查）
   * @returns 推送事件或 null
   */
  async check (b, player, opts = {}) {
    const appid = String(player.gameid || '')
    if (!appid || this.isBlacklisted(appid)) return null

    const key = `${b.steamId}_${appid}`
    const snap = this.store.snapshots[key]
    if (!opts.force && snap && Date.now() - snap.ts < CHECK_INTERVAL) return null

    const stats = await Steam.getPlayerAchievements(b.steamId, appid)
    const achievements = stats?.achievements
    if (!achievements || !achievements.length) {
      // 无成就数据（或隐私限制连续失败按无数据处理）
      this.blacklist(appid)
      return null
    }

    const unlockedNow = achievements.filter(a => a.achieved === 1).map(a => a.apiname)

    // 首次：只建快照
    if (!snap) {
      this.store.snapshots[key] = { unlocked: unlockedNow, ts: Date.now() }
      this.save()
      return null
    }

    const newOnes = achievements.filter(a => a.achieved === 1 && !snap.unlocked.includes(a.apiname))
    this.store.snapshots[key] = { unlocked: unlockedNow, ts: Date.now() }
    this.save()
    if (!newOnes.length) return null

    const schema = await this.getSchema(appid)
    const percents = await this.getPercents(appid)

    const items = newOnes.slice(0, MAX_PUSH_PER_TICK).map(a => {
      const meta = schema.get(a.apiname) || {}
      const percent = percents.get(a.apiname)
      return {
        name: meta.displayName || a.apiname,
        desc: meta.description || '',
        icon: meta.icon || '',
        percent: typeof percent === 'number' ? percent : null,
        rare: typeof percent === 'number' && percent < 10
      }
    })

    const gameName = player.gameextrainfo || ''
    const textLines = items.map(i => `🏆 ${i.name}${i.percent != null ? `（全球解锁率 ${i.percent}%）` : ''}`)
    return {
      kind: 'achievement',
      userId: b.userId,
      steamId: b.steamId,
      name: b.steamName || player.personaname || b.steamId,
      avatar: player.avatarfull || '',
      game: gameName,
      gameid: appid,
      achievements: items,
      extraCount: newOnes.length - items.length,
      text: `🏆 Steam成就\n${b.steamName || b.steamId} 在《${gameName}》中解锁了成就：\n${textLines.join('\n')}`
    }
  }
}

export default new SteamAchievements()
