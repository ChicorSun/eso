import plugin from '../../../lib/plugins/plugin.js'
import SteamModel from '../model/steam.js'
import SteamUserModel from '../model/steamUser.js'
import SteamPushModel from '../model/steamPush.js'
import moment from 'moment'

// 配置文件路径
const CONFIG_PATH = './plugins/eso/custome_resources/config/steam.yaml'
const PUSH_PATH = './plugins/eso/custome_resources/config/steam_push.json'
const ONLINE_STATUS_PATH = './plugins/eso/custome_resources/config/steam_online_status.json'

// Steam监控相关宏定义
const STEAM_MONITOR = {
  // 状态文本映射
  STATUS_TEXT: {
    0: '离线', 1: '在线', 2: '忙碌', 3: '离开', 4: '打盹', 5: '想交易', 6: '想玩游戏'
  },
  // 默认检查间隔（毫秒）
  DEFAULT_CHECK_INTERVAL: 30000,
  // 最大显示用户数
  MAX_DISPLAY_ONLINE: 5,
  MAX_DISPLAY_OFFLINE: 3
}

// 状态变化监控服务
class SteamMonitorService {
  constructor() {
    this.isRunning = false
    this.interval = null
    this.checkInterval = STEAM_MONITOR.DEFAULT_CHECK_INTERVAL
  }

  start() {
    if (this.isRunning) {
      return false
    }

    this.isRunning = true
    this.interval = setInterval(() => {
      this.checkStatusChanges()
    }, this.checkInterval)

    logger.info('[ESO:Steam] 状态监控服务已启动')
    return true
  }

  stop() {
    if (!this.isRunning) {
      return false
    }

    this.isRunning = false
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }

    logger.info('[ESO:Steam] 状态监控服务已停止')
    return true
  }

  async checkStatusChanges() {
    try {
      if (!SteamPushModel.isMonitoring()) {
        return
      }

      const allUsers = SteamUserModel.getAllUsers()
      const pushGroups = SteamPushModel.getPushGroups()

      if (pushGroups.length === 0) {
        return
      }

      for (const [qqId, userData] of Object.entries(allUsers)) {
        await this.checkUserStatusChange(qqId, userData, pushGroups)
        // 添加延迟避免API限制
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 状态检查失败: ${error.message}`)
    }
  }

  async checkUserStatusChange(qqId, userData, pushGroups) {
    try {
      // 检查用户是否开启了推送
      const playPushEnabled = SteamPushModel.getPlayPushStatus(qqId, userData.steamId)
      const statePushEnabled = SteamPushModel.getStatePushStatus(qqId, userData.steamId)

      if (!playPushEnabled && !statePushEnabled) {
        return
      }

      // 获取最新状态
      const steamInfo = await SteamModel.getUserInfo(userData.steamId)
      if (!steamInfo) {
        return
      }

      // 检查状态是否发生变化
      const hasChanged = SteamPushModel.hasStatusChanged(userData.steamId, steamInfo)
      if (!hasChanged) {
        return
      }

      // 更新状态
      SteamPushModel.updateOnlineStatus(userData.steamId, steamInfo)

      // 生成推送消息
      const pushMessage = this.generateStatusChangeMessage(userData, steamInfo, playPushEnabled, statePushEnabled)
      if (pushMessage) {
        // 推送到所有开启推送的群
        for (const groupId of pushGroups) {
          try {
            // 这里需要调用机器人的发送消息接口
            // 由于没有直接的机器人实例，我们记录日志
            logger.info(`[ESO:Steam] 推送到群 ${groupId}: ${pushMessage}`)
            
            // 实际使用时需要替换为真实的机器人发送接口
            // await bot.pickGroup(groupId).sendMsg(pushMessage)
          } catch (error) {
            logger.error(`[ESO:Steam] 推送到群 ${groupId} 失败: ${error.message}`)
          }
        }
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 检查用户 ${qqId} 状态变化失败: ${error.message}`)
    }
  }

  generateStatusChangeMessage(userData, steamInfo, playPushEnabled, statePushEnabled) {
    const oldStatus = SteamPushModel.getOnlineStatus(userData.steamId)
    if (!oldStatus) {
      return null
    }

    let message = `🎮 Steam状态变化\n\n`
    message += `用户: ${steamInfo.personaname}\n`

    // 在线状态变化
    if (statePushEnabled && oldStatus.personastate !== steamInfo.personastate) {
      const oldStatusText = STEAM_MONITOR.STATUS_TEXT[oldStatus.personastate] || '未知'
      const newStatusText = STEAM_MONITOR.STATUS_TEXT[steamInfo.personastate] || '未知'
      message += `状态: ${oldStatusText} → ${newStatusText}\n`
    }

    // 游戏状态变化
    if (playPushEnabled && oldStatus.gameextrainfo !== steamInfo.gameextrainfo) {
      if (steamInfo.gameextrainfo) {
        message += `开始游戏: ${steamInfo.gameextrainfo}\n`
        
        // 检查是否在白名单中（如果白名单为空则监控所有游戏）
        const whitelist = SteamModel.getGameWhitelist()
        if (whitelist.length === 0 || SteamModel.isGameInWhitelist(steamInfo.gameid)) {
          message += `💡 ${whitelist.length === 0 ? '白名单为空，监控所有游戏' : '该游戏在白名单中，将监控游戏时长'}\n`
        } else {
          // 游戏不在白名单中，不发送游玩推送
          return null
        }
      } else if (oldStatus.gameextrainfo) {
        message += `停止游戏: ${oldStatus.gameextrainfo}\n`
      }
    }

    message += `\n时间: ${moment().format('YYYY-MM-DD HH:mm:ss')}`

    return message
  }

  async manualCheck() {
    try {
      const allUsers = SteamUserModel.getAllUsers()
      const results = []

      for (const [qqId, userData] of Object.entries(allUsers)) {
        const steamInfo = await SteamModel.getUserInfo(userData.steamId)
        if (steamInfo) {
          results.push({
            qqId,
            steamName: steamInfo.personaname,
            status: steamInfo.personastate,
            game: steamInfo.gameextrainfo || null,
            lastOnline: steamInfo.lastlogoff
          })
        }
        // 添加延迟避免API限制
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      return results
    } catch (error) {
      logger.error(`[ESO:Steam] 手动检查状态失败: ${error.message}`)
      return []
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
      lastCheck: moment().format('YYYY-MM-DD HH:mm:ss')
    }
  }
}

// 创建监控服务实例
const monitorService = new SteamMonitorService()

export class steamMonitor extends plugin {
  constructor() {
    super({
      name: 'Steam状态监控服务',
      dsc: 'Steam用户状态变化监控和推送服务',
      event: 'message',
      priority: 1000,
      rule: [
        { reg: '^#steam启动监控$', fnc: 'startService' },
        { reg: '^#steam停止监控$', fnc: 'stopService' },
        { reg: '^#steam服务状态$', fnc: 'serviceStatus' },
        { reg: '^#steam检查状态$', fnc: 'manualCheck' }
      ]
    })
  }

  async startService(e) {
    try {
      if (!e.isMaster) {
        return await this.reply('只有主人才可以启动监控服务')
      }

      const success = monitorService.start()
      if (success) {
        return await this.reply('Steam状态监控服务已启动！\n\n系统将每30秒检查一次用户状态变化。')
      } else {
        return await this.reply('监控服务已在运行中')
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 启动监控服务失败: ${error.message}`)
      return await this.reply('启动失败，请稍后重试')
    }
  }

  async stopService(e) {
    try {
      if (!e.isMaster) {
        return await this.reply('只有主人才可以停止监控服务')
      }

      const success = monitorService.stop()
      if (success) {
        return await this.reply('Steam状态监控服务已停止！')
      } else {
        return await this.reply('监控服务未在运行')
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 停止监控服务失败: ${error.message}`)
      return await this.reply('停止失败，请稍后重试')
    }
  }

  async serviceStatus(e) {
    try {
      const status = monitorService.getStatus()
      const monitoringStats = SteamPushModel.getMonitoringStats()
      
      let msg = `🔧 Steam监控服务状态\n\n`
      msg += `服务运行: ${status.isRunning ? '🟢 是' : '🔴 否'}\n`
      msg += `检查间隔: ${status.checkInterval / 1000}秒\n`
      msg += `最后检查: ${status.lastCheck}\n`
      msg += `监控状态: ${monitoringStats.monitoring ? '🟢 开启' : '🔴 关闭'}\n`
      msg += `推送群数: ${monitoringStats.totalGroups}\n`
      msg += `推送用户: ${monitoringStats.totalUsers}\n`
      
      return await this.reply(msg)
    } catch (error) {
      logger.error(`[ESO:Steam] 查看服务状态失败: ${error.message}`)
      return await this.reply('查询失败，请稍后重试')
    }
  }

  async manualCheck(e) {
    try {
      const results = await monitorService.manualCheck()
      
      if (results.length === 0) {
        return await this.reply('没有找到绑定的用户')
      }

      let msg = `📊 Steam状态检查结果\n\n`
      msg += `检查时间: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n`
      msg += `绑定用户: ${results.length}人\n\n`

      const onlineUsers = results.filter(user => user.status > 0)
      const offlineUsers = results.filter(user => user.status === 0)

      if (onlineUsers.length > 0) {
        msg += `🟢 在线用户 (${onlineUsers.length}人):\n`
        for (const user of onlineUsers.slice(0, STEAM_MONITOR.MAX_DISPLAY_ONLINE)) {
          msg += `• ${user.steamName}`
          if (user.game) {
            msg += ` - 正在玩 ${user.game}`
          }
          msg += '\n'
        }
        if (onlineUsers.length > STEAM_MONITOR.MAX_DISPLAY_ONLINE) {
          msg += `... 还有 ${onlineUsers.length - STEAM_MONITOR.MAX_DISPLAY_ONLINE} 人在线\n`
        }
      }

      if (offlineUsers.length > 0) {
        msg += `\n🔴 离线用户 (${offlineUsers.length}人):\n`
        for (const user of offlineUsers.slice(0, STEAM_MONITOR.MAX_DISPLAY_OFFLINE)) {
          const lastOnline = moment.unix(user.lastOnline).format('MM-DD HH:mm')
          msg += `• ${user.steamName} - 最后在线: ${lastOnline}\n`
        }
        if (offlineUsers.length > STEAM_MONITOR.MAX_DISPLAY_OFFLINE) {
          msg += `... 还有 ${offlineUsers.length - STEAM_MONITOR.MAX_DISPLAY_OFFLINE} 人离线\n`
        }
      }

      return await this.reply(msg)
    } catch (error) {
      logger.error(`[ESO:Steam] 手动检查状态失败: ${error.message}`)
      return await this.reply('检查失败，请稍后重试')
    }
  }
}

// 导出监控服务实例，供其他模块使用
export { monitorService } 