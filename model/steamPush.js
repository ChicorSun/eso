import fs from 'node:fs'
import path from 'node:path'
import moment from 'moment'

class SteamPushModel {
  constructor() {
    this.pushPath = './plugins/eso/custome_resources/config/steam_push.json'
    this.onlineStatusPath = './plugins/eso/custome_resources/config/steam_online_status.json'
    this.pushSettings = this.loadPushSettings()
    this.onlineStatus = this.loadOnlineStatus()
    this.monitoring = false
  }

  // 加载推送设置
  loadPushSettings() {
    try {
      if (fs.existsSync(this.pushPath)) {
        const data = JSON.parse(fs.readFileSync(this.pushPath, 'utf8'))
        return data.settings || {}
      }
      return {}
    } catch (error) {
      logger.error(`[ESO:Steam] 加载推送设置失败: ${error.message}`)
      return {}
    }
  }

  // 保存推送设置
  savePushSettings() {
    try {
      const data = {
        settings: this.pushSettings,
        lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss')
      }
      fs.writeFileSync(this.pushPath, JSON.stringify(data, null, 2))
    } catch (error) {
      logger.error(`[ESO:Steam] 保存推送设置失败: ${error.message}`)
    }
  }

  // 加载在线状态
  loadOnlineStatus() {
    try {
      if (fs.existsSync(this.onlineStatusPath)) {
        const data = JSON.parse(fs.readFileSync(this.onlineStatusPath, 'utf8'))
        return data.status || {}
      }
      return {}
    } catch (error) {
      logger.error(`[ESO:Steam] 加载在线状态失败: ${error.message}`)
      return {}
    }
  }

  // 保存在线状态
  saveOnlineStatus() {
    try {
      const data = {
        status: this.onlineStatus,
        lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss')
      }
      fs.writeFileSync(this.onlineStatusPath, JSON.stringify(data, null, 2))
    } catch (error) {
      logger.error(`[ESO:Steam] 保存在线状态失败: ${error.message}`)
    }
  }

  // 设置群推送开关
  setGroupPush(groupId, enabled) {
    try {
      const groupKey = groupId.toString()
      this.pushSettings[groupKey] = {
        enabled,
        lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss')
      }
      this.savePushSettings()
      return true
    } catch (error) {
      logger.error(`[ESO:Steam] 设置群推送失败: ${error.message}`)
      return false
    }
  }

  // 获取群推送状态
  getGroupPushStatus(groupId) {
    const groupKey = groupId.toString()
    return this.pushSettings[groupKey] ? this.pushSettings[groupKey].enabled : false
  }

  // 设置用户推送开关
  setUserPush(userId, steamId, type, enabled) {
    try {
      const userKey = `${userId}_${steamId}`
      if (!this.pushSettings[userKey]) {
        this.pushSettings[userKey] = {
          userId: userId.toString(),
          steamId,
          types: {
            play: true,  // 默认开启游玩推送
            state: true   // 默认开启状态推送
          }
        }
      }
      
      this.pushSettings[userKey].types[type] = enabled
      this.pushSettings[userKey].lastUpdate = moment().format('YYYY-MM-DD HH:mm:ss')
      this.savePushSettings()
      return true
    } catch (error) {
      logger.error(`[ESO:Steam] 设置用户推送失败: ${error.message}`)
      return false
    }
  }

  // 获取用户推送状态
  getUserPushStatus(userId, steamId, type) {
    const userKey = `${userId}_${steamId}`
    if (this.pushSettings[userKey] && this.pushSettings[userKey].types) {
      return this.pushSettings[userKey].types[type] !== undefined ? this.pushSettings[userKey].types[type] : true
    }
    // 如果用户没有配置过推送设置，默认开启游玩推送和状态推送
    return type === 'play' || type === 'state'
  }

  // 设置游玩推送开关
  setPlayPush(userId, steamId, enabled) {
    return this.setUserPush(userId, steamId, 'play', enabled)
  }

  // 获取游玩推送状态
  getPlayPushStatus(userId, steamId) {
    return this.getUserPushStatus(userId, steamId, 'play')
  }

  // 设置状态推送开关
  setStatePush(userId, steamId, enabled) {
    return this.setUserPush(userId, steamId, 'state', enabled)
  }

  // 获取状态推送状态
  getStatePushStatus(userId, steamId) {
    return this.getUserPushStatus(userId, steamId, 'state')
  }

  // 更新在线状态
  updateOnlineStatus(steamId, status) {
    try {
      this.onlineStatus[steamId] = {
        ...status,
        lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss')
      }
      this.saveOnlineStatus()
    } catch (error) {
      logger.error(`[ESO:Steam] 更新在线状态失败: ${error.message}`)
    }
  }

  // 获取在线状态
  getOnlineStatus(steamId) {
    return this.onlineStatus[steamId] || null
  }

  // 检查状态是否发生变化
  hasStatusChanged(steamId, newStatus) {
    const oldStatus = this.getOnlineStatus(steamId)
    if (!oldStatus) {
      return true
    }

    // 检查在线状态变化
    if (oldStatus.personastate !== newStatus.personastate) {
      return true
    }

    // 检查游戏状态变化
    if (oldStatus.gameextrainfo !== newStatus.gameextrainfo) {
      return true
    }

    return false
  }

  // 获取需要推送的群列表
  getPushGroups() {
    const groups = []
    for (const [groupId, settings] of Object.entries(this.pushSettings)) {
      if (settings.enabled && !groupId.includes('_')) {
        groups.push(groupId)
      }
    }
    return groups
  }

  // 获取需要推送的用户列表
  getPushUsers(type) {
    const users = []
    for (const [key, settings] of Object.entries(this.pushSettings)) {
      if (key.includes('_') && settings.types && settings.types[type]) {
        users.push({
          userId: settings.userId,
          steamId: settings.steamId
        })
      }
    }
    return users
  }

  // 开始监控
  startMonitoring() {
    if (this.monitoring) {
      return false
    }
    this.monitoring = true
    logger.info('[ESO:Steam] 开始监控Steam在线状态')
    return true
  }

  // 停止监控
  stopMonitoring() {
    this.monitoring = false
    logger.info('[ESO:Steam] 停止监控Steam在线状态')
  }

  // 检查是否正在监控
  isMonitoring() {
    return this.monitoring
  }

  // 设置监控状态
  setMonitoring(enabled) {
    if (enabled) {
      return this.startMonitoring()
    } else {
      this.stopMonitoring()
      return true
    }
  }

  // 获取监控统计
  getMonitoringStats() {
    const totalGroups = this.getPushGroups().length
    const playPushUsers = this.getPushUsers('play').length
    const statePushUsers = this.getPushUsers('state').length
    const onlineUsers = Object.keys(this.onlineStatus).length

    return {
      totalGroups,
      totalUsers: playPushUsers + statePushUsers,
      playPushUsers,
      statePushUsers,
      onlineUsers,
      monitoring: this.monitoring
    }
  }

  // 清理过期数据
  cleanupOldData() {
    try {
      const cutoffTime = moment().subtract(7, 'days')
      
      // 清理推送设置中的过期数据
      for (const [key, settings] of Object.entries(this.pushSettings)) {
        if (settings.lastUpdate && moment(settings.lastUpdate).isBefore(cutoffTime)) {
          delete this.pushSettings[key]
        }
      }
      
      // 清理在线状态中的过期数据
      for (const [steamId, status] of Object.entries(this.onlineStatus)) {
        if (status.lastUpdate && moment(status.lastUpdate).isBefore(cutoffTime)) {
          delete this.onlineStatus[steamId]
        }
      }
      
      this.savePushSettings()
      this.saveOnlineStatus()
      
      logger.info('[ESO:Steam] 清理过期数据完成')
    } catch (error) {
      logger.error(`[ESO:Steam] 清理过期数据失败: ${error.message}`)
    }
  }
}

export default new SteamPushModel() 