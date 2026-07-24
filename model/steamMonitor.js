import Steam from './steam.js'
import SteamUser from './steamUser.js'
import SteamPush from './steamPush.js'
import SteamAchievements from './steamAchievements.js'
import SteamPlayRecords from './steamPlayRecords.js'
import SteamWhitelist from './steamWhitelist.js'

const PERSONA_STATE_TEXT = {
  1: '在线',
  2: '忙碌',
  3: '离开',
  4: '打盹',
  5: '想交易',
  6: '想玩游戏'
}

/** 退出类游戏事件需连续确认的次数（防止 API 闪断误报） */
const CONFIRM_TICKS = 2

class SteamMonitor {
  constructor () {
    /** 待确认的退出类事件: steamId -> { stop: {game, startTime}|null, offline: bool, count } */
    this.pending = new Map()
    /** 已建立状态基线的 steamId（首轮只记录不推送，避免重启后轰炸） */
    this.baselined = new Set()
    /** 播报图渲染钩子（由 apps 层注入），返回图片消息或 null（回退文本） */
    this.renderEvent = null
    /** 游戏总时长缓存（会话级）: steamId -> Map(appid -> minutes) */
    this.gamesCache = new Map()
    /** 游戏当前在线人数缓存: appid -> { count, ts } */
    this.playersCache = new Map()
  }

  /**
   * 收集所有开启了推送的绑定（游玩推送 lastGameCheck / 在线推送 lastOnlineCheck）
   */
  getMonitoredBindings () {
    const list = []
    const users = SteamUser.getAllUsers()
    for (const [userId, userData] of Object.entries(users)) {
      const bindings = userData.bindings || (userData.steamId ? [userData] : [])
      for (const b of bindings) {
        const playPush = Number(b.lastGameCheck) === 1
        const onlinePush = Number(b.lastOnlineCheck) === 1
        const achPush = b.lastAchCheck === undefined ? true : Number(b.lastAchCheck) === 1
        if (!playPush && !onlinePush && !achPush) continue
        if (!b.steamId) continue
        list.push({
          userId: String(userId),
          steamId: String(b.steamId),
          steamName: b.steamName || '',
          playPush,
          onlinePush,
          achPush
        })
      }
    }
    return list
  }

  /** 批量获取玩家摘要（100 人/批） */
  async fetchSummaries (steamIds) {
    const apiKey = Steam.getCurrentApiKey()
    const players = []
    for (let i = 0; i < steamIds.length; i += 100) {
      const chunk = steamIds.slice(i, i + 100)
      const data = await Steam.callApi(
        `/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${chunk.join(',')}`,
        {},
        1
      )
      if (data?.response?.players) players.push(...data.response.players)
    }
    return players
  }

  /** 定时任务入口：轮询一次 */
  async tick () {
    if (!Steam.hasApiKey()) return

    const bindings = this.getMonitoredBindings()
    if (!bindings.length) return

    const steamIds = [...new Set(bindings.map(b => b.steamId))]
    let players
    try {
      players = await this.fetchSummaries(steamIds)
    } catch (err) {
      logger.error(`[ESO:Steam监控] 批量查询失败: ${err.message}`)
      return
    }
    const playerMap = new Map(players.map(p => [String(p.steamid), p]))

    const events = []
    for (const b of bindings) {
      const player = playerMap.get(b.steamId)
      if (!player) continue
      try {
        events.push(...this.diffBinding(b, player))
      } catch (err) {
        logger.error(`[ESO:Steam监控] 状态比对失败 ${b.steamId}: ${err.message}`)
      }
    }
    SteamPush.saveOnlineStatus()

    for (const ev of events) {
      await this.dispatch(ev).catch(err => {
        logger.error(`[ESO:Steam监控] 推送失败: ${err.message}`)
      })
    }

    // 成就监控：游戏中的绑定按间隔检查成就变化（需开启成就推送且游戏在白名单内）
    for (const b of bindings) {
      if (!b.achPush) continue
      const player = playerMap.get(b.steamId)
      if (!player || !player.gameid) continue
      if (!SteamWhitelist.allows(player.gameid)) continue
      try {
        const achEvent = await SteamAchievements.check(b, player)
        if (achEvent) await this.dispatch(achEvent)
      } catch (err) {
        logger.error(`[ESO:Steam成就] 检查失败 ${b.steamId}: ${err.message}`)
      }
    }
  }

  /**
   * 比对单个绑定的状态变化，返回待推送事件列表
   */
  diffBinding (b, player) {
    const events = []
    const steamId = b.steamId
    const name = b.steamName || player.personaname || steamId
    const old = SteamPush.getOnlineStatus(steamId)

    const newState = Number(player.personastate || 0)
    const newGame = player.gameid ? String(player.gameid) : ''
    const newGameName = player.gameextrainfo || ''

    // 首轮：只建立基线，不推送
    if (!old || !this.baselined.has(steamId)) {
      this.baselined.add(steamId)
      SteamPush.onlineStatus[steamId] = {
        personastate: newState,
        gameid: newGame,
        gameextrainfo: newGameName,
        gameStartTime: newGame ? Date.now() : null,
        lastUpdate: Date.now()
      }
      return events
    }

    const oldState = Number(old.personastate || 0)
    const oldGame = old.gameid || ''
    const oldGameName = old.gameextrainfo || ''

    const mkEvent = (kind, extra = {}) => ({
      userId: b.userId,
      steamId,
      kind,
      name,
      avatar: player.avatarfull || '',
      ...extra
    })

    // ── 立即类事件（开始/切换/上线）──
    if (newState > 0 && newGame && oldGame !== newGame) {
      // 开始或切换游戏（旧状态中的退出候选作废）
      this.pending.delete(steamId)
      const startTime = Date.now()
      if (b.playPush && SteamWhitelist.allows(newGame)) {
        if (!oldGame) {
          events.push(mkEvent('start', {
            game: newGameName,
            gameid: newGame,
            text: `🎮 Steam动态\n${name} 开始游玩《${newGameName}》`
          }))
        } else {
          events.push(mkEvent('switch', {
            game: newGameName,
            gameid: newGame,
            oldGame: oldGameName,
            text: `🎮 Steam动态\n${name} 从《${oldGameName}》切换到了《${newGameName}》`
          }))
        }
      }
      SteamPush.onlineStatus[steamId] = {
        personastate: newState,
        gameid: newGame,
        gameextrainfo: newGameName,
        gameStartTime: startTime,
        lastUpdate: Date.now()
      }
      return events
    }

    if (newState > 0 && oldState === 0) {
      // 上线（未在游戏中）
      this.pending.delete(steamId)
      if (b.onlinePush) {
        const stateText = PERSONA_STATE_TEXT[newState] || '在线'
        events.push(mkEvent('online', {
          stateText,
          text: `🟢 Steam动态\n${name} 上线了（${stateText}）`
        }))
      }
      SteamPush.onlineStatus[steamId] = {
        ...old,
        personastate: newState,
        lastUpdate: Date.now()
      }
      return events
    }

    // ── 退出类候选事件（结束游戏/下线），需连续确认 ──
    const stopGame = oldGame && (!newGame || newState === 0)
    const goOffline = oldState > 0 && newState === 0

    if (!stopGame && !goOffline) {
      // 状态稳定：清除候选，正常更新基线
      this.pending.delete(steamId)
      SteamPush.onlineStatus[steamId] = {
        personastate: newState,
        gameid: newGame,
        gameextrainfo: newGameName,
        gameStartTime: newGame ? (old.gameStartTime || Date.now()) : null,
        lastUpdate: Date.now()
      }
      return events
    }

    // 累积候选
    let p = this.pending.get(steamId)
    if (!p) {
      p = { stop: null, offline: false, count: 0 }
      this.pending.set(steamId, p)
    }
    if (stopGame && !p.stop) {
      p.stop = { game: oldGameName, gameid: oldGame, startTime: old.gameStartTime || null }
    }
    if (goOffline) p.offline = true
    p.count++

    if (p.count < CONFIRM_TICKS) {
      // 未确认：保持旧基线不变，等待下次轮询
      return events
    }

    // 确认：发出事件
    this.pending.delete(steamId)

    // 记录游玩时长（供排行榜；与推送开关/白名单无关，始终记录）
    if (p.stop && p.stop.startTime) {
      SteamPlayRecords.add({
        steamId,
        name,
        appid: p.stop.gameid,
        game: p.stop.game,
        start: p.stop.startTime,
        end: Date.now()
      })
    }

    if (p.stop && b.playPush && SteamWhitelist.allows(p.stop.gameid)) {
      let durationMin = 0
      let durationText = ''
      if (p.stop.startTime) {
        durationMin = Math.max(1, Math.round((Date.now() - p.stop.startTime) / 60000))
        durationText = `，本次游玩 ${Steam.formatPlaytime(durationMin)}`
      }
      events.push(mkEvent('stop', {
        game: p.stop.game,
        durationMin,
        startTime: p.stop.startTime,
        endTime: Date.now(),
        text: `🕹 Steam动态\n${name} 结束了《${p.stop.game}》的游玩${durationText}`
      }))
    }

    // 游戏结束 5 分钟后补查一次成就（需开启成就推送且游戏在白名单内）
    if (p.stop && b.achPush && SteamWhitelist.allows(p.stop.gameid)) {
      const achBinding = { ...b }
      const achPlayer = { gameid: p.stop.gameid, gameextrainfo: p.stop.game, personaname: name, avatarfull: player.avatarfull || '' }
      setTimeout(() => {
        SteamAchievements.check(achBinding, achPlayer, { force: true })
          .then(ev2 => ev2 && this.dispatch(ev2))
          .catch(() => {})
      }, 5 * 60 * 1000)
    }
    if (p.offline && b.onlinePush) {
      events.push(mkEvent('offline', {
        text: `⚫ Steam动态\n${name} 已下线`
      }))
    }

    SteamPush.onlineStatus[steamId] = {
      personastate: newState,
      gameid: newGame,
      gameextrainfo: newGameName,
      gameStartTime: null,
      lastUpdate: Date.now()
    }
    return events
  }

  /** 推送事件：游戏事件尝试渲染播报图（失败回退文本），优先群推送，无群记录时私聊本人 */
  async dispatch (ev) {
    let msg = ev.text
    if (this.renderEvent && ['start', 'switch', 'stop'].includes(ev.kind)) {
      try {
        await this.enrich(ev)
        const img = await this.renderEvent(ev)
        if (img) msg = img
      } catch (err) {
        logger.error(`[ESO:Steam监控] 播报图渲染失败，回退文本: ${err.message}`)
      }
    }

    const groups = SteamPush.getUserPushGroups(ev.userId, ev.steamId)
    if (groups.length) {
      for (const gid of groups) {
        await this.sendToGroup(gid, msg)
      }
      return
    }
    await this.sendToFriend(ev.userId, msg)
  }

  /** 为游戏事件补充信息：该游戏总游玩时长 + 当前全球在线人数（失败静默） */
  async enrich (ev) {
    if (!ev.gameid) return

    // 当前在线人数（缓存 10 分钟）
    try {
      const cached = this.playersCache.get(ev.gameid)
      if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
        ev.currentPlayers = cached.count
      } else {
        const data = await Steam.callApi(`/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${ev.gameid}`, {}, 0)
        const count = data?.response?.player_count
        if (typeof count === 'number') {
          this.playersCache.set(ev.gameid, { count, ts: Date.now() })
          ev.currentPlayers = count
        }
      }
    } catch (_) { /* 忽略 */ }

    // 该游戏总游玩时长（会话级缓存，获取一次该用户游戏库）
    try {
      let gamesMap = this.gamesCache.get(ev.steamId)
      if (!gamesMap) {
        gamesMap = new Map()
        const games = await Steam.getOwnedGames(ev.steamId)
        for (const g of games || []) {
          gamesMap.set(String(g.appid), g.playtime_forever || 0)
        }
        this.gamesCache.set(ev.steamId, gamesMap)
      }
      const minutes = gamesMap.get(String(ev.gameid))
      if (typeof minutes === 'number') {
        ev.totalPlaytime = Steam.formatPlaytime(minutes)
      }
    } catch (_) { /* 忽略 */ }
  }

  /** 通过任意在线 Bot 向群发送消息 */
  async sendToGroup (groupId, msg) {
    for (const id of Object.keys(Bot.bots || {})) {
      try {
        const g = Bot.bots[id].pickGroup?.(groupId)
        if (g?.sendMsg) {
          await g.sendMsg(msg)
          return true
        }
      } catch (_) { /* 尝试下一个 Bot */ }
    }
    logger.error(`[ESO:Steam监控] 群推送失败: ${groupId}`)
    return false
  }

  /** 通过任意在线 Bot 向用户私聊发送消息 */
  async sendToFriend (userId, msg) {
    for (const id of Object.keys(Bot.bots || {})) {
      try {
        const f = Bot.bots[id].pickFriend?.(userId)
        if (f?.sendMsg) {
          await f.sendMsg(msg)
          return true
        }
      } catch (_) { /* 尝试下一个 Bot */ }
    }
    logger.error(`[ESO:Steam监控] 私聊推送失败: ${userId}`)
    return false
  }
}

export default new SteamMonitor()
