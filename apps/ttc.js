import plugin from '../../../lib/plugins/plugin.js'
import common from "../../../lib/common/common.js"
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import database from '../model/database.js'
import TTC from '../model/ttc.js'
import md5 from 'md5'
import fs from 'node:fs'
import fetch from 'node-fetch'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ===========================================
// HTML截图缓存
// ===========================================
let ttcImgCache = {
  md5: '',
  img: ''
}

// ===========================================
// TTC 路径配置
// ===========================================
const TTC_BASE_PATH = './plugins/eso/custome_resources/ttc/'
const TTC_CONFIG_PATH = path.join(TTC_BASE_PATH, 'config/')
const TTC_CACHE_PATH = path.join(TTC_BASE_PATH, 'cache/')
const TTC_IMAGE_PATH = path.join(TTC_BASE_PATH, 'images/')
const TTC_DATA_PATH = path.join(TTC_BASE_PATH, 'data/')

// TTC 配置文件具体路径
const TTC_CONFIG_FILE = path.join(TTC_CONFIG_PATH, 'ttcConfig.json')
// 默认服务器配置文件
const TTC_DEFAULT_SERVER_FILE = path.join(TTC_CONFIG_PATH, 'default.json')
// 验证码配置文件
const TTC_CAPTCHA_CONFIG_PATH = path.join(TTC_CONFIG_PATH, 'captcha.json')

// 验证码服务配置（已移除第三方服务）
const CAPTCHA_SERVICES = {
  // 已移除所有第三方验证码破解服务
  // 现在只支持手动处理验证码
  MANUAL: {
    name: '手动处理',
    freeTier: {
      dailyLimit: 0,
      costPerSolve: 0
    }
  }
}
// NA服务器价格表文件（存放在data目录）
const TTC_PRICE_TABLE_JSON_NA = path.join(TTC_DATA_PATH, 'PriceTableNA.json')
const TTC_PRICE_TABLE_LUA_NA = path.join(TTC_DATA_PATH, 'PriceTableNA.lua')
// EU服务器价格表文件（存放在data目录）
const TTC_PRICE_TABLE_JSON_EU = path.join(TTC_DATA_PATH, 'PriceTableEU.json')
const TTC_PRICE_TABLE_LUA_EU = path.join(TTC_DATA_PATH, 'PriceTableEU.lua')
// 通用文件（存放在data目录）
const TTC_LOOKUP_TABLE_LUA = path.join(TTC_DATA_PATH, 'ItemLookUpTable_ZH.lua')
const TTC_PRICE_ZIP_NA = path.join(TTC_CACHE_PATH, 'PriceTableNA.zip')
const TTC_PRICE_ZIP_EU = path.join(TTC_CACHE_PATH, 'PriceTableEU.zip')

// ===========================================
// TTC 时间间隔配置
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
  PRICE_CACHE_AGE: 1000 * 60 * 60,    // 价格缓存1小时
  IMAGE_CACHE_AGE: 1000 * 60 * 15     // 图片缓存15分钟
}

// 文件清理配置
const CLEANUP_CONFIG = {
  FILE_MAX_AGE: 24 * 60 * 60 * 1000,  // 文件最大保存24小时
  CLEANUP_INTERVAL: 60 * 60 * 1000,   // 每小时清理一次过期文件
  CACHE_CLEANUP_INTERVAL: 300000      // 5分钟清理一次内存缓存
}

// TTC API配置
const TTC_API = {
  PRICE_DOWNLOAD_URL_NA: 'https://us.tamrieltradecentre.com/download/PriceTable',
  PRICE_DOWNLOAD_URL_EU: 'https://eu.tamrieltradecentre.com/download/PriceTable',
  BASE_TRADE_URL_US: 'https://us.tamrieltradecentre.com/pc/Trade/SearchResult',
  BASE_TRADE_URL_EU: 'https://eu.tamrieltradecentre.com/pc/Trade/SearchResult',
  REQUEST_TIMEOUT: 30000              // 请求超时30秒
}

// 服务器配置
const SERVER_CONFIG = {
  NA: {
    name: '美服',
    code: 'na',
    downloadUrl: TTC_API.PRICE_DOWNLOAD_URL_NA,
    tradeUrl: TTC_API.BASE_TRADE_URL_US,
    priceTableJson: TTC_PRICE_TABLE_JSON_NA,
    priceTableLua: TTC_PRICE_TABLE_LUA_NA,
    priceZip: TTC_PRICE_ZIP_NA
  },
  EU: {
    name: '欧服',
    code: 'eu',
    downloadUrl: TTC_API.PRICE_DOWNLOAD_URL_EU,
    tradeUrl: TTC_API.BASE_TRADE_URL_EU,
    priceTableJson: TTC_PRICE_TABLE_JSON_EU,
    priceTableLua: TTC_PRICE_TABLE_LUA_EU,
    priceZip: TTC_PRICE_ZIP_EU
  }
}

// ===========================================
// 目录初始化函数
// ===========================================
function initTTCDirectories() {
  const directories = [
    TTC_BASE_PATH,
    TTC_CONFIG_PATH,
    TTC_CACHE_PATH,
    TTC_IMAGE_PATH,
    TTC_DATA_PATH
  ]
  
  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true })
        logger.info(`[TTC] 创建目录: ${dir}`)
      } catch (error) {
        logger.error(`[TTC] 创建目录失败: ${dir}, 错误: ${error.message}`)
      }
    }
  })
}

// 初始化目录
initTTCDirectories()

// 限流Map
const rateLimit = new Map()

// 缓存管理
class TTCCache {
  constructor(maxAge = CACHE_CONFIG.DEFAULT_MAX_AGE) {
    this.cache = new Map()
    this.maxAge = maxAge
  }

  get(key) {
    const item = this.cache.get(key)
    if (item && Date.now() - item.timestamp < this.maxAge) {
      return item.value
    }
    this.cache.delete(key)
    return null
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    })
  }

  has(key) {
    return this.get(key) !== null
  }

  clear() {
    this.cache.clear()
  }
}

// 全局缓存实例
const ttcCache = new TTCCache(CACHE_CONFIG.DEFAULT_MAX_AGE)
const priceCache = new TTCCache(CACHE_CONFIG.PRICE_CACHE_AGE)
const imageCache = new TTCCache(CACHE_CONFIG.IMAGE_CACHE_AGE)

// 全局定时任务状态
let dailyUpdateScheduled = false
let dailyUpdateTimer = null

// 全局更新状态
let isUpdatingPriceTable = false
let initialUpdateCompleted = false

// 默认服务器配置
let defaultServerConfig = {
  server: 'NA',  // 默认美服
  name: '美服'
}

// 截图计数器
let screenshotCounter = 0

// 清理截图文件函数
async function cleanupScreenshots() {
  try {
    const screenshotDir = path.join(TTC_CACHE_PATH, 'screenshots')
    if (fs.existsSync(screenshotDir)) {
      const files = fs.readdirSync(screenshotDir)
      const screenshotFiles = files.filter(file => file.startsWith('screenshot_') && file.endsWith('.png'))
      
      if (screenshotFiles.length > 0) {
        for (const file of screenshotFiles) {
          const filePath = path.join(screenshotDir, file)
          fs.unlinkSync(filePath)
        }
        logger.info(`[TTC] 清理了 ${screenshotFiles.length} 个旧截图文件`)
      }
    }
  } catch (error) {
    logger.error(`[TTC] 清理截图文件失败: ${error.message}`)
  }
}

// 截图工具函数
async function takeDebugScreenshot(browserPage, debugInfo) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
    screenshotCounter++
    
    // 创建截图目录 - 使用TTC缓存目录
    const screenshotDir = path.join(TTC_CACHE_PATH, 'screenshots')
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true })
    }
    
    // 生成文件名：screenshot_时间_行数_序号_描述.png
    const fileName = `screenshot_${timestamp}_L${debugInfo.line}_${screenshotCounter.toString().padStart(3, '0')}_${debugInfo.description}.png`
    const filePath = path.join(screenshotDir, fileName)
    
    // 截图
    await browserPage.screenshot({
      path: filePath,
      fullPage: true
    })
    
    logger.info(`[TTC] 调试截图已保存: ${fileName} (${debugInfo.description})`)
    return filePath
  } catch (error) {
    logger.error(`[TTC] 截图失败: ${error.message}`)
    return null
  }
}

export class ttc extends plugin {
  constructor () {
    super({
      /** 功能名称 */
      name: 'ESO:TTC交易中心',
      /** 功能描述 */
      dsc: 'ESO交易中心查询功能',
      /** https://oicqjs.github.io/oicq/#events */
      event: 'message',
      /** 优先级，数字越小等级越高 */
      priority: 1000,
      rule: [
        {
          /** 命令正则匹配 */
          reg: '^#*(查询物品|物品查询).*$',
          /** 执行方法 */
          fnc: 'queryItem'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(查询交易|交易查询).*$',
          /** 执行方法 */
          fnc: 'queryTrade'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(查询价格|价格查询).*$',
          /** 执行方法 */
          fnc: 'queryPrice'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(更新价格表|价格表更新).*$',
          /** 执行方法 */
          fnc: 'updatePriceTable'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(TTC帮助|ttc帮助)$',
          /** 执行方法 */
          fnc: 'help'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(设置ttc默认|设置TTC默认).*$',
          /** 执行方法 */
          fnc: 'setDefaultServer'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(ttc验证码|TTC验证码).*$',
          /** 执行方法 */
          fnc: 'setCaptchaAutoSolve'
        }
      ]
    })

    // 检查是否已经初始化过，避免重复初始化
    if (!this.initialized) {
      this.initialized = true
      
      // 启动时检查必要文件并初始化（异步执行，不阻塞启动）
      this.initializeOnStartup().catch(error => {
        logger.error(`[TTC] 启动初始化异步执行失败: ${error.message}`)
      })
      
      // 启动清理任务
      this.startCleanupTask()
    }
  }

  /** 启动时初始化检查 */
  async initializeOnStartup() {
    try {
      // 加载默认服务器配置
      this.loadDefaultServerConfig()
      
      // 加载验证码配置
      this.loadCaptchaConfig()
      
      // 如果已经完成初始检查，跳过
      if (initialUpdateCompleted) {
        //logger.info('[TTC] 初始化检查已完成，跳过重复检查')
        return
      }

      //logger.info('[TTC] 开始启动时初始化检查...')
      
      // 检查必要文件是否存在
      const requiredFiles = [
        { path: TTC_LOOKUP_TABLE_LUA, name: '物品查找表 (ItemLookUpTable_ZH.lua)' },
        { path: TTC_PRICE_TABLE_JSON_NA, name: '美服价格表数据文件' },
        { path: TTC_PRICE_TABLE_JSON_EU, name: '欧服价格表数据文件' }
      ]
      
      const missingFiles = []
      
      for (const file of requiredFiles) {
        if (!fs.existsSync(file.path)) {
          missingFiles.push(file.name)
          logger.warn(`[TTC] 缺少必要文件: ${file.name}`)
        }
      }
      
      // 如果有文件缺失，需要更新价格表
      if (missingFiles.length > 0) {
        logger.info(`[TTC] 检测到 ${missingFiles.length} 个文件缺失，需要更新价格表`)
        logger.info(`[TTC] 缺失文件: ${missingFiles.join(', ')}`)
        
        // 检查是否已经在更新中
        if (isUpdatingPriceTable) {
          //logger.info('[TTC] 价格表正在更新中，跳过重复更新')
          return
        }
        
        // 开始静默更新
        logger.info('[TTC] 开始后台静默更新价格表...')
        isUpdatingPriceTable = true
        
        try {
          await this.performInitialSilentUpdate()
          logger.info('[TTC] 后台价格表更新完成')
        } catch (error) {
          logger.error(`[TTC] 后台价格表更新失败: ${error.message}`)
        } finally {
          isUpdatingPriceTable = false
          initialUpdateCompleted = true
        }
      } else {
        //logger.info('[TTC] 所有必要文件存在，跳过初始更新')
        initialUpdateCompleted = true
      }
      
    } catch (error) {
      logger.error(`[TTC] 启动初始化检查失败: ${error.message}`)
      initialUpdateCompleted = true // 即使失败也标记完成，避免重复尝试
    }
  }

  /** 执行初始静默更新 */
  async performInitialSilentUpdate() {
    try {
      const serverKeys = ['NA', 'EU']
      const results = []
      
      for (const serverKey of serverKeys) {
        logger.info(`[TTC] 正在更新${SERVER_CONFIG[serverKey].name}价格表...`)
        const updateResult = await this.updatePriceData(serverKey)
        results.push({
          server: SERVER_CONFIG[serverKey].name,
          ...updateResult
        })
      }
      
      // 清除所有相关缓存
      ttcCache.clear()
      priceCache.clear()
      imageCache.clear()
      ttcImgCache.md5 = ''
      ttcImgCache.img = ''
      
      // 记录更新结果到日志
      let logMsg = '[TTC] 初始化价格表更新完成！'
      results.forEach((result) => {
        if (result.success) {
          logMsg += `\n${result.server}: 成功更新 ${result.count} 条记录 (${result.updateTime})`
        } else {
          logMsg += `\n${result.server}: 更新失败 - ${result.error}`
        }
      })
      
      logger.info(logMsg)
      
    } catch (error) {
      logger.error(`[TTC] 执行初始静默更新失败: ${error.message}`)
      throw error
    }
  }

  /** 启动清理任务 */
  startCleanupTask() {
    // 清理限流记录
    setInterval(() => {
      this.cleanupRateLimit()
    }, CLEANUP_CONFIG.CACHE_CLEANUP_INTERVAL)
    
    // 清理过期文件
    setInterval(() => {
      this.cleanupOldFiles()
    }, CLEANUP_CONFIG.CLEANUP_INTERVAL)
    
    // 启动每日价格表更新任务
    this.startDailyPriceUpdate()
  }

  /** 启动每日价格表更新任务（每天19点） */
  startDailyPriceUpdate() {
    // 检查是否已经调度过，避免重复调度
    if (dailyUpdateScheduled) {
      //logger.info(`[TTC] 价格表自动更新任务已存在，跳过重复调度`)
      return
    }

    const scheduleNextUpdate = () => {
      const now = new Date()
      const target = new Date()
      
      // 设置目标时间为今天19点
      target.setHours(19, 0, 0, 0)
      
      // 如果当前时间已经过了今天19点，则设置为明天19点
      if (now >= target) {
        target.setDate(target.getDate() + 1)
      }
      
      const timeUntilUpdate = target.getTime() - now.getTime()
      
      // 只在第一次调度时打印日志，避免重复打印
      if (!this.dailyUpdateLogged) {
        logger.info(`[TTC] 价格表自动更新已安排，下次更新时间: ${target.toLocaleString('zh-CN')}`)
        this.dailyUpdateLogged = true
      }
      
      // 清理旧的定时器（如果存在）
      if (dailyUpdateTimer) {
        clearTimeout(dailyUpdateTimer)
      }
      
      // 设置新的定时器
      dailyUpdateTimer = setTimeout(async () => {
        await this.silentUpdatePriceTable()
        // 更新完成后，安排下一次更新
        scheduleNextUpdate()
      }, timeUntilUpdate)
    }
    
    // 标记已调度
    dailyUpdateScheduled = true
    
    // 立即安排第一次更新
    scheduleNextUpdate()
  }

  /** 静默更新价格表（不发送消息通知） */
  async silentUpdatePriceTable() {
    try {
      // 检查是否正在更新中
      if (isUpdatingPriceTable) {
        logger.info('[TTC] 价格表正在更新中，跳过定时更新')
        return
      }

      logger.info('[TTC] 开始执行定时价格表更新...')
      
      // 设置更新状态
      isUpdatingPriceTable = true
      
      const serverKeys = ['NA', 'EU']
      const results = []
      
      try {
        for (const serverKey of serverKeys) {
          const updateResult = await this.updatePriceData(serverKey)
          results.push({
            server: SERVER_CONFIG[serverKey].name,
            ...updateResult
          })
        }
      } finally {
        // 确保更新状态被重置
        isUpdatingPriceTable = false
      }
      
      // 清除所有相关缓存
      ttcCache.clear()
      priceCache.clear()
      imageCache.clear()
      // 重置HTML截图缓存
      ttcImgCache.md5 = ''
      ttcImgCache.img = ''
      
      // 记录更新结果到日志
      let logMsg = '[TTC] 定时价格表更新完成！'
      results.forEach((result) => {
        if (result.success) {
          logMsg += `\n${result.server}: 成功更新 ${result.count} 条记录 (${result.updateTime})`
        } else {
          logMsg += `\n${result.server}: 更新失败 - ${result.error}`
        }
      })
      
      logger.info(logMsg)
      
    } catch (error) {
      logger.error(`[TTC] 定时更新价格表失败: ${error.message}`)
    }
  }

  /** 清理过期的限流记录 */
  cleanupRateLimit() {
    const now = Date.now()
    for (let [userId, userData] of rateLimit.entries()) {
      userData.requests = userData.requests.filter(
        timestamp => now - timestamp < RATE_LIMIT.WINDOW_MS
      )
      if (userData.requests.length === 0) {
        rateLimit.delete(userId)
      }
    }
  }

  /** 清理旧文件（仅清理cache文件夹） */
  cleanupOldFiles() {
    try {
      // 只清理cache目录下的文件
      const cacheDir = TTC_CACHE_PATH
      const now = Date.now()

      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir)
        files.forEach(file => {
          try {
            const filePath = path.join(cacheDir, file)
            const stats = fs.statSync(filePath)
            if (now - stats.mtime.getTime() > CLEANUP_CONFIG.FILE_MAX_AGE) {
              fs.unlinkSync(filePath)
              logger.info(`[TTC] 清理过期缓存文件: ${file}`)
            }
          } catch (fileError) {
            logger.warn(`[TTC] 清理缓存文件时出错: ${file}, ${fileError.message}`)
          }
        })
      }
    } catch (error) {
      logger.error(`[TTC] 清理缓存文件失败: ${error.message}`)
    }
  }

  /** 检查限流 */
  checkRateLimit(userId) {
    const now = Date.now()
    
    if (!rateLimit.has(userId)) {
      rateLimit.set(userId, { requests: [] })
    }
    
    const userData = rateLimit.get(userId)
    
    // 清理过期请求
    userData.requests = userData.requests.filter(
      timestamp => now - timestamp < RATE_LIMIT.WINDOW_MS
    )
    
    // 检查是否超过限制
    if (userData.requests.length >= RATE_LIMIT.MAX_REQUESTS) {
      return false
    }
    
    // 记录新请求
    userData.requests.push(now)
    return true
  }

  /** 查询物品 */
  async queryItem(e) {
    try {
      const userId = e.user_id
      
      // 限流检查
      if (!this.checkRateLimit(userId)) {
        return await this.reply('查询太频繁，请稍后再试')
      }

      // 提取物品名
      const itemName = e.msg.replace(/^#*(查询物品|物品查询)/, '').trim()
      if (!itemName) {
        return await this.reply('请输入要查询的物品名称\n示例：#查询物品 蟹灵蜡')
      }

      // 检查缓存
      const cacheKey = `item_${itemName}`
      const cachedResult = ttcCache.get(cacheKey)
      if (cachedResult) {
        return await this.reply(cachedResult)
      }

      // 查询物品功能
      const result = await this.searchItemInDatabase(itemName)
      
      if (result && result.length > 0) {
        // 限制显示数量
        const limitedResult = result.slice(0, 30)
        let replyMsg = `搜索到包含'${itemName}'的物品：\n`
        
        // 按类型分组显示
        const groupedResults = {}
        limitedResult.forEach(item => {
          if (!groupedResults[item.type]) {
            groupedResults[item.type] = []
          }
          groupedResults[item.type].push(item)
        })

        Object.keys(groupedResults).forEach(type => {
          replyMsg += `\n📦 ${type}：\n`
          groupedResults[type].forEach(item => {
            replyMsg += `【${item.id}】${item.name}`
            if (item.category && item.category !== '未知类型' && item.category !== 'TTC物品') {
              replyMsg += ` (${item.category})`
            }
            replyMsg += `\n`
          })
        })

        if (result.length > 30) {
          replyMsg += `\n...(还有${result.length - 30}个结果，请输入更精确的关键词)`
        }

        // 缓存结果
        ttcCache.set(cacheKey, replyMsg)
        return await this.reply(replyMsg)
      } else {
        const noResultMsg = `未找到包含'${itemName}'的物品`
        return await this.reply(noResultMsg)
      }

    } catch (error) {
      logger.error(`[TTC] 查询物品失败: ${error.message}`)
      return await this.reply('查询物品失败，请稍后重试')
    }
  }

  /** 查询交易 */
  async queryTrade(e) {
    try {
      const userId = e.user_id
      
      // 限流检查
      if (!this.checkRateLimit(userId)) {
        return await this.reply('查询太频繁，请稍后再试')
      }

      // 清理旧的截图文件
      await cleanupScreenshots()
      
      // 重置截图计数器
      screenshotCounter = 0

      await this.reply('正在查询请稍后...')

      // 解析命令
      let content = e.msg.replace(/^#*(查询交易|交易查询)/, '').trim()
      
      // 检测服务器类型
      let serverType = 'us' // 默认美服
      if (content.includes('欧服')) {
        serverType = 'eu'
        content = content.replace('欧服', '').trim()
      } else if (content.includes('美服')) {
        serverType = 'us'
        content = content.replace('美服', '').trim()
      } else {
        // 如果没有指定服务器，使用默认配置
        serverType = defaultServerConfig.server === 'NA' ? 'us' : 'eu'
      }

      // 解析品质关键词和物品名
      const { itemName, qualityId, page } = this.parseTradeQuery(content)

      if (!itemName) {
        return await this.reply('请输入要查询的物品名称\n示例：#查询交易 蟹灵蜡\n示例：#查询交易 欧服 致命匕首 5\n示例：#查询交易 普通 秩序之怒')
      }

      // 检查缓存
      const cacheKey = `trade_${serverType}_${itemName}_${qualityId}_${page}`
      const cachedImage = ttcCache.get(cacheKey)
      if (cachedImage) {
        return await this.reply(cachedImage)
      }

      // 构建查询URL
      let baseUrl = `https://${serverType}.tamrieltradecentre.com/pc/Trade/SearchResult?ItemNamePattern=${encodeURIComponent(itemName)}&lang=zh-CN&SortBy=Price&Order=asc&page=${page}`
      
      // 如果指定了品质，添加品质参数
      if (qualityId !== null) {
        baseUrl += `&ItemQualityID=${qualityId}`
      }
      
      // 使用puppeteer获取交易信息，支持重试机制
      let result = await this.scrapeTradeInfo(baseUrl, itemName, page, serverType)
      
      // 已移除第三方验证码破解服务，不再重试
      if (result && result.type === 'error' && result.message.includes('偶遇验证码')) {
        //logger.info(`[TTC] 检测到验证码，已移除第三方破解服务，无法自动处理`)
      }
      
      if (result && result.type === 'error') {
        // 如果是错误信息，检查是否包含截图
        if (result.screenshot) {
          // 发送错误消息和截图
          await this.reply(result.message)
          return await this.reply(segment.image(`file://${result.screenshot}`))
        } else {
          // 只发送错误消息
          return await this.reply(result.message)
        }
      } else if (result && result.type === 'image') {
        // 如果是图片，缓存并返回
        ttcCache.set(cacheKey, result.data)
        return await this.reply(result.data)
      } else {
        return await this.reply('没有找到符合条件的交易信息')
      }

    } catch (error) {
      logger.error(`[TTC] 查询交易失败: ${error.message}`)
      return await this.reply('查询交易失败，请稍后重试')
    }
  }

  /** 解析交易查询参数 */
  parseTradeQuery(content) {
    // 品质关键词映射
    const qualityMap = {
      '普通': 0, '白色': 0,
      '优良': 1, '绿色': 1,
      '上乘': 2, '蓝色': 2,
      '史诗': 3, '紫色': 3,
      '传说': 4, '金色': 4, '橙色': 4
    }
    
    let itemName = content
    let qualityId = null
    let page = 1
    
    // 从后往前找数字作为页数
    const pageMatch = content.match(/(.*?)(\d+)$/)
    if (pageMatch) {
      itemName = pageMatch[1].trim()
      page = parseInt(pageMatch[2])
    }
    
    // 查找品质关键词
    for (const [keyword, id] of Object.entries(qualityMap)) {
      // 检查关键词是否在物品名中
      if (itemName.includes(keyword)) {
        // 移除品质关键词，获取纯物品名
        itemName = itemName.replace(keyword, '').trim()
        qualityId = id
        break
      }
    }
    
    return { itemName, qualityId, page }
  }

  /** 查询价格 */
  async queryPrice(e) {
    try {
      const userId = e.user_id
      
      // 限流检查
      if (!this.checkRateLimit(userId)) {
        return await this.reply('查询太频繁，请稍后再试')
      }

      // 解析命令和服务器
      let content = e.msg.replace(/^#*(查询价格|价格查询)/, '').trim()
      let serverKey = 'NA' // 默认美服
      
      // 检测服务器类型
      if (content.includes('欧服') || content.includes('EU')) {
        serverKey = 'EU'
        content = content.replace(/欧服|EU/g, '').trim()
      } else if (content.includes('美服') || content.includes('NA') || content.includes('US')) {
        serverKey = 'NA'
        content = content.replace(/美服|NA|US/g, '').trim()
      } else {
        // 如果没有指定服务器，使用默认配置
        serverKey = defaultServerConfig.server
      }

      const queryContent = content
      if (!queryContent) {
        return await this.reply('请输入要查询的物品名称或ID\n示例：#查询价格 蟹灵蜡\n示例：#查询价格 欧服 蟹灵蜡\n示例：#查询价格 12345')
      }

      // 检查缓存（包含服务器信息）
      const cacheKey = `price_${serverKey}_${queryContent}`
      const cachedResult = priceCache.get(cacheKey)
      if (cachedResult) {
        return await this.reply(cachedResult)
      }

      await this.reply(`正在查询${SERVER_CONFIG[serverKey].name}价格信息，请稍后...`)

      // 获取价格信息
      const priceInfo = await this.queryItemPrice(queryContent, serverKey)
      
      if (priceInfo) {
        if (priceInfo.type === 'text') {
          // 文字版价格信息
          priceCache.set(cacheKey, priceInfo.content)
          return await this.reply(priceInfo.content)
        } else if (priceInfo.type === 'image') {
          // 图片版价格信息
          priceCache.set(cacheKey, priceInfo.content)
          return await this.reply(priceInfo.content)
        }
      } else {
        return await this.reply(`未找到 "${queryContent}" 在${SERVER_CONFIG[serverKey].name}的价格信息`)
      }

    } catch (error) {
      logger.error(`[TTC] 查询价格失败: ${error.message}`)
      return await this.reply('查询价格失败，请稍后重试')
    }
  }

  /** 更新价格表 */
  async updatePriceTable(e) {
    try {
      const userId = e.user_id
      
      // 检查权限（只有管理员可以更新）
      if (!e.isMaster) {
        return await this.reply('只有主人才能更新价格表')
      }

      // 限流检查
      if (!this.checkRateLimit(userId)) {
        return await this.reply('操作太频繁，请稍后再试')
      }

      // 检查是否正在更新中
      if (isUpdatingPriceTable) {
        return await this.reply('价格表正在后台更新中，请稍后再试')
      }

      // 解析服务器参数
      let content = e.msg.replace(/^#*(更新价格表|价格表更新)/, '').trim()
      let serverKeys = []
      
      if (content.includes('欧服') || content.includes('EU')) {
        serverKeys.push('EU')
      }
      if (content.includes('美服') || content.includes('NA') || content.includes('US')) {
        serverKeys.push('NA')
      }
      
      // 如果没有指定服务器，默认更新两个服务器
      if (serverKeys.length === 0) {
        serverKeys = ['NA', 'EU']
      }

      await this.reply(`开始更新${serverKeys.map(k => SERVER_CONFIG[k].name).join('、')}价格表，请稍后...`)

      // 设置更新状态
      isUpdatingPriceTable = true

      const results = []
      try {
        for (const serverKey of serverKeys) {
          const updateResult = await this.updatePriceData(serverKey)
          results.push({
            server: SERVER_CONFIG[serverKey].name,
            ...updateResult
          })
        }
      } finally {
        // 确保更新状态被重置
        isUpdatingPriceTable = false
      }
      
      // 清除所有相关缓存
      ttcCache.clear()
      priceCache.clear()
      imageCache.clear()
      // 重置HTML截图缓存
      ttcImgCache.md5 = ''
      ttcImgCache.img = ''
      
      // 构建回复消息
      let replyMsg = '\n价格表更新完成！\n'
      results.forEach((result, index) => {
        if (result.success) {
          replyMsg += `\n📊 ${result.server}:`
          replyMsg += `\n更新时间: ${result.updateTime}`
          replyMsg += `\n更新条目: ${result.count} 条`
        } else {
          replyMsg += `\n❌ ${result.server}: 更新失败 - ${result.error}`
        }
        if (index < results.length - 1) replyMsg += '\n'
      })
      
      return await this.reply(replyMsg)

    } catch (error) {
      logger.error(`[TTC] 更新价格表失败: ${error.message}`)
      return await this.reply('更新价格表失败，请稍后重试')
    }
  }

  /** 帮助信息 */
  async help(e) {
    const helpMsg = `📋 TTC交易中心功能帮助

🔍 查询物品
#查询物品 [物品名]
示例：#查询物品 蟹灵蜡
功能：搜索物品并获取详细信息
※ 返回的【数字】是物品ID，可用于价格查询

📊 查询交易 ✨
#查询交易 [服务器] [品质] [物品名] [页数]
示例：#查询交易 蟹灵蜡
示例：#查询交易 欧服 致命匕首 5
示例：#查询交易 史诗 秩序之怒
功能：查看当前在售的交易记录列表
※ 显示交易者、位置、工会、价格等详细信息
※ 默认查询${defaultServerConfig.name}第1页，支持分页浏览
※ 支持品质筛选：普通/白色(0)、优良/绿色(1)、上乘/蓝色(2)、史诗/紫色(3)、传说/金色/橙色(4)

💰 查询价格
#查询价格 [服务器] [物品名/ID]
示例：#查询价格 蟹灵蜡
示例：#查询价格 欧服 蟹灵蜡
示例：#查询价格 美服 12345
功能：获取物品的详细价格统计信息
※ 支持最多30条价格数据展示
※ 默认查询${defaultServerConfig.name}价格

🔄 更新价格表（仅主人）
#更新价格表 [服务器]
示例：#更新价格表（更新美服+欧服）
示例：#更新价格表 欧服（仅更新欧服）
示例：#更新价格表 美服（仅更新美服）
功能：从TTC服务器下载最新价格数据

⚙️ 设置默认服务器（仅主人）
#设置ttc默认 [服务器]
示例：#设置ttc默认 美服
示例：#设置ttc默认 欧服
功能：设置查询交易和查询价格的默认服务器

🔐 验证码设置（仅主人）
#ttc验证码 [开启/关闭/状态]
示例：#ttc验证码 开启
示例：#ttc验证码 关闭
示例：#ttc验证码 状态
功能：开启/关闭自动验证码解决功能
※ 已移除所有第三方验证码破解服务
※ 遇到验证码时将提示用户手动处理

❓ 帮助
#TTC帮助

🌍 支持的服务器：
• 美服 (NA) - 美服服务器
• 欧服 (EU) - 欧服服务器
※ 当前默认服务器：${defaultServerConfig.name}

注意事项：
• 查询有频率限制，请勿过于频繁
• 交易查询支持美服/欧服切换  
• 价格查询支持美服/欧服独立数据
• 价格信息基于TTC最新数据
• 不同服务器的价格可能存在差异
• 如遇到验证码，将提示用户手动处理`

    return await this.reply(helpMsg)
  }

  /** 读取默认服务器配置 */
  loadDefaultServerConfig() {
    // 检查是否已经加载过，避免重复加载
    if (this.defaultServerConfigLoaded) {
      return
    }
    
    try {
      if (fs.existsSync(TTC_DEFAULT_SERVER_FILE)) {
        const configData = fs.readFileSync(TTC_DEFAULT_SERVER_FILE, 'utf-8')
        const config = JSON.parse(configData)
        
        // 验证配置有效性
        if (config.server && (config.server === 'NA' || config.server === 'EU')) {
          defaultServerConfig = {
            server: config.server,
            name: config.server === 'NA' ? '美服' : '欧服'
          }
          //logger.info(`[TTC] 已加载默认服务器配置: ${defaultServerConfig.name}`)
        } else {
          //logger.warn('[TTC] 默认服务器配置文件格式无效，使用默认值：美服')
        }
      } else {
        //logger.info('[TTC] 默认服务器配置文件不存在，使用默认值：美服')
      }
      
      this.defaultServerConfigLoaded = true
    } catch (error) {
      logger.error(`[TTC] 读取默认服务器配置失败: ${error.message}`)
      this.defaultServerConfigLoaded = true // 即使失败也标记为已加载，避免重复尝试
    }
  }

  /** 保存默认服务器配置 */
  saveDefaultServerConfig() {
    try {
      const configData = {
        server: defaultServerConfig.server,
        name: defaultServerConfig.name,
        updateTime: new Date().toISOString()
      }
      
      fs.writeFileSync(TTC_DEFAULT_SERVER_FILE, JSON.stringify(configData, null, 2), 'utf-8')
      logger.info(`[TTC] 默认服务器配置已保存: ${defaultServerConfig.name}`)
    } catch (error) {
      logger.error(`[TTC] 保存默认服务器配置失败: ${error.message}`)
      throw error
    }
  }

  /** 设置默认服务器 */
  async setDefaultServer(e) {
    try {
      // 检查权限（只有管理员可以设置）
      if (!e.isMaster) {
        return await this.reply('只有主人才能设置默认服务器')
      }

      // 解析命令参数
      let content = e.msg.replace(/^#*(设置ttc默认|设置TTC默认)/, '').trim()
      
      // 检查参数
      if (!content) {
        return await this.reply('请指定要设置的服务器\n示例：#设置ttc默认 美服\n示例：#设置ttc默认 欧服')
      }

      let newServer = null
      let newServerName = ''

      // 解析服务器参数
      if (content.includes('美服')) {
        newServer = 'NA'
        newServerName = '美服'
      } else if (content.includes('欧服')) {
        newServer = 'EU'
        newServerName = '欧服'
      } else {
        return await this.reply('只支持设置"美服"或"欧服"\n示例：#设置ttc默认 美服\n示例：#设置ttc默认 欧服')
      }

      // 检查是否与当前配置相同
      if (defaultServerConfig.server === newServer) {
        return await this.reply(`当前默认服务器已经是${newServerName}，无需重复设置`)
      }

      // 更新配置
      defaultServerConfig.server = newServer
      defaultServerConfig.name = newServerName

      // 保存配置
      this.saveDefaultServerConfig()

      return await this.reply(`✅ 默认服务器已设置为：${newServerName}\n\n现在使用以下命令时将默认查询${newServerName}：\n• #查询交易 [物品名]\n• #查询价格 [物品名]`)

    } catch (error) {
      logger.error(`[TTC] 设置默认服务器失败: ${error.message}`)
      return await this.reply('设置默认服务器失败，请稍后重试')
    }
  }

    /** 在数据库中搜索物品 */
  async searchItemInDatabase(itemName) {
    try {
      // 优先使用TTC的ItemLookUpTable_ZH.lua文件搜索可交易物品
      const lookupResults = await this.searchInTTCLookupTable(itemName)
      return lookupResults
    } catch (error) {
      logger.error(`[TTC] 数据库搜索失败: ${error.message}`)
      return []
    }
  }

  /** 在TTC的ItemLookUpTable中搜索物品 */
  async searchInTTCLookupTable(itemName) {
    try {
      const lookupPath = TTC_LOOKUP_TABLE_LUA
      if (!fs.existsSync(lookupPath)) {
        logger.warn(`[TTC] ItemLookUpTable文件不存在: ${lookupPath}`)
        return []
      }

      const content = fs.readFileSync(lookupPath, 'utf-8')
      const results = []
      
      // 解析LUA文件格式：["物品名称"]={...}
      const pattern = /\["([^"]+)"\]\s*=\s*\{([^}]+)\}/g
      let match
      
      while ((match = pattern.exec(content)) !== null) {
        const fullName = match[1]
        const idsContent = match[2]
        
        // 如果物品名包含搜索关键词
        if (fullName.toLowerCase().includes(itemName.toLowerCase())) {
          // 提取物品ID
          const idMatches = idsContent.match(/\[\d+\]\s*=\s*(\d+)/g)
          if (idMatches) {
            for (const idMatch of idMatches) {
              const itemId = idMatch.match(/=\s*(\d+)/)[1]
              results.push({
                id: itemId,
                name: fullName,
                type: '可交易物品',
                category: 'TTC物品'
              })
            }
          }
        }
      }
      
      return results.slice(0, 30) // 限制结果数量
    } catch (error) {
      logger.error(`[TTC] 搜索ItemLookUpTable失败: ${error.message}`)
      return []
    }
  }

  /** 使用puppeteer抓取交易信息 */
  async scrapeTradeInfo(url, itemName, page, serverType) {
    try {
      //logger.info(`[TTC] 开始抓取交易数据: ${url}`)
      
      // 使用puppeteer访问TTC网站并获取页面内容
      const htmlData = await this.fetchTradePageData(url, itemName, page, serverType)
      
      if (!htmlData || htmlData.hasError) {
        logger.warn(`[TTC] 抓取失败或无数据: ${htmlData?.error || '未知错误'}`)
        
        // 检查是否是验证码错误
        if (htmlData?.error && htmlData.error.includes('偶遇验证码')) {
          return {
            type: 'error',
            message: htmlData.error,
            screenshot: htmlData.screenshot
          }
        }
        
        // 检查是否是"没有符合条件的交易"错误
        if (htmlData?.error && htmlData.error.includes('没有符合条件的交易')) {
          return {
            type: 'error',
            message: htmlData.error
          }
        }
        
        // 其他错误生成错误图片
        const imgBuffer = await this.generateNoDataImage(itemName, page, serverType, htmlData?.error)
        return {
          type: 'image',
          data: imgBuffer
        }
      }
      
      // 数据抓取成功，准备生成图片
      logger.info(`[TTC] 数据抓取成功，开始生成交易图片: ${itemName}`)
      
      // 生成交易信息图片
      const imgBuffer = await this.generateTradeImage(htmlData)
      
      return {
        type: 'image',
        data: imgBuffer
      }

    } catch (error) {
      logger.error(`[TTC] 抓取交易信息失败: ${error.message}`)
      
      // 检查是否是验证码相关错误
      if (error.message.includes('验证码')) {
        return {
          type: 'error',
          message: error.message,
          screenshot: error.screenshot
        }
      }
      
      // 其他错误生成错误图片
      logger.info(`[TTC] 生成错误图片: ${itemName} - ${error.message}`)
      const imgBuffer = await this.generateErrorImage(itemName, page, serverType, error.message)
      return {
        type: 'image',
        data: imgBuffer
      }
    }
  }

  /** 处理广告拦截器弹窗 */
  async handleAdBlockPopup(browserPage) {
    try {
      const result = await browserPage.evaluate(() => {
        try {
          let adBlockDetected = false
          let adBlockText = ''
          let actionTaken = false
          
          // 查找包含"Continue with first party ads"文本的按钮（只检查可见的）
          const continueButton = Array.from(document.querySelectorAll('button, input[type="button"], .btn, .button, a')).find(el => {
            // 检查元素是否可见
            const style = window.getComputedStyle(el)
            const isVisible = style.display !== 'none' && 
                             style.visibility !== 'hidden' && 
                             style.opacity !== '0' &&
                             el.offsetWidth > 0 && 
                             el.offsetHeight > 0
            
            if (!isVisible) {
              return false // 跳过隐藏的元素
            }
            
            const text = el.textContent || el.value || el.innerText || ''
            return text.includes('Continue with first party ads') || 
                   text.includes('继续使用第一方广告') ||
                   text.includes('Continue') ||
                   text.includes('Accept') ||
                   text.includes('Allow')
          })
          
          if (continueButton) {
            adBlockDetected = true
            adBlockText = continueButton.textContent || continueButton.value || 'Continue with first party ads'
            console.log('找到可见的广告弹窗按钮:', adBlockText)
            continueButton.click()
            actionTaken = true
            return { detected: true, text: adBlockText, action: 'clicked_continue_button' }
          }
          
          // 查找包含广告相关文本的弹窗（只检查可见的）
          const adBlockElement = Array.from(document.querySelectorAll('div, p, span, h1, h2, h3')).find(el => {
            // 检查元素是否可见
            const style = window.getComputedStyle(el)
            const isVisible = style.display !== 'none' && 
                             style.visibility !== 'hidden' && 
                             style.opacity !== '0' &&
                             el.offsetWidth > 0 && 
                             el.offsetHeight > 0
            
            if (!isVisible) {
              return false // 跳过隐藏的元素
            }
            
            const text = el.textContent || ''
            return text.includes('ad blocker') || 
                   text.includes('广告拦截器') ||
                   text.includes('广告收入') ||
                   text.includes('ad revenue') ||
                   text.includes('disable ad blocker') ||
                   text.includes('关闭广告拦截器') ||
                   text.includes('TTC 依赖广告收入') ||
                   text.includes('tamriel trade centre') ||
                   text.includes('donate')
          })
          
          if (adBlockElement) {
            adBlockDetected = true
            adBlockText = adBlockElement.textContent.substring(0, 200)
            console.log('检测到可见的广告拦截器相关文本:', adBlockText)
            
            // 查找可能的关闭按钮（只检查可见的）
            const closeButton = Array.from(document.querySelectorAll('button, input[type="button"], .btn, .button, a, .close, .dismiss')).find(el => {
              // 检查按钮是否可见
              const style = window.getComputedStyle(el)
              const isVisible = style.display !== 'none' && 
                               style.visibility !== 'hidden' && 
                               style.opacity !== '0' &&
                               el.offsetWidth > 0 && 
                               el.offsetHeight > 0
              
              if (!isVisible) {
                return false // 跳过隐藏的按钮
              }
              
              const text = el.textContent || el.value || el.innerText || ''
              return text.includes('Continue') ||
                     text.includes('Accept') ||
                     text.includes('Allow') ||
                     text.includes('OK') ||
                     text.includes('确定') ||
                     text.includes('继续') ||
                     text.includes('允许')
            })
            
            if (closeButton) {
              console.log('找到可见的关闭按钮:', closeButton.textContent || closeButton.value)
              closeButton.click()
              actionTaken = true
              return { detected: true, text: adBlockText, action: 'clicked_close_button' }
            }
          }
          
          // 查找模态框或弹窗的关闭按钮（只检查可见的）
          const modalCloseButton = document.querySelector('.modal .close, .popup .close, .dialog .close, [data-dismiss="modal"], .btn-close')
          if (modalCloseButton) {
            // 检查按钮是否可见
            const style = window.getComputedStyle(modalCloseButton)
            const isVisible = style.display !== 'none' && 
                             style.visibility !== 'hidden' && 
                             style.opacity !== '0' &&
                             modalCloseButton.offsetWidth > 0 && 
                             modalCloseButton.offsetHeight > 0
            
            if (isVisible) {
              adBlockDetected = true
              adBlockText = '检测到可见的模态框弹窗'
              console.log('找到可见的模态框关闭按钮')
              modalCloseButton.click()
              actionTaken = true
              return { detected: true, text: adBlockText, action: 'clicked_modal_close' }
            }
          }
          
          // 查找ESC键关闭的弹窗（只检查可见的）
          const visibleModal = Array.from(document.querySelectorAll('.modal, .popup, .dialog, .overlay')).find(el => {
            const style = window.getComputedStyle(el)
            const isVisible = style.display !== 'none' && 
                             style.visibility !== 'hidden' && 
                             style.opacity !== '0' &&
                             el.offsetWidth > 0 && 
                             el.offsetHeight > 0
            return isVisible
          })
          
          if (visibleModal) {
            adBlockDetected = true
            adBlockText = '检测到可见的模态框，尝试ESC键关闭'
            console.log('检测到可见的模态框，尝试按ESC键关闭')
            // 模拟ESC键
            const escEvent = new KeyboardEvent('keydown', {
              key: 'Escape',
              keyCode: 27,
              which: 27,
              bubbles: true
            })
            document.dispatchEvent(escEvent)
            actionTaken = true
            return { detected: true, text: adBlockText, action: 'pressed_escape_key' }
          }
          
          return { detected: false, text: '', action: 'none' }
        } catch (error) {
          console.error('处理广告弹窗时出错:', error)
          return { detected: false, text: '', action: 'error', error: error.message }
        }
      })
      
      if (result.detected) {
        //logger.info(`[TTC] 发现了广告弹窗: ${result.text}`)
        //logger.info(`[TTC] 执行处理动作: ${result.action}`)
        return true
      } else {
        // 只有在确实没有检测到广告弹窗时才打印日志
        if (result.action === 'none') {
          // 不打印日志，静默返回
        } else if (result.action === 'error') {
          logger.error(`[TTC] 检查广告弹窗时出错: ${result.error}`)
        }
        return false
      }
      
    } catch (error) {
      logger.error(`[TTC] 处理广告拦截器弹窗失败: ${error.message}`)
      return false
    }
  }

  /** 清理浏览器缓存 */
  async cleanBrowserCache(browserPage) {
    try {
      // 删除所有cookies
      const cookies = await browserPage.cookies()
      if (cookies.length > 0) {
        await browserPage.deleteCookie(...cookies)
      }
      
      // 清理localStorage和sessionStorage
      await browserPage.evaluate(() => {
        try {
          window.localStorage.clear()
          window.sessionStorage.clear()
        } catch (e) {
          // 忽略清理失败的错误
        }
      })
      
    } catch (error) {
      logger.warn(`[TTC] 清理浏览器缓存失败: ${error.message}`)
    }
  }

  /** 使用puppeteer获取TTC页面数据 */
  async fetchTradePageData(url, itemName, page, serverType) {
    try {
      logger.info(`[TTC] 开始访问TTC网站: ${url}`)
      
      // 检查puppeteer浏览器
      if (!puppeteer.browser) {
        await puppeteer.browserInit()
      }
      
      const browserPage = await puppeteer.browser.newPage()
      
      try {
        // 设置超时时间
        browserPage.setDefaultNavigationTimeout(30000)
        
        // 设置用户代理，避免被检测为爬虫
        await browserPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        
        // 设置视窗大小
        //await browserPage.setViewport({ width: 1920, height: 1080 })
        
        // 清理浏览器缓存，确保获取最新内容
        await this.cleanBrowserCache(browserPage)
        
        //logger.info(`[TTC] 正在访问页面: ${url}`)
        
        try {
          await Promise.race([
            browserPage.goto(url, { waitUntil: 'domcontentloaded' }),
            // 等待可能的页面元素
            new Promise((resolve) => setTimeout(resolve, 30000))
          ])
        } catch (navError) {
          if (navError.message.includes('Navigating frame was detached')) {
            // 页面导航中断，继续处理
          } else {
            throw navError
          }
        }
        
        // 等待页面加载完成，使用更灵活的等待策略
        logger.info(`[TTC] 页面加载完成，等待内容渲染...`)
        
        // 延长等待时间，确保页面完全加载
        await new Promise(resolve => setTimeout(resolve, 8000))
        
        // 检查并处理广告拦截器弹窗
        const adBlockHandled = await this.handleAdBlockPopup(browserPage)
        if (adBlockHandled) {
          logger.info(`[TTC] 广告拦截器弹窗已处理，等待页面重新加载...`)
          await new Promise(resolve => setTimeout(resolve, 3000))
        }
        
        // 检查并等待"正在获取reCAPTCHA令牌"字样消失
        //logger.info(`[TTC] 检查reCAPTCHA令牌加载状态...`)
        let recaptchaLoadingCount = 0
        const maxRecaptchaWaitTime = 60000 // 最大等待60秒
        const recaptchaCheckInterval = 2000 // 每2秒检查一次
        const startTime = Date.now()
        
        while (Date.now() - startTime < maxRecaptchaWaitTime) {
          const recaptchaStatus = await browserPage.evaluate(() => {
            // 检查页面中是否存在"正在获取reCAPTCHA令牌"字样
            const recaptchaLoadingText = Array.from(document.querySelectorAll('*')).find(el => 
              el.textContent && el.textContent.includes('正在获取reCAPTCHA令牌')
            )
            
            // 检查是否有其他相关的reCAPTCHA加载提示
            const recaptchaLoadingElements = Array.from(document.querySelectorAll('*')).filter(el => 
              el.textContent && (
                el.textContent.includes('reCAPTCHA') ||
                el.textContent.includes('正在获取') ||
                el.textContent.includes('获取令牌') ||
                el.textContent.includes('Loading reCAPTCHA')
              )
            )
            
            return {
              hasRecaptchaLoading: !!recaptchaLoadingText,
              loadingElementsCount: recaptchaLoadingElements.length,
              visibleElements: recaptchaLoadingElements.filter(el => {
                const style = window.getComputedStyle(el)
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
              }).length
            }
          })
          
          if (recaptchaStatus.hasRecaptchaLoading && recaptchaStatus.visibleElements > 0) {
            recaptchaLoadingCount++
            logger.info(`[TTC] 检测到reCAPTCHA令牌正在加载中，等待中... (${recaptchaLoadingCount}次检查)`)
            await new Promise(resolve => setTimeout(resolve, recaptchaCheckInterval))
          } else {
            //logger.info(`[TTC] reCAPTCHA令牌加载完成或未检测到加载提示`)
            break
          }
        }
        
        // 检查是否超时
        if (Date.now() - startTime >= maxRecaptchaWaitTime) {
          logger.warn(`[TTC] reCAPTCHA令牌加载超时，等待时间超过${maxRecaptchaWaitTime / 1000}秒`)
          
          // 超时时截图
          await takeDebugScreenshot(browserPage, {
            line: 1520,
            description: 'reCAPTCHA令牌加载超时'
          })
          
          // 获取最新的debug截图
          const screenshotPath = await this.getLatestDebugScreenshot()
          
          await browserPage.close()
          return { 
            hasError: true, 
            error: '当前网络较差，访问超时',
            screenshot: screenshotPath
          }
        }
        
        if (recaptchaLoadingCount > 0) {
          logger.info(`[TTC] reCAPTCHA令牌加载等待完成，共等待${recaptchaLoadingCount * recaptchaCheckInterval / 1000}秒`)
        }
        
        // 检查并等待"载入中"字样消失
        //logger.info(`[TTC] 检查页面载入状态...`)
        let loadingCount = 0
        const maxLoadingWaitTime = 60000 // 最大等待60秒
        const loadingCheckInterval = 2000 // 每2秒检查一次
        const loadingStartTime = Date.now()
        
        while (Date.now() - loadingStartTime < maxLoadingWaitTime) {
          const loadingStatus = await browserPage.evaluate(() => {
            // 检查页面中是否存在"载入中"字样
            const loadingText = Array.from(document.querySelectorAll('*')).find(el => 
              el.textContent && el.textContent.includes('载入中')
            )
            
            // 检查是否有其他相关的加载提示
            const loadingElements = Array.from(document.querySelectorAll('*')).filter(el => 
              el.textContent && (
                el.textContent.includes('载入中') ||
                el.textContent.includes('加载中') ||
                el.textContent.includes('Loading') ||
                el.textContent.includes('请稍候') ||
                el.textContent.includes('正在加载')
              )
            )
            
            return {
              hasLoading: !!loadingText,
              loadingElementsCount: loadingElements.length,
              visibleElements: loadingElements.filter(el => {
                const style = window.getComputedStyle(el)
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
              }).length
            }
          })
          
          if (loadingStatus.hasLoading && loadingStatus.visibleElements > 0) {
            loadingCount++
            logger.info(`[TTC] 检测到页面正在载入中，等待中... (${loadingCount}次检查)`)
            await new Promise(resolve => setTimeout(resolve, loadingCheckInterval))
          } else {
            //logger.info(`[TTC] 页面载入完成或未检测到载入提示`)
            break
          }
        }
        
        // 检查是否超时
        if (Date.now() - loadingStartTime >= maxLoadingWaitTime) {
          logger.warn(`[TTC] 页面载入超时，等待时间超过${maxLoadingWaitTime / 1000}秒`)
          
          // 超时时截图
          await takeDebugScreenshot(browserPage, {
            line: 1580,
            description: '页面载入超时'
          })
          
          // 获取最新的debug截图
          const screenshotPath = await this.getLatestDebugScreenshot()
          
          await browserPage.close()
          return { 
            hasError: true, 
            error: '当前网络较差，访问超时',
            screenshot: screenshotPath
          }
        }
        
        if (loadingCount > 0) {
          logger.info(`[TTC] 页面载入等待完成，共等待${loadingCount * loadingCheckInterval / 1000}秒`)
        }
        
        // 在验证码检测前截图
        /*
        await takeDebugScreenshot(browserPage, {
          line: 1280,
          description: '验证码检测前'
        })
        */
        
        // 检查页面内容
        const pageContent = await browserPage.evaluate(() => {
          // 检查是否有"没有符合条件的交易"文本
          const noResultsText = Array.from(document.querySelectorAll('h3, div, span')).find(el => 
            el.textContent && el.textContent.includes('没有符合条件的交易')
          )
          
          // 检查是否有交易表格
          const tradeTable = document.querySelector('table.trade-list-table')
          const tradeRows = document.querySelectorAll('table.trade-list-table tbody tr')
          
          // 检查是否有真正的验证码挑战（排除不可见reCAPTCHA标识）
          let hasRealCaptcha = false
          
          // 检查是否有可见的验证码复选框
          const visibleCheckbox = document.querySelector('.recaptcha-checkbox-border, .recaptcha-checkbox')
          if (visibleCheckbox) {
            hasRealCaptcha = true
          }
          
          // 检查是否有图片验证挑战
          const imageChallenge = document.querySelector('.rc-imageselect, .rc-imageselect-target, iframe[src*="recaptcha/api2/bframe"]')
          if (imageChallenge) {
            hasRealCaptcha = true
          }
          
          // 检查是否有验证码错误消息
          const captchaError = document.querySelector('.recaptcha-error, .rc-anchor-error-msg')
          if (captchaError && captchaError.style.display !== 'none') {
            hasRealCaptcha = true
          }
          
          // 检查是否有验证码文本提示（只有在没有真正验证码挑战时才考虑）
          let captchaText = null
          if (!hasRealCaptcha) {
            captchaText = Array.from(document.querySelectorAll('h3, div, span, p')).find(el => 
              el.textContent && (
                el.textContent.includes('抱歉，您需要完成验证码测试才能继续') ||
                el.textContent.includes('验证码') ||
                el.textContent.includes('captcha') ||
                el.textContent.includes('reCAPTCHA')
              )
            )
          }
          
          // 检查是否有Cloudflare挑战
          const cloudflareText = Array.from(document.querySelectorAll('h1, h2, h3, div, span')).find(el => 
            el.textContent && (
              el.textContent.includes('Checking your browser') ||
              el.textContent.includes('Please wait while we verify') ||
              el.textContent.includes('Cloudflare')
            )
          )
          
          return {
            hasNoResults: !!noResultsText,
            hasTable: !!tradeTable,
            rowCount: tradeRows ? tradeRows.length : 0,
            hasCaptcha: !!(hasRealCaptcha || captchaText),
            hasCloudflare: !!cloudflareText,
            pageTitle: document.title,
            bodyText: document.body.textContent.substring(0, 500) // 前500字符用于调试
          }
        })
        
        logger.info(`[TTC] 页面内容检查结果: 无结果=${pageContent.hasNoResults}, 有表格=${pageContent.hasTable}, 行数=${pageContent.rowCount}, 验证码=${pageContent.hasCaptcha}, Cloudflare=${pageContent.hasCloudflare}`)
        //logger.info(`[TTC] 页面标题: ${pageContent.pageTitle}`)
        
        // 优先检查是否明确显示没有结果
        if (pageContent.hasNoResults) {
          logger.info(`[TTC] 页面显示无交易数据: ${itemName}`)
          return { hasError: true, error: '没有符合条件的交易' }
        }
        
        // 检查是否遇到Cloudflare挑战
        if (pageContent.hasCloudflare) {
          logger.warn(`[TTC] 检测到Cloudflare挑战: ${itemName}`)
          return { hasError: true, error: '遇到Cloudflare挑战，请稍后重试' }
        }
        
        // 智能验证码检测：如果已经有价格表格数据，认为没有验证码
        let finalHasCaptcha = pageContent.hasCaptcha
        if (pageContent.hasTable && pageContent.rowCount > 0) {
          //logger.info(`[TTC] 检测到价格表格数据（${pageContent.rowCount}行），认为无需验证码`)
          finalHasCaptcha = false
        }
        
        //logger.info(`[TTC] 最终验证码判断: ${finalHasCaptcha}`)
        
        // 检查是否遇到验证码
        if (finalHasCaptcha) {
          logger.warn(`[TTC] 检测到验证码挑战: ${itemName}`)
          
          // 验证码检测后截图
          await takeDebugScreenshot(browserPage, {
            line: 1590,
            description: '检测到验证码'
          })
          
          // 获取最新的debug截图
          const screenshotPath = await this.getLatestDebugScreenshot()
          
          // 已移除第三方验证码破解服务，返回指定的错误信息和截图
          return { 
            hasError: true, 
            error: '偶遇验证码，拼尽全力，无法战胜！',
            screenshot: screenshotPath
          }
        } else {
          if (pageContent.hasTable && pageContent.rowCount > 0) {
            //logger.info(`[TTC] 页面正常，已有价格表格数据，无需验证码`)
          } else {
            //logger.info(`[TTC] 页面正常，无验证码挑战`)
          }
        }
        
        // 如果没有找到表格，可能需要等待更长时间或页面结构改变了
        if (!pageContent.hasTable) {
          logger.info(`[TTC] 页面表格未加载完成，等待额外时间...`)
          
          // 尝试等待更长时间
          await new Promise(resolve => setTimeout(resolve, 8000))
          
          // 再次检查，使用更智能的检测
          const tableCheck = await browserPage.evaluate(() => {
            const tradeTable = document.querySelector('table.trade-list-table')
            const anyTable = document.querySelector('table')
            const dataRows = document.querySelectorAll('tr[data-bind*="TradeAsset"]')
            const listRows = document.querySelectorAll('.trade-list-table tr')
            const hasDataContent = document.body.textContent.includes('价格') || 
                                 document.body.textContent.includes('交易') ||
                                 document.body.textContent.includes('金币') ||
                                 document.body.textContent.includes('gold')
            
            return {
              hasTradeTable: !!tradeTable,
              hasAnyTable: !!anyTable,
              hasDataRows: dataRows ? dataRows.length : 0,
              hasListRows: listRows ? listRows.length : 0,
              hasDataContent: hasDataContent
            }
          })
          
          logger.info(`[TTC] 等待后表格检查: 交易表格=${tableCheck.hasTradeTable}, 任意表格=${tableCheck.hasAnyTable}, 数据行=${tableCheck.hasDataRows}, 列表行=${tableCheck.hasListRows}, 有数据内容=${tableCheck.hasDataContent}`)
          
          if (!tableCheck.hasTradeTable && !tableCheck.hasAnyTable && tableCheck.hasDataRows === 0 && tableCheck.hasListRows === 0 && !tableCheck.hasDataContent) {
            logger.warn(`[TTC] 等待后仍未找到交易表格，可能页面结构已变更`)
            return { hasError: true, error: '页面结构异常，未找到交易表格' }
          }
          
          logger.info(`[TTC] 等待后成功找到交易数据`)
        }
        
        // 如果有表格但没有数据行
        if (pageContent.hasTable && pageContent.rowCount === 0) {
          logger.info(`[TTC] 找到表格但无数据行: ${itemName}`)
          return { hasError: true, error: '没有符合条件的交易' }
        }
        
        // 获取交易数据
        logger.info(`[TTC] 开始提取交易数据...`)
        const tradeData = await browserPage.evaluate(
          (serverType) => {
            // 内联的图标URL处理函数
            function processIconUrl(iconUrl, serverType) {
              if (!iconUrl) {
                return null
              }

              const baseUrl = serverType === 'eu' ? 'https://eu.tamrieltradecentre.com' : 'https://us.tamrieltradecentre.com'
              
              // 如果已经是完整的URL，直接返回
              if (iconUrl.startsWith('http')) {
                return iconUrl
              }
              
              // 处理相对路径
              if (iconUrl.startsWith('/Content/icons/')) {
                return `${baseUrl}${iconUrl}`
              }
              
              if (iconUrl.startsWith('Content/icons/')) {
                return `${baseUrl}/${iconUrl}`
              }
              
              // 如果包含Content/icons/但不是完整URL，提取路径
              if (iconUrl.includes('Content/icons/')) {
                const iconPath = iconUrl.includes('/Content/icons/') ? 
                  iconUrl.substring(iconUrl.indexOf('/Content/icons/')) : 
                  `/Content/icons/${iconUrl}`
                return `${baseUrl}${iconPath}`
              }
              
              // 如果只是图标名称，添加完整路径
              if (iconUrl.includes('.png') || iconUrl.includes('.jpg') || iconUrl.includes('.gif')) {
                return `${baseUrl}/Content/icons/${iconUrl}`
              }
              
              return iconUrl
            }
            const data = []
            
            // 尝试多种表格选择器，按优先级排序
            let rows = null
            let selectorUsed = ''
            
            // 方法1: 标准交易表格
            rows = document.querySelectorAll('table.trade-list-table tbody tr')
            if (rows && rows.length > 0) {
              selectorUsed = 'table.trade-list-table tbody tr'
            }
            
            // 方法2: 任意表格的tbody行
            if (!rows || rows.length === 0) {
              rows = document.querySelectorAll('table tbody tr')
              if (rows && rows.length > 0) {
                selectorUsed = 'table tbody tr'
              }
            }
            
            // 方法3: 数据绑定行
            if (!rows || rows.length === 0) {
              rows = document.querySelectorAll('tr[data-bind*="TradeAsset"]')
              if (rows && rows.length > 0) {
                selectorUsed = 'tr[data-bind*="TradeAsset"]'
              }
            }
            
            // 方法4: 交易列表表格行
            if (!rows || rows.length === 0) {
              rows = document.querySelectorAll('.trade-list-table tr')
              if (rows && rows.length > 0) {
                selectorUsed = '.trade-list-table tr'
              }
            }
            
            // 方法5: 任意表格行（包括没有tbody的）
            if (!rows || rows.length === 0) {
              rows = document.querySelectorAll('table tr')
              if (rows && rows.length > 0) {
                selectorUsed = 'table tr'
              }
            }
            
            // 方法6: 包含价格相关文本的行
            if (!rows || rows.length === 0) {
              const allRows = document.querySelectorAll('tr')
              rows = Array.from(allRows).filter(row => {
                const text = row.textContent.toLowerCase()
                return text.includes('价格') || text.includes('金币') || text.includes('gold') || text.includes('交易')
              })
              if (rows && rows.length > 0) {
                selectorUsed = 'filtered rows with price content'
              }
            }
            
            console.log(`[TTC] 使用选择器 "${selectorUsed}" 找到 ${rows ? rows.length : 0} 行数据`)
            
            if (!rows || rows.length === 0) {
              // 如果还是找不到，尝试检查页面是否有任何数据内容
              const pageText = document.body.textContent
              if (pageText.includes('没有符合条件的交易') || pageText.includes('No results found')) {
                return { hasError: true, error: '没有符合条件的交易' }
              } else {
                return { hasError: true, error: '未找到交易数据行，页面结构可能已变更' }
              }
            }
            
            rows.forEach((row, index) => {
              try {
                // 调试：查看行的HTML结构
                console.log(`[TTC] 处理第 ${index + 1} 行，HTML结构:`, row.outerHTML.substring(0, 500))
                
                // 调试：查看行的所有td元素
                const tds = row.querySelectorAll('td')
                console.log(`[TTC] 第 ${index + 1} 行有 ${tds.length} 个td元素`)
                tds.forEach((td, tdIndex) => {
                  console.log(`[TTC] 第 ${index + 1} 行第 ${tdIndex + 1} 个td内容:`, td.textContent.trim().substring(0, 100))
                })
                // 物品信息和品质
                let item = "未找到物品信息"
                let itemQualityColor = "深灰色"
                let itemIconUrl = null
                
                // 尝试多种物品选择器
                let itemElement = row.querySelector('div[class*="item-quality-"]')
                if (!itemElement) {
                  itemElement = row.querySelector('div[data-bind*="Name"]')
                }
                if (!itemElement) {
                  itemElement = row.querySelector('td:first-child div')
                }
                if (!itemElement) {
                  itemElement = row.querySelector('div.item-quality-fine, div.item-quality-normal, div.item-quality-superior, div.item-quality-epic, div.item-quality-legendary')
                }
                
                if (itemElement) {
                  item = itemElement.textContent.trim()
                  const itemQualityClass = itemElement.className
                  if (itemQualityClass.includes('item-quality-legendary')) {
                    itemQualityColor = "金色"
                  } else if (itemQualityClass.includes('item-quality-epic')) {
                    itemQualityColor = "紫色"
                  } else if (itemQualityClass.includes('item-quality-superior')) {
                    itemQualityColor = "蓝色"
                  } else if (itemQualityClass.includes('item-quality-fine')) {
                    itemQualityColor = "中绿色"
                  } else if (itemQualityClass.includes('item-quality-normal')) {
                    itemQualityColor = "深灰色"
                  }
                  
                  // 查找物品图标 - 改进的获取方法
                  let iconElement = itemElement.querySelector('img.trade-item-icon')
                  if (!iconElement) {
                    // 在整个行中查找图标
                    iconElement = row.querySelector('img.trade-item-icon')
                  }
                  if (!iconElement) {
                    // 查找任何包含图标的img元素
                    iconElement = row.querySelector('img[src*="Content/icons"]')
                  }
                  if (!iconElement) {
                    // 查找任何包含图标的img元素
                    iconElement = row.querySelector('img[data-bind*="IconName"]')
                  }
                  
                  if (iconElement) {
                    console.log(`[TTC] 找到图标元素:`, iconElement.outerHTML)
                    
                    // 方法1: 从data-bind属性中提取IconName
                    const dataBind = iconElement.getAttribute('data-bind')
                    if (dataBind) {
                      console.log(`[TTC] 图标data-bind:`, dataBind)
                      const iconNameMatch = dataBind.match(/IconName['"]\s*:\s*['"]([^'"]+)['"]/)
                      if (iconNameMatch) {
                        const iconName = iconNameMatch[1]
                        const baseUrl = serverType === 'eu' ? 'https://eu.tamrieltradecentre.com' : 'https://us.tamrieltradecentre.com'
                        itemIconUrl = `${baseUrl}/Content/icons/${iconName}`
                        console.log(`[TTC] 从data-bind提取到图标名称: ${iconName} -> ${itemIconUrl}`)
                      }
                    }
                    
                    // 方法2: 如果data-bind没有找到，尝试从src属性获取
                    if (!itemIconUrl && iconElement.src) {
                      itemIconUrl = iconElement.src
                      console.log(`[TTC] 从src属性获取图标URL: ${itemIconUrl}`)
                    }
                    
                    // 方法3: 如果src是相对路径，转换为绝对路径
                    if (itemIconUrl && itemIconUrl.startsWith('/Content/icons/')) {
                      const baseUrl = serverType === 'eu' ? 'https://eu.tamrieltradecentre.com' : 'https://us.tamrieltradecentre.com'
                      itemIconUrl = `${baseUrl}${itemIconUrl}`
                      console.log(`[TTC] 转换相对路径图标URL: ${itemIconUrl}`)
                    }
                    
                    // 方法4: 如果src是相对路径且没有协议，添加完整URL
                    if (itemIconUrl && itemIconUrl.startsWith('Content/icons/')) {
                      const baseUrl = serverType === 'eu' ? 'https://eu.tamrieltradecentre.com' : 'https://us.tamrieltradecentre.com'
                      itemIconUrl = `${baseUrl}/${itemIconUrl}`
                      console.log(`[TTC] 转换相对路径图标URL: ${itemIconUrl}`)
                    }
                    
                    // 方法5: 如果src是相对路径且以斜杠开头，添加完整URL
                    if (itemIconUrl && itemIconUrl.startsWith('/Content/icons/')) {
                      const baseUrl = serverType === 'eu' ? 'https://eu.tamrieltradecentre.com' : 'https://us.tamrieltradecentre.com'
                      itemIconUrl = `${baseUrl}${itemIconUrl}`
                      console.log(`[TTC] 转换相对路径图标URL: ${itemIconUrl}`)
                    }
                    
                    // 方法6: 使用统一的图标URL处理方法
                    if (itemIconUrl) {
                      const originalUrl = itemIconUrl
                      itemIconUrl = processIconUrl(itemIconUrl, serverType)
                      console.log(`[TTC] 统一处理图标URL: ${originalUrl} -> ${itemIconUrl}`)
                    } else {
                      console.log(`[TTC] 未能提取到图标URL`)
                    }
                  } else {
                    console.log(`[TTC] 未找到图标元素`)
                  }
                }
                
                // 等级信息
                let level = "未找到等级信息"
                const levelDivs = row.querySelectorAll('div')
                for (const div of levelDivs) {
                  if (div.textContent.includes('等级')) {
                    const imgElement = div.querySelector('img')
                    const spanElement = div.querySelector('span')
                    if (imgElement && spanElement) {
                      const imgSrc = imgElement.src
                      const levelNum = spanElement.textContent.trim()
                      if (imgSrc.includes('nonvet.png')) {
                        level = `普通等级${levelNum}`
                      } else if (imgSrc.includes('championPoint.png')) {
                        level = `CP等级${levelNum}`
                      }
                    }
                    break
                  }
                }
                
                // 检查奖励委托券
                const allDivs = row.querySelectorAll('div')
                for (const div of allDivs) {
                  if (div.textContent.includes('奖励')) {
                    const voucherText = div.textContent.trim()
                    level = `${level}（${voucherText}）`
                    break
                  }
                }
                
                // 交易者信息
                let playerId = "未找到交易者信息"
                let playerElement = row.querySelector('div.text-small-width')
                if (!playerElement) {
                  playerElement = row.querySelector('div[data-bind*="PlayerName"]')
                }
                if (!playerElement) {
                  playerElement = row.querySelector('td:nth-child(2) div')
                }
                if (!playerElement) {
                  playerElement = row.querySelector('div[class*="player"]')
                }
                if (playerElement) {
                  playerId = playerElement.textContent.trim()
                }
                
                // 位置信息
                let location = "未找到位置信息"
                let locationElement = row.querySelector('a.trade-list-clickable.bold')
                if (!locationElement) {
                  locationElement = row.querySelector('a[data-bind*="Location"]')
                }
                if (!locationElement) {
                  locationElement = row.querySelector('td:nth-child(3) a')
                }
                if (!locationElement) {
                  locationElement = row.querySelector('a[href*="Location"]')
                }
                if (locationElement) {
                  location = locationElement.textContent.trim()
                }
                
                // 工会信息
                let guild = "未找到工会信息"
                let guildElement = row.querySelector('div[data-bind="text: GuildName"]')
                if (!guildElement) {
                  guildElement = row.querySelector('div[data-bind*="GuildName"]')
                }
                if (!guildElement) {
                  guildElement = row.querySelector('td:nth-child(2) div:nth-child(2)')
                }
                if (!guildElement) {
                  guildElement = row.querySelector('div[class*="guild"]')
                }
                if (guildElement) {
                  guild = guildElement.textContent.trim()
                }
                
                // 单价信息
                let unitPrice = "未找到单价信息"
                let unitPriceElement = row.querySelector('span[data-bind="localizedNumber: UnitPrice"]')
                if (!unitPriceElement) {
                  unitPriceElement = row.querySelector('span[data-bind*="UnitPrice"]')
                }
                if (!unitPriceElement) {
                  unitPriceElement = row.querySelector('td:nth-child(4) span')
                }
                if (unitPriceElement) {
                  unitPrice = unitPriceElement.textContent.trim()
                }
                
                // 数量信息
                let amount = "未找到数量信息"
                let amountElement = row.querySelector('span[data-bind="localizedNumber: Amount"]')
                if (!amountElement) {
                  amountElement = row.querySelector('span[data-bind*="Amount"]')
                }
                if (!amountElement) {
                  amountElement = row.querySelector('td:nth-child(5) span')
                }
                if (amountElement) {
                  amount = amountElement.textContent.trim()
                }
                
                // 总价信息
                let totalPrice = "未找到总价信息"
                let totalPriceElement = row.querySelector('span[data-bind="localizedNumber: TotalPrice"]')
                if (!totalPriceElement) {
                  totalPriceElement = row.querySelector('span[data-bind*="TotalPrice"]')
                }
                if (!totalPriceElement) {
                  totalPriceElement = row.querySelector('td:nth-child(6) span')
                }
                if (totalPriceElement) {
                  totalPrice = totalPriceElement.textContent.trim()
                }
                
                // 最后看见时间信息
                let lastSeen = "未找到最后看见时间信息"
                let lastSeenElement = row.querySelector('td.bold.hidden-xs')
                if (!lastSeenElement) {
                  lastSeenElement = row.querySelector('td[data-bind*="LastSeen"]')
                }
                if (!lastSeenElement) {
                  lastSeenElement = row.querySelector('td:last-child')
                }
                if (!lastSeenElement) {
                  lastSeenElement = row.querySelector('td[class*="time"]')
                }
                if (lastSeenElement) {
                  lastSeen = lastSeenElement.textContent.trim()
                }

                // 特质信息 - 从物品图标的data-original-title属性中提取
                let trait = ""
                let traitElement = row.querySelector('img.trade-item-icon[data-original-title]')
                if (!traitElement) {
                  traitElement = row.querySelector('img[data-original-title]')
                }
                if (!traitElement) {
                  traitElement = row.querySelector('img[data-bind*="GetItemPropertyDescription"]')
                }
                
                if (traitElement) {
                  const originalTitle = traitElement.getAttribute('data-original-title')
                  if (originalTitle) {
                    // 清理特质信息，将换行符替换为空格
                    trait = originalTitle.replace(/\n/g, ' ').replace(/\r/g, ' ').trim()
                    console.log(`[TTC] 第 ${index + 1} 行提取到特质: "${trait}"`)
                  } else {
                    console.log(`[TTC] 第 ${index + 1} 行特质元素存在但data-original-title为空`)
                  }
                } else {
                  console.log(`[TTC] 第 ${index + 1} 行未找到特质元素`)
                }
                
                // 如果至少有一些有效信息，就添加到数据中
                if (item !== "未找到物品信息" || 
                    unitPrice !== "未找到单价信息" || 
                    amount !== "未找到数量信息") {
                  
                  data.push([
                    item, level, playerId, location, guild,
                    unitPrice, amount, totalPrice, lastSeen, itemQualityColor, itemIconUrl, trait
                  ])
                  
                  // 调试信息
                  console.log(`[TTC] 提取到数据行 ${index + 1}:`, {
                    item, level, playerId, location, guild,
                    unitPrice, amount, totalPrice, lastSeen, itemQualityColor, itemIconUrl, trait
                  })
                  
                  // 特别调试图标URL
                  if (itemIconUrl) {
                    console.log(`[TTC] 第 ${index + 1} 行图标URL: ${itemIconUrl}`)
                  } else {
                    console.log(`[TTC] 第 ${index + 1} 行没有图标URL`)
                  }
                } else {
                  console.log(`[TTC] 跳过无效数据行 ${index + 1}:`, {
                    item, level, playerId, location, guild,
                    unitPrice, amount, totalPrice, lastSeen, itemQualityColor, itemIconUrl, trait
                  })
                }
                
              } catch (error) {
                console.error(`处理第 ${index + 1} 行数据时出现异常:`, error)
              }
            })
            
            // 调试信息
            console.log(`[TTC] 总共提取到 ${data.length} 条有效数据`)
            console.log(`[TTC] 数据内容:`, data)
            
            // 提取页面信息
            let currentPage = "1"
            let totalPages = "1"
            
            // 查找当前页信息
            const currentPageElement = document.querySelector('span.active[data-bind="text: $data"]')
            if (currentPageElement) {
              currentPage = currentPageElement.textContent.trim()
            }
            
            // 查找总页数信息 - 改进的获取方法
            // 方法1: 查找分页导航中的最后一页
            const paginationElements = document.querySelectorAll('.pagination li a, .pager li a, nav ul li a')
            let maxPage = 1
            for (const element of paginationElements) {
              const pageText = element.textContent.trim()
              const pageNum = parseInt(pageText)
              if (!isNaN(pageNum) && pageNum > maxPage) {
                maxPage = pageNum
              }
            }
            
            // 如果找到大于1的页码，使用它作为总页数
            if (maxPage > 1) {
              totalPages = maxPage.toString()
            }
            
            // 方法2: 查找包含TotalPageCount的链接
            if (totalPages === "1") {
              const totalPageElements = document.querySelectorAll('a[href*="TotalPageCount"], a[href*="totalPage"]')
              for (const element of totalPageElements) {
                const pageText = element.textContent.trim()
                const pageNum = parseInt(pageText)
                if (!isNaN(pageNum) && pageNum > 0) {
                  totalPages = pageText
                  break
                }
              }
            }
            
            // 方法3: 查找页面中的文本信息
            if (totalPages === "1") {
              const pageTextElements = document.querySelectorAll('span, div, p')
              for (const element of pageTextElements) {
                const text = element.textContent
                const match = text.match(/共\s*(\d+)\s*页|总共\s*(\d+)\s*页|of\s*(\d+)\s*pages/i)
                if (match) {
                  const pageNum = parseInt(match[1] || match[2] || match[3])
                  if (!isNaN(pageNum) && pageNum > 0) {
                    totalPages = pageNum.toString()
                    break
                  }
                }
              }
            }
            
            // 确保当前页和总页数都是有效数字
            const currentPageNum = parseInt(currentPage) || 1
            const totalPagesNum = parseInt(totalPages) || 1
            
            // 如果当前页大于总页数，说明总页数获取有误，尝试重新计算
            if (currentPageNum > totalPagesNum && totalPagesNum === 1) {
              // 重新查找分页信息
              const allPageLinks = document.querySelectorAll('a[href*="page"], a[href*="Page"]')
              for (const link of allPageLinks) {
                const href = link.getAttribute('href') || ''
                const pageMatch = href.match(/page[=:]\s*(\d+)/i)
                if (pageMatch) {
                  const pageNum = parseInt(pageMatch[1])
                  if (!isNaN(pageNum) && pageNum > totalPagesNum) {
                    totalPages = pageNum.toString()
                  }
                }
              }
            }
            
            // 方法4: 通过分析页面内容中的分页信息（但限制搜索范围）
            if (totalPages === "1") {
              // 只在分页相关的元素中查找数字
              const paginationRelatedElements = document.querySelectorAll('.pagination *, .pager *, nav *, [class*="page"]')
              for (const element of paginationRelatedElements) {
                const text = element.textContent.trim()
                // 只匹配纯数字且范围合理的页码
                if (/^\d+$/.test(text)) {
                  const pageNum = parseInt(text)
                  if (pageNum > 1 && pageNum <= 1000) { // 限制合理范围
                    totalPages = pageNum.toString()
                    break
                  }
                }
              }
            }
            
            // 最终验证：确保总页数合理
            const finalTotalPages = parseInt(totalPages) || 1
            if (finalTotalPages < 1 || finalTotalPages > 10000) {
              totalPages = "1" // 如果数值明显不合理，重置为1
            }
            
            const pageInfo = `第${currentPage}页/总共${totalPages}页`
            
            return { hasError: false, data, pageInfo }
          },
          serverType
        )
        
        if (tradeData.hasError) {
          logger.warn(`[TTC] 数据提取失败: ${tradeData.error}`)
          
          // 数据提取失败时截图
          await takeDebugScreenshot(browserPage, {
            line: 2060,
            description: `数据提取失败_${tradeData.error}`
          })
          
          return tradeData
        }
        
        if (!tradeData.data || tradeData.data.length === 0) {
          logger.info(`[TTC] 提取到的数据为空: ${itemName}`)
          
          // 数据为空时截图
          await takeDebugScreenshot(browserPage, {
            line: 2065,
            description: `提取到的数据为空_${itemName}`
          })
          
          return { hasError: true, error: '没有符合条件的交易' }
        }
        
        // 添加页面信息调试日志
        // logger.info(`[TTC] 页面信息提取: 当前页=${tradeData.pageInfo?.match(/第(\d+)页/)?.[1] || '未知'}, 总页数=${tradeData.pageInfo?.match(/总共(\d+)页/)?.[1] || '未知'}`)
        logger.info(`[TTC] 成功提取到 ${tradeData.data.length} 条交易数据`)
        
        // 智能验证码检测：检查是否只有1条记录且包含验证码提示
        if (tradeData.data.length === 1) {
          const firstRecord = tradeData.data[0]
          const traderName = firstRecord[2] // 交易者名字在数组的第3个位置
          
          if (traderName && traderName.includes('抱歉，您需要完成验证码测试才能继续')) {
            logger.warn(`[TTC] 检测到虚假数据：只有1条记录且卖家名字包含验证码提示`)
            
            // 虚假数据检测后截图
            await takeDebugScreenshot(browserPage, {
              line: 2075,
              description: `检测到虚假数据_只有1条记录且包含验证码提示`
            })
            
            // 获取最新的debug截图
            const screenshotPath = await this.getLatestDebugScreenshot()
            
            return { 
              hasError: true, 
              error: '偶遇验证码，拼尽全力，无法战胜！',
              screenshot: screenshotPath
            }
          }
        }
        
        // 数据提取成功后截图
        await takeDebugScreenshot(browserPage, {
          line: 2070,
          description: `成功提取到${tradeData.data.length}条交易数据`
        })
        
        return {
          hasError: false,
          data: tradeData.data,
          pageInfo: tradeData.pageInfo,
          itemName: itemName,
          serverType: serverType,
          page: page
        }
        
      } catch (error) {
        logger.error(`[TTC] 页面操作失败: ${error.message}`)
        
        // 页面操作失败时截图
        await takeDebugScreenshot(browserPage, {
          line: 2080,
          description: `页面操作失败_${error.message}`
        })
        
        return { hasError: true, error: `页面访问失败: ${error.message}` }
      } finally {
        // 在关闭页面前再次清理缓存
        await this.cleanBrowserCache(browserPage).catch(() => {})
        await browserPage.close().catch(err => logger.error('[TTC] 关闭页面失败:', err))
      }
      
    } catch (error) {
      logger.error(`[TTC] 获取页面数据失败: ${error.message}`)
      
      // 整个函数失败时截图（如果browserPage存在）
      if (browserPage) {
        await takeDebugScreenshot(browserPage, {
          line: 2090,
          description: `获取页面数据失败_${error.message}`
        }).catch(() => {}) // 忽略截图失败的错误
      }
      
      return { hasError: true, error: error.message }
    }
  }

  /** 生成交易信息图片 */
  async generateTradeImage(tradeData) {
    try {
      // 准备HTML数据用于图片生成
      const htmlData = await this.prepareTradeHTMLData(tradeData)
      
      // 使用ESO的模板系统生成截图
      const imgBuffer = await this.cacheTradeImage(htmlData)
      
      return imgBuffer
      
    } catch (error) {
      logger.error(`[TTC] 生成交易图片失败: ${error.message}`)
      return null
    }
  }

  /** 准备交易HTML模板数据 */
  async prepareTradeHTMLData(tradeData) {
    const { data, pageInfo, itemName, serverType, page } = tradeData
    
    // 转换数据格式为HTML模板需要的格式
    // 数据结构：[item, level, player_id, location, guild, unit_price, amount, total_price, last_seen, item_quality_color, item_icon_url, trait]
    const tradeRows = []
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      const itemIconUrl = row[10] // 物品图标URL
      const trait = row[11] || "" // 特质信息
      
      // 获取物品图标路径
      let itemIconPath = null
      if (itemIconUrl) {
        itemIconPath = await this.getItemIconPath(itemIconUrl, row[0])
      }
      
      tradeRows.push({
        index: i + 1,
        itemIcon: itemIconPath,                                           // 物品图标路径
        itemName: row[0],                                                 // 物品名称
        level: row[1],                                                    // 等级
        trait: trait,                                                     // 特质
        trader: row[2],                                                   // 交易者
        location: row[3],                                                 // 位置
        guild: row[4],                                                    // 工会
        unitPrice: row[5],                                                // 单价
        amount: row[6],                                                   // 数量
        totalPrice: row[7],                                               // 总价
        lastSeen: row[8],                                                 // 最后看见时间
        qualityColor: this.getQualityColorClass(row[9]),                 // 品质颜色
        rowBackgroundClass: this.getTradeLevelBackgroundClass(row[1])    // 等级背景色
      })
    }
    
    // 初始化TTC交易数据结构
    if (!this.tradeData || this.tradeData.init !== 'done') {
      this.tradeData = await TTC.get(this.e, 'ttc', 'ttc', 'trade')
      if (!this.tradeData) {
        throw new Error('TTC交易模板初始化失败')
      }
    }
    
    const templateData = {
      ...this.tradeData,
      ttcData: [
        {
          pic: 'cd1' // 背景图片
        },
        {
          itemName: itemName,
          serverName: serverType.toUpperCase() === 'US' ? '美服' : '欧服',
          pageInfo: pageInfo,
          currentPage: page,
          dataCount: data.length,
          tradeData: tradeRows
        }
      ]
    }

    return templateData
  }

  /** 根据品质颜色获取CSS类名 */
  getQualityColorClass(colorName) {
    const colorMap = {
      '深灰色': 'normal',
      '中绿色': 'fine',
      '蓝色': 'superior', 
      '紫色': 'epic',
      '金色': 'legendary'
    }
    return colorMap[colorName] || 'normal'
  }

  /** 根据交易等级获取行背景CSS类名 */
  getTradeLevelBackgroundClass(level) {
    if (!level || level === '未找到等级信息') {
      return ''
    }
    
    // 检查是否为CP160等级
    if (level.includes('CP160') || level === 'CP等级160') {
      return 'cp160-bg'
    }
    
    // 检查是否为普通等级160
    if (level.includes('普通等级160') || level === '等级160') {
      return 'level160-bg'
    }
    
    // 检查是否为其他CP等级
    if (level.includes('CP等级') || level.includes('CP')) {
      return 'cp-level-bg'
    }
    
    // 检查是否为普通等级
    if (level.includes('普通等级') || /等级\d+/.test(level)) {
      return 'normal-level-bg'
    }
    
    // 默认无背景
    return ''
  }

  /** 下载物品图标 */
  async downloadItemIcon(iconUrl, itemName) {
    try {
      if (!iconUrl || !itemName) {
        return null
      }

      // 从URL中提取原始图片名字
      let originalFileName = null
      
      // 方法1: 从URL路径中提取文件名
      if (iconUrl.includes('/Content/icons/')) {
        const pathParts = iconUrl.split('/Content/icons/')
        if (pathParts.length > 1) {
          originalFileName = pathParts[1]
        }
      }
      
      // 方法2: 如果URL以图标名结尾，直接提取
      if (!originalFileName && iconUrl.includes('.png')) {
        const urlParts = iconUrl.split('/')
        const lastPart = urlParts[urlParts.length - 1]
        if (lastPart.includes('.png') || lastPart.includes('.jpg') || lastPart.includes('.gif')) {
          originalFileName = lastPart
        }
      }
      
      // 如果无法提取原始文件名，使用默认命名方式
      if (!originalFileName) {
        const urlHash = md5(iconUrl)
        const safeItemName = itemName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 50)
        originalFileName = `${safeItemName}_${urlHash}.png`
      }
      
      // 确保文件名是安全的
      const safeFileName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = path.join(TTC_IMAGE_PATH, safeFileName)

      // 检查文件是否已存在
      if (fs.existsSync(filePath)) {
        //logger.info(`[TTC] 物品图标已存在: ${safeFileName}`)
        return safeFileName
      }

      // 使用Bot.download方法下载图标
      logger.info(`[TTC] 开始下载物品图标: ${iconUrl} -> ${safeFileName}`)
      const success = await Bot.download(iconUrl, filePath)
      
      if (success) {
        //logger.info(`[TTC] 物品图标下载成功: ${safeFileName}`)
        return safeFileName
      } else {
        logger.warn(`[TTC] 下载物品图标失败: Bot.download返回false`)
        return null
      }

    } catch (error) {
      logger.error(`[TTC] 下载物品图标失败: ${error.message}`)
      return null
    }
  }

  /** 获取物品图标文件名 */
  async getItemIconFileName(iconUrl, itemName) {
    if (!iconUrl || !itemName) {
      return null
    }

    // 检查缓存
    const cacheKey = `icon_${md5(iconUrl)}`
    const cachedFileName = imageCache.get(cacheKey)
    if (cachedFileName) {
      return cachedFileName
    }

    // 下载图标
    const fileName = await this.downloadItemIcon(iconUrl, itemName)
    if (fileName) {
      imageCache.set(cacheKey, fileName)
    }

    return fileName
  }

  /** 获取物品图标路径（用于HTML模板） */
  async getItemIconPath(iconUrl, itemName) {
    if (!iconUrl || !itemName) {
      return null
    }

    // 获取图标文件名
    const fileName = await this.getItemIconFileName(iconUrl, itemName)
    if (!fileName) {
      return null
    }

    // 返回相对于HTML模板的路径
    // HTML模板中使用 {{pluResPath}}custome_resources/ttc/images/{{item.itemIcon}}
    // 所以这里只需要返回文件名即可
    return fileName
  }

  /** 处理图标URL，确保使用正确的服务器前缀 */
  processIconUrl(iconUrl, serverType) {
    if (!iconUrl) {
      return null
    }

    const baseUrl = serverType === 'eu' ? 'https://eu.tamrieltradecentre.com' : 'https://us.tamrieltradecentre.com'
    
    // 如果已经是完整的URL，直接返回
    if (iconUrl.startsWith('http')) {
      logger.info(`[TTC] 图标URL已经是完整URL: ${iconUrl}`)
      return iconUrl
    }
    
    // 处理相对路径
    if (iconUrl.startsWith('/Content/icons/')) {
      const fullUrl = `${baseUrl}${iconUrl}`
      logger.info(`[TTC] 处理相对路径图标URL: ${iconUrl} -> ${fullUrl}`)
      return fullUrl
    }
    
    if (iconUrl.startsWith('Content/icons/')) {
      const fullUrl = `${baseUrl}/${iconUrl}`
      logger.info(`[TTC] 处理相对路径图标URL: ${iconUrl} -> ${fullUrl}`)
      return fullUrl
    }
    
    // 如果包含Content/icons/但不是完整URL，提取路径
    if (iconUrl.includes('Content/icons/')) {
      const iconPath = iconUrl.includes('/Content/icons/') ? 
        iconUrl.substring(iconUrl.indexOf('/Content/icons/')) : 
        `/Content/icons/${iconUrl}`
      const fullUrl = `${baseUrl}${iconPath}`
      logger.info(`[TTC] 处理包含Content/icons/的图标URL: ${iconUrl} -> ${fullUrl}`)
      return fullUrl
    }
    
    // 如果只是图标名称，添加完整路径
    if (iconUrl.includes('.png') || iconUrl.includes('.jpg') || iconUrl.includes('.gif')) {
      const fullUrl = `${baseUrl}/Content/icons/${iconUrl}`
      logger.info(`[TTC] 处理图标文件名: ${iconUrl} -> ${fullUrl}`)
      return fullUrl
    }
    
    logger.warn(`[TTC] 无法处理的图标URL格式: ${iconUrl}`)
    return iconUrl
  }

  /** 缓存交易截图 */
  async cacheTradeImage(data) {
    //logger.info(data.ttcData[1].tradeData)

    const tmp = md5(JSON.stringify(data))
    if (ttcImgCache.md5 === tmp) {
      return ttcImgCache.img
    }

    // 生成新的截图
    ttcImgCache.img = await puppeteer.screenshot('eso', data)
    ttcImgCache.md5 = tmp

    return ttcImgCache.img
  }

  /** 生成无数据图片 */
  async generateNoDataImage(itemName, page, serverType, errorMsg = '没有符合条件的交易') {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>TTC交易查询</title>
        <style>
          body { 
            font-family: 'Microsoft YaHei', sans-serif; 
            margin: 0; 
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 200px;
          }
          .container {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 12px;
            padding: 30px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
          }
          .header { color: #2c3e50; margin-bottom: 20px; }
          .no-data { color: #666; margin: 30px 0; }
          .info { color: #999; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🔍 TTC交易查询</h2>
            <p>物品：${itemName} | 服务器：${serverType.toUpperCase()} | 页数：${page}</p>
          </div>
          <div class="no-data">
            <h3>📭 ${errorMsg}</h3>
            <p>请尝试：</p>
            <p>• 检查物品名称是否正确</p>
            <p>• 尝试不同的页数</p>
            <p>• 稍后再试</p>
          </div>
          <div class="info">
            <p>TTC交易中心 · ESO-Bot</p>
          </div>
        </div>
      </body>
      </html>
    `

    return await puppeteer.screenshot('ttc-trade', {
      file: `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`,
      quality: 100,
      type: 'png'
    })
  }

  /** 生成错误图片 */
  async generateErrorImage(itemName, page, serverType, errorMsg) {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>TTC查询错误</title>
        <style>
          body { 
            font-family: 'Microsoft YaHei', sans-serif; 
            margin: 0; 
            padding: 20px;
            background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
            min-height: 200px;
          }
          .container {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 12px;
            padding: 30px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
          }
          .header { color: #c0392b; margin-bottom: 20px; }
          .error { color: #e74c3c; margin: 30px 0; }
          .info { color: #999; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>❌ TTC查询失败</h2>
            <p>物品：${itemName} | 服务器：${serverType.toUpperCase()} | 页数：${page}</p>
          </div>
          <div class="error">
            <h3>查询时发生错误</h3>
            <p>${errorMsg}</p>
            <p>请稍后重试或联系管理员</p>
          </div>
          <div class="info">
            <p>TTC交易中心 · ESO-Bot</p>
          </div>
        </div>
      </body>
      </html>
    `

    return await puppeteer.screenshot('ttc-trade', {
      file: `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`,
      quality: 100,
      type: 'png'
    })
  }



  /** 根据物品名称查找物品ID */
  async findItemIdByName(itemName) {
    try {
      // 优先在TTC的ItemLookUpTable中查找
      const lookupPath = TTC_LOOKUP_TABLE_LUA
      if (fs.existsSync(lookupPath)) {
        const content = fs.readFileSync(lookupPath, 'utf-8')
        const pattern = /\["([^"]+)"\]\s*=\s*\{([^}]+)\}/g
        let match
        
        while ((match = pattern.exec(content)) !== null) {
          const fullName = match[1]
          const idsContent = match[2]
          
          if (fullName === itemName || fullName.includes(itemName)) {
            // 提取第一个物品ID
            const idMatch = idsContent.match(/\[\d+\]\s*=\s*(\d+)/)
            if (idMatch) {
              return idMatch[1]
            }
          }
        }
      }
      
      return null
    } catch (error) {
      logger.error(`[TTC] 查找物品ID失败: ${error.message}`)
      return null
    }
  }

  /** 根据物品名称查找所有匹配的物品ID和名称 */
  async findAllItemIdsByName(itemName) {
    try {
      const lookupPath = TTC_LOOKUP_TABLE_LUA
      const exactMatches = []    // 完全匹配
      const fuzzyMatches = []    // 模糊匹配
      
      if (fs.existsSync(lookupPath)) {
        const content = fs.readFileSync(lookupPath, 'utf-8')
        const pattern = /\["([^"]+)"\]\s*=\s*\{([^}]+)\}/g
        let match
        
        while ((match = pattern.exec(content)) !== null) {
          const fullName = match[1]
          const idsContent = match[2]
          
          // 检查物品名匹配类型
          const isExactMatch = fullName.toLowerCase() === itemName.toLowerCase()
          const isFuzzyMatch = fullName.toLowerCase().includes(itemName.toLowerCase())
          
          if (isExactMatch || isFuzzyMatch) {
            // 提取所有物品ID
            const idMatches = idsContent.match(/\[\d+\]\s*=\s*(\d+)/g)
            if (idMatches) {
              for (const idMatch of idMatches) {
                const itemId = idMatch.match(/=\s*(\d+)/)[1]
                const itemInfo = {
                  id: itemId,
                  name: fullName
                }
                
                if (isExactMatch) {
                  exactMatches.push(itemInfo)
                } else {
                  fuzzyMatches.push(itemInfo)
                }
              }
            }
          }
        }
      }
      
      // 返回分类结果
      return {
        exactMatches: exactMatches.slice(0, 10),
        fuzzyMatches: fuzzyMatches.slice(0, 10),
        hasExactMatch: exactMatches.length > 0
      }
    } catch (error) {
      logger.error(`[TTC] 查找所有物品ID失败: ${error.message}`)
      return {
        exactMatches: [],
        fuzzyMatches: [],
        hasExactMatch: false
      }
    }
  }

  /** 更新价格数据 */
  async updatePriceData(serverKey = 'NA') {
    try {
      // 根据服务器获取对应配置
      const serverConfig = SERVER_CONFIG[serverKey]
      if (!serverConfig) {
        throw new Error(`不支持的服务器: ${serverKey}`)
      }
      
      const downloadUrl = serverConfig.downloadUrl
      const zipPath = serverConfig.priceZip
      const luaFilePath = serverConfig.priceTableLua
      const lookupFilePath = TTC_LOOKUP_TABLE_LUA
      const jsonFilePath = serverConfig.priceTableJson

      logger.info('[TTC] 开始下载价格表...')
      
      // 下载价格表压缩包
      const response = await fetch(downloadUrl)
      if (!response.ok) {
        throw new Error(`下载失败: ${response.status} ${response.statusText}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      fs.writeFileSync(zipPath, buffer)

      logger.info('[TTC] 价格表下载完成，开始解压...')

      // 尝试解压文件
      try {
        await this.extractPriceTable(zipPath, TTC_DATA_PATH)
        logger.info('[TTC] 价格表解压完成')
      } catch (extractError) {
        logger.warn(`[TTC] 解压失败，跳过解压步骤: ${extractError.message}`)
        // 解压失败不影响整体流程，继续执行
      }
      
      // 清理压缩包
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath)
      }

      // 检查lua文件是否存在并尝试解析
      let luaTimestamp = null
      let updateTime = new Date().toLocaleString('zh-CN') // 默认使用当前时间，如果无法从lua获取
      
      let priceTableData = {
        metadata: {
          updateTime: updateTime,
          server: serverConfig.name,
          serverCode: serverConfig.code,
          version: '1.0.0',
          source: `TTC Price Table - ${serverConfig.name}`,
          itemCount: 0
        },
        priceTable: {}
      }

      // 尝试解析lua价格表文件
      if (fs.existsSync(luaFilePath)) {
        logger.info('[TTC] 开始解析lua价格表文件...')
        try {
          const parseResult = await this.parseLuaPriceTable(luaFilePath, lookupFilePath)
          if (parseResult && parseResult.priceTable && Object.keys(parseResult.priceTable).length > 0) {
            priceTableData.priceTable = parseResult.priceTable
            // 使用解析结果中的正确物品数量，而不是重新计算
            priceTableData.metadata.itemCount = parseResult.metadata.itemCount
            
            // 将原始TimeStamp保存到正确位置，确保查询时能找到
            if (parseResult.priceTable.TimeStamp) {
              priceTableData.TimeStamp = parseResult.priceTable.TimeStamp
              priceTableData.metadata.originalTimestamp = parseResult.priceTable.TimeStamp
            }
            
            // 使用从lua文件解析的时间戳
            if (parseResult.metadata.timestamp) {
              luaTimestamp = parseResult.metadata.timestamp
              // 检查时间戳是否合理（不是当前时间的默认值）
              const currentTime = Date.now() / 1000
              const timeDiff = Math.abs(luaTimestamp - currentTime)
              
              // 如果时间戳与当前时间差距超过1秒，说明是有效的lua时间戳
              if (timeDiff > 1) {
                updateTime = this.formatTimestamp(luaTimestamp, 'locale')
                priceTableData.metadata.updateTime = updateTime
                logger.info(`[TTC] 使用lua文件时间戳: ${updateTime} (原始值: ${luaTimestamp})`)
              } else {
                logger.warn(`[TTC] lua时间戳疑似为当前时间默认值，使用当前时间`)
              }
            } else {
              logger.warn(`[TTC] lua文件中未找到时间戳，使用当前时间`)
            }
            
            logger.info(`[TTC] 成功解析 ${priceTableData.metadata.itemCount} 个物品价格`)
          } else {
            logger.warn('[TTC] lua文件解析结果为空，使用示例数据')
            // 提供基本的示例数据
            priceTableData.priceTable = {
              "demo": {
                itemName: "示例物品",
                averagePrice: 1000,
                quality: "史诗",
                category: "示例分类",
                server: serverConfig.code
              }
            }
            priceTableData.metadata.itemCount = 1
          }
        } catch (parseError) {
          logger.error(`[TTC] 解析lua文件失败: ${parseError.message}`)
          // 创建错误信息
          priceTableData.priceTable = {
            "error": {
              itemName: "解析失败",
              averagePrice: 0,
              quality: "未知",
              category: "错误",
              server: serverConfig.code,
              error: parseError.message
            }
          }
          priceTableData.metadata.itemCount = 0
        }
      } else {
        logger.warn(`[TTC] lua价格表文件不存在: ${luaFilePath}`)
        priceTableData.priceTable = {
          "missing": {
            itemName: "文件缺失",
            averagePrice: 0,
            quality: "未知",
            category: "错误",
            server: serverConfig.code
          }
        }
      }

      fs.writeFileSync(jsonFilePath, JSON.stringify(priceTableData, null, 2))

      logger.info(`[TTC] 价格表已保存到: ${jsonFilePath}`)

      return {
        success: true,
        updateTime: updateTime,
        count: priceTableData.metadata.itemCount,
        savePath: path.relative('./plugins/eso/', jsonFilePath), // 显示相对路径更友好
        originalTimestamp: luaTimestamp // 也返回原始时间戳用于调试
      }

    } catch (error) {
      logger.error(`[TTC] 更新价格表失败: ${error.message}`)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /** 解压价格表文件 */
  async extractPriceTable(zipPath, targetDir) {
    // 简单的解压实现，实际项目中建议使用专门的zip解压库
    // 如 node-stream-zip、yauzl 等
    try {
      // 这里可以尝试使用系统命令解压或者第三方库
      // 为了简化，这里只是模拟解压过程
      //logger.info(`[TTC] 尝试解压 ${zipPath} 到 ${targetDir}`)
      
      // 如果系统有unzip命令，可以尝试使用
      const { execSync } = await import('child_process')
      
      // Windows 系统解压命令（PowerShell）
      if (process.platform === 'win32') {
        const cmd = `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force"`
        execSync(cmd, { encoding: 'utf8' })
      } else {
        // Unix/Linux 系统
        const cmd = `unzip -o "${zipPath}" -d "${targetDir}"`
        execSync(cmd, { encoding: 'utf8' })
      }
      
      logger.info('[TTC] 系统解压命令执行成功')
    } catch (error) {
      // 如果系统命令失败，提供备用方案
      throw new Error(`解压失败: ${error.message}。建议手动解压或安装zip处理库`)
    }
  }

  /** 解析lua价格表文件 */
  async parseLuaPriceTable(luaFilePath, lookupFilePath) {
    try {
      //logger.info(`[TTC] 开始解析lua文件: ${luaFilePath}`)
      
      // 读取lua文件内容
      const luaSrc = await fs.promises.readFile(luaFilePath, 'utf8')
      
      // 按照原始TTC项目的逻辑提取lua table
      // 1. 找到 self.PriceTable 的位置
      const startPos = luaSrc.indexOf('self.PriceTable')
      if (startPos === -1) {
        throw new Error('未找到self.PriceTable')
      }
      
      // 2. 找到第一个 '{' 的位置
      const startBrace = luaSrc.indexOf('{', startPos)
      if (startBrace === -1) {
        throw new Error('未找到数据开始的大括号')
      }
      
      // 3. 通过括号平衡计算找到对应的 '}'
      let braceCount = 1
      let endBrace = startBrace + 1
      while (endBrace < luaSrc.length && braceCount > 0) {
        if (luaSrc[endBrace] === '{') {
          braceCount++
        } else if (luaSrc[endBrace] === '}') {
          braceCount--
        }
        endBrace++
      }
      
      if (braceCount > 0) {
        throw new Error('找不到匹配的结束大括号')
      }
      
      // 4. 提取lua table内容
      const luaTableStr = luaSrc.substring(startBrace, endBrace)
      logger.info(`[TTC] 提取的lua table长度: ${luaTableStr.length} 字符`)
      
      // 5. 按照原始项目逻辑转换lua语法
      let convertedStr = luaTableStr
      
      // 处理键的格式转换：[key] -> "key"
      convertedStr = convertedStr.replace(/\[([^\]]+)\]/g, (match, key) => {
        // 移除键周围可能的引号，然后重新添加
        let cleanKey = key.trim()
        if (cleanKey.startsWith('"') && cleanKey.endsWith('"')) {
          cleanKey = cleanKey.slice(1, -1)
        }
        if (cleanKey.startsWith("'") && cleanKey.endsWith("'")) {
          cleanKey = cleanKey.slice(1, -1)
        }
        return `"${cleanKey}"`
      })
      
      // DEBUG: 显示转换过程
      //logger.info(`[TTC] 键名转换后的前500字符: ${convertedStr.substring(0, 500)}...`)
      
      // 将 = 替换为 :
      convertedStr = convertedStr.replace(/=/g, ':')
      
      // 移除注释行
      convertedStr = convertedStr.replace(/--.*$/gm, '')
      
      // 移除尾随逗号
      convertedStr = convertedStr.replace(/,(\s*[}\]])/g, '$1')
      
      // DEBUG: 显示最终转换结果的样本
      //logger.info(`[TTC] 最终转换结果的前1000字符: ${convertedStr.substring(0, 1000)}...`)
      //logger.info(`[TTC] 最终转换结果的后500字符: ...${convertedStr.substring(convertedStr.length - 500)}`)
      
      // 6. 先保存为JSON文件（按照原始项目流程）
      const serverKey = luaFilePath.includes('NA') ? 'NA' : 'EU'
      const jsonFilePath = path.join(path.dirname(luaFilePath), `PriceTable${serverKey}.json`)
      
      try {
        // 使用eval解析（类似原项目的literal_eval）
        const parsedData = eval(`(${convertedStr})`)
        
        // 确保TimeStamp被正确处理
        if (!parsedData.TimeStamp) {
          logger.warn(`[TTC] 警告: TimeStamp字段缺失或为空`)
        }
        
        // 按照原始TTC项目逻辑：直接保存完整的解析数据（包含TimeStamp）
        await fs.promises.writeFile(jsonFilePath, JSON.stringify(parsedData, null, 2), 'utf8')
        //logger.info(`[TTC] 价格表已转换并保存到: ${jsonFilePath}`)
        
        // 计算物品数量（优先从Data字段计算，因为真正的物品数据在Data中）
        let itemCount = 0
        
        if (parsedData.Data) {
          // 数据在Data字段中，这是正确的TTC价格表结构
          itemCount = Object.keys(parsedData.Data).filter(key => /^\d+$/.test(key)).length
        } else {
          // 如果没有Data字段，从顶级计算（向后兼容）
          itemCount = Object.keys(parsedData).filter(key => 
            key !== 'TimeStamp' && key !== 'Data' && /^\d+$/.test(key)
          ).length
        }
        
        logger.info(`[TTC] 成功解析 ${itemCount} 个物品的价格数据`)
        
        return {
          priceTable: parsedData,
          metadata: {
            itemCount: itemCount,
            timestamp: parsedData.TimeStamp || Date.now(),
            server: serverKey,
            jsonFilePath: jsonFilePath
          }
        }
        
      } catch (parseError) {
        logger.error(`[TTC] 解析转换后的数据失败: ${parseError.message}`)
        throw new Error(`解析失败: ${parseError.message}`)
      }
      
    } catch (error) {
      logger.error(`[TTC] 解析lua价格表失败: ${error.message}`)
      logger.error(`[TTC] 错误详情: ${error}`)
      throw error
    }
  }

  /** 在复杂的嵌套数据结构中查找物品数据（参考原始TTC项目的find_item_data函数） */
  findItemData(data, itemId) {
    const queue = [data]
    
    while (queue.length > 0) {
      const current = queue.shift()
      
      if (typeof current === 'object' && current !== null) {
        // 检查是否有Data属性
        if (current.Data && typeof current.Data === 'object') {
          const result = current.Data[String(itemId)]
          if (result) return result
        }
        
        // 检查当前层级是否有该物品ID
        if (current[String(itemId)]) {
          return current[String(itemId)]
        }
        
        // 继续搜索子结构
        for (const [key, value] of Object.entries(current)) {
          if (key === String(itemId)) {
            return value
          }
          if (typeof value === 'object' && value !== null) {
            queue.push(value)
          }
        }
      } else if (Array.isArray(current)) {
        for (const item of current) {
          if (typeof item === 'object' && item !== null) {
            queue.push(item)
          }
        }
      }
    }
    
    return null
  }

  /** 处理特殊的价格数据结构（参考原始TTC项目的process_special_structures函数） */
  processSpecialStructures(itemData) {
    const results = []
    
    const traverse = (node, path = []) => {
      if (typeof node === 'object' && node !== null && !Array.isArray(node)) {
        // 检查是否包含价格字段
        if (node.A !== undefined || node.X !== undefined || node.N !== undefined) {
          const priceInfo = this.flattenPriceData(node, path.join('|'))
          results.push(priceInfo)
          return
        }
        
        // 继续遍历子节点
        for (const [key, value] of Object.entries(node)) {
          traverse(value, [...path, key])
        }
      } else if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          traverse(node[i], [...path, String(i)])
        }
      }
    }
    
    traverse(itemData)
    return results
  }

  /** 扁平化价格数据（参考原始TTC项目的flatten_price_data函数） */
  flattenPriceData(priceData, traitPath) {
    const result = {}
    
    // 价格字段映射
    const priceFieldMap = {
          'A': '平均价',
    'X': '最高价',
    'N': '最低价',
    'EC': '列表数量',
    'AC': '总物品数',
    'S': '建议价',
    'SA': '销售均价',
    'SE': '销售记录数',
    'SAC': '销售总数'
    }
    
    // 只保留有值的字段
    for (const [field, chineseName] of Object.entries(priceFieldMap)) {
      const value = priceData[field]
      if (value !== undefined && value !== null) {
        result[chineseName] = value
      }
    }
    
    // 解析TraitPath
    const traitInfo = this.parseTraitPath(traitPath)
    Object.assign(result, traitInfo)
    
    return result
  }

  /** 解析特质路径（参考原始TTC项目的parse_trait_path函数） */
  parseTraitPath(traitPath) {
    const parts = traitPath.split('|')
    
    // 品质映射
    const qualityMap = {
      "-1": "无",
      "0": "普通",
      "1": "优良", 
      "2": "上乘",
      "3": "史诗",
      "4": "传说"
    }
    
    // 特质映射 (完整的34种特质)
    const traitMap = {
      "-1": "无",
      "0": "动力", "1": "充能", "2": "精准", "3": "注魔", "4": "防御",
      "5": "训练", "6": "锋锐", "7": "决意", "8": "强韧", "9": "牢不可破",
      "10": "加固", "11": "合身", "12": "鼓舞", "13": "神性", "14": "奈恩磨砺",
      "15": "精巧", "16": "华丽", "17": "奥术", "18": "健康", "19": "强壮",
      "20": "特殊", "21": "嗜血", "22": "和谐", "23": "保护", "24": "轻灵",
      "25": "三位一体", "26": "好斗", "27": "增强", "28": "加强", "29": "聚焦",
      "30": "多产", "31": "加速", "32": "破裂", "33": "舒缓", "34": "活力"
    }
    
    // 处理等级转换
    const originalLevel = parts[1] || "未知"
    let convertedLevel = originalLevel
    try {
      const levelNum = parseInt(originalLevel)
      convertedLevel = levelNum > 50 ? `CP${levelNum - 50}` : String(levelNum)
    } catch (e) {
      // 保持原值
    }
    
    const baseInfo = {
      "品质": qualityMap[parts[0]] || "未知",
      "等级": convertedLevel,
      "特质": traitMap[parts[2]] || "未知特质"
    }
    
    const effectParts = parts.slice(3)
    
    // 普通商品判断
    if (parts.length === 3) {
      return { ...baseInfo, "类型": "普通商品", "详细分类": "无" }
    }
    
    // 根据路径长度判断类型
    if (effectParts.length === 4) {
      return { ...baseInfo, "类型": "大师令", "详细分类": "需求物品" }
    }
    
    return baseInfo
  }

  /** 在复杂的嵌套数据结构中查找物品数据（参考原始TTC项目的find_item_data函数） */
  findItemData(data, itemId) {
    const queue = [data]
    
    while (queue.length > 0) {
      const current = queue.shift()
      
      if (typeof current === 'object' && current !== null) {
        // 检查是否有Data属性
        if (current.Data && typeof current.Data === 'object') {
          const result = current.Data[String(itemId)]
          if (result) return result
        }
        
        // 检查当前层级是否有该物品ID
        if (current[String(itemId)]) {
          return current[String(itemId)]
        }
        
        // 继续搜索子结构
        for (const [key, value] of Object.entries(current)) {
          if (key === String(itemId)) {
            return value
          }
          if (typeof value === 'object' && value !== null) {
            queue.push(value)
          }
        }
      } else if (Array.isArray(current)) {
        for (const item of current) {
          if (typeof item === 'object' && item !== null) {
            queue.push(item)
          }
        }
      }
    }
    
    return null
  }

  /** 处理特殊的价格数据结构（参考原始TTC项目的process_special_structures函数） */
  processSpecialStructures(itemData) {
    const results = []
    
    const traverse = (node, path = []) => {
      if (typeof node === 'object' && node !== null && !Array.isArray(node)) {
        // 检查是否包含价格字段
        if (node.A !== undefined || node.X !== undefined || node.N !== undefined) {
          const priceInfo = this.flattenPriceData(node, path.join('|'))
          results.push(priceInfo)
          return
        }
        
        // 继续遍历子节点
        for (const [key, value] of Object.entries(node)) {
          traverse(value, [...path, key])
        }
      } else if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          traverse(node[i], [...path, String(i)])
        }
      }
    }
    
    traverse(itemData)
    return results
  }



  /** 查询物品价格 */
  async queryItemPrice(queryContent, serverKey = 'na') {
    try {
      // 创建缓存键
      const cacheKey = `price_${serverKey}_${queryContent}`
      const serverConfig = SERVER_CONFIG[serverKey]
      const luaFilePath = serverConfig.priceTableLua
      const jsonFilePath = path.join(path.dirname(luaFilePath), `PriceTable${serverKey.toUpperCase()}.json`)
      
      // 检查JSON文件是否存在
      if (!fs.existsSync(jsonFilePath)) {
        return {
          type: 'text',
          content: `❌ ${serverConfig.name}价格表文件不存在\n\n请先执行以下操作：\n🔄 #更新价格表\n\n更新完成后再查询价格。`
        }
      }

      // 读取JSON价格表数据
      let priceTableData = null
      try {
        //logger.info('[TTC] 开始读取价格表JSON文件...')
        const jsonContent = await fs.promises.readFile(jsonFilePath, 'utf8')
        priceTableData = JSON.parse(jsonContent)
        //logger.info(`[TTC] 成功读取价格表数据`)
      } catch (error) {
        logger.error(`[TTC] 读取价格表失败: ${error.message}`)
        return {
          type: 'text',
          content: `❌ 价格表读取失败\n\n错误信息: ${error.message}\n\n请尝试重新更新价格表：\n🔄 #更新价格表`
        }
      }

      // 1. 如果输入是纯数字，直接作为物品ID精确查询
      if (queryContent.match(/^\d+$/)) {
        const itemId = queryContent
        const itemName = `物品ID: ${itemId}`
        
        // 精确ID查询
        const result = await this.queryItemPriceById(itemId, itemName, priceTableData, serverConfig, cacheKey)
        return result
      } else {
        // 2. 如果输入是物品名称，查找所有匹配的物品
        const matchResult = await this.findAllItemIdsByName(queryContent)
        
        // 3. 如果找到完全匹配的物品，使用完全匹配结果
        if (matchResult.hasExactMatch) {
          if (matchResult.exactMatches.length === 1) {
            // 只有一个完全匹配，直接查询价格
            const item = matchResult.exactMatches[0]
            const result = await this.queryItemPriceById(item.id, item.name, priceTableData, serverConfig, cacheKey)
            return result
          } else {
            // 多个完全匹配，显示价格摘要
            return await this.queryMultipleItemsPrices(matchResult.exactMatches, priceTableData, serverConfig, queryContent, cacheKey)
          }
        }
        
        // 4. 没有完全匹配，检查是否有模糊匹配
        if (matchResult.fuzzyMatches.length > 0) {
          if (matchResult.fuzzyMatches.length === 1) {
            // 只有一个模糊匹配，自动使用该结果查询价格
            const item = matchResult.fuzzyMatches[0]
            logger.info(`[TTC] 找到唯一模糊匹配，自动使用该结果: ${queryContent} -> ${item.name}`)
            const result = await this.queryItemPriceById(item.id, item.name, priceTableData, serverConfig, cacheKey)
            
            // 在结果中添加提示信息，说明使用了模糊匹配
            if (result && result.type === 'text') {
              result.content = `🔍 使用了模糊匹配结果：${item.name}\n\n${result.content}`
            } else if (result && result.type === 'image') {
              // 对于图片结果，我们无法直接添加文本，但可以在请求处理中添加说明
              logger.info(`[TTC] 图片结果使用了模糊匹配: ${queryContent} -> ${item.name}`)
            }
            
            return result
          } else {
            // 多个模糊匹配，转到查询物品功能
            logger.info(`[TTC] 找到多个模糊匹配，转到查询物品功能: ${queryContent}`)
            return await this.redirectToItemSearch(queryContent)
          }
        }
        
        // 5. 完全没有匹配结果
        return {
          type: 'text',
          content: `❌ 未找到包含 "${queryContent}" 的物品\n\n请先使用以下命令查找正确的物品ID：\n📦 #查询物品 找到完整物品名\n\n然后使用ID查询价格：\n💰 #查询价格 [物品ID]`
        }
      }

    } catch (error) {
      logger.error(`[TTC] 查询价格时发生错误: ${error.message}`)
      const errorMsg = `❌ 查询价格时发生错误\n\n${error.message}\n\n请尝试重新更新价格表：\n🔄 #更新价格表`
      return {
        type: 'text',
        content: errorMsg,
        cacheKey: cacheKey
      }
    }
  }

  /** 查询单个物品的价格 */
  async queryItemPriceById(itemId, itemName, priceTableData, serverConfig, cacheKey) {
    try {
      // 在复杂的数据结构中查找物品数据
      const dataToSearch = priceTableData.priceTable || priceTableData
      const itemData = this.findItemData(dataToSearch, itemId)
      
      //logger.info(`[TTC] 搜索数据结构: ${Object.keys(dataToSearch).slice(0, 5).join(', ')}...`)
      logger.info(`[TTC] 物品${itemId}查找结果: ${itemData ? '已找到' : '未找到'}`)
      
      if (!itemData) {
        return {
          type: 'text',
          content: `❌ 物品ID ${itemId} 在${serverConfig.name}暂无价格数据\n\n可能原因：\n• 该物品无法交易\n• 近期无交易记录\n• 价格表需要更新`
        }
      }

      // 处理复杂的价格数据结构
      const processedData = this.processSpecialStructures(itemData)
      if (!processedData || processedData.length === 0) {
        return {
          type: 'text',
          content: `❌ 物品ID ${itemId} 的价格数据格式异常\n\n请尝试重新更新价格表：\n🔄 #更新价格表`
        }
      }

      // 获取时间戳
      let timestamp = priceTableData.TimeStamp
      if (!timestamp && priceTableData.priceTable) {
        timestamp = priceTableData.priceTable.TimeStamp
      }
      if (!timestamp && priceTableData.Data) {
        timestamp = priceTableData.Data.TimeStamp
      }

      // 尝试生成HTML截图
      try {
        const priceImage = await this.generatePriceImage(itemId, itemName, processedData, timestamp, serverConfig)
        return {
          type: 'image',
          content: priceImage,
          cacheKey: cacheKey
        }
      } catch (error) {
        logger.warn(`[TTC] 图片生成失败，降级到文本显示: ${error.message}`)
        const textResult = await this.generateTextPrice(itemId, itemName, processedData, timestamp, serverConfig)
        return {
          type: 'text',
          content: textResult,
          cacheKey: cacheKey
        }
      }
    } catch (error) {
      logger.error(`[TTC] 查询物品${itemId}价格失败: ${error.message}`)
      return {
        type: 'text',
        content: `❌ 查询物品${itemId}价格时发生错误\n\n${error.message}`,
        cacheKey: cacheKey
      }
    }
  }

  /** 查询多个物品的价格 */
  async queryMultipleItemsPrices(matchedItems, priceTableData, serverConfig, queryContent, cacheKey) {
    try {
      const dataToSearch = priceTableData.priceTable || priceTableData
      const results = []
      
      // 获取时间戳
      let timestamp = priceTableData.TimeStamp
      if (!timestamp && priceTableData.priceTable) {
        timestamp = priceTableData.priceTable.TimeStamp
      }
      if (!timestamp && priceTableData.Data) {
        timestamp = priceTableData.Data.TimeStamp
      }

      let timeStr = this.formatTimestamp(timestamp, 'zh-CN')

      // 查询每个匹配物品的价格
      for (const item of matchedItems) {
        const itemData = this.findItemData(dataToSearch, item.id)
        if (itemData) {
          const processedData = this.processSpecialStructures(itemData)
          if (processedData && processedData.length > 0) {
            // 只取第一条价格数据作为摘要
            const firstData = processedData[0]
            results.push({
              id: item.id,
              name: item.name,
              quality: firstData.品质 || '未知',
              level: firstData.等级 || '未知',
              trait: firstData.特质 || '未知',
              lowPrice: firstData.最低价 ? `${firstData.最低价.toLocaleString()}金` : '无',
              avgPrice: firstData.平均价 ? `${firstData.平均价.toLocaleString()}金` : '无',
              dataCount: processedData.length
            })
          }
        }
      }

      if (results.length === 0) {
        return {
          type: 'text',
          content: `❌ 找到 ${matchedItems.length} 个包含 "${queryContent}" 的物品，但都没有价格数据\n\n可能原因：\n• 这些物品无法交易\n• 近期无交易记录\n• 价格表需要更新`
        }
      }

      // 构建多物品价格摘要
      let priceText = `🔍 价格查询结果 (${serverConfig.name})\n`
      priceText += `══════════════\n`
      priceText += `🔎 搜索关键词｜${queryContent}\n`
      priceText += `📊 匹配物品｜${results.length}个\n`
      priceText += `⏰ ${timeStr}\n\n`

      results.forEach((result, index) => {
        priceText += `${index + 1}. 【${result.id}】${result.name}\n`
        priceText += `   ⭐ ${result.quality} | 🎯 ${result.level} | 🔧 ${result.trait}\n`
        priceText += `   💰 最低价: ${result.lowPrice} | 平均价: ${result.avgPrice}\n`
        priceText += `   📊 数据条目: ${result.dataCount}条\n\n`
      })

      priceText += `💡 获取详细价格信息：\n#查询价格 [物品ID]\n例如：#查询价格 ${results[0].id}`

      return {
        type: 'text',
        content: priceText,
        cacheKey: cacheKey
      }

    } catch (error) {
      logger.error(`[TTC] 查询多个物品价格失败: ${error.message}`)
      return {
        type: 'text',
        content: `❌ 查询多个物品价格时发生错误\n\n${error.message}`,
        cacheKey: cacheKey
      }
    }
  }

  /** 重定向到查询物品功能 */
  async redirectToItemSearch(itemName) {
    try {
      logger.info(`[TTC] 重定向到查询物品功能: ${itemName}`)
      
      // 调用查询物品的核心搜索方法
      const searchResults = await this.searchItemInDatabase(itemName)
      
      if (searchResults && searchResults.length > 0) {
        // 构建查询物品的回复消息，前缀价格查询提示
        let replyMsg = `💡 若要查询物品价格，请从下列物品名或前面的ID中选择查询。\n\n搜索到包含'${itemName}'的物品：\n`
        
        // 按类型分组显示
        const groupedResults = {}
        searchResults.forEach(item => {
          if (!groupedResults[item.type]) {
            groupedResults[item.type] = []
          }
          groupedResults[item.type].push(item)
        })

        Object.keys(groupedResults).forEach(type => {
          replyMsg += `\n📦 ${type}：\n`
          groupedResults[type].forEach(item => {
            replyMsg += `【${item.id}】${item.name}`
            if (item.category && item.category !== '未知类型' && item.category !== 'TTC物品') {
              replyMsg += ` (${item.category})`
            }
            replyMsg += `\n`
          })
        })

        if (searchResults.length > 30) {
          replyMsg += `\n...(还有${searchResults.length - 30}个结果，请输入更精确的关键词)`
        }

        replyMsg += `\n\n📌 使用方法：\n💰 #查询价格 [完整物品名]\n💰 #查询价格 [物品ID]`

        return {
          type: 'text',
          content: replyMsg
        }
      } else {
        return {
          type: 'text',
          content: `❌ 未找到包含 "${itemName}" 的物品\n\n请使用 #查询物品 找到你需要查询的物品的完整名称。`
        }
      }
    } catch (error) {
      logger.error(`[TTC] 重定向到查询物品功能失败: ${error.message}`)
      return {
        type: 'text',
        content: `❌ 查询物品时发生错误\n\n请使用 #查询物品 找到你需要查询的物品的完整名称。`
      }
    }
  }

  /** 统一的时间戳转换方法 */
  formatTimestamp(timestamp, format = 'zh-CN') {
    if (!timestamp || timestamp === null || timestamp === undefined) {
      return '数据更新时间未知'
    }
    
    try {
      const date = new Date(timestamp * 1000)
      if (format === 'zh-CN') {
        return `${date.getFullYear()}年${(date.getMonth()+1).toString().padStart(2, '0')}月${date.getDate().toString().padStart(2, '0')}日${date.getHours().toString().padStart(2, '0')}时${date.getMinutes().toString().padStart(2, '0')}分${date.getSeconds().toString().padStart(2, '0')}秒`
      } else if (format === 'locale') {
        return date.toLocaleString('zh-CN')
      }
      return date.toISOString()
    } catch (error) {
      logger.error(`[TTC] 时间戳转换失败: ${error.message}`)
      return '数据更新时间格式异常'
    }
  }

  /** 根据价格推测物品品质 */
  getItemQuality(price) {
    if (price < 100) return "普通"
    if (price < 1000) return "优良"
    if (price < 10000) return "上乘"
    if (price < 100000) return "史诗"
    return "传说"
  }

  /** 根据TTC质量级别获取物品品质 */
  getItemQualityByLevel(qualityLevel) {
    const qualityMap = {
      "0": "普通",
      "1": "优良", 
      "2": "上乘",
      "3": "史诗",
      "4": "传说"
    }
    return qualityMap[qualityLevel] || this.getItemQuality(0)
  }

  /** 生成价格查询的HTML截图 */
  async generatePriceImage(itemId, itemName, processedData, timestamp, serverConfig) {
    try {
      // 准备HTML模板数据
      const htmlData = await this.prepareTTCData(itemId, itemName, processedData, timestamp, serverConfig)
      
      // 生成缓存的截图，直接返回图片
      const img = await this.cacheTTCImage(htmlData)
      
      return img
    } catch (error) {
      logger.error(`[TTC] 生成价格截图失败: ${error.message}`)
      // 降级到文本显示，抛出错误让调用方处理
      throw error
    }
  }

  /** 准备TTC HTML模板数据 */
  async prepareTTCData(itemId, itemName, processedData, timestamp, serverConfig) {
    // 格式化时间
    let timeStr = this.formatTimestamp(timestamp, 'zh-CN')

    // 处理价格数据，转换为HTML模板格式
    const maxDisplay = Math.min(30, processedData.length) // 最多显示30条
    const priceData = []
    
    for (let i = 0; i < maxDisplay; i++) {
      const data = processedData[i]
      const item = {
        itemName: itemName, // 添加物品名称
        quality: data.品质 || '未知',
        qualityClass: this.getQualityClass(data.品质),
        level: data.等级 || '未知',
        levelClass: (data.等级 === 'CP160') ? 'cp160' : 'level160',
        rowBackgroundClass: this.getLevelBackgroundClass(data.等级),
        trait: data.特质 || '未知',
        // 价格信息 (按用户要求的顺序：最低价 → 最高价 → 平均价 → 销售均价→建议价)
        lowPrice: data.最低价 ? `${data.最低价.toLocaleString()}金` : null,
        highPrice: data.最高价 ? `${data.最高价.toLocaleString()}金` : null,
        averagePrice: data.平均价 ? `${data.平均价.toLocaleString()}金` : null,
        salesAvgPrice: data.销售均价 ? `${data.销售均价.toLocaleString()}金` : null,
        suggestedPrice: data.建议价 ? `${data.建议价.toLocaleString()}金` : null,
        // 交易信息
        listingCount: data.列表数量 ? `${data.列表数量}个` : null,
        totalItems: data.总物品数 ? `${data.总物品数}个` : null,
        salesCount: data.销售记录数 ? `${data.销售记录数}笔` : null,
        salesTotal: data.销售总数 ? `${data.销售总数}笔` : null
      }
      priceData.push(item)
    }

    // 初始化TTC数据结构
    if (!this.ttcData || this.ttcData.init !== 'done') {
      this.ttcData = await TTC.get(this.e, 'ttc', 'ttc', 'ttcPrice')
      if (!this.ttcData) {
        throw new Error('TTC模板初始化失败')
      }
    }

    // 构建模板数据
    const templateData = {
      ...this.ttcData,
      ttcData: [
        {
          pic: 'cd1' // 背景图片
        },
        {
          itemName: itemName,
          itemId: itemId,
          serverName: serverConfig.name,
          dataCount: processedData.length,
          updateTime: timeStr,
          priceData: priceData,
          hasMore: processedData.length > maxDisplay,
          moreCount: processedData.length - maxDisplay
        }
      ]
    }

    return templateData
  }

  /** 获取品质对应的CSS类名 */
  getQualityClass(quality) {
    const qualityClassMap = {
      "普通": "normal",
      "优良": "fine", 
      "上乘": "superior",
      "史诗": "epic",
      "传说": "legendary"
    }
    return qualityClassMap[quality] || "normal"
  }

  /** 根据等级获取行背景CSS类名 */
  getLevelBackgroundClass(level) {
    // 如果等级为空、未知，则使用灰色背景
    if (!level || level === '未知') {
      return 'level-gray-bg'
    }
    // 如果等级为CP160，则使用CP160背景
    if (level === 'CP160') {
      return 'cp160-bg'
    }
    // 如果等级为0，则使用等级0背景
    if (level === '0') {
      return 'level0-bg'
    }
    // 其他等级使用灰色背景
    return 'level-gray-bg'
  }

  /** 缓存TTC截图 */
  async cacheTTCImage(data) {
    const tmp = md5(JSON.stringify(data))
    if (ttcImgCache.md5 === tmp) {
      return ttcImgCache.img
    }

    // 生成新的截图
    ttcImgCache.img = await puppeteer.screenshot('eso', data)
    ttcImgCache.md5 = tmp

    return ttcImgCache.img
  }

  /** 生成文本格式的价格信息（降级方案） */
  async generateTextPrice(itemId, itemName, processedData, timestamp, serverConfig) {
    // 格式化时间
    let timeStr = `数据更新时间：${this.formatTimestamp(timestamp, 'zh-CN')}`
    
    let priceText = `🏷️ 物品价格信息 (${serverConfig.name})\n`
    priceText += `══════════════\n`
    priceText += `📦 物品名称｜${itemName}\n`
    priceText += `🔢 物品ID  ｜${itemId}\n`
    priceText += `📊 数据条目｜${processedData.length}条\n`
    priceText += `⏰ ${timeStr}\n\n`
    
    // 显示前几条价格数据
    const maxDisplay = Math.min(8, processedData.length)
    for (let i = 0; i < maxDisplay; i++) {
      const data = processedData[i]
      priceText += `📈 价格数据 ${i + 1}:\n`
      priceText += `⭐ 品质：${data.品质 || '未知'}\n`
      priceText += `🎯 等级：${data.等级 || '未知'}\n`
      priceText += `🔧 特质：${data.特质 || '未知'}\n`
      
      // 价格信息 (按用户要求的顺序：最低价 → 最高价 → 平均价 → 销售均价→建议价)
      if (data.最低价) priceText += `📉 最低价：${data.最低价.toLocaleString()}金\n`
      if (data.最高价) priceText += `📈 最高价：${data.最高价.toLocaleString()}金\n`
      if (data.平均价) priceText += `💰 平均价：${data.平均价.toLocaleString()}金\n`
      if (data.销售均价) priceText += `💵 销售均价：${data.销售均价.toLocaleString()}金\n`
      if (data.建议价) priceText += `💡 建议价：${data.建议价.toLocaleString()}金\n`
      
      // 交易统计信息
      if (data.列表数量) priceText += `📋 在售：${data.列表数量}个\n`
      if (data.总物品数) priceText += `📦 总物品数：${data.总物品数}个\n`
      if (data.销售记录数) priceText += `📊 销售记录：${data.销售记录数}笔\n`
      if (data.销售总数) priceText += `📈 销售总数：${data.销售总数}笔\n`
      
      priceText += `\n`
    }
    
    if (processedData.length > maxDisplay) {
      priceText += `... 还有 ${processedData.length - maxDisplay} 条数据\n`
    }

    return priceText
  }

  /** 加载验证码配置 */
  loadCaptchaConfig() {
    // 检查是否已经加载过，避免重复加载
    if (this.captchaConfigLoaded) {
      return
    }
    
    try {
      if (fs.existsSync(TTC_CAPTCHA_CONFIG_PATH)) {
        const configData = fs.readFileSync(TTC_CAPTCHA_CONFIG_PATH, 'utf8')
        this.captchaConfig = JSON.parse(configData)
        
        // 确保配置包含所有必要字段，默认关闭自动破解
        if (!this.captchaConfig.autoSolve) {
          this.captchaConfig.autoSolve = false
        }
        if (!this.captchaConfig.thirdPartyService) {
          this.captchaConfig.thirdPartyService = 'MANUAL'
        }
        if (this.captchaConfig.dailyUsage === undefined) {
          this.captchaConfig.dailyUsage = 0
        }
        if (!this.captchaConfig.lastResetDate) {
          this.captchaConfig.lastResetDate = new Date().toISOString().split('T')[0]
        }
        
        //logger.info(`[TTC] 验证码配置加载成功: 自动解决=${this.captchaConfig.autoSolve}`)
      } else {
        // 默认配置 - 关闭自动破解
        this.captchaConfig = {
          autoSolve: false,
          useThirdParty: false,
          thirdPartyService: 'MANUAL',
          apiKey: '',
          dailyUsage: 0,
          lastResetDate: new Date().toISOString().split('T')[0]
        }
        this.saveCaptchaConfig()
        logger.info(`[TTC] 验证码配置文件不存在，使用默认配置: 自动解决=false，已移除第三方服务`)
      }
      
      this.captchaConfigLoaded = true
    } catch (error) {
      logger.error(`[TTC] 加载验证码配置失败: ${error.message}`)
      this.captchaConfig = { autoSolve: false }
      this.captchaConfigLoaded = true // 即使失败也标记为已加载，避免重复尝试
    }
  }

  /** 保存验证码配置 */
  saveCaptchaConfig() {
    try {
      const configDir = path.dirname(TTC_CAPTCHA_CONFIG_PATH)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }
      
      fs.writeFileSync(TTC_CAPTCHA_CONFIG_PATH, JSON.stringify(this.captchaConfig, null, 2), 'utf8')
      logger.info(`[TTC] 验证码配置保存成功`)
    } catch (error) {
      logger.error(`[TTC] 保存验证码配置失败: ${error.message}`)
    }
  }

  /** 设置验证码自动解决 */
  async setCaptchaAutoSolve(e) {
    const content = e.msg.replace(/^#*ttc验证码\s*/, '').trim()
    
    if (content === '开启') {
      this.captchaConfig.autoSolve = true
      this.saveCaptchaConfig()
      await this.reply('✅ TTC验证码自动解决已开启\n\n💡 注意：已移除所有第三方验证码破解服务，遇到验证码时将提示用户手动处理')
      logger.info(`[TTC] 用户 ${e.user_id} 开启验证码自动解决`)
    } else if (content === '关闭') {
      this.captchaConfig.autoSolve = false
      this.saveCaptchaConfig()
      await this.reply('❌ TTC验证码自动解决已关闭')
      logger.info(`[TTC] 用户 ${e.user_id} 关闭验证码自动解决`)
    } else if (content.startsWith('设置api')) {
      // 已移除第三方验证码服务
      await this.reply(`❌ 已移除所有第三方验证码破解服务\n\n💡 当前状态:\n• 遇到验证码时将提示用户手动处理\n• 无需设置API密钥`)
    } else if (content === '状态') {
      const autoStatus = this.captchaConfig.autoSolve ? '开启' : '关闭'
      
      const statusMsg = `📋 TTC验证码配置状态:\n\n` +
        `🔧 自动解决: ${autoStatus}\n` +
        `🌐 第三方服务: 已移除所有第三方验证码破解服务\n` +
        `📊 今日使用: 0/0\n` +
        `🔑 API密钥: 无需设置\n\n` +
        `💡 当前状态:\n` +
        `• 已移除所有第三方验证码破解服务\n` +
        `• 遇到验证码时将提示用户手动处理`
      
      await this.reply(statusMsg)
    } else if (content === '测试api') {
      // 已移除第三方验证码服务
      await this.reply(`❌ 已移除所有第三方验证码破解服务\n\n💡 当前状态:\n• 遇到验证码时将提示用户手动处理\n• 无需测试API密钥`)
    } else if (content.startsWith('切换服务')) {
      // 已移除第三方验证码服务
      await this.reply(`❌ 已移除所有第三方验证码破解服务\n\n💡 当前状态:\n• 遇到验证码时将提示用户手动处理\n• 无需切换服务`)
    } else if (content === '删除api') {
      // 已移除第三方验证码服务
      await this.reply(`❌ 已移除所有第三方验证码破解服务\n\n💡 当前状态:\n• 遇到验证码时将提示用户手动处理\n• 无需删除API密钥`)
    } else if (content === '服务列表') {
      // 已移除第三方验证码服务
      await this.reply(`❌ 已移除所有第三方验证码破解服务\n\n💡 当前状态:\n• 遇到验证码时将提示用户手动处理\n• 无需查看服务列表`)
    } else {
      const status = this.captchaConfig.autoSolve ? '开启' : '关闭'
      await this.reply(`📋 TTC验证码自动解决当前状态: ${status}\n\n使用方法:\n` +
        `#ttc验证码 开启 - 开启自动解决\n` +
        `#ttc验证码 关闭 - 关闭自动解决\n` +
        `#ttc验证码 状态 - 查看详细状态\n\n` +
        `💡 当前状态:\n` +
        `• 已移除所有第三方验证码破解服务\n` +
        `• 遇到验证码时将提示用户手动处理\n\n` +
        `⚠️  注意: 验证码需要手动解决`)
    }
  }

  /** 获取最新的debug截图 */
  async getLatestDebugScreenshot() {
    try {
      const screenshotDir = path.join(TTC_CACHE_PATH, 'screenshots')
      if (!fs.existsSync(screenshotDir)) {
        return null
      }
      
      const files = fs.readdirSync(screenshotDir)
      const screenshotFiles = files.filter(file => file.startsWith('screenshot_') && file.endsWith('.png'))
      
      if (screenshotFiles.length === 0) {
        return null
      }
      
      // 按文件名排序，获取最新的截图
      screenshotFiles.sort((a, b) => {
        // 从文件名中提取时间戳进行比较
        const timeA = a.match(/screenshot_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/)?.[1] || ''
        const timeB = b.match(/screenshot_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/)?.[1] || ''
        return timeB.localeCompare(timeA) // 降序排列，最新的在前
      })
      
      const latestFile = screenshotFiles[0]
      const screenshotPath = path.join(screenshotDir, latestFile)
      
      // 检查文件是否存在且可读
      if (fs.existsSync(screenshotPath)) {
        return screenshotPath
      }
      
      return null
    } catch (error) {
      logger.error(`[TTC] 获取最新debug截图失败: ${error.message}`)
      return null
    }
  }

  /** 尝试自动解决验证码 */
  async trySolveCaptcha(browserPage) {
    // 已移除第三方验证码破解服务，现在只支持手动处理
    //logger.info(`[TTC] 检测到验证码，已移除第三方破解服务，需要手动处理`)
    
    // 检测到验证码时截图
    await takeDebugScreenshot(browserPage, {
      line: 3945,
      description: '检测到验证码，需要手动处理'
    })
    
    return false
  }

  /** 处理复选框阶段 - 已移除，由2captcha自动处理 */
  async handleCheckboxStage(browserPage) {
    // 此方法已不再使用，复选框由2captcha服务自动处理
    logger.info(`[TTC] 复选框处理已委托给2captcha服务`)
    return true
  }

  /** 处理图片验证阶段 - 已移除，由2captcha自动处理 */
  async handleImageStage(browserPage) {
    // 此方法已不再使用，图片验证由2captcha服务自动处理
    logger.info(`[TTC] 图片验证处理已委托给2captcha服务`)
    return true
  }

  /** 解决图片验证挑战 - 改进处理逻辑 */
  async solveImageChallenge(browserPage) {
    try {
      // 获取验证码的详细信息 - 改进获取逻辑
      const captchaInfo = await browserPage.evaluate(() => {
        // 获取验证码的sitekey
        const sitekey = document.querySelector('.g-recaptcha')?.getAttribute('data-sitekey') ||
                       document.querySelector('div[data-sitekey]')?.getAttribute('data-sitekey')
        
        // 获取当前页面URL
        const pageUrl = window.location.href
        
        // 获取验证码类型 - 改进检测逻辑
        let challengeType = ''
        
        // 方法1：从主页面获取指令
        const instructionEl = document.querySelector('.rc-imageselect-instructions')
        if (instructionEl) {
          challengeType = instructionEl.textContent.trim()
        }
        
        // 方法2：从其他元素获取指令
        if (!challengeType) {
          const altInstructionEl = document.querySelector('[data-instructions], .rc-imageselect-instructions')
          if (altInstructionEl) {
            challengeType = altInstructionEl.textContent.trim() || altInstructionEl.getAttribute('data-instructions') || ''
          }
        }
        
        // 方法3：从iframe中获取指令
        if (!challengeType) {
          const iframe = document.querySelector('iframe[src*="recaptcha/api2/bframe"]')
          if (iframe) {
            try {
              const iframeDoc = iframe.contentDocument || iframe.contentWindow.document
              const iframeInstruction = iframeDoc.querySelector('.rc-imageselect-instructions')
              if (iframeInstruction) {
                challengeType = iframeInstruction.textContent.trim()
              }
            } catch (e) {
              // 跨域限制，无法访问iframe内容
            }
          }
        }
        
        // 方法4：从描述元素获取
        if (!challengeType) {
          const descEl = document.querySelector('.rc-imageselect-desc-no-canonical')
          if (descEl) {
            challengeType = descEl.textContent.trim()
          }
        }
        
        console.log('验证码信息:', { sitekey, pageUrl, challengeType })
        
        return {
          sitekey,
          pageUrl,
          challengeType
        }
      })
      
      logger.info(`[TTC] 验证码指令: ${captchaInfo.challengeType}`)
      
      // 如果验证码指令为空，尝试通用处理方法
      if (!captchaInfo.challengeType) {
        logger.info(`[TTC] 验证码指令为空，尝试通用处理方法...`)
        return await this.handleGenericImageChallenge(browserPage)
      }
      
      // 检查是否有"确定"按钮
      const hasConfirmButton = await browserPage.evaluate(() => {
        const confirmBtn = document.querySelector('.rc-button-default, button[aria-label*="确定"], button[aria-label*="Verify"]')
        return !!confirmBtn
      })
      
      if (hasConfirmButton) {
        // 点击确定按钮
        await browserPage.evaluate(() => {
          const confirmBtn = document.querySelector('.rc-button-default, button[aria-label*="确定"], button[aria-label*="Verify"]')
          if (confirmBtn) {
            confirmBtn.click()
          }
        })
        
        // 等待处理
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        // 检查是否还有图片验证
        const stillHasImageChallenge = await browserPage.evaluate(() => {
          const imageChallenge = document.querySelector('.rc-imageselect, .rc-imageselect-target')
          return !!imageChallenge
        })
        
        if (!stillHasImageChallenge) {
          return true
        }
      }
      
      // 尝试处理iframe中的验证码
      const iframeResult = await this.handleIframeCaptcha(browserPage)
      if (iframeResult) {
        return true
      }
      
      // 尝试基础图片识别（基于常见模式）
      const basicResult = await this.basicImageRecognition(browserPage)
      if (basicResult) {
        return true
      }
      
      // 已移除第三方验证码破解服务
      logger.info(`[TTC] 已移除所有第三方验证码破解服务，无法自动解决验证码`)
      
      // 如果所有方法都失败，记录详细信息供后续改进
      logger.warn(`[TTC] 需要高级图片识别，当前版本支持有限`)
      logger.info(`[TTC] 验证码详情: ${JSON.stringify(captchaInfo)}`)
      
      return false
      
    } catch (error) {
      logger.error(`[TTC] 图片验证解决出错: ${error.message}`)
      return false
    }
  }

  /** 处理通用图片验证挑战 */
  async handleGenericImageChallenge(browserPage) {
    try {
      logger.info(`[TTC] 尝试通用图片验证处理方法...`)
      
      // 尝试处理iframe中的验证码
      const iframeResult = await this.handleIframeCaptcha(browserPage)
      if (iframeResult) {
        return true
      }
      
      // 尝试基础图片识别
      const basicResult = await this.basicImageRecognition(browserPage)
      if (basicResult) {
        return true
      }
      
      // 已移除第三方验证码破解服务
      logger.info(`[TTC] 已移除所有第三方验证码破解服务，无法自动解决验证码`)
      
      return false
    } catch (error) {
      logger.error(`[TTC] 通用图片验证处理出错: ${error.message}`)
      return false
    }
  }

  /** 基础图片识别（基于常见模式） */
  async basicImageRecognition(browserPage) {
    try {
      // 获取验证码指令 - 改进检测逻辑
      const instruction = await browserPage.evaluate(() => {
        let instructionText = ''
        
        // 尝试多种方式获取指令
        const instructionEl = document.querySelector('.rc-imageselect-instructions')
        if (instructionEl) {
          instructionText = instructionEl.textContent.trim()
        }
        
        // 如果还是空，尝试其他选择器
        if (!instructionText) {
          const altInstructionEl = document.querySelector('[data-instructions], .rc-imageselect-instructions')
          if (altInstructionEl) {
            instructionText = altInstructionEl.textContent.trim() || altInstructionEl.getAttribute('data-instructions') || ''
          }
        }
        
        // 尝试获取更详细的指令内容
        if (!instructionText) {
          const descEl = document.querySelector('.rc-imageselect-desc-no-canonical')
          if (descEl) {
            instructionText = descEl.textContent.trim()
          }
        }
        
        // 尝试从iframe中获取 - 改进iframe处理
        if (!instructionText) {
          const iframes = document.querySelectorAll('iframe')
          for (const iframe of iframes) {
            try {
              if (iframe.src && iframe.src.includes('recaptcha')) {
                // 等待iframe加载完成
                if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                  const iframeInstruction = iframe.contentDocument.querySelector('.rc-imageselect-instructions')
                  if (iframeInstruction) {
                    instructionText = iframeInstruction.textContent.trim()
                    break
                  }
                  
                  const iframeDesc = iframe.contentDocument.querySelector('.rc-imageselect-desc-no-canonical')
                  if (iframeDesc) {
                    instructionText = iframeDesc.textContent.trim()
                    break
                  }
                }
              }
            } catch (e) {
              // 跨域限制，无法访问iframe内容
              console.log('无法访问iframe内容:', e.message)
            }
          }
        }
        
        // 如果还是空，尝试等待并重新检测
        if (!instructionText) {
          // 等待一段时间让内容加载
          return new Promise((resolve) => {
            setTimeout(() => {
              const finalInstruction = document.querySelector('.rc-imageselect-instructions')?.textContent.trim() ||
                                      document.querySelector('.rc-imageselect-desc-no-canonical')?.textContent.trim() ||
                                      ''
              resolve(finalInstruction)
            }, 2000)
          })
        }
        
        return instructionText
      })
      
      logger.info(`[TTC] 验证码指令: ${instruction}`)
      
      // 如果指令为空，尝试通用处理方法
      if (!instruction || instruction.trim() === '') {
        logger.info(`[TTC] 验证码指令为空，尝试通用处理方法...`)
        return await this.solveGenericImageChallenge(browserPage)
      }
      
      // 基于指令进行基础识别
      if (instruction.includes('交通') || instruction.includes('traffic')) {
        return await this.solveTrafficSigns(browserPage)
      } else if (instruction.includes('商店') || instruction.includes('store')) {
        return await this.solveStoreFronts(browserPage)
      } else if (instruction.includes('汽车') || instruction.includes('car')) {
        return await this.solveCars(browserPage)
      } else if (instruction.includes('自行车') || instruction.includes('bicycle')) {
        return await this.solveBicycles(browserPage)
      } else if (instruction.includes('人行横道') || instruction.includes('crosswalk')) {
        return await this.solveCrosswalks(browserPage)
      } else if (instruction.includes('楼梯') || instruction.includes('stair')) {
        return await this.solveStairs(browserPage)
      } else {
        logger.info(`[TTC] 未知验证码类型: ${instruction}`)
        // 对于未知类型，也尝试通用处理方法
        return await this.solveGenericImageChallenge(browserPage)
      }
      
    } catch (error) {
      logger.error(`[TTC] 基础图片识别出错: ${error.message}`)
      return false
    }
  }

  /** 解决交通标志验证码 */
  async solveTrafficSigns(browserPage) {
    try {
      logger.info(`[TTC] 尝试解决交通标志验证码...`)
      
      // 这里可以实现交通标志识别逻辑
      // 由于需要AI模型，这里提供一个框架
      
      // 获取所有图片元素
      const images = await browserPage.evaluate(() => {
        const imgElements = document.querySelectorAll('.rc-imageselect-target img')
        return Array.from(imgElements).map((img, index) => ({
          index,
          src: img.src,
          alt: img.alt,
          className: img.className
        }))
      })
      
      logger.info(`[TTC] 找到 ${images.length} 张图片`)
      
      // 这里应该调用AI模型进行识别
      // 暂时返回false，表示需要手动处理
      return false
      
    } catch (error) {
      logger.error(`[TTC] 交通标志识别出错: ${error.message}`)
      return false
    }
  }

  /** 解决商店门面验证码 */
  async solveStoreFronts(browserPage) {
    try {
      logger.info(`[TTC] 尝试解决商店门面验证码...`)
      // 类似交通标志的处理逻辑
      return false
    } catch (error) {
      logger.error(`[TTC] 商店门面识别出错: ${error.message}`)
      return false
    }
  }

  /** 解决汽车验证码 */
  async solveCars(browserPage) {
    try {
      logger.info(`[TTC] 尝试解决汽车验证码...`)
      // 类似交通标志的处理逻辑
      return false
    } catch (error) {
      logger.error(`[TTC] 汽车识别出错: ${error.message}`)
      return false
    }
  }

  /** 解决自行车验证码 */
  async solveBicycles(browserPage) {
    try {
      logger.info(`[TTC] 尝试解决自行车验证码...`)
      // 类似交通标志的处理逻辑
      return false
    } catch (error) {
      logger.error(`[TTC] 自行车识别出错: ${error.message}`)
      return false
    }
  }

  /** 解决人行横道验证码 */
  async solveCrosswalks(browserPage) {
    try {
      logger.info(`[TTC] 尝试解决人行横道验证码...`)
      // 类似交通标志的处理逻辑
      return false
    } catch (error) {
      logger.error(`[TTC] 人行横道识别出错: ${error.message}`)
      return false
    }
  }

  /** 解决楼梯验证码 */
  async solveStairs(browserPage) {
    try {
      logger.info(`[TTC] 尝试解决楼梯验证码...`)
      
      // 获取所有图片元素
      const images = await browserPage.evaluate(() => {
        const imgElements = document.querySelectorAll('.rc-imageselect-tile')
        return Array.from(imgElements).map((img, index) => ({
          index,
          src: img.src || img.querySelector('img')?.src,
          alt: img.alt || img.querySelector('img')?.alt,
          className: img.className,
          isSelected: img.classList.contains('rc-imageselect-tileselected')
        }))
      })
      
      logger.info(`[TTC] 找到 ${images.length} 张图片，尝试识别楼梯...`)
      
      // 由于需要AI模型进行图像识别，这里使用通用处理方法
      // 楼梯验证码通常需要选择包含楼梯的图片
      return await this.processImageSelection(browserPage, images)
      
    } catch (error) {
      logger.error(`[TTC] 楼梯识别出错: ${error.message}`)
      return false
    }
  }

  /** 通用图片验证处理方法 */
  async solveGenericImageChallenge(browserPage) {
    try {
      logger.info(`[TTC] 尝试通用图片验证处理方法...`)
      
      // 首先尝试直接处理iframe中的验证码
      const iframeResult = await this.handleIframeCaptcha(browserPage)
      if (iframeResult) {
        return true
      }
      
      // 如果iframe处理失败，尝试主页面处理
      const images = await this.getImageElements(browserPage)
      
      logger.info(`[TTC] 找到 ${images.length} 张图片`)
      
      if (images.length === 0) {
        logger.warn(`[TTC] 未找到图片元素，尝试备用选择器...`)
        
        // 备用方案：直接选择所有可点击的图片元素
        const backupImages = await browserPage.evaluate(() => {
          const allElements = document.querySelectorAll('.rc-imageselect-target *')
          const clickableElements = []
          
          for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i]
            if (el.tagName === 'TD' && el.getAttribute('role') === 'button') {
              clickableElements.push({
                index: clickableElements.length,
                src: '',
                alt: '',
                className: el.className,
                isSelected: el.classList.contains('rc-imageselect-tileselected'),
                tagName: 'td'
              })
            }
          }
          
          return clickableElements
        })
        
        if (backupImages.length > 0) {
          logger.info(`[TTC] 备用选择器找到 ${backupImages.length} 个可点击元素`)
          return await this.processImageSelection(browserPage, backupImages)
        }
        
        return false
      }
      
      // 处理图片选择
      return await this.processImageSelection(browserPage, images)
    } catch (error) {
      logger.error(`[TTC] 通用图片验证处理出错: ${error.message}`)
      return false
    }
  }

  /** 确定选择策略 */
  async determineSelectionStrategy(browserPage) {
    try {
      const strategy = await browserPage.evaluate(() => {
        // 检查是否有特定的提示或模式
        const instruction = document.querySelector('.rc-imageselect-instructions')?.textContent || ''
        const imageCount = document.querySelectorAll('.rc-imageselect-target img, .rc-imageselect-target .rc-imageselect-tile').length
        
        // 基于图片数量和指令推测策略
        if (imageCount <= 9) {
          return 'select_all' // 选择所有图片
        } else if (instruction.includes('所有') || instruction.includes('all')) {
          return 'select_all'
        } else if (instruction.includes('包含') || instruction.includes('contain') || instruction.includes('特殊')) {
          return 'select_common' // 选择常见物品
        } else {
          return 'select_random' // 随机选择
        }
      })
      
      return strategy
    } catch (error) {
      logger.error(`[TTC] 确定选择策略出错: ${error.message}`)
      return 'select_random'
    }
  }

  /** 根据策略选择图片 */
  async selectImagesByStrategy(browserPage, images, strategy) {
    try {
      switch (strategy) {
        case 'select_all':
          // 选择所有图片
          return images.map((_, index) => index)
          
        case 'select_common':
          // 选择常见物品（前3张）
          return images.slice(0, Math.min(3, images.length)).map((_, index) => index)
          
        case 'select_random':
        default:
          // 随机选择2-4张图片
          const count = Math.min(Math.floor(Math.random() * 3) + 2, images.length)
          const indices = []
          for (let i = 0; i < count; i++) {
            indices.push(i)
          }
          return indices
      }
    } catch (error) {
      logger.error(`[TTC] 选择图片策略出错: ${error.message}`)
      return [0, 1, 2] // 默认选择前3张
    }
  }

  /** 处理图片选择 */
  async processImageSelection(browserPage, images) {
    try {
      // 尝试智能选择策略
      const selectionStrategy = await this.determineSelectionStrategy(browserPage)
      logger.info(`[TTC] 使用选择策略: ${selectionStrategy}`)
      
      // 根据策略选择图片
      const selectedIndices = await this.selectImagesByStrategy(browserPage, images, selectionStrategy)
      
      if (selectedIndices.length > 0) {
        logger.info(`[TTC] 选择了 ${selectedIndices.length} 张图片: ${selectedIndices.join(', ')}`)
        
        // 点击选中的图片 - 修复选择器
        await browserPage.evaluate((indices) => {
          // 尝试多种选择器来点击图片
          let elements = document.querySelectorAll('.rc-imageselect-tile')
          
          if (elements.length === 0) {
            elements = document.querySelectorAll('.rc-imageselect-target td[role="button"]')
          }
          
          if (elements.length === 0) {
            elements = document.querySelectorAll('.rc-imageselect-target img')
          }
          
          indices.forEach(index => {
            if (elements[index]) {
              elements[index].click()
            }
          })
        }, selectedIndices)
        
        // 等待选择完成
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // 点击验证按钮
        await browserPage.evaluate(() => {
          const verifyBtn = document.querySelector('.rc-button-default, button[aria-label*="确定"], button[aria-label*="Verify"]')
          if (verifyBtn) {
            verifyBtn.click()
          }
        })
        
        // 等待验证结果
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        // 检查是否验证成功
        const isVerified = await this.checkCaptchaSolved(browserPage)
        if (isVerified) {
          logger.info(`[TTC] 通用图片验证处理成功`)
          return true
        } else {
          logger.warn(`[TTC] 通用图片验证处理失败，可能需要重试`)
          return false
        }
      }
      
      return false
    } catch (error) {
      logger.error(`[TTC] 图片选择处理出错: ${error.message}`)
      return false
    }
  }

  /** 处理iframe中的验证码 */
  async handleIframeCaptcha(browserPage) {
    try {
      logger.info(`[TTC] 尝试处理iframe中的验证码...`)
      
      // iframe验证码处理前截图
      await takeDebugScreenshot(browserPage, {
        line: 4485,
        description: 'iframe验证码处理前'
      })
      
      // 查找reCAPTCHA iframe
      const iframes = await browserPage.$$('iframe[src*="recaptcha"]')
      
      if (iframes.length === 0) {
        logger.info(`[TTC] 未找到reCAPTCHA iframe`)
        
        // 未找到iframe时截图
        await takeDebugScreenshot(browserPage, {
          line: 4495,
          description: '未找到reCAPTCHA_iframe'
        })
        return false
      }
      
      // 获取第一个reCAPTCHA iframe
      const recaptchaFrame = iframes[0]
      
      // 切换到iframe上下文
      const frame = await recaptchaFrame.contentFrame()
      if (!frame) {
        logger.warn(`[TTC] 无法访问iframe内容`)
        
        // 无法访问iframe时截图
        await takeDebugScreenshot(browserPage, {
          line: 4505,
          description: '无法访问iframe内容'
        })
        return false
      }
      
      // 等待iframe内容加载 - 增加等待时间
      try {
        await frame.waitForSelector('.rc-imageselect-instructions', { timeout: 10000 })
      } catch (error) {
        // 尝试等待其他可能的选择器
        try {
          await frame.waitForSelector('.rc-imageselect-desc-no-canonical', { timeout: 5000 })
        } catch (error2) {
          // 静默处理超时
        }
      }
      
      // 等待一段时间让内容完全加载
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // iframe内容加载后截图
      await takeDebugScreenshot(browserPage, {
        line: 4520,
        description: 'iframe内容加载后'
      })
      
      // 获取验证码指令 - 改进检测逻辑
      const instruction = await frame.evaluate(() => {
        let instructionText = ''
        
        // 尝试多种方式获取指令
        const instructionEl = document.querySelector('.rc-imageselect-instructions')
        if (instructionEl) {
          instructionText = instructionEl.textContent.trim()
        }
        
        // 如果还是空，尝试其他选择器
        if (!instructionText) {
          const descEl = document.querySelector('.rc-imageselect-desc-no-canonical')
          if (descEl) {
            instructionText = descEl.textContent.trim()
          }
        }
        
        // 尝试获取所有文本内容
        if (!instructionText) {
          const allText = document.body.textContent || document.body.innerText || ''
          const lines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0)
          for (const line of lines) {
            if (line.includes('选择') || line.includes('包含') || line.includes('所有')) {
              instructionText = line
              break
            }
          }
        }
        
        return instructionText
      })
      
      // 获取图片元素 - 使用更可靠的检测方法
      const images = await frame.evaluate(() => {
        // 尝试多种选择器来找到图片元素
        const selectors = [
          '.rc-imageselect-tile',
          'td[role="button"]',
          '.rc-imageselect-target td',
          'table td[tabindex]',
          '.rc-imageselect-tile img',
          'td img'
        ]
        
        let imgElements = []
        for (const selector of selectors) {
          imgElements = document.querySelectorAll(selector)
          if (imgElements.length > 0) {
            console.log(`找到图片元素，使用选择器: ${selector}, 数量: ${imgElements.length}`)
            break
          }
        }
        
        // 如果还是没找到，尝试查找所有可点击的元素
        if (imgElements.length === 0) {
          const allTds = document.querySelectorAll('td')
          imgElements = Array.from(allTds).filter(td => {
            return td.hasAttribute('tabindex') || 
                   td.hasAttribute('role') || 
                   td.onclick || 
                   td.style.cursor === 'pointer'
          })
          console.log(`通过可点击性找到元素: ${imgElements.length}`)
        }
        
        return Array.from(imgElements).map((img, index) => ({
          index,
          className: img.className,
          isSelected: img.classList.contains('rc-imageselect-tileselected'),
          tagName: img.tagName.toLowerCase(),
          role: img.getAttribute('role') || '',
          tabindex: img.getAttribute('tabindex') || '',
          hasClick: !!img.onclick,
          cursor: img.style.cursor || ''
        }))
      })
      
      if (images.length === 0) {
        // 未找到图片时截图
        await takeDebugScreenshot(browserPage, {
          line: 4560,
          description: 'iframe中未找到图片'
        })
        return false
      }
      
      // 找到图片后截图
      await takeDebugScreenshot(browserPage, {
        line: 4565,
        description: `iframe中找到${images.length}张图片`
      })
      
      // 根据指令选择策略
      let selectedIndices = []
      if (instruction.includes('所有') || instruction.includes('all')) {
        selectedIndices = images.map((_, index) => index)
      } else if (instruction.includes('包含') || instruction.includes('contain')) {
        selectedIndices = images.slice(0, Math.min(3, images.length)).map((_, index) => index)
      } else {
        // 默认选择前3张
        selectedIndices = images.slice(0, Math.min(3, images.length)).map((_, index) => index)
      }
      
      // 在iframe中点击图片 - 使用更可靠的点击方法
      for (const index of selectedIndices) {
        try {
          const img = images[index]
          console.log(`尝试点击图片 ${index}:`, img)
          
          // 尝试多种点击方式
          let clicked = false
          
          // 方式1: 使用tabindex
          if (img.tabindex && !clicked) {
            try {
              await frame.click(`td[tabindex="${img.tabindex}"]`)
              clicked = true
              console.log(`通过tabindex点击成功: ${img.tabindex}`)
            } catch (error) {
              console.log(`tabindex点击失败: ${error.message}`)
            }
          }
          
          // 方式2: 使用role
          if (img.role && !clicked) {
            try {
              await frame.click(`td[role="${img.role}"]`)
              clicked = true
              console.log(`通过role点击成功: ${img.role}`)
            } catch (error) {
              console.log(`role点击失败: ${error.message}`)
            }
          }
          
          // 方式3: 使用索引
          if (!clicked) {
            try {
              await frame.click(`td:nth-child(${index + 1})`)
              clicked = true
              console.log(`通过索引点击成功: ${index + 1}`)
            } catch (error) {
              console.log(`索引点击失败: ${error.message}`)
            }
          }
          
          // 方式4: 使用JavaScript点击
          if (!clicked) {
            try {
              await frame.evaluate((index) => {
                const elements = document.querySelectorAll('td')
                if (elements[index]) {
                  elements[index].click()
                }
              }, index)
              clicked = true
              console.log(`通过JavaScript点击成功: ${index}`)
            } catch (error) {
              console.log(`JavaScript点击失败: ${error.message}`)
            }
          }
          
          if (clicked) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        } catch (error) {
          console.log(`点击图片 ${index} 失败: ${error.message}`)
        }
      }
      
      // 等待选择完成
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // 点击验证按钮 - 改进点击逻辑
      try {
        await frame.click('.rc-button-default')
      } catch (error) {
        // 尝试其他可能的验证按钮
        try {
          await frame.click('button[aria-label*="确定"]')
        } catch (error2) {
          // 静默处理点击失败
        }
      }
      
      // 等待验证结果
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // 检查是否验证成功
      const isVerified = await this.checkCaptchaSolved(browserPage)
      if (isVerified) {
        // 验证成功时截图
        await takeDebugScreenshot(browserPage, {
          line: 4600,
          description: 'iframe验证码验证成功'
        })
        return true
      } else {
        // 验证失败时截图
        await takeDebugScreenshot(browserPage, {
          line: 4605,
          description: 'iframe验证码验证失败'
        })
        // 如果失败，尝试重新选择图片
        return await this.retryIframeCaptcha(browserPage, frame, images, instruction)
      }
      
    } catch (error) {
      logger.error(`[TTC] iframe验证码处理出错: ${error.message}`)
      
      // 处理出错时截图
      await takeDebugScreenshot(browserPage, {
        line: 4615,
        description: 'iframe验证码处理出错'
      })
      return false
    }
  }

  /** 重试iframe验证码处理 */
  async retryIframeCaptcha(browserPage, frame, images, instruction) {
    try {
      // 重试前截图
      await takeDebugScreenshot(browserPage, {
        line: 4620,
        description: 'iframe验证码重试前'
      })
      
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // 尝试不同的选择策略
      let selectedIndices = []
      
      if (instruction.includes('所有') || instruction.includes('all')) {
        // 如果指令是选择所有，尝试选择一半
        selectedIndices = images.slice(0, Math.ceil(images.length / 2)).map((_, index) => index)
      } else if (instruction.includes('包含') || instruction.includes('contain')) {
        // 如果指令是选择包含，尝试选择更多
        selectedIndices = images.slice(0, Math.min(6, images.length)).map((_, index) => index)
      } else {
        // 默认选择所有图片
        selectedIndices = images.map((_, index) => index)
      }
      
      // 重新点击图片
      for (const index of selectedIndices) {
        try {
          const img = images[index]
          if (img.role === 'button') {
            await frame.click(`td[role="button"][tabindex="${img.tabindex}"]`)
          } else {
            await frame.click(`.rc-imageselect-tile:nth-child(${index + 1})`)
          }
          await new Promise(resolve => setTimeout(resolve, 200))
        } catch (error) {
          // 静默处理点击失败
        }
      }
      
      // 等待选择完成
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // 点击验证按钮
      try {
        await frame.click('.rc-button-default')
      } catch (error) {
        await frame.click('button[aria-label*="确定"]')
      }
      
      // 等待验证结果
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // 检查是否验证成功
      const isVerified = await this.checkCaptchaSolved(frame)
      
      if (isVerified) {
        // 重试成功时截图
        await takeDebugScreenshot(browserPage, {
          line: 4670,
          description: 'iframe验证码重试成功'
        })
      } else {
        // 重试失败时截图
        await takeDebugScreenshot(browserPage, {
          line: 4675,
          description: 'iframe验证码重试失败'
        })
      }
      
      return isVerified
      
    } catch (error) {
      logger.error(`[TTC] iframe验证码重试出错: ${error.message}`)
      
      // 重试出错时截图
      await takeDebugScreenshot(browserPage, {
        line: 4685,
        description: 'iframe验证码重试出错'
      })
      return false
    }
  }

  /** 获取图片元素 */
  async getImageElements(browserPage) {
    return await browserPage.evaluate(() => {
      // 尝试多种选择器来获取图片元素 - 改进检测逻辑
      const selectors = [
        '.rc-imageselect-tile',
        '.rc-imageselect-target td[role="button"]',
        '.rc-imageselect-target img',
        '.rc-imageselect-target .rc-imageselect-tile-background',
        '.rc-imageselect-target .rc-imageselect-tile-overlay',
        '.rc-imageselect-target .rc-imageselect-tile img[src]',
        '.rc-imageselect-target .rc-imageselect-tile[data-rid]',
        '.rc-imageselect-target .rc-imageselect-tile[role="button"]',
        '.rc-imageselect-target .rc-imageselect-tile[tabindex]',
        '.rc-imageselect-target div[role="button"]',
        '.rc-imageselect-target .rc-imageselect-tile img',
        '.rc-imageselect-target .rc-imageselect-tile-background img',
        '.rc-imageselect-target .rc-imageselect-tile-overlay img',
        '.rc-imageselect-target .rc-imageselect-tile[data-rid] img',
        '.rc-imageselect-target .rc-imageselect-tile[role="button"] img',
        '.rc-imageselect-target .rc-imageselect-tile[tabindex] img'
      ]
      
      let imgElements = []
      
      // 尝试每个选择器
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector)
        if (elements.length > 0) {
          console.log(`找到图片元素，选择器: ${selector}, 数量: ${elements.length}`)
          imgElements = Array.from(elements)
          break
        }
      }
      
      // 如果主页面没有找到，尝试在iframe中查找
      if (imgElements.length === 0) {
        const iframe = document.querySelector('iframe[src*="recaptcha/api2/bframe"]')
        if (iframe) {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document
            
            for (const selector of selectors) {
              const elements = iframeDoc.querySelectorAll(selector)
              if (elements.length > 0) {
                console.log(`在iframe中找到图片元素，选择器: ${selector}, 数量: ${elements.length}`)
                imgElements = Array.from(elements)
                break
              }
            }
          } catch (e) {
            console.error('无法访问iframe内容:', e)
          }
        }
      }
      
      // 处理找到的元素
      return imgElements.map((img, index) => {
        const imgSrc = img.src || img.querySelector('img')?.src || img.getAttribute('data-src') || ''
        const imgAlt = img.alt || img.querySelector('img')?.alt || img.getAttribute('alt') || ''
        const imgClass = img.className || ''
        const imgRole = img.getAttribute('role') || ''
        const imgTabindex = img.getAttribute('tabindex') || ''
        const imgDataRid = img.getAttribute('data-rid') || ''
        
        return {
          index,
          src: imgSrc,
          alt: imgAlt,
          className: imgClass,
          role: imgRole,
          tabindex: imgTabindex,
          dataRid: imgDataRid,
          isSelected: img.classList.contains('rc-imageselect-tileselected'),
          tagName: img.tagName.toLowerCase(),
          selector: img.matches ? img.matches(selectors.join(',')) : false
        }
      })
    })
  }

  // 已移除第三方验证码破解服务



  // 已移除Capsolver服务

  // 已移除2captcha服务



  // 已移除submitCapsolverTask函数

  // 已移除waitForCapsolverResult函数

  // 已移除submit2CaptchaTask函数

  // 已移除waitFor2CaptchaResult函数

  /** 应用2captcha解决方案 - 已移除第三方验证码服务 */
  async apply2CaptchaSolution(browserPage, solution) {
    logger.info(`[TTC] 已移除2captcha服务，无法应用解决方案`)
    return false
  }





  /** 应用Capsolver解决方案 - 已移除第三方验证码服务 */
  async applyCapsolverSolution(browserPage, solution) {
    // 已移除第三方验证码破解服务
    logger.info(`[TTC] 已移除Capsolver服务，无法应用解决方案`)
    return false
  }

  /** 检查每日使用限制 - 已移除第三方验证码服务 */
  checkDailyLimit() {
    // 已移除第三方验证码破解服务
    logger.info(`[TTC] 已移除所有第三方验证码破解服务，无需检查使用限制`)
    return false
  }

  /** 更新每日使用计数 - 已移除第三方验证码服务 */
  updateDailyUsage() {
    // 已移除第三方验证码破解服务
    logger.info(`[TTC] 已移除所有第三方验证码破解服务，无需更新使用计数`)
  }

  /** 测试API密钥是否有效 */
  async testApiKey() {
    // 已移除第三方验证码服务
    logger.info(`[TTC] 已移除所有第三方验证码破解服务，无需测试API密钥`)
    return false
  }



  /** 测试Capsolver API密钥 - 已移除第三方验证码服务 */
  async testCapsolverApiKey() {
    // 已移除第三方验证码破解服务
    logger.info(`[TTC] 已移除Capsolver服务，无法测试API密钥`)
    return false
  }

  /** 测试2captcha API密钥 - 已移除第三方验证码服务 */
  async test2CaptchaApiKey() {
    // 已移除第三方验证码破解服务
    logger.info(`[TTC] 已移除2captcha服务，无法测试API密钥`)
    return false
  }

  /** 测试Anti-Captcha API密钥 - 已移除第三方验证码服务 */
  async testAntiCaptchaApiKey() {
    // 已移除第三方验证码破解服务
    logger.info(`[TTC] 已移除Anti-Captcha服务，无法测试API密钥`)
    return false
  }

  /** 测试CaptchaAI API密钥 - 已移除第三方验证码服务 */
  async testCaptchaAIApiKey() {
    // 已移除第三方验证码破解服务
    logger.info(`[TTC] 已移除CaptchaAI服务，无法测试API密钥`)
    return false
  }

  /** 检查验证码是否完全解决 */
  async checkCaptchaSolved(browserPage) {
    try {
      // 检查验证码状态前截图
      await takeDebugScreenshot(browserPage, {
        line: 5638,
        description: '检查验证码状态前'
      })
      
      // 检查主页面验证码状态
      const result = await browserPage.evaluate(() => {
        console.log('开始检查验证码状态...')
        
        // 检查是否还有验证码相关元素
        const captchaElements = document.querySelectorAll('.recaptcha, iframe[src*="recaptcha"], div[data-sitekey], .rc-imageselect, .g-recaptcha')
        console.log('验证码元素数量:', captchaElements.length)
        
        // 检查是否有验证码错误消息
        const captchaError = document.querySelector('.recaptcha-error, .rc-anchor-error-msg, .g-recaptcha-error')
        const hasError = captchaError && captchaError.style.display !== 'none' && captchaError.textContent && captchaError.textContent.trim() !== ''
        console.log('是否有验证码错误:', hasError)
        if (hasError && captchaError) {
          console.log('验证码错误内容:', captchaError.textContent)
        }
        
        // 检查是否有验证码复选框
        const checkbox = document.querySelector('.recaptcha-checkbox-border, .recaptcha-checkbox, .g-recaptcha-checkbox')
        console.log('是否有验证码复选框:', !!checkbox)
        
        // 检查页面是否已经加载了搜索结果
        const searchResults = document.querySelector('.search-results, .results-table, table, .item-list, .ttc-results')
        const hasResults = searchResults && searchResults.children.length > 0
        console.log('是否有搜索结果:', hasResults)
        
        // 检查页面标题是否包含搜索结果
        const title = document.title || ''
        const hasSearchTitle = title.includes('搜索结果') || title.includes('Search Result') || title.includes('Tamriel Trade Centre')
        console.log('页面标题:', title)
        console.log('标题是否包含搜索结果:', hasSearchTitle)
        
        // 检查URL是否已经跳转到结果页面
        const currentUrl = window.location.href
        const isResultPage = currentUrl.includes('SearchResult') || currentUrl.includes('search') || currentUrl.includes('result')
        const isDonationPage = currentUrl.includes('donate') || currentUrl.includes('donation') || currentUrl.includes('support')
        console.log('当前URL:', currentUrl)
        console.log('是否是结果页面:', isResultPage)
        console.log('是否是捐款页面:', isDonationPage)
        
        // 检查是否有"无结果"或"没有找到"的消息
        const noResultMsg = document.querySelector('.no-results, .no-data, .empty-results')
        const hasNoResultMsg = noResultMsg && noResultMsg.textContent && (noResultMsg.textContent.includes('没有找到') || noResultMsg.textContent.includes('No results'))
        console.log('是否有无结果消息:', hasNoResultMsg)
        
        // 检查是否有加载状态
        const loadingElements = document.querySelectorAll('.loading, .spinner, .progress')
        const isLoading = loadingElements.length > 0
        console.log('是否正在加载:', isLoading)
        
        // 检查是否有真实的交易数据（不是虚假数据）
        const tradeTable = document.querySelector('table, .search-results, .results-table, .item-list, .ttc-results')
        let hasRealData = false
        let fakeDataDetected = false
        
        if (tradeTable) {
          const rows = tradeTable.querySelectorAll('tr, .item-row, .trade-row')
          if (rows.length > 0) {
            // 检查是否只有1条记录且包含验证码提示
            if (rows.length === 1) {
              const firstRow = rows[0]
              const text = firstRow.textContent || ''
              if (text.includes('抱歉，您需要完成验证码测试才能继续') || 
                  text.includes('Please complete the captcha test to continue') ||
                  text.includes('验证码') || text.includes('captcha')) {
                fakeDataDetected = true
                console.log('检测到虚假数据：包含验证码提示')
              }
            }
            
            // 检查是否有真实的交易数据
            hasRealData = rows.length > 1 || (rows.length === 1 && !fakeDataDetected)
          }
        }
        
        console.log('有真实数据:', hasRealData)
        console.log('检测到虚假数据:', fakeDataDetected)
        
        // 综合判断验证码是否已解决
        const noCaptcha = captchaElements.length === 0 && !hasError && !checkbox
        const hasData = hasResults || hasSearchTitle || isResultPage || hasNoResultMsg
        const notLoading = !isLoading
        const notDonationPage = !isDonationPage
        const notFakeData = !fakeDataDetected
        
        console.log('无验证码元素:', noCaptcha)
        console.log('有数据:', hasData)
        console.log('不在加载:', notLoading)
        console.log('不是捐款页面:', notDonationPage)
        console.log('不是虚假数据:', notFakeData)
        
        // 如果没有任何验证码元素且没有错误消息，或者已经有搜索结果，则认为已解决
        // 但如果跳转到捐款页面或检测到虚假数据，说明验证码解决失败
        const isSolved = (noCaptcha || hasData) && notDonationPage && notFakeData
        
        return {
          isSolved,
          details: {
            noCaptcha,
            hasData,
            hasRealData,
            notLoading,
            notDonationPage,
            notFakeData,
            captchaElementsCount: captchaElements.length,
            hasError,
            hasResults,
            hasSearchTitle,
            isResultPage,
            isDonationPage,
            hasNoResultMsg,
            isLoading,
            fakeDataDetected
          }
        }
      })
      
      // 检查结果后截图
      await takeDebugScreenshot(browserPage, {
        line: 5670,
        description: `验证码状态检查结果_${result.isSolved ? '已解决' : '未解决'}`
      })
      
      if (result.isSolved) {
        logger.info(`[TTC] 验证码已成功解决`)
        logger.info(`[TTC] 验证码状态详情: ${JSON.stringify(result.details)}`)
      } else {
        logger.warn(`[TTC] 验证码仍未解决`)
        logger.info(`[TTC] 验证码状态详情: ${JSON.stringify(result.details)}`)
      }
      
      return result.isSolved
    } catch (error) {
      logger.error(`[TTC] 检查验证码状态出错: ${error.message}`)
      
      // 检查出错时截图
      await takeDebugScreenshot(browserPage, {
        line: 5680,
        description: '验证码状态检查出错'
      })
      return false
    }
  }
} 