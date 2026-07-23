import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import database, { setAtlasSrcMode } from '../model/database.js'
import gearConfig from '../model/gearConfig.js'
import shotLimiter from '../model/shotLimiter.js'

/**
 * 性能挡位指令：#设置挡位 X（X=0..5，0=自动）/ #挡位 查询
 * 注意：TRSS 每条消息都会对插件类 new 一次实例，运行时配置必须放在
 * 模块级 once 守卫里，不能放 constructor（否则每条消息重复应用/预载）。
 */
let applied = false
let preloadTimer = null

function applyRuntime () {
  shotLimiter.patch(puppeteer)
  gearConfig.applyRendererTuning(puppeteer)
  gearConfig.setupChromiumIdleRecycle(puppeteer, () => shotLimiter.getLastShotTime())

  // local 预载（挡位 4/5）：去重调度，配置在触发时实时读取
  if (preloadTimer) {
    clearTimeout(preloadTimer)
    preloadTimer = null
  }
  if (gearConfig.getPack().preload) {
    preloadTimer = setTimeout(async () => {
      preloadTimer = null
      try {
        const pack = gearConfig.getPack()
        if (!pack.preload) return
        logger.info(`[ESO:挡位] 挡位 ${gearConfig.getEffectiveGear()}（${pack.name}）：后台预载 local 图鉴库...`)
        setAtlasSrcMode('local')
        await database.init_database()
        logger.info('[ESO:挡位] local 图鉴库预载完成')
      } catch (err) {
        logger.error(`[ESO:挡位] 预载失败: ${err.message}`)
      }
    }, 5000)
  }
}

function applyRuntimeOnce () {
  if (applied) return
  applied = true
  applyRuntime()
}

// 模块加载时应用一次持久化挡位（import 有缓存，每进程只跑一次；file_watch 重载时按新配置重跑）
applyRuntimeOnce()

export class gear extends plugin {
  constructor () {
    super({
      name: 'ESO:挡位',
      dsc: '按设备性能设置数据源与并发挡位',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^#*设置挡位\\s*([0-5])$',
          fnc: 'setGear',
          permission: 'master'
        },
        {
          reg: '^#*(当前)?挡位$',
          fnc: 'showGear'
        }
      ]
    })
  }

  async setGear (e) {
    const m = e.msg.match(/设置挡位\s*([0-5])/)
    if (!m) return await this.reply('用法：#设置挡位 0~5（0=自动）', true)

    const gear = Number(m[1])
    const { effective, pack, notes } = gearConfig.apply(gear)

    // 刷新运行时配置
    shotLimiter.refresh()
    gearConfig.applyRendererTuning(puppeteer)
    gearConfig.setupChromiumIdleRecycle(puppeteer, () => shotLimiter.getLastShotTime())
    applyRuntime()

    const lines = [
      `挡位已设置：${gear === 0 ? '0（自动）' : gear}，生效为 ${effective}（${pack.name}）`,
      `图鉴数据源: ${pack.srcMode} | 截图并发: ${pack.shotConcurrent} | Chromium轮换: ${pack.restartNum}次 | 空闲回收: ${pack.chromiumIdleSec ? pack.chromiumIdleSec + 's' : '关'}`,
      `重型功能(TTC/esologs): ${pack.heavy ? '允许' : '禁用'} | local预载: ${pack.preload ? '开' : '关'}`,
      ...notes
    ]
    await this.reply(lines.join('\n'), true)
  }

  async showGear (e) {
    const raw = gearConfig.getGearRaw()
    const effective = gearConfig.getEffectiveGear()
    const pack = gearConfig.getPack()
    const detect = gearConfig.detectGear()
    const st = shotLimiter.status()

    const lines = [
      `当前挡位: ${raw === null ? '未设置（默认0自动）' : raw}${raw === 0 || raw === null ? `，自动检测为 ${detect}` : ''}，生效 ${effective}（${pack.name}）`,
      `图鉴数据源: ${pack.srcMode} | 截图并发: ${st.maxConcurrent}（运行 ${st.running}/排队 ${st.queued}）`,
      `Chromium轮换: ${pack.restartNum}次 | 空闲回收: ${pack.chromiumIdleSec ? pack.chromiumIdleSec + 's' : '关'}`,
      `重型功能(TTC/esologs): ${pack.heavy ? '允许' : '禁用'} | local预载: ${pack.preload ? '开' : '关'}`,
      `设备建议堆上限: --max-old-space-size=${pack.maxOldSpaceMB}`,
      `挡位说明: 1极简(1C1G) 2均衡(2C2G) 3标准(4C4G) 4性能(8G) 5旗舰(16G+) 0自动`
    ]
    await this.reply(lines.join('\n'))
  }
}
