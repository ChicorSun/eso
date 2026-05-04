import fs from 'node:fs'
import path from 'node:path'

/**
 * ESO账号绑定数据模型
 * 管理用户的ESO游戏账号绑定关系，支持主账号切换
 */
class ESOAccountModel {
  constructor() {
    this.dbPath = './data/eso/custome_resources/data/account_data.json'
    this.users = this.loadUsers()
  }

  /**
   * 加载用户数据
   */
  loadUsers() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'))
        // 数据迁移：确保每个绑定都有isPrimary字段
        return this.migrateData(data)
      }
      return {}
    } catch (error) {
      console.error(`[ESO:账号绑定] 加载用户数据失败: ${error.message}`)
      return {}
    }
  }

  /**
   * 数据迁移：为旧数据添加新字段
   */
  migrateData(data) {
    let needsSave = false
    
    for (const [userId, bindings] of Object.entries(data)) {
      if (Array.isArray(bindings)) {
        let hasPrimary = false
        
        for (let i = 0; i < bindings.length; i++) {
          const binding = bindings[i]
          
          // 如果旧数据没有isPrimary字段
          if (typeof binding.isPrimary === 'undefined') {
            binding.isPrimary = (i === 0)
            needsSave = true
          }
          if (binding.isPrimary) {
            hasPrimary = true
          }
          
          // 如果旧数据没有user_id字段
          if (typeof binding.user_id === 'undefined') {
            binding.user_id = 0
            needsSave = true
          }
          
          // 如果旧数据没有扩展字段
          if (typeof binding.esocnName === 'undefined') {
            binding.esocnName = ''
            needsSave = true
          }
          if (typeof binding.server === 'undefined') {
            binding.server = ''
            needsSave = true
          }
          if (typeof binding.signature === 'undefined') {
            binding.signature = ''
            needsSave = true
          }
          if (typeof binding.avatar === 'undefined') {
            binding.avatar = null
            needsSave = true
          }
          if (!binding.updateTime) {
            binding.updateTime = binding.bindTime || new Date().toISOString()
            needsSave = true
          }
          if (typeof binding.rank === 'undefined') {
            binding.rank = 0
            needsSave = true
          }
        }
        
        // 确保至少有一个主账号
        if (bindings.length > 0 && !hasPrimary) {
          bindings[0].isPrimary = true
          needsSave = true
        }
      }
    }
    
    if (needsSave) {
      this.saveUsers(data)
      console.log('[ESO:账号绑定] 数据迁移完成')
    }
    
    return data
  }

  /**
   * 保存用户数据
   */
  saveUsers(data = this.users) {
    try {
      const dataDir = path.dirname(this.dbPath)
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
      }
      fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2))
      this.users = data
      return true
    } catch (error) {
      console.error(`[ESO:账号绑定] 保存用户数据失败: ${error.message}`)
      return false
    }
  }

  /**
   * 绑定账号
   * @param {string} userId - 用户QQ号
   * @param {string} accountName - ESO账号名
   * @param {string} playerName - 角色名（可选）
   * @param {object} extraData - 额外数据（esocnName, server, signature）
   * @returns {object} 绑定结果
   */
  bindUser(userId, accountName, playerName = '', extraData = {}) {
    try {
      const userIdStr = userId.toString()
      
      // 检查是否已被当前用户绑定
      if (this.users[userIdStr]) {
        const existingBind = this.users[userIdStr].find(
          bind => bind.accountName === accountName && bind.playerName === playerName
        )
        if (existingBind) {
          return { success: false, message: '您已经绑定过该角色' }
        }
      }

      // 初始化用户绑定列表
      if (!this.users[userIdStr]) {
        this.users[userIdStr] = []
      }

      // 检查是否已有主账号
      const hasPrimary = this.users[userIdStr].some(bind => bind.isPrimary)
      
      // 检查不同账号数量限制
      const uniqueAccounts = new Set(this.users[userIdStr].map(bind => bind.accountName))
      if (!uniqueAccounts.has(accountName) && uniqueAccounts.size >= 3) {
        return { success: false, message: '每个用户最多只能绑定3个不同的账号' }
      }

      // 添加新绑定
      const now = new Date().toISOString()
      const newBinding = {
        user_id: extraData.user_id || 0,
        playerName,
        accountName,
        bindTime: now,
        isPrimary: !hasPrimary, // 如果没有主账号，则设为true
        // 可选字段
        esocnName: extraData.esocnName || '',
        server: extraData.server || '',
        signature: extraData.signature || '',
        avatar: extraData.avatar || null,
        rank: extraData.rank || 0,
        updateTime: now
      }
      
      this.users[userIdStr].push(newBinding)
      this.saveUsers()
      
      return {
        success: true,
        message: '绑定成功',
        isPrimary: newBinding.isPrimary,
        bindingIndex: this.users[userIdStr].length
      }
    } catch (error) {
      console.error(`[ESO:账号绑定] 绑定失败: ${error.message}`)
      return { success: false, message: '绑定失败' }
    }
  }

  /**
   * 更新绑定信息
   * @param {string} userId - 用户QQ号
   * @param {number} index - 绑定索引（1-based）
   * @param {object} updateData - 要更新的数据
   * @returns {object} 更新结果
   */
  updateBinding(userId, index, updateData) {
    try {
      const userIdStr = userId.toString()
      
      if (!this.users[userIdStr] || this.users[userIdStr].length === 0) {
        return { success: false, message: '您还没有绑定任何角色' }
      }

      const bindings = this.users[userIdStr]
      const targetIndex = index - 1
      
      if (targetIndex < 0 || targetIndex >= bindings.length) {
        return { success: false, message: `无效的序号，请输入1-${bindings.length}之间的数字` }
      }

      // 更新字段
      const allowedFields = ['esocnName', 'server', 'signature', 'playerName', 'user_id', 'avatar', 'rank']
      let hasUpdate = false
      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          bindings[targetIndex][field] = updateData[field]
          hasUpdate = true
        }
      }
      
      // 如果有字段被更新（排除isPrimary），更新updateTime
      if (hasUpdate) {
        bindings[targetIndex].updateTime = new Date().toISOString()
      }
      
      this.saveUsers()
      
      return {
        success: true,
        message: '更新成功',
        binding: bindings[targetIndex]
      }
    } catch (error) {
      console.error(`[ESO:账号绑定] 更新失败: ${error.message}`)
      return { success: false, message: '更新失败' }
    }
  }

  /**
   * 切换主账号
   * @param {string} userId - 用户QQ号
   * @param {number} index - 绑定索引（1-based）
   * @returns {object} 切换结果
   */
  switchPrimary(userId, index) {
    try {
      const userIdStr = userId.toString()
      
      if (!this.users[userIdStr] || this.users[userIdStr].length === 0) {
        return { success: false, message: '您还没有绑定任何角色' }
      }

      const bindings = this.users[userIdStr]
      const targetIndex = index - 1 // 转换为0-based
      
      if (targetIndex < 0 || targetIndex >= bindings.length) {
        return { success: false, message: `无效的序号，请输入1-${bindings.length}之间的数字` }
      }

      // 如果已经是主账号，不需要切换
      if (bindings[targetIndex].isPrimary) {
        return { success: false, message: '该角色已经是主账号' }
      }

      // 切换主账号：将当前主账号设为非主，目标设为主
      bindings.forEach((binding, i) => {
        binding.isPrimary = (i === targetIndex)
      })
      
      this.saveUsers()
      
      const targetBinding = bindings[targetIndex]
      const displayName = targetBinding.playerName 
        ? `${targetBinding.playerName}@${targetBinding.accountName}`
        : `@${targetBinding.accountName}`
      
      return {
        success: true,
        message: `已切换主账号为: ${displayName}`,
        binding: targetBinding
      }
    } catch (error) {
      console.error(`[ESO:账号绑定] 切换主账号失败: ${error.message}`)
      return { success: false, message: '切换主账号失败' }
    }
  }

  /**
   * 解绑账号
   * @param {string} userId - 用户QQ号
   * @param {number} index - 绑定索引（1-based，可选）
   * @param {string} accountName - 账号名（可选）
   * @param {string} playerName - 角色名（可选）
   * @returns {object} 解绑结果
   */
  unbindUser(userId, index = null, accountName = null, playerName = null) {
    try {
      const userIdStr = userId.toString()
      
      if (!this.users[userIdStr] || this.users[userIdStr].length === 0) {
        return { success: false, message: '您还没有绑定任何角色' }
      }

      const bindings = this.users[userIdStr]
      let targetIndex = -1

      if (index !== null) {
        targetIndex = index - 1
        if (targetIndex < 0 || targetIndex >= bindings.length) {
          return { success: false, message: `无效的序号，请输入1-${bindings.length}之间的数字` }
        }
      } else if (accountName) {
        targetIndex = bindings.findIndex(
          bind => bind.accountName === accountName && 
                  (playerName === null || bind.playerName === playerName)
        )
        if (targetIndex === -1) {
          return { success: false, message: '未找到指定的绑定' }
        }
      } else {
        return { success: false, message: '请指定要解绑的序号或账号' }
      }

      const wasPrimary = bindings[targetIndex].isPrimary
      const removedBinding = bindings[targetIndex]
      
      // 删除绑定
      bindings.splice(targetIndex, 1)
      
      // 如果删除的是主账号，且还有其他绑定
      if (wasPrimary && bindings.length > 0) {
        // 优先寻找 user_id 不为 0 的角色
        const nonZeroIndex = bindings.findIndex(bind => bind.user_id !== 0)
        if (nonZeroIndex !== -1) {
          bindings[nonZeroIndex].isPrimary = true
        } else {
          // 如果所有角色的 user_id 都为 0，则将第一个设为主账号
          bindings[0].isPrimary = true
        }
      }
      
      // 如果没有绑定了，删除用户数据
      if (bindings.length === 0) {
        delete this.users[userIdStr]
      }
      
      this.saveUsers()
      
      const displayName = removedBinding.playerName 
        ? `${removedBinding.playerName}@${removedBinding.accountName}`
        : `@${removedBinding.accountName}`
      
      return { success: true, message: `已解绑: ${displayName}` }
    } catch (error) {
      console.error(`[ESO:账号绑定] 解绑失败: ${error.message}`)
      return { success: false, message: '解绑失败' }
    }
  }

  /**
   * 获取用户的所有绑定
   * @param {string} userId - 用户QQ号
   * @returns {array} 绑定列表
   */
  getAllBindings(userId) {
    const userIdStr = userId.toString()
    return this.users[userIdStr] || []
  }

  /**
   * 获取主账号
   * @param {string} userId - 用户QQ号
   * @returns {object|null} 主账号绑定信息
   */
  getPrimaryBinding(userId) {
    const userIdStr = userId.toString()
    if (!this.users[userIdStr]) return null
    return this.users[userIdStr].find(bind => bind.isPrimary) || null
  }

  /**
   * 获取用户的绑定数量
   * @param {string} userId - 用户QQ号
   * @returns {number} 绑定数量
   */
  getBindingCount(userId) {
    const userIdStr = userId.toString()
    return this.users[userIdStr] ? this.users[userIdStr].length : 0
  }

  /**
   * 检查用户是否已绑定
   * @param {string} userId - 用户QQ号
   * @returns {boolean}
   */
  isUserBound(userId) {
    const userIdStr = userId.toString()
    return this.users[userIdStr] && this.users[userIdStr].length > 0
  }

  /**
   * 检查账号是否已被绑定
   * @param {string} userId - 用户QQ号
   * @param {string} accountName - 账号名
   * @param {string} playerName - 角色名
   * @returns {boolean}
   */
  isBound(userId, accountName, playerName = '') {
    const userIdStr = userId.toString()
    if (!this.users[userIdStr]) return false
    
    return this.users[userIdStr].some(
      bind => bind.accountName === accountName && bind.playerName === playerName
    )
  }

  /**
   * 获取所有用户数据
   * @returns {object}
   */
  getAllUsers() {
    return this.users
  }
}

export default new ESOAccountModel()
