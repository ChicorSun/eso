import plugin from '../../../lib/plugins/plugin.js'
import moment from 'moment'

export class allNotice extends plugin {
  constructor (e) {
    super({
      name: 'ESO:通知全体',
      dsc: '协助通知全体成员',
      /** https://oicqjs.github.io/oicq/#events */
      event: 'message',
      priority: 5000,
      rule: [
        {
          /** 命令正则匹配 */
          reg: '^#*(全体成员)',
          /** 执行方法 */
          fnc: 'sendAllNotice'
        }
      ]
    })
  }

  /** 复读 */
  async sendAllNotice (e) {
    let addTime = await this.calAddTime(e)

    if((addTime > 30) || (addTime == -1))
    {
      let now = new Date().getTime()
      let hour = moment(now).format('H')
      let minute = moment(now).format('m')
      //logger.info(hour)
      if((hour > 0 && hour < 7) || (hour == 23) || (hour == 0))
      {
        let message = [
                      { type: 'at', qq: this.e.user_id},
                      { type: 'text', text: '\n拜托！凌晨23点~7点，让大家好好睡觉吧！' }
                    ]
        await this.reply(message, false, { recallMsg: -1 })
      }

      if((hour > 0 && hour < 7) || ((hour == 23) && (minute > 29)) || (hour == 0))
      {
      }
      else
      {
        if((hour == 23) && (minute < 30))
        {
            let message = [
                          { type: 'text', text: '姑且帮你一下，晚上11点半以后，可不能再打扰大家了！' }
                     ]
            await this.reply(message, false, { recallMsg: -1 })
        }

        let myMss = this.e.message[0].text
        myMss = myMss.replace("#全体成员", "").replace("全体成员", "")
        let message = [
                          { type: 'text', text: '群友' },
                          { type: 'at', qq: this.e.user_id},
                          { type: 'at', qq: 'all', text: '@全体成员' },
                          { type: 'text', text: '，通知大家：' },
                        { type: 'text', text: myMss }
                        ]
        await this.reply(message, false, { recallMsg: -1 })
      }
    }
    else
    {
      let message = [
                      { type: 'at', qq: this.e.user_id},
                      { type: 'text', text: '\n抱歉！加群时间少于一个月尚未解锁该功能\n目前进度：'+addTime+'/30' }
                    ]
      await this.reply(message, false, { recallMsg: -1 })
    }
  }

//计算是否有权限
  async calAddTime (e) {
    let time = 0

    //读取群昵称并判断是否合规
    let userinfo = await Bot.pickMember(e.group_id, e.user_id).getSimpleInfo()
    userinfo.group_info = await Bot.pickMember(e.group_id, e.user_id).info
    userinfo.is_owner = await Bot.pickMember(e.group_id, e.user_id).is_owner
    userinfo.is_admin = await Bot.pickMember(e.group_id, e.user_id).is_admin

    if(typeof(userinfo.group_info) != "undefined")
    {
      let passSeconds = new Date().getTime()
      let join_time = 1000*userinfo.group_info.join_time
      passSeconds = passSeconds-join_time
      let passDays = (passSeconds-(passSeconds%86400000))/86400000
      time = passDays
    }
    else
    {
      logger.error("取群成员资料失败！")
      time = -1
    }

    return time
  }
}
