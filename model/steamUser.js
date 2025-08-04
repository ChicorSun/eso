import fs from 'node:fs'
import path from 'node:path'
import moment from 'moment'

class SteamUserModel {
  constructor() {
    this.dbPath = './plugins/eso/custome_resources/steam/data/steam_users.json'
    this.users = this.loadUsers()
    // 数据迁移：将旧格式转换为新格式（异步执行）
    this.migrateData().catch(error => {
      console.error(`[ESO:Steam] 数据迁移失败: ${error.message}`)
    })
  }

  // 数据迁移：将旧格式转换为新格式
  async migrateData() {
    let migrated = false
    
    for (const [qqId, userData] of Object.entries(this.users)) {
      // 检查是否为旧格式（直接包含steamId字段）
      if (userData.steamId && !userData.bindings) {
        let avatarfull = userData.avatarfull || ''
        
        // 如果没有头像信息，尝试通过API获取
        if (!avatarfull) {
          try {
            // 动态导入Steam模块
            const Steam = (await import('./steam.js')).default
            const userInfo = await Steam.getUserInfo(userData.steamId)
            if (userInfo && userInfo.avatarfull) {
              avatarfull = userInfo.avatarfull
              
              // 尝试下载头像到本地缓存
              try {
                const fs = await import('node:fs')
                const path = await import('node:path')
                const avatarDir = './plugins/eso/custome_resources/steam/images/avatar'
                const avatarPath = path.join(avatarDir, `${userData.steamId}.jpg`)
                
                // 检查是否已有缓存
                if (!fs.existsSync(avatarPath)) {
                  // 创建目录
                  if (!fs.existsSync(avatarDir)) {
                    fs.mkdirSync(avatarDir, { recursive: true })
                  }
                  
                  // 下载头像
                  const response = await fetch(avatarfull)
                  if (response.ok) {
                    const buffer = await response.arrayBuffer()
                    fs.writeFileSync(avatarPath, Buffer.from(buffer))
                    console.log(`[ESO:Steam] 迁移时下载头像: ${userData.steamId}`)
                  }
                }
              } catch (downloadError) {
                console.error(`[ESO:Steam] 迁移时下载头像失败: ${downloadError.message}`)
              }
            }
          } catch (apiError) {
            console.error(`[ESO:Steam] 迁移时获取用户信息失败: ${apiError.message}`)
          }
        }
        
                 // 转换为新格式
         this.users[qqId] = {
           bindings: [{
             steamId: userData.steamId,
             steamName: userData.steamName || '',
             avatarfull: avatarfull,
             bindTime: userData.bindTime || moment().format('YYYY-MM-DD HH:mm:ss'),
             isBind: true, // 第一个绑定默认为当前绑定
             lastUpdate: userData.lastUpdate || moment().format('YYYY-MM-DD HH:mm:ss'),
             lastOnlineCheck: userData.lastOnlineCheck || 0, // 默认关闭在线推送
             lastGameCheck: userData.lastGameCheck || 1 // 默认开启游玩推送
           }]
         }
        migrated = true
      }
    }
    
    if (migrated) {
      this.saveUsers()
      console.log('[ESO:Steam] 数据格式迁移完成')
    }
  }

  // 加载用户数据
  loadUsers() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'))
        const users = data.users || {}
        
        // 确保每个用户都有当前绑定
        this.ensureCurrentBinding(users)
        
        return users
      }
      return {}
    } catch (error) {
      console.error(`[ESO:Steam] 加载用户数据失败: ${error.message}`)
      return {}
    }
  }

  // 确保每个用户都有当前绑定
  ensureCurrentBinding(users) {
    let needsSave = false
    
    for (const [qqId, userData] of Object.entries(users)) {
      // 兼容旧格式
      if (!userData.bindings) {
        continue
      }
      
      // 新格式：检查是否有当前绑定
      if (userData.bindings.length > 0) {
        const hasCurrentBind = userData.bindings.some(binding => binding.isBind)
        if (!hasCurrentBind) {
          // 如果没有当前绑定，将第一个设为当前绑定
          userData.bindings[0].isBind = true
          needsSave = true
          console.log(`[ESO:Steam] 为用户 ${qqId} 设置默认当前绑定`)
        }
      }
    }
    
    // 如果需要保存，立即保存
    if (needsSave) {
      try {
        const data = {
          users: users,
          lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss')
        }
        fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2))
        console.log('[ESO:Steam] 已修复用户绑定状态')
      } catch (error) {
        console.error(`[ESO:Steam] 保存修复后的用户数据失败: ${error.message}`)
      }
    }
  }

  // 保存用户数据
  saveUsers() {
    try {
      const dataDir = path.dirname(this.dbPath)
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
      }
      
      const data = {
        users: this.users,
        lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss')
      }
      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error(`[ESO:Steam] 保存用户数据失败: ${error.message}`)
    }
  }

  // 绑定Steam账户（支持多绑定）
  bindUser(qqId, steamId, steamName = '', avatarfull = '', keepCurrentBind = false) {
    try {
      const userId = qqId.toString()
      
             // 检查是否已被当前用户绑定（只检查用户自己的绑定）
       if (this.users[userId]) {
         if (this.users[userId].bindings) {
           // 新格式：检查bindings数组
           for (const binding of this.users[userId].bindings) {
             if (binding.steamId === steamId) {
               return { success: false, message: '您已经绑定过该Steam账户' }
             }
           }
         } else if (this.users[userId].steamId === steamId) {
           // 旧格式兼容
           return { success: false, message: '您已经绑定过该Steam账户' }
         }
       }

      // 初始化用户数据结构
      if (!this.users[userId]) {
        this.users[userId] = {
          bindings: []
        }
      }

      // 检查是否已经绑定过这个steamId
      const existingBindingIndex = this.users[userId].bindings.findIndex(
        binding => binding.steamId === steamId
      )

      if (existingBindingIndex >= 0) {
        // 如果已绑定，更新信息
        this.users[userId].bindings[existingBindingIndex].steamName = steamName
        if (avatarfull) {
          this.users[userId].bindings[existingBindingIndex].avatarfull = avatarfull
        }
        this.users[userId].bindings[existingBindingIndex].lastUpdate = moment().format('YYYY-MM-DD HH:mm:ss')
        
        // 如果不保持当前绑定，则切换到新绑定的
        if (!keepCurrentBind) {
          this.users[userId].bindings[existingBindingIndex].isBind = true
          
          // 将其他绑定设为非当前绑定
          this.users[userId].bindings.forEach((binding, index) => {
            if (index !== existingBindingIndex) {
              binding.isBind = false
            }
          })
        }
        
        return { 
          success: true, 
          message: '绑定成功（已存在）',
          isNewBinding: false,
          bindingIndex: existingBindingIndex
        }
      } else {
        // 新绑定
        const isFirstBinding = this.users[userId].bindings.length === 0
        
        // 如果不保持当前绑定，将现有绑定设为非当前绑定
        if (!keepCurrentBind) {
          this.users[userId].bindings.forEach(binding => {
            binding.isBind = false
          })
        }
        
        // 添加新绑定
        this.users[userId].bindings.push({
          steamId,
          steamName,
          avatarfull,
          bindTime: moment().format('YYYY-MM-DD HH:mm:ss'),
          lastUpdate: moment().format('YYYY-MM-DD HH:mm:ss'),
          isBind: isFirstBinding || !keepCurrentBind, // 第一个绑定默认为当前绑定，或者不保持当前绑定时设为当前绑定
          lastOnlineCheck: 0, // 默认关闭在线推送
          lastGameCheck: 1 // 默认开启游玩推送
        })
        
        const newBindingIndex = this.users[userId].bindings.length - 1

        this.saveUsers()
        return { 
          success: true, 
          message: '绑定成功',
          isNewBinding: true,
          bindingIndex: newBindingIndex
        }
      }
    } catch (error) {
      console.error(`[ESO:Steam] 绑定用户失败: ${error.message}`)
      return { success: false, message: '绑定失败' }
    }
  }

  // 切换绑定
  switchBinding(qqId, index) {
    try {
      const userId = qqId.toString()
      
      if (!this.users[userId] || !this.users[userId].bindings) {
        return { success: false, message: '用户未绑定任何Steam账户' }
      }

      const bindings = this.users[userId].bindings
      if (index < 0 || index >= bindings.length) {
        return { success: false, message: '无效的绑定索引' }
      }

      // 切换绑定
      bindings.forEach((binding, i) => {
        binding.isBind = (i === index)
      })
      
      this.saveUsers()
      
      return { 
        success: true, 
        message: `已切换到绑定 ${index + 1}`,
        steamId: bindings[index].steamId
      }
    } catch (error) {
      console.error(`[ESO:Steam] 切换绑定失败: ${error.message}`)
      return { success: false, message: '切换绑定失败' }
    }
  }

  // 解绑Steam账户
  unbindUser(qqId, steamId = null, index = null) {
    try {
      const userId = qqId.toString()
      
      if (!this.users[userId]) {
        return { success: false, message: '用户未绑定任何Steam账户' }
      }

      // 兼容旧格式
      if (!this.users[userId].bindings) {
        if (steamId && this.users[userId].steamId !== steamId) {
          return { success: false, message: 'Steam ID不匹配' }
        }
        delete this.users[userId]
        this.saveUsers()
        return { success: true, message: '解绑成功' }
      }

      const bindings = this.users[userId].bindings
      let targetIndex = -1

      if (index !== null) {
        // 通过索引解绑
        if (index < 0 || index >= bindings.length) {
          return { success: false, message: '无效的绑定索引' }
        }
        targetIndex = index
      } else if (steamId) {
        // 通过steamId解绑
        targetIndex = bindings.findIndex(binding => binding.steamId === steamId)
        if (targetIndex === -1) {
          return { success: false, message: '未找到指定的Steam绑定' }
        }
      } else {
        return { success: false, message: '请指定要解绑的Steam ID或索引' }
      }

      const targetSteamId = bindings[targetIndex].steamId
      const wasCurrentBind = bindings[targetIndex].isBind

      // 删除绑定
      bindings.splice(targetIndex, 1)

      // 如果删除的是当前绑定，且还有其他绑定，则切换到第一个
      if (wasCurrentBind && bindings.length > 0) {
        bindings[0].isBind = true
      }

      // 如果没有绑定了，删除用户数据
      if (bindings.length === 0) {
        delete this.users[userId]
      }

      this.saveUsers()
      return { success: true, message: `已解绑 ${targetSteamId}` }
    } catch (error) {
      console.error(`[ESO:Steam] 解绑用户失败: ${error.message}`)
      return { success: false, message: '解绑失败' }
    }
  }

  // 获取用户当前绑定的Steam账户
  getUserSteamId(qqId) {
    const userId = qqId.toString()
    
    if (!this.users[userId]) return null
    
    // 兼容旧格式
    if (!this.users[userId].bindings) {
      return this.users[userId].steamId
    }
    
    // 新格式：获取当前绑定的steamId
    const currentBinding = this.users[userId].bindings.find(binding => binding.isBind)
    return currentBinding ? currentBinding.steamId : null
  }

  // 获取用户所有绑定信息
  getAllBindings(qqId) {
    const userId = qqId.toString()
    
    if (!this.users[userId]) return []
    
         // 兼容旧格式
     if (!this.users[userId].bindings) {
       return [{
         steamId: this.users[userId].steamId,
         steamName: this.users[userId].steamName || '',
         bindTime: this.users[userId].bindTime,
         lastUpdate: this.users[userId].lastUpdate,
         isBind: true, // 旧格式只有一个绑定，默认为当前绑定
         lastOnlineCheck: this.users[userId].lastOnlineCheck || 0,
         lastGameCheck: this.users[userId].lastGameCheck || 1
       }]
     }
    
    return this.users[userId].bindings
  }

  // 获取用户绑定信息
  getUserInfo(qqId) {
    const userId = qqId.toString()
    
    if (!this.users[userId]) return null
    
    // 兼容旧格式
    if (!this.users[userId].bindings) {
      return this.users[userId]
    }
    
    // 新格式：返回当前绑定的信息
    const currentBinding = this.users[userId].bindings.find(binding => binding.isBind)
    if (!currentBinding) return null
    
    return {
      ...this.users[userId],
      steamId: currentBinding.steamId,
      steamName: currentBinding.steamName,
      bindTime: currentBinding.bindTime,
      lastUpdate: currentBinding.lastUpdate
    }
  }

  // 根据Steam ID获取用户
  getUserBySteamId(steamId) {
    for (const [userId, userData] of Object.entries(this.users)) {
      // 兼容旧格式
      if (!userData.bindings) {
        if (userData.steamId === steamId) {
          return { qqId: userId, ...userData }
        }
        continue
      }
      
      // 新格式：检查bindings数组
      for (const binding of userData.bindings) {
        if (binding.steamId === steamId) {
          return { 
            qqId: userId, 
            ...userData,
            steamId: binding.steamId,
            steamName: binding.steamName,
            bindTime: binding.bindTime,
            lastUpdate: binding.lastUpdate
          }
        }
      }
    }
    return null
  }

  // 获取所有绑定用户
  getAllUsers() {
    return this.users
  }

  // 获取用户列表（用于显示）
  getUserList() {
    const userList = []
    for (const [qqId, userData] of Object.entries(this.users)) {
      // 兼容旧格式
      if (!userData.bindings) {
        userList.push({
          qqId,
          steamId: userData.steamId,
          steamName: userData.steamName,
          bindTime: userData.bindTime,
          lastUpdate: userData.lastUpdate
        })
        continue
      }
      
      // 新格式：只显示当前绑定的
      const currentBinding = userData.bindings.find(binding => binding.isBind)
      if (currentBinding) {
        userList.push({
          qqId,
          steamId: currentBinding.steamId,
          steamName: currentBinding.steamName,
          bindTime: currentBinding.bindTime,
          lastUpdate: currentBinding.lastUpdate
        })
      }
    }
    return userList
  }

  // 更新用户信息
  updateUserInfo(qqId, steamName) {
    try {
      const userId = qqId.toString()
      if (!this.users[userId]) return false
      
      // 兼容旧格式
      if (!this.users[userId].bindings) {
        this.users[userId].steamName = steamName
        this.users[userId].lastUpdate = moment().format('YYYY-MM-DD HH:mm:ss')
        this.saveUsers()
        return true
      }
      
      // 新格式：更新当前绑定的信息
      const currentBinding = this.users[userId].bindings.find(binding => binding.isBind)
      if (currentBinding) {
        currentBinding.steamName = steamName
        currentBinding.lastUpdate = moment().format('YYYY-MM-DD HH:mm:ss')
        this.saveUsers()
        return true
      }
      
      return false
    } catch (error) {
      console.error(`[ESO:Steam] 更新用户信息失败: ${error.message}`)
      return false
    }
  }

  // 更新用户在线状态检查时间
  updateOnlineCheckTime(qqId, steamId) {
    try {
      const userId = qqId.toString()
      if (!this.users[userId] || !this.users[userId].bindings) {
        return false
      }
      
      const binding = this.users[userId].bindings.find(b => b.steamId === steamId)
      if (binding) {
        binding.lastOnlineCheck = moment().format('YYYY-MM-DD HH:mm:ss')
        this.saveUsers()
        return true
      }
      return false
    } catch (error) {
      console.error(`[ESO:Steam] 更新在线检查时间失败: ${error.message}`)
      return false
    }
  }

  // 更新用户游戏检查时间
  updateGameCheckTime(qqId, steamId) {
    try {
      const userId = qqId.toString()
      if (!this.users[userId] || !this.users[userId].bindings) {
        return false
      }
      
      const binding = this.users[userId].bindings.find(b => b.steamId === steamId)
      if (binding) {
        binding.lastGameCheck = moment().format('YYYY-MM-DD HH:mm:ss')
        this.saveUsers()
        return true
      }
      return false
    } catch (error) {
      console.error(`[ESO:Steam] 更新游戏检查时间失败: ${error.message}`)
      return false
    }
  }

  // 检查用户是否已绑定
  isUserBound(qqId) {
    const userId = qqId.toString()
    if (!this.users[userId]) return false
    
    // 兼容旧格式
    if (!this.users[userId].bindings) {
      return !!this.users[userId].steamId
    }
    
    // 新格式：检查是否有绑定
    return this.users[userId].bindings.length > 0
  }

  // 获取绑定统计
  getBindStats() {
    let totalUsers = 0
    let totalBindings = 0
    let todayBinds = 0
    let thisWeekBinds = 0
    let thisMonthBinds = 0

    for (const [qqId, userData] of Object.entries(this.users)) {
      // 兼容旧格式
      if (!userData.bindings) {
        totalUsers++
        totalBindings++
        if (moment(userData.bindTime).isSame(moment(), 'day')) todayBinds++
        if (moment(userData.bindTime).isSame(moment(), 'week')) thisWeekBinds++
        if (moment(userData.bindTime).isSame(moment(), 'month')) thisMonthBinds++
        continue
      }
      
      // 新格式
      totalUsers++
      totalBindings += userData.bindings.length
      
      for (const binding of userData.bindings) {
        if (moment(binding.bindTime).isSame(moment(), 'day')) todayBinds++
        if (moment(binding.bindTime).isSame(moment(), 'week')) thisWeekBinds++
        if (moment(binding.bindTime).isSame(moment(), 'month')) thisMonthBinds++
      }
    }

    return {
      total: totalUsers,
      totalBindings,
      today: todayBinds,
      thisWeek: thisWeekBinds,
      thisMonth: thisMonthBinds
    }
  }

  // 清理过期绑定（超过30天未更新的）
  cleanExpiredBindings() {
    try {
      const thirtyDaysAgo = moment().subtract(30, 'days')
      let cleanedCount = 0
      
      for (const [qqId, userData] of Object.entries(this.users)) {
        // 兼容旧格式
        if (!userData.bindings) {
          const lastUpdate = moment(userData.lastUpdate)
          if (lastUpdate.isBefore(thirtyDaysAgo)) {
            delete this.users[qqId]
            cleanedCount++
          }
          continue
        }
        
                 // 新格式：清理过期的绑定
         const originalLength = userData.bindings.length
         userData.bindings = userData.bindings.filter(binding => {
           const lastUpdate = moment(binding.lastUpdate)
           return !lastUpdate.isBefore(thirtyDaysAgo)
         })
         
         if (userData.bindings.length < originalLength) {
           cleanedCount += (originalLength - userData.bindings.length)
           
           // 如果没有绑定了，删除用户数据
           if (userData.bindings.length === 0) {
             delete this.users[qqId]
           } else {
                         // 确保有当前绑定
            const hasCurrentBind = userData.bindings.some(binding => binding.isBind)
            if (!hasCurrentBind && userData.bindings.length > 0) {
              userData.bindings[0].isBind = true
            }
           }
         }
      }
      
      if (cleanedCount > 0) {
        this.saveUsers()
        console.log(`[ESO:Steam] 清理了 ${cleanedCount} 个过期绑定`)
      }
      
      return cleanedCount
    } catch (error) {
      console.error(`[ESO:Steam] 清理过期绑定失败: ${error.message}`)
      return 0
    }
  }

  // 获取用户活跃度统计
  getActivityStats() {
    const now = moment()
    let totalUsers = 0
    let activeUsers = 0

    for (const [qqId, userData] of Object.entries(this.users)) {
      totalUsers++
      
      // 兼容旧格式
      if (!userData.bindings) {
        if (userData.lastOnlineCheck) {
          const lastCheck = moment(userData.lastOnlineCheck)
          if (lastCheck.isAfter(now.clone().subtract(7, 'days'))) {
            activeUsers++
          }
        }
        continue
      }
      
      // 新格式：检查当前绑定的活跃度
      const currentBinding = userData.bindings.find(binding => binding.isBind)
      if (currentBinding && currentBinding.lastOnlineCheck) {
        const lastCheck = moment(currentBinding.lastOnlineCheck)
        if (lastCheck.isAfter(now.clone().subtract(7, 'days'))) {
          activeUsers++
        }
      }
    }

    return {
      total: totalUsers,
      active: activeUsers,
      inactive: totalUsers - activeUsers
    }
  }

  // 更新绑定信息的头像URL
  updateBindingAvatar(qqId, steamId, avatarfull) {
    try {
      const userId = qqId.toString()
      if (!this.users[userId] || !this.users[userId].bindings) {
        return false
      }
      
      const binding = this.users[userId].bindings.find(b => b.steamId === steamId)
      if (binding) {
        binding.avatarfull = avatarfull
        binding.lastUpdate = moment().format('YYYY-MM-DD HH:mm:ss')
        this.saveUsers()
        return true
      }
      
      return false
    } catch (error) {
      console.error(`[ESO:Steam] 更新绑定头像失败: ${error.message}`)
      return false
    }
  }

  // 更新绑定信息的游玩推送状态
  updateBindingGameCheck(qqId, steamId, enabled) {
    try {
      const userId = qqId.toString()
      if (!this.users[userId] || !this.users[userId].bindings) {
        return false
      }
      
      const binding = this.users[userId].bindings.find(b => b.steamId === steamId)
      if (binding) {
        binding.lastGameCheck = enabled
        binding.lastUpdate = moment().format('YYYY-MM-DD HH:mm:ss')
        this.saveUsers()
        return true
      }
      
      return false
    } catch (error) {
      console.error(`[ESO:Steam] 更新绑定游玩推送失败: ${error.message}`)
      return false
    }
  }

  // 更新绑定信息的在线推送状态
  updateBindingOnlineCheck(qqId, steamId, enabled) {
    try {
      const userId = qqId.toString()
      if (!this.users[userId] || !this.users[userId].bindings) {
        return false
      }
      
      const binding = this.users[userId].bindings.find(b => b.steamId === steamId)
      if (binding) {
        binding.lastOnlineCheck = enabled
        binding.lastUpdate = moment().format('YYYY-MM-DD HH:mm:ss')
        this.saveUsers()
        return true
      }
      
      return false
    } catch (error) {
      console.error(`[ESO:Steam] 更新绑定在线推送失败: ${error.message}`)
      return false
    }
  }

  // 批量更新用户信息
  batchUpdateUserInfo(updates) {
    try {
      let updatedCount = 0
      
      for (const update of updates) {
        const { qqId, steamName } = update
        if (this.updateUserInfo(qqId, steamName)) {
          updatedCount++
        }
      }
      
      return updatedCount
    } catch (error) {
      console.error(`[ESO:Steam] 批量更新用户信息失败: ${error.message}`)
      return 0
    }
  }
}

export default new SteamUserModel() 