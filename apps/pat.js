/**
 * ESO 游戏内副本成就二维码上传（pat.js）
 *
 * 用法：
 *   #上传成就      进入等待状态，回复「请发送PAT成就二维码截图」
 *   （随后发送带二维码的图片）→ 下载图片 → 解码二维码 → 输出二维码内容
 *
 * 实现说明：
 *   - 等待状态用模块级 Map（user_id → 时间戳）记录，超时 5 分钟自动清理
 *   - 图片来自 e.img（URL 数组），用 Bot.download 下载到临时目录
 *   - 二维码解码：jimp（图片像素） + jsqr（QR 解码）
 *   - 依赖：jsqr、jimp（已安装到插件 node_modules）
 */
import plugin from '../../../lib/plugins/plugin.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Jimp } from 'jimp'
import jsQR from 'jsqr'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 等待上传二维码的用户：user_id → 开始等待的时间戳 */
const pendingUsers = new Map()
/** 等待超时（毫秒） */
const WAIT_TIMEOUT = 5 * 60 * 1000

export class pat extends plugin {
  constructor () {
    super({
      name: 'ESO:PAT成就',
      dsc: 'PAT 成就二维码上传解析',
      event: 'message',
      priority: 500,
      rule: [
        {
          /** #上传成就 指令 */
          reg: '^#?(上传成就|上传PAT|PAT上传)$',
          fnc: 'requestQrCode'
        },
        {
          /** 收到图片消息（等待中的用户） */
          reg: '.*',
          fnc: 'handleImage'
        }
      ]
    })
  }

  /** #上传成就：进入等待状态，请求用户发送二维码截图 */
  async requestQrCode () {
    const e = this.e
    const key = String(e.user_id)
    pendingUsers.set(key, Date.now())
    await e.reply('请发送PAT成就二维码截图。')
    return true
  }

  /** 处理图片消息：若该用户在等待二维码，则解码 */
  async handleImage () {
    const e = this.e
    // 只有带图片的消息才处理
    if (!Array.isArray(e.img) || e.img.length === 0) return false

    const key = String(e.user_id)
    const pendingTime = pendingUsers.get(key)
    if (!pendingTime) return false

    // 超时清理
    if (Date.now() - pendingTime > WAIT_TIMEOUT) {
      pendingUsers.delete(key)
      return false
    }

    // 取第一张图片
    const imgUrl = e.img[0]
    await e.reply('已收到图片，正在解析二维码...')

    try {
      const content = await this.decodeQrFromUrl(imgUrl)
      pendingUsers.delete(key)
      if (content === null) {
        await e.reply('未能从图片中识别出二维码，请确认图片清晰完整后重试。')
      } else {
        // TODO: 后续接入 PAT 成就数据解析
        await e.reply(`二维码内容：\n${content}`)
      }
    } catch (err) {
      pendingUsers.delete(key)
      logger?.error?.(`[ESO:PAT] 二维码解析失败: ${err?.message || err}`)
      await e.reply(`二维码解析失败：${err?.message || '未知错误'}`)
    }
    return true
  }

  /** 从图片 URL 下载并解码二维码，返回内容字符串；失败返回 null */
  async decodeQrFromUrl (imgUrl) {
    // 1. 下载图片到临时目录
    const tmpDir = path.join(__dirname, '../../../../data/eso/custome_resources/tmp')
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
    const tmpFile = path.join(tmpDir, `pat_${Date.now()}.png`)
    try {
      await Bot.download(imgUrl, tmpFile)
      if (!fs.existsSync(tmpFile)) return null

      // 2. jimp 读取图片像素
      const image = await Jimp.read(tmpFile)
      const { bitmap } = image

      // 3. jsQR 解码
      const result = jsQR(Uint8ClampedArray.from(bitmap.data), bitmap.width, bitmap.height)
      return result ? result.data : null
    } finally {
      // 清理临时文件
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile) } catch {}
    }
  }
}
