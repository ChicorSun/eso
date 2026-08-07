/**
 * PAT 成就数据存取（patStore.js）
 *
 * 数据文件：data/eso/custome_resources/data/pat.json
 * 结构：{
 *   "@AccountName": { accountName: "@AccountName", updateTime: "20260804", rawString: "PAT,v5,..." },
 *   ...
 * }
 *
 * 键为游戏账号名（@开头），同一游戏账号被多个社交账号绑定时共享同一份 PAT 数据。
 *
 * 时间规则：
 *   - updateTime 取二维码内的日期字段（PAT 第 5 个字段，YYYYMMDD 格式）
 *   - 已存在记录时，仅当本次日期【更新】（YYYYMMDD 更大）才覆盖；
 *     否则返回 skipped，不覆盖旧记录
 */
import fs from 'node:fs'
import path from 'node:path'

class PATStore {
  constructor () {
    this.dbPath = './data/eso/custome_resources/data/pat.json'
    this.data = this.load()
  }

  /** 加载数据 */
  load () {
    try {
      if (fs.existsSync(this.dbPath)) {
        return JSON.parse(fs.readFileSync(this.dbPath, 'utf8'))
      }
    } catch (err) {
      logger?.error?.(`[ESO:PAT] 加载 pat.json 失败: ${err?.message || err}`)
    }
    return {}
  }

  /** 保存数据 */
  save () {
    try {
      const dir = path.dirname(this.dbPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2))
      return true
    } catch (err) {
      logger?.error?.(`[ESO:PAT] 保存 pat.json 失败: ${err?.message || err}`)
      return false
    }
  }

  /** 从 PAT 原始字符串提取账号名（@ 开头的第 4 个字段） */
  extractAccountName (rawString) {
    if (!rawString || typeof rawString !== 'string') return ''
    const parts = rawString.split(',')
    if (parts[0] !== 'PAT') return ''
    const name = (parts[3] || '').trim()
    return name.startsWith('@') ? name : `@${name}`
  }

  /** 从 PAT 原始字符串提取日期（第 5 个字段，YYYYMMDD）；非标准返回 '' */
  extractDate (rawString) {
    if (!rawString || typeof rawString !== 'string') return ''
    const parts = rawString.split(',')
    if (parts[0] !== 'PAT') return ''
    const d = (parts[4] || '').trim()
    return /^\d{8}$/.test(d) ? d : ''
  }

  /**
   * 归一化日期为 YYYYMMDD 字符串（兼容 ISO 时间戳与 YYYYMMDD）
   */
  _normDate (val) {
    if (!val) return ''
    const s = String(val)
    // YYYYMMDD
    if (/^\d{8}$/.test(s)) return s
    // ISO 时间戳 YYYY-MM-DD...
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return m[1] + m[2] + m[3]
    return s
  }

  /**
   * 保存一份 PAT 记录（按账号名，日期更新才覆盖）
   * @param {string} rawString PAT 原始字符串
   * @param {string} accountName 账号名（可选，缺省从 rawString 提取）
   * @param {object} options 选项：{ force: true } 跳过日期检查强制覆盖（同步合并场景用）
   * @returns {object} { success, skipped, record, message }
   *   success: 已保存（新记录或日期更新）
   *   skipped: 已有更新/相同的记录，未覆盖（仍返回 record 供展示）
   */
  set (rawString, accountName, options = {}) {
    const key = (accountName || this.extractAccountName(rawString) || '').trim()
    if (!key) return { success: false, skipped: false, message: '无法从二维码中提取账号名' }

    const newDate = this.extractDate(rawString)
    const existing = this.data[key]

    // 已存在记录且新旧都有日期：仅当本次日期更新才覆盖（force 时跳过此规则）
    if (!options.force && existing && newDate && existing.updateTime) {
      const oldDate = this._normDate(existing.updateTime)
      if (newDate <= oldDate) {
        return {
          success: false,
          skipped: true,
          record: existing,
          message: `检测到已有${oldDate}的记录，本次${newDate}未更新，保留旧记录`,
        }
      }
    }

    // 保存时间：优先二维码日期；无日期则用当前时间（ISO）
    const record = {
      accountName: key,
      updateTime: newDate || new Date().toISOString(),
      rawString,
    }
    this.data[key] = record
    this.save()
    return { success: true, skipped: false, record, message: '已保存' }
  }

  /** 按账号名查询 PAT 记录 */
  get (accountName) {
    const key = String(accountName || '').trim()
    return this.data[key] || null
  }

  /** 获取全部记录 */
  getAll () {
    return Object.values(this.data)
  }
}

export default new PATStore()
