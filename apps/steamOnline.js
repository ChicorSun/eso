import plugin from '../../../lib/plugins/plugin.js'
import SteamModel from '../model/steam.js'
import SteamUserModel from '../model/steamUser.js'
import SteamPushModel from '../model/steamPush.js'
import moment from 'moment'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'

// 配置文件路径
const CONFIG_PATH = './plugins/eso/custome_resources/config/steam.yaml'
const PUSH_PATH = './plugins/eso/custome_resources/config/steam_push.json'
const ONLINE_STATUS_PATH = './plugins/eso/custome_resources/config/steam_online_status.json'
const GAME_WHITELIST_PATH = './plugins/eso/custome_resources/config/game_whitelist.json'

// Steam在线监控相关宏定义
const STEAM_ONLINE = {
  STATUS_TEXT: {
    0: '离线', 1: '在线', 2: '忙碌', 3: '离开', 4: '打盹', 5: '想交易', 6: '想玩游戏'
  },
  MONITOR_INTERVAL: 30000,
  MAX_DISPLAY_USERS: 10,
  MAX_DISPLAY_OFFLINE: 5
}

export class steamOnline extends plugin {
  constructor() {
    super({
      name: 'Steam在线监控',
      dsc: 'Steam在线状态监控、游戏时长统计、白名单管理等功能',
      event: 'message',
      priority: 1000,
      rule: [
        { reg: '^#steam开启推送$', fnc: 'enablePush' },
        { reg: '^#steam关闭推送$', fnc: 'disablePush' },
        { reg: '^#steam开启游玩推送$', fnc: 'enablePlayPush' },
        { reg: '^#steam关闭游玩推送$', fnc: 'disablePlayPush' },
        { reg: '^#steam开启状态推送$', fnc: 'enableStatePush' },
        { reg: '^#steam关闭状态推送$', fnc: 'disableStatePush' },
        { reg: '^#steam在线状态$', fnc: 'onlineStatus' },
        { reg: '^#steam群友状态$', fnc: 'groupOnlineStatus' },
        { reg: '^#查询游戏白名单$', fnc: 'gameWhitelist' },
        { reg: '^#添加游戏白名单(?:\\s+(\\d+))?$', fnc: 'addGameToWhitelist' },
        { reg: '^#移除游戏白名单(?:\\s+(\\d+))?$', fnc: 'removeGameFromWhitelist' },
        { reg: '^#steam游戏时长(?:\\s+(\\d+))?$', fnc: 'playtimeStats' },
        { reg: '^#steam监控统计$', fnc: 'monitoringStats' }
      ]
    })
  }

  async enablePush(e) {
    try {
      const userInfo = SteamUserModel.getUserInfo(e.user_id)
      if (!userInfo) {
        return await this.reply('您还没有绑定Steam账户，请先使用 #steam绑定 命令绑定账户')
      }
      SteamPushModel.setGroupPush(e.group_id, true)
      SteamPushModel.setUserPush(e.user_id, userInfo.steamId, 'online', true)
      SteamPushModel.setUserPush(e.user_id, userInfo.steamId, 'game', true)
      return await this.reply('已开启Steam在线状态推送！')
    } catch (error) {
      logger.error(`[ESO:Steam] 开启推送失败: ${error.message}`)
      return await this.reply('开启推送失败，请稍后重试')
    }
  }

  async disablePush(e) {
    try {
      const userInfo = SteamUserModel.getUserInfo(e.user_id)
      if (!userInfo) return await this.reply('您还没有绑定Steam账户')
      SteamPushModel.setUserPush(e.user_id, userInfo.steamId, 'online', false)
      SteamPushModel.setUserPush(e.user_id, userInfo.steamId, 'game', false)
      return await this.reply('已关闭Steam在线状态推送！')
    } catch (error) {
      logger.error(`[ESO:Steam] 关闭推送失败: ${error.message}`)
      return await this.reply('关闭推送失败，请稍后重试')
    }
  }

  async onlineStatus(e) {
    try {
      const userInfo = SteamUserModel.getUserInfo(e.user_id)
      if (!userInfo) {
        return await this.reply('您还没有绑定Steam账户，请先使用 #steam绑定 命令绑定账户')
      }
      const steamInfo = await SteamModel.getUserInfo(userInfo.steamId)
      if (!steamInfo) return await this.reply('无法获取Steam状态，请稍后重试')
      
      // 准备渲染数据
      const statusText = STEAM_ONLINE.STATUS_TEXT[steamInfo.personastate] || '未知'
      const statusClass = steamInfo.personastate === 1 ? 'online' : 
                         steamInfo.personastate === 0 ? 'offline' : 
                         steamInfo.personastate === 2 ? 'busy' : 'away'
      
      const stats = [
        {
          label: '用户名',
          value: steamInfo.personaname
        },
        {
          label: '当前状态',
          value: statusText
        },
        {
          label: '最后在线',
          value: steamInfo.lastlogoff ? moment.unix(steamInfo.lastlogoff).format('MM-DD HH:mm') : '未知'
        }
      ]

      const renderData = {
        cmd: 'steam在线状态',
        title: 'Steam 在线状态',
        userInfo: {
          steamid: steamInfo.steamid,
          personaname: steamInfo.personaname,
          avatarfull: steamInfo.avatarfull || 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
          gameextrainfo: steamInfo.gameextrainfo
        },
        statusText: statusText,
        statusClass: statusClass,
        stats: stats,
        date: moment().format('YYYY-MM-DD HH:mm:ss'),
        tplFile: './plugins/eso/resources/html/steam/steam.html',
        pluResPath: './plugins/eso/resources/'
      }

      // 如果正在游戏，添加游戏时长信息
      if (steamInfo.gameextrainfo) {
        const whitelist = SteamModel.getGameWhitelist()
        if (whitelist.length === 0 || SteamModel.isGameInWhitelist(steamInfo.gameid)) {
          const playtime = await SteamModel.getUserPlaytime(userInfo.steamId, steamInfo.gameid)
          if (playtime) {
            renderData.games = [{
              name: steamInfo.gameextrainfo,
              image: SteamModel.getHeaderImgUrlByAppid(steamInfo.gameid),
              playtime: `总时长: ${SteamModel.formatPlaytime(playtime.playtime_forever)}`
            }]
            
            if (playtime.playtime_2weeks > 0) {
              renderData.games[0].playtime += ` | 最近两周: ${SteamModel.formatPlaytime(playtime.playtime_2weeks)}`
            }
          }
        }
      }

      const img = await puppeteer.screenshot('steam', renderData)
      return await this.reply(img)
    } catch (error) {
      logger.error(`[ESO:Steam] 查询在线状态失败: ${error.message}`)
      return await this.reply('查询失败，请稍后重试')
    }
  }

  async groupOnlineStatus(e) {
    try {
      const allUsers = SteamUserModel.getAllUsers()
      const onlineUsers = []
      const offlineUsers = []

      for (const [qqId, userData] of Object.entries(allUsers)) {
        const steamInfo = await SteamModel.getUserInfo(userData.steamId)
        if (steamInfo) {
          const status = {
            qqId, steamName: steamInfo.personaname, status: steamInfo.personastate,
            game: steamInfo.gameextrainfo || null, lastOnline: steamInfo.lastlogoff
          }
          if (steamInfo.personastate > 0) {
            onlineUsers.push(status)
          } else {
            offlineUsers.push(status)
          }
        }
      }

      // 准备渲染数据
      const stats = [
        {
          label: '在线用户',
          value: `${onlineUsers.length}人`
        },
        {
          label: '离线用户',
          value: `${offlineUsers.length}人`
        },
        {
          label: '总用户',
          value: `${onlineUsers.length + offlineUsers.length}人`
        }
      ]

      const games = []
      
      // 添加在线用户
      for (const user of onlineUsers.slice(0, STEAM_ONLINE.MAX_DISPLAY_USERS)) {
        games.push({
          name: user.steamName,
          image: 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
          playtime: user.game ? `正在玩: ${user.game}` : '在线'
        })
      }

      // 添加离线用户
      for (const user of offlineUsers.slice(0, STEAM_ONLINE.MAX_DISPLAY_OFFLINE)) {
        const lastOnline = moment.unix(user.lastOnline).format('MM-DD HH:mm')
        games.push({
          name: user.steamName,
          image: 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
          playtime: `最后在线: ${lastOnline}`
        })
      }

      const renderData = {
        cmd: 'steam群友状态',
        title: '群友 Steam 状态',
        stats: stats,
        games: games,
        date: moment().format('YYYY-MM-DD HH:mm:ss'),
        tplFile: './plugins/eso/resources/html/steam/steam.html',
        pluResPath: './plugins/eso/resources/'
      }

      const img = await puppeteer.screenshot('steam', renderData)
      return await this.reply(img)
    } catch (error) {
      logger.error(`[ESO:Steam] 查询群友状态失败: ${error.message}`)
      return await this.reply('查询失败，请稍后重试')
    }
  }

  async gameWhitelist(e) {
    try {
      const whitelist = SteamModel.getGameWhitelist()
      if (whitelist.length === 0) {
        const renderData = {
          cmd: '查询游戏白名单',
          title: '游戏白名单',
          message: '游戏白名单为空，所有游戏都会被监控和统计\n\n💡 只有白名单中的游戏才会触发游玩推送通知\n💡 当白名单为空时，所有游戏都会触发游玩推送\n💡 游戏时长统计不受白名单影响，会显示所有游戏',
          date: moment().format('YYYY-MM-DD HH:mm:ss'),
          tplFile: './plugins/eso/resources/html/steam/steam.html',
          pluResPath: './plugins/eso/resources/'
        }
        const img = await puppeteer.screenshot('steam', renderData)
        return await this.reply(img)
      }
      
      const games = whitelist.map(game => ({
        name: game.name,
        image: SteamModel.getHeaderImgUrlByAppid(game.appId),
        playtime: `ID: ${game.appId} | 添加时间: ${game.addedAt}`
      }))

      const renderData = {
        cmd: '查询游戏白名单',
        title: `游戏白名单 (${whitelist.length}个游戏)`,
        games: games,
        message: '💡 只有白名单中的游戏才会触发游玩推送通知\n💡 当白名单为空时，所有游戏都会触发游玩推送\n💡 游戏时长统计不受白名单影响，会显示所有游戏',
        date: moment().format('YYYY-MM-DD HH:mm:ss'),
        tplFile: './plugins/eso/resources/html/steam/steam.html',
        pluResPath: './plugins/eso/resources/'
      }

      const img = await puppeteer.screenshot('steam', renderData)
      return await this.reply(img)
    } catch (error) {
      logger.error(`[ESO:Steam] 查询游戏白名单失败: ${error.message}`)
      return await this.reply('查询失败，请稍后重试')
    }
  }

  async addGameToWhitelist(e) {
    try {
      const match = e.msg.match(/^#添加游戏白名单(?:\s+(\d+))?$/)
      const appId = match[1]
      
      // 如果没有提供游戏ID，给出提示
      if (!appId) {
        return await this.reply('请提供游戏ID\n\n使用方法：\n#添加游戏白名单 <游戏ID>\n\n例如：\n#添加游戏白名单 730\n\n💡 提示：\n• 游戏ID是数字，可以在Steam商店页面URL中找到\n• 例如：https://store.steampowered.com/app/730/ 中的730就是游戏ID\n• 或者使用 #查询游戏白名单 查看当前白名单')
      }
      
      if (SteamModel.isGameInWhitelist(appId)) {
        return await this.reply('该游戏已在白名单中')
      }
      const gameInfo = await SteamModel.getGameInfo(appId)
      if (!gameInfo) {
        return await this.reply('无法获取游戏信息，请检查游戏ID是否正确')
      }
      const success = SteamModel.addGameToWhitelist(appId, gameInfo.name)
      if (success) {
        return await this.reply(`已添加游戏到白名单：\n${gameInfo.name} (ID: ${appId})`)
      } else {
        return await this.reply('添加失败，请稍后重试')
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 添加游戏到白名单失败: ${error.message}`)
      return await this.reply('添加失败，请稍后重试')
    }
  }

  async removeGameFromWhitelist(e) {
    try {
      const match = e.msg.match(/^#移除游戏白名单(?:\s+(\d+))?$/)
      const appId = match[1]
      
      // 如果没有提供游戏ID，给出提示
      if (!appId) {
        return await this.reply('请提供游戏ID\n\n使用方法：\n#移除游戏白名单 <游戏ID>\n\n例如：\n#移除游戏白名单 730\n\n💡 提示：\n• 游戏ID是数字，可以在Steam商店页面URL中找到\n• 或者使用 #查询游戏白名单 查看当前白名单')
      }
      
      const success = SteamModel.removeGameFromWhitelist(appId)
      if (success) {
        return await this.reply(`已从白名单移除游戏 (ID: ${appId})`)
      } else {
        return await this.reply('该游戏不在白名单中')
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 移除游戏白名单失败: ${error.message}`)
      return await this.reply('移除失败，请稍后重试')
    }
  }

  async playtimeStats(e) {
    try {
      const match = e.msg.match(/^#steam游戏时长(?:\s+(\d+))?$/)
      const appId = match[1]
      const userInfo = SteamUserModel.getUserInfo(e.user_id)
      
      if (!userInfo) {
        return await this.reply('您还没有绑定Steam账户，请先使用 #steam绑定 命令绑定账户')
      }

      if (!appId) {
        const games = await SteamModel.getOwnedGames(userInfo.steamId)
        
        // 准备渲染数据
        const gamesData = games.slice(0, STEAM_ONLINE.MAX_DISPLAY_USERS).map(game => ({
          name: game.name,
          image: SteamModel.getHeaderImgUrlByAppid(game.appid),
          playtime: SteamModel.formatPlaytime(game.playtime_forever)
        }))

        const renderData = {
          cmd: 'steam游戏时长',
          title: 'Steam 游戏时长统计',
          games: gamesData,
          date: moment().format('YYYY-MM-DD HH:mm:ss'),
          tplFile: './plugins/eso/resources/html/steam/steam.html',
          pluResPath: './plugins/eso/resources/'
        }

        const img = await puppeteer.screenshot('steam', renderData)
        return await this.reply(img)
      } else {
        const playtime = await SteamModel.getUserPlaytime(userInfo.steamId, appId)
        if (!playtime) return await this.reply('未找到该游戏的时长记录')
        
        const gameInfo = await SteamModel.getGameInfo(appId)
        const gameName = gameInfo ? gameInfo.name : `游戏 (ID: ${appId})`
        
        const stats = [
          {
            label: '总时长',
            value: SteamModel.formatPlaytime(playtime.playtime_forever)
          }
        ]
        
        if (playtime.playtime_2weeks > 0) {
          stats.push({
            label: '最近两周',
            value: SteamModel.formatPlaytime(playtime.playtime_2weeks)
          })
        }

        const renderData = {
          cmd: 'steam游戏时长',
          title: `${gameName} 游戏时长`,
          stats: stats,
          date: moment().format('YYYY-MM-DD HH:mm:ss'),
          tplFile: './plugins/eso/resources/html/steam/steam.html',
          pluResPath: './plugins/eso/resources/'
        }

        const img = await puppeteer.screenshot('steam', renderData)
        return await this.reply(img)
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 查询游戏时长失败: ${error.message}`)
      return await this.reply('查询失败，请稍后重试')
    }
  }

  async monitoringStats(e) {
    try {
      const stats = SteamPushModel.getMonitoringStats()
      const bindStats = SteamUserModel.getBindStats()
      
      const statsData = [
        {
          label: '监控状态',
          value: stats.monitoring ? '🟢 运行中' : '🔴 已停止'
        },
        {
          label: '推送群数',
          value: stats.totalGroups
        },
        {
          label: '游玩推送用户',
          value: stats.playPushUsers
        },
        {
          label: '状态推送用户',
          value: stats.statePushUsers
        },
        {
          label: '总推送用户',
          value: stats.totalUsers
        },
        {
          label: '在线用户',
          value: stats.onlineUsers
        },
        {
          label: '总绑定用户',
          value: bindStats.total
        },
        {
          label: '今日新增',
          value: bindStats.today
        }
      ]

      const renderData = {
        cmd: 'steam监控统计',
        title: 'Steam 监控统计',
        stats: statsData,
        date: moment().format('YYYY-MM-DD HH:mm:ss'),
        tplFile: './plugins/eso/resources/html/steam/steam.html',
        pluResPath: './plugins/eso/resources/'
      }

      const img = await puppeteer.screenshot('steam', renderData)
      return await this.reply(img)
    } catch (error) {
      logger.error(`[ESO:Steam] 查询监控统计失败: ${error.message}`)
      return await this.reply('查询失败，请稍后重试')
    }
  }

  // 开启游玩推送
  async enablePlayPush(e) {
    try {
      const userInfo = SteamUserModel.getUserInfo(e.user_id)
      if (!userInfo) {
        return await this.reply('您还没有绑定Steam账户，请先使用 #steam绑定 命令绑定账户')
      }
      
      const success = SteamPushModel.setPlayPush(e.user_id, userInfo.steamId, true)
      if (success) {
        return await this.reply(`已开启游玩推送！\n\n当您开始或停止游戏时，机器人会向群 ${e.group_id} 推送通知。`)
      } else {
        return await this.reply('开启游玩推送失败，请稍后重试')
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 开启游玩推送失败: ${error.message}`)
      return await this.reply('开启游玩推送失败，请稍后重试')
    }
  }

  // 关闭游玩推送
  async disablePlayPush(e) {
    try {
      const userInfo = SteamUserModel.getUserInfo(e.user_id)
      if (!userInfo) {
        return await this.reply('您还没有绑定Steam账户，请先使用 #steam绑定 命令绑定账户')
      }
      
      const success = SteamPushModel.setPlayPush(e.user_id, userInfo.steamId, false)
      if (success) {
        return await this.reply('已关闭游玩推送！')
      } else {
        return await this.reply('关闭游玩推送失败，请稍后重试')
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 关闭游玩推送失败: ${error.message}`)
      return await this.reply('关闭游玩推送失败，请稍后重试')
    }
  }

  // 开启状态推送
  async enableStatePush(e) {
    try {
      const userInfo = SteamUserModel.getUserInfo(e.user_id)
      if (!userInfo) {
        return await this.reply('您还没有绑定Steam账户，请先使用 #steam绑定 命令绑定账户')
      }
      
      const success = SteamPushModel.setStatePush(e.user_id, userInfo.steamId, true)
      if (success) {
        return await this.reply(`已开启状态推送！\n\n当您的在线状态发生变化时，机器人会向群 ${e.group_id} 推送通知。`)
      } else {
        return await this.reply('开启状态推送失败，请稍后重试')
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 开启状态推送失败: ${error.message}`)
      return await this.reply('开启状态推送失败，请稍后重试')
    }
  }

  // 关闭状态推送
  async disableStatePush(e) {
    try {
      const userInfo = SteamUserModel.getUserInfo(e.user_id)
      if (!userInfo) {
        return await this.reply('您还没有绑定Steam账户，请先使用 #steam绑定 命令绑定账户')
      }
      
      const success = SteamPushModel.setStatePush(e.user_id, userInfo.steamId, false)
      if (success) {
        return await this.reply('已关闭状态推送！')
      } else {
        return await this.reply('关闭状态推送失败，请稍后重试')
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 关闭状态推送失败: ${error.message}`)
      return await this.reply('关闭状态推送失败，请稍后重试')
    }
  }
} 