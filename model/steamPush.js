import fs from 'node:fs'
import path from 'node:path'
import moment from 'moment'

class SteamPushModel {
  constructor() {
    this.pushPath = './plugins/eso/custome_resources/steam/data/steam_push.json'
    this.onlineStatusPath = './plugins/eso/custome_resources/steam/data/steam_online_status.json'
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
      console.error(`[ESO:Steam] 加载推送设置失败: ${error.message}`)
      return {}
    }
  }

  // 保存推送设置
  savePushSettings() {
    try {
      const dataDir = path.dirname(this.pushPath)
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
      }
      
      const data = {
        settings: this.pushSettings,
        lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss')
      }
      fs.writeFileSync(this.pushPath, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error(`[ESO:Steam] 保存推送设置失败: ${error.message}`)
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
      console.error(`[ESO:Steam] 加载在线状态失败: ${error.message}`)
      return {}
    }
  }

  // 保存在线状态
  saveOnlineStatus() {
    try {
      const dataDir = path.dirname(this.onlineStatusPath)
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
      }
      
      const data = {
        status: this.onlineStatus,
        lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss')
      }
      fs.writeFileSync(this.onlineStatusPath, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error(`[ESO:Steam] 保存在线状态失败: ${error.message}`)
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
      console.error(`[ESO:Steam] 设置群推送失败: ${error.message}`)
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
            play: true,      // 默认开启游玩推送
            state: true,     // 默认开启状态推送
            inventory: false, // 默认关闭库存推送
            wishlist: false   // 默认关闭愿望单推送
          },
          groups: [],
          lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss')
        }
      }
      
      this.pushSettings[userKey].types[type] = enabled
      this.pushSettings[userKey].lastUpdate = moment().format('YYYY-MM-DD HH:mm:ss')
      this.savePushSettings()
      return true
    } catch (error) {
      console.error(`[ESO:Steam] 设置用户推送失败: ${error.message}`)
      return false
    }
  }

  // 获取用户推送状态
  getUserPushStatus(userId, steamId, type) {
    const userKey = `${userId}_${steamId}`
    if (this.pushSettings[userKey] && this.pushSettings[userKey].types) {
      return this.pushSettings[userKey].types[type] || false
    }
    return false
  }

  // 设置游玩推送
  setPlayPush(userId, steamId, enabled) {
    return this.setUserPush(userId, steamId, 'play', enabled)
  }

  // 获取游玩推送状态
  getPlayPushStatus(userId, steamId) {
    return this.getUserPushStatus(userId, steamId, 'play')
  }

  // 设置状态推送
  setStatePush(userId, steamId, enabled) {
    return this.setUserPush(userId, steamId, 'state', enabled)
  }

  // 获取状态推送状态
  getStatePushStatus(userId, steamId) {
    return this.getUserPushStatus(userId, steamId, 'state')
  }

  // 设置库存推送
  setInventoryPush(userId, steamId, enabled) {
    return this.setUserPush(userId, steamId, 'inventory', enabled)
  }

  // 获取库存推送状态
  getInventoryPushStatus(userId, steamId) {
    return this.getUserPushStatus(userId, steamId, 'inventory')
  }

  // 设置愿望单推送
  setWishlistPush(userId, steamId, enabled) {
    return this.setUserPush(userId, steamId, 'wishlist', enabled)
  }

  // 获取愿望单推送状态
  getWishlistPushStatus(userId, steamId) {
    return this.getUserPushStatus(userId, steamId, 'wishlist')
  }

  // 添加推送群组
  addPushGroup(userId, steamId, groupId) {
    try {
      const userKey = `${userId}_${steamId}`
      if (!this.pushSettings[userKey]) {
        this.pushSettings[userKey] = {
          userId: userId.toString(),
          steamId,
          types: {
            play: true,
            state: true,
            inventory: false,
            wishlist: false
          },
          groups: [],
          lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss')
        }
      }
      
      const groupIdStr = groupId.toString()
      if (!this.pushSettings[userKey].groups.includes(groupIdStr)) {
        this.pushSettings[userKey].groups.push(groupIdStr)
        this.pushSettings[userKey].lastUpdate = moment().format('YYYY-MM-DD HH:mm:ss')
        this.savePushSettings()
      }
      return true
    } catch (error) {
      console.error(`[ESO:Steam] 添加推送群组失败: ${error.message}`)
      return false
    }
  }

  // 移除推送群组
  removePushGroup(userId, steamId, groupId) {
    try {
      const userKey = `${userId}_${steamId}`
      if (this.pushSettings[userKey] && this.pushSettings[userKey].groups) {
        const groupIdStr = groupId.toString()
        const index = this.pushSettings[userKey].groups.indexOf(groupIdStr)
        if (index > -1) {
          this.pushSettings[userKey].groups.splice(index, 1)
          this.pushSettings[userKey].lastUpdate = moment().format('YYYY-MM-DD HH:mm:ss')
          this.savePushSettings()
        }
      }
      return true
    } catch (error) {
      console.error(`[ESO:Steam] 移除推送群组失败: ${error.message}`)
      return false
    }
  }

  // 获取用户推送群组
  getUserPushGroups(userId, steamId) {
    const userKey = `${userId}_${steamId}`
    return this.pushSettings[userKey] ? this.pushSettings[userKey].groups || [] : []
  }

  // 更新在线状态
  updateOnlineStatus(steamId, status) {
    try {
      this.onlineStatus[steamId] = {
        ...status,
        lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss')
      }
      this.saveOnlineStatus()
      return true
    } catch (error) {
      console.error(`[ESO:Steam] 更新在线状态失败: ${error.message}`)
      return false
    }
  }

  // 获取在线状态
  getOnlineStatus(steamId) {
    return this.onlineStatus[steamId] || null
  }

  // 检查状态是否发生变化
  hasStatusChanged(steamId, newStatus) {
    const oldStatus = this.getOnlineStatus(steamId)
    if (!oldStatus) return true
    
    // 检查关键状态字段
    const keyFields = ['personastate', 'gameid', 'gameextrainfo']
    for (const field of keyFields) {
      if (oldStatus[field] !== newStatus[field]) {
        return true
      }
    }
    
    return false
  }

  // 获取所有开启推送的群组
  getPushGroups() {
    const groups = []
    for (const [groupId, settings] of Object.entries(this.pushSettings)) {
      if (settings.enabled && !groupId.includes('_')) {
        groups.push(groupId)
      }
    }
    return groups
  }

  // 获取指定类型的推送用户
  getPushUsers(type) {
    const users = []
    for (const [key, settings] of Object.entries(this.pushSettings)) {
      if (key.includes('_') && settings.types && settings.types[type]) {
        users.push({
          userId: settings.userId,
          steamId: settings.steamId,
          groups: settings.groups || []
        })
      }
    }
    return users
  }

  // 开始监控
  startMonitoring() {
    this.monitoring = true
    console.log('[ESO:Steam] 开始监控Steam状态')
  }

  // 停止监控
  stopMonitoring() {
    this.monitoring = false
    console.log('[ESO:Steam] 停止监控Steam状态')
  }

  // 检查是否正在监控
  isMonitoring() {
    return this.monitoring
  }

  // 设置监控状态
  setMonitoring(enabled) {
    this.monitoring = enabled
    return this.monitoring
  }

  // 获取监控统计
  getMonitoringStats() {
    const totalUsers = Object.keys(this.onlineStatus).length
    const onlineUsers = Object.values(this.onlineStatus).filter(status => 
      status.personastate > 0
    ).length
    const gamingUsers = Object.values(this.onlineStatus).filter(status => 
      status.gameid && status.gameid !== '0'
    ).length

    return {
      total: totalUsers,
      online: onlineUsers,
      gaming: gamingUsers,
      monitoring: this.monitoring
    }
  }

  // 清理旧数据
  cleanupOldData() {
    try {
      const thirtyDaysAgo = moment().subtract(30, 'days')
      let cleanedCount = 0
      
      // 清理推送设置
      for (const [key, settings] of Object.entries(this.pushSettings)) {
        if (settings.lastUpdate) {
          const lastUpdate = moment(settings.lastUpdate)
          if (lastUpdate.isBefore(thirtyDaysAgo)) {
            delete this.pushSettings[key]
            cleanedCount++
          }
        }
      }
      
      // 清理在线状态
      for (const [steamId, status] of Object.entries(this.onlineStatus)) {
        if (status.lastUpdate) {
          const lastUpdate = moment(status.lastUpdate)
          if (lastUpdate.isBefore(thirtyDaysAgo)) {
            delete this.onlineStatus[steamId]
            cleanedCount++
          }
        }
      }
      
      if (cleanedCount > 0) {
        this.savePushSettings()
        this.saveOnlineStatus()
        console.log(`[ESO:Steam] 清理了 ${cleanedCount} 条旧数据`)
      }
      
      return cleanedCount
    } catch (error) {
      console.error(`[ESO:Steam] 清理旧数据失败: ${error.message}`)
      return 0
    }
  }

  // 获取推送统计
  getPushStats() {
    const stats = {
      totalGroups: 0,
      totalUsers: 0,
      playPush: 0,
      statePush: 0,
      inventoryPush: 0,
      wishlistPush: 0
    }
    
    for (const [key, settings] of Object.entries(this.pushSettings)) {
      if (!key.includes('_')) {
        // 群组设置
        if (settings.enabled) {
          stats.totalGroups++
        }
      } else {
        // 用户设置
        stats.totalUsers++
        if (settings.types) {
          if (settings.types.play) stats.playPush++
          if (settings.types.state) stats.statePush++
          if (settings.types.inventory) stats.inventoryPush++
          if (settings.types.wishlist) stats.wishlistPush++
        }
      }
    }
    
    return stats
  }
}

export default new SteamPushModel() 