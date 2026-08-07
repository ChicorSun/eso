/**
 * ESO 游戏内副本成就二维码（pat.js）
 *
 * 用法：
 *   #上传成就                进入等待状态，回复「请发送PAT成就二维码截图」
 *                            随后发送二维码图片 → 解码 → 保存到 pat.json → 展示报告
 *   #副本成就 / #查看成就      查询自己绑定的游戏账号的副本成就
 *   #副本成就@某人 / #查看成就@某人   查询被 @ 用户绑定的游戏账号的副本成就
 *
 * 数据流：
 *   上传：二维码图片 → jsQR 解码 → 提取账号名(@开头) → 与本地已存成就【合并】(并集) →
 *         有变化才打包 rawString 保存 pat.json（force 覆盖，不比较日期）→ 已绑定 ESOCN 则自动走同步成就
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
import { encodePat, metaFromRaw } from '../model/patEncoder.js'
import PATStore from '../model/patStore.js'
import ESOAccount from '../model/esoAccount.js'
import { syncAchievementsForUser, remindEsocnBindIfSelf } from '../model/patSync.js'

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
          /** #副本成就 / #查看成就 指令（可@某人） */
          reg: '^#?(副本成就|查看成就).*$',
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
    // KOOK 的 e.at 带 'ko_' 前缀，与 account_data.json 的 key 一致，保留前缀；QQ 的 e.at 为数字，不受影响
    let targetUserId = String(e.user_id)
    let targetUserLabel = '你'
    if (e.at && String(e.at) !== String(e.self_id)) {
      targetUserId = String(e.at)
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

  /**
   * 合并本地已存成就与新上传成就（并集，不再比较日期），有变化才打包保存
   * @param {string} accountName 账号名（@开头）
   * @param {string} content 新上传的 PAT rawString
   * @param {object} result decodePat(content) 的结果
   * @returns {Promise<{changed: boolean, saved: object|null, added: number, mergedSize: number}>}
   */
  async mergeAndSaveAchievements (accountName, content, result) {
    const localRecord = accountName ? PATStore.get(accountName) : null
    const localRaw = localRecord?.rawString || ''
    const localIds = new Set()
    if (localRaw) {
      const localDecoded = await decodePat(localRaw)
      if (localDecoded?.ok) for (const id of localDecoded.completedIds.keys()) localIds.add(Number(id))
    }
    const newIds = new Set()
    for (const id of result.completedIds.keys()) newIds.add(Number(id))
    const mergedIds = new Set([...localIds, ...newIds])
    const changed = mergedIds.size !== localIds.size || [...mergedIds].some(id => !localIds.has(id))

    let saved = null
    if (changed) {
      // 打包 rawString：元数据以新上传 PAT 为准（不再受本地日期限制）
      const n = new Date()
      const today = `${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}${String(n.getDate()).padStart(2, '0')}`
      const meta = metaFromRaw(content, { playerName: accountName || '@Unknown', date: result.date || today })
      const newRaw = encodePat(mergedIds, meta)
      saved = PATStore.set(newRaw, accountName, { force: true })
    }
    return {
      changed,
      saved,
      added: [...mergedIds].filter(id => !localIds.has(id)).length,
      mergedSize: mergedIds.size,
    }
  }

  /**
   * 上传者已绑定 ESOCN 账户时，自动执行同步成就
   * @param {object} e 消息事件对象
   * @returns {Promise<boolean>} 是否执行了同步
   */
  async maybeSyncEsocn (e) {
    const binding = ESOAccount.getPrimaryBinding(String(e.user_id))
    if (!binding || !binding.user_id || binding.user_id === 0) return false
    await e.reply('🔄 已绑定 ESOCN，正在执行同步成就...')
    const syncReport = await syncAchievementsForUser(e, String(e.user_id), '你')
    if (syncReport) await e.reply(syncReport)
    return true
  }

  /**
   * 目标用户为自己且未绑定 ESOCN → 提醒去网页绑定
   * @param {object} e 消息事件对象
   */
  async remindEsocnBind (e) {
    await remindEsocnBindIfSelf(e, String(e.user_id))
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
          const report = formatPatReport(result, true)
          // 账号名：以 PAT 内账号为准（@开头）
          const accountName = result.playerName || ''

          // 合并本地 + 新上传（并集），有变化才保存
          const { changed, saved } = await this.mergeAndSaveAchievements(accountName, content, result)

          if (!changed) {
            await e.reply(`${report}\n\nℹ️ 与本地已存成就一致，无需更新。`)
          } else if (saved?.success) {
            await e.reply(`${report}\n\n✅ 已合并保存到账号 ${saved.record.accountName}（记录时间 ${saved.record.updateTime}）\n可使用 #副本成就 随时查看。`)
          } else {
            await e.reply(`${report}\n\n⚠️ 保存失败：${saved?.message || '未知错误'}`)
          }

          // 绑定了 ESOCN → 自动走同步成就（合并本地+ESOCN、必要时上传、KOOK 用户更新角色）
          await this.maybeSyncEsocn(e)
          // 目标用户为自己且未绑定 ESOCN → 提醒绑定
          await this.remindEsocnBind(e)
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
