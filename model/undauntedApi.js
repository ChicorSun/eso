import fs from 'node:fs'
import path from 'node:path'
import fetch from 'node-fetch'

/** ESOCN API 数据源（无畏者日常查询） */
const BASE_URL = 'https://api.esocn.com.cn'
const CACHE_PATH = './data/eso/custome_resources/cache/undaunted_api_cache.json'
const LOG = '[无畏:API]'
const FETCH_TIMEOUT = 10000

/** pledges 内存缓存：{ date: 'YYYY-M-D', data: { offset: [en1, en2, en3] } } */
let pledgesCache = { date: '', data: {} }

/** 副本/套装持久化缓存：{ version, dungeons: {enName: {}}, sets: {enName: {}} } */
let storeCache = null

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

async function loadStore () {
  if (storeCache) return storeCache
  let version = ''
  try {
    version = await fetchJson(`${BASE_URL}/api/version`)
  } catch (err) {
    logger.error(`${LOG} 获取数据版本失败: ${err.message}`)
  }
  let stored = null
  try {
    stored = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'))
  } catch {}
  if (stored && stored.version && stored.version === version) {
    storeCache = stored
    logger.info(`${LOG} 使用持久化缓存（版本 ${version}）`)
  } else {
    storeCache = { version, dungeons: {}, sets: {} }
  }
  return storeCache
}

function saveStore () {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
    fs.writeFileSync(CACHE_PATH, JSON.stringify(storeCache))
  } catch (err) {
    logger.error(`${LOG} 缓存写入失败: ${err && err.message || err}`)
  }
}

/** 从图标路径提取 basename（去目录、去扩展名），如 /esoui/art/icons/gear_a.webp -> gear_a */
function iconBasename (iconPath) {
  return (iconPath || '').split('/').pop().replace(/\.[^.]+$/, '')
}

export default {
  /**
   * 按 EU 刷新时间（北京时间 11:00）解析 昨日/今日/明日 对应的天数偏移
   * @returns {{yesterday: number, today: number, tomorrow: number}}
   */
  resolveOffsets () {
    const bjHour = (new Date().getUTCHours() + 8) % 24
    const refreshed = bjHour >= 11
    return refreshed
      ? { yesterday: -1, today: 0, tomorrow: 1 }
      : { yesterday: 0, today: 1, tomorrow: 2 }
  },

  /**
   * 查询指定天数偏移的无畏者日常（EU 服）
   * @param offset 天数偏移（-1~+20，0=当日）
   * @returns {Promise<string[]>} 3 个副本英文名
   */
  async getPledges (offset) {
    const d = new Date()
    const dateKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
    if (pledgesCache.date !== dateKey) pledgesCache = { date: dateKey, data: {} }
    if (pledgesCache.data[offset]) return pledgesCache.data[offset]

    const data = await postJson(`${BASE_URL}/api/daily-pledges/${offset}`, { server: 'EU' })
    if (!data || !data.Pledge1) throw new Error(`pledges 数据为空 offset=${offset}`)
    const pledges = [data.Pledge1, data.Pledge2, data.Pledge3]
    pledgesCache.data[offset] = pledges
    return pledges
  },

  /**
   * 按英文副本名查副本信息
   * @returns {Promise<{name: string, enName: string, equipment: string[]}>}
   */
  async getDungeon (enName) {
    const store = await loadStore()
    if (store.dungeons[enName]) return store.dungeons[enName]

    const data = await fetchJson(`${BASE_URL}/api/dungeons/dungeon/${encodeURIComponent(enName)}`)
    if (!data || !data.name) throw new Error(`副本数据为空: ${enName}`)
    const dungeon = {
      name: data.name,
      enName: data.enName || enName,
      equipment: Array.isArray(data.equipment) ? data.equipment : []
    }
    store.dungeons[enName] = dungeon
    saveStore()
    return dungeon
  },

  /**
   * 按英文套装名查套装信息（归一化）
   * @returns {Promise<{name, enName, type, armor, icons: {Light, Medium, Heavy}, bonuses: string[]}>}
   */
  async getSet (enName) {
    const store = await loadStore()
    if (store.sets[enName]) return store.sets[enName]

    const data = await postJson(`${BASE_URL}/api/equipment`, { enName })
    if (!data || !data.name) throw new Error(`套装数据为空: ${enName}`)
    const heads = (data.styles && data.styles['护甲'] && data.styles['护甲']['头部']) || {}
    const bonuses = []
    if (data.bonuses) {
      for (const key of Object.keys(data.bonuses).sort()) {
        bonuses.push(data.bonuses[key])
      }
    }
    const set = {
      name: data.name,
      enName: data.enName || enName,
      type: String(data.type || ''),
      armor: data.armor || '',
      icons: {
        Light: iconBasename(heads['轻型'] && heads['轻型'].icon),
        Medium: iconBasename(heads['中型'] && heads['中型'].icon),
        Heavy: iconBasename(heads['重型'] && heads['重型'].icon)
      },
      bonuses
    }
    store.sets[enName] = set
    saveStore()
    return set
  }
}
