import fetch from 'node-fetch'
import fs from 'node:fs'
import path from 'node:path'
import QRCode from 'qrcode'
import moment from 'moment'
import YAML from 'yaml'

class SteamModel {
  constructor() {
    this.apiKey = null
    this.proxyUrl = null
    this.regionCode = 'cn'
    this.baseUrl = 'https://api.steampowered.com'
    
    this.loadConfig()
  }

  // 加载配置
  loadConfig() {
    try {
      const configPath = './plugins/eso/custome_resources/config/steam.yaml'
      if (fs.existsSync(configPath)) {
        const config = YAML.parse(fs.readFileSync(configPath, 'utf8'))
        this.apiKey = config.apiKey || null
        this.proxyUrl = config.proxyUrl || null
        this.regionCode = config.regionCode || 'cn'
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 加载配置失败: ${error.message}`)
    }
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
    // 根据API类型设置不同的超时时间
    const getTimeout = (endpoint) => {
      if (endpoint.includes('GetPlayerSummaries')) {
        return 25000 // 用户信息查询：25秒
      } else if (endpoint.includes('GetOwnedGames')) {
        return 30000 // 游戏列表查询：30秒
      } else if (endpoint.includes('GetFriendList')) {
        return 20000 // 好友列表查询：20秒
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
        
        logger.info(`[ESO:Steam] API调用尝试 ${attempt + 1}/${retries + 1}: ${endpoint} (超时: ${timeout}ms)`)
        
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
          logger.info(`[ESO:Steam] 获取用户信息成功: ${endpoint} (耗时: ${duration}ms)`)
          if (data && data.response && data.response.players && data.response.players.length > 0) {
            const player = data.response.players[0]
            logger.info(`[ESO:Steam] 用户状态: ${player.personaname} - personastate: ${player.personastate}`)
          }
        } else {
          logger.info(`[ESO:Steam] API调用成功: ${endpoint} (耗时: ${duration}ms)`)
        }
        
        return data
      } catch (error) {
        const duration = Date.now() - startTime
        if (error.name === 'AbortError') {
          logger.error(`[ESO:Steam] API调用超时 (尝试 ${attempt + 1}/${retries + 1}): ${endpoint} (耗时: ${duration}ms)`)
        } else {
          logger.error(`[ESO:Steam] API调用失败 (尝试 ${attempt + 1}/${retries + 1}): ${endpoint} - ${error.message} (耗时: ${duration}ms)`)
        }
        
        // 如果不是最后一次尝试，等待后重试
        if (attempt < retries) {
          const waitTime = getWaitTime(attempt, endpoint)
          logger.info(`[ESO:Steam] 等待 ${Math.round(waitTime)}ms 后重试...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
      }
    }
    
    logger.error(`[ESO:Steam] API调用最终失败: ${endpoint}`)
    return null
  }

  // 获取用户信息（改进版本，支持多层API调用）
  async getUserInfo(steamId) {
    logger.info(`[ESO:Steam] 开始获取用户信息: ${steamId}`)

    // 方法1：尝试标准API
    let player = await this.getUserInfoStandard(steamId)
    
    // 如果标准API无法获取完整信息（隐私设置限制），尝试备用API
    if (player && (player.personastate === 0 && !player.lastlogoff) || player.communityvisibilitystate === 2) {
      logger.info(`[ESO:Steam] 标准API信息不完整，尝试使用备用API: ${steamId}`)
      const backupPlayer = await this.getUserInfoBackup(steamId)
      if (backupPlayer) {
        // 合并信息，优先使用备用API的数据
        player = { ...player, ...backupPlayer }
        logger.info(`[ESO:Steam] 备用API获取到更完整的信息: ${player.personaname}`)
      }
    }
    
    if (player) {
      // 添加详细的调试信息
      logger.info(`[ESO:Steam] 用户信息详情:`, {
        steamid: player.steamid,
        personaname: player.personaname,
        personastate: player.personastate,
        communityvisibilitystate: player.communityvisibilitystate,
        profilestate: player.profilestate,
        lastlogoff: player.lastlogoff,
        gameid: player.gameid,
        gameextrainfo: player.gameextrainfo,
        // 添加更多调试信息
        realname: player.realname,
        primaryclanid: player.primaryclanid,
        timecreated: player.timecreated,
        loccountrycode: player.loccountrycode,
        locstatecode: player.locstatecode,
        loccityid: player.loccityid
      })
      
      // 检查隐私设置
      if (player.communityvisibilitystate === 1) {
        logger.warn(`[ESO:Steam] 用户 ${player.personaname} 的个人资料是私密的，无法获取详细状态信息`)
      }
      
      return player
    }
    
    logger.error(`[ESO:Steam] 无法获取用户信息: ${steamId}`)
    return null
  }

  // 标准API获取用户信息
  async getUserInfoStandard(steamId) {
    const endpoint = `/ISteamUser/GetPlayerSummaries/v2/?key=${this.apiKey}&steamids=${steamId}`
    const data = await this.callApi(endpoint)
    
    if (data && data.response && data.response.players && data.response.players.length > 0) {
      return data.response.players[0]
    }
    return null
  }

  // 备用API获取用户信息（IPlayerService.GetPlayerLinkDetails）
  async getUserInfoBackup(steamId) {
    try {
      const endpoint = `/IPlayerService/GetPlayerLinkDetails/v1/?key=${this.apiKey}&steamids=${steamId}`
      const data = await this.callApi(endpoint)
      
      if (data && data.response && data.response.players && data.response.players.length > 0) {
        const player = data.response.players[0]
        
        // 转换数据格式以匹配标准API
        return {
          steamid: player.public_data.steamid,
          personaname: player.public_data.persona_name,
          personastate: player.private_data.persona_state || 0,
          communityvisibilitystate: player.public_data.visibility_state,
          profilestate: player.public_data.profile_state,
          lastlogoff: player.private_data.last_logoff_time,
          gameid: player.private_data.game_id,
          gameextrainfo: player.private_data.game_extra_info,
          timecreated: player.private_data.time_created
        }
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 备用API调用失败: ${error.message}`)
    }
    return null
  }

  // 获取好友列表
  async getFriendList(steamId) {
    const endpoint = `/ISteamUser/GetFriendList/v1/?key=${this.apiKey}&steamid=${steamId}&relationship=friend`
    const data = await this.callApi(endpoint)
    
    if (data && data.friendslist && data.friendslist.friends) {
      return data.friendslist.friends
    }
    return []
  }

  // 获取用户游戏列表
  async getOwnedGames(steamId) {
    const endpoint = `/IPlayerService/GetOwnedGames/v1/?key=${this.apiKey}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1`
    const data = await this.callApi(endpoint)
    
    if (data && data.response && data.response.games) {
      return data.response.games
    }
    return []
  }

  // 获取当前在线人数
  async getCurrentPlayers(appId) {
    const endpoint = `/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`
    const data = await this.callApi(endpoint)
    
    if (data && data.response && data.response.player_count !== undefined) {
      return data.response.player_count
    }
    return null
  }

  // 获取游戏信息
  async getGameInfo(appId) {
    const endpoint = `/ISteamApps/GetAppDetails/v2/?appids=${appId}`
    const data = await this.callApi(endpoint)
    
    if (data && data[appId] && data[appId].success) {
      return data[appId].data
    }
    return null
  }

  // 生成二维码登录
  async generateQRLogin() {
    try {
      const session = await this.beginAuthSessionViaQR()
      if (!session) {
        return null
      }
      
      const qrCodeDataUrl = await QRCode.toDataURL(session.challenge_url)
      const qrCodeBase64 = qrCodeDataUrl.replace('data:image/png;base64,', 'base64://')
      
      return {
        session,
        qrCode: qrCodeBase64
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 生成二维码失败: ${error.message}`)
      return null
    }
  }

  // 开始二维码认证会话
  async beginAuthSessionViaQR() {
    try {
      const url = this.getApiUrl('/IAuthenticationService/BeginAuthSessionViaQR/v1')
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({
          input_json: JSON.stringify({
            device_details: {
              device_friendly_name: "ESO Bot",
              platform_type: 3,
              os_type: -500,
              gaming_device_type: 528
            },
            website_id: "Mobile"
          })
        }),
        timeout: 10000
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.response
    } catch (error) {
      logger.error(`[ESO:Steam] 开始认证会话失败: ${error.message}`)
      return null
    }
  }

  // 轮询认证状态
  async pollAuthSessionStatus(clientId, requestId) {
    try {
      const url = this.getApiUrl('/IAuthenticationService/PollAuthSessionStatus/v1')
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({
          input_json: JSON.stringify({
            client_id: clientId,
            request_id: requestId
          })
        }),
        timeout: 10000
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.response
    } catch (error) {
      logger.error(`[ESO:Steam] 轮询认证状态失败: ${error.message}`)
      return null
    }
  }

  // 验证Steam ID格式
  validateSteamId(steamId) {
    // Steam ID 64位格式验证
    const steamIdRegex = /^[0-9]{17}$/
    return steamIdRegex.test(steamId)
  }

  // 转换Steam ID格式
  convertSteamId(input) {
    // 如果是好友码格式，需要转换
    if (input.includes('STEAM_') || input.includes('U:1:')) {
      // 这里需要实现Steam ID转换逻辑
      // 简化处理，直接返回输入
      return input
    }
    
    // 如果是纯数字，直接返回
    if (/^\d+$/.test(input)) {
      return input
    }
    
    return null
  }

  // 获取游戏白名单
  getGameWhitelist() {
    try {
      const whitelistPath = './plugins/eso/custome_resources/config/game_whitelist.json'
      if (fs.existsSync(whitelistPath)) {
        const data = JSON.parse(fs.readFileSync(whitelistPath, 'utf8'))
        return data.games || []
      }
      return []
    } catch (error) {
      logger.error(`[ESO:Steam] 读取游戏白名单失败: ${error.message}`)
      return []
    }
  }

  // 添加游戏到白名单
  addGameToWhitelist(appId, gameName) {
    try {
      const whitelistPath = './plugins/eso/custome_resources/config/game_whitelist.json'
      let whitelist = { games: [] }
      
      if (fs.existsSync(whitelistPath)) {
        whitelist = JSON.parse(fs.readFileSync(whitelistPath, 'utf8'))
      }
      
      // 检查是否已存在
      const exists = whitelist.games.find(game => game.appId === appId)
      if (exists) {
        return false
      }
      
      whitelist.games.push({
        appId,
        name: gameName,
        addedAt: moment().format('YYYY-MM-DD HH:mm:ss')
      })
      
      fs.writeFileSync(whitelistPath, JSON.stringify(whitelist, null, 2))
      return true
    } catch (error) {
      logger.error(`[ESO:Steam] 添加游戏到白名单失败: ${error.message}`)
      return false
    }
  }

  // 从白名单移除游戏
  removeGameFromWhitelist(appId) {
    try {
      const whitelistPath = './plugins/eso/custome_resources/config/game_whitelist.json'
      if (!fs.existsSync(whitelistPath)) {
        return false
      }
      
      const whitelist = JSON.parse(fs.readFileSync(whitelistPath, 'utf8'))
      const index = whitelist.games.findIndex(game => game.appId === appId)
      
      if (index === -1) {
        return false
      }
      
      whitelist.games.splice(index, 1)
      fs.writeFileSync(whitelistPath, JSON.stringify(whitelist, null, 2))
      return true
    } catch (error) {
      logger.error(`[ESO:Steam] 从白名单移除游戏失败: ${error.message}`)
      return false
    }
  }

  // 检查游戏是否在白名单中
  isGameInWhitelist(appId) {
    const whitelist = this.getGameWhitelist()
    return whitelist.some(game => game.appId === appId)
  }

  // 获取用户在线时长统计
  async getUserPlaytime(steamId, appId) {
    const games = await this.getOwnedGames(steamId)
    const game = games.find(g => g.appid === parseInt(appId))
    
    if (game) {
      return {
        playtime_forever: game.playtime_forever || 0,
        playtime_2weeks: game.playtime_2weeks || 0
      }
    }
    
    return null
  }

  // 格式化在线时长
  formatPlaytime(minutes) {
    if (minutes < 60) {
      return `${minutes}分钟`
    } else if (minutes < 1440) {
      const hours = Math.floor(minutes / 60)
      const mins = minutes % 60
      return `${hours}小时${mins}分钟`
    } else {
      const days = Math.floor(minutes / 1440)
      const hours = Math.floor((minutes % 1440) / 60)
      return `${days}天${hours}小时`
    }
  }

  // 获取游戏头图URL
  getHeaderImgUrlByAppid(appid, type = 'apps', name = 'header.jpg') {
    if (!appid) return ''
    return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/${type}/${appid}/${name}`
  }

  // 获取好友码
  getFriendCode(steamId) {
    if (!steamId) {
      return '未知'
    }
    try {
      const steamIdOffset = 76561197960265728n
      const steamIdBigInt = BigInt(steamId)
      return (steamIdBigInt - steamIdOffset).toString()
    } catch (error) {
      logger.error(`[ESO:Steam] 计算好友码失败: ${error.message}`)
      return '未知'
    }
  }
}

export default new SteamModel() 