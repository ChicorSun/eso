import plugin from '../../../lib/plugins/plugin.js'
import common from "../../../lib/common/common.js"
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import database from '../model/database.js'
import SteamUser from '../model/steamUser.js'
import SteamPush from '../model/steamPush.js'
import Steam from '../model/steam.js'
import md5 from 'md5'
import fs from 'node:fs'
import fetch from 'node-fetch'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import YAML from 'yaml'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ===========================================
// Steam 路径配置
// ===========================================
const STEAM_BASE_PATH = './plugins/eso/custome_resources/steam/'
const STEAM_CONFIG_PATH = path.join(STEAM_BASE_PATH, 'config/')
const STEAM_CACHE_PATH = path.join(STEAM_BASE_PATH, 'cache/')
const STEAM_IMAGE_PATH = path.join(STEAM_BASE_PATH, 'images/')
const STEAM_DATA_PATH = path.join(STEAM_BASE_PATH, 'data/')

// Steam 配置文件具体路径
const STEAM_CONFIG_FILE = path.join(STEAM_CONFIG_PATH, 'steamConfig.json')
const STEAM_DEFAULT_CONFIG_FILE = path.join(STEAM_CONFIG_PATH, 'default.json')

// 旧数据文件路径（用于迁移）
const OLD_CONFIG_PATH = './plugins/eso/custome_resources/config/steam.yaml'
const OLD_TOKENS_PATH = './plugins/eso/custome_resources/config/steam_tokens.json'
const OLD_USERS_PATH = './plugins/eso/custome_resources/config/steam_users.json'

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
      ]
    })
    
    // 初始化目录
    initSteamDirectories()
    
    // 执行数据迁移（如果存在旧数据）
    this.migrateOldData()
    
    // 启动清理任务
    this.startCleanupTask()
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
  // 数据迁移功能
  // ===========================================
  migrateOldData() {
    try {
      console.log('[ESO:Steam] 开始检查旧数据文件...')
      
      let migratedCount = 0
      
      // 1. 迁移Steam配置文件 (steam.yaml -> steamConfig.json)
      if (fs.existsSync(OLD_CONFIG_PATH)) {
        console.log('[ESO:Steam] 发现旧配置文件，开始迁移...')
        this.migrateConfigFile()
        migratedCount++
      }
      
      // 2. 迁移用户绑定数据 (steam_users.json)
      if (fs.existsSync(OLD_USERS_PATH)) {
        console.log('[ESO:Steam] 发现旧用户数据，开始迁移...')
        this.migrateUserData()
        migratedCount++
      }
      
      // 3. 迁移登录token数据 (steam_tokens.json)
      if (fs.existsSync(OLD_TOKENS_PATH)) {
        console.log('[ESO:Steam] 发现旧token数据，开始迁移...')
        this.migrateTokenData()
        migratedCount++
      }
      
      if (migratedCount > 0) {
        console.log(`[ESO:Steam] 数据迁移完成，共迁移了 ${migratedCount} 个文件`)
      } else {
        console.log('[ESO:Steam] 未发现需要迁移的旧数据文件')
      }
    } catch (error) {
      console.error('[ESO:Steam] 数据迁移过程中出错:', error.message)
    }
  }

  // ===========================================
  // 迁移配置文件
  // ===========================================
  migrateConfigFile() {
    try {
      const oldConfig = YAML.parse(fs.readFileSync(OLD_CONFIG_PATH, 'utf8'))
      
      // 转换为新格式
      const newConfig = {
        apiKeys: oldConfig.apiKey ? [oldConfig.apiKey] : [],
        proxyUrl: oldConfig.proxyUrl || '',
        regionCode: oldConfig.regionCode || 'cn',
        monitoring: oldConfig.monitoring || {
          checkInterval: 30000,
          autoStart: false
        },
        push: oldConfig.push || {
          defaultOnlinePush: true,
          defaultGamePush: true
        },
        migrated: true,
        migrateTime: new Date().toISOString()
      }
      
      // 保存新配置文件
      fs.writeFileSync(STEAM_CONFIG_FILE, JSON.stringify(newConfig, null, 2))
      console.log('[ESO:Steam] 配置文件迁移成功')
      
      // 删除旧文件
      fs.unlinkSync(OLD_CONFIG_PATH)
      console.log('[ESO:Steam] 旧配置文件已删除')
    } catch (error) {
      console.error('[ESO:Steam] 配置文件迁移失败:', error.message)
    }
  }

  // ===========================================
  // 迁移用户数据
  // ===========================================
  migrateUserData() {
    try {
      const oldUsers = JSON.parse(fs.readFileSync(OLD_USERS_PATH, 'utf8'))
      const newUsers = {}
      
      // 转换用户数据格式
      for (const [qqId, userData] of Object.entries(oldUsers)) {
        if (userData.steamId) {
          newUsers[qqId] = {
            steamId: userData.steamId,
            steamName: userData.steamName || userData.personaname || '',
            bindTime: userData.bindTime || userData.login_time || new Date().toISOString(),
            lastUpdate: userData.lastUpdate || new Date().toISOString(),
            lastOnlineCheck: null,
            lastGameCheck: null
          }
        }
      }
      
      // 保存新用户数据
      const newUserData = {
        users: newUsers,
        lastUpdate: new Date().toISOString(),
        migrated: true,
        migrateTime: new Date().toISOString()
      }
      
      fs.writeFileSync(path.join(STEAM_DATA_PATH, 'steam_users.json'), JSON.stringify(newUserData, null, 2))
      console.log(`[ESO:Steam] 用户数据迁移成功，共迁移 ${Object.keys(newUsers).length} 个用户`)
      
      // 删除旧文件
      fs.unlinkSync(OLD_USERS_PATH)
      console.log('[ESO:Steam] 旧用户数据文件已删除')
    } catch (error) {
      console.error('[ESO:Steam] 用户数据迁移失败:', error.message)
    }
  }

  // ===========================================
  // 迁移Token数据
  // ===========================================
  migrateTokenData() {
    try {
      const oldTokens = JSON.parse(fs.readFileSync(OLD_TOKENS_PATH, 'utf8'))
      
      // 将token数据转换为用户绑定数据（如果用户还没有绑定）
      for (const [qqId, tokenData] of Object.entries(oldTokens)) {
        if (tokenData.steam_id && !SteamUser.getUserSteamId(qqId)) {
          // 如果用户还没有绑定，则创建绑定
          SteamUser.bindUser(qqId, tokenData.steam_id, '')
          console.log(`[ESO:Steam] 从token数据创建用户绑定: QQ ${qqId} -> Steam ${tokenData.steam_id}`)
        }
      }
      
      // 删除旧token文件
      fs.unlinkSync(OLD_TOKENS_PATH)
      console.log('[ESO:Steam] 旧token数据文件已删除')
    } catch (error) {
      console.error('[ESO:Steam] Token数据迁移失败:', error.message)
    }
  }

  // ===========================================
  // Steam帮助
  // ===========================================
        async steamHelp(e) {
    const helpText = `Steam功能使用说明：

 基础指令：
   • #steam绑定 <SteamID> - 绑定Steam账号
   • #steam解绑 <SteamID> - 解除Steam绑定
   • #steam信息 [SteamID] - 查看Steam用户信息
   • #steam在线 [SteamID] - 查看在线状态

 游戏相关：
   • #steam游戏 [SteamID] - 查看游戏库
   • #steam成就 <游戏ID> [SteamID] - 查看游戏成就
   • #steam库存 [SteamID] - 查看库存
   • #steam愿望单 [SteamID] - 查看愿望单

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
    const match = e.msg.match(/^#?steam绑定\s*(\d*)$/)
    const steamId = match[1]
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    // 检查是否提供了Steam ID
    if (!steamId || steamId.trim() === '') {
      const helpText = [
        'Steam绑定使用说明',
        '',
        '命令格式: #steam绑定 <SteamID>',
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
         '• #steam绑定 76561198987654321',
        '',
        '注意: Steam ID是17位数字，不是用户名'
      ].join('\n')
      
      return this.reply(helpText)
    }
    
    // 检查API密钥
    if (!Steam.hasApiKey()) {
      return this.reply('未配置Steam API密钥，无法进行绑定操作\n请使用 #steam设置 查看设置说明')
    }
    
    // 验证Steam ID格式
    if (!Steam.validateSteamId(steamId)) {
      return this.reply('Steam ID格式不正确，请输入17位数字的Steam ID')
    }
    
    try {
      // 尝试获取用户信息验证Steam ID是否有效
      const userInfo = await Steam.getUserInfo(steamId)
      if (!userInfo) {
        return this.reply('无法获取Steam用户信息，请检查Steam ID是否正确')
      }
      
      // 绑定用户
      const result = SteamUser.bindUser(userId, steamId, userInfo.personaname)
      if (result.success) {
        // 生成绑定成功图片
        const bindData = {
          userName: userInfo.personaname,
          steamId: steamId,
          qqUser: e.sender.card || e.sender.nickname || `用户${userId}`,
          bindTime: new Date().toLocaleString('zh-CN', {
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
            ...bindData,
            pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`,
            tplFile: './plugins/eso/resources/html/steam/bindSuccess.html'
          })
          
          return this.reply(img)
        } catch (error) {
          console.error(`[ESO:Steam] 生成绑定成功图片失败:`, error)
          // 如果图片生成失败，回退到文字回复
          return this.reply(`绑定成功！\nSteam用户: ${userInfo.personaname}\nSteam ID: ${steamId}`)
        }
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

  // ===========================================
  // Steam解绑
  // ===========================================
  async steamUnbind(e) {
    const userId = e.user_id
    const match = e.msg.match(/^#?steam解绑\s*(\d*)$/)
    const steamId = match[1]
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    // 检查是否提供了Steam ID
    if (!steamId || steamId.trim() === '') {
      const helpText = [
        'Steam解绑使用说明',
        '',
        '命令格式: #steam解绑 <SteamID>',
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
        '',
        '注意: Steam ID是17位数字，不是用户名'
      ].join('\n')
      
      return this.reply(helpText)
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

    const match = e.msg.replace("信息", "").replace("状态", "").match(/^#?steam\s*(\d*)$/)
    const steamId = match[1] || SteamUser.getUserSteamId(userId)
    
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

    const match = e.msg.match(/^#?steam在线\s*(\d*)$/)
    const steamId = match[1] || SteamUser.getUserSteamId(userId)
    
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

    const match = e.msg.match(/^#?steam游戏\s*(\d*)$/)
    const steamId = match[1] || SteamUser.getUserSteamId(userId)
    
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
      
      // 处理游戏数据
      const processedGames = games.slice(0, 10).map(game => ({
        name: game.name,
        appid: game.appid,
        headerImage: Steam.getHeaderImgUrlByAppid(game.appid),
        playtime_forever: game.playtime_forever || 0,
        playtime_2weeks: game.playtime_2weeks || 0,
        playtimeText: this.formatGameTime(game.playtime_forever),
        recentPlaytimeText: game.playtime_2weeks ? this.formatGameTime(game.playtime_2weeks) : null
      }))
      
      // 计算总游戏时长
      const totalPlaytime = games.reduce((sum, game) => sum + (game.playtime_forever || 0), 0)
      
      // 准备HTML数据
      const htmlData = {
        userName: userInfo.personaname,
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

    const match = e.msg.match(/^#?steam成就\s*(\d*)\s*(\d*)$/)
    const gameId = match[1]
    const steamId = match[2] || SteamUser.getUserSteamId(userId)
    
    // 检查限流
    if (!checkRateLimit(userId)) {
      return this.reply('请求过于频繁，请稍后再试')
    }
    
    // 检查是否提供了游戏ID
    if (!gameId || gameId.trim() === '') {
      const helpText = [
        'Steam成就查询使用说明',
        '',
        '命令格式: #steam成就 <游戏ID> [SteamID]',
        '',
        '参数说明:',
        '• 游戏ID: 必需参数，Steam游戏的数字ID',
        '• SteamID: 可选参数，要查询的Steam用户ID（不指定则使用绑定的账号或at的群友）',
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
        '',
        '注意: 游戏ID是数字，不是游戏名称'
      ].join('\n')
      
      return this.reply(helpText)
    }
    
    return this.reply('Steam成就查询功能开发中...')
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

    const match = e.msg.match(/^#?steam库存\s*(\d*)$/)
    const steamId = match[1] || SteamUser.getUserSteamId(userId)
    
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
    
    return this.reply('Steam库存查询功能开发中...')
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

    const match = e.msg.match(/^#?steam愿望单\s*(\d*)$/)
    const steamId = match[1] || SteamUser.getUserSteamId(userId)
    
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
    
    return this.reply('Steam愿望单查询功能开发中...')
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
      
      // 格式化最后在线时间：YYYY-MM-DD HH:MM:SS
      const lastOnline = userInfo.lastlogoff ? 
        new Date(userInfo.lastlogoff * 1000).toISOString().replace('T', ' ').substring(0, 19) : '未知'
      
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
        lastOnline,
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
        '命令格式: #steam删除apikey <API密钥>',
        '',
        '参数说明:',
        '• API密钥: 必需参数，要删除的Steam Web API密钥',
        '',
        '如何查看当前API密钥:',
        '1. 使用 #steamapikey列表 查看当前配置的API密钥',
        '2. 复制要删除的API密钥（部分隐藏的格式）',
        '3. 使用完整密钥进行删除操作',
        '',
        '示例:',
        '• #steam删除apikey ABCDEF1234567890ABCDEF1234567890',
        '',
        '注意事项:',
        '• 只有主人可以删除API密钥',
        '• 删除前请确认API密钥正确',
        '• 删除后该密钥将无法恢复',
        '• 建议保留至少一个API密钥'
      ].join('\n')
      
      return this.reply(helpText)
    }
    
    try {
      const removed = Steam.removeApiKey(apiKey.trim())
      if (removed) {
        return this.reply(`API密钥删除成功！当前共有 ${Steam.getApiKeys().length} 个API密钥`)
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
        '注意: 为了安全起见，API密钥已部分隐藏'
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

      // 检查文件是否已存在且未过期
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath)
        const now = Date.now()
        const maxAge = type === 'avatar' ? 3 * 24 * 60 * 60 * 1000 : 10 * 24 * 60 * 60 * 1000 // 3天或10天
        
        if (now - stats.mtime.getTime() < maxAge) {
          // 文件存在且未过期，直接返回文件名
          return fileName
        }
      }

      // 使用Bot.download方法下载图片（与TTC保持一致）
      console.log(`[ESO:Steam] 开始下载图片: ${imageUrl} -> ${fileName}`)
      const success = await Bot.download(imageUrl, filePath)
      
      if (success) {
        console.log(`[ESO:Steam] 图片下载成功: ${fileName}`)
        return fileName
      } else {
        console.warn(`[ESO:Steam] 下载图片失败: Bot.download返回false`)
        return null
      }
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
    // HTML模板中使用 {{pluResPath}}../custome_resources/steam/images/{{type}}/{{fileName}}
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