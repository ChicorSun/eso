/**
 * ESO 试炼成就 → KOOK 角色更新（updateTag.js）
 *
 * 用法：
 *   #更新成就 / #更新TAG / #更新Tag / #更新tag
 *     复用同步成就实现（model/patSync.js）：先合并本地 PAT 与 ESOCN 成就，
 *     再【无条件】更新 KOOK 服务器角色（forceRoleUpdate，不要求本地数据被更新）
 *   #更新成就@某人   更新被 @ 用户
 *
 * 角色设置规则见 model/roleUpdater.js 的 updateTagForUser（被 patSync 调用）。
 * 本文件仅保留命令入口（plugin 类），核心逻辑均在 model 层，无循环依赖。
 */
import plugin from '../../../lib/plugins/plugin.js'
import { syncAchievementsForUser, remindEsocnBindIfSelf } from '../model/patSync.js'

export class updateTag extends plugin {
  constructor () {
    super({
      name: 'ESO:更新成就',
      dsc: '根据 PAT 成就数据更新 KOOK 服务器角色',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: '^#?(更新成就|更新TAG|更新Tag|更新tag)$',
          fnc: 'updateTag'
        }
      ]
    })
  }

  /** #更新成就 主流程（复用同步实现：先合并本地+ESOCN，再无条件更新 KOOK 角色） */
  async updateTag () {
    const e = this.e
    // 确定目标用户：@ 了别人则更新被 @ 用户，否则更新自己
    let targetUserId = String(e.user_id)
    let targetLabel = '你'
    if (e.at && String(e.at) !== String(e.self_id)) {
      targetUserId = String(e.at)
      targetLabel = `用户 ${e.at}`
    }
    await e.reply('正在更新成就，请稍候...')
    const report = await syncAchievementsForUser(e, targetUserId, targetLabel, { forceRoleUpdate: true })
    if (report) await e.reply(report)
    // 目标用户为自己且未绑定 ESOCN → 提醒绑定
    await remindEsocnBindIfSelf(e, targetUserId)
    return true
  }
}
