/**
 * eso 插件级截图信号量：控制并发截图数，并记录最近截图时间（供 Chromium 空闲回收）
 * 通过运行时包装 TRSS puppeteer 单例实现，不修改 TRSS 文件。
 */
import gearConfig from './gearConfig.js'

let maxConcurrent = 3
let running = 0
let lastShotTime = Date.now()
const queue = []

export default {
  /** 包装 puppeteer.screenshot（幂等，仅包装一次） */
  patch (puppeteer) {
    if (puppeteer.__esoShotPatched) return
    puppeteer.__esoShotPatched = true
    const orig = puppeteer.screenshot.bind(puppeteer)
    puppeteer.screenshot = async function (name, data) {
      if (running >= maxConcurrent) {
        await new Promise(resolve => queue.push(resolve))
      }
      running++
      try {
        return await orig(name, data)
      } finally {
        running--
        lastShotTime = Date.now()
        const next = queue.shift()
        if (next) next()
      }
    }
    maxConcurrent = gearConfig.getShotConcurrent()
  },

  refresh () {
    maxConcurrent = gearConfig.getShotConcurrent()
  },

  getLastShotTime () {
    return lastShotTime
  },

  status () {
    return { maxConcurrent, running, queued: queue.length }
  }
}
