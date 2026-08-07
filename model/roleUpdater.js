/**
 * KOOK 成就角色更新器（roleUpdater.js）
 *
 * 根据用户本地 PAT 数据计算应得试炼档位，并在 KOOK 服务器上创建/授予/移除角色。
 * 独立成 model 层模块，供 patSync.js（成就同步）调用，避免 apps ↔ model 循环依赖。
 *
 * 角色设置规则：
 *   1. 同一试炼副本的成就，只设置最高等级的那一个；
 *      若用户已有该试炼下低等级成就的 role，则移除这些 role，再设置最高等级
 *   2. 不同试炼的成就之间可以共存
 *   3. 设置 role 时若该 role 在服务器上不存在，则按对照表参数创建
 *   4. 完成后输出统计：新增 / 升级（高等级成就替代低等级成就 = 升级）
 *
 * 数据来源：
 *   - 对照表：plugins/eso/resources/data/eso_trials_roles.json
 *   - PAT 数据：data/eso/custome_resources/data/pat.json（经 patStore）
 *   - 账号绑定：data/eso/custome_resources/data/account_data.json（经 esoAccount）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import KOOK, { isKOOK } from './apiKOOK.js'
import { decodePat } from './patDecoder.js'
import PATStore from './patStore.js'
import ESOAccount from './esoAccount.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 对照表路径（git 仓库内） */
const TRIALS_ROLES_PATH = path.join(__dirname, '../resources/data/eso_trials_roles.json')

/** 成就档位等级排序（低 → 高） */
const LEVEL_ORDER = ['VET', 'PHM1', 'PHM2', 'HM', 'TRI', 'EXT']

/** 对照表缓存 */
let trialsCache = null

/**
 * 加载成就↔角色对照表
 * @returns {Array|null} [{ raid, raidCn, achievements: [{ level, id, nameCn, nameEn, role, roleInfo }] }]
 */
function loadTrialsRoles () {
  if (trialsCache) return trialsCache
  try {
    if (fs.existsSync(TRIALS_ROLES_PATH)) {
      trialsCache = JSON.parse(fs.readFileSync(TRIALS_ROLES_PATH, 'utf8'))
      return trialsCache
    }
  } catch (err) {
    logger?.error?.(`[ESO:更新成就] 读取对照表失败: ${err?.message || err}`)
  }
  return null
}

/**
 * 等级下标；未知等级按 -1（低于一切）处理
 */
function levelIndex (level) {
  return LEVEL_ORDER.indexOf(level)
}

/**
 * 更新用户在 KOOK 服务器上的成就角色（核心流程）
 *
 * 独立函数供 patSync.js（#同步成就 / #更新成就）调用：
 *   - 查目标用户绑定主账号 → PAT 数据 → 计算应得最高档 → 创建/授予/移除角色
 *
 * @param {object} e 消息事件对象（需含 reply、user_id、group_id 等）
 * @returns {Promise<boolean>}
 */
export async function updateTagForUser (e) {
  // 1. 仅支持 KOOK 服务器（角色在 KOOK 服务器上）
  if (!isKOOK(e)) {
    await e.reply('❌ 该功能仅支持在 KOOK 服务器内使用。')
    return true
  }

  // 2. 确定目标用户：@ 了别人则更新被 @ 用户，否则更新自己
  //    KOOK 的 e.at / e.user_id 带 'ko_' 前缀，与 account_data.json 的 key 一致，保留前缀直接查绑定
  let userId = String(e.user_id)
  let userLabel = '你'
  if (e.at && String(e.at) !== String(e.self_id)) {
    userId = String(e.at)
    userLabel = `用户 ${e.at}`
  }

  // 3. 查目标用户绑定的主账号
  const binding = ESOAccount.getPrimaryBinding(userId)
  if (!binding || !binding.accountName) {
    await e.reply(`❌ ${userLabel} 尚未绑定游戏账号。\n请先使用 #绑定@账号名 绑定后再更新。`)
    return true
  }
  const accountName = `@${binding.accountName}`

  // 4. 查 PAT 数据
  const record = PATStore.get(accountName)
  if (!record || !record.rawString) {
    await e.reply(`❌ 账号 ${accountName} 尚未上传过 PAT 成就二维码。\n请先使用 #上传成就 上传二维码。`)
    return true
  }
  const decoded = await decodePat(record.rawString)
  if (!decoded) {
    await e.reply(`❌ 账号 ${accountName} 的 PAT 数据无法解码（可能已损坏）。`)
    return true
  }

  // 5. 加载对照表
  const trials = loadTrialsRoles()
  if (!trials) {
    await e.reply('❌ 成就对照表加载失败，请联系管理员检查。')
    return true
  }

  // 6. 获取服务器角色列表 + 用户当前角色
  const roleList = await KOOK.roleList(e)
  if (!Array.isArray(roleList)) {
    await e.reply('❌ 无法获取服务器角色列表（权限不足或 KOOK 未连接）。')
    return true
  }
  const roleByName = new Map(roleList.map(r => [r.name, r]))

  // user/view 必须传 guild_id 才会返回该服务器的 roles 字段
  const { resolveGuildId } = await import('./apiKOOK.js')
  const guildId = await resolveGuildId(e)
  const userView = await KOOK.userView(e, userId, guildId)
  const userRoleIds = new Set((userView?.roles || []).map(String))
  const userRoles = new Set(
    roleList.filter(r => userRoleIds.has(String(r.role_id))).map(r => r.name)
  )

  // 7. 按副本分组计算应得最高档
  //    用户已完成的成就 ID 集合（裸 ID + 掩码展开）
  const completedIds = new Set(decoded.completedIds.keys())

  // 每个副本：用户完成档位 → 最高档信息
  // target: { raid, raidCn, level, id, role, roleInfo }
  const targets = []
  for (const t of trials) {
    let best = null
    for (const a of t.achievements) {
      if (!a.role) continue
      if (!completedIds.has(Number(a.id))) continue
      if (!best || levelIndex(a.level) > levelIndex(best.level)) {
        best = a
      }
    }
    if (best) {
      targets.push({ raid: t.raid, raidCn: t.raidCn, ...best })
    }
  }

  if (targets.length === 0) {
    await e.reply(`ℹ️ 账号 ${accountName} 的 PAT 数据中没有任何已关联角色的成就，无需更新。`)
    return true
  }

  // 8. 逐副本执行：移除低等级 role → 设置最高等级 role
  const stats = { added: [], upgraded: [], removed: [] }
  const messages = []
  // 第一轮创建失败的角色：等全部其他角色设置完成后统一重试一次
  const retryTargets = []

  for (const target of targets) {
    // 该副本下所有成就在服务器上的 role 名（含低等级）
    const trial = trials.find(t => t.raid === target.raid)
    const lowerRoles = new Set()
    for (const a of trial.achievements) {
      if (!a.role) continue
      if (levelIndex(a.level) < levelIndex(target.level)) {
        lowerRoles.add(a.role)
      }
    }

    // 8a. 移除用户当前拥有的低等级 role
    const toRemove = [...lowerRoles].filter(r => userRoles.has(r))
    for (const roleName of toRemove) {
      const role = roleByName.get(roleName)
      if (!role) continue
      await KOOK.roleRevoke(e, undefined, String(role.role_id), userId)
      stats.removed.push(roleName)
      messages.push(`🔻 移除低等级角色 ${roleName}`)
    }

    // 8b. 设置最高等级 role
    // 若用户已拥有该副本更高等级的 role（历史遗留，PAT 未显示更高成就）→ 不降级，跳过
    const hasHigher = trial.achievements.some(
      a => a.role && levelIndex(a.level) > levelIndex(target.level) && userRoles.has(a.role)
    )
    if (hasHigher) {
      messages.push(`✅ ${target.raidCn} 已拥有更高等级角色，无需变更`)
      continue
    }

    const targetRole = roleByName.get(target.role)
    let roleId = targetRole ? String(targetRole.role_id) : null
    if (!roleId) {
      // 角色在服务器上不存在 → 按对照表参数创建
      // （注意：已存在的 role 绝不修改任何参数，即使与对照表记录不一致，也直接复用其 role_id）
      const info = target.roleInfo || {}
      const opts = {}
      // color=0 是默认无色，不传避免 KOOK 十六进制校验问题
      if (info.color) opts.color = info.color
      if (info.hoist !== undefined) opts.hoist = Number(info.hoist)
      if (info.mentionable !== undefined) opts.mentionable = Number(info.mentionable)
      if (info.permissions !== undefined) opts.permissions = info.permissions
      const created = await KOOK.roleCreate(e, undefined, target.role, opts)
      if (created) {
        roleId = String(created.role_id)
        messages.push(`✨ 创建角色 ${target.role}`)
      } else {
        messages.push(`⚠️ 角色 ${target.role} 创建失败，将在最后重试`)
        retryTargets.push({ target, upgraded: toRemove.length > 0 })
        continue
      }
    }

    // 若用户尚无该最高等级 role → 授予
    if (!userRoles.has(target.role)) {
      const ok = await KOOK.roleGrant(e, undefined, roleId, userId)
      if (ok) {
        // 判定：有移除低等级 = 升级；否则 = 新增
        if (toRemove.length > 0) {
          stats.upgraded.push(target)
          messages.push(`⬆️ ${target.raidCn} 升级为 ${target.role}`)
        } else {
          stats.added.push(target)
          messages.push(`➕ ${target.raidCn} 新增角色 ${target.role}`)
        }
        userRoles.add(target.role)
      } else {
        messages.push(`❌ 授予角色 ${target.role} 失败（权限不足？）`)
      }
    } else {
      messages.push(`✅ ${target.raidCn} 已是最高等级 ${target.role}`)
    }
  }

  // 8c. 失败角色重试：全部其他角色设置完成后，再对第一轮创建失败的角色尝试一次
  if (retryTargets.length) {
    for (const { target, upgraded } of retryTargets) {
      const info = target.roleInfo || {}
      const opts = {}
      // color=0 是默认无色，不传避免 KOOK 十六进制校验问题
      if (info.color) opts.color = info.color
      if (info.hoist !== undefined) opts.hoist = Number(info.hoist)
      if (info.mentionable !== undefined) opts.mentionable = Number(info.mentionable)
      if (info.permissions !== undefined) opts.permissions = info.permissions
      const created = await KOOK.roleCreate(e, undefined, target.role, opts)
      if (!created) {
        messages.push(`⚠️ 角色 ${target.role} 创建失败（重试后仍失败），跳过`)
        continue
      }
      const roleId = String(created.role_id)
      const ok = await KOOK.roleGrant(e, undefined, roleId, userId)
      if (ok) {
        if (upgraded) {
          stats.upgraded.push(target)
          messages.push(`⬆️ ${target.raidCn} 升级为 ${target.role}（重试成功）`)
        } else {
          stats.added.push(target)
          messages.push(`➕ ${target.raidCn} 新增角色 ${target.role}（重试成功）`)
        }
      } else {
        messages.push(`❌ 授予角色 ${target.role} 失败（权限不足？）`)
      }
    }
  }

  // 9. 输出统计
  const lines = []
  lines.push(`📊 本次更新（账号 ${accountName}，PAT 数据日期 ${record.updateTime}）`)
  if (messages.length) lines.push(...messages.map(m => `  ${m}`))
  lines.push('')
  lines.push(`本次更新，新增了 ${stats.added.length} 个成就${stats.added.length ? '：' + stats.added.map(t => t.raidCn).join('、') : ''}。`)
  lines.push(`本次更新，升级了 ${stats.upgraded.length} 个成就${stats.upgraded.length ? '：' + stats.upgraded.map(t => t.raidCn).join('、') : ''}。`)
  if (stats.removed.length) {
    lines.push(`本次更新，移除了 ${stats.removed.length} 个低等级角色：${stats.removed.join('、')}。`)
  }
  if (stats.added.length === 0 && stats.upgraded.length === 0 && stats.removed.length === 0) {
    lines.push('ℹ️ 所有成就对应的角色均已是最新，无需变更。')
  }

  await e.reply(lines.join('\n'))
  return true
}
