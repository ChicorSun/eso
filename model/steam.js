import fetch from 'node-fetch'
import fs from 'node:fs'
import path from 'node:path'
import QRCode from 'qrcode'
import moment from 'moment'
import YAML from 'yaml'

class SteamModel {
  constructor() {
    this.apiKeys = [] // 支持多个API密钥
    this.proxyUrl = null
    this.regionCode = 'cn'
    this.baseUrl = 'https://api.steampowered.com'
    this.communityUrl = 'https://steamcommunity.com'
    this.storeUrl = 'https://store.steampowered.com'
    
    this.loadConfig()
  }

  // 加载配置
  loadConfig() {
    try {
      const configPath = './plugins/eso/custome_resources/steam/config/steamConfig.json'
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        // 处理API密钥，过滤掉null和空值
        let keys = []
        if (config.apiKeys && Array.isArray(config.apiKeys)) {
          keys = config.apiKeys.filter(key => key && typeof key === 'string' && key.trim() !== '')
        } else if (config.apiKey && typeof config.apiKey === 'string' && config.apiKey.trim() !== '') {
          keys = [config.apiKey]
        }
        this.apiKeys = keys
        this.proxyUrl = config.proxyUrl || null
        this.regionCode = config.regionCode || 'cn'
      }
    } catch (error) {
      console.error(`[ESO:Steam] 加载配置失败: ${error.message}`)
    }
  }

  // 保存配置
  saveConfig() {
    try {
      const configPath = './plugins/eso/custome_resources/steam/config/steamConfig.json'
      const configDir = path.dirname(configPath)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }
      
      const config = {
        apiKeys: this.apiKeys,
        proxyUrl: this.proxyUrl,
        regionCode: this.regionCode
      }
      
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    } catch (error) {
      console.error(`[ESO:Steam] 保存配置失败: ${error.message}`)
    }
  }

  // 获取当前可用的API密钥
  getCurrentApiKey() {
    if (this.apiKeys.length === 0) {
      return null
    }
    // 简单轮询，后续可以添加更复杂的负载均衡
    return this.apiKeys[0]
  }

  // 检查是否有可用的API密钥
  hasApiKey() {
    return this.apiKeys.length > 0 && this.apiKeys.some(key => key && key.trim() !== '')
  }

  // 添加API密钥
  addApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      throw new Error('API密钥不能为空')
    }
    
    const trimmedKey = apiKey.trim()
    if (!this.apiKeys.includes(trimmedKey)) {
      this.apiKeys.push(trimmedKey)
      this.saveConfig()
      return true
    }
    return false
  }

  // 删除API密钥
  removeApiKey(apiKey) {
    const index = this.apiKeys.indexOf(apiKey)
    if (index > -1) {
      this.apiKeys.splice(index, 1)
      this.saveConfig()
      return true
    }
    return false
  }

  // 获取API密钥列表
  getApiKeys() {
    return [...this.apiKeys]
  }

  // 获取API URL
  getApiUrl(endpoint) {
    let url = `${this.baseUrl}${endpoint}`
    if (this.proxyUrl) {
      url = this.proxyUrl.replace('{{url}}', url)
    }
    return url
  }

  // Steam API调用（优化版本，带智能重试机制）
  async callApi(endpoint, params = {}, retries = 3) {
    // 检查API密钥
    if (!this.hasApiKey()) {
      throw new Error('未配置Steam API密钥，请先使用 #steam设置 添加API密钥')
    }

    // 根据API类型设置不同的超时时间
    const getTimeout = (endpoint) => {
      if (endpoint.includes('GetPlayerSummaries')) {
        return 25000 // 用户信息查询：25秒
      } else if (endpoint.includes('GetOwnedGames')) {
        return 30000 // 游戏列表查询：30秒
      } else if (endpoint.includes('GetFriendList')) {
        return 20000 // 好友列表查询：20秒
      } else if (endpoint.includes('GetUserStatsForGame')) {
        return 35000 // 游戏统计查询：35秒
      } else if (endpoint.includes('GetPlayerAchievements')) {
        return 30000 // 成就查询：30秒
      } else {
        return 20000 // 默认：20秒
      }
    }

    // 智能重试等待时间计算
    const getWaitTime = (attempt, endpoint) => {
      const baseWait = endpoint.includes('GetPlayerSummaries') ? 3000 : 2000
      // 指数退避 + 随机抖动，避免同时重试
      const exponentialWait = baseWait * Math.pow(2, attempt)
      const jitter = Math.random() * 1000 // 0-1秒随机抖动
      return Math.min(exponentialWait + jitter, 15000) // 最大等待15秒
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      const startTime = Date.now()
      try {
        const url = this.getApiUrl(endpoint)
        const timeout = getTimeout(endpoint)
        
        // 使用 AbortController 实现超时
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)
        
        console.log(`[ESO:Steam] API调用尝试 ${attempt + 1}/${retries + 1}: ${endpoint} (超时: ${timeout}ms)`)
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive'
          },
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        const duration = Date.now() - startTime
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        
        const data = await response.json()
        
        // 添加详细的调试日志
        if (endpoint.includes('GetPlayerSummaries')) {
          console.log(`[ESO:Steam] 用户信息查询成功: ${duration}ms`)
        } else if (endpoint.includes('GetOwnedGames')) {
          console.log(`[ESO:Steam] 游戏列表查询成功: ${duration}ms`)
        } else if (endpoint.includes('GetUserStatsForGame')) {
          console.log(`[ESO:Steam] 游戏统计查询成功: ${duration}ms`)
        }
        
        return data
        
      } catch (error) {
        const duration = Date.now() - startTime
        console.error(`[ESO:Steam] API调用失败 (尝试 ${attempt + 1}/${retries + 1}): ${endpoint}`)
        console.error(`[ESO:Steam] 错误详情: ${error.message}`)
        console.error(`[ESO:Steam] 耗时: ${duration}ms`)
        
        if (attempt === retries) {
          throw error
        }
        
          const waitTime = getWaitTime(attempt, endpoint)
        console.log(`[ESO:Steam] 等待 ${waitTime}ms 后重试...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
      }
    }
    
  // 获取用户信息
  async getUserInfo(steamId) {
    try {
      const apiKey = this.getCurrentApiKey()
      const endpoint = `/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`
      const data = await this.callApi(endpoint)
      
      if (data.response && data.response.players && data.response.players.length > 0) {
        return data.response.players[0]
      }
      
      return null
    } catch (error) {
      console.error(`[ESO:Steam] 获取用户信息失败: ${error.message}`)
      return null
    }
  }

  // 获取用户游戏列表
  async getOwnedGames(steamId, includeAppInfo = true, includePlayedFreeGames = true) {
    try {
      const apiKey = this.getCurrentApiKey()
      const endpoint = `/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}&include_appinfo=${includeAppInfo}&include_played_free_games=${includePlayedFreeGames}&appids_filter=`
      const data = await this.callApi(endpoint)
      
      if (data.response && data.response.games) {
        // 排序游戏列表：按最近两周游戏时长 > 总游戏时长 > 游戏名称
        const sortedGames = data.response.games.sort((a, b) => {
          // 首先按最近两周游戏时长排序（降序）
          if ((a.playtime_2weeks || 0) !== (b.playtime_2weeks || 0)) {
            return (b.playtime_2weeks || 0) - (a.playtime_2weeks || 0)
          }
          // 如果最近两周时长相同，按总游戏时长排序（降序）
          if ((a.playtime_forever || 0) !== (b.playtime_forever || 0)) {
            return (b.playtime_forever || 0) - (a.playtime_forever || 0)
          }
          // 如果总时长也相同，按游戏名称排序（升序）
          return (a.name || '').localeCompare(b.name || '', 'zh-CN')
        })
        
        return sortedGames
      }
      
      return []
    } catch (error) {
      console.error(`[ESO:Steam] 获取游戏列表失败: ${error.message}`)
      return []
    }
  }

  // 获取游戏成就
  async getPlayerAchievements(steamId, appId) {
    try {
      const apiKey = this.getCurrentApiKey()
      const endpoint = `/ISteamUserStats/GetPlayerAchievements/v1/?key=${apiKey}&steamid=${steamId}&appid=${appId}&l=schinese`
    const data = await this.callApi(endpoint)
    
      if (data.playerstats && data.playerstats.achievements) {
        return data.playerstats
      }
      
      return null
    } catch (error) {
      console.error(`[ESO:Steam] 获取成就失败: ${error.message}`)
      return null
    }
  }

  // 获取游戏统计
  async getUserStatsForGame(steamId, appId) {
    try {
      const apiKey = this.getCurrentApiKey()
      const endpoint = `/ISteamUserStats/GetUserStatsForGame/v2/?key=${apiKey}&steamid=${steamId}&appid=${appId}`
      const data = await this.callApi(endpoint)
      
      if (data.playerstats) {
        return data.playerstats
      }
      
      return null
    } catch (error) {
      console.error(`[ESO:Steam] 获取游戏统计失败: ${error.message}`)
      return null
    }
  }

  // 获取好友列表
  async getFriendList(steamId) {
    try {
      const apiKey = this.getCurrentApiKey()
      const endpoint = `/ISteamUser/GetFriendList/v1/?key=${apiKey}&steamid=${steamId}&relationship=friend`
    const data = await this.callApi(endpoint)
    
      if (data.friendslist && data.friendslist.friends) {
      return data.friendslist.friends
    }
      
      return []
    } catch (error) {
      console.error(`[ESO:Steam] 获取好友列表失败: ${error.message}`)
    return []
    }
  }

  // 获取当前在线好友
  async getOnlineFriends(steamId) {
    try {
      const friends = await this.getFriendList(steamId)
      if (friends.length === 0) return []
      
      const friendIds = friends.map(friend => friend.steamid).join(',')
      const apiKey = this.getCurrentApiKey()
      const endpoint = `/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${friendIds}`
    const data = await this.callApi(endpoint)
    
      if (data.response && data.response.players) {
        return data.response.players.filter(player => player.personastate > 0)
      }
      
      return []
    } catch (error) {
      console.error(`[ESO:Steam] 获取在线好友失败: ${error.message}`)
      return []
    }
  }

  // 搜索Steam游戏
  async searchGames(query, limit = 10) {
    try {
      // 使用Steam商店搜索API
      const searchUrl = `${this.storeUrl}/search/results/?query=${encodeURIComponent(query)}&supportedlang=schinese&infinite=1&start=0&count=${limit}`
      
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      const html = await response.text()
      
      // 解析搜索结果（简化版本）
      const games = []
      const appIdRegex = /data-ds-appid="(\d+)"/g
      const nameRegex = /data-ds-appid="\d+".*?<span class="title">([^<]+)<\/span>/g
      
      let match
      while ((match = appIdRegex.exec(html)) !== null) {
        const appId = match[1]
        const nameMatch = html.match(new RegExp(`data-ds-appid="${appId}".*?<span class="title">([^<]+)<\/span>`))
        const name = nameMatch ? nameMatch[1] : `游戏 ${appId}`
        
        games.push({
          appid: appId,
          name: name
        })
      }
      
      return games.slice(0, limit)
    } catch (error) {
      console.error(`[ESO:Steam] 搜索游戏失败: ${error.message}`)
      return []
    }
  }

  // 获取游戏详情
  async getGameInfo(appId) {
    try {
      const endpoint = `/ISteamApps/GetAppDetails/v2/?appids=${appId}&filters=basic,price_overview,metacritic,release_date,platforms,categories,genres`
      const data = await this.callApi(endpoint)
      
      if (data[appId] && data[appId].success) {
        return data[appId].data
      }
      
      return null
    } catch (error) {
      console.error(`[ESO:Steam] 获取游戏详情失败: ${error.message}`)
      return null
    }
  }

  // 获取当前折扣
  async getCurrentDiscounts() {
    try {
      // 获取特惠页面
      const dealsUrl = `${this.storeUrl}/search/results/?query=&supportedlang=schinese&infinite=1&start=0&count=50&specials=1`
      
      const response = await fetch(dealsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      const html = await response.text()
      
      // 解析折扣信息（简化版本）
      const deals = []
      const dealRegex = /data-ds-appid="(\d+)".*?<span class="title">([^<]+)<\/span>.*?<div class="discount_pct">-(\d+)%<\/div>/g
      
      let match
      while ((match = dealRegex.exec(html)) !== null) {
        deals.push({
          appid: match[1],
          name: match[2],
          discount: parseInt(match[3])
        })
      }
      
      return deals.slice(0, 20) // 返回前20个折扣
    } catch (error) {
      console.error(`[ESO:Steam] 获取折扣信息失败: ${error.message}`)
      return []
    }
  }

  // 验证Steam ID
  validateSteamId(steamId) {
    if (!steamId) return false
    
    // Steam ID格式验证
    const steamIdRegex = /^[0-9]{17}$/
    return steamIdRegex.test(steamId.toString())
  }

  // 转换Steam ID格式
  convertSteamId(input) {
    if (!input) return null
    
    // 如果是17位数字，直接返回
    if (this.validateSteamId(input)) {
      return input
    }
    
    // 如果是好友码，转换为Steam ID
    const steamIdOffset = 76561197960265728n
    try {
      const friendCode = BigInt(input)
      const steamId = (friendCode + steamIdOffset).toString()
      
      // 验证转换后的Steam ID是否有效
      if (this.validateSteamId(steamId)) {
        return steamId
      }
    } catch (error) {
      // 如果转换失败，说明不是有效的好友码
      return null
    }
    
    return null
  }

  // 解析Steam ID或好友码
  parseSteamId(input) {
    if (!input) return null
    
    // 尝试转换（支持Steam ID和好友码）
    const steamId = this.convertSteamId(input)
    if (steamId) {
      return steamId
    }
    
    return null
  }

  // 获取好友码
  getFriendCode(steamId) {
    if (!this.validateSteamId(steamId)) return null
    
    // Steam好友码计算：Steam ID - 固定偏移量
    const steamIdOffset = 76561197960265728n
    const friendCode = BigInt(steamId) - steamIdOffset
    return friendCode.toString()
  }

  // 格式化游戏时间
  formatPlaytime(minutes) {
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

  // 获取游戏头图URL
  getHeaderImgUrlByAppid(appid, type = 'apps', name = 'header.jpg') {
    return `https://cdn.akamai.steamstatic.com/steam/${type}/${appid}/${name}`
  }

  // 获取游戏图标URL
  getIconImgUrlByAppid(appid, type = 'apps', name = 'icon.jpg') {
    return `https://cdn.akamai.steamstatic.com/steam/${type}/${appid}/${name}`
  }

  // 设置API密钥
  setApiKey(apiKey) {
    this.apiKey = apiKey
    this.saveConfig()
  }

  // 设置代理
  setProxy(proxyUrl) {
    this.proxyUrl = proxyUrl
    this.saveConfig()
  }

  // 设置地区代码
  setRegionCode(regionCode) {
    this.regionCode = regionCode
    this.saveConfig()
  }

  // 测试API连接
  async testApiConnection() {
    if (!this.apiKey) {
      return { success: false, message: '未设置API密钥' }
    }
    
    try {
      const endpoint = `/ISteamUser/GetPlayerSummaries/v2/?key=${this.apiKey}&steamids=76561197960265728`
      const data = await this.callApi(endpoint)
      
      if (data.response && data.response.players) {
        return { success: true, message: 'API连接正常' }
      } else {
        return { success: false, message: 'API响应异常' }
      }
    } catch (error) {
      return { success: false, message: `API连接失败: ${error.message}` }
    }
  }
}

export default new SteamModel() 