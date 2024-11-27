import plugin from '../../../lib/plugins/plugin.js'
//import common from '../../../lib/common/common.js'
//import random

let muteTime = [60, 300, 900, 120, 1800, 600, 180, 3600, 60, 300, 480, 120, 900, 600, 360, 7200, 86400, 300, 1800, 120, 480, 600, 180, 2700]
let muteEnable = 0

export class test extends plugin {
  constructor (e) {
    super({
      name: 'ESO:禁言转盘',
      dsc: '禁言发出请求的群友随机时间',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^#*(禁言转盘)$',
          fnc: 'mute'
        },
        {
          reg: '^#*(禁言转盘开|禁言转盘开启|开启禁言转盘|开禁言转盘)$',
          fnc: 'mute_enable'
        },
        {
          reg: '^#*(禁言转盘关|禁言转盘关闭|关闭禁言转盘|关禁言转盘)$',
          fnc: 'mute_disable'
        }
      ]
    })
  }

  async mute(e) {
    //判断权限
    //if (!e.member.is_admin && !e.member.is_owner && !e.isMaster) return e.reply('管理员以上权限才可使用')
    //判断是否有管理
    if (!e.group.is_admin && !e.group.is_owner) return e.reply('不给我管理员怎么干活?', true)
    if (!muteEnable) return e.reply('禁言转盘功能已被管理员关闭', true)

    let index = Math.round(Math.random() * 23)
    //logger.info("[禁言转盘]index:"+index)
    let imgPath = `./plugins/eso/resources/img/turnplate/${index+1}.gif`
    e.group.recallMsg(e.message_id)
    await this.e.reply(segment.image(`file://${imgPath}`), false, { recallMsg: 10 })
    await e.group.muteMember(e.user_id,muteTime[index])
  }
  async mute_enable(e) {
    if(muteEnable == 1) return e.reply('本就开着啊', true)
    let userinfo = await Bot.pickMember(e.group_id, e.user_id).getSimpleInfo()
    userinfo.is_owner = await Bot.pickMember(e.group_id, e.user_id).is_owner
    userinfo.is_admin = await Bot.pickMember(e.group_id, e.user_id).is_admin
    if (!userinfo.is_owner && !userinfo.is_admin) return e.reply('请联系管理员才能开启禁言转盘', true)
    muteEnable = 1
    await this.e.reply('禁言转盘功能已开启')
  }
  async mute_disable(e) {
    if(muteEnable == 0) return e.reply('本就关着啊', true)
    let userinfo = await Bot.pickMember(e.group_id, e.user_id).getSimpleInfo()
    userinfo.is_owner = await Bot.pickMember(e.group_id, e.user_id).is_owner
    userinfo.is_admin = await Bot.pickMember(e.group_id, e.user_id).is_admin
    if (!userinfo.is_owner && !userinfo.is_admin) return e.reply('请联系管理员才能关闭禁言转盘', true)
    muteEnable = 0
    await this.e.reply('禁言转盘功能已关闭')
  }
}
