import plugin from '../../../lib/plugins/plugin.js'
import ESOAccount from '../model/esoAccount.js'
import fetch from 'node-fetch'
import fs from 'node:fs'

// ESOCN API 配置
const ESOCN_API = {
  BASE_URL: 'https://api.esocn.com.cn',
  TOKEN: 'ESOCN_ESOBOT_SECURE_v1_d8f2a4e9b7c10d5e3a6f8b2c4d9e0a1f72b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7'
}

// 限流配置
const RATE_LIMIT = {
  WINDOW_MS: 60000,
  MAX_REQUESTS: 10,
  CLEANUP_INTERVAL: 300000
}

const rateLimit = new Map()

// 限流检查
function checkRateLimit(userId) {
  const now = Date.now()
  const userRequests = rateLimit.get(userId) || []
  const validRequests = userRequests.filter(time => now - time < RATE_LIMIT.WINDOW_MS)
  
  if (validRequests.length >= RATE_LIMIT.MAX_REQUESTS) {
    return false
  }
  
  validRequests.push(now)
  rateLimit.set(userId, validRequests)
  return true
}

export class esocn extends plugin {
  constructor() {
    super({
      name: 'ESOCN功能',
      dsc: 'ESOCN账号绑定相关功能',
      event: 'message',
      priority: 1000,
      rule: [
        {
          reg: '^#BC[A-Z0-9]{6}$',
          fnc: 'bindESOCN'
        },
        {
          reg: '^#esocn状态.*$',
          fnc: 'queryESOCNStatus'
        }
      ]
    })
  }

  /**
   * 绑定ESOCN账号
   * @param {*} e 消息对象
   * @returns
   */
  async bindESOCN(e) {
    const userId = String(e.user_id)
    const bindCode = e.msg.trim().toUpperCase()

    // 检查限流
    if (!checkRateLimit(userId)) {
      return await this.reply('操作太频繁，请稍后再试')
    }

    await this.reply('正在验证绑定码，请稍候...')

    try {
      // 调用ESOCN API验证绑定码
      const userInfo = await this.verifyBindCode(bindCode)
      
      if (!userInfo.success) {
        return await this.reply(`绑定失败：${userInfo.message || '绑定码无效或已过期'}`)
      }

      const data = userInfo.data
      const cid = data.cid || ''
      
      if (!cid) {
        return await this.reply('请先添加您在ESO中的角色ID到您的ESOCN账号后重试！')
      }

      // 从cid中提取账号名（去掉@前缀）
      const accountName = cid.startsWith('@') ? cid.substring(1) : cid
      
      // 准备绑定数据
      // 解析rank，处理空字符串情况
      let rankValue = 0
      if (data.rank !== undefined && data.rank !== null && data.rank !== '') {
        const parsedRank = parseInt(data.rank)
        if (!isNaN(parsedRank)) {
          rankValue = parsedRank
        }
      }
      
      const extraData = {
        esocnName: data.username || '',
        server: data.server || '',
        signature: data.sign || '',
        user_id: data.user_id || 0,
        avatar: data.avatar || null,
        rank: rankValue
      }

      // 检查是否已存在相同的cid绑定
      const existingBindings = ESOAccount.getAllBindings(userId)
      const existingIndex = existingBindings.findIndex(
        bind => bind.accountName === accountName
      )

      let result
      let isUpdate = false

      if (existingIndex !== -1) {
        // 更新现有绑定
        result = ESOAccount.updateBinding(userId, existingIndex + 1, {
          ...extraData,
          playerName: ''
        })
        isUpdate = true
      } else {
        // 创建新绑定
        result = ESOAccount.bindUser(userId, accountName, '', extraData)
      }

      if (!result.success) {
        return await this.reply(`绑定失败：${result.message}`)
      }

      // 检查是否是唯一user_id非0的角色，如果是则自动设为主账号
      await this.checkAndSetPrimary(userId)

      // 显示绑定结果
      const actionText = isUpdate ? '更新成功' : '绑定成功'
      const replyMsg = [
        `${actionText}！`,
        `账号：@${accountName}`,
        `ESOCN名：${data.username || '—'}`,
        `服务器：${data.server || '—'}`,
        `签名：${data.sign ? data.sign.substring(0, 30) + (data.sign.length > 30 ? '...' : '') : '—'}`
      ].join('\n')

      await this.reply(replyMsg)

      // 自动触发查绑定显示状态
      return await this.showBindStatus(e)

    } catch (error) {
      logger.error(`[ESOCN:绑定] 绑定失败: ${error.message}`)
      return await this.reply('绑定失败，请稍后重试')
    }
  }

  /**
   * 验证绑定码
   * @param {string} bindCode 绑定码
   * @returns {object} API返回结果
   */
  async verifyBindCode(bindCode) {
    try {
      const url = `${ESOCN_API.BASE_URL}/api/bind/verify`
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ESOCN_API.TOKEN}`
        },
        body: JSON.stringify({
          bind_code: bindCode
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      logger.error(`[ESOCN:API] 验证绑定码失败: ${error.message}`)
      return { success: false, message: 'API请求失败' }
    }
  }

  /**
   * 检查并设置主账号
   * 如果只有一个user_id非0的角色，自动将其设置为主账号
   * @param {string} userId 用户QQ号
   */
  async checkAndSetPrimary(userId) {
    const bindings = ESOAccount.getAllBindings(userId)
    if (bindings.length === 0) return

    // 找出所有user_id非0的角色
    const nonZeroBindings = bindings.filter(bind => bind.user_id !== 0)
    
    // 如果只有一个user_id非0的角色，将其设为主账号
    if (nonZeroBindings.length === 1) {
      const targetIndex = bindings.findIndex(bind => bind.user_id !== 0)
      if (targetIndex !== -1) {
        bindings.forEach((bind, i) => {
          bind.isPrimary = (i === targetIndex)
        })
        ESOAccount.saveUsers()
      }
    }
    // 如果没有user_id非0的角色，且没有主账号，将第一个设为主账号
    else if (nonZeroBindings.length === 0) {
      const hasPrimary = bindings.some(bind => bind.isPrimary)
      if (!hasPrimary) {
        bindings[0].isPrimary = true
        ESOAccount.saveUsers()
      }
    }
    // 如果有多个user_id非0的角色，保持现有主账号不变
  }

  /**
   * 显示绑定状态（从esologPuzzle.js复制并简化）
   * @param {*} e 消息对象
   * @returns
   */
  async showBindStatus(e) {
    const userId = String(e.user_id)
    
    // 重新加载数据以获取最新信息
    ESOAccount.users = ESOAccount.loadUsers()
    
    const bindings = ESOAccount.getAllBindings(userId)
    
    // 准备绑定数据
    const bindingData = []
    
    // 导入 getimgs
    const getimgs = (await import('../model/getimgs.js')).default
    
    if (bindings.length > 0) {
      for (let i = 0; i < bindings.length; i++) {
        const binding = bindings[i]
        const bindTime = new Date(binding.bindTime)
        
        // 处理头像
        let avatarPath = null
        if (binding.avatar) {
          // 有 ESOCN 头像，下载并获取路径
          try {
            avatarPath = await getimgs.realpath(binding.avatar, 'esocn_avatar')
          } catch (err) {
            logger.warn(`[ESOCN:头像] 获取头像失败: ${err.message}`)
          }
        }
        
        bindingData.push({
          index: i + 1,
          playerName: binding.playerName,
          accountName: binding.accountName,
          bindDate: bindTime.toLocaleDateString('zh-CN'),
          bindTime: bindTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          isPrimary: binding.isPrimary,
          isNewBinding: false,
          avatar: avatarPath,
          esocnName: binding.esocnName || '',
          server: binding.server || '',
          signature: binding.signature || '',
          rank: binding.rank || 0
        })
      }
    }
    
    // 生成绑定状态图片
    const puppeteer = (await import('../../../lib/puppeteer/puppeteer.js')).default
    const statusData = {
      qqUser: e.sender.card || e.sender.nickname || `用户${userId}`,
      bindings: bindingData,
      pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`,
      tplFile: './plugins/eso/resources/html/eso/bindStatus.html',
      currentTime: new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }
    
    try {
      const img = await puppeteer.screenshot('eso', statusData)
      return this.reply(img)
    } catch (error) {
      logger.error(`[ESOCN:绑定状态] 生成图片失败: ${error.message}`)
      return await this.reply('绑定成功，但生成图片失败')
    }
  }

  /**
   * 查询 ESOCN 状态
   * 支持 @群友 查询别人的状态
   * @param {*} e 消息对象
   * @returns
   */
  async queryESOCNStatus(e) {
    // 获取目标用户ID（支持 @ 群友）
    let targetUserId = String(e.user_id)
    let targetUserName = e.sender.card || e.sender.nickname || `用户${e.user_id}`
    let isOther = false

    // 检查是否 @ 了其他用户
    if (e.at && e.at !== e.user_id) {
      targetUserId = String(e.at)
      isOther = true
      // 尝试从消息中获取被 @ 用户的昵称
      if (e.message) {
        const atMsg = e.message.find(msg => msg.type === 'at' && msg.qq === e.at)
        if (atMsg && atMsg.name) {
          targetUserName = atMsg.name
        } else {
          targetUserName = `用户${targetUserId}`
        }
      }
    }

    // 检查限流
    if (!checkRateLimit(targetUserId)) {
      return await this.reply('操作太频繁，请稍后再试')
    }

    try {
      // 重新加载数据以获取最新信息
      ESOAccount.users = ESOAccount.loadUsers()

      // 获取用户的所有绑定
      const bindings = ESOAccount.getAllBindings(targetUserId)

      if (bindings.length === 0) {
        // 生成未绑定的状态图片
        return await this.showESOCNStatus(e, targetUserId, targetUserName, null, isOther)
      }

      // 查找主账号
      let primaryBinding = bindings.find(bind => bind.isPrimary)
      if (!primaryBinding) {
        primaryBinding = bindings[0]
      }

      // 检查是否需要更新主账号数据
      const updatedBinding = await this.refreshPrimaryBinding(targetUserId, primaryBinding)
      if (updatedBinding) {
        primaryBinding = updatedBinding
      }

      // 生成状态图片
      return await this.showESOCNStatus(e, targetUserId, targetUserName, primaryBinding, isOther)

    } catch (error) {
      logger.error(`[ESOCN:状态查询] 查询失败: ${error.message}`)
      return await this.reply('查询失败，请稍后重试')
    }
  }

  /**
   * 刷新主账号数据
   * 如果 user_id 不为 0 且 updateTime 超过 1 分钟，调用 API 更新
   * @param {string} userId 用户QQ号
   * @param {object} binding 主账号绑定信息
   * @returns {object|null} 更新后的绑定信息，如果未更新则返回 null
   */
  async refreshPrimaryBinding(userId, binding) {
    // 只处理 user_id 不为 0 的角色
    if (!binding.user_id || binding.user_id === 0) {
      return null
    }

    // 检查 updateTime 是否超过 1 分钟
    const updateTime = binding.updateTime ? new Date(binding.updateTime) : new Date(0)
    const now = new Date()
    const timeDiff = now.getTime() - updateTime.getTime()
    const ONE_MINUTE = 60 * 1000

    if (timeDiff <= ONE_MINUTE) {
      return null // 未超过1分钟，跳过
    }

    try {
      // 调用 ESOCN API 获取最新用户信息
      const userInfo = await this.getUserInfoFromESOCN(binding.user_id)

      if (!userInfo.success || !userInfo.data) {
        logger.warn(`[ESOCN:数据刷新] 获取用户 ${binding.user_id} 信息失败: ${userInfo.message || '未知错误'}`)
        return null
      }

      const data = userInfo.data
      const cid = data.cid || ''

      // 如果 API 返回的 CID 为空，跳过更新
      if (!cid) {
        logger.info(`[ESOCN:数据刷新] 用户 ${binding.user_id} 未绑定 ESO 角色，跳过更新`)
        return null
      }

      // 解析rank，处理空字符串情况
      let rankValue = 0
      if (data.rank !== undefined && data.rank !== null && data.rank !== '') {
        const parsedRank = parseInt(data.rank)
        if (!isNaN(parsedRank)) {
          rankValue = parsedRank
        }
      }
      
      // 准备更新数据
      const updateData = {
        esocnName: data.username || '',
        server: data.server || '',
        signature: data.sign || '',
        avatar: data.avatar || null,
        rank: rankValue
      }

      // 如果 CID 变化了，也更新 accountName
      const newAccountName = cid.startsWith('@') ? cid.substring(1) : cid
      if (newAccountName && newAccountName !== binding.accountName) {
        updateData.accountName = newAccountName
      }

      // 查找主账号索引
      const bindings = ESOAccount.getAllBindings(userId)
      const primaryIndex = bindings.findIndex(bind => bind.isPrimary)
      const targetIndex = primaryIndex !== -1 ? primaryIndex : 0

      // 更新绑定数据
      const result = ESOAccount.updateBinding(userId, targetIndex + 1, updateData)

      if (result.success) {
        logger.info(`[ESOCN:数据刷新] 用户 ${userId} 的主账号 ${binding.accountName} 数据已更新`)
        return result.binding
      } else {
        logger.warn(`[ESOCN:数据刷新] 更新用户 ${userId} 的主账号 ${binding.accountName} 失败: ${result.message}`)
        return null
      }

    } catch (error) {
      logger.error(`[ESOCN:数据刷新] 刷新用户 ${userId} 的主账号数据失败: ${error.message}`)
      return null
    }
  }

  /**
   * 从 ESOCN API 获取用户信息
   * @param {number} userId ESOCN用户ID
   * @returns {object} API返回结果
   */
  async getUserInfoFromESOCN(userId) {
    try {
      const url = `${ESOCN_API.BASE_URL}/api/user/getUserInfo`
      const formattedUserId = String(userId).padStart(7, '0')

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ESOCN_API.TOKEN}`
        },
        body: JSON.stringify({ userId: formattedUserId })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      logger.error(`[ESOCN:API] 获取用户信息失败: ${error.message}`)
      return { success: false, message: 'API请求失败' }
    }
  }

  /**
   * 显示 ESOCN 状态
   * @param {*} e 消息对象
   * @param {string} targetUserId 目标用户QQ
   * @param {string} targetUserName 目标用户昵称
   * @param {object} primaryBinding 主账号绑定信息
   * @param {boolean} isOther 是否查询他人
   * @param {number} totalBindings 总绑定数
   * @returns
   */
  async showESOCNStatus(e, targetUserId, targetUserName, primaryBinding, isOther) {
    // 导入 getimgs
    const getimgs = (await import('../model/getimgs.js')).default

    // 准备数据
    let avatarPath = null
    let hasBinding = !!primaryBinding

    if (primaryBinding?.avatar) {
      // 处理头像
      try {
        avatarPath = await getimgs.realpath(primaryBinding.avatar, 'esocn_avatar')
      } catch (err) {
        logger.warn(`[ESOCN:状态] 获取头像失败: ${err.message}`)
      }
    }

    // 生成状态图片
    const puppeteer = (await import('../../../lib/puppeteer/puppeteer.js')).default
    const statusData = {
      qqUser: targetUserName + (isOther ? ' (他人)' : ''),
      hasBinding: hasBinding,
      accountName: primaryBinding?.accountName || '',
      playerName: primaryBinding?.playerName || '',
      esocnName: primaryBinding?.esocnName || '',
      server: primaryBinding?.server || '',
      signature: primaryBinding?.signature || '',
      rank: primaryBinding?.rank || 0,
      avatar: avatarPath,
      pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`,
      tplFile: './plugins/eso/resources/html/eso/esocnStatus.html',
      currentTime: new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }

    try {
      const img = await puppeteer.screenshot('eso', statusData)
      return this.reply(img)
    } catch (error) {
      logger.error(`[ESOCN:状态] 生成图片失败: ${error.message}`)
      
      // 如果图片生成失败，回退到文字回复
      if (!hasBinding) {
        return await this.reply(`${targetUserName} 尚未绑定 ESO 账号`)
      }

      const replyMsg = [
        `${targetUserName} 的 ESOCN 状态:`,
        `账号: @${primaryBinding.accountName}`,
        primaryBinding.esocnName ? `ESOCN: ${primaryBinding.esocnName}` : '',
        primaryBinding.server ? `服务器: ${primaryBinding.server}` : '',
        primaryBinding.signature ? `签名: ${primaryBinding.signature}` : ''
      ].filter(Boolean).join('\n')

      return await this.reply(replyMsg)
    }
  }
}
