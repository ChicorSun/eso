import fs from 'node:fs'
import path from 'node:path'
import moment from 'moment'

class SteamUserModel {
  constructor() {
    this.dbPath = './plugins/eso/custome_resources/config/steam_users.json'
    this.users = this.loadUsers()
  }

  // 加载用户数据
  loadUsers() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'))
        return data.users || {}
      }
      return {}
    } catch (error) {
      logger.error(`[ESO:Steam] 加载用户数据失败: ${error.message}`)
      return {}
    }
  }

  // 保存用户数据
  saveUsers() {
    try {
      const data = {
        users: this.users,
        lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss')
      }
      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2))
    } catch (error) {
      logger.error(`[ESO:Steam] 保存用户数据失败: ${error.message}`)
    }
  }

  // 绑定Steam账户
  bindUser(qqId, steamId, steamName = '') {
    try {
      // 检查是否已被其他用户绑定
      for (const [userId, userData] of Object.entries(this.users)) {
        if (userData.steamId === steamId && userId !== qqId.toString()) {
          return { success: false, message: '该Steam账户已被其他用户绑定' }
        }
      }

      // 添加或更新绑定
      this.users[qqId.toString()] = {
        steamId,
        steamName,
        bindTime: moment().format('YYYY-MM-DD HH:mm:ss'),
        lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss')
      }

      this.saveUsers()
      return { success: true, message: '绑定成功' }
    } catch (error) {
      logger.error(`[ESO:Steam] 绑定用户失败: ${error.message}`)
      return { success: false, message: '绑定失败' }
    }
  }

  // 解绑Steam账户
  unbindUser(qqId, steamId = null) {
    try {
      const userId = qqId.toString()
      
      if (!this.users[userId]) {
        return { success: false, message: '用户未绑定任何Steam账户' }
      }

      if (steamId && this.users[userId].steamId !== steamId) {
        return { success: false, message: 'Steam ID不匹配' }
      }

      delete this.users[userId]
      this.saveUsers()
      return { success: true, message: '解绑成功' }
    } catch (error) {
      logger.error(`[ESO:Steam] 解绑用户失败: ${error.message}`)
      return { success: false, message: '解绑失败' }
    }
  }

  // 获取用户绑定的Steam账户
  getUserSteamId(qqId) {
    const userId = qqId.toString()
    return this.users[userId] ? this.users[userId].steamId : null
  }

  // 获取用户绑定信息
  getUserInfo(qqId) {
    const userId = qqId.toString()
    return this.users[userId] || null
  }

  // 根据Steam ID获取用户
  getUserBySteamId(steamId) {
    for (const [userId, userData] of Object.entries(this.users)) {
      if (userData.steamId === steamId) {
        return { qqId: userId, ...userData }
      }
    }
    return null
  }

  // 获取所有绑定用户
  getAllUsers() {
    return this.users
  }

  // 更新用户信息
  updateUserInfo(qqId, steamName) {
    try {
      const userId = qqId.toString()
      if (this.users[userId]) {
        this.users[userId].steamName = steamName
        this.users[userId].lastUpdate = moment().format('YYYY-MM-DD HH:mm:ss')
        this.saveUsers()
        return true
      }
      return false
    } catch (error) {
      logger.error(`[ESO:Steam] 更新用户信息失败: ${error.message}`)
      return false
    }
  }

  // 检查用户是否已绑定
  isUserBound(qqId) {
    const userId = qqId.toString()
    return !!this.users[userId]
  }

  // 获取绑定统计
  getBindStats() {
    const totalUsers = Object.keys(this.users).length
    const todayBinds = Object.values(this.users).filter(user => {
      return moment(user.bindTime).isSame(moment(), 'day')
    }).length

    return {
      total: totalUsers,
      today: todayBinds
    }
  }
}

export default new SteamUserModel() 