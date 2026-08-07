/**
 * PAT v5 rawString 编码器（patEncoder.js）
 *
 * 与 patDecoder.js 互逆：把「已完成的成就 ID 集合」压缩回 PAT v5 原始字符串。
 * 生成逻辑参照 PithkaAchievementTracker/data/generateQR.lua：
 *   - 掩码组（ta/tb/tc/da/db/dc/dd）内的 ID → 位掩码编码（组内索引 0 = bit 0）
 *   - 掩码组外的 ID → 裸 ID 列表（逗号分隔）
 *   - 末尾追加校验和（与 generateQR.lua checksum 同算法）
 *
 * 格式：PAT,v5,gf_{n},{playerName},{date},{worldId},{裸ID...},{taX},{tbX},...,{checksum}
 */
import { checksum, MASK_GROUPS } from './patDecoder.js'

/** id → { group, shift } 反查表（掩码组内成就 ID） */
let maskIndexCache = null
function getMaskIndex () {
  if (maskIndexCache) return maskIndexCache
  const map = new Map()
  for (const [group, list] of Object.entries(MASK_GROUPS)) {
    for (let i = 0; i < list.length; i++) map.set(list[i], { group, shift: i })
  }
  maskIndexCache = map
  return map
}

/**
 * 将成就 ID 集合打包为 PAT v5 rawString
 * @param {Set<number>|number[]} achievementIds 已完成的成就 ID 集合
 * @param {object} meta 元数据
 * @param {string} [meta.playerName] 玩家名（@ 开头），缺省 '@Unknown'
 * @param {string} [meta.date] 日期 YYYYMMDD，缺省空
 * @param {number|string} [meta.worldId] 服务器 ID（1=NA），缺省 1
 * @param {string} [meta.gfUsage] 组队查找使用量字段（'gf_0'），缺省 'gf_0'
 * @returns {string} PAT v5 rawString
 */
export function encodePat (achievementIds, meta = {}) {
  const ids = Array.isArray(achievementIds) ? achievementIds : [...(achievementIds || [])]
  const maskIndex = getMaskIndex()

  const masks = { ta: 0, tb: 0, tc: 0, da: 0, db: 0, dc: 0, dd: 0 }
  const rawIds = []

  for (const id of ids) {
    const m = maskIndex.get(Number(id))
    if (m) {
      masks[m.group] |= (1 << m.shift)
    } else {
      rawIds.push(String(id))
    }
  }

  const parts = [
    'PAT',
    'v5',
    meta.gfUsage ?? 'gf_0',
    meta.playerName ?? '@Unknown',
    meta.date ?? '',
    String(meta.worldId ?? 1),
  ]
  parts.push(...rawIds)
  for (const [group, value] of Object.entries(masks)) {
    if (value !== 0) parts.push(group + value)
  }

  const body = parts.join(',')
  return `${body},${checksum(body)}`
}

/**
 * 从已有的 PAT rawString 提取元数据（供重新打包时保留原账号/日期/服务器信息）
 * @param {string} rawString 原 PAT rawString
 * @param {object} fallback 缺省值 { playerName, date, worldId }
 * @returns {object} { gfUsage, playerName, date, worldId }
 */
export function metaFromRaw (rawString, fallback = {}) {
  const parts = String(rawString || '').split(',')
  return {
    gfUsage: parts[2] || 'gf_0',
    playerName: parts[3] || fallback.playerName || '@Unknown',
    date: parts[4] || fallback.date || '',
    worldId: /^\d+$/.test(parts[5] || '') ? parts[5] : (fallback.worldId ?? 1),
  }
}
