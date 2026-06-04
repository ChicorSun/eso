import plugin from '../../../lib/plugins/plugin.js'
import fetch from "node-fetch";
import moment from "moment";
export class time extends plugin {
  constructor () {
    super({
      /** 功能名称 */
      name: 'ESO:时间查询',
      /** 功能描述 */
      dsc: '查询当前时间',
      event: 'message',
      /** 优先级，数字越小等级越高 */
      priority: 5000,
      rule: [
        {
          /** 命令正则匹配 */
          reg: '^#*几点了$',
          /** 执行方法 */
          fnc: 'time'
        }
      ]
    })
  }

  async time (e) {
    let now = new Date().getTime()
    let utcTime = now-28800000
    let message = moment(now).format('北京时间'+'HH'+'点'+'mm'+'分'+'ss'+'秒').replace(/是0/g, "是").replace(/点0/g, "点")
    let message2 = moment(utcTime).format('UTC时间'+'HH'+'点'+'mm'+'分'+'ss'+'秒').replace(/是0/g, "是").replace(/点0/g, "点")
    // 调试：打印 adapter_name，用于区分 TRSS-WeChat-OC-Plugin（微信 claw）与其他个人微信/QQ/GSUIDCore 等来源
    const adapterInfo = `\n[debug] adapter_name=${e?.adapter_name ?? 'undefined'} adapter_id=${e?.adapter_id ?? 'undefined'}`
    await this.reply(message+'\n'+message2+adapterInfo, false, { recallMsg: -1 })
  }
}