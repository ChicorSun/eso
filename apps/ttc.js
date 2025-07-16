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

const require = createRequire(import.meta.url)

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
        }
      ]
    })

    // 启动清理任务
    this.startCleanupTask()
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
      
      logger.info(`[TTC] 价格表自动更新已安排，下次更新时间: ${target.toLocaleString('zh-CN')}`)
      
      // 设置定时器
      setTimeout(async () => {
        await this.silentUpdatePriceTable()
        // 更新完成后，安排下一次更新
        scheduleNextUpdate()
      }, timeUntilUpdate)
    }
    
    // 立即安排第一次更新
    scheduleNextUpdate()
  }

  /** 静默更新价格表（不发送消息通知） */
  async silentUpdatePriceTable() {
    try {
      logger.info('[TTC] 开始执行定时价格表更新...')
      
      const serverKeys = ['NA', 'EU']
      const results = []
      
      for (const serverKey of serverKeys) {
        const updateResult = await this.updatePriceData(serverKey)
        results.push({
          server: SERVER_CONFIG[serverKey].name,
          ...updateResult
        })
      }
      
      // 清除价格相关缓存
      ttcCache.clear()
      priceCache.clear()
      
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

  /** 清理旧文件 */
  cleanupOldFiles() {
    try {
      const dirs = [TTC_CACHE_PATH, TTC_IMAGE_PATH, TTC_DATA_PATH]
      const now = Date.now()

      dirs.forEach(dir => {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir)
          files.forEach(file => {
            try {
              const filePath = path.join(dir, file)
              const stats = fs.statSync(filePath)
              if (now - stats.mtime.getTime() > CLEANUP_CONFIG.FILE_MAX_AGE) {
                fs.unlinkSync(filePath)
              }
            } catch (fileError) {
              logger.warn(`[TTC] 清理文件时出错: ${file}, ${fileError.message}`)
            }
          })
        }
      })
    } catch (error) {
      logger.error(`[TTC] 清理文件失败: ${error.message}`)
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

      // 模拟查询物品功能（这里需要适配ESO的数据源）
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
      }

      // 提取页数和物品名
      let page = 1
      let itemName = content

      // 从后往前找数字作为页数
      const match = content.match(/(.*?)(\d+)$/)
      if (match) {
        itemName = match[1].trim()
        page = parseInt(match[2])
      }

      if (!itemName) {
        return await this.reply('请输入要查询的物品名称\n示例：#查询交易 蟹灵蜡\n示例：#查询交易 欧服 致命匕首 5')
      }

      // 检查缓存
      const cacheKey = `trade_${serverType}_${itemName}_${page}`
      const cachedImage = ttcCache.get(cacheKey)
      if (cachedImage) {
        return await this.reply(cachedImage)
      }

      // 构建查询URL
      const baseUrl = `https://${serverType}.tamrieltradecentre.com/pc/Trade/SearchResult?ItemNamePattern=${encodeURIComponent(itemName)}&lang=zh-CN&SortBy=Price&Order=asc&page=${page}`
      
      // 使用puppeteer获取交易信息
      const imageBuffer = await this.scrapeTradeInfo(baseUrl, itemName, page, serverType)
      
      if (imageBuffer) {
        // 缓存图片
        ttcCache.set(cacheKey, imageBuffer)
        
        return await this.reply(imageBuffer)
      } else {
        return await this.reply('没有找到符合条件的交易信息')
      }

    } catch (error) {
      logger.error(`[TTC] 查询交易失败: ${error.message}`)
      return await this.reply('查询交易失败，请稍后重试')
    }
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

      const results = []
      for (const serverKey of serverKeys) {
        const updateResult = await this.updatePriceData(serverKey)
        results.push({
          server: SERVER_CONFIG[serverKey].name,
          ...updateResult
        })
      }
      
      // 清除价格相关缓存
      ttcCache.clear()
      priceCache.clear()
      
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
#查询交易 [服务器] [物品名] [页数]
示例：#查询交易 蟹灵蜡
示例：#查询交易 欧服 致命匕首 5
功能：查看当前在售的交易记录列表
※ 显示交易者、位置、工会、价格等详细信息
※ 默认查询美服第1页，支持分页浏览

💰 查询价格
#查询价格 [服务器] [物品名/ID]
示例：#查询价格 蟹灵蜡
示例：#查询价格 欧服 蟹灵蜡
示例：#查询价格 美服 12345
功能：获取物品的详细价格统计信息
※ 支持最多30条价格数据展示
※ 默认查询美服价格

🔄 更新价格表（仅主人）
#更新价格表 [服务器]
示例：#更新价格表（更新美服+欧服）
示例：#更新价格表 欧服（仅更新欧服）
示例：#更新价格表 美服（仅更新美服）
功能：从TTC服务器下载最新价格数据

❓ 帮助
#TTC帮助

🌍 支持的服务器：
• 美服 (NA/US) - 默认服务器
• 欧服 (EU) - 需要在命令中指定

📁 文件存储位置：
• 配置文件：custome_resources/ttc/config/
• 价格表数据：custome_resources/ttc/data/
• 临时缓存：custome_resources/ttc/cache/
• 生成图片：custome_resources/ttc/images/

注意事项：
• 查询有频率限制，请勿过于频繁
• 交易查询支持美服/欧服切换  
• 价格查询支持美服/欧服独立数据
• 价格信息基于TTC最新数据
• 不同服务器的价格可能存在差异`

    return await this.reply(helpMsg)
  }

    /** 在数据库中搜索物品 */
  async searchItemInDatabase(itemName) {
    try {
      // 优先使用TTC的ItemLookUpTable_ZH.lua文件搜索可交易物品
      const lookupResults = await this.searchInTTCLookupTable(itemName)
      if (lookupResults && lookupResults.length > 0) {
        return lookupResults
      }

      // 如果TTC查找表中没有找到，再在ESO数据库中搜索装备/套装
      let results = []
      
      // 搜索装备/套装 (type=1) - 这些可能可以交易
      let setIndexes = await database.name2index(itemName, 1)
      if (setIndexes && setIndexes[0] >= 0) {
        for (let setKey of setIndexes.slice(0, 20)) { // 限制最多20个结果
          try {
            let setData = await database.updateData(setKey, 1)
            if (setData && setData.atlasData && setData.atlasData[1]) {
              results.push({
                id: `ESO_${setKey}`, // 使用ESO前缀标识这是ESO数据库的ID，不是TTC物品ID
                name: setData.atlasData[1].name,
                type: '装备/套装',
                category: setData.atlasData[1].type || '未知类型'
              })
            }
          } catch (error) {
            logger.warn(`[TTC] 获取装备数据失败: ${setKey}, ${error.message}`)
          }
        }
      }
      
      // 注：不搜索技能，因为技能不能交易
      // 注：暂时不搜索食物，因为大部分食物不在TTC中交易
      
      return results
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
      logger.info(`[TTC] 开始抓取交易数据: ${url}`)
      
      // 使用puppeteer访问TTC网站并获取页面内容
      const htmlData = await this.fetchTradePageData(url, itemName, page, serverType)
      
      if (!htmlData || htmlData.hasError) {
        logger.warn(`[TTC] 抓取失败或无数据: ${htmlData?.error || '未知错误'}`)
        return await this.generateNoDataImage(itemName, page, serverType, htmlData?.error)
      }
      
      // 生成交易信息图片
      const imgBuffer = await this.generateTradeImage(htmlData)
      
      return imgBuffer

    } catch (error) {
      logger.error(`[TTC] 抓取交易信息失败: ${error.message}`)
      return await this.generateErrorImage(itemName, page, serverType, error.message)
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
        await browserPage.setViewport({ width: 1920, height: 1080 })
        
        // 清理浏览器缓存，确保获取最新内容
        await this.cleanBrowserCache(browserPage)
        
        logger.info(`[TTC] 正在访问页面: ${url}`)
        
        // 使用与esologPuzzle.js相同的策略访问页面
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
        
        // 使用Promise.resolve + setTimeout来代替waitForTimeout
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        // 检查页面内容
        const pageContent = await browserPage.evaluate(() => {
          // 检查是否有"没有符合条件的交易"文本
          const noResultsText = Array.from(document.querySelectorAll('h3, div, span')).find(el => 
            el.textContent && el.textContent.includes('没有符合条件的交易')
          )
          
          // 检查是否有交易表格
          const tradeTable = document.querySelector('table.trade-list-table')
          const tradeRows = document.querySelectorAll('table.trade-list-table tbody tr')
          
          return {
            hasNoResults: !!noResultsText,
            hasTable: !!tradeTable,
            rowCount: tradeRows ? tradeRows.length : 0,
            pageTitle: document.title,
            bodyText: document.body.textContent.substring(0, 500) // 前500字符用于调试
          }
        })
        
        logger.info(`[TTC] 页面内容检查结果: 无结果=${pageContent.hasNoResults}, 有表格=${pageContent.hasTable}, 行数=${pageContent.rowCount}`)
        logger.info(`[TTC] 页面标题: ${pageContent.pageTitle}`)
        
        // 如果明确显示没有结果
        if (pageContent.hasNoResults) {
          logger.info(`[TTC] 页面显示无交易数据: ${itemName}`)
          return { hasError: true, error: '没有符合条件的交易' }
        }
        
        // 如果没有找到表格，可能需要等待更长时间或页面结构改变了
        if (!pageContent.hasTable) {
          logger.warn(`[TTC] 未找到交易表格，可能页面结构已变更`)
          logger.info(`[TTC] 页面内容片段: ${pageContent.bodyText}`)
          
          // 尝试等待更长时间
          await new Promise(resolve => setTimeout(resolve, 5000))
          
          // 再次检查
          const hasTableNow = await browserPage.evaluate(() => {
            return !!document.querySelector('table.trade-list-table')
          })
          
          if (!hasTableNow) {
            return { hasError: true, error: '页面结构异常，未找到交易表格' }
          }
        }
        
        // 如果有表格但没有数据行
        if (pageContent.hasTable && pageContent.rowCount === 0) {
          logger.info(`[TTC] 找到表格但无数据行: ${itemName}`)
          return { hasError: true, error: '没有符合条件的交易' }
        }
        
        // 获取交易数据
        logger.info(`[TTC] 开始提取交易数据...`)
        const tradeData = await browserPage.evaluate(() => {
          const data = []
          const rows = document.querySelectorAll('table.trade-list-table tbody tr')
          
          if (!rows || rows.length === 0) {
            return { hasError: true, error: '未找到交易数据行' }
          }
          
          rows.forEach((row, index) => {
            try {
              // 物品信息和品质
              let item = "未找到物品信息"
              let itemQualityColor = "深灰色"
              const itemElement = row.querySelector('div[class*="item-quality-"]')
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
              const playerElement = row.querySelector('div.text-small-width')
              if (playerElement) {
                playerId = playerElement.textContent.trim()
              }
              
              // 位置信息
              let location = "未找到位置信息"
              const locationElement = row.querySelector('a.trade-list-clickable.bold')
              if (locationElement) {
                location = locationElement.textContent.trim()
              }
              
              // 工会信息
              let guild = "未找到工会信息"
              const guildElement = row.querySelector('div[data-bind="text: GuildName"]')
              if (guildElement) {
                guild = guildElement.textContent.trim()
              }
              
              // 单价信息
              let unitPrice = "未找到单价信息"
              const unitPriceElement = row.querySelector('span[data-bind="localizedNumber: UnitPrice"]')
              if (unitPriceElement) {
                unitPrice = unitPriceElement.textContent.trim()
              }
              
              // 数量信息
              let amount = "未找到数量信息"
              const amountElement = row.querySelector('span[data-bind="localizedNumber: Amount"]')
              if (amountElement) {
                amount = amountElement.textContent.trim()
              }
              
              // 总价信息
              let totalPrice = "未找到总价信息"
              const totalPriceElement = row.querySelector('span[data-bind="localizedNumber: TotalPrice"]')
              if (totalPriceElement) {
                totalPrice = totalPriceElement.textContent.trim()
              }
              
              // 最后看见时间信息
              let lastSeen = "未找到最后看见时间信息"
              const lastSeenElement = row.querySelector('td.bold.hidden-xs')
              if (lastSeenElement) {
                lastSeen = lastSeenElement.textContent.trim()
              }
              
              // 如果至少有一些有效信息，就添加到数据中
              if (item !== "未找到物品信息" || 
                  unitPrice !== "未找到单价信息" || 
                  amount !== "未找到数量信息") {
                
                data.push([
                  item, level, playerId, location, guild,
                  unitPrice, amount, totalPrice, lastSeen, itemQualityColor
                ])
              }
              
            } catch (error) {
              console.error(`处理第 ${index + 1} 行数据时出现异常:`, error)
            }
          })
          
          // 提取页面信息
          let currentPage = "1"
          let totalPages = "1"
          
          // 查找当前页信息
          const currentPageElement = document.querySelector('span.active[data-bind="text: $data"]')
          if (currentPageElement) {
            currentPage = currentPageElement.textContent.trim()
          }
          
          // 查找总页数信息
          const totalPagesElements = document.querySelectorAll('li a')
          for (const element of totalPagesElements) {
            if (element.getAttribute('href') && element.getAttribute('href').includes('GetUrlForPage(TotalPageCount)')) {
              totalPages = element.textContent.trim()
              break
            }
          }
          
          const pageInfo = `第${currentPage}页/总共${totalPages}页`
          
          return { hasError: false, data, pageInfo }
        })
        
        if (tradeData.hasError) {
          logger.warn(`[TTC] 数据提取失败: ${tradeData.error}`)
          return tradeData
        }
        
        if (!tradeData.data || tradeData.data.length === 0) {
          logger.info(`[TTC] 提取到的数据为空: ${itemName}`)
          return { hasError: true, error: '没有符合条件的交易' }
        }
        
        logger.info(`[TTC] 成功提取到 ${tradeData.data.length} 条交易数据`)
        
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
        return { hasError: true, error: `页面访问失败: ${error.message}` }
      } finally {
        // 在关闭页面前再次清理缓存
        await this.cleanBrowserCache(browserPage).catch(() => {})
        await browserPage.close().catch(err => logger.error('[TTC] 关闭页面失败:', err))
      }
      
    } catch (error) {
      logger.error(`[TTC] 获取页面数据失败: ${error.message}`)
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
    // 数据结构：[item, level, player_id, location, guild, unit_price, amount, total_price, last_seen, item_quality_color]
    const tradeRows = data.map((row, index) => ({
      index: index + 1,
      itemName: row[0],                                                   // 物品名称
      level: row[1],                                                      // 等级
      trader: row[2],                                                     // 交易者
      location: row[3],                                                   // 位置
      guild: row[4],                                                      // 工会
      unitPrice: row[5],                                                  // 单价
      amount: row[6],                                                     // 数量
      totalPrice: row[7],                                                 // 总价
      lastSeen: row[8],                                                   // 最后看见时间
      qualityColor: this.getQualityColorClass(row[9])                    // 品质颜色
    }))
    
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

  /** 缓存交易截图 */
  async cacheTradeImage(data) {
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
      const updateTime = new Date().toLocaleString('zh-CN')
      
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
        savePath: path.relative('./plugins/eso/', jsonFilePath) // 显示相对路径更友好
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
      logger.info(`[TTC] 尝试解压 ${zipPath} 到 ${targetDir}`)
      
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
      logger.info(`[TTC] 开始解析lua文件: ${luaFilePath}`)
      
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
      logger.info(`[TTC] 键名转换后的前500字符: ${convertedStr.substring(0, 500)}...`)
      
      // 将 = 替换为 :
      convertedStr = convertedStr.replace(/=/g, ':')
      
      // 移除注释行
      convertedStr = convertedStr.replace(/--.*$/gm, '')
      
      // 移除尾随逗号
      convertedStr = convertedStr.replace(/,(\s*[}\]])/g, '$1')
      
      // DEBUG: 显示最终转换结果的样本
      logger.info(`[TTC] 最终转换结果的前1000字符: ${convertedStr.substring(0, 1000)}...`)
      logger.info(`[TTC] 最终转换结果的后500字符: ...${convertedStr.substring(convertedStr.length - 500)}`)
      
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
        logger.info(`[TTC] 价格表已转换并保存到: ${jsonFilePath}`)
        
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
        logger.info('[TTC] 开始读取价格表JSON文件...')
        const jsonContent = await fs.promises.readFile(jsonFilePath, 'utf8')
        priceTableData = JSON.parse(jsonContent)
        logger.info(`[TTC] 成功读取价格表数据`)
      } catch (error) {
        logger.error(`[TTC] 读取价格表失败: ${error.message}`)
        return {
          type: 'text',
          content: `❌ 价格表读取失败\n\n错误信息: ${error.message}\n\n请尝试重新更新价格表：\n🔄 #更新价格表`
        }
      }

      // 1. 如果输入是纯数字，直接作为物品ID查询
      let itemId = null
      let itemName = null
      
      if (queryContent.match(/^\d+$/)) {
        itemId = queryContent
        itemName = `物品ID: ${itemId}`
      } else {
        // 2. 如果输入是物品名称，先查找ID
        itemId = await this.findItemIdByName(queryContent)
        if (!itemId) {
          return {
            type: 'text',
            content: `❌ 未找到物品 "${queryContent}"\n\n请先使用以下命令查找正确的物品ID：\n📦 #查询物品 ${queryContent}\n\n然后使用ID查询价格：\n💰 #查询价格 [物品ID]`
          }
        }
        itemName = queryContent
      }

      // 3. 在复杂的数据结构中查找物品数据
      // 如果数据有priceTable字段，使用它；否则直接使用priceTableData
      const dataToSearch = priceTableData.priceTable || priceTableData
      const itemData = this.findItemData(dataToSearch, itemId)
      logger.info(`[TTC] 搜索数据结构: ${Object.keys(dataToSearch).slice(0, 5).join(', ')}...`)
      logger.info(`[TTC] 物品${itemId}查找结果: ${itemData ? '找到' : '未找到'}`)
      if (!itemData) {
        return {
          type: 'text',
          content: `❌ 物品ID ${itemId} 在${serverConfig.name}暂无价格数据\n\n可能原因：\n• 该物品无法交易\n• 近期无交易记录\n• 价格表需要更新`
        }
      }

      // 4. 处理复杂的价格数据结构
      const processedData = this.processSpecialStructures(itemData)
      if (!processedData || processedData.length === 0) {
        return {
          type: 'text',
          content: `❌ 物品ID ${itemId} 的价格数据格式异常\n\n请尝试重新更新价格表：\n🔄 #更新价格表`
        }
      }

      // 5. 格式化价格信息
      // 检查数据结构，从正确的位置获取TimeStamp
      let timestamp = priceTableData.TimeStamp
      
      // 如果TimeStamp不在顶级，检查其他可能位置
      if (!timestamp && priceTableData.priceTable) {
        timestamp = priceTableData.priceTable.TimeStamp
      }
      if (!timestamp && priceTableData.Data) {
        timestamp = priceTableData.Data.TimeStamp
      }
      
      // 始终使用HTML截图生成价格信息
      try {
        const priceImage = await this.generatePriceImage(itemId, itemName, processedData, timestamp, serverConfig)
        return {
          type: 'image',
          content: priceImage,
          cacheKey: cacheKey
        }
      } catch (error) {
        logger.warn(`[TTC] 图片生成失败，降级到文本显示: ${error.message}`)
        // 继续执行文本版本
      }
      
      let timeStr = "数据更新时间未知"
      if (timestamp && timestamp !== null && timestamp !== undefined) {
        try {
          // 按照原始TTC项目的逻辑：使用time.localtime(timestamp)
          const date = new Date(timestamp * 1000)
          timeStr = `数据更新时间：${date.getFullYear()}年${(date.getMonth()+1).toString().padStart(2, '0')}月${date.getDate().toString().padStart(2, '0')}日${date.getHours().toString().padStart(2, '0')}时${date.getMinutes().toString().padStart(2, '0')}分${date.getSeconds().toString().padStart(2, '0')}秒`
          logger.info(`[TTC] 时间戳转换成功: ${timeStr}`)
        } catch (error) {
          logger.error(`[TTC] 时间戳转换失败: ${error.message}`)
          timeStr = "数据更新时间格式异常"
        }
      } else {
        logger.warn(`[TTC] TimeStamp为空或未定义`)
      }
      
      let priceText = `🏷️ 物品价格信息 (${serverConfig.name})\n`
      priceText += `══════════════\n`
      priceText += `📦 物品名称｜${itemName}\n`
      priceText += `🔢 物品ID  ｜${itemId}\n`
      priceText += `📊 数据条目｜${processedData.length}条\n`
      priceText += `⏰ ${timeStr}\n\n`
      
      // 显示前几条价格数据
      const maxDisplay = Math.min(5, processedData.length)
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

      // 返回文本结果
      return {
        type: 'text',
        content: priceText,
        cacheKey: cacheKey
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
    let timeStr = "数据更新时间未知"
    if (timestamp && timestamp !== null && timestamp !== undefined) {
      try {
        const date = new Date(timestamp * 1000)
        timeStr = `${date.getFullYear()}年${(date.getMonth()+1).toString().padStart(2, '0')}月${date.getDate().toString().padStart(2, '0')}日${date.getHours().toString().padStart(2, '0')}时${date.getMinutes().toString().padStart(2, '0')}分${date.getSeconds().toString().padStart(2, '0')}秒`
      } catch (error) {
        timeStr = "数据更新时间格式异常"
      }
    }

    // 处理价格数据，转换为HTML模板格式
    const maxDisplay = Math.min(30, processedData.length) // 最多显示30条
    const priceData = []
    
    for (let i = 0; i < maxDisplay; i++) {
      const data = processedData[i]
      const item = {
        index: `${i + 1}.`,
        quality: data.品质 || '未知',
        qualityClass: this.getQualityClass(data.品质),
        level: data.等级 || '未知',
        trait: data.特质 || '未知',
        // 价格信息 (按用户要求的顺序：最低价 → 最高价 → 平均价 → 销售均价→建议价)
        lowPrice: data.最低价 ? `${data.最低价.toLocaleString()}金` : null,
        highPrice: data.最高价 ? `${data.最高价.toLocaleString()}金` : null,
        averagePrice: data.平均价 ? `${data.平均价.toLocaleString()}金` : null,
        salesAvgPrice: data.销售均价 ? `${data.销售均价.toLocaleString()}金` : null,
        suggestedPrice: data.建议价 ? `${data.建议价.toLocaleString()}金` : null,
        // 交易信息
        listingCount: data.列表数量 ? `${data.列表数量}个` : null,
        totalCount: data.总物品数 ? `${data.总物品数}个` : null,
        salesCount: data.销售记录数 ? `${data.销售记录数}笔` : null,
        totalSalesCount: data.销售总数 ? `${data.销售总数}笔` : null
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
    let timeStr = "数据更新时间未知"
    if (timestamp && timestamp !== null && timestamp !== undefined) {
      try {
        const date = new Date(timestamp * 1000)
        timeStr = `数据更新时间：${date.getFullYear()}年${(date.getMonth()+1).toString().padStart(2, '0')}月${date.getDate().toString().padStart(2, '0')}日${date.getHours().toString().padStart(2, '0')}时${date.getMinutes().toString().padStart(2, '0')}分${date.getSeconds().toString().padStart(2, '0')}秒`
      } catch (error) {
        timeStr = "数据更新时间格式异常"
      }
    }
    
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
} 