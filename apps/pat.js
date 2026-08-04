/**
 * ESO 游戏内副本成就二维码（pat.js）
 *
 * 用法：
 *   #上传成就                进入等待状态，回复「请发送PAT成就二维码截图」
 *                            随后发送二维码图片 → 解码 → 保存到 pat.json → 展示报告
 *   #副本成就                查询自己绑定的游戏账号的副本成就
 *   #副本成就@某人           查询被 @ 用户绑定的游戏账号的副本成就
 *
 * 数据流：
 *   上传：二维码图片 → jsQR 解码 → 原始字符串 → 提取账号名(@开头) → 保存 pat.json（按账号覆盖）
 *   查询：用户(或@用户) → ESOAccount 主账号 → pat.json 取原始字符串 → decodePat → 报告
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
import { decodePat, formatPatReport } from '../model/patDecoder.js'
import PATStore from '../model/patStore.js'
import ESOAccount from '../model/esoAccount.js'

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
          /** #副本成就 指令（可@某人） */
          reg: '^#?副本成就.*$',
          fnc: 'queryAchievements'
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

  /** #副本成就：查询自己（或 @ 用户）的副本成就 */
  async queryAchievements () {
    const e = this.e
    // 确定目标用户：@ 了别人就查别人，否则查自己
    let targetUserId = String(e.user_id)
    let targetUserLabel = '你'
    if (e.at && String(e.at) !== String(e.self_id)) {
      targetUserId = String(e.at).replace(/^ko_/, '')
      targetUserLabel = `用户 ${e.at}`
    }

    // 1. 查该用户的绑定主账号
    const binding = ESOAccount.getPrimaryBinding(targetUserId)
    if (!binding || !binding.accountName) {
      await e.reply(`❌ ${targetUserLabel} 尚未绑定游戏账号。\n请先使用 #绑定@账号名 绑定后再查询。`)
      return true
    }
    const accountName = `@${binding.accountName}`

    // 2. 查 pat.json
    const record = PATStore.get(accountName)
    if (!record || !record.rawString) {
      await e.reply(`❌ 账号 ${accountName} 尚未上传过 PAT 成就二维码。\n请先使用 #上传成就 上传二维码。`)
      return true
    }

    // 3. 解码展示
    const result = await decodePat(record.rawString)
    if (!result) {
      await e.reply(`❌ 账号 ${accountName} 的 PAT 数据无法解码（可能已损坏）。`)
      return true
    }
    const report = formatPatReport(result, true)
    const timeStr = record.updateTime || ''
    await e.reply(`${report}\n\n（数据更新于 ${timeStr}，账号 ${accountName}）`)
    return true
  }

  /** 处理图片消息：若该用户在等待二维码，则解码并保存 */
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
        // 解码 PAT 成就内容
        const result = await decodePat(content)
        if (result) {
          // 保存到 pat.json（日期更新才覆盖）
          const saved = PATStore.set(content, result.playerName)
          const report = formatPatReport(result, true)
          if (saved.success) {
            const timeStr = saved.record.updateTime
            await e.reply(`${report}\n\n✅ 已保存到账号 ${saved.record.accountName}（记录时间 ${timeStr}）\n可使用 #副本成就 随时查看。`)
          } else if (saved.skipped) {
            // 已有更新/相同日期的记录：只输出解析结果，不覆盖
            await e.reply(`${report}\n\nℹ️ ${saved.message}\n（保留现有记录，本次结果仅供参考）`)
          } else {
            await e.reply(`${report}\n\n⚠️ 保存失败：${saved.message}`)
          }
        } else {
          // 非 PAT 格式：仍尝试保存原始字符串（按提取的账号名，若无则提示）
          const saved = PATStore.set(content, '')
          if (saved.success) {
            await e.reply(`✅ 已保存二维码内容到 ${saved.record.accountName}（记录时间 ${saved.record.updateTime}）\n原始内容：\n${content}`)
          } else {
            await e.reply(`二维码内容（非 PAT 成就格式，且无法提取账号名）：\n${content}`)
          }
        }
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
