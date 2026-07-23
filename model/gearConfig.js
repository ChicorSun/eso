import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

/**
 * 性能挡位配置（#设置挡位）
 * 0=自动（按设备 CPU/内存检测）；1 极简 / 2 均衡 / 3 标准 / 4 性能 / 5 旗舰
 * 仅操作 plugins/eso 内部状态与 TRSS 公开单例，不修改 TRSS 任何文件。
 */
const CONFIG_PATH = './data/eso/custome_resources/config/gear.json'
const LOG = '[ESO:挡位]'

/** 各挡位配置包 */
const GEAR_PACKS = {
  1: { name: '极简', srcMode: 'api', lightPayload: true, shotConcurrent: 1, restartNum: 30, chromiumIdleSec: 60, heavy: false, preload: false, maxOldSpaceMB: 512 },
  2: { name: '均衡', srcMode: 'api', lightPayload: true, shotConcurrent: 2, restartNum: 100, chromiumIdleSec: 0, heavy: true, preload: false, maxOldSpaceMB: 1024 },
  3: { name: '标准', srcMode: 'api', lightPayload: false, shotConcurrent: 3, restartNum: 100, chromiumIdleSec: 0, heavy: true, preload: false, maxOldSpaceMB: 2048 },
  4: { name: '性能', srcMode: 'local', lightPayload: false, shotConcurrent: 4, restartNum: 100, chromiumIdleSec: 0, heavy: true, preload: true, maxOldSpaceMB: 3072 },
  5: { name: '旗舰', srcMode: 'local', lightPayload: false, shotConcurrent: 6, restartNum: 100, chromiumIdleSec: 0, heavy: true, preload: true, maxOldSpaceMB: 4096 }
}

let gearFile = null          // 已持久化的挡位（null = 从未设置过，保持各模块文件原值）
let effectiveGear = null     // 生效挡位（0 时存自动检测值）
let idleTimer = null

function detectGear () {
  const cores = os.cpus().length
  const memGB = os.totalmem() / 1073741824
  if (cores <= 1 || memGB <= 1.5) return 1
  if (cores <= 2 || memGB <= 3) return 2
  if (cores <= 4 || memGB <= 6) return 3
  if (memGB <= 12) return 4
  return 5
}

function loadFile () {
  if (gearFile !== null) return gearFile
  try {
    gearFile = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
  } catch {
    gearFile = false // false = 文件不存在（区分于 0 自动）
  }
  return gearFile
}

function saveFile (gear) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
  gearFile = { gear, appliedAt: new Date().toISOString() }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(gearFile, null, 2))
}

export default {
  /** 当前挡位原文（null=从未设置，0=自动，1..5） */
  getGearRaw () {
    const g = loadFile()
    return g === false ? null : g.gear
  },

  /** 生效挡位（0 自动时返回检测值） */
  getEffectiveGear () {
    if (effectiveGear !== null) return effectiveGear
    const raw = this.getGearRaw()
    effectiveGear = (raw === null || raw === 0) ? detectGear() : raw
    return effectiveGear
  },

  /** 生效配置包 */
  getPack () {
    return GEAR_PACKS[this.getEffectiveGear()] || GEAR_PACKS[3]
  },

  /** 自动检测结果（用于 #挡位 展示） */
  detectGear,

  /**
   * 决定某模块的图鉴数据源
   * 从未设置过挡位时保持文件原值（兼容旧用法）；设置过则按挡位统一
   */
  resolveModuleMode (currentVal) {
    const raw = this.getGearRaw()
    if (raw === null) return currentVal === 'api' ? 'api' : 'local'
    return this.getPack().srcMode
  },

  /** 重型功能（TTC 抓取 / esologs 解析）是否允许 */
  isHeavyEnabled () {
    return !!this.getPack().heavy
  },

  /** 是否释放 API 原始载荷（挡位 1-2） */
  isLightPayload () {
    return !!this.getPack().lightPayload
  },

  /** 截图并发数 */
  getShotConcurrent () {
    return this.getPack().shotConcurrent
  },

  /** esologPuzzle 的页面并发上限（极简挡位禁用，其他按截图并发对齐） */
  getWebNum () {
    const gear = this.getEffectiveGear()
    return gear <= 1 ? 1 : Math.min(this.getPack().shotConcurrent, 6)
  },

  /**
   * 设置挡位并返回应用结果摘要
   * @returns {{gear, effective, pack, notes: string[]}}
   */
  apply (gear) {
    saveFile(gear)
    effectiveGear = null // 强制重算
    const effective = this.getEffectiveGear()
    const pack = this.getPack()
    const notes = []
    if (gear === 0) notes.push(`自动检测为挡位 ${effective}（${pack.name}）`)
    if (effective >= 3) notes.push(`建议 pm2 max_memory_restart 调至 ${pack.maxOldSpaceMB}M，NODE_OPTIONS=--max-old-space-size=${pack.maxOldSpaceMB}`)
    if (effective <= 2) notes.push('建议配置 restart_cron 每日重启一次兜底')
    if (pack.preload) notes.push('local 图鉴库将在后台异步预载（约 20s），期间首次图鉴查询会稍慢')
    return { gear, effective, pack, notes }
  },

  /** 供 gear.js 注册空闲回收定时器（只允许一个） */
  setupChromiumIdleRecycle (puppeteer, getLastShotTime) {
    if (idleTimer) clearInterval(idleTimer)
    const idleSec = this.getPack().chromiumIdleSec
    if (!idleSec) { idleTimer = null; return }
    idleTimer = setInterval(() => {
      if (!puppeteer?.browser) return
      const idle = (Date.now() - getLastShotTime()) / 1000
      if (idle >= idleSec) {
        logger.info(`${LOG} Chromium 空闲 ${idle.toFixed(0)}s，回收浏览器（下次截图自动重启）`)
        puppeteer.restart(true).catch(err => logger.error(`${LOG} 回收 Chromium 失败: ${err.message}`))
      }
    }, 30000)
    idleTimer.unref?.()
  },

  /** 渲染器运行时参数（restartNum，运行时调整，不改 TRSS 文件） */
  applyRendererTuning (puppeteer) {
    try {
      puppeteer.restartNum = this.getPack().restartNum
    } catch (err) {
      logger.error(`${LOG} 设置 restartNum 失败: ${err.message}`)
    }
  }
}
