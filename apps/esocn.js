import plugin from '../../../lib/plugins/plugin.js'
import ESOAccount from '../model/esoAccount.js'
import database, { setAtlasSrcMode } from '../model/database.js'
import fetch from 'node-fetch'
import fs from 'node:fs'

/** 图鉴数据源：'local' 本地数据库（默认）| 'api' ESOCN API */
let srcMode = 'local'

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
        },
        {
          reg: 'esocn.com.cn/build/',
          fnc: 'parseBuildLink'
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

  /**
   * 解析 ESOCN Build 链接
   * @param {*} e 消息对象
   * @returns
   */
  async parseBuildLink(e) {
    setAtlasSrcMode(srcMode)
    // 检查限流
    const userId = String(e.user_id)
    if (!checkRateLimit(userId)) {
      return await this.reply('操作太频繁，请稍后再试')
    }

    // 提取 build ID
    const buildId = this.extractBuildId(e.msg)
    if (!buildId) {
      return await this.reply('无法解析配装链接，请检查链接格式是否正确\n格式示例: https://esocn.com.cn/build/QAMjcC7k')
    }

    await this.reply('正在获取配装数据，请稍候...')

    try {
      // 调用 API 获取配装详情
      const buildData = await this.getBuildDetail(buildId)
      
      if (!buildData.success || !buildData.data) {
        return await this.reply(`获取配装失败：${buildData.message || '配装不存在或已删除'}`)
      }

      // 转换数据格式
      const BD = await this.convertBuildData(buildData.data)
      
      // 使用 puppeteer 生成图片
      const puppeteer = (await import('../../../lib/puppeteer/puppeteer.js')).default
      
      // 调用 database.updateData 处理数据
      // 使用 type=10 进入 updateBuildData(BD, 2) 处理 ESOCN 格式
      let processedData = await database.updateData(BD, 10)
      
      let image = await puppeteer.screenshot('eso', processedData)
      
      return await this.reply(image)

    } catch (error) {
      logger.error(`[ESOCN:Build解析] 解析失败: ${error.message}`)
      return await this.reply('解析配装失败，请稍后重试')
    }
  }

  /**
   * 从消息中提取 Build ID
   * @param {string} msg 消息内容
   * @returns {string|null} Build ID
   */
  extractBuildId(msg) {
    // 匹配 esocn.com.cn/build/XXXXXX 格式
    const match = msg.match(/esocn\.com\.cn\/build\/([A-Za-z0-9]+)/i)
    if (match && match[1]) {
      return match[1]
    }
    return null
  }

  /**
   * 获取配装详情
   * @param {string} buildId 配装ID
   * @returns {object} API返回结果
   */
  async getBuildDetail(buildId) {
    try {
      const url = `${ESOCN_API.BASE_URL}/api/builds/getBuildDetail`
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          buildId: buildId
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      logger.error(`[ESOCN:API] 获取配装详情失败: ${error.message}`)
      return { success: false, message: 'API请求失败' }
    }
  }

  /**
   * 转换 ESOCN Build 数据为 BD 格式
   * @param {object} data ESOCN返回的数据
   * @returns {object} BD格式数据
   */
  async convertBuildData(data) {
    const buildData = data.buildData || {}
    const equipment = buildData.equipment || {}
    const skills = buildData.skills || {}
    const buffs = buildData.buffs || {}
    const basicInfo = buildData.basicInfo || {}

    // 职业映射表
    const classMap = {
      '1': { name: 'Warden', cn: '窝登' },
      '2': { name: 'Templar', cn: '圣骑' },
      '3': { name: 'Dragonknight', cn: '龙骑' },
      '4': { name: 'Nightblade', cn: '夜刃' },
      '5': { name: 'Sorcerer', cn: '巫师' },
      '6': { name: 'Necromancer', cn: '死灵' },
      '7': { name: 'Arcanist', cn: '奥术' }
    }

    // 角色定位映射（坦克和治疗固定，输出需要根据属性判断）
    const roleMap = {
      '坦克': { name: 'Tank', cn: '坦克' },
      '治疗': { name: 'Healer', cn: '奶妈' }
    }

    // 获取职业信息
    const classId = data.class || basicInfo.classId
    const classInfo = classMap[classId] || { name: '', cn: '' }
    
    // 获取角色定位
    const role = data.role || basicInfo.role
    let roleInfo
    
    if (role === '输出') {
      // 输出职业根据属性判断法系/耐系
      const attributes = basicInfo.attributes || { magicka: 0, stamina: 0 }
      if (attributes.magicka >= attributes.stamina) {
        roleInfo = { name: 'MagickaDPS', cn: '法系' }
      } else {
        roleInfo = { name: 'StaminaDPS', cn: '耐系' }
      }
    } else {
      roleInfo = roleMap[role] || { name: 'StaminaDPS', cn: '耐系' }
    }

    // 转换装备数据
    const gearData = this.convertEquipment(equipment)

    // 转换技能数据
    const talentData = this.convertSkills(skills)

    // 转换石头信息
    const stoneInfo = this.convertMundusStone(buffs.mundusStone)

    // 转换食物信息（异步）
    const foodInfo = await this.convertFood(buffs.food)

    // 转换种族信息
    const raceInfo = this.convertRace(basicInfo.race || data.race)

    // 转换技能线信息（含职业精通 / classMasteryIds）
    const skillLineInfo = await this.buildSkillLineInfo(buildData, basicInfo, data)

    // buildName 存入 title，subtitle 存入 playerName
    const buildTitle = data.buildName || basicInfo.buildName || ''
    const subtitle = data.subtitle || basicInfo.subtitle || ''
    const author = data.author || basicInfo.authorName || ''

    // 处理吸血鬼信息
    const vampireLevel = parseInt(data.vampire || basicInfo.vampire || 0)
    let vampireInfo = []
    if (vampireLevel > 0 && vampireLevel <= 5) {
      const iconName = `ability_u26_vampire_infection_stage${vampireLevel}`
      try {
        const getimgs = (await import('../model/getimgs.js')).default
        const imgPath = await getimgs.realpath(iconName, 'skills')
        vampireInfo = [{
          name: `吸血鬼${vampireLevel}阶`,
          img: imgPath
        }]
      } catch (err) {
        logger.warn(`[ESOCN:吸血鬼] 获取图标失败: ${err.message}`)
        vampireInfo = [{
          name: `吸血鬼${vampireLevel}阶`,
          img: ''
        }]
      }
    }

    // 处理狼人信息
    const wolfLevel = parseInt(data.wolf || basicInfo.wolf || 0)
    let wolfInfo = []
    if (wolfLevel > 0) {
      const iconName = 'ability_werewolf_010'
      try {
        const getimgs = (await import('../model/getimgs.js')).default
        const imgPath = await getimgs.realpath(iconName, 'skills')
        wolfInfo = [{
          name: '狼人病',
          img: imgPath
        }]
      } catch (err) {
        logger.warn(`[ESOCN:狼人] 获取图标失败: ${err.message}`)
        wolfInfo = [{
          name: '狼人病',
          img: ''
        }]
      }
    }

    // 转换篆刻技能数据
    const craftedSkills = await this.convertCraftedSkills(buildData.craftedSkills)

    // 转换 CP 数据
    const cpPoints = this.convertCPPoints(buildData)

    return {
      virtual: 0,
      playerName: subtitle,
      accountName: '',
      className: classInfo.name,
      classNameCN: classInfo.cn,
      roleName: roleInfo.name,
      roleNameCN: roleInfo.cn,
      links: [],
      gearData: gearData,
      talentData: talentData,
      race: basicInfo.race || data.race || '',
      stoneInfo: stoneInfo,
      foodInfo: foodInfo,
      raceInfo: raceInfo,
      skillLineInfo: skillLineInfo,
      vampireInfo: vampireInfo,
      wolfInfo: wolfInfo,
      food: buffs.food ? buffs.food.name : '',
      food_icon: buffs.food ? buffs.food.icon : '',
      potion: buffs.potion ? buffs.potion.name : '',
      potion_icon: buffs.potion ? buffs.potion.icon : '',
      // ESOCN 特有数据标记
      isESOCN: true,
      title: buildTitle,
      buildName: buildTitle,
      subtitle: subtitle,
      author: author,
      username: data.username ? String(data.username) : '',
      // 属性点数据
      attributes: basicInfo.attributes || { health: 0, magicka: 0, stamina: 0 },
      // 篆刻技能数据
      craftedSkills: craftedSkills,
      // CP 点数数据
      cpPoints: cpPoints
    }
  }

  /**
   * 转换装备数据
   * @param {object} equipment 装备数据
   * @returns {array} gearData 数组
   */
  convertEquipment(equipment) {
    const slotMap = {
      'head': { slot: 'Head', type: 'armor' },
      'shoulders': { slot: 'Shoulders', type: 'armor' },
      'chest': { slot: 'Chest', type: 'armor' },
      'hands': { slot: 'Hands', type: 'armor' },
      'waist': { slot: 'Waist', type: 'armor' },
      'legs': { slot: 'Legs', type: 'armor' },
      'feet': { slot: 'Feet', type: 'armor' },
      'neck': { slot: 'Neck', type: 'jewelry' },
      'ring1': { slot: 'Ring 1', type: 'jewelry' },
      'ring2': { slot: 'Ring 2', type: 'jewelry' },
      'mainHand': { slot: 'Main Hand', type: 'weapon' },
      'offHand': { slot: 'Off Hand', type: 'weapon' },
      'backbarMainHand': { slot: 'Main Hand Backup', type: 'weapon' },
      'backbarOffHand': { slot: 'Off Hand Backup', type: 'weapon' }
    }

    const gearData = []

    for (const [key, item] of Object.entries(equipment)) {
      if (!item || !slotMap[key]) continue

      const slotInfo = slotMap[key]
      
      // 确定装备类型 - 使用 gearType 字段（轻甲/中甲/重甲），而非 armor 字段
      let armorType = ''
      if (item.gearType) {
        if (item.gearType.includes('轻甲')) armorType = 'Light'
        else if (item.gearType.includes('中甲')) armorType = 'Medium'
        else if (item.gearType.includes('重甲')) armorType = 'Heavy'
        else armorType = item.gearType
      }

      // 处理武器类型
      let weaponType = ''
      if (slotInfo.type === 'weapon' && item.gearType) {
        if (item.gearType.includes('火焰')) weaponType = 'Fire Staff'
        else if (item.gearType.includes('寒冰')) weaponType = 'Frost Staff'
        else if (item.gearType.includes('闪电')) weaponType = 'Lightning Staff'
        else if (item.gearType.includes('恢复')) weaponType = 'Healing Staff'
        else if (item.gearType.includes('弓')) weaponType = 'Bow'
        else if (item.gearType.includes('盾')) weaponType = 'Shield'
        else if (item.gearType.includes('匕首')) weaponType = 'Dagger'
        else if (item.gearType.includes('锤')) weaponType = 'Hammer'
        else if (item.gearType.includes('剑')) weaponType = 'Sword'
        else if (item.gearType.includes('斧')) weaponType = 'Axe'
        else weaponType = item.gearType
      }

      // 获取特质信息
      const trait = item.trait || {}
      const enchantment = item.enchantment || {}

      // 获取品质颜色
      let color = 'rgb(170, 170, 170)'
      const quality = item.quality || '普通'
      if (quality === '传说') color = 'rgb(255, 230, 45)'
      else if (quality === '史诗') color = 'rgb(163, 53, 238)'
      else if (quality === '精良') color = 'rgb(58, 146, 254)'
      else if (quality === '优秀') color = 'rgb(47, 213, 14)'

      // 处理图标路径
      let iconUrl = item.icon || ''
      if (iconUrl && !iconUrl.startsWith('http')) {
        iconUrl = 'https://esoicons.uesp.net' + iconUrl
      }

      gearData.push({
        level: item.level || 'CP160',
        type: item.type,  // 原始 type 字段（用于判断神器，如 "12"）
        gearType: armorType || weaponType || 'Jewelry',  // 装备类型（轻甲/中甲/重甲/武器）
        slot: slotInfo.slot,
        name: {
          text: item.name || '',
          enName: item.enName || '',
          link: '',
          color: color,
          image: iconUrl
        },
        set: item.setName || '',
        setEn: item.setEn || item.enName || '',
        trait: trait,
        enchant: enchantment
      })
    }

    return gearData
  }

  /**
   * 转换技能数据
   * @param {object} skills 技能数据
   * @returns {array} talentData 数组
   */
  convertSkills(skills) {
    const talentData = []
    const mainBar = skills.mainBar || []
    const backBar = skills.backBar || []

    // 合并主副手技能
    const maxLen = Math.max(mainBar.length, backBar.length)
    
    for (let i = 0; i < maxLen; i++) {
      const mainSkill = mainBar[i] || {}
      const backSkill = backBar[i] || {}

      talentData.push({
        mainSkill: {
          icon: mainSkill.icon || '',
          text: mainSkill.name || '',
          address: mainSkill.skillTreeName || '',
          color: this.getSkillColor(mainSkill)
        },
        offSkill: {
          icon: backSkill.icon || '',
          text: backSkill.name || '',
          address: backSkill.skillTreeName || '',
          color: this.getSkillColor(backSkill)
        }
      })
    }

    return talentData
  }

  /**
   * 获取技能颜色
   * @param {object} skill 技能数据
   * @returns {string} 颜色值
   */
  getSkillColor(skill) {
    if (!skill) return 'rgb(170, 170, 170)'
    
    // 终极技使用特殊颜色
    if (skill.ultimate === 1 || skill.ultimate === true) {
      return 'rgb(255, 204, 0)'
    }
    
    // 根据消耗类型判断
    if (skill.magickaCost > 0) return 'rgb(58, 146, 254)'
    if (skill.staminaCost > 0) return 'rgb(47, 213, 14)'
    
    return 'rgb(170, 170, 170)'
  }

  /**
   * 转换梦达斯之石
   * @param {object} mundusStone 石头数据
   * @returns {array} stoneInfo 数组
   */
  convertMundusStone(mundusStone) {
    if (!mundusStone || !mundusStone.name) return []

    const stoneMap = {
      '学徒': 'ON-icon-mundusstone-Apprentice.png',
      '侍灵': 'ON-icon-mundusstone-Atronach.png',
      '女神': 'ON-icon-mundusstone-Lady.png',
      '君王': 'ON-icon-mundusstone-Lord.png',
      '恋人': 'ON-icon-mundusstone-Lover.png',
      '法师': 'ON-icon-mundusstone-Mage.png',
      '仪式': 'ON-icon-mundusstone-Ritual.png',
      '毒蛇': 'ON-icon-mundusstone-Serpent.png',
      '暗影': 'ON-icon-mundusstone-Shadow.png',
      '战马': 'ON-icon-mundusstone-Steed.png',
      '盗贼': 'ON-icon-mundusstone-Thief.png',
      '高塔': 'ON-icon-mundusstone-Tower.png',
      '战士': 'ON-icon-mundusstone-Warrior.png'
    }

    const name = mundusStone.name
    let img = stoneMap[name] || 'ON-icon-mundusstone-Apprentice.png'

    return [{
      name: name,
      name_cn: name,
      name_en: 'The ' + name,
      img: img
    }]
  }

  /**
   * 转换食物信息
   * @param {object} food 食物数据
   * @returns {array} foodInfo 数组
   */
  async convertFood(food) {
    if (!food || !food.name) return []

    // 提取图标名称（去掉路径和扩展名）
    let iconName = ''
    if (food.icon) {
      // 去掉路径，只保留文件名
      const parts = food.icon.split('/')
      const fileName = parts.pop() || ''
      // 去掉扩展名
      iconName = fileName.replace(/\.[^/.]+$/, '')
    }

    // 使用 getimgs 获取正确的图片路径
    let imgPath = ''
    if (iconName) {
      try {
        const getimgs = (await import('../model/getimgs.js')).default
        imgPath = await getimgs.realpath(iconName, 'foods')
      } catch (err) {
        logger.warn(`[ESOCN:食物] 获取食物图标失败: ${err.message}`)
        imgPath = food.icon || ''
      }
    }

    return [{
      name: food.name,
      name_cn: food.name,
      name_en: food.enName || '',
      img: imgPath
    }]
  }

  /**
   * 转换种族信息
   * @param {string} race 种族名称
   * @returns {array} raceInfo 数组
   */
  convertRace(race) {
    if (!race) return []

    const raceMap = {
      '高精灵': { en: 'Altmer', img: 'Altmer' },
      '木精灵': { en: 'Bosmer', img: 'Bosmer' },
      '卡吉特': { en: 'Khajiit', img: 'Khajiit' },
      '虎人': { en: 'Khajiit', img: 'Khajiit' },
      '布莱顿': { en: 'Breton', img: 'Breton' },
      '布莱顿人': { en: 'Breton', img: 'Breton' },
      '兽人': { en: 'Orc', img: 'Orc' },
      '红卫': { en: 'Redguard', img: 'Redguard' },
      '红卫人': { en: 'Redguard', img: 'Redguard' },
      '亚龙人': { en: 'Argonian', img: 'Argonian' },
      '暗精灵': { en: 'Dunmer', img: 'Dunmer' },
      '诺德人': { en: 'Nord', img: 'Nord' },
      '帝国人': { en: 'Imperial', img: 'Imperial' }
    }

    const raceInfo = raceMap[race]
    if (!raceInfo) {
      return [{
        name_en: race,
        name_cn: race,
        img: 'Dunmer',
      }]
    }

    return [{
      name_en: raceInfo.en,
      name_cn: race,
      img: raceInfo.img
    }]
  }

  /**
   * 构建技能线展示数据（SkillLine 区域）
   * @param {object} buildData data.buildData
   * @param {object} basicInfo buildData.basicInfo
   * @param {object} data API data 根对象
   */
  async buildSkillLineInfo(buildData, basicInfo, data) {
    const mapped = this.convertSkillLines(basicInfo.skillLine || data.subClass)
    const classMasteryIds = Array.isArray(buildData.classMasteryIds) ? buildData.classMasteryIds : []
    const allSameClassImg = mapped.length > 0 && mapped.every((m) => m.img === mapped[0].img)
    const collapseToMastery = allSameClassImg || classMasteryIds.length > 0

    const result = []
    if (mapped.length > 0 && collapseToMastery) {
      result.push({
        img: mapped[0].img,
        class_name: mapped[0].class_name,
        line_name: '职业精通',
        imgSkill: false,
      })
    } else {
      for (const item of mapped) {
        result.push({ ...item, imgSkill: false })
      }
    }

    for (const masteryId of classMasteryIds) {
      const masteryLine = await this.resolveClassMasteryLine(masteryId)
      if (masteryLine) result.push(masteryLine)
    }

    return result
  }

  /**
   * 按技能 ID 解析职业精通条目（同 *SKILLIDxxx：name2index type=21 + updateData type=2）
   */
  async resolveClassMasteryLine(masteryId) {
    try {
      const objSkills = await database.name2index(String(masteryId), 21)
      if (!objSkills?.length || objSkills[0] < 0) {
        logger.warn(`[ESOCN:职业精通] 未找到技能 ID: ${masteryId}`)
        return null
      }
      const skillData = await database.updateData(objSkills[0], 2)
      const atlas = skillData?.atlasData?.[1]
      if (!atlas?.new_cn_name || !atlas?.new_icon) return null
      return {
        img: atlas.new_icon,
        line_name: atlas.new_cn_name,
        class_name: '',
        imgSkill: true,
      }
    } catch (err) {
      logger.warn(`[ESOCN:职业精通] ID ${masteryId} 查询失败: ${err.message}`)
      return null
    }
  }

  /**
   * 转换技能线信息
   * @param {array} skillLines 技能线数组
   * @returns {array} skillLineInfo 数组
   */
  convertSkillLines(skillLines) {
    if (!skillLines || !Array.isArray(skillLines)) return []

    const skillLineMap = {
      '黑暗魔法': { class_img: 'ON-icon-class-Sorcerer', class_name: '巫师' },
      '魔族召唤': { class_img: 'ON-icon-class-Sorcerer', class_name: '巫师' },
      '风暴呼唤': { class_img: 'ON-icon-class-Sorcerer', class_name: '巫师' },
      '神族之矛': { class_img: 'ON-icon-class-Templar', class_name: '圣骑' },
      '黎明之怒': { class_img: 'ON-icon-class-Templar', class_name: '圣骑' },
      '恢复之光': { class_img: 'ON-icon-class-Templar', class_name: '圣骑' },
      '烈焰之刃': { class_img: 'ON-icon-class-Dragonknight', class_name: '龙骑' },
      '巨龙之力': { class_img: 'ON-icon-class-Dragonknight', class_name: '龙骑' },
      '大地之心': { class_img: 'ON-icon-class-Dragonknight', class_name: '龙骑' },
      '刺杀': { class_img: 'ON-icon-class-Nightblade', class_name: '夜刃' },
      '暗影': { class_img: 'ON-icon-class-Nightblade', class_name: '夜刃' },
      '虹吸': { class_img: 'ON-icon-class-Nightblade', class_name: '夜刃' },
      '动物伙伴': { class_img: 'ON-icon-class-Warden', class_name: '守望' },
      '绿色平衡': { class_img: 'ON-icon-class-Warden', class_name: '守望' },
      '凛冬之拥': { class_img: 'ON-icon-class-Warden', class_name: '守望' },
      '墓穴领主': { class_img: 'ON-icon-class-Necromancer', class_name: '死灵' },
      '白骨暴君': { class_img: 'ON-icon-class-Necromancer', class_name: '死灵' },
      '存世亡者': { class_img: 'ON-icon-class-Necromancer', class_name: '死灵' },
      '古籍使者': { class_img: 'ON-icon-class-Arcanist', class_name: '奥术师' },
      '异典士兵': { class_img: 'ON-icon-class-Arcanist', class_name: '奥术师' },
      '药剂符师': { class_img: 'ON-icon-class-Arcanist', class_name: '奥术师' }
    }

    const result = []
    for (const line of skillLines) {
      const lineName = typeof line === 'string' ? line : (line.name || '')
      const info = skillLineMap[lineName]
      if (info) {
        result.push({
          img: info.class_img,
          class_name: info.class_name,
          line_name: lineName
        })
      }
    }

    return result
  }

  /**
   * 转换篆刻技能数据
   * @param {array} craftedSkills 篆刻技能数组
   * @returns {array} 处理后的篆刻技能数组
   */
  async convertCraftedSkills(craftedSkills) {
    if (!craftedSkills || !Array.isArray(craftedSkills) || craftedSkills.length === 0) {
      return []
    }

    const getimgs = (await import('../model/getimgs.js')).default
    const result = []

    for (const skill of craftedSkills) {
      // 提取篆刻技能图标名称（技能效果图标）
      let skillIconName = ''
      if (skill.icon) {
        const match = skill.icon.match(/\/([^\/]+)\.webp$/)
        if (match) {
          skillIconName = match[1]
        }
      }

      // 提取魔典图标名称（book-icon）
      let bookIconName = ''
      if (skill['book-icon']) {
        const match = skill['book-icon'].match(/\/([^\/]+)\.webp$/)
        if (match) {
          bookIconName = match[1]
        }
      }

      // 提取脚本图标名称
      const extractScriptIcon = (iconPath) => {
        if (!iconPath) return ''
        const match = iconPath.match(/\/([^\/]+)\.webp$/)
        return match ? match[1] : ''
      }

      const slots1IconName = extractScriptIcon(skill.slots1?.icon)
      const slots2IconName = extractScriptIcon(skill.slots2?.icon)
      const slots3IconName = extractScriptIcon(skill.slots3?.icon)

      let skillIconNamePath = ''
      let bookIconNamePath = ''
      let slots1IconNamePath = ''
      let slots2IconNamePath = ''
      let slots3IconNamePath = ''

      // 下载图标到本地
      try {
        if (skillIconName) {
          skillIconNamePath = await getimgs.realpath(skillIconName, 'skills')
        }
        if (bookIconName) {
          bookIconNamePath = await getimgs.realpath(bookIconName, 'skills')
        }
        if (slots1IconName) {
          slots1IconNamePath  = await getimgs.realpath(slots1IconName, 'craftedScripts')
        }
        if (slots2IconName) {
          slots2IconNamePath = await getimgs.realpath(slots2IconName, 'craftedScripts')
        }
        if (slots3IconName) {
          slots3IconNamePath = await getimgs.realpath(slots3IconName, 'craftedScripts')
        }
      } catch (err) {
        logger.warn(`[ESOCN:篆刻技能] 下载图标失败: ${err.message}`)
      }

      result.push({
        name: skill.name || '',
        enName: skill.enName || '',
        icon: skillIconNamePath,
        bookIcon: bookIconNamePath,
        slots1: {
          name: skill.slots1?.name || '',
          icon: slots1IconNamePath
        },
        slots2: {
          name: skill.slots2?.name || '',
          icon: slots2IconNamePath
        },
        slots3: {
          name: skill.slots3?.name || '',
          icon: slots3IconNamePath
        }
      })
    }

    return result
  }

  /**
   * 转换 CP 点数数据
   * @param {object} buildData 构建数据
   * @returns {object} CP 数据对象
   */
  convertCPPoints(buildData) {
    const result = {
      crafted: [],
      warfare: [],
      fitness: []
    }

    // 处理制作 CP (selectedCraftedCP)
    const selectedCraftedCP = buildData.selectedCraftedCP || []
    for (const cp of selectedCraftedCP) {
      if (cp && cp.name) {
        result.crafted.push({
          name: cp.name,
          enName: cp.en_name || ''
        })
      }
    }

    // 处理战争 CP (selectedWarfareCP)
    const selectedWarfareCP = buildData.selectedWarfareCP || []
    for (const cp of selectedWarfareCP) {
      if (cp && cp.name) {
        result.warfare.push({
          name: cp.name,
          enName: cp.en_name || ''
        })
      }
    }

    // 处理强健 CP (selectedFitnessCP)
    const selectedFitnessCP = buildData.selectedFitnessCP || []
    for (const cp of selectedFitnessCP) {
      if (cp && cp.name) {
        result.fitness.push({
          name: cp.name,
          enName: cp.en_name || ''
        })
      }
    }

    return result
  }
}
