/**
 * PAT 成就二维码解码器（patDecoder.js）
 *
 * 解码 PithkaAchievementTracker 插件生成的 v5 压缩二维码。
 * 二维码内容为 CSV 字符串：
 *   PAT,v5,gf_次数,玩家名,日期,服务器ID,成就列表...,掩码...,校验和
 *
 * 成就编码两种方式：
 *   1. 基础副本（baseDungeon）：直接列出已完成的成就 ID（优先 HM，其次 VET）
 *   2. 试炼/三合一/竞技场：位掩码压缩（7 组 ta/tb/tc/da/db/dc/dd）
 *
 * 掩码分组 ID 来自插件 data/generateQR.lua，副本名/成就档位映射来自
 * dataRaidsCN.json / dataRaidsEN.json（运行时缓存 data/eso/custome_resources/cache/segments/）
 *
 * 使用方式：
 *   import { decodePat } from '../model/patDecoder.js'
 *   const result = await decodePat('PAT,v5,gf_3,@User,20260804,1,1960,ta123,110')
 *   // result = { ok, playerName, date, world, checksumOk, achievements: [...] }
 */

import fs from 'node:fs'
import path from 'node:path'

/** Pithka 插件掩码组（generateQR.lua 原样）：组名 → 成就 ID 列表（索引 0 = bit 0） */
const MASK_GROUPS = {
  ta: [1474, 1136, 1503, 1137, 1462, 1138, 1368, 1344, 1391, 1810, 1829, 1838, 1836, 2077, 2085, 2086, 2079, 2087, 2075, 2133, 2134, 2135, 2136, 2139, 2140, 2435, 2469, 2470, 2466, 2467, 2468],
  tb: [2734, 2736, 2737, 2739, 2740, 2746, 2987, 3005, 3006, 3007, 3003, 3004, 3244, 3250, 3251, 3252, 3248, 3249, 3560, 3566, 3567, 3568, 3564, 3565, 4015, 4021, 4022, 4023, 4019, 4020, 4268],
  tc: [4274, 4275, 4276, 4272, 4273, 4517, 4485],
  da: [1960, 1965, 1966, 2102, 1976, 1981, 1982, 1983, 2153, 2154, 2158, 2159, 2163, 2164, 2167, 2168, 2261, 2262, 2266, 2267, 2271, 2272, 2275, 2276, 2426, 2427, 2430, 2431, 2416, 2417, 2421],
  db: [2422, 2540, 2541, 2545, 2546, 2550, 2551, 2554, 2555, 2695, 2755, 2700, 2701, 2705, 2706, 2709, 2710, 2832, 2833, 2837, 2838, 2842, 2843, 2846, 2847, 3017, 3018, 3022, 3023, 3027, 3028],
  dc: [3031, 3032, 3105, 3153, 3110, 3111, 3115, 3154, 3119, 3120, 3376, 3377, 3380, 3381, 3395, 3396, 3399, 3400, 3469, 3470, 3473, 3474, 3530, 3531, 3534, 3535, 3811, 3812, 3815, 3816, 3852],
  dd: [3853, 3856, 3857, 4110, 4111, 4114, 4115, 4129, 4130, 4133, 4134, 2363, 2364, 2368, 4335, 4336, 4339, 4340, 4312, 4313, 4316, 4317],
}

/** 服务器 ID → 名称（generateQR.lua worlds 数组，1 基） */
const WORLDS = ['NA Megaserver', 'EU Megaserver', 'XB1live', 'XB1live-eu', 'PS4live', 'PS4live-eu', 'PTS']

/** dataRaids 缓存（懒加载） */
let raidsCache = null

/**
 * 加载 dataRaids 映射（成就 ID → 副本信息）
 * 优先运行时缓存，回退 git 备份
 */
function loadRaids () {
  if (raidsCache) return raidsCache
  const candidates = [
    './data/eso/custome_resources/cache/segments',
    './plugins/eso/resources/data/segments',
  ]
  let en = null
  let cn = null
  for (const dir of candidates) {
    try {
      if (!en && fs.existsSync(path.join(dir, 'dataRaidsEN.json'))) {
        en = JSON.parse(fs.readFileSync(path.join(dir, 'dataRaidsEN.json'), 'utf8'))
      }
      if (!cn && fs.existsSync(path.join(dir, 'dataRaidsCN.json'))) {
        cn = JSON.parse(fs.readFileSync(path.join(dir, 'dataRaidsCN.json'), 'utf8'))
      }
    } catch (err) {
      logger?.warn?.(`[ESO:PAT] 读取 dataRaids 失败(${dir}): ${err?.message || err}`)
    }
    if (en && cn) break
  }
  if (!en) return null

  // 构建 成就ID → 副本信息 映射
  const idMap = new Map()
  for (const [key, row] of Object.entries(en)) {
    const cnRow = cn?.[key]
    const cnName = cnRow?.name || row.name
    for (const [field, id] of Object.entries(row.achievements || {})) {
      if (!id) continue
      idMap.set(Number(id), {
        raidKey: key,
        nameEn: row.name,
        nameCn: cnName,
        type: row.type || '',
        field, // VET / HM / TRI / EX / SR / ND / midHM1 / midHM2 / fakeTRI
        zoneId: row.zoneId,
        place: row.place,
      })
    }
  }
  raidsCache = { idMap, en, cn }
  return raidsCache
}

/**
 * 校验和计算（generateQR.lua checksum 逻辑）
 * sum = (sum << 5 + b) % 2^31，逐字符迭代
 */
export function checksum (str) {
  let sum = str.charCodeAt(0) || 0
  for (let i = 1; i < str.length; i++) {
    const b = str.charCodeAt(i)
    sum = ((sum * 32) + b) % 2147483648
  }
  return sum
}

/** 字段英文缩写 → 中文成就档位名 */
export const FIELD_CN = {
  VET: '老兵',
  HM: '困难',
  TRI: '三合一',
  EX: '进阶',
  SR: '不死',
  ND: '无死亡',
  midHM1: '+1',
  midHM2: '+2',
  fakeTRI: '挑战',
  CHA: '挑战',
}

/** 副本类型 → 中文分类 */
export const TYPE_CN = {
  trial: '试炼',
  dungeon: '三合一副本',
  arena: '竞技场',
  endless: '无尽档案馆',
  baseDungeon: '基础副本',
  'baseDungeon-wI': '基础副本',
  'baseDungeon-noI': '基础副本',
}

/**
 * 解码 PAT 二维码内容
 * @param {string} qrString 二维码解析出的纯文本
 * @returns {object|null} 解码结果；无法识别返回 null
 */
export async function decodePat (qrString) {
  if (!qrString || typeof qrString !== 'string') return null
  const parts = qrString.split(',')
  if (parts[0] !== 'PAT') return null

  const version = parts[1] || ''
  // 解析头部
  let idx = 2
  const gfRaw = parts[idx++] || ''
  const playerName = parts[idx++] || ''
  const date = parts[idx++] || ''
  const worldRaw = parts[idx++] || ''
  const world = /^\d+$/.test(worldRaw) ? (WORLDS[Number(worldRaw) - 1] || worldRaw) : worldRaw

  // 收集裸成就 ID 和掩码
  const rawIds = []
  const masks = {}
  for (; idx < parts.length; idx++) {
    const p = parts[idx]
    if (/^(ta|tb|tc|da|db|dc|dd)\d+$/.test(p)) {
      const m = p.match(/^(ta|tb|tc|da|db|dc|dd)(\d+)$/)
      masks[m[1]] = Number(m[2])
    } else if (/^\d+$/.test(p)) {
      rawIds.push(Number(p))
    }
    // 最后一个字段可能是校验和（纯数字），但被上面的裸 ID 分支捕获，
    // 需在解码后剔除——见下方 checksum 校验
  }

  // 校验和：CSV 最后一个字段
  const csRaw = parts[parts.length - 1]
  let checksumOk = null
  let checksumVal = null
  if (/^\d+$/.test(csRaw || '')) {
    checksumVal = Number(csRaw)
    const body = parts.slice(0, -1).join(',')
    checksumOk = checksum(body) === checksumVal
    // 校验和字段不应计入成就 ID（从 rawIds 剔除）
    if (rawIds.length && rawIds[rawIds.length - 1] === checksumVal) {
      rawIds.pop()
    }
  }

  // 展开掩码 → 成就 ID 集合（记录来源组）
  const completedIds = new Map() // id → maskGroup（undefined 表示裸 ID）
  for (const id of rawIds) completedIds.set(id, undefined)
  for (const [group, value] of Object.entries(masks)) {
    const ids = MASK_GROUPS[group]
    if (!ids) continue
    for (let bit = 0; bit < ids.length; bit++) {
      if ((value >> bit) & 1) completedIds.set(ids[bit], group)
    }
  }

  // 用 dataRaids 反查成就信息
  const raids = loadRaids()
  const achievements = []
  if (raids) {
    for (const [id, maskGroup] of completedIds) {
      const info = raids.idMap.get(id)
      if (info) {
        achievements.push({
          id,
          maskGroup,
          ...info,
          fieldCn: FIELD_CN[info.field] || info.field,
        })
      } else {
        achievements.push({ id, maskGroup, nameEn: `成就#${id}`, nameCn: `成就#${id}`, type: '', field: '', fieldCn: '未知' })
      }
    }
  } else {
    for (const id of completedIds.keys()) achievements.push({ id, nameEn: `成就#${id}`, nameCn: `成就#${id}`, type: '', field: '', fieldCn: '未知' })
  }

  return {
    ok: true,
    version,
    gfUsage: gfRaw,
    playerName,
    date,
    world,
    checksumOk,
    checksumVal,
    masks,
    rawIds,
    completedIds,
    achievements,
  }
}

/**
 * 生成人类可读的成就报告文本
 * @param {object} result decodePat 的返回
 * @param {boolean} useCn 是否用中文名
 */
export function formatPatReport (result, useCn = true) {
  if (!result || !result.ok) return '二维码内容无法识别为 PAT 成就格式。'
  const lines = []
  lines.push(`🎖️ PAT 成就报告`)
  lines.push(`👤 ${result.playerName} | 📅 ${result.date} | 🌍 ${result.world}`)
  if (result.version) lines.push(`📦 版本: ${result.version} | 组队查找使用: ${result.gfUsage.replace('gf_', '')} 次`)
  if (result.checksumOk === false) lines.push(`⚠️ 校验和不匹配（二维码可能被篡改）`)

  // 按类型分组（裸 ID=基础副本；掩码组：ta/tb/tc=试炼，da/db/dc/dd=三合一/竞技场）
  const byType = {}
  for (const a of result.achievements) {
    let t
    if (a.maskGroup) {
      t = a.maskGroup.startsWith('t') ? '试炼' : '三合一/竞技场'
    } else {
      t = '基础副本'
    }
    if (!byType[t]) byType[t] = []
    byType[t].push(a)
  }

  const typeOrder = ['试炼', '三合一/竞技场', '无尽档案馆', '基础副本', '其他']
  let empty = true
  for (const t of typeOrder) {
    const list = byType[t]
    if (!list || list.length === 0) continue
    empty = false
    lines.push(`\n━━━ ${t} (${list.length}) ━━━`)
    // 按副本聚合
    const byRaid = {}
    for (const a of list) {
      const key = useCn ? a.nameCn : a.nameEn
      if (!byRaid[key]) byRaid[key] = { nameEn: a.nameEn, nameCn: a.nameCn, fields: [] }
      byRaid[key].fields.push(a.fieldCn || a.field)
    }
    for (const [name, r] of Object.entries(byRaid)) {
      const en = useCn && r.nameEn !== r.nameCn ? ` (${r.nameEn})` : ''
      lines.push(`  ✅ ${name}${en}: ${r.fields.join(' / ')}`)
    }
  }
  if (empty) lines.push('\n（未解析出成就）')
  return lines.join('\n')
}
