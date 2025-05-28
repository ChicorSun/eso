import plugin from '../../../lib/plugins/plugin.js'
import moment from 'moment'
import fs from 'node:fs'

// 配置文件路径
const CONFIG_PATH = './plugins/eso/custome_resources/config/allNoticecfg.json'

let blackList = []

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
        },
        {
          reg: '^#*(禁止全体功能|禁用全体功能|禁止使用全体功能)$',
          fnc: 'addIntoBlackList'
        },
        {
          reg: '^#*允许使用全体功能$',
          fnc: 'removeFromBlackList'
        },
        {
          reg: '^#*查看全体功能黑名单$',
          fnc: 'showBlackList'
        },
      ]
    })
  }

  /** 复读 */
  async sendAllNotice (e) {
    let personID = e.user_id.toString() // 转换为字符串处理

    await this.loadBlackList()

    if (!blackList.includes(personID)) {
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

        let myMss = await this.trimText(e)
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
                      { type: 'text', text: '\n抱歉！你无权使用该功能！' }
                    ]
      await this.reply(message, false, { recallMsg: -1 })
    }
  }

  //计算是否有权限
  async inBlackList(personID) {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const data = fs.readFileSync(CONFIG_PATH, 'utf8')
        const list = JSON.parse(data)
        return list.includes(personID.toString()) // 转换为字符串比较
      }
      return false
    } catch (error) {
      logger.error(`[ESO:全体通知] 检查黑名单失败: ${error.message}`)
      return false
    }
  }

  // 保存黑名单到文件
  async saveBlackList() {
    try {
      const configDir = './plugins/eso/custome_resources/config'
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(blackList, null, 4))
    } catch (error) {
      logger.error(`[ESO:全体通知] 保存黑名单失败: ${error.message}`)
    }
  }

  // 从文件加载黑名单
  async loadBlackList() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const data = fs.readFileSync(CONFIG_PATH, 'utf8')
        blackList = JSON.parse(data)
      } else {
        // 如果文件不存在，创建空黑名单
        const configDir = './plugins/eso/custome_resources/config'
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true })
        }
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(blackList, null, 4))
      }
    } catch (error) {
      logger.error(`[ESO:全体通知] 加载黑名单失败: ${error.message}`)
    }
  }

  //写入黑名单
  async addIntoBlackList(e) {
    if (!e.isMaster) {
      return e.reply('权限不足', true)
    }

    let personID = e.at
    if (!personID || personID == e.user_id) {
      return e.reply('无事发生，请@目标群友', true)
    }

    // 确保personID是字符串
    personID = personID.toString()

    await this.loadBlackList()
    
    if (blackList.includes(personID)) {
      return e.reply('他原本就无法使用该功能，无需再次禁用', false)
    } else {
      blackList.push(personID)
      await this.saveBlackList()
      return e.reply(`成功将${personID}添加进黑名单！`, false)
    }
  }

  //从黑名单移除
  async removeFromBlackList(e) {
    if (!e.isMaster) {
      return e.reply('权限不足', true)
    }

    let personID = e.at
    if (!personID || personID == e.user_id) {
      return e.reply('无事发生，请@目标群友', true)
    }

    // 确保personID是字符串
    personID = personID.toString()

    await this.loadBlackList()
    
    if (!blackList.includes(personID)) {
      return e.reply('该用户未在黑名单中', false)
    } else {
      blackList = blackList.filter(id => id !== personID)
      await this.saveBlackList()
      return e.reply(`已将${personID}从黑名单中移除`, false)
    }
  }

  //显示黑名单
  async showBlackList(e) {
    if (!e.isMaster) {
      return e.reply('权限不足', true)
    }

    await this.loadBlackList()

    if (blackList.length === 0) {
      return e.reply('黑名单为空', true)
    }

    const message = ['当前黑名单：']
    for (const qq of blackList) {
      message.push(`\n${qq}`)
    }

    return e.reply(message.join(''), true)
  }

  async trimText(e) {
    let text = '';
    for (let eachArry of e.message) {
        if ((typeof eachArry.type !== "undefined") && (eachArry.type === 'text')) {
            if (typeof eachArry.text !== "undefined") {
                text = eachArry.text;

                // 手动去掉开头的空格
                let firstNonSpacePos = 0;
                while (firstNonSpacePos < text.length && /\s/.test(text[firstNonSpacePos])) {
                    firstNonSpacePos++;
                }
                text = text.substring(firstNonSpacePos);
                break;
            }
        }
    }

    return text;
  }
}
