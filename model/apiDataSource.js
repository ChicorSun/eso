import fs from 'node:fs'
import path from 'node:path'
import fetch from 'node-fetch'
import undauntedApi from './undauntedApi.js'
import gearConfig from './gearConfig.js'

/**
 * ESOCN API 图鉴数据源
 * 从 api.esocn.com.cn 拉取数据并构建与本地 segments 完全同构的内存结构，
 * 供 database.js 在 srcMode='api' 时填充模块级变量，渲染层零改动复用。
 */
const BASE = 'https://api.esocn.com.cn'
const CACHE_PATH = './data/eso/custome_resources/cache/atlas_api_cache.json'
const LOG = '[ESO:图鉴:API]'
const FETCH_TIMEOUT = 15000

/** 样式部位/护甲类型 中→英 映射（API styles 中文键 → 本地 Apparel 键） */
const STYLE_SLOT_MAP = {
  '头部': 'Head', '肩部': 'Shoulders', '胸甲': 'Chest', '腰部': 'Waist',
  '腿部': 'Legs', '足部': 'Feet', '手部': 'Hands', '颈部装备': 'Neck', '戒指': 'Ring'
}
const STYLE_WEIGHT_MAP = { '轻型': 'Light', '中型': 'Medium', '重型': 'Heavy' }

/** 散件类型 中文词 → 本地数字枚举（formatSetItemWeight 的逆映射） */
const ARMOR_TYPE_REV = { '轻甲': 1, '中甲': 2, '重甲': 3 }
const WEAPON_TYPE_REV = {
  '单手斧': 1, '单手锤': 2, '单手剑': 3, '双手剑': 4, '双手斧': 5, '双手锤': 6,
  '弓': 8, '恢复法杖': 9, '匕首': 11, '炼狱法杖': 12, '寒冰法杖': 13, '盾牌': 14, '闪电法杖': 15
}
const EQUIP_TYPE_REV = {
  '头部': 1, '项链': 2, '胸甲': 3, '肩甲': 4, '腰带': 8, '腿甲': 9,
  '脚部': 10, '手部': 13, '戒指': 12, '单手': 5, '双手': 6, '盾牌': 7
}

/** 技能目标 中→英（本地 EN 结构使用英文 target） */
const TARGET_CN2EN = { '自身': 'Self', '地面': 'Ground', '敌人': 'Enemy', '区域': 'Area', '扇形': 'Cone' }

/** API class_id → 本地技能线键（1 Class/2 Weapon/3 Armor/4 World/5 Guild/6 Alliance War/7 Racial/8 Craft） */
const LINE_MAP = { 1: '1', 2: '1', 3: '1', 4: '1', 5: '1', 6: '1', 7: '1', 8: '2', 9: '3', 10: '4', 11: '5', 12: '6', 13: '7', 14: '8' }
const LINE_NAMES = {
  '1': ['Class', '职业'], '2': ['Weapon', '武器'], '3': ['Armor', '护甲'], '4': ['World', '世界'],
  '5': ['Guild', '公会'], '6': ['Alliance War', '联盟战争'], '7': ['Racial', '种族'], '8': ['Craft', '制作']
}

let cache = null
let cachePromise = null
const buffRelatedCache = new Map()
/** 无畏校准码缓存：{ passDay, adjust }，按轮换日（与 passDays 同日滚动）失效 */
let adjustCache = { passDay: -1, adjust: null }

async function fetchJson (url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  let res
  try {
    res = await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    throw new Error(`请求失败 ${url}: ${err && err.message || err}`)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  const json = await res.json()
  if (!json || json.success !== true) throw new Error(`接口返回失败 ${url}`)
  return json.data
}

async function postJson (url, body) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

/** 单例 Promise 加载缓存，避免并发 loadCache 产生多个缓存对象互相覆盖 */
async function loadCache () {
  if (cache) return cache
  if (!cachePromise) {
    cachePromise = (async () => {
      let version = ''
      try {
        version = await fetchJson(`${BASE}/api/esocn-version`)
      } catch (err) {
        logger.error(`${LOG} 获取数据版本失败: ${err.message}`)
      }
      let stored = null
      try {
        stored = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'))
      } catch {}
      if (stored && stored.version && stored.version === version && stored.data) {
        cache = stored
        logger.info(`${LOG} 使用 API 数据缓存（版本 ${version}）`)
      } else {
        cache = { version, data: {} }
      }
      return cache
    })()
  }
  return cachePromise
}

function saveCache () {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache))
  } catch (err) {
    logger.error(`${LOG} 缓存写入失败: ${err && err.message || err}`)
  }
}

/** 带持久化缓存的数据获取（按 esocn-version 失效） */
async function cachedFetch (key, fetcher) {
  const c = await loadCache()
  if (c.data[key]) return c.data[key]
  const v = await fetcher()
  c.data[key] = v
  saveCache()
  return v
}

/** 分页拉取家具/收藏品全量列表（searchQuery 接口的分页参数） */
async function fetchAllPages (pathBase) {
  const items = []
  let page = 1
  let limit = 1000
  let totalPages = 1
  do {
    let resp
    try {
      resp = await fetchJson(`${BASE}${pathBase}?params%5Bpage%5D=${page}&params%5Blimit%5D=${limit}&params%5BsortBy%5D=id&params%5BsortOrder%5D=asc`)
    } catch (err) {
      if (limit > 100) {
        limit = 100
        page = 1
        items.length = 0
        continue
      }
      throw err
    }
    items.push(...(resp.list || []))
    totalPages = (resp.pagination && resp.pagination.totalPages) || 1
    page++
  } while (page <= totalPages)
  return items
}

/** 图标扩展名统一为 .dds（本地 splitStr(icon,'icons/','.dds') 依赖该后缀） */
function dds (icon) {
  return (icon || '').replace(/\.webp$/i, '.dds')
}

function convertStyles (styles) {
  const out = {}
  if (!styles || typeof styles !== 'object') return out
  const apparel = styles['护甲']
  if (apparel) {
    out.Apparel = {}
    for (const [partCN, weights] of Object.entries(apparel)) {
      const partEN = STYLE_SLOT_MAP[partCN]
      if (!partEN) continue
      out.Apparel[partEN] = {}
      for (const [wCN, info] of Object.entries(weights || {})) {
        const wEN = STYLE_WEIGHT_MAP[wCN]
        if (!wEN) continue
        out.Apparel[partEN][wEN] = { icon: dds(info.icon), style: info.style || '', styleId: Number(info.styleId) || 0 }
      }
    }
  }
  if (styles['武器']) out.Weapon = styles['武器']
  return out
}

/** API bonuses {effect1..n} → 本地 bonuses {'5': {'1': 文本, ...}}（渲染只读 tier '5' 全量词条） */
function convertBonuses (b) {
  const inner = {}
  if (b && typeof b === 'object') {
    Object.keys(b).sort().forEach((k, i) => { inner[String(i + 1)] = b[k] })
  }
  return { '5': inner }
}

function stripRomanNum (name) {
  return (name || '').replace(/\s+(I{1,3}|IV|V)$/, '')
}

/** 名称归一化：去不可见字符（U+200E 等）、去首尾空格、小写、去前导 The（副本 equipment 列表与套装 enName 存在脏数据差异） */
function normSetName (name) {
  return (name || '').replace(/[‎‏﻿]/g, '').trim().toLowerCase().replace(/^the\s+/, '')
}

function buildSets (equipmentAll, dungeonsAll, idToSetMap) {
  // 副本 → 套装 反查（用于 place 富化与 categoryName）
  const setDungeons = {}
  for (const dg of dungeonsAll) {
    for (const setEn of dg.equipment || []) {
      const key = normSetName(setEn)
      if (!key) continue
      ;(setDungeons[key] = setDungeons[key] || []).push({ cn: dg.name, en: dg.enName })
    }
  }

  const setsEN = {}
  const setsCN = {}
  for (const s of equipmentAll) {
    const id = String(s.id)
    const dgs = setDungeons[normSetName(s.enName)] || []
    const catEN = dgs.length ? stripRomanNum(dgs[0].en) : ''
    const catCN = dgs.length ? stripRomanNum(dgs[0].cn) : ''
    const placeEN = { '1': s.enplace || '' }
    const placeCN = { '1': s.place || '' }
    dgs.forEach((d, i) => {
      placeEN[String(i + 2)] = d.en
      placeCN[String(i + 2)] = d.cn
    })
    const styles = convertStyles(s.styles)
    setsCN[id] = {
      id: s.id, name: s.name, type: Number(s.type), categoryName: catCN,
      place: placeCN, bonuses: convertBonuses(s.bonuses), styles, itemIDs: {}
    }
    setsEN[id] = {
      id: s.id, name: s.enName, type: Number(s.type), categoryName: catEN,
      place: placeEN, bonuses: convertBonuses(s.en_bonuses), styles, itemIDs: {}
    }
  }

  // 散件（item: 链接与独特物品展示）
  for (const [itemId, v] of Object.entries(idToSetMap)) {
    const sid = String(v.setId)
    if (!setsEN[sid]) continue
    const armorType = ARMOR_TYPE_REV[v.armorType] || 0
    const weaponType = WEAPON_TYPE_REV[v.weaponType] || 0
    const equipType = EQUIP_TYPE_REV[v.equipType] || 0
    setsEN[sid].itemIDs[itemId] = { armorType, weaponType, equipType, name: v.enName || '', icon: dds(v.icon) }
    setsCN[sid].itemIDs[itemId] = { armorType, weaponType, equipType, name: v.name || '', icon: dds(v.icon) }
  }

  return { setsEN, setsCN }
}

function buildSkillObj (raw, lang) {
  const isEN = lang === 'en'
  const powerTypes = {}
  if (Number(raw.magickaCost) > 0) powerTypes['1'] = Number(raw.magickaCost)
  if (Number(raw.staminaCost) > 0) powerTypes['4'] = Number(raw.staminaCost)
  if (Number(raw.healthCost) > 0) powerTypes['32'] = Number(raw.healthCost)
  const styleIds = {}
  if (Array.isArray(raw.styleCollectibleIds)) {
    raw.styleCollectibleIds.forEach((v, i) => { styleIds[String(i + 1)] = v })
  }
  return {
    id: Number(raw.sid),
    name: isEN ? (raw.enName || raw.name || '') : (raw.name || ''),
    description: isEN ? '' : (raw.description || ''),
    ultimate: !!raw.ultimate,
    passive: !!raw.passive,
    IsCrafted: false,
    isDamage: false,
    isHealer: false,
    isTank: false,
    cost: Number(raw.cost) || 0,
    costPerTick: { '1': 0, '2': 0 },
    powerTypes,
    castTime: Number(raw.castTime) || 0,
    duration: Number(raw.duration) || 0,
    radius: Number(raw.radius) || 0,
    maxRange: Number(raw.maxRange) || 0,
    minRange: Number(raw.minRange) || 0,
    distance: 0,
    target: isEN ? (TARGET_CN2EN[raw.target] ?? (raw.target || '')) : (raw.target || ''),
    earnedRank: Number(raw.index) || 1,
    isChanneled: !!raw.isChanneled,
    icon: dds(raw.icon),
    styleCollectibleIds: styleIds,
    descHeader: raw.descHeader || '',
    newEffect: raw.newEffect || ''
  }
}

function buildSkills (skillsFull) {
  const { skill_trees: trees, skills, skill_variants: variants } = skillsFull
  const skillsEN = {}
  const skillsCN = {}
  for (const [line, names] of Object.entries(LINE_NAMES)) {
    skillsEN[line] = { name: names[0] }
    skillsCN[line] = { name: names[1] }
  }
  skillsEN['9'] = { name: 'Champion' }
  skillsCN['9'] = { name: '勇士' }
  skillsEN.scriptList = {}
  skillsCN.scriptList = {}

  const variantsByParent = {}
  for (const v of variants) {
    ;(variantsByParent[v.parent_sid] = variantsByParent[v.parent_sid] || []).push(v)
  }
  const treesByLine = {}
  for (const t of trees) {
    const line = LINE_MAP[t.class_id]
    if (!line) continue
    ;(treesByLine[line] = treesByLine[line] || []).push(t)
  }
  const skillsByTree = {}
  for (const s of skills) {
    ;(skillsByTree[s.skillTreeSid] = skillsByTree[s.skillTreeSid] || []).push(s)
  }

  for (const [line, lineTrees] of Object.entries(treesByLine)) {
    lineTrees.sort((a, b) => Number(a.sid) - Number(b.sid))
    let classIdx = 0
    for (const t of lineTrees) {
      classIdx++
      const ck = String(classIdx)
      const treeEN = { name: t.enName, id: Number(t.sid), skills: {} }
      const treeCN = { name: t.name, id: Number(t.sid), skills: {} }
      const list = (skillsByTree[t.sid] || []).slice().sort((a, b) => (a.index || 0) - (b.index || 0))
      let skillIdx = 0
      for (const s of list) {
        skillIdx++
        const sk = String(skillIdx)
        const enObj = buildSkillObj(s, 'en')
        const cnObj = buildSkillObj(s, 'cn')
        const morphs = (variantsByParent[s.sid] || []).slice().sort((a, b) => (a.index || 0) - (b.index || 0))
        for (const v of morphs) {
          const mk = String(v.index)
          enObj[mk] = buildSkillObj(v, 'en')
          enObj[mk].parentAbilityId = Number(v.parent_sid)
          cnObj[mk] = buildSkillObj(v, 'cn')
          cnObj[mk].parentAbilityId = Number(v.parent_sid)
        }
        treeEN.skills[sk] = enObj
        treeCN.skills[sk] = cnObj
      }
      skillsEN[line][ck] = treeEN
      skillsCN[line][ck] = treeCN
    }
  }
  return { skillsEN, skillsCN }
}

function ingredientsToStr (ing) {
  if (!ing || typeof ing !== 'object') return ''
  return Object.entries(ing).map(([n, c]) => `${n} (${c})`).join(', ')
}

function buildFoods (foodsList) {
  const foodsEN = {}
  const foodsCN = {}
  for (const f of foodsList) {
    const id = String(f.id)
    foodsCN[id] = {
      id: f.id, name: f.name, itemTypeText: f.itemTypeText || '',
      specializedItemTypeText: f.specializedItemTypeText || '', quality: f.quality || '',
      canBeCrafted: !!f.canBeCrafted, icon: dds(f.icon),
      description: f.description || '', ingredients: ingredientsToStr(f.ingredients)
    }
    foodsEN[id] = { ...foodsCN[id], name: f.enName || f.name, description: '', ingredients: '' }
  }
  return { foodsEN, foodsCN }
}

function buildFurnitures (list) {
  const furnEN = {}
  const furnCN = {}
  for (const f of list) {
    const id = String(f.id)
    furnCN[id] = {
      id: f.id, name: f.name, category: f.category || '', subcategory: f.subCategory || '',
      quality: f.quality || '', icon: dds(f.icon), tags: '', description: f.description || ''
    }
    furnEN[id] = { ...furnCN[id], name: f.enName || f.name }
  }
  return { furnEN, furnCN }
}

function buildCollFurnitures (list) {
  const collEN = {}
  const collCN = {}
  for (const f of list) {
    const id = String(f.id)
    collCN[id] = {
      id: f.id, name: f.name, category: f.category || '', furnitureId: f.furnitureId || 0,
      icon: dds(f.icon), hint: f.hint || '', description: f.description || ''
    }
    collEN[id] = { ...collCN[id], name: f.enName || f.name }
  }
  return { collEN, collCN }
}

function buildRaids (trialsList) {
  const raidsEN = {}
  const raidsCN = {}
  let i = 0
  for (const t of trialsList) {
    i++
    const placeEN = {}
    const placeCN = {}
    ;(Array.isArray(t.enplace) ? t.enplace : [t.enplace]).filter(Boolean).forEach((p, j) => { placeEN[String(j + 1)] = p })
    ;(Array.isArray(t.place) ? t.place : [t.place]).filter(Boolean).forEach((p, j) => { placeCN[String(j + 1)] = p })
    raidsEN[String(i)] = { name: t.enName || t.name, achievements: {}, isRequiredDLC: t.DLC !== '本体', place: placeEN, type: 'trial' }
    raidsCN[String(i)] = { name: t.name || t.enName, achievements: {}, isRequiredDLC: t.DLC !== '本体', place: placeCN, type: 'trial' }
  }
  return { raidsEN, raidsCN }
}

export default {
  /**
   * 拉取全部 API 数据并构建与本地 segments 同构的结构
   * @returns {Promise<{setsEN, setsCN, skillsEN, skillsCN, foodsEN, foodsCN, furnEN, furnCN, collEN, collCN, raidsEN, raidsCN}>}
   */
  async loadAll () {
    const [equipmentAll, skillsFull, foodsList, dungeonsAll, idToSetMap, furnitureList, collList, trialsList] = await Promise.all([
      cachedFetch('equipmentAll', () => fetchJson(`${BASE}/api/equipment/all`)),
      cachedFetch('skillsFull', () => fetchJson(`${BASE}/api/skills`)),
      cachedFetch('foodsList', () => fetchJson(`${BASE}/api/foods`)),
      cachedFetch('dungeonsAll', () => fetchJson(`${BASE}/api/dungeons/dungeon`)),
      cachedFetch('idToSetMap', async () => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 60000)
        try {
          const res = await fetch(`${BASE}/equipment_id_to_set_map.json`, { signal: controller.signal })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return await res.json()
        } finally {
          clearTimeout(timer)
        }
      }),
      cachedFetch('furnitureList', () => fetchAllPages('/api/furniture/list')),
      cachedFetch('collList', () => fetchAllPages('/api/furniture/collectible/list')),
      cachedFetch('trialsList', () => fetchJson(`${BASE}/api/trials`))
    ])

    const { setsEN, setsCN } = buildSets(equipmentAll, dungeonsAll, idToSetMap)
    const { skillsEN, skillsCN } = buildSkills(skillsFull)
    const { foodsEN, foodsCN } = buildFoods(foodsList)
    const { furnEN, furnCN } = buildFurnitures(furnitureList)
    const { collEN, collCN } = buildCollFurnitures(collList)
    const { raidsEN, raidsCN } = buildRaids(trialsList)

    // 极简/均衡挡位：释放 API 原始载荷（磁盘缓存保留），降低常驻内存 ~30-50MB
    if (gearConfig.isLightPayload() && cache && cache.data) {
      for (const key of ['equipmentAll', 'skillsFull', 'foodsList', 'furnitureList', 'collList', 'idToSetMap', 'dungeonsAll', 'trialsList']) {
        delete cache.data[key]
      }
      logger.info(`${LOG} 极简载荷模式：已释放 API 原始载荷（磁盘缓存保留）`)
    }

    logger.info(`${LOG} 数据构建完成: 套装 ${Object.keys(setsEN).length} / 食物 ${Object.keys(foodsEN).length} / 家具 ${Object.keys(furnEN).length} / 收藏品 ${Object.keys(collEN).length}`)
    return { setsEN, setsCN, skillsEN, skillsCN, foodsEN, foodsCN, furnEN, furnCN, collEN, collCN, raidsEN, raidsCN }
  },

  /**
   * buff/debuff 在线查询：中文名精确匹配 → enName 反查关联套装与技能
   * @returns {Promise<null|{entry: {name, enName, des, icon, isBuff}, sets: Array, skills: Array}>}
   */
  async findBuffDebuff (query) {
    const buffList = await cachedFetch('buffList', async () => (await fetchJson(`${BASE}/api/buff`)).buffs || [])
    const debuffList = await cachedFetch('debuffList', async () => (await fetchJson(`${BASE}/api/debuff`)).debuffs || [])

    let entry = buffList.find(b => b.name === query) || buffList.find(b => b.name === `高级${query}`)
    let isBuff = true
    if (!entry) {
      entry = debuffList.find(b => b.name === query) || debuffList.find(b => b.name === `次级${query}`)
      isBuff = false
    }
    if (!entry) return null

    if (!buffRelatedCache.has(entry.enName)) {
      try {
        const related = await postJson(`${BASE}/api/getBuffRelatedSetsAndSkills`, { enName: entry.enName })
        buffRelatedCache.set(entry.enName, related || { sets: [], skills: [] })
      } catch (err) {
        logger.error(`${LOG} buff 反查失败(${entry.enName}): ${err.message}`)
        buffRelatedCache.set(entry.enName, { sets: [], skills: [] })
      }
    }
    const related = buffRelatedCache.get(entry.enName)
    return { entry: { ...entry, isBuff }, sets: related.sets || [], skills: related.skills || [] }
  },

  /**
   * 用 API 查到的今日无畏反推轮换校准码（与 askUndaunted/atlas 的 passDays 公式自洽）
   * adjust[i] = (API 实际副本序号位置 - passDays) mod n，按轮换日缓存
   * @param dgList 无畏副本英文名列表（dgSetsTable 的行顺序）
   * @param numDungeons 无畏副本总数（模数基数，num2 = numDungeons - 24）
   * @returns {Promise<number[]>} [adjust0, adjust1, adjust2]
   */
  async getUndauntedAdjust (dgList, numDungeons) {
    const passDays = Math.floor((Date.now() - 57600000) / 86400000)
    if (adjustCache.passDay === passDays && adjustCache.adjust) {
      return adjustCache.adjust
    }

    const offsets = undauntedApi.resolveOffsets()
    const pledges = await undauntedApi.getPledges(offsets.today)

    const mod = (a, n) => ((a % n) + n) % n
    const num0 = 12
    const num1 = 12
    const num2 = numDungeons - 24
    const idx = pledges.map(p => dgList.findIndex(d => normSetName(d) === normSetName(p)))
    if (idx[0] < 0 || idx[0] >= 12) throw new Error(`[无畏] 校准反推失败：玛吉副本 "${pledges[0]}" 不在 dgList[0..11]`)
    if (idx[1] < 12 || idx[1] >= 24) throw new Error(`[无畏] 校准反推失败：格里容副本 "${pledges[1]}" 不在 dgList[12..23]`)
    if (idx[2] < 24) throw new Error(`[无畏] 校准反推失败：乌尔伽拉格副本 "${pledges[2]}" 不在 dgList[24..]`)

    const adjust = [
      mod(idx[0] - passDays, num0),
      mod(idx[1] - 12 - passDays, num1),
      mod(idx[2] - 24 - passDays, num2)
    ]
    adjustCache = { passDay: passDays, adjust }
    logger.info(`${LOG} 无畏校准码反推: [${adjust}]（API 今日无畏: ${pledges.join(' / ')}）`)
    return adjust
  }
}
