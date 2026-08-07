/**
 * PAT 成就双向同步（patSync.js）
 *
 * 合并本地 pat.json 与 ESOCN 服务器上的成就数据（并集），并：
 *   1. 本地有变化 → 重新打包 rawString 保存回本地 pat.json（force 覆盖）
 *   2. 保存了本地且用户为 KOOK 用户 → 调用 #更新成就 逻辑更新 KOOK 角色
 *   3. ESOCN 返回的试炼档位有变化 → 将 rawString 上传到 ESOCN（esoBotUploadPAT）
 *
 * 供 apps/syncAchievements.js（#同步成就）及其他命令调用。
 */
import PATStore from './patStore.js'
import ESOAccount from './esoAccount.js'
import { decodePat, loadRaids } from './patDecoder.js'
import { encodePat, metaFromRaw } from './patEncoder.js'
import { isKOOK } from './apiKOOK.js'
import { ESOCN_API } from '../apps/esocn.js'
import { updateTagForUser } from '../apps/updateTag.js'

const BASE_URL = ESOCN_API.BASE_URL

/** fetch 带超时（node fetch 默认无超时，避免 ESOCN 偶发挂起时无限等待） */
async function fetchWithTimeout (url, opts = {}, timeoutMs = 20000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`ESOCN 请求超时（>${Math.round(timeoutMs / 1000)}s）`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** ESOCN 返回档位字段 → dataRaids achievements 字段 */
const FLAG_TO_FIELD = { vet: 'VET', hm: 'HM', phm1: 'midHM1', phm2: 'midHM2', tri: 'TRI' }
/** ESOCN 能反映的档位（对比/上传时只看这些；EX 等 esocn 无档位概念，不参与对比） */
const COMPARE_FIELDS = ['VET', 'HM', 'midHM1', 'midHM2', 'TRI']

const setEqual = (a, b) => a.size === b.size && [...a].every(x => b.has(x))
const todayStr = () => {
  const n = new Date()
  return `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}${String(n.getDate()).padStart(2, '0')}`
}

/** 从 ESOCN 获取用户试炼成就（data 数组）；失败抛错 */
async function fetchEsocnAchievements (esocnUserId) {
  const res = await fetchWithTimeout(`${BASE_URL}/api/achievement/getUserPveAchievement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: esocnUserId }),
  })
  if (!res.ok) throw new Error(`ESOCN 查询失败 HTTP ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.message || 'ESOCN 查询失败')
  return json.data || []
}

/** 上传 PAT rawString 到 ESOCN；成功返回 true，失败抛错 */
async function uploadPatToEsocn (esocnUserId, pat) {
  const res = await fetchWithTimeout(`${BASE_URL}/api/achievement/esoBotUploadPAT`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ESOCN_API.TOKEN}`,
    },
    body: JSON.stringify({ userId: esocnUserId, pat }),
  })
  if (!res.ok) throw new Error(`ESOCN 上传失败 HTTP ${res.status}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.message || 'ESOCN 上传失败')
  return true
}

/** 按 dataRaidsCN 中文名反查试炼 key；找不到返回 null */
function findRaidKeyByCnName (cnName, cnRaids) {
  for (const [key, row] of Object.entries(cnRaids || {})) {
    if (row && row.name === cnName) return key
  }
  return null
}

/**
 * 将 ESOCN 返回的试炼数组转成：
 *   { ids: Set, trials: [{ name, enName, raidKey, ach, trialIds }] }
 * ids = ESOCN 上已完成的成就 ID（仅 5 档位映射到的）
 * trials 保留每个试炼的档位详情供第 4 步对比
 */
function esocnDataToIds (esocnData, raids) {
  const ids = new Set()
  const trials = []
  for (const t of esocnData || []) {
    const key = t.name ? findRaidKeyByCnName(t.name, raids.cn) : null
    const ach = (key && raids.en[key]) ? (raids.en[key].achievements || {}) : {}
    const trialIds = new Set()
    if (key) {
      for (const [flag, field] of Object.entries(FLAG_TO_FIELD)) {
        if (t[flag] === 1 && ach[field]) {
          ids.add(ach[field])
          trialIds.add(ach[field])
        }
      }
    }
    trials.push({ name: t.name, enName: t.enName || '', raidKey: key, ach, trialIds })
  }
  return { ids, trials }
}

/**
 * 同步一个用户的本地 PAT 与 ESOCN 成就（核心函数，供各命令调用）
 * @param {object} e 消息事件对象
 * @param {string} targetUserId 操作对象用户 ID（QQ / ko_xxx / wx_xxx）
 * @param {string} [targetLabel] 展示名（'你' / '用户 xxx'）
 * @returns {Promise<string>} 汇报文本（由调用方 reply）
 */
export async function syncAchievementsForUser (e, targetUserId, targetLabel = '该用户') {
  // ── 1. 绑定检查（需 ESOCN 账户：user_id 非 0） ──
  const binding = ESOAccount.getPrimaryBinding(targetUserId)
  if (!binding || !binding.accountName) {
    return `❌ ${targetLabel} 尚未绑定游戏账号。\n请先使用 #绑定@账号名 绑定。`
  }
  if (!binding.user_id || binding.user_id === 0) {
    return `❌ ${targetLabel} 尚未绑定 ESOCN 账户。\n请先在 esocn.com.cn 登录并生成绑定码，发送 #BCXXXXXX 完成绑定。`
  }
  const accountName = `@${binding.accountName}`
  const esocnUserId = String(binding.user_id).padStart(7, '0')

  // ── 2. 获取 ESOCN 成就 + 解码本地 PAT ──
  let esocnData = []
  let esocnError = null
  try {
    esocnData = await fetchEsocnAchievements(esocnUserId)
  } catch (err) {
    esocnError = err.message || String(err)
  }
  if (esocnError) {
    return `❌ ${targetLabel} 的 ESOCN 成就获取失败：${esocnError}\n本次同步中止，本地数据未改动。`
  }

  const localRecord = PATStore.get(accountName)
  const localRaw = localRecord?.rawString || ''
  const localIds = new Set()
  let localDecoded = null
  if (localRaw) {
    localDecoded = await decodePat(localRaw)
    if (localDecoded && localDecoded.ok) {
      for (const id of localDecoded.completedIds.keys()) localIds.add(Number(id))
    }
  }

  // esocn 档位 → ID 集合
  const raids = loadRaids()
  const { ids: esocnIds, trials: esocnTrials } = esocnDataToIds(esocnData, raids)

  // ── 3. 合并（并集）：esocn 有或本地有 → 视为已获取 ──
  const mergedIds = new Set([...localIds, ...esocnIds])

  // ── 4. 对比本地：有变化则打包保存到本地 pat.json ──
  const localChanged = !setEqual(mergedIds, localIds)
  const localAddedCount = [...mergedIds].filter(id => !localIds.has(id)).length

  let newRawString = null
  let savedLocal = false
  if (localChanged) {
    const fallback = { playerName: accountName, date: todayStr(), worldId: 1 }
    const meta = localRaw ? metaFromRaw(localRaw, fallback) : fallback
    newRawString = encodePat(mergedIds, meta)
    const saved = PATStore.set(newRawString, accountName, { force: true })
    savedLocal = !!saved.success
  }

  // 更新了本地 + 用户是 KOOK 用户 → 调用 #更新成就 更新角色
  let roleNote = ''
  if (savedLocal && String(targetUserId).startsWith('ko_')) {
    if (isKOOK(e)) {
      await updateTagForUser(e) // 内部自行 reply 角色更新结果
    } else {
      roleNote = '\nℹ️ 该用户为 KOOK 用户，但当前消息不在 KOOK 服务器，请在 KOOK 内执行 #更新成就 更新角色。'
    }
  }

  // ── 5. 对比 ESOCN（仅其返回的试炼，档位限 5 项）：有变化则上传 ──
  let esocnChanged = false
  for (const t of esocnTrials) {
    if (!t.raidKey) continue
    const mergedTrialIds = new Set(
      [...mergedIds].filter(id => COMPARE_FIELDS.some(f => t.ach[f] === id))
    )
    if (!setEqual(mergedTrialIds, t.trialIds)) {
      esocnChanged = true
      break
    }
  }

  let esocnNote = ''
  if (esocnChanged) {
    // 需要上传的 rawString：优先第 4 步生成的；没有则现在打包（合并集合）
    const raw = newRawString || encodePat(mergedIds, localRaw ? metaFromRaw(localRaw, { playerName: accountName, date: todayStr(), worldId: 1 }) : { playerName: accountName, date: todayStr(), worldId: 1 })
    try {
      await uploadPatToEsocn(esocnUserId, raw)
      esocnNote = '已上传最新成就至 ESOCN。'
    } catch (err) {
      esocnNote = `⚠️ ESOCN 上传失败：${err.message || err}`
    }
  } else {
    esocnNote = '本次 ESOCN 无更新。'
  }

  // ── 6. 汇报 ──
  const lines = []
  lines.push('完成同步！')
  lines.push(esocnNote)
  if (localChanged) {
    lines.push(savedLocal
      ? `本地数据更新了 ${localAddedCount} 个成就。`
      : `本地数据需要更新 ${localAddedCount} 个成就，但写入失败。`)
  } else {
    lines.push('本地数据无变化。')
  }
  if (roleNote) lines.push(roleNote)
  return lines.join('\n')
}
