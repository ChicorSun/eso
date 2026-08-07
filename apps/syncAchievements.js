/**
 * 成就双向同步（syncAchievements.js）
 *
 * 用法：
 *   #同步成就            同步自己：合并本地 PAT 与 ESOCN 成就 → 更新本地 + ESOCN
 *   #同步成就@某人       同步被 @ 用户（需其绑定 ESOCN 账户）
 *
 * 流程（详见 model/patSync.js）：
 *   绑定检查 → 拉取 ESOCN 成就 → 解码本地 PAT → 并集合并 →
 *   本地有变化则保存（KOOK 用户自动更新角色）→ ESOCN 档位有变化则上传 →
 *   汇报
 */
import plugin from '../../../lib/plugins/plugin.js'
import { syncAchievementsForUser } from '../model/patSync.js'

export class syncAchievements extends plugin {
  constructor () {
    super({
      name: 'ESO:同步成就',
      dsc: '同步本地 PAT 与 ESOCN 成就',
      event: 'message',
      priority: 500,
      rule: [
        {
          reg: '^#?(同步成就).*$',
          fnc: 'sync'
        }
      ]
    })
  }

  /** #同步成就 主流程 */
  async sync () {
    const e = this.e

    // 确定目标用户：@ 了别人则同步别人，否则同步自己
    let targetUserId = String(e.user_id)
    let targetLabel = '你'
    if (e.at && String(e.at) !== String(e.self_id)) {
      targetUserId = String(e.at)
      targetLabel = `用户 ${e.at}`
    }

    await e.reply('正在同步成就，请稍候...')
    const report = await syncAchievementsForUser(e, targetUserId, targetLabel)
    if (report) await e.reply(report)
    return true
  }
}
