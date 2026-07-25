import plugin from '../../../lib/plugins/plugin.js'
import common from "../../../lib/common/common.js"
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import database from '../model/database.js'
import SteamUser from '../model/steamUser.js'
import SteamPush from '../model/steamPush.js'
import SteamMonitor from '../model/steamMonitor.js'
import SteamAchievements from '../model/steamAchievements.js'
import SteamPlayRecords from '../model/steamPlayRecords.js'
import SteamWhitelist from '../model/steamWhitelist.js'
import Steam from '../model/steam.js'
import md5 from 'md5'
import fs from 'node:fs'
import fetch from 'node-fetch'
import moment from 'moment'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ===========================================
// Steam 路径配置
// ===========================================
const STEAM_BASE_PATH = './data/eso/custome_resources/steam/'
const STEAM_CONFIG_PATH = path.join(STEAM_BASE_PATH, 'config/')
const STEAM_CACHE_PATH = path.join(STEAM_BASE_PATH, 'cache/')
const STEAM_IMAGE_PATH = path.join(STEAM_BASE_PATH, 'images/')
const STEAM_DATA_PATH = path.join(STEAM_BASE_PATH, 'data/')

// Steam 配置文件具体路径
const STEAM_CONFIG_FILE = path.join(STEAM_CONFIG_PATH, 'steamConfig.json')
const STEAM_DEFAULT_CONFIG_FILE = path.join(STEAM_CONFIG_PATH, 'default.json')

// ===========================================
// Steam 时间间隔配置
// ===========================================
// 限流配置
const RATE_LIMIT = {
  WINDOW_MS: 60000,           // 1分钟时间窗口
  MAX_REQUESTS: 10,           // 每分钟最多10次请求
  CLEANUP_INTERVAL: 300000    // 5分钟清理一次过期记录
}

// 缓存配置
const CACHE_CONFIG = {
  DEFAULT_MAX_AGE: 1000 * 60 * 30,    // 默认缓存30分钟
  USER_CACHE_AGE: 1000 * 60 * 60,     // 用户信息缓存1小时
  IMAGE_CACHE_AGE: 1000 * 60 * 15     // 图片缓存15分钟
}

// 文件清理配置
const CLEANUP_CONFIG = {
  FILE_MAX_AGE: 24 * 60 * 60 * 1000,  // 文件最大保存24小时
  CLEANUP_INTERVAL: 60 * 60 * 1000,   // 每小时清理一次过期文件
  CACHE_CLEANUP_INTERVAL: 300000      // 5分钟清理一次内存缓存
}

// Steam API配置
const STEAM_API = {
  BASE_URL: 'https://api.steampowered.com',
  COMMUNITY_URL: 'https://steamcommunity.com',
  STORE_URL: 'https://store.steampowered.com',
  REQUEST_TIMEOUT: 30000              // 请求超时30秒
}

// ===========================================
// Steam 缓存管理
// ===========================================
let steamImgCache = {
  md5: '',
  img: ''
}

// 限流Map
const rateLimit = new Map()

// 缓存相关
class LRUCache {
  constructor(options = {}) {
    this.max = options.max || 100
    this.maxAge = options.maxAge || 1000 * 60 * 60 // 默认1小时
    this.cache = new Map()
  }

  get(key) {
    const item = this.cache.get(key)
    if (item) {
      if (Date.now() - item.timestamp > this.maxAge) {
        this.cache.delete(key)
        return undefined
      }
      return item.value
    }
    return undefined
  }

  set(key, value) {
    if (this.cache.size >= this.max) {
      // 删除最早的条目
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    })
  }

  has(key) {
    return this.cache.has(key)
  }

  delete(key) {
    this.cache.delete(key)
  }

  clear() {
    this.cache.clear()
  }
}

// 全局缓存实例
const steamCache = new LRUCache({
  max: 100,
  maxAge: 1000 * 60 * 60 // 1小时
})

// ===========================================
// 初始化函数
// ===========================================
function initSteamDirectories() {
  const dirs = [
    STEAM_BASE_PATH,
    STEAM_CONFIG_PATH,
    STEAM_CACHE_PATH,
    STEAM_IMAGE_PATH,
    STEAM_DATA_PATH
  ]
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  })
}

// ===========================================
// 限流检查
// ===========================================
function checkRateLimit(userId) {
  const now = Date.now()
  const userRequests = rateLimit.get(userId) || []
  
  // 清理过期的请求记录
  const validRequests = userRequests.filter(time => now - time < RATE_LIMIT.WINDOW_MS)
  
  if (validRequests.length >= RATE_LIMIT.MAX_REQUESTS) {
    return false
  }
  
  validRequests.push(now)
  rateLimit.set(userId, validRequests)
  return true
}

// ===========================================
// 清理过期记录
// ===========================================
function cleanupRateLimit() {
  const now = Date.now()
  for (const [userId, requests] of rateLimit.entries()) {
    const validRequests = requests.filter(time => now - time < RATE_LIMIT.WINDOW_MS)
    if (validRequests.length === 0) {
      rateLimit.delete(userId)
    } else {
      rateLimit.set(userId, validRequests)
    }
  }
}

// ===========================================
// Steam 主类
// ===========================================
export class steam extends plugin {
  constructor () {
    super({
      name: 'Steam功能',
      dsc: 'Steam相关功能',
      event: 'message',
      priority: 1000,
      rule: [
        {
          reg: '^#?steam$',
          fnc: 'steamHelp'
        },
        {
          reg: '^#?steam绑定\\s*(\\d*)$',
          fnc: 'steamBind'
        },
        {
          reg: '^#?steam解绑\\s*(\\d*)$',
          fnc: 'steamUnbind'
        },
        {
          reg: '^#?steam切换绑定\\s*(\\d+)$',
          fnc: 'steamSwitchBind'
        },
        {
          reg: '^#?steam(开启|关闭)游玩推送\\s*(\\d*)$',
          fnc: 'steamTogglePlayPush'
        },
        {
          reg: '^#?steam(开启|关闭)在线推送\\s*(\\d*)$',
          fnc: 'steamToggleOnlinePush'
        },
        {
          reg: '^#?steam(开启|关闭)成就推送\\s*(\\d*)$',
          fnc: 'steamToggleAchPush'
        },
        {
          reg: '^#?steam全体(开启|关闭)游玩推送$',
          fnc: 'steamBulkTogglePlayPush'
        },
        {
          reg: '^#?steam全体(开启|关闭)在线推送$',
          fnc: 'steamBulkToggleOnlinePush'
        },
        {
          reg: '^#?steam推送白名单$',
          fnc: 'steamWhitelistShow'
        },
        {
          reg: '^#?steam推送目标列表$',
          fnc: 'steamPushTargetList'
        },
        {
          reg: '^#?steam新增推送目标\\s*(\\d+)$',
          fnc: 'steamPushTargetAdd'
        },
        {
          reg: '^#?steam删除推送目标\\s*(\\d+)$',
          fnc: 'steamPushTargetRemove'
        },
        {
          reg: '^#?steam推送测试$',
          fnc: 'steamPushTest'
        },
        {
          reg: '^#?steam刷新推送$',
          fnc: 'steamRefreshPush'
        },
        {
          reg: '^#?steam(开启|关闭)推送白名单$',
          fnc: 'steamWhitelistToggle'
        },
        {
          reg: '^#?steam添加推送白名单\\s*(\\d+)$',
          fnc: 'steamWhitelistAdd'
        },
        {
          reg: '^#?steam删除推送白名单\\s*(\\d+)$',
          fnc: 'steamWhitelistRemove'
        },
        {
          reg: '^#?steam信息\\s*(\\d*)$',
          fnc: 'steamInfo'
        },
        {
          reg: '^#?steam状态\\s*(\\d*)$',
          fnc: 'steamInfo'
        },
        {
          reg: '^#?steam在线\\s*(\\d*)$',
          fnc: 'steamOnline'
        },
        {
          reg: '^#?steam游戏\\s*(\\d*)$',
          fnc: 'steamGames'
        },
        {
          reg: '^#?steam成就\\s*(\\d*)\\s*(\\d*)$',
          fnc: 'steamAchievements'
        },
        {
          reg: '^#?steam库存\\s*(\\d*)$',
          fnc: 'steamInventory'
        },
        {
          reg: '^#?steam愿望单\\s*(\\d*)$',
          fnc: 'steamWishlist'
        },
        {
          reg: '^#?steam搜索\\s*(.*)$',
          fnc: 'steamSearch'
        },
        {
          reg: '^#?steam折扣$',
          fnc: 'steamDiscounts'
        },
        {
          reg: '^#?steam统计$',
          fnc: 'steamStats'
        },
        {
          reg: '^#?steam列表$',
          fnc: 'steamPlayerList'
        },
        {
          reg: '^#?steam排行\s*(\d*)$',
          fnc: 'steamRank'
        },
                       {
                 reg: '^#?steam设置$',
                 fnc: 'steamSettings'
               },
               {
                 reg: '^#?steam添加apikey\\s*(.*)$',
                 fnc: 'steamAddApiKey'
               },
               {
                 reg: '^#?steam删除apikey\\s*(.*)$',
                 fnc: 'steamRemoveApiKey'
               },
               {
                 reg: '^#?steamapikey列表$',
                 fnc: 'steamApiKeyList'
               }
      ],
      task: [
        {
          cron: '*/2 * * * *',
          name: 'Steam状态监控',
          fnc: () => this.steamMonitorTick(),
          log: false
        },
        {
          cron: '30 8 * * *',
          name: 'Steam每日排行推送',
          fnc: () => this.steamDailyRankPush()
        }
      ]
    })
    
    // 初始化目录
    initSteamDirectories()

    // 注入监控播报图渲染钩子（渲染失败会自动回退文本推送）
    SteamMonitor.renderEvent = ev => this.renderSteamEvent(ev)

    // 启动清理任务
    this.startCleanupTask()
  }

  // ===========================================
  // Steam监控播报图渲染（开始/结束游戏）
  // ===========================================
  async renderSteamEvent (ev) {
    const tplMap = {
      start: 'gamePush',
      switch: 'gamePush',
      stop: 'gamePush',
      online: 'onlinePush',
      offline: 'onlinePush',
      achievement: 'achievementUnlock'
    }
    const tpl = tplMap[ev.kind]
    if (!tpl) return null

    const _path = process.cwd().replace(/\\/g, '/')

    // 群昵称（绑定/开关时记录），回退到 Steam 名
    const found = SteamUser.getBindingBySteamId(ev.steamId)
    const nickname = found?.binding?.nickname || ev.name || ''

    // 头像：QQ 用户用 QQ 头像，其他（如微信）回退 Steam 头像
    let avatarImagePath = ''
    if (/^\d{5,}$/.test(String(ev.userId))) {
      const qqAvatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${ev.userId}&s=100`
      avatarImagePath = await this.getSteamImagePath(qqAvatarUrl, 'avatar', `qq_${ev.userId}`)
    }
    if (!avatarImagePath && ev.avatar) {
      avatarImagePath = await this.getSteamImagePath(ev.avatar, 'avatar', ev.steamId)
    }

    // 游戏封面
    let gameImagePath = ''
    if (ev.gameid) {
      const coverUrl = Steam.getHeaderImgUrlByAppid(ev.gameid)
      gameImagePath = await this.getSteamImagePath(coverUrl, 'games', ev.gameid)
    }

    // 成就事件：下载成就图标
    let achievements = []
    if (ev.kind === 'achievement' && Array.isArray(ev.achievements)) {
      for (const ach of ev.achievements) {
        let iconPath = ''
        if (ach.icon) {
          iconPath = await this.getSteamImagePath(ach.icon, 'achievements', md5(ach.icon))
        }
        achievements.push({
          ...ach,
          iconPath: iconPath || '',
          percentText: ach.percent != null ? `${ach.percent}%` : ''
        })
      }
    }

    const data = {
      ...ev,
      nickname,
      avatarImagePath: avatarImagePath || '',
      gameImagePath: gameImagePath || '',
      achievements,
      pluResPath: `${_path}/plugins/eso/resources/`,
      tplFile: `./plugins/eso/resources/html/steam/${tpl}.html`
    }

    return await puppeteer.screenshot('eso', data)
  }

  // ===========================================
  // Steam时长排行 #steam排行 [天数]
  // ===========================================
  async steamRank (e) {
    const userId = e.user_id
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }

    const match = e.msg.match(/^#?steam排行\s*(\d*)$/)
    let days = parseInt(match?.[1] || '1', 10)
    if (isNaN(days) || days < 1) days = 1
    if (days > 30) days = 30

    const img = await this.renderRankImage(days, 0)
    if (img) return this.reply(img)
    return this.reply('排行图片生成失败，请稍后再试')
  }

  // ===========================================
  // 每日排行定时推送（昨日榜）
  // ===========================================
  async steamDailyRankPush () {
    try {
      const agg = SteamPlayRecords.aggregate(1, 1)
      if (!agg.perUser.size) return
      // 推送目标群列表优先，为空时回退到旧的群推送设置
      const targets = SteamPush.getTargetGroups()
      const groups = targets.length ? targets : SteamPush.getPushGroups()
      if (!groups.length) return
      const img = await this.renderRankImage(1, 1)
      if (!img) return
      for (const gid of groups) {
        await SteamMonitor.sendToGroup(gid, img)
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 每日排行推送失败: ${error.message}`)
    }
  }

  // ===========================================
  // 渲染时长排行图片
  // ===========================================
  async renderRankImage (days, offset = 0) {
    const agg = SteamPlayRecords.aggregate(days, offset)

    // 绑定信息（头像/名字）
    const bindingMap = new Map()
    for (const [, userData] of Object.entries(SteamUser.getAllUsers())) {
      const list = userData.bindings || (userData.steamId ? [userData] : [])
      for (const b of list) {
        if (b.steamId && !bindingMap.has(String(b.steamId))) {
          bindingMap.set(String(b.steamId), b)
        }
      }
    }

    const entries = [...agg.perUser.entries()]
      .map(([steamId, u]) => ({ steamId, ...u }))
      .sort((a, b) => b.totalMin - a.totalMin)
      .slice(0, 10)

    const top = entries[0]?.totalMin || 1
    const rankClasses = ['gold', 'silver', 'bronze']
    const rows = []
    for (let i = 0; i < entries.length; i++) {
      const en = entries[i]
      const binding = bindingMap.get(en.steamId) || {}
      const games = [...en.games.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([g, m]) => `《${g}》${Steam.formatPlaytime(m)}`)
        .join(' · ')
      rows.push({
        rank: i + 1,
        rankClass: rankClasses[i] || '',
        name: en.name || binding.steamName || en.steamId,
        avatarImagePath: binding.avatarfull
          ? await this.getSteamImagePath(binding.avatarfull, 'avatar', en.steamId)
          : '',
        totalText: Steam.formatPlaytime(en.totalMin),
        barPct: Math.max(3, Math.round(en.totalMin / top * 100)),
        gamesText: games
      })
    }

    const _path = process.cwd().replace(/\\/g, '/')
    const rangeText = agg.startDay === agg.endDay
      ? `${agg.startDay}`
      : `${agg.startDay} ~ ${agg.endDay}`

    return await puppeteer.screenshot('eso', {
      rows,
      rangeText,
      updateTime: moment(Date.now()).format('YYYY-MM-DD HH:mm'),
      pluResPath: `${_path}/plugins/eso/resources/`,
      tplFile: './plugins/eso/resources/html/steam/rank.html'
    })
  }

  // ===========================================
  // Steam玩家列表 #steam列表
  // ===========================================
  async steamPlayerList (e) {
    const userId = e.user_id
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    if (!Steam.hasApiKey()) {
      return this.reply('未配置Steam API密钥，请使用 #steam设置 查看设置说明')
    }

    // 收集全部绑定（去重）
    const seen = new Set()
    const bindings = []
    for (const [qqId, userData] of Object.entries(SteamUser.getAllUsers())) {
      const list = userData.bindings || (userData.steamId ? [userData] : [])
      for (const b of list) {
        if (!b.steamId || seen.has(String(b.steamId))) continue
        seen.add(String(b.steamId))
        bindings.push({ userId: String(qqId), steamId: String(b.steamId), steamName: b.steamName || '' })
      }
    }
    if (!bindings.length) {
      return this.reply('还没有任何人绑定Steam账号，使用 #steam绑定 开始吧')
    }

    await this.reply('正在查询玩家状态，请等待…')

    let players
    try {
      players = await SteamMonitor.fetchSummaries(bindings.map(b => b.steamId))
    } catch (error) {
      logger.error(`[ESO:Steam] 玩家列表查询失败: ${error.message}`)
      return this.reply('查询失败，请稍后再试')
    }
    const playerMap = new Map(players.map(p => [String(p.steamid), p]))

    // 组装列表数据：游戏中 > 在线 > 离线
    const rows = []
    for (const b of bindings) {
      const p = playerMap.get(b.steamId)
      if (!p) continue
      const state = Number(p.personastate || 0)
      const inGame = !!(p.gameid && p.gameextrainfo)
      rows.push({
        sortKey: inGame ? 0 : (state > 0 ? 1 : 2),
        name: p.personaname || b.steamName || b.steamId,
        avatarImagePath: p.avatarfull ? await this.getSteamImagePath(p.avatarfull, 'avatar', b.steamId) : '',
        statusText: inGame ? `正在游玩《${p.gameextrainfo}》` : this.getStatusText(state),
        statusClass: inGame ? 'gaming' : (state > 0 ? 'online' : 'offline')
      })
    }
    rows.sort((a, b) => a.sortKey - b.sortKey)

    const _path = process.cwd().replace(/\\/g, '/')
    const data = {
      rows,
      total: rows.length,
      online: rows.filter(r => r.statusClass !== 'offline').length,
      updateTime: moment(Date.now()).format('YYYY-MM-DD HH:mm'),
      pluResPath: `${_path}/plugins/eso/resources/`,
      tplFile: './plugins/eso/resources/html/steam/playerList.html'
    }

    const img = await puppeteer.screenshot('eso', data)
    if (img) return this.reply(img)
    return this.reply('图片生成失败，请稍后再试')
  }

  // ===========================================
  // Steam状态监控定时任务
  // ===========================================
  async steamMonitorTick () {
    try {
      await SteamMonitor.tick()
    } catch (error) {
      logger.error(`[ESO:Steam] 监控轮询异常: ${error.message}`)
    }
  }

  // ===========================================
  // 启动清理任务
  // ===========================================
  startCleanupTask() {
    setInterval(() => {
      cleanupRateLimit()
    }, RATE_LIMIT.CLEANUP_INTERVAL)
    
    setInterval(() => {
      this.cleanupOldFiles()
    }, CLEANUP_CONFIG.CLEANUP_INTERVAL)
  }

  // ===========================================
  // 清理过期文件
  // ===========================================
  async cleanupOldFiles() {
    try {
      const now = Date.now()
      const files = fs.readdirSync(STEAM_CACHE_PATH)
      
      for (const file of files) {
        const filePath = path.join(STEAM_CACHE_PATH, file)
        const stats = fs.statSync(filePath)
        
        if (now - stats.mtime.getTime() > CLEANUP_CONFIG.FILE_MAX_AGE) {
          fs.unlinkSync(filePath)
        }
      }
    } catch (error) {
      console.error('清理Steam缓存文件失败:', error)
    }
  }

  // ===========================================
  // Steam帮助
  // ===========================================
        async steamHelp(e) {
    const helpText = `Steam功能使用说明：

 基础指令：
   • #steam绑定 [SteamID] - 绑定Steam账号或查看绑定状态
   • #steam切换绑定 <序号> - 切换当前绑定的Steam账号
   • #steam解绑 <序号> - 解除指定序号的Steam绑定
   • #steam信息 [SteamID] - 查看Steam用户信息
   • #steam在线 [SteamID] - 查看在线状态

 推送控制：
   • #steam开启游玩推送 [序号] - 开启游玩状态推送
   • #steam关闭游玩推送 [序号] - 关闭游玩状态推送
   • #steam开启在线推送 [序号] - 开启在线状态推送
   • #steam关闭在线推送 [序号] - 关闭在线状态推送
   • #steam开启成就推送 [序号] - 开启成就解锁推送
   • #steam关闭成就推送 [序号] - 关闭成就解锁推送
   • #steam全体开启游玩推送 - 全部用户开启游玩推送（仅主人）
   • #steam全体关闭游玩推送 - 全部用户关闭游玩推送（仅主人）
   • #steam全体开启在线推送 - 全部用户开启在线推送（仅主人）
   • #steam全体关闭在线推送 - 全部用户关闭在线推送（仅主人）
   • #steam推送目标列表 - 查看推送目标群（仅主人）
   • #steam新增推送目标<群号> - 添加推送目标群（仅主人）
   • #steam删除推送目标<序号或群号> - 删除推送目标群（仅主人）
   • #steam推送测试 - 生成各类推送示例图片（仅主人）
   • #steam刷新推送 - 扫描目标群成员并登记推送（仅主人）

 游戏相关：
   • #steam游戏 [SteamID] - 查看游戏库
   • #steam成就 <游戏ID> [SteamID] - 查看游戏成就
   • #steam库存 [SteamID] - 查看库存
   • #steam愿望单 [SteamID] - 查看愿望单
   • #steam列表 - 查看所有绑定玩家的当前状态
   • #steam排行 [天数] - 查看游戏时长排行榜

 商店相关：
   • #steam搜索 <游戏名> - 搜索Steam游戏
   • #steam折扣 - 查看当前折扣

 设置管理：
   • #steam设置 - 查看设置和帮助
   • #steam添加apikey <密钥> - 添加API密钥（仅主人）
   • #steam删除apikey <密钥> - 删除API密钥（仅主人）
   • #steamapikey列表 - 查看API密钥列表（仅主人）

 其他功能：
   • #steam统计 - 查看统计数据

 参数说明：
   • <参数> - 必需参数
   • [参数] - 可选参数
   • 不指定SteamID时，将使用绑定的账号

 如何获取Steam ID:
   1. 访问 https://steamidfinder.com/
   2. 输入你的Steam用户名或好友码
   3. 获取17位数字的Steam ID
   或者访问 https://steamcommunity.com/my/profile 查看

 如何获取游戏ID:
   1. 使用 #steam搜索 <游戏名> 搜索游戏
   2. 在搜索结果中找到游戏ID
   3. 或者访问 https://steamdb.info/ 搜索游戏

 如何获取API密钥:
   1. 访问 https://steamcommunity.com/dev/apikey
   2. 登录Steam账号并填写域名
   3. 同意条款并生成API密钥

 多绑定功能：
   • 支持绑定多个Steam账号，使用 #steam绑定 查看所有绑定
   • 使用 #steam切换绑定<序号> 切换当前使用的账号
   • 每个用户只能有一个当前绑定的账号
   • 支持Steam ID（17位数字）和好友码（数字）两种格式

 使用提示：
   • 输入命令时如果不确定参数，直接输入命令会显示详细帮助
   • 所有命令都支持中文和英文
   • 部分功能需要有效的Steam API密钥`

    return this.reply(helpText)
  }

  // ===========================================
  // Steam绑定
  // ===========================================
  async steamBind(e) {
    const userId = e.user_id
    const match = e.msg.match(/^#?steam绑定\s*(.+)$/)
    const input = match ? match[1].trim() : ''
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    // 如果没有提供参数，显示绑定状态
    if (!input) {
      return await this.showBindStatus(e)
    }
    
    // 检查API密钥
    if (!Steam.hasApiKey()) {
      return this.reply('未配置Steam API密钥，无法进行绑定操作\n请使用 #steam设置 查看设置说明')
    }
    
    // 解析Steam ID / 好友码 / 个人资料链接 / vanity
    const steamId = await Steam.resolveSteamId(input)
    if (!steamId) {
      return this.reply('参数格式不正确，请输入有效的Steam ID（17位数字）、好友码、个人资料链接或自定义ID')
    }

    await this.reply('正在获取用户信息...')
    
    try {
      // 尝试获取用户信息验证Steam ID是否有效
      const userInfo = await Steam.getUserInfo(steamId)
      if (!userInfo) {
        return this.reply('无法获取Steam用户信息，请检查Steam ID是否正确')
      }
      
      // 检查是否已被当前用户绑定（只检查用户自己的绑定）
      const existingUser = SteamUser.getUserBySteamId(steamId)
      if (existingUser && existingUser.qqId === userId.toString()) {
        return this.reply('您已经绑定过该Steam账户')
      }
      
      // 绑定用户（带参数绑定时不改变当前选择）
      const result = SteamUser.bindUser(userId, steamId, userInfo.personaname, userInfo.avatarfull, true)
      if (result.success) {
        // 记录群昵称（推送卡片显示用）
        SteamUser.updateBindingNickname(userId, steamId, e.sender?.card || e.sender?.nickname || '')
        // 群聊中绑定时登记推送群，游玩推送默认开启即可直接生效
        if (e.isGroup && e.group_id) {
          SteamPush.addPushGroup(userId, steamId, e.group_id)
        }
        // 生成绑定状态图片
        return await this.showBindStatus(e, result.bindingIndex)
      } else {
        return this.reply(result.message)
      }
    } catch (error) {
      console.error(`[ESO:Steam] 绑定失败: ${error.message}`)
      if (error.message.includes('未配置Steam API密钥')) {
        return this.reply('未配置Steam API密钥，请先使用 #steam添加apikey 命令添加API密钥')
      }
      return this.reply('绑定失败，请稍后再试')
    }
  }

  // 显示绑定状态
  async showBindStatus(e, highlightIndex = null) {
    const userId = e.user_id
    const bindings = SteamUser.getAllBindings(userId)

    // 补录群昵称（老绑定可能没有记录；用于推送卡片显示）
    const senderName = e.sender?.card || e.sender?.nickname || ''
    if (senderName) {
      for (const b of bindings) {
        if (!b.nickname && b.steamId) {
          SteamUser.updateBindingNickname(userId, b.steamId, senderName)
          b.nickname = senderName
        }
      }
    }
    
    // 准备绑定数据
    const bindingData = []
    
    if (bindings.length === 0) {
      // 没有绑定时显示空行
      bindingData.push({
        index: 1,
        steamId: '',
        friendCode: '',
        steamName: '',
        avatar: '',
        isBind: false,
        playPush: false,
        statePush: false,
        isNewBinding: false
      })
    } else {
      for (let i = 0; i < bindings.length; i++) {
        const binding = bindings[i]
        const friendCode = Steam.getFriendCode(binding.steamId)
        
        // 获取用户头像（使用本地存储的数据，如果没有则通过API补全）
        let avatar = ''
        let avatarfull = binding.avatarfull
        
        // 如果没有头像信息，尝试通过API获取
        if (!avatarfull) {
          try {
            const userInfo = await Steam.getUserInfo(binding.steamId)
            if (userInfo && userInfo.avatarfull) {
              avatarfull = userInfo.avatarfull
              // 更新本地存储的头像信息
              SteamUser.updateBindingAvatar(userId, binding.steamId, avatarfull)
              console.log(`[ESO:Steam] 补全头像信息: ${binding.steamId}`)
            }
          } catch (error) {
            console.error(`[ESO:Steam] 补全头像信息失败: ${error.message}`)
          }
        }
        
        // 使用头像URL获取本地缓存路径
        if (avatarfull) {
          try {
            avatar = await this.getSteamImagePath(avatarfull, 'avatar', binding.steamId)
          } catch (error) {
            console.error(`[ESO:Steam] 获取本地头像失败: ${error.message}`)
          }
        }
        
        bindingData.push({
          index: i + 1,
          steamId: binding.steamId,
          friendCode: friendCode,
          steamName: binding.steamName || '未知用户',
          avatar: avatar,
          isBind: binding.isBind,
          playPush: binding.lastGameCheck === 1, // 游玩推送状态
          statePush: binding.lastOnlineCheck === 1, // 在线推送状态
          achPush: binding.lastAchCheck === undefined ? true : binding.lastAchCheck === 1, // 成就推送状态（旧数据默认开启）
          isNewBinding: highlightIndex === i
        })
      }
    }
    
    // 生成绑定状态图片
    const statusData = {
      qqUser: e.sender.card || e.sender.nickname || `用户${userId}`,
      bindings: bindingData,
      currentTime: new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }
    
    try {
      const img = await puppeteer.screenshot('eso', {
        ...statusData,
        pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`,
        tplFile: './plugins/eso/resources/html/steam/bindStatus.html'
      })
      
      return this.reply(img)
    } catch (error) {
      console.error(`[ESO:Steam] 生成绑定状态图片失败:`, error)
      // 如果图片生成失败，回退到文字回复
      const textLines = ['Steam绑定状态:']
      if (bindings.length === 0) {
        textLines.push('暂无绑定')
      } else {
        bindings.forEach((binding, index) => {
          const friendCode = Steam.getFriendCode(binding.steamId)
          const status = binding.isBind ? '✓' : '○'
          textLines.push(`${index + 1}. ${status} ${binding.steamName} (${binding.steamId}) [${friendCode}]`)
        })
      }
      textLines.push('')
      textLines.push('使用 #steam切换绑定<序号> 切换当前绑定的Steam账户')
      return this.reply(textLines.join('\n'))
    }
  }

  // ===========================================
  // Steam切换绑定
  // ===========================================
  async steamSwitchBind(e) {
    const userId = e.user_id
    const match = e.msg.match(/^#?steam切换绑定\s*(\d+)$/)
    
    if (!match) {
      return this.reply('命令格式: #steam切换绑定<序号>\n例如: #steam切换绑定1')
    }
    
    const index = parseInt(match[1]) - 1 // 转换为0基索引
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    try {
      const result = SteamUser.switchBinding(userId, index)
      if (result.success) {
        return this.reply(result.message)
      } else {
        return this.reply(result.message)
      }
    } catch (error) {
      console.error(`[ESO:Steam] 切换绑定失败: ${error.message}`)
      return this.reply('切换绑定失败，请稍后再试')
    }
  }

  // ===========================================
  // Steam游玩推送开关
  // ===========================================
  async steamTogglePlayPush(e) {
    const userId = e.user_id
    const match = e.msg.match(/^#?steam(开启|关闭)游玩推送\s*(\d*)$/)
    
    if (!match) {
      return this.reply('命令格式: #steam开启游玩推送 [序号] 或 #steam关闭游玩推送 [序号]')
    }
    
    const action = match[1] // '开启' 或 '关闭'
    const indexInput = match[2] ? match[2].trim() : ''
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    try {
      const bindings = SteamUser.getAllBindings(userId)
      if (bindings.length === 0) {
        return this.reply('您还没有绑定任何Steam账户')
      }
      
      let targetIndex = 0 // 默认操作当前绑定的账户
      if (indexInput) {
        targetIndex = parseInt(indexInput) - 1
        if (targetIndex < 0 || targetIndex >= bindings.length) {
          return this.reply(`无效的序号，请输入1-${bindings.length}之间的数字`)
        }
      } else {
        // 如果没有指定序号，找到当前绑定的账户
        const currentIndex = bindings.findIndex(binding => binding.isBind)
        if (currentIndex >= 0) {
          targetIndex = currentIndex
        }
      }
      
      const targetBinding = bindings[targetIndex]
      const enabled = action === '开启' ? 1 : 0
      
      // 更新绑定中的lastGameCheck
      const result = SteamUser.updateBindingGameCheck(userId, targetBinding.steamId, enabled)
      if (result) {
        SteamUser.updateBindingNickname(userId, targetBinding.steamId, e.sender?.card || e.sender?.nickname || '')
        // 同步推送模型：群聊中开启时登记推送群
        SteamPush.setUserPush(userId, targetBinding.steamId, 'play', !!enabled)
        if (enabled && e.isGroup && e.group_id) {
          SteamPush.addPushGroup(userId, targetBinding.steamId, e.group_id)
        }
        const statusText = enabled ? '开启' : '关闭'
        return this.reply(`已${statusText} ${targetBinding.steamName} (${targetBinding.steamId}) 的游玩推送`)
      } else {
        return this.reply('操作失败，请稍后再试')
      }
    } catch (error) {
      console.error(`[ESO:Steam] 切换游玩推送失败: ${error.message}`)
      return this.reply('操作失败，请稍后再试')
    }
  }

  // ===========================================
  // Steam在线推送开关
  // ===========================================
  async steamToggleOnlinePush(e) {
    const userId = e.user_id
    const match = e.msg.match(/^#?steam(开启|关闭)在线推送\s*(\d*)$/)
    
    if (!match) {
      return this.reply('命令格式: #steam开启在线推送 [序号] 或 #steam关闭在线推送 [序号]')
    }
    
    const action = match[1] // '开启' 或 '关闭'
    const indexInput = match[2] ? match[2].trim() : ''
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    try {
      const bindings = SteamUser.getAllBindings(userId)
      if (bindings.length === 0) {
        return this.reply('您还没有绑定任何Steam账户')
      }
      
      let targetIndex = 0 // 默认操作当前绑定的账户
      if (indexInput) {
        targetIndex = parseInt(indexInput) - 1
        if (targetIndex < 0 || targetIndex >= bindings.length) {
          return this.reply(`无效的序号，请输入1-${bindings.length}之间的数字`)
        }
      } else {
        // 如果没有指定序号，找到当前绑定的账户
        const currentIndex = bindings.findIndex(binding => binding.isBind)
        if (currentIndex >= 0) {
          targetIndex = currentIndex
        }
      }
      
      const targetBinding = bindings[targetIndex]
      const enabled = action === '开启' ? 1 : 0
      
      // 更新绑定中的lastOnlineCheck
      const result = SteamUser.updateBindingOnlineCheck(userId, targetBinding.steamId, enabled)
      if (result) {
        SteamUser.updateBindingNickname(userId, targetBinding.steamId, e.sender?.card || e.sender?.nickname || '')
        // 同步推送模型：群聊中开启时登记推送群
        SteamPush.setUserPush(userId, targetBinding.steamId, 'state', !!enabled)
        if (enabled && e.isGroup && e.group_id) {
          SteamPush.addPushGroup(userId, targetBinding.steamId, e.group_id)
        }
        const statusText = enabled ? '开启' : '关闭'
        return this.reply(`已${statusText} ${targetBinding.steamName} (${targetBinding.steamId}) 的在线推送`)
      } else {
        return this.reply('操作失败，请稍后再试')
      }
    } catch (error) {
      console.error(`[ESO:Steam] 切换在线推送失败: ${error.message}`)
      return this.reply('操作失败，请稍后再试')
    }
  }

  // ===========================================
  // Steam成就推送开关
  // ===========================================
  async steamToggleAchPush(e) {
    const userId = e.user_id
    const match = e.msg.match(/^#?steam(开启|关闭)成就推送\s*(\d*)$/)
    
    if (!match) {
      return this.reply('命令格式: #steam开启成就推送 [序号] 或 #steam关闭成就推送 [序号]')
    }
    
    const action = match[1]
    const indexInput = match[2] ? match[2].trim() : ''
    
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    try {
      const bindings = SteamUser.getAllBindings(userId)
      if (bindings.length === 0) {
        return this.reply('您还没有绑定任何Steam账户')
      }
      
      let targetIndex = 0
      if (indexInput) {
        targetIndex = parseInt(indexInput) - 1
        if (targetIndex < 0 || targetIndex >= bindings.length) {
          return this.reply(`无效的序号，请输入1-${bindings.length}之间的数字`)
        }
      } else {
        const currentIndex = bindings.findIndex(binding => binding.isBind)
        if (currentIndex >= 0) {
          targetIndex = currentIndex
        }
      }
      
      const targetBinding = bindings[targetIndex]
      const enabled = action === '开启' ? 1 : 0
      
      const result = SteamUser.updateBindingAchCheck(userId, targetBinding.steamId, enabled)
      if (result) {
        SteamUser.updateBindingNickname(userId, targetBinding.steamId, e.sender?.card || e.sender?.nickname || '')
        SteamPush.setUserPush(userId, targetBinding.steamId, 'achievement', !!enabled)
        if (enabled && e.isGroup && e.group_id) {
          SteamPush.addPushGroup(userId, targetBinding.steamId, e.group_id)
        }
        const statusText = enabled ? '开启' : '关闭'
        return this.reply(`已${statusText} ${targetBinding.steamName} (${targetBinding.steamId}) 的成就推送`)
      } else {
        return this.reply('操作失败，请稍后再试')
      }
    } catch (error) {
      console.error(`[ESO:Steam] 切换成就推送失败: ${error.message}`)
      return this.reply('操作失败，请稍后再试')
    }
  }

  // ===========================================
  // Steam全体推送开关（仅主人）
  // ===========================================
  async steamBulkTogglePlayPush(e) {
    if (!e.isMaster) {
      return this.reply('该功能仅限机器人主人使用')
    }
    const match = e.msg.match(/^#?steam全体(开启|关闭)游玩推送$/)
    const enabled = match[1] === '开启' ? 1 : 0
    const count = SteamUser.batchSetAllPush('lastGameCheck', enabled)
    if (count > 0) {
      return this.reply(`已将 ${count} 个绑定的游玩推送全部${match[1]}`)
    }
    return this.reply('当前没有任何Steam绑定，无需修改')
  }

  async steamBulkToggleOnlinePush(e) {
    if (!e.isMaster) {
      return this.reply('该功能仅限机器人主人使用')
    }
    const match = e.msg.match(/^#?steam全体(开启|关闭)在线推送$/)
    const enabled = match[1] === '开启' ? 1 : 0
    const count = SteamUser.batchSetAllPush('lastOnlineCheck', enabled)
    if (count > 0) {
      return this.reply(`已将 ${count} 个绑定的在线推送全部${match[1]}`)
    }
    return this.reply('当前没有任何Steam绑定，无需修改')
  }

  // ===========================================
  // Steam推送目标群（仅主人）
  // ===========================================
  async steamPushTargetList(e) {
    if (!e.isMaster) {
      return this.reply('该功能仅限机器人主人使用')
    }
    const groups = SteamPush.getTargetGroups()
    if (!groups.length) {
      return this.reply([
        '推送目标群列表为空（当前按各用户登记的群推送，无群记录时私聊本人）',
        '',
        '使用 #steam新增推送目标<群号> 添加（最多 8 个）',
        '添加后：仅向目标群推送，且只推送该群中已登记用户的信息'
      ].join('\n'))
    }
    return this.reply([
      `推送目标群列表（${groups.length}/8）：`,
      '',
      ...groups.map((g, i) => `${i + 1}. ${g}`),
      '',
      '推送规则：只推送本群已登记用户的信息；不在列表中的群不推送',
      '管理命令: #steam新增推送目标<群号> / #steam删除推送目标<序号或群号>'
    ].join('\n'))
  }

  async steamPushTargetAdd(e) {
    if (!e.isMaster) {
      return this.reply('该功能仅限机器人主人使用')
    }
    const match = e.msg.match(/^#?steam新增推送目标\s*(\d+)$/)
    if (!match) {
      return this.reply('命令格式: #steam新增推送目标<群号>\n例如: #steam新增推送目标12345678')
    }
    const gid = match[1]
    const result = SteamPush.addTargetGroup(gid)
    if (result.success) {
      return this.reply([
        `已添加推送目标群 ${gid}（当前 ${SteamPush.getTargetGroups().length}/8 个）`,
        '提示：群内成员需在群里使用过 #steam绑定 或推送开关命令，才会收到自己的动态'
      ].join('\n'))
    }
    if (result.reason === 'exists') {
      return this.reply(`群 ${gid} 已在推送目标列表中`)
    }
    return this.reply('推送目标群已达上限（8 个），请先使用 #steam删除推送目标 移除后再添加')
  }

  async steamPushTargetRemove(e) {
    if (!e.isMaster) {
      return this.reply('该功能仅限机器人主人使用')
    }
    const match = e.msg.match(/^#?steam删除推送目标\s*(\d+)$/)
    if (!match) {
      return this.reply('命令格式: #steam删除推送目标<序号或群号>\n例如: #steam删除推送目标1 或 #steam删除推送目标12345678')
    }
    const input = match[1]
    const groups = SteamPush.getTargetGroups()
    if (!groups.length) {
      return this.reply('推送目标群列表为空，无需删除')
    }

    // 优先按群号精确匹配；否则 1~2 位数字按序号删除
    if (groups.includes(input)) {
      SteamPush.removeTargetGroup(input)
      return this.reply(`已删除推送目标群 ${input}（当前 ${SteamPush.getTargetGroups().length}/8 个）`)
    }
    if (/^\d{1,2}$/.test(input)) {
      const removed = SteamPush.removeTargetGroupByIndex(parseInt(input, 10))
      if (removed) {
        return this.reply(`已删除第 ${input} 个推送目标群 ${removed}（当前 ${SteamPush.getTargetGroups().length}/8 个）`)
      }
      return this.reply(`无效的序号，请输入1-${groups.length}之间的数字`)
    }
    return this.reply(`群 ${input} 不在推送目标列表中`)
  }

  // ===========================================
  // Steam推送测试（仅主人）：仅生成示例图片，不影响正常推送流
  // ===========================================
  async steamPushTest(e) {
    if (!e.isMaster) {
      return this.reply('该功能仅限机器人主人使用')
    }

    await this.reply('正在生成推送测试图片（开始/结束/上线/离线/成就），请等待…')

    // 优先使用主人自己的绑定信息（头像/昵称更真实），无绑定则用示例数据
    const userId = String(e.user_id)
    const bindings = SteamUser.getAllBindings(userId)
    const current = bindings.find(b => b.isBind) || bindings[0] || {}
    const base = {
      userId,
      steamId: current.steamId || '76561198000000001',
      name: current.steamName || '测试玩家',
      avatar: current.avatarfull || '',
      game: 'The Elder Scrolls Online',
      gameid: '306130'
    }

    const samples = [
      { ...base, kind: 'start', text: '' },
      { ...base, kind: 'stop', durationMin: 135, startTime: Date.now() - 135 * 60000, endTime: Date.now(), text: '' },
      { ...base, kind: 'online', state: 1, stateText: '在线', text: '' },
      { ...base, kind: 'offline', text: '' },
      {
        ...base,
        kind: 'achievement',
        extraCount: 0,
        achievements: [
          { name: '示例成就：传说之人', desc: '达成隐藏结局', icon: '', percent: 4.2, rare: true },
          { name: '示例成就：小有成就', desc: '累计游玩 10 小时', icon: '', percent: 32.1, rare: false }
        ],
        text: ''
      }
    ]

    let successCount = 0
    for (const ev of samples) {
      try {
        const img = await this.renderSteamEvent(ev)
        if (img) {
          await this.reply(img)
          successCount++
        } else {
          await this.reply(`[${ev.kind}] 图片生成失败`)
        }
      } catch (error) {
        console.error(`[ESO:Steam] 推送测试渲染失败(${ev.kind}): ${error.message}`)
        await this.reply(`[${ev.kind}] 图片生成失败: ${error.message}`)
      }
    }

    if (successCount > 0) {
      await this.reply(`推送测试完成（${successCount}/${samples.length}），以上为纯图片预览，未触发任何真实推送`)
    }
  }

  // ===========================================
  // Steam刷新推送（仅主人）：扫描推送目标群成员，为群内用户登记推送
  // ===========================================
  async steamRefreshPush(e) {
    if (!e.isMaster) {
      return this.reply('该功能仅限机器人主人使用')
    }

    const targets = SteamPush.getTargetGroups()
    if (!targets.length) {
      return this.reply('推送目标群列表为空\n请先使用 #steam新增推送目标<群号> 添加目标群')
    }

    // 收集全部绑定
    const bindings = []
    for (const [userId, userData] of Object.entries(SteamUser.getAllUsers())) {
      const list = userData.bindings || (userData.steamId ? [userData] : [])
      for (const b of list) {
        if (b.steamId) {
          bindings.push({ userId: String(userId), steamId: String(b.steamId), steamName: b.steamName || '' })
        }
      }
    }
    if (!bindings.length) {
      return this.reply('还没有任何Steam绑定')
    }

    await this.reply(`正在扫描 ${targets.length} 个推送目标群的成员...`)

    const lines = []
    let totalNew = 0
    let totalExist = 0

    for (const gid of targets) {
      // 依次尝试各在线 Bot 获取群成员表
      let memberMap = null
      for (const id of Object.keys(Bot.bots || {})) {
        try {
          const g = Bot.bots[id].pickGroup?.(gid)
          if (g?.getMemberMap) {
            memberMap = await g.getMemberMap()
            if (memberMap) break
          }
        } catch (_) { /* 尝试下一个 Bot */ }
      }

      if (!memberMap || !memberMap.size) {
        lines.push(`群 ${gid}：无法获取成员列表（机器人不在群内或协议不支持）`)
        continue
      }

      // 检查每个绑定用户是否在群内，在则登记推送群（自动去重）
      let newCount = 0
      let existCount = 0
      const hitUsers = new Set()
      for (const b of bindings) {
        const inGroup = memberMap.has(Number(b.userId)) || memberMap.has(b.userId)
        if (!inGroup) continue
        hitUsers.add(b.userId)

        // 同步群昵称（推送卡片显示用；不覆盖已有记录）
        const member = memberMap.get(Number(b.userId)) || memberMap.get(b.userId)
        const memberName = member?.card || member?.nickname || ''
        const existing = SteamUser.getBindingBySteamId(b.steamId)
        if (memberName && existing && !existing.binding.nickname) {
          SteamUser.updateBindingNickname(b.userId, b.steamId, memberName)
        }

        const current = SteamPush.getUserPushGroups(b.userId, b.steamId)
        if (current.includes(gid)) {
          existCount++
        } else {
          SteamPush.addPushGroup(b.userId, b.steamId, gid)
          newCount++
        }
      }

      totalNew += newCount
      totalExist += existCount
      lines.push(`群 ${gid}（成员 ${memberMap.size} 人）：命中 ${hitUsers.size} 个用户，新登记 ${newCount} 条，已存在 ${existCount} 条`)
    }

    return this.reply([
      '推送刷新完成：',
      ...lines,
      '',
      `合计：新登记 ${totalNew} 条，已存在跳过 ${totalExist} 条（不会重复推送）`
    ].join('\n'))
  }

  // ===========================================
  // Steam推送白名单（仅主人）
  // ===========================================
  async steamWhitelistShow(e) {
    if (!e.isMaster) {
      return this.reply('该功能仅限机器人主人使用')
    }

    const gameids = SteamWhitelist.list()
    const statusText = SteamWhitelist.isEnabled() ? '启用中（仅推送名单内游戏）' : '未启用（推送全部游戏）'

    if (!gameids.length) {
      return this.reply(`Steam推送白名单：${statusText}\n名单为空\n\n使用 #steam添加推送白名单 <游戏ID> 添加`)
    }

    await this.reply('正在获取白名单游戏信息...')

    // 获取每个游戏的名称（缓存优先）与封面
    const games = []
    for (const appid of gameids) {
      let name = SteamWhitelist.getName(appid)
      if (!name) {
        try {
          name = await Steam.getGameName(appid)
          if (name) SteamWhitelist.setName(appid, name)
        } catch (_) { /* 使用默认名 */ }
      }
      if (!name) name = `App ${appid}`

      let headerImagePath = ''
      const headerImage = Steam.getHeaderImgUrlByAppid(appid)
      try {
        headerImagePath = await this.getSteamImagePath(headerImage, 'games', appid)
      } catch (_) { /* 封面下载失败则用远程URL */ }

      games.push({ name, appid, headerImage, headerImagePath: headerImagePath || '' })
    }

    try {
      const img = await puppeteer.screenshot('eso', {
        games,
        totalGames: games.length,
        statusText,
        date: new Date().toLocaleDateString('zh-CN'),
        pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`,
        tplFile: './plugins/eso/resources/html/steam/whitelist.html'
      })
      if (img) return this.reply(img)
    } catch (error) {
      console.error(`[ESO:Steam] 白名单图片生成失败: ${error.message}`)
    }

    // 图片失败回退文本
    return this.reply([
      `Steam推送白名单：${statusText}`,
      `共 ${games.length} 个游戏：`,
      ...games.map(g => `• ${g.name} (${g.appid})`)
    ].join('\n'))
  }

  async steamWhitelistToggle(e) {
    if (!e.isMaster) {
      return this.reply('该功能仅限机器人主人使用')
    }
    const match = e.msg.match(/^#?steam(开启|关闭)推送白名单$/)
    const enabled = match[1] === '开启'
    SteamWhitelist.setEnabled(enabled)
    const count = SteamWhitelist.list().length
    if (enabled) {
      return this.reply(`已开启推送白名单（当前 ${count} 个游戏）\n仅推送白名单内游戏的动态`)
    }
    return this.reply('已关闭推送白名单，恢复推送所有游戏的动态')
  }

  async steamWhitelistAdd(e) {
    if (!e.isMaster) {
      return this.reply('该功能仅限机器人主人使用')
    }
    const match = e.msg.match(/^#?steam添加推送白名单\s*(\d+)$/)
    if (!match) {
      return this.reply('命令格式: #steam添加推送白名单 <游戏ID>\n例如: #steam添加推送白名单 306130（上古卷轴OL）')
    }
    const gameid = match[1]
    if (SteamWhitelist.add(gameid)) {
      // 异步解析游戏名并缓存，下次展示直接用
      let name = ''
      try {
        name = await Steam.getGameName(gameid)
        if (name) SteamWhitelist.setName(gameid, name)
      } catch (_) { /* 名字稍后展示时再解析 */ }
      const nameText = name ? `《${name}》` : `游戏 ${gameid}`
      return this.reply(`已将 ${nameText} (${gameid}) 添加到推送白名单（当前共 ${SteamWhitelist.list().length} 个）`)
    }
    return this.reply(`游戏 ${gameid} 已在白名单中`)
  }

  async steamWhitelistRemove(e) {
    if (!e.isMaster) {
      return this.reply('该功能仅限机器人主人使用')
    }
    const match = e.msg.match(/^#?steam删除推送白名单\s*(\d+)$/)
    if (!match) {
      return this.reply('命令格式: #steam删除推送白名单 <游戏ID>')
    }
    const gameid = match[1]
    if (SteamWhitelist.remove(gameid)) {
      return this.reply(`已从推送白名单移除游戏 ${gameid}（当前共 ${SteamWhitelist.list().length} 个）`)
    }
    return this.reply(`游戏 ${gameid} 不在白名单中`)
  }

  // ===========================================
  // Steam解绑
  // ===========================================
  async steamUnbind(e) {
    const userId = e.user_id
    const match = e.msg.match(/^#?steam解绑\s*(.+)$/)
    const input = match ? match[1].trim() : ''
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    // 检查是否提供了参数
    if (!input) {
      const helpText = [
        'Steam解绑使用说明',
        '',
        '命令格式: #steam解绑 <SteamID或好友码>',
        '',
        '参数说明:',
        '• SteamID: 17位数字的Steam ID',
        '• 好友码: 数字形式的好友码',
        '',
        '如何获取Steam ID:',
        '1. 访问 https://steamidfinder.com/',
        '2. 输入你的Steam用户名或好友码',
        '3. 获取17位数字的Steam ID',
        '',
        '或者:',
        '1. 访问 https://steamcommunity.com/my/profile',
        '2. 登录你的Steam账号',
        '3. 在URL中找到你的Steam ID',
        '',
        '示例:',
        '• #steam解绑 76561198987654321',
        '• #steam解绑 1327308926',
        '',
        '注意: 支持Steam ID（17位数字）或好友码（数字）'
      ].join('\n')
      
      return this.reply(helpText)
    }
    
    // 解析Steam ID或好友码
    const steamId = Steam.parseSteamId(input)
    if (!steamId) {
      return this.reply('参数格式不正确，请输入有效的Steam ID（17位数字）或好友码（数字）')
    }
    
    try {
      // 解绑用户
      const result = SteamUser.unbindUser(userId, steamId)
      if (result.success) {
        return this.reply('解绑成功！')
      } else {
        return this.reply(result.message)
      }
    } catch (error) {
      console.error(`[ESO:Steam] 解绑失败: ${error.message}`)
      return this.reply('解绑失败，请稍后再试')
    }
  }

  // ===========================================
  // Steam信息
  // ===========================================
  async steamInfo(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    let userId = String(e.user_id);
    let personID = e.at
    let isOther = false

    if (typeof personID != "undefined") {
      isOther = true
      userId = String(personID);
    }

    const match = e.msg.replace("信息", "").replace("状态", "").match(/^#?steam\s*(.+)$/)
    const input = match ? match[1].trim() : ''
    const steamId = input ? Steam.parseSteamId(input) : SteamUser.getUserSteamId(userId)
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    if (!steamId) {
      if(isOther) {
        return this.reply('该群友尚未绑定Steam账号或指定Steam ID')
      }
      else {
        return this.reply('请先绑定Steam账号或指定Steam ID')
      }
    }
    
    await this.reply('正在获取用户信息...')

    try {
      // 获取用户信息
      const userInfo = await Steam.getUserInfo(steamId)
      if (!userInfo) {
        return this.reply('无法获取Steam用户信息')
      }
      
      // 准备HTML数据
      const htmlData = await this.prepareSteamHTMLData({
        userInfo,
        steamId,
        type: 'userInfo'
      })
      
      // 生成图片
      const img = await this.generateSteamImage(htmlData)
      if (img) {
        return this.reply(img)
      } else {
        // 如果图片生成失败，返回文字信息
        const friendCode = Steam.getFriendCode(steamId)
        const statusText = this.getStatusText(userInfo.personastate)
        const registerTime = userInfo.timecreated ? 
          new Date(userInfo.timecreated * 1000).toLocaleDateString('zh-CN') : '未知'
        
        return this.reply([
          `Steam用户信息`,
          `用户名: ${userInfo.personaname}`,
          `状态: ${statusText}`,
          `好友码: ${friendCode}`,
          `注册时间: ${registerTime}`,
          userInfo.gameextrainfo ? `正在游玩: ${userInfo.gameextrainfo}` : '当前未在游玩'
        ].join('\n'))
      }
    } catch (error) {
      console.error(`[ESO:Steam] 获取用户信息失败: ${error.message}`)
      return this.reply('获取用户信息失败，请稍后再试')
    }
  }

  // ===========================================
  // Steam在线状态
  // ===========================================
  async steamOnline(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    let userId = String(e.user_id);
    let personID = e.at
    let isOther = false

    if (typeof personID != "undefined") {
      isOther = true
      userId = String(personID);
    }

    const match = e.msg.match(/^#?steam在线\s*(.+)$/)
    const input = match ? match[1].trim() : ''
    const steamId = input ? Steam.parseSteamId(input) : SteamUser.getUserSteamId(userId)
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    if (!steamId) {
      if(isOther) {
        return this.reply('该群友尚未绑定Steam账号或指定Steam ID')
      }
      else {
        return this.reply('请先绑定Steam账号或指定Steam ID')
      }
    }

    await this.reply('正在获取用户信息...')
    
    try {
      // 获取用户信息
      const userInfo = await Steam.getUserInfo(steamId)
      if (!userInfo) {
        return this.reply('无法获取Steam用户信息')
      }
      
      const statusText = this.getStatusText(userInfo.personastate)
      const lastOnline = userInfo.lastlogoff ? 
        this.formatTime(userInfo.lastlogoff) : '未知'
      
      const onlineInfo = [
        `Steam在线状态`,
        `用户: ${userInfo.personaname}`,
        `状态: ${statusText}`,
        `最后在线: ${lastOnline}`
      ]
      
      if (userInfo.gameextrainfo) {
        onlineInfo.push(`正在游玩: ${userInfo.gameextrainfo}`)
      }
      
      return this.reply(onlineInfo.join('\n'))
    } catch (error) {
      console.error(`[ESO:Steam] 获取在线状态失败: ${error.message}`)
      return this.reply('获取在线状态失败，请稍后再试')
    }
  }

  // ===========================================
  // Steam游戏库
  // ===========================================
  async steamGames(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    let userId = String(e.user_id);
    let personID = e.at
    let isOther = false

    if (typeof personID != "undefined") {
      isOther = true
      userId = String(personID);
    }

    const match = e.msg.match(/^#?steam游戏\s*(.+)$/)
    const input = match ? match[1].trim() : ''
    const steamId = input ? Steam.parseSteamId(input) : SteamUser.getUserSteamId(userId)
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    if (!steamId) {
      if(isOther) {
        return this.reply('该群友尚未绑定Steam账号或指定Steam ID')
      }
      else {
        return this.reply('请先绑定Steam账号或指定Steam ID')
      }
    }

    await this.reply('正在获取用户信息...')
    
    try {
      // 获取用户信息
      const userInfo = await Steam.getUserInfo(steamId)
      if (!userInfo) {
        return this.reply('无法获取Steam用户信息')
      }
      
      // 获取游戏列表
      const games = await Steam.getOwnedGames(steamId)
      if (!games || games.length === 0) {
        return this.reply('该用户没有公开的游戏库或游戏库为空')
      }
      
      // 输出Steam API返回的游戏信息到日志
      /*
      console.log(`[ESO:Steam] Steam API返回的游戏信息示例（第一个游戏）:`)
      if (games.length > 0) {
        console.log(JSON.stringify(games[0], null, 2))
      }
      */

      // 处理游戏数据并预下载图片
      const processedGames = []
      const gamesToProcess = games.slice(0, 10)
      
      for (const game of gamesToProcess) {
        const headerImageUrl = Steam.getHeaderImgUrlByAppid(game.appid)
        
        // 预下载游戏图片
        let headerImagePath = ''
        
        if (headerImageUrl) {
          try {
            headerImagePath = await this.getSteamImagePath(headerImageUrl, 'games', game.appid)
            //console.log(`[ESO:Steam] 游戏图片已缓存: ${game.name} (${game.appid})`)
          } catch (error) {
            console.error(`[ESO:Steam] 游戏图片缓存失败: ${game.name} (${game.appid}) - ${error.message}`)
          }
        }
        
        processedGames.push({
          name: game.name,
          appid: game.appid,
          headerImage: headerImageUrl,
          headerImagePath: headerImagePath,
          playtime_forever: game.playtime_forever || 0,
          playtime_2weeks: game.playtime_2weeks || 0,
          playtimeText: this.formatGameTime(game.playtime_forever),
          recentPlaytimeText: game.playtime_2weeks ? this.formatGameTime(game.playtime_2weeks) : null
        })
      }
      
      // 计算总游戏时长
      const totalPlaytime = games.reduce((sum, game) => sum + (game.playtime_forever || 0), 0)
      
      // 获取用户群昵称
      const userNickname = e.sender.card || e.sender.nickname || `用户${userId}`
      
      // 获取用户头像路径（预下载到本地）
      let userAvatarPath = ''
      if (userInfo.avatarfull) {
        try {
          userAvatarPath = await this.getSteamImagePath(userInfo.avatarfull, 'avatar', steamId)
          console.log(`[ESO:Steam] 用户头像已缓存: ${userInfo.personaname}`)
        } catch (error) {
          console.error(`[ESO:Steam] 用户头像缓存失败: ${userInfo.personaname} - ${error.message}`)
        }
      }
      
      // 获取好友码
      const friendCode = Steam.getFriendCode(steamId)
      
      // 准备HTML数据
      const htmlData = {
        userName: userInfo.personaname,
        userNickname: userNickname,
        userAvatar: userInfo.avatarfull,
        userAvatarPath: userAvatarPath,
        friendCode: friendCode,
        totalGames: games.length,
        games: processedGames,
        totalPlaytime: this.formatGameTime(totalPlaytime),
        date: new Date().toLocaleDateString('zh-CN')
      }
      
      // 生成图片
      const img = await puppeteer.screenshot('eso', {
        ...htmlData,
        pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`,
        tplFile: './plugins/eso/resources/html/steam/gameList.html'
      })
      if (img) {
        return this.reply(img)
      } else {
        // 如果图片生成失败，返回文字信息
        const gameList = processedGames.map(game => 
          `${game.name} (${game.playtimeText})`
        ).join('\n')
        
        return this.reply([
          `${userInfo.personaname} 的游戏库`,
          `总游戏数: ${games.length}`,
          `总游戏时长: ${this.formatGameTime(totalPlaytime)}`,
          '',
          '最近游玩的游戏:',
          gameList
        ].join('\n'))
      }
    } catch (error) {
      console.error(`[ESO:Steam] 获取游戏库失败: ${error.message}`)
      return this.reply('获取游戏库失败，请稍后再试')
    }
  }

  // ===========================================
  // Steam成就
  // ===========================================
  async steamAchievements(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    let userId = String(e.user_id);
    let personID = e.at
    let isOther = false

    if (typeof personID != "undefined") {
      isOther = true
      userId = String(personID);
    }

    const match = e.msg.match(/^#?steam成就\s*(\d+)(?:\s+(.+))?$/)
    const gameId = match ? match[1] : ''
    const input = match && match[2] ? match[2].trim() : ''
    const steamId = input ? Steam.parseSteamId(input) : SteamUser.getUserSteamId(userId)
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    // 检查是否提供了游戏ID
    if (!gameId || gameId.trim() === '') {      const helpText = [
        'Steam成就查询使用说明',
        '',
        '命令格式: #steam成就 <游戏ID> [SteamID或好友码]',
        '',
        '参数说明:',
        '• 游戏ID: 必需参数，Steam游戏的数字ID',
        '• SteamID: 可选参数，要查询的Steam用户ID或好友码（不指定则使用绑定的账号或at的群友）',
        '',
        '如何获取游戏ID:',
        '1. 使用 #steam搜索 <游戏名> 搜索游戏',
        '2. 在搜索结果中找到游戏ID',
        '3. 或者访问 https://steamdb.info/ 搜索游戏',
        '',
        '示例:',
        '• #steam成就 730 - 查询CS2的成就（使用绑定账号）',
        '• #steam成就 730 @群友 - 查询at群友的CS2成就',
        '• #steam成就 730 76561198987654321 - 查询指定用户的CS2成就',
        '• #steam成就 730 1327308926 - 使用好友码查询CS2成就',
        '',
        '注意: 游戏ID是数字，不是游戏名称'
      ].join('\n')
      
      return this.reply(helpText)
    }
    
    if (!steamId) {
      if (isOther) {
        return this.reply('该群友尚未绑定Steam账号或指定Steam ID')
      }
      return this.reply('请先绑定Steam账号或指定Steam ID')
    }

    await this.reply('正在获取成就数据...')

    try {
      const stats = await Steam.getPlayerAchievements(steamId, gameId)
      if (!stats || !stats.achievements || !stats.achievements.length) {
        return this.reply('无法获取成就数据，可能是该游戏没有成就、用户未玩过此游戏或资料为私密')
      }

      const schema = await SteamAchievements.getSchema(gameId)
      const percents = await SteamAchievements.getPercents(gameId)

      const list = stats.achievements.map(a => {
        const meta = schema.get(a.apiname) || {}
        const pct = percents.get(a.apiname)
        return {
          name: meta.displayName || a.apiname,
          description: meta.description || '',
          icon: meta.icon || '',
          unlocked: a.achieved === 1,
          unlocktime: a.unlocktime || 0,
          unlockTimeText: a.achieved === 1 && a.unlocktime
            ? new Date(a.unlocktime * 1000).toLocaleDateString('zh-CN')
            : '',
          globalPercent: typeof pct === 'number' ? `${pct}` : ''
        }
      })
      // 已解锁在前，按解锁时间倒序
      list.sort((x, y) => (y.unlocked - x.unlocked) || (y.unlocktime - x.unlocktime))

      const unlockedCount = list.filter(i => i.unlocked).length
      const userInfo = await Steam.getUserInfo(steamId)
      const userName = userInfo?.personaname || `用户${steamId}`
      const gameName = stats.gameName || `App ${gameId}`

      const img = await puppeteer.screenshot('eso', {
        userName,
        gameName,
        playtime: '',
        totalCount: list.length,
        unlockedCount,
        progressPercent: list.length ? Math.round(unlockedCount / list.length * 100) : 0,
        achievements: list.slice(0, 20),
        date: new Date().toLocaleDateString('zh-CN'),
        pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`,
        tplFile: './plugins/eso/resources/html/steam/achievements.html'
      })

      if (img) return this.reply(img)
      return this.reply([
        `${userName} 的《${gameName}》成就`,
        `进度: ${unlockedCount}/${list.length}`,
        ...list.slice(0, 10).map(i => `${i.unlocked ? '✅' : '⬜'} ${i.name}`)
      ].join('\n'))
    } catch (error) {
      console.error(`[ESO:Steam] 成就查询失败: ${error.message}`)
      return this.reply('成就查询失败，请稍后再试')
    }
  }

  // ===========================================
  // Steam库存
  // ===========================================
  async steamInventory(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    let userId = String(e.user_id);
    let personID = e.at
    let isOther = false

    if (typeof personID != "undefined") {
      isOther = true
      userId = String(personID);
    }

    const match = e.msg.match(/^#?steam库存\s*(.+)$/)
    const input = match ? match[1].trim() : ''
    const steamId = input ? Steam.parseSteamId(input) : SteamUser.getUserSteamId(userId)
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    if (!steamId) {
      if(isOther) {
        return this.reply('该群友尚未绑定Steam账号或指定Steam ID')
      }
      else {
        return this.reply('请先绑定Steam账号或指定Steam ID')
      }
    }
    
    await this.reply('正在获取库存...')

    try {
      // Steam 社区库存（appid 753 = 社区物品：集换卡/背景/表情等）
      const url = `https://steamcommunity.com/inventory/${steamId}/753/6?l=schinese&count=50`
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        },
        timeout: 20000
      })
      if (!res || !res.ok) {
        return this.reply('无法获取库存，该用户的库存可能为私密')
      }
      const data = await res.json()
      if (!data || !data.assets || !data.assets.length) {
        return this.reply('库存为空或为私密')
      }

      const descMap = new Map()
      for (const d of data.descriptions || []) {
        descMap.set(`${d.classid}_${d.instanceid || 0}`, d)
      }

      const items = []
      for (const asset of data.assets.slice(0, 24)) {
        const d = descMap.get(`${asset.classid}_${asset.instanceid || 0}`)
        if (!d) continue
        const rarityTag = (d.tags || []).find(t => t.category === 'Rarity')
        items.push({
          name: d.market_name || d.name || '未知物品',
          description: d.type || '',
          icon: d.icon_url ? `https://community.akamai.steamstatic.com/economy/image/${d.icon_url}` : '',
          rarity: rarityTag ? rarityTag.localized_tag_name : '',
          rarityClass: rarityTag ? `rarity_${(rarityTag.internal_name || '').toLowerCase()}` : '',
          type: d.type || '',
          marketable: d.marketable === 1,
          tradable: d.tradable === 1
        })
      }

      const userInfo = await Steam.getUserInfo(steamId)
      const img = await puppeteer.screenshot('eso', {
        userName: userInfo?.personaname || `用户${steamId}`,
        totalItems: data.total_inventory_count || data.assets.length,
        marketableCount: items.filter(i => i.marketable).length,
        tradableCount: items.filter(i => i.tradable).length,
        items,
        date: new Date().toLocaleDateString('zh-CN'),
        pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`,
        tplFile: './plugins/eso/resources/html/steam/inventory.html'
      })

      if (img) return this.reply(img)
      return this.reply(`库存共 ${data.assets.length} 件物品（图片生成失败）`)
    } catch (error) {
      console.error(`[ESO:Steam] 库存查询失败: ${error.message}`)
      return this.reply('库存查询失败，请稍后再试')
    }
  }

  // ===========================================
  // Steam愿望单
  // ===========================================
  async steamWishlist(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    let userId = String(e.user_id);
    let personID = e.at
    let isOther = false

    if (typeof personID != "undefined") {
      isOther = true
      userId = String(personID);
    }

    const match = e.msg.match(/^#?steam愿望单\s*(.+)$/)
    const input = match ? match[1].trim() : ''
    const steamId = input ? Steam.parseSteamId(input) : SteamUser.getUserSteamId(userId)
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    if (!steamId) {
      if(isOther) {
        return this.reply('该群友尚未绑定Steam账号或指定Steam ID')
      }
      else {
        return this.reply('请先绑定Steam账号或指定Steam ID')
      }
    }
    
    await this.reply('正在获取愿望单...')

    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }

      // 分页拉取愿望单
      const all = {}
      for (let p = 0; p < 3; p++) {
        const res = await fetch(`https://store.steampowered.com/wishlist/profiles/${steamId}/wishlistdata/?p=${p}`, { headers, timeout: 20000 })
        if (!res || !res.ok) break
        const data = await res.json()
        if (!data || data.success === 2) break
        const keys = Object.keys(data)
        if (!keys.length) break
        for (const k of keys) all[k] = data[k]
        if (keys.length < 10) break
      }

      const appids = Object.keys(all)
      if (!appids.length) {
        return this.reply('愿望单为空或为私密')
      }

      const items = appids.slice(0, 24).map(appid => {
        const w = all[appid]
        const sub = (w.subs || [])[0] || {}
        const discount = sub.discount_pct || ''
        const price = sub.price ? `¥ ${(Number(sub.price) / 100).toFixed(2)}` : ''
        return {
          name: w.name || `App ${appid}`,
          headerImage: Steam.getHeaderImgUrlByAppid(appid),
          discount,
          price,
          originalPrice: '',
          releaseDate: '',
          addedDate: w.added ? new Date(w.added * 1000).toLocaleDateString('zh-CN') : '',
          tags: [],
          description: ''
        }
      })

      const userInfo = await Steam.getUserInfo(steamId)
      const img = await puppeteer.screenshot('eso', {
        userName: userInfo?.personaname || `用户${steamId}`,
        totalItems: appids.length,
        discountedCount: items.filter(i => i.discount).length,
        freeCount: items.filter(i => !i.price).length,
        items,
        date: new Date().toLocaleDateString('zh-CN'),
        pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`,
        tplFile: './plugins/eso/resources/html/steam/wishlist.html'
      })

      if (img) return this.reply(img)
      return this.reply(`愿望单共 ${appids.length} 个游戏（图片生成失败）`)
    } catch (error) {
      console.error(`[ESO:Steam] 愿望单查询失败: ${error.message}`)
      return this.reply('愿望单查询失败，请稍后再试')
    }
  }

  // ===========================================
  // Steam搜索
  // ===========================================
  async steamSearch(e) {
    const userId = e.user_id
    const match = e.msg.match(/^#?steam搜索\s*(.*)$/)
    const query = match[1]
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    // 检查是否提供了搜索关键词
    if (!query || query.trim().length === 0) {
      const helpText = [
        'Steam游戏搜索使用说明',
        '',
        '命令格式: #steam搜索 <关键词>',
        '',
        '参数说明:',
        '• 关键词: 必需参数，要搜索的游戏名称或关键词',
        '',
        '搜索建议:',
        '• 使用准确的游戏名称，如"Counter-Strike 2"',
        '• 可以使用英文或中文名称',
        '• 支持部分关键词搜索',
        '',
        '示例:',
        '• #steam搜索 CS2',
        '• #steam搜索 上古卷轴',
        '• #steam搜索 The Witcher 3',
        '',
        '注意: 搜索结果会显示游戏名称和游戏ID'
      ].join('\n')
      
      return this.reply(helpText)
    }
    
    try {
      // 搜索游戏
      const results = await Steam.searchGames(query.trim(), 10)
      if (!results || results.length === 0) {
        return this.reply('未找到相关游戏，请尝试其他关键词')
      }
      
      // 处理搜索结果
      const processedResults = results.map(game => ({
        name: game.name,
        appid: game.appid,
        headerImage: Steam.getHeaderImgUrlByAppid(game.appid),
        price: game.price || null,
        originalPrice: game.originalPrice || null,
        discount: game.discount || null,
        releaseDate: game.releaseDate || null,
        tags: game.tags || [],
        description: game.description || null
      }))
      
      // 准备HTML数据
      const htmlData = {
        query: query.trim(),
        totalResults: results.length,
        results: processedResults,
        hasMore: results.length >= 10,
        date: new Date().toLocaleDateString('zh-CN')
      }
      
      // 生成图片
      const img = await puppeteer.screenshot('eso', {
        ...htmlData,
        pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`,
        tplFile: './plugins/eso/resources/html/steam/search.html'
      })
      if (img) {
        return this.reply(img)
      } else {
        // 如果图片生成失败，返回文字信息
        const gameList = processedResults.map(game => 
          `${game.name} (ID: ${game.appid})`
        ).join('\n')
        
        return this.reply([
          `"${query.trim()}" 的搜索结果`,
          `找到 ${results.length} 个游戏:`,
          '',
          gameList
        ].join('\n'))
      }
    } catch (error) {
      console.error(`[ESO:Steam] 搜索游戏失败: ${error.message}`)
      return this.reply('搜索失败，请稍后再试')
    }
  }

  // ===========================================
  // Steam折扣
  // ===========================================
  async steamDiscounts(e) {
    const userId = e.user_id
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    try {
      // 获取当前折扣
      const deals = await Steam.getCurrentDiscounts()
      if (!deals || deals.length === 0) {
        return this.reply('暂无折扣信息，请稍后再试')
      }
      
      // 处理折扣数据
      const processedDeals = deals.slice(0, 10).map(deal => ({
        name: deal.name,
        appid: deal.appid,
        headerImage: Steam.getHeaderImgUrlByAppid(deal.appid),
        discount: deal.discount,
        originalPrice: deal.originalPrice || null,
        currentPrice: deal.currentPrice || null,
        releaseDate: deal.releaseDate || null,
        tags: deal.tags || [],
        description: deal.description || null,
        rating: deal.rating || null,
        ratingLabel: deal.ratingLabel || null
      }))
      
      // 计算统计信息
      const averageDiscount = Math.round(
        deals.reduce((sum, deal) => sum + deal.discount, 0) / deals.length
      )
      const maxDiscount = Math.max(...deals.map(deal => deal.discount))
      const freeCount = deals.filter(deal => deal.discount === 100).length
      
      // 准备HTML数据
      const htmlData = {
        totalDeals: deals.length,
        deals: processedDeals,
        averageDiscount,
        maxDiscount,
        freeCount,
        date: new Date().toLocaleDateString('zh-CN')
      }
      
      // 生成图片
      const img = await puppeteer.screenshot('eso', {
        ...htmlData,
        pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`,
        tplFile: './plugins/eso/resources/html/steam/discounts.html'
      })
      if (img) {
        return this.reply(img)
      } else {
        // 如果图片生成失败，返回文字信息
        const dealList = processedDeals.map(deal => 
          `${deal.name} (-${deal.discount}%)`
        ).join('\n')
        
        return this.reply([
          `Steam当前特惠`,
          `折扣游戏: ${deals.length}个`,
          `平均折扣: ${averageDiscount}%`,
          `最高折扣: ${maxDiscount}%`,
          `免费游戏: ${freeCount}个`,
          '',
          '热门折扣:',
          dealList
        ].join('\n'))
      }
    } catch (error) {
      console.error(`[ESO:Steam] 获取折扣信息失败: ${error.message}`)
      return this.reply('获取折扣信息失败，请稍后再试')
    }
  }

  // ===========================================
  // Steam统计
  // ===========================================
  async steamStats(e) {
    const userId = e.user_id
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    try {
      // 获取绑定统计
      const bindStats = SteamUser.getBindStats()
      const activityStats = SteamUser.getActivityStats()
      const pushStats = SteamPush.getPushStats()
      const monitoringStats = SteamPush.getMonitoringStats()
      
      const statsText = [
        'Steam功能统计',
        '',
        '用户绑定:',
        `总绑定用户: ${bindStats.total}`,
        `今日新增: ${bindStats.today}`,
        `本周新增: ${bindStats.thisWeek}`,
        `本月新增: ${bindStats.thisMonth}`,
        '',
        '用户活跃度:',
        `活跃用户: ${activityStats.active}`,
        `非活跃用户: ${activityStats.inactive}`,
        '',
        '推送设置:',
        `开启推送群组: ${pushStats.totalGroups}`,
        `开启游玩推送: ${pushStats.playPush}`,
        `开启状态推送: ${pushStats.statePush}`,
        '',
        '监控状态:',
        `监控中: ${monitoringStats.monitoring ? '是' : '否'}`,
        `监控用户: ${monitoringStats.total}`,
        `在线用户: ${monitoringStats.online}`,
        `游戏中用户: ${monitoringStats.gaming}`
      ].join('\n')
      
      return this.reply(statsText)
    } catch (error) {
      console.error(`[ESO:Steam] 获取统计信息失败: ${error.message}`)
      return this.reply('获取统计信息失败，请稍后再试')
    }
  }

  // ===========================================
  // Steam设置
  // ===========================================
  async steamSettings(e) {
    const userId = e.user_id
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    const hasApiKey = Steam.hasApiKey()
    const apiKeyCount = Steam.getApiKeys().length
    
    const settingsText = [
      'Steam功能设置',
      '',
      '当前配置:',
      `API密钥: ${hasApiKey ? `已设置 (${apiKeyCount}个)` : '未设置'}`,
      `代理设置: ${Steam.proxyUrl ? '已设置' : '未设置'}`,
      `地区代码: ${Steam.regionCode}`,
      '',
      'API密钥管理:',
      '• #steam添加apikey <密钥> - 添加Steam API密钥',
      '• #steam删除apikey <密钥> - 删除指定的API密钥',
      '• #steamapikey列表 - 查看当前API密钥列表',
      '',
      '使用说明:',
      '1. 设置API密钥: 使用 #steam添加apikey 命令添加API密钥',
      '2. 绑定账号: 使用 #steam绑定 <SteamID> 绑定账号',
      '3. 查看信息: 使用 #steam信息 查看用户信息',
      '4. 查看游戏: 使用 #steam游戏 查看游戏库',
      '5. 搜索游戏: 使用 #steam搜索 <关键词> 搜索游戏',
      '6. 查看折扣: 使用 #steam折扣 查看当前特惠',
      '',
      '注意事项:',
      '- 需要有效的Steam API密钥才能使用完整功能',
      '- 可以设置多个API密钥以提高稳定性',
      '- 部分功能可能受用户隐私设置限制',
      '- 建议设置API密钥以获得更好的体验'
    ].join('\n')
    
    return this.reply(settingsText)
  }

  // ===========================================
  // 生成Steam信息图片
  // ===========================================
  async generateSteamImage(data) {
    try {
      // 生成缓存键
      const cacheKey = md5(JSON.stringify(data))
      
      // 检查缓存
      if (steamImgCache.md5 === cacheKey && steamImgCache.img) {
        return steamImgCache.img
      }
      
      // 添加pluResPath到数据中
      const enhancedData = {
        ...data,
        pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`,
        tplFile: './plugins/eso/resources/html/steam/userInfo.html'
      }
      
      // 使用puppeteer生成图片
      const img = await puppeteer.screenshot('eso', enhancedData)
      
      if (img) {
        // 更新缓存
        steamImgCache.md5 = cacheKey
        steamImgCache.img = img
        return img
      }
      
      return null
    } catch (error) {
      console.error(`[ESO:Steam] 生成图片失败: ${error.message}`)
      return null
    }
  }

  // ===========================================
  // 准备Steam HTML数据
  // ===========================================
  async prepareSteamHTMLData(data) {
    const { userInfo, steamId, type } = data
    
    if (type === 'userInfo') {
      const friendCode = Steam.getFriendCode(steamId)
      const statusText = this.getStatusText(userInfo.personastate)
      const statusIcon = this.getStatusIcon(userInfo.personastate)
      const statusClass = this.getStatusClass(userInfo.personastate)
      
      // 格式化注册时间：YYYY-MM-DD HH:MM:SS
      const registerTime = userInfo.timecreated ? 
        new Date(userInfo.timecreated * 1000).toISOString().replace('T', ' ').substring(0, 19) : '未知'
      
      // 当前时间：YYYY-MM-DD HH:MM:SS
      const currentTime = new Date().toISOString().replace('T', ' ').substring(0, 19)
      
      let gameImage = ''
      let gameTime = ''
      let gameImagePath = ''
      let avatarImagePath = ''
      
      if (userInfo.gameextrainfo && userInfo.gameid) {
        gameImage = Steam.getHeaderImgUrlByAppid(userInfo.gameid)
        // 获取游戏图片路径
        gameImagePath = await this.getSteamImagePath(gameImage, 'games', userInfo.gameid)
      }
      
      // 获取用户头像路径
      if (userInfo.avatarfull) {
        avatarImagePath = await this.getSteamImagePath(userInfo.avatarfull, 'avatar', steamId)
      }
      
      return {
        userInfo,
        steamId,
        friendCode,
        statusText,
        statusIcon,
        statusClass,
        registerTime,
        gameImage,
        gameImagePath,
        avatarImagePath,
        gameTime,
        currentTime,
        date: new Date().toLocaleDateString('zh-CN')
      }
    }
    
    return {}
  }

  // ===========================================
  // 缓存Steam图片
  // ===========================================
  async cacheSteamImage(data) {
    // TODO: 实现Steam图片缓存功能
    return null
  }

  // ===========================================
  // 生成错误图片
  // ===========================================
  async generateErrorImage(errorMsg) {
    // TODO: 实现错误图片生成功能
    return null
  }

  // ===========================================
  // Steam API密钥管理
  // ===========================================
  async steamAddApiKey(e) {
    const userId = e.user_id
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    // 检查权限（只有主人可以添加API密钥）
    if (!e.isMaster) {
      return this.reply('只有主人可以添加API密钥')
    }
    
    const match = e.msg.match(/^#?steam添加apikey\s*(.*)$/)
    const apiKey = match[1]
    
    // 检查是否提供了API密钥
    if (!apiKey || apiKey.trim() === '') {
      const helpText = [
        'Steam API密钥添加使用说明',
        '',
        '命令格式: #steam添加apikey <API密钥>',
        '',
        '参数说明:',
        '• API密钥: 必需参数，Steam Web API密钥',
        '',
        '如何获取Steam API密钥:',
        '1. 访问 https://steamcommunity.com/dev/apikey',
        '2. 登录你的Steam账号',
        '3. 填写域名（可以填写 localhost）',
        '4. 同意条款并生成API密钥',
        '5. 复制生成的API密钥',
        '',
        '示例:',
        '• #steam添加apikey ABCDEF1234567890ABCDEF1234567890',
        '',
        '注意事项:',
        '• 只有主人可以添加API密钥',
        '• API密钥是敏感信息，请妥善保管',
        '• 可以添加多个API密钥以提高稳定性',
        '• 建议定期更换API密钥'
      ].join('\n')
      
      return this.reply(helpText)
    }
    
    try {
      const added = Steam.addApiKey(apiKey.trim())
      if (added) {
        return this.reply(`API密钥添加成功！当前共有 ${Steam.getApiKeys().length} 个API密钥`)
      } else {
        return this.reply('该API密钥已存在')
      }
    } catch (error) {
      return this.reply(`添加API密钥失败: ${error.message}`)
    }
  }

  async steamRemoveApiKey(e) {
    const userId = e.user_id
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    // 检查权限（只有主人可以删除API密钥）
    if (!e.isMaster) {
      return this.reply('只有主人可以删除API密钥')
    }
    
    const match = e.msg.match(/^#?steam删除apikey\s*(.*)$/)
    const apiKey = match[1]
    
    // 检查是否提供了API密钥
    if (!apiKey || apiKey.trim() === '') {
      const helpText = [
        'Steam API密钥删除使用说明',
        '',
        '命令格式: #steam删除apikey <API密钥或序号>',
        '',
        '参数说明:',
        '• API密钥: 要删除的完整Steam Web API密钥',
        '• 序号: 要删除的密钥序号（#steamapikey列表 中显示的序号）',
        '',
        '示例:',
        '• #steam删除apikey1 - 删除列表中第1个密钥',
        '• #steam删除apikey ABCDEF1234567890ABCDEF1234567890 - 按完整密钥删除',
        '',
        '注意事项:',
        '• 只有主人可以删除API密钥',
        '• 删除前可用 #steamapikey列表 确认序号',
        '• 删除后该密钥将无法恢复',
        '• 建议保留至少一个API密钥'
      ].join('\n')
      
      return this.reply(helpText)
    }
    
    try {
      const input = apiKey.trim()
      let targetKey = input
      let indexDesc = ''
      
      // 纯数字且长度<=2位：按序号删除（序号为 #steamapikey列表 中的1基序号）
      if (/^\d{1,2}$/.test(input)) {
        const apiKeys = Steam.getApiKeys()
        const idx = parseInt(input, 10) - 1
        if (idx < 0 || idx >= apiKeys.length) {
          return this.reply(`无效的序号，请输入1-${apiKeys.length}之间的数字\n可使用 #steamapikey列表 查看当前序号`)
        }
        targetKey = apiKeys[idx]
        indexDesc = `第 ${idx + 1} 个 `
      }
      
      const removed = Steam.removeApiKey(targetKey)
      if (removed) {
        const masked = targetKey.length > 8 ?
          `${targetKey.substring(0, 4)}...${targetKey.substring(targetKey.length - 4)}` :
          targetKey
        return this.reply(`${indexDesc}API密钥 ${masked} 删除成功！当前共有 ${Steam.getApiKeys().length} 个API密钥`)
      } else {
        return this.reply('未找到指定的API密钥')
      }
    } catch (error) {
      return this.reply(`删除API密钥失败: ${error.message}`)
    }
  }

  async steamApiKeyList(e) {
    const userId = e.user_id
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    // 检查权限（只有主人可以查看API密钥列表）
    if (!e.isMaster) {
      return this.reply('只有主人可以查看API密钥列表')
    }
    
    try {
      const apiKeys = Steam.getApiKeys()
      
      // 确保apiKeys是数组
      if (!apiKeys || !Array.isArray(apiKeys)) {
        console.error(`[ESO:Steam] getApiKeys() 返回了非数组值:`, apiKeys)
        return this.reply('获取API密钥列表时出现错误，请检查配置')
      }
      
      if (apiKeys.length === 0) {
        return this.reply('当前没有配置API密钥')
      }
      
      const keyList = apiKeys.map((key, index) => {
        if (!key || typeof key !== 'string') {
          console.error(`[ESO:Steam] 发现无效的API密钥:`, key)
          return `${index + 1}. [无效密钥]`
        }
        const maskedKey = key.length > 8 ? 
          `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : 
          key
        return `${index + 1}. ${maskedKey}`
      }).join('\n')
      
      const response = [
        `当前配置了 ${apiKeys.length} 个API密钥:`,
        '',
        keyList,
        '',
        '注意: 为了安全起见，API密钥已部分隐藏',
        '提示: 使用 #steam删除apikey<序号> 可按序号删除'
      ].join('\n')
      
      return this.reply(response)
    } catch (error) {
      console.error(`[ESO:Steam] steamApiKeyList 错误:`, error)
      return this.reply(`获取API密钥列表时出现错误: ${error.message}`)
    }
  }

  // ===========================================
  // 获取状态文本
  // ===========================================
  getStatusText(personastate) {
    const statusMap = {
      0: '离线',
      1: '在线',
      2: '忙碌',
      3: '离开',
      4: '打盹',
      5: '想交易',
      6: '想玩游戏'
    }
    return statusMap[personastate] || '未知'
  }

  // ===========================================
  // 获取状态图标
  // ===========================================
  getStatusIcon(personastate) {
    const iconMap = {
      0: '⚫',           // 离线 - 灰色圆圈
      1: '🟢',           // 在线 - 绿色圆圈
      2: '🔴',           // 忙碌 - 红色圆圈
      3: '🕐',           // 离开 - 钟表图标
      4: '🌙',           // 打盹 - 月亮图标
      5: '💰',           // 想交易 - 金钱图标
      6: '🎮'            // 想玩游戏 - 游戏机图标
    }
    return iconMap[personastate] || '⚫'
  }

  // ===========================================
  // 获取状态CSS类
  // ===========================================
  getStatusClass(personastate) {
    const classMap = {
      0: 'offline',           // 离线 - 灰色圆圈
      1: 'online',            // 在线 - 绿色圆圈
      2: 'busy',              // 忙碌 - 红色圆圈
      3: 'away',              // 离开 - 钟表图标
      4: 'snooze',            // 打盹 - 月亮图标
      5: 'looking_to_trade',  // 想交易 - 金钱图标
      6: 'looking_to_play'    // 想玩游戏 - 游戏机图标
    }
    return classMap[personastate] || 'offline'
  }

  // ===========================================
  // 格式化时间
  // ===========================================
  formatTime(timestamp) {
    if (!timestamp) return '未知'
    const date = new Date(timestamp * 1000)
    return date.toLocaleString('zh-CN')
  }

  // ===========================================
  // 格式化游戏时间
  // ===========================================
  formatGameTime(minutes) {
    if (!minutes || minutes === 0) return '0分钟'
    
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    
    if (hours === 0) {
      return `${remainingMinutes}分钟`
    } else if (remainingMinutes === 0) {
      return `${hours}小时`
    } else {
      return `${hours}小时${remainingMinutes}分钟`
    }
  }

  // ===========================================
  // 下载Steam图片
  // ===========================================
  async downloadSteamImage(imageUrl, type, identifier) {
    if (!imageUrl || !type || !identifier) {
      return null
    }

    try {
      // 创建图片目录
      const imageDir = path.join(STEAM_IMAGE_PATH, type)
      if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true })
      }

      // 生成文件名
      const fileName = `${identifier}.jpg`
      const filePath = path.join(imageDir, fileName)

      // 检查文件是否已存在、非空且未过期
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath)
        const now = Date.now()
        const maxAge = type === 'avatar' ? 3 * 24 * 60 * 60 * 1000 : 10 * 24 * 60 * 60 * 1000 // 3天或10天
        
        if (stats.size > 0 && now - stats.mtime.getTime() < maxAge) {
          // 文件存在且未过期，直接返回文件名
          return fileName
        }
      }

      // 使用Bot.download方法下载图片（与TTC保持一致）
      console.log(`[ESO:Steam] 开始下载图片: ${imageUrl} -> ${fileName}`)
      const success = await Bot.download(imageUrl, filePath)
      
      // 校验下载结果：文件必须存在且非空（防止缓存空文件/错误页导致无法回退）
      if (success && fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath)
        if (stats.size > 0) {
          console.log(`[ESO:Steam] 图片下载成功: ${fileName}`)
          return fileName
        }
      }
      // 下载失败或文件为空：删除坏文件，返回 null 让调用方回退
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch (_) {}
      console.warn(`[ESO:Steam] 下载图片失败或文件为空: ${imageUrl}`)
      return null
    } catch (error) {
      console.error(`[ESO:Steam] 下载图片时出错: ${error.message}`)
      return null
    }
  }

  // ===========================================
  // 获取Steam图片路径（用于HTML模板）
  // ===========================================
  async getSteamImagePath(imageUrl, type, identifier) {
    if (!imageUrl || !type || !identifier) {
      return null
    }

    // 下载图片并获取文件名
    const fileName = await this.downloadSteamImage(imageUrl, type, identifier)
    if (!fileName) {
      return null
    }

    // 返回相对于HTML模板的路径
    // HTML模板中使用 {{pluResPath}}../../../data/eso/custome_resources/steam/images/{{type}}/{{fileName}}
    // 所以这里只需要返回文件名即可
    return fileName
  }

  // ===========================================
  // 预下载图片（保持向后兼容）
  // ===========================================
  async preDownloadImage(imageUrl, type, identifier) {
    const fileName = await this.downloadSteamImage(imageUrl, type, identifier)
    return fileName !== null
  }
} 