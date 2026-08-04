/**
 * KOOK 日常巡检命令（kook.js）
 *
 * 用法：
 *   #kook调试          遍历所有 KOOK 机器人的服务器/频道/角色统计
 *   #kook调试 服务器名  只看指定服务器详情
 *
 * 兼容性：未安装 KOOK-Plugin 时安全提示，不报错。
 */
import plugin from '../../../lib/plugins/plugin.js'
import KOOK, { isKOOK, getKookBot, kookId } from '../model/apiKOOK.js'

export class kook extends plugin {
  constructor () {
    super({
      name: 'ESO:KOOK巡检',
      dsc: 'KOOK 服务器/角色日常巡检',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: '^#?kook调试.*$',
          fnc: 'kookDebug'
        }
      ]
    })
  }

  async kookDebug () {
    const e = this.e
    const filter = e.msg.replace(/^#?kook调试/, '').trim()

    // 未安装 KOOK-Plugin 或没有 KOOK 机器人时
    const bots = KOOK.listBots()
    if (bots.length === 0) {
      await e.reply('❌ 当前未连接任何 KOOK 机器人。\n请先安装并配置 KOOK-Plugin（#KO设置 <Token>）')
      return true
    }

    const replies = [`🔧 KOOK 巡检报告\n共 ${bots.length} 个 KOOK 机器人\n`]

    // 每个机器人逐个巡检
    for (const botId of bots) {
      const botE = { ...e, self_id: botId }
      const botInfo = KOOK.botInfo(botE)
      replies.push(`━━━ 🤖 ${botInfo?.username || botId} ━━━`)

      try {
        // 1. 服务器列表
        const guilds = await KOOK.guildList(botE)
        if (!Array.isArray(guilds)) {
          replies.push('  ⚠️ 无法获取服务器列表')
          continue
        }
        replies.push(`  📡 服务器数: ${guilds.length}`)

        // 2. 每个服务器详情
        for (const guild of guilds) {
          const gid = guild.id
          const gName = guild.name || '未知服务器'

          // 服务器详情
          const gv = await KOOK.guildView(botE, gid)
          const memberCount = gv?.user_count ?? gv?.memberCount ?? '?'
          const lines = [`  ├─ 🏛️ ${gName} (${gid})`]
          if (gv?.user_count !== undefined || gv?.memberCount !== undefined) {
            lines.push(`成员: ${memberCount}`)
          }

          // 服务器角色
          const roles = await KOOK.roleList(botE, gid)
          const roleCount = Array.isArray(roles) ? roles.length : 0
          lines.push(`角色: ${roleCount} 个`)
          if (Array.isArray(roles) && roles.length > 0 && roleCount <= 10) {
            // 角色少时列出名称（避免刷屏）
            const names = roles.slice(0, 10).map(r => r.name).filter(Boolean).join('、')
            if (names) lines.push(`    ${names}`)
          }

          // 频道数量
          const channels = await KOOK.channelList(botE, gid)
          const channelCount = Array.isArray(channels) ? channels.length : 0
          lines.push(`频道: ${channelCount} 个`)

          // 封禁数
          const bans = await KOOK.blacklistList(botE, gid)
          const banCount = Array.isArray(bans) ? bans.length : 0
          lines.push(`封禁: ${banCount} 条`)

          // 过滤：指定服务器名时只显示匹配项
          const matched = !filter || gName.includes(filter)
          if (matched) {
            replies.push(`  ${lines.join(' | ')}`)
          }
        }
      } catch (err) {
        replies.push(`  ❌ 巡检异常: ${err?.message || String(err)}`)
      }
    }

    await e.reply(replies.join('\n'))
    return true
  }
}
