import fs from 'node:fs'
import path from 'node:path'

const STORE_PATH = './data/eso/custome_resources/steam/data/steam_push_whitelist.json'

/**
 * 全局游戏推送白名单（仅机器人主人可管理）
 * 启用后，只推送白名单内游戏 ID 的开始/结束/切换/成就动态
 */
class SteamWhitelist {
  constructor () {
    this.data = this.load()
  }

  load () {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
        return {
          enabled: !!data.enabled,
          games: Array.isArray(data.games) ? data.games.map(String) : []
        }
      }
    } catch (err) {
      logger.error(`[ESO:Steam白名单] 加载失败: ${err.message}`)
    }
    return { enabled: false, games: [] }
  }

  save () {
    try {
      const dir = path.dirname(STORE_PATH)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(STORE_PATH, JSON.stringify(this.data, null, 2))
    } catch (err) {
      logger.error(`[ESO:Steam白名单] 保存失败: ${err.message}`)
    }
  }

  isEnabled () {
    return this.data.enabled
  }

  list () {
    return this.data.games
  }

  setEnabled (enabled) {
    this.data.enabled = !!enabled
    this.save()
  }

  add (gameid) {
    const id = String(gameid)
    if (!this.data.games.includes(id)) {
      this.data.games.push(id)
      this.save()
      return true
    }
    return false
  }

  remove (gameid) {
    const id = String(gameid)
    const idx = this.data.games.indexOf(id)
    if (idx > -1) {
      this.data.games.splice(idx, 1)
      this.save()
      return true
    }
    return false
  }

  /**
   * 判断某游戏的动态是否允许推送
   * 未启用或名单为空时不做过滤
   */
  allows (gameid) {
    if (!this.data.enabled || !this.data.games.length) return true
    return this.data.games.includes(String(gameid))
  }
}

export default new SteamWhitelist()
