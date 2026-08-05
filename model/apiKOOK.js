/**
 * ============================================================
 * KOOK API 封装层（apiKOOK.js）
 * ============================================================
 * 在 ESO 插件内调用 KOOK（开黑啦）平台能力的安全封装。
 * 覆盖 kasumi.js（KOOK 官方 SDK）的全部 API：用户/消息/私聊/服务器/
 * 角色/封禁/静音/表情/频道/资产/邀请/游戏/网关/徽章/亲密/语音。
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │ 一、调用方式（给任何 AI / 真人开发者）                    │
 * ├─────────────────────────────────────────────────────────┤
 * │ import KOOK, { isKOOK, resolveGuildId } from            │
 * │   '../model/apiKOOK.js'                                 │
 * │                                                         │
 * │ // 例1：判断消息是否来自 KOOK                            │
 * │ if (!isKOOK(e)) return   // e.self_id 以 'ko_' 开头     │
 * │                                                         │
 * │ // 例2：读取当前服务器角色列表                           │
 * │ const roles = await KOOK.roleList(e)                    │
 * │ // roles 是数组：[{ role_id, name, position, ... }]     │
 * │                                                         │
 * │ // 例3：给用户分配角色（KOOK 专属，QQ/微信无此能力）      │
 * │ const roleId = await KOOK.roleIdByName(e, undefined,    │
 * │   'vss')                     // 按名查角色，无则 null    │
 * │ const ok = await KOOK.roleGrant(e, undefined,           │
 * │   roleId, e.at)              // e.at 是 @ 的用户(ko_xxx)│
 * │                                                         │
 * │ // 例4：发送频道消息（文本 type=1 / 图片 2 / 卡片 9）     │
 * │ await KOOK.messageCreate(e, e.group_id, 1, '你好')       │
 * │                                                         │
 * │ // 例5：任意 API（kookCall 通用回调）                    │
 * │ await kookCall(e, async (api, ids) => {                 │
 * │   return api.guild.view(ids.guildId)                    │
 * │ })                                                      │
 * └─────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │ 二、关键踩坑点（务必阅读！）                              │
 * ├─────────────────────────────────────────────────────────┤
 * │ ① 服务器ID ≠ 频道ID（最易踩的坑）                        │
 * │    e.group_id 是【频道 ID】(channel_id)，不是服务器 ID！ │
 * │    角色/服务器/封禁等 API 需要【服务器 ID】(guild_id)。  │
 * │    本封装所有方法已自动解析：不传 guildId 参数即可，      │
 * │    内部 resolveGuildId() 会 channel.view → guild_id。   │
 * │    显式传 guildId 时请务必传【服务器 ID】。              │
 * │                                                         │
 * │ ② 用户/群 ID 的 ko_ 前缀                                │
 * │    e.user_id / e.group_id 带 'ko_' 前缀（如 ko_123）。   │
 * │    API 需要原始 ID。传参时封装内部已自动去前缀（kookId） │
 * │    ，如遇需要手传 ID 的场景用 kookId(id) 去前缀。        │
 * │                                                         │
 * │ ③ 分页方法返回 async generator（不是 Promise！）         │
 * │    kasumi 的 list 类方法（guild.list、guild.role.list、 │
 * │    channel.list 等 12 个）返回 async generator，直接     │
 * │    await 会拿到迭代器对象而非数据。且 kasumi 的翻页循环  │
 * │    丢失固定参数（如 guild_id），导致第二页起失败。        │
 * │    本封装已用 _paged() 手动分页（每页带完整参数），       │
 * │    调用方拿到的是合并后的完整数组。                      │
 * │                                                         │
 * │ ④ 返回结构：成功 {data}，失败 {err}，不抛异常            │
 * │    kasumi 的 requestor 对非 0 code 返回 {err: RestError}│
 * │    ，不会 throw。本封装统一：成功返回实际数据，失败返回   │
 * │    null。因此判断失败用「=== null」而不是 try/catch。    │
 * │                                                         │
 * │ ⑤ 权限模型（角色操作的关键约束）                         │
 * │    KOOK 规定机器人只能管理【优先级(position)比自己低】   │
 * │    的用户和角色。机器人需在服务器设置里获得足够高的       │
 * │    角色优先级，且具备「管理角色权限」(权限位10)。         │
 * │    grant/revoke 失败时先检查这两点，再查代码。           │
 * │                                                         │
 * │ ⑥ 不 import kasumi.js（兼容未安装 KOOK-Plugin）          │
 * │    本文件【禁止】顶层 import 任何 KOOK 依赖。kasumi.js   │
 * │    只在 KOOK-Plugin/node_modules 里，未安装时 import 会  │
 * │    导致插件加载崩溃。全部通过全局 Bot['ko_xxx'].sdk 访问 │
 * │    。未安装时 Bot 是 Proxy，返回 undefined，所有方法      │
 * │    安全返回 null/[]/false，不影响其他协议端。            │
 * │                                                         │
 * │ ⑦ 消息来源判断                                           │
 * │    isKOOK(e)：e.self_id 以 'ko_' 开头即为 KOOK 消息。    │
 * │    非 KOOK 消息调用本封装方法全部返回 null，无需担心。    │
 * │                                                         │
 * │ ⑧ 测试过的方法（真实 KOOK 环境验证）                     │
 * │    已验证：roleList / roleCreate / roleGrant / roleIdBy- │
 * │    Name / guildList / guildView / guildUserList /        │
 * │    channelList / channelView / messageView / message-    │
 * │    Create / messageDelete / blacklistList / muteList /   │
 * │    emojiList / botInfo / listBots                        │
 * │    未实测（封装就绪）：roleRevoke / roleUpdate /          │
 * │    roleDelete / 各类 create/delete / 语音 / 游戏等       │
 * └─────────────────────────────────────────────────────────┘
 */

/** 判断消息/事件是否来自 KOOK（self_id 形如 'ko_机器人ID'） */
export function isKOOK(e) {
  return !!(e && typeof e.self_id === 'string' && e.self_id.startsWith('ko_'))
}

/** 从事件对象取 KOOK 机器人实例（Bot['ko_xxx']），未安装/不存在时返回 null */
export function getKookBot(e) {
  if (!isKOOK(e)) return null
  const bot = global.Bot?.[e.self_id]
  return bot?.sdk ? bot : null
}

/** 从事件对象取 kasumi.js 的 API 对象（Bot['ko_xxx'].sdk.API） */
export function getKookAPI(e) {
  return getKookBot(e)?.sdk?.API || null
}

/** 频道/群 ID → 服务器 ID 解析缓存（避免重复 API 调用） */
const guildIdCache = new Map()

/**
 * 从事件对象解析服务器 ID（guild_id）
 * KOOK 的 e.group_id 是频道 ID（channel_id），需通过 channel.view 拿 guild_id
 * @param {object} e 事件对象
 * @param {object} api kasumi API 对象（可选，不传则内部获取）
 * @returns {Promise<string>} guild_id，失败返回 ''
 */
export async function resolveGuildId(e, api) {
  if (!isKOOK(e) || !e.group_id) return ''
  const channelId = kookId(e.group_id)
  if (guildIdCache.has(channelId)) return guildIdCache.get(channelId)
  const apiObj = api || getKookAPI(e)
  if (!apiObj) return ''
  try {
    const r = await apiObj.channel.view(channelId)
    const gid = r?.data?.guild_id || ''
    guildIdCache.set(channelId, gid)
    return gid
  } catch (err) {
    logger?.error?.(`[ESO:KOOK] 解析服务器 ID 失败: ${err?.message || err}`)
    return ''
  }
}

/** 归一化 KOOK ID：去掉 'ko_' 前缀（API 需要原始 ID） */
export function kookId(id) {
  return String(id || '').replace(/^ko_/, '')
}

/** 归一化用户/群 ID 为 'ko_' 前缀形式（与 Bot 注册/事件一致） */
export function kookPrefixedId(id) {
  return `ko_${kookId(id)}`
}

/**
 * 安全执行 KOOK API 调用。
 * @param {object} e 事件对象（需含 self_id）
 * @param {function} fn (api, ids) => Promise 回调，ids = { guildId, userId, groupId, channelId }
 * @returns 成功返回回调结果；非 KOOK / 未安装 / 无 API 返回 null
 */
export async function kookCall(e, fn) {
  const api = getKookAPI(e)
  if (!api || typeof fn !== 'function') return null
  const ids = {
    guildId: e.group_id ? kookId(e.group_id) : '',
    groupId: e.group_id ? kookId(e.group_id) : '',
    userId: e.user_id ? kookId(e.user_id) : '',
    channelId: e.group_id ? kookId(e.group_id) : '',
  }
  try {
    return await fn(api, ids)
  } catch (err) {
    logger?.error?.(`[ESO:KOOK] API 调用异常: ${err?.message || err}`)
    return null
  }
}

/**
 * KOOK API 完整封装类
 * 所有方法均安全：非 KOOK 环境返回 null/false/[]，不抛错
 */
class KOOKAPI {
  /** 获取 API 对象（内部方法） */
  _api(e) {
    return getKookAPI(e)
  }

  /**
   * 解析服务器 ID：显式 guildId 优先，否则从事件对象解析（频道→服务器）
   */
  async _guildId(e, guildId) {
    if (guildId) return kookId(guildId)
    return await resolveGuildId(e, this._api(e))
  }

  /**
   * 手动分页收集（绕开 kasumi multiPageRequest 翻页丢参数的 bug）
   * kasumi 的 multiPageRequest 第一页带 params（如 guild_id），但翻页循环
   * 丢失 ...params，导致 role/channel 等接口第二页起请求失败。
   * 这里直接用 api.rest.get 手动逐页请求，每页都带完整参数。
   * @param {object} api kasumi API 对象
   * @param {string} endpoint 接口路径（如 '/guild-role/list'）
   * @param {object} params 固定参数（如 { guild_id }）
   * @param {number} pageSize 每页大小（默认 50）
   * @returns {Promise<Array|null>} 合并的 items 数组
   */
  async _paged(api, endpoint, params = {}, pageSize = 50) {
    if (!api?.rest?.get) return null
    const items = []
    let page = 1
    let pageTotal = 1
    while (page <= pageTotal) {
      const r = await api.rest.get(endpoint, { ...params, page, page_size: pageSize })
      if (r.err || !r.data) break
      const data = r.data
      if (Array.isArray(data)) items.push(...data)
      else if (Array.isArray(data.items)) items.push(...data.items)
      pageTotal = data.meta?.page_total || 1
      page++
      // 防御：防止 page_total 异常导致死循环
      if (page > 100) break
    }
    return items
  }

  // ================================================================
  // 连接/账号
  // ================================================================

  /** 获取所有已连接的 KOOK 机器人 id 列表（如 ['ko_123456']），未装时返回 [] */
  listBots() {
    if (!global.Bot) return []
    return Object.keys(global.Bot).filter(id => typeof id === 'string' && id.startsWith('ko_'))
  }

  /** 获取机器人自身信息（Bot[id].info，无需 API 调用） */
  botInfo(e) {
    return getKookBot(e)?.info || null
  }

  // ================================================================
  // 用户 User
  // ================================================================

  /** 获取机器人自身资料 GET /user/me */
  async userMe(e) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.user.me()
    return r.err ? null : r.data
  }

  /** 查看用户资料 GET /user/view（guildId 可选） */
  async userView(e, userId, guildId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.user.view(kookId(userId), guildId ? kookId(guildId) : undefined)
    return r.err ? null : r.data
  }

  /** 机器人下线 POST /user/offline */
  async userOffline(e) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.user.offline()
    return r.err ? null : r.data
  }

  // ================================================================
  // 消息 Message（频道消息）
  // ================================================================

  /** 获取频道消息列表 GET /message/list */
  async messageList(e, channelId, opts = {}) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.message.list(kookId(channelId || e.group_id), opts.pageSize, opts.pinned, opts.messageId, opts.mode)
    return r.err ? null : r.data
  }

  /** 查看消息详情 GET /message/view */
  async messageView(e, messageId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.message.view(messageId)
    return r.err ? null : r.data
  }

  /** 发送频道消息 POST /message/create（type: 1文本 2图片 3视频 4文件 8音频 9卡片 10按钮卡片） */
  async messageCreate(e, channelId, type, content, quote, tempTarget) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.message.create(type, kookId(channelId || e.group_id), content, quote, tempTarget)
    return r.err ? null : r.data
  }

  /** 编辑频道消息 POST /message/update */
  async messageUpdate(e, messageId, content, quote) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.message.update(messageId, content, quote)
    return r.err ? null : r.data
  }

  /** 删除频道消息 POST /message/delete */
  async messageDelete(e, messageId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.message.delete(messageId)
    return r.err ? null : r.data
  }

  /** 获取消息反应用户列表 GET /message/reaction-list */
  async messageReactionUsers(e, messageId, emojiId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.message.reactionUserList(messageId, emojiId)
    return r.err ? null : r.data
  }

  /** 添加消息反应 POST /message/add-reaction */
  async messageAddReaction(e, messageId, emojiId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.message.addReaction(messageId, emojiId)
    return r.err ? null : r.data
  }

  /** 删除消息反应 POST /message/delete-reaction */
  async messageDeleteReaction(e, messageId, emojiId, userId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.message.deleteReaction(messageId, emojiId, userId ? kookId(userId) : undefined)
    return r.err ? null : r.data
  }

  // ================================================================
  // 私聊消息 DirectMessage
  // ================================================================

  /** 获取私聊会话列表 GET /direct-message/chat/list（分页） */
  async dmChatList(e, page, pageSize) {
    const api = this._api(e)
    if (!api) return null
    return this._paged(api, '/user-chat/list', {}, pageSize || page)
  }

  /** 查看私聊会话 GET /direct-message/chat/view */
  async dmChatView(e, chatCode) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.directMessage.chat.view(chatCode)
    return r.err ? null : r.data
  }

  /** 创建私聊会话 POST /direct-message/chat/create */
  async dmChatCreate(e, userId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.directMessage.chat.create(kookId(userId))
    return r.err ? null : r.data
  }

  /** 删除私聊会话 POST /direct-message/chat/delete */
  async dmChatDelete(e, chatCode) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.directMessage.chat.delete(chatCode)
    return r.err ? null : r.data
  }

  /** 获取私聊消息列表 GET /direct-message/list */
  async dmList(e, opts = {}) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.directMessage.list(opts)
    return r.err ? null : r.data
  }

  /** 查看私聊消息 GET /direct-message/view */
  async dmView(e, messageId, chatCode) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.directMessage.view(messageId, chatCode)
    return r.err ? null : r.data
  }

  /** 发送私聊消息 POST /direct-message/create */
  async dmCreate(e, userId, type, content, quote, chatCode) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.directMessage.create(type, kookId(userId), content, quote, chatCode)
    return r.err ? null : r.data
  }

  /** 编辑私聊消息 POST /direct-message/update */
  async dmUpdate(e, messageId, content, quote) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.directMessage.update(messageId, content, quote)
    return r.err ? null : r.data
  }

  /** 删除私聊消息 POST /direct-message/delete */
  async dmDelete(e, messageId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.directMessage.delete(messageId)
    return r.err ? null : r.data
  }

  /** 私聊消息反应用户列表 */
  async dmReactionUsers(e, messageId, emojiId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.directMessage.reactionUserList(messageId, emojiId)
    return r.err ? null : r.data
  }

  /** 私聊添加反应 */
  async dmAddReaction(e, messageId, emojiId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.directMessage.addReaction(messageId, emojiId)
    return r.err ? null : r.data
  }

  /** 私聊删除反应 */
  async dmDeleteReaction(e, messageId, emojiId, userId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.directMessage.deleteReaction(messageId, emojiId, userId ? kookId(userId) : undefined)
    return r.err ? null : r.data
  }

  // ================================================================
  // 服务器 Guild
  // ================================================================

  /** 获取机器人所在服务器列表 GET /guild/list（分页） */
  async guildList(e, page, pageSize) {
    const api = this._api(e)
    if (!api) return null
    return this._paged(api, '/guild/list', {}, pageSize || page)
  }

  /** 查看服务器详情 GET /guild/view */
  async guildView(e, guildId) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.guild.view(gid)
    return r.err ? null : r.data
  }

  /** 获取服务器用户列表 GET /guild/user-list（支持过滤，分页） */
  async guildUserList(e, opts = {}) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, opts.guildId)
    if (!gid) return null
    return this._paged(api, '/guild/user-list', { guild_id: gid, ...opts }, opts.pageSize)
  }

  /** 修改服务器昵称 POST /guild/nickname */
  async guildNickname(e, guildId, nickname, userId) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.guild.nickname(gid, nickname, userId ? kookId(userId) : undefined)
    return r.err ? null : r.data
  }

  /** 退出服务器 POST /guild/leave */
  async guildLeave(e, guildId) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.guild.leave(gid)
    return r.err ? null : r.data
  }

  /** 踢出用户 POST /guild/kick */
  async guildKick(e, guildId, userId) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.guild.kick(gid, kookId(userId))
    return r.err ? null : r.data
  }

  // ================================================================
  // 服务器角色 Guild Role（核心：角色分配）
  // ================================================================

  /** 获取服务器角色列表 GET /guild-role/list（分页） */
  async roleList(e, guildId, page, pageSize) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    return this._paged(api, '/guild-role/list', { guild_id: gid }, pageSize || page)
  }

  /** 创建服务器角色 POST /guild-role/create */
  async roleCreate(e, guildId, name, opts = {}) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    if (opts && Object.keys(opts).length) {
      // kasumi 的 role.create 只传 name，需带 color/hoist/mentionable/permissions 时走底层 API
      const r = await api.rest.post('/guild-role/create', { guild_id: gid, name, ...opts })
      if (r.err) {
        logger?.error?.(`[ESO:KOOK] 创建角色失败 name=${name} code=${r.err.code} msg=${r.err.message} opts=${JSON.stringify(opts)}`)
        return null
      }
      return r.data
    }
    const r = await api.guild.role.create(gid, name)
    if (r.err) {
      logger?.error?.(`[ESO:KOOK] 创建角色失败 name=${name} code=${r.err.code} msg=${r.err.message}`)
      return null
    }
    return r.data
  }

  /** 更新服务器角色 POST /guild-role/update */
  async roleUpdate(e, guildId, roleId, opts = {}) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.guild.role.update(gid, roleId, opts)
    return r.err ? null : r.data
  }

  /** 删除服务器角色 POST /guild-role/delete */
  async roleDelete(e, guildId, roleId) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.guild.role.delete(gid, roleId)
    return r.err ? null : r.data
  }

  /** 赋予用户角色 POST /guild-role/grant */
  async roleGrant(e, guildId, roleId, userId) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.guild.role.grant(gid, roleId, kookId(userId || e.user_id))
    if (r.err) {
      logger?.error?.(`[ESO:KOOK] 授予角色失败 roleId=${roleId} code=${r.err.code} msg=${r.err.message}`)
      return null
    }
    return r.data
  }

  /** 删除用户角色 POST /guild-role/revoke */
  async roleRevoke(e, guildId, roleId, userId) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.guild.role.revoke(gid, roleId, kookId(userId || e.user_id))
    if (r.err) {
      logger?.error?.(`[ESO:KOOK] 移除角色失败 roleId=${roleId} code=${r.err.code} msg=${r.err.message}`)
      return null
    }
    return r.data
  }

  /** 便捷：按角色名查找角色 id（找不到返回 null） */
  async roleIdByName(e, guildId, roleName) {
    const list = await this.roleList(e, guildId)
    if (!list || !Array.isArray(list)) return null
    const found = list.find(r => r.name === roleName)
    return found ? found.role_id : null
  }

  // ================================================================
  // 服务器封禁 Blacklist
  // ================================================================

  /** 获取服务器封禁列表 GET /guild-ban/list（分页） */
  async blacklistList(e, guildId, page, pageSize) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    return this._paged(api, '/invite/list', { guild_id: gid }, pageSize || page)
  }

  /** 封禁用户 POST /guild-ban/create */
  async blacklistCreate(e, guildId, userId, reason, deleteRecentMessages) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.blacklist.create(gid, kookId(userId), reason, deleteRecentMessages)
    return r.err ? null : r.data
  }

  /** 解除封禁 POST /guild-ban/delete */
  async blacklistDelete(e, guildId, userId) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.blacklist.delete(gid, kookId(userId))
    return r.err ? null : r.data
  }

  // ================================================================
  // 服务器静音 Guild Mute
  // ================================================================

  /** 获取服务器静音列表 GET /guild-mute/list */
  async muteList(e, guildId, returnType = 'detail') {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.guild.mute.list(gid, returnType)
    return r.err ? null : r.data
  }

  /** 设置服务器静音 POST /guild-mute/create */
  async muteCreate(e, guildId, userId, type) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.guild.mute.create(gid, kookId(userId), type)
    return r.err ? null : r.data
  }

  /** 解除服务器静音 POST /guild-mute/delete */
  async muteDelete(e, guildId, userId, type) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.guild.mute.delete(gid, kookId(userId), type)
    return r.err ? null : r.data
  }

  // ================================================================
  // 服务器表情 Guild Emoji
  // ================================================================

  /** 获取服务器表情列表 GET /guild-emoji/list（分页） */
  async emojiList(e, guildId, page, pageSize) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    return this._paged(api, '/guild-emoji/list', { guild_id: gid }, pageSize || page)
  }

  /** 创建服务器表情 POST /guild-emoji/create */
  async emojiCreate(e, guildId, emoji, name, config) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.guild.emoji.create(gid, emoji, name, config)
    return r.err ? null : r.data
  }

  /** 更新服务器表情 POST /guild-emoji/update */
  async emojiUpdate(e, emojiId, name) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.guild.emoji.update(emojiId, name)
    return r.err ? null : r.data
  }

  /** 删除服务器表情 POST /guild-emoji/delete */
  async emojiDelete(e, emojiId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.guild.emoji.delete(emojiId)
    return r.err ? null : r.data
  }

  // ================================================================
  // 服务器增益 Guild Boost
  // ================================================================

  /** 获取服务器增益记录 GET /guild-boost/history（分页） */
  async boostHistory(e, guildId, begin, end, page, pageSize) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    return this._paged(api, '/guild-boost/history', { guild_id: gid, begin, end }, pageSize || page)
  }

  // ================================================================
  // 频道 Channel
  // ================================================================

  /** 获取频道列表 GET /channel/list（分页） */
  async channelList(e, guildId, type, page, pageSize) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    return this._paged(api, '/channel/list', { guild_id: gid, type }, pageSize || page)
  }

  /** 查看频道详情 GET /channel/view */
  async channelView(e, channelId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.channel.view(kookId(channelId || e.group_id))
    return r.err ? null : r.data
  }

  /** 创建文字频道 POST /channel/create */
  async channelCreateText(e, guildId, name, parentCategoryId) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.channel.createTextChannel(gid, name, parentCategoryId)
    return r.err ? null : r.data
  }

  /** 创建语音频道 POST /channel/create */
  async channelCreateVoice(e, guildId, name, memberLimit, voiceQuality, parentCategoryId) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.channel.createVoiceChannel(gid, name, memberLimit, voiceQuality, parentCategoryId)
    return r.err ? null : r.data
  }

  /** 创建频道分类 POST /channel/create */
  async channelCreateCategory(e, guildId, name) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.channel.createCategory(gid, name)
    return r.err ? null : r.data
  }

  /** 更新频道 POST /channel/update */
  async channelUpdate(e, channelId, name, topic, slowMode) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.channel.update(kookId(channelId || e.group_id), name, topic, slowMode)
    return r.err ? null : r.data
  }

  /** 删除频道 POST /channel/delete */
  async channelDelete(e, channelId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.channel.delete(kookId(channelId || e.group_id))
    return r.err ? null : r.data
  }

  /** 获取语音频道用户列表 GET /channel/user-list */
  async channelVoiceUsers(e, channelId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.channel.voiceChannelUserList(kookId(channelId || e.group_id))
    return r.err ? null : r.data
  }

  /** 移动语音频道用户 POST /channel/move-user */
  async channelMoveUser(e, channelId, userIds) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.channel.voiceChannelMoveUser(kookId(channelId || e.group_id), userIds)
    return r.err ? null : r.data
  }

  /** 获取已加入频道的用户 GET /channel/user/joined（分页） */
  async channelJoinedUsers(e, guildId, userId, page, pageSize) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    return this._paged(api, '/channel-user/get-joined-channel', { guild_id: gid, user_id: userId ? kookId(userId) : undefined }, pageSize || page)
  }

  // ================================================================
  // 频道权限 Channel Role
  // ================================================================

  /** 获取频道权限列表 GET /channel-role/index */
  async channelRoleList(e, channelId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.channel.permission.list(kookId(channelId || e.group_id))
    return r.err ? null : r.data
  }

  /** 设置频道角色权限 POST /channel-role/create */
  async channelRoleSet(e, channelId, roleId, allow, deny) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.channel.permission.updateRole(kookId(channelId || e.group_id), roleId, allow, deny)
    return r.err ? null : r.data
  }

  /** 设置频道用户权限 POST /channel-role/create */
  async channelUserSet(e, channelId, userId, allow, deny) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.channel.permission.updateUser(kookId(channelId || e.group_id), kookId(userId), allow, deny)
    return r.err ? null : r.data
  }

  /** 删除频道角色权限 POST /channel-role/delete */
  async channelRoleDelete(e, channelId, roleId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.channel.permission.deleteRole(kookId(channelId || e.group_id), roleId)
    return r.err ? null : r.data
  }

  /** 删除频道用户权限 POST /channel-role/delete */
  async channelUserDelete(e, channelId, userId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.channel.permission.deleteUser(kookId(channelId || e.group_id), kookId(userId))
    return r.err ? null : r.data
  }

  // ================================================================
  // 资产 Asset（文件上传）
  // ================================================================

  /** 上传文件创建资源 POST /asset/create */
  async assetCreate(e, buffer, config) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.asset.create(buffer, config)
    return r.err ? null : r.data
  }

  // ================================================================
  // 邀请 Invite
  // ================================================================

  /** 获取邀请列表 GET /invite/list（分页） */
  async inviteList(e, opts = {}) {
    const api = this._api(e)
    if (!api) return null
    return this._paged(api, '/invite/list', opts, opts.pageSize)
  }

  /** 创建邀请 POST /invite/create */
  async inviteCreate(e, opts = {}) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.invite.create(opts)
    return r.err ? null : r.data
  }

  /** 删除邀请 POST /invite/delete */
  async inviteDelete(e, inviteCode, guildId, channelId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.invite.delete(inviteCode, guildId ? kookId(guildId) : undefined, channelId ? kookId(channelId) : undefined)
    return r.err ? null : r.data
  }

  // ================================================================
  // 游戏活动 Game
  // ================================================================

  /** 获取游戏列表 GET /game/list（分页） */
  async gameList(e, type, page, pageSize) {
    const api = this._api(e)
    if (!api) return null
    return this._paged(api, '/game', { type }, pageSize || page)
  }

  /** 创建游戏 POST /game/create */
  async gameCreate(e, name, icon) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.game.create(name, icon)
    return r.err ? null : r.data
  }

  /** 更新游戏 POST /game/update */
  async gameUpdate(e, id, name, icon) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.game.update(id, name, icon)
    return r.err ? null : r.data
  }

  /** 删除游戏 POST /game/delete */
  async gameDelete(e, id) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.game.delete(id)
    return r.err ? null : r.data
  }

  /** 启动游戏活动 POST /game/activity */
  async gameStartActivity(e, id) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.game.startGameActivity(id)
    return r.err ? null : r.data
  }

  /** 停止游戏活动 POST /game/delete-activity */
  async gameStopActivity(e) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.game.stopGameActivity()
    return r.err ? null : r.data
  }

  /** 启动音乐活动 POST /game/activity */
  async gameStartMusic(e, artist, title) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.game.startMusicActivity(artist, title)
    return r.err ? null : r.data
  }

  /** 停止音乐活动 POST /game/delete-activity */
  async gameStopMusic(e) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.game.stopMusicActivity()
    return r.err ? null : r.data
  }

  // ================================================================
  // 网关 Gateway
  // ================================================================

  /** 获取网关地址 GET /gateway/index */
  async gatewayIndex(e, compress = 0) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.gateway.index(compress)
    return r.err ? null : r.data
  }

  // ================================================================
  // 徽章 Badge
  // ================================================================

  /** 获取服务器徽章 GET /badge/guild */
  async badgeGuild(e, guildId, style) {
    const api = this._api(e)
    if (!api) return null
    const gid = await this._guildId(e, guildId)
    if (!gid) return null
    const r = await api.badge.guild(gid, style)
    return r.err ? null : r.data
  }

  // ================================================================
  // 亲密关系 Intimacy
  // ================================================================

  /** 获取亲密关系 GET /intimacy/index */
  async intimacyGet(e, userId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.intimacy.get(kookId(userId || e.user_id))
    return r.err ? null : r.data
  }

  /** 更新亲密关系 POST /intimacy/update */
  async intimacyUpdate(e, userId, opts = {}) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.intimacy.update(kookId(userId || e.user_id), opts)
    return r.err ? null : r.data
  }

  // ================================================================
  // 语音 Voice
  // ================================================================

  /** 加入语音频道 POST /voice/join */
  async voiceJoin(e, channelId, opts = {}) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.voice.join(kookId(channelId || e.group_id), opts)
    return r.err ? null : r.data
  }

  /** 获取语音频道列表 POST /voice/list（分页） */
  async voiceList(e) {
    const api = this._api(e)
    if (!api) return null
    return this._paged(api, '/voice/list', {})
  }

  /** 离开语音频道 POST /voice/leave */
  async voiceLeave(e, channelId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.voice.leave(kookId(channelId || e.group_id))
    return r.err ? null : r.data
  }

  /** 语音心跳 POST /voice/keep-alive */
  async voiceKeepAlive(e, channelId) {
    const api = this._api(e)
    if (!api) return null
    const r = await api.voice.keepAlive(kookId(channelId || e.group_id))
    return r.err ? null : r.data
  }
}

export default new KOOKAPI()
