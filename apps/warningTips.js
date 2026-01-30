import plugin from '../../../lib/plugins/plugin.js'
import moment from 'moment'
import fs from 'node:fs'

// 配置文件路径
const CONFIG_PATH = './plugins/eso/custome_resources/config/warningTips.json'

let logs = {
  date: '2023-01-01',
}

let newlogs = {
  date: '2023-01-01',
}

let keywordEnable = 0
let NicknameEnable = 0

export class warningTips extends plugin {
  constructor (e) {
    super({
      name: 'ESO:违规检查',
      dsc: '对群昵称和消息内容检查是否违规并警告',
      event: 'message',
      priority: 58887,
      rule: [
        {
          reg: '^#*(群昵称格式)$',
          fnc: 'sendNickRule'
        },
        {
          reg: '^#*(开启群昵称检查)$',
          fnc: 'nicknameEnable'
        },
        {
          reg: '^#*(关闭群昵称检查)$',
          fnc: 'nicknameDisable'
        },
        {
          reg: '^#*(开启违规词检查)$',
          fnc: 'keywordEnable'
        },
        {
          reg: '^#*(关闭违规词检查)$',
          fnc: 'keywordDisable'
        },
        
        {
          reg: '',
          fnc: 'sendWarning'
        }
        
      ]
    })
    // 首次加载时读取配置
    this.loadConfig()
  }

  // 从文件加载配置
  async loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const data = fs.readFileSync(CONFIG_PATH, 'utf8')
        const config = JSON.parse(data)
        keywordEnable = config.keywordEnable !== undefined ? config.keywordEnable : 0
        NicknameEnable = config.NicknameEnable !== undefined ? config.NicknameEnable : 0
      } else {
        // 如果文件不存在，创建默认配置
        const configDir = './plugins/eso/custome_resources/config'
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true })
        }
        const defaultConfig = { keywordEnable: 0, NicknameEnable: 0 }
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 4))
        keywordEnable = 0
        NicknameEnable = 0
      }
    } catch (error) {
      logger.error(`[ESO:违规检查] 加载配置失败: ${error.message}`)
      keywordEnable = 0
      NicknameEnable = 0
    }
  }

  // 保存配置到文件
  async saveConfig() {
    try {
      const configDir = './plugins/eso/custome_resources/config'
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }
      const config = { keywordEnable, NicknameEnable }
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4))
    } catch (error) {
      logger.error(`[ESO:违规检查] 保存配置失败: ${error.message}`)
    }
  }

  async sendWarning (e) {
    let isInList = await this.checkWhiteList(e.user_id)
    if(isInList)
    {
        return 0
    }

    // 确保使用最新的配置
    //await this.loadConfig()

    if(NicknameEnable == 1)
    {
    	let checkName = await this.nameWarningTime(e)
    	if(checkName)
    	{
    		let message = [{ type: 'at', qq: e.user_id},{ type: 'text', text: '\n请按规范修改群昵称'},
    			{ type: 'image', file: './plugins/eso/resources/img/tips/nameTips.jpg', asface: false}]
      		await this.reply(message, false, { recallMsg: -1 })
    	}
    }
    
    if(keywordEnable == 1)
    {
        let checkKeyword = await this.keywordCheck(e)
        if(checkKeyword == 2)
        {
            e.group.recallMsg(e.message_id)
            let userId = e.user_id;
            let msg = [
                segment.image(
                    `https://api.lolimi.cn/API/preview/api.php?qq=${userId}&msg=%E4%BD%A0%E5%A5%BD&msg2=%E7%AC%A8%E8%9B%8B&type=66`
                ),
                `打你打你！不准发这个！`,
            ];
            await e.group.muteMember(e.user_id,300)
            e.reply(msg, false, { recallMsg: 60 });//60秒后撤回
        }
    }
  }

  async sendNickRule (e) {
    let imgPath = `./plugins/eso/resources/img/tips/nameTips.jpg`

    /** 最后回复消息 */
    await this.e.reply(segment.image(`file://${imgPath}`))
  }

  //计算剩余需要提醒修改群昵称的次数
  async nameWarningTime (e) {
    let time = 0
    let id = `qq${e.user_id}`

    //判断是否需要清空记录
    let now = moment(new Date().getTime()).format('YYYY'+'-'+'MM'+'-'+'DD')
    if(now != logs.date)
    {
      logs = newlogs
      logs.date = now
      logger.info("清空群昵称提醒次数记录")
    }

    //读取提醒次数
    if(typeof(logs[id])!= "undefined")
    {
      if(logs[id] == 0)
      {
        return 0
      }
      else if (logs[id] == 1)
      {
        time = 1
      }
      else
      {
        time = 2
      }
    }
    else
    {
      time = 2
      logs[id] = 2
    }

    //读取群昵称并判断是否合规
    let groupCard = ''
    try {
      // 优先使用 e.sender.card（参考 speechStatic.js 的实现方式）
      if (e.sender) {
        groupCard = e.sender.card
      }
      
      // 如果 e.sender 没有，尝试从 Bot.gml 获取（备用方案）
      if (!groupCard && typeof Bot !== 'undefined' && Bot.gml) {
        const userList = Bot.gml.get(e.group_id)
        if (userList) {
          const userInfo = userList.get(e.user_id)
          if (userInfo) {
            groupCard = userInfo.card || userInfo.nickname || ''
          }
        }
      }
      
      // 清理不可见字符（参考 speechStatic.js 的 getUserDisplayName 方法）
      if (groupCard) {
        groupCard = groupCard.replace(/[^\p{L}\p{N}\p{P}\p{S}\p{Z}]/gu, '').trim()
      }
      
      if (groupCard) {
        const is_correct_groupname = await this.myIn('@', groupCard)
        //logger.info('----------[违规]------------')
        //logger.info('群昵称:', groupCard)
        //logger.info('是否合规:', is_correct_groupname)
        if(is_correct_groupname)
        {
          time = 0
          logs[id] = 0
        }
        else
        {
          logs[id] = time-1
        }
      }
      else
      {
        logger.error("取群成员资料失败！")
        time = 0
      }
    } catch (error) {
      logger.error(`[ESO:违规检查] 获取群昵称失败: ${error.message}`)
      time = 0
    }

    return time
  }

  //判断是否有敏感词
  async keywordCheck (e) {
    let ret = 0
    for (let eachArry of e.message) {
      if((typeof(eachArry.type) != "undefined") && (eachArry.type == 'text'))
      {
        if(typeof(eachArry.text) != "undefined")
        {
          if(await this.myIn('三角洲', eachArry.text)){ret = 2;break}
          if(await this.myIn('宝可梦', eachArry.text)){ret = 2;break}
          if(await this.myIn('皮卡丘', eachArry.text)){ret = 2;break}
          /*
          if((await this.myIn('金鱼', eachArry.text)) || 
             (await this.myIn('金树脂', eachArry.text)) || 
             (await this.myIn('金镀片', eachArry.text)) || 
             (await this.myIn('升金', eachArry.text)) || 
             (await this.myIn('金粉', eachArry.text)) ||  
             (await this.myIn('回收', eachArry.text)) || 
             (await this.myIn('黄金商人', eachArry.text)) || 
             (await this.myIn('制造业', eachArry.text)) || 
             (await this.myIn('送', eachArry.text)) || 
             (await this.myIn('奖任务', eachArry.text)) || 
             (await this.myIn('会员', eachArry.text)) || 
             (await this.myIn('金色', eachArry.text)) || 
             (await this.myIn('炼金', eachArry.text)) || 
             (await this.myIn('姓金', eachArry.text)) || 
             (await this.myIn('金先生', eachArry.text)) || 
             (await this.myIn('金小姐', eachArry.text)) || 
             (await this.myIn('金老师', eachArry.text)) || 
             (await this.myIn('金师傅', eachArry.text)) || 
             (await this.myIn('金师父', eachArry.text)) || 
             (await this.myIn('金线索', eachArry.text)) || 
             (await this.myIn('金色线索', eachArry.text)) || 
             (await this.myIn('氪金', eachArry.text)) || 
             (await this.myIn('赏金', eachArry.text)) || 
             (await this.myIn('牌', eachArry.text)) || 
             (await this.myIn('金刚', eachArry.text)) || 
             (await this.myIn('三回', eachArry.text)) || 
             (await this.myIn('皇冠商城', eachArry.text)) || 
             (await this.myIn('启动金', eachArry.text)) || 
             (await this.myIn('黄金版', eachArry.text)) || 
             (await this.myIn('首饰', eachArry.text)) || 
             (await this.myIn('戒指', eachArry.text)) || 
             (await this.myIn('项链', eachArry.text)) || 
             (await this.myIn('装备', eachArry.text)) || 
             (await this.myIn('蜡', eachArry.text)) || 
             (await this.myIn('片', eachArry.text)) || 
             (await this.myIn('物价', eachArry.text)) || 
             (await this.myIn('涨价', eachArry.text)) || 
             (await this.myIn('买坐骑', eachArry.text)) || 
             (await this.myIn('买房', eachArry.text)) || 
             (await this.myIn('金拉丝', eachArry.text)) || 
             (await this.myIn('金拉斯', eachArry.text)) || 
             (await this.myIn('沃金', eachArry.text)) || 
             (await this.myIn('白金塔', eachArry.text)) || 
             (await this.myIn('黄金海岸', eachArry.text)) || 
             (await this.myIn('商人', eachArry.text)) || 
             (await this.myIn('npc', eachArry.text)) || 
             (await this.myIn('NPC', eachArry.text)) || 
             (await this.myIn('材料', eachArry.text)) || 
             (await this.myIn('精炼', eachArry.text)) || 
             (await this.myIn('任务', eachArry.text)) || 
             (await this.myIn('日常', eachArry.text)) || 
             (await this.myIn('金龙鱼', eachArry.text)) || 
             (await this.myIn('改名', eachArry.text)) || 
             (await this.myIn('dlc', eachArry.text)) || 
             (await this.myIn('DLC', eachArry.text)) || 
             (await this.myIn('种族', eachArry.text)) || 
             (await this.myIn('职业', eachArry.text)) || 
             (await this.myIn('死灵', eachArry.text)) || 
             (await this.myIn('窝登', eachArry.text)) || 
             (await this.myIn('守望', eachArry.text)) || 
             (await this.myIn('腌黄瓜', eachArry.text)) || 
             (await this.myIn('镀', eachArry.text)) || 
             (await this.myIn('金辣', eachArry.text)) || 
             (await this.myIn('1650', eachArry.text)) || 
             (await this.myIn('一次性', eachArry.text)) || 
             (await this.myIn('会员', eachArry.text)) || 
             (await this.myIn('活动', eachArry.text)) || 
             (await this.myIn('打折', eachArry.text)) || 
             (await this.myIn('降价', eachArry.text)) || 
             (await this.myIn('房', eachArry.text)) || 
             (await this.myIn('坐骑', eachArry.text)) || 
             (await this.myIn('外观', eachArry.text)) || 
             (await this.myIn('随身', eachArry.text))
            )
          {
            ret = 0
            break
          }

          if((await this.myIn('买金', eachArry.text)) || 
             (await this.myIn('买G', eachArry.text)) || 
             (await this.myIn('卖G', eachArry.text)) || 
             (await this.myIn('买J', eachArry.text)) || 
             (await this.myIn('卖J', eachArry.text)) ||  
             (await this.myIn('出G', eachArry.text)) || 
             (await this.myIn('出金', eachArry.text)) || 
             (await this.myIn('收金', eachArry.text)) || 
             (await this.myIn('金价', eachArry.text)) || 
             (await this.myIn('买金', eachArry.text)) || 
             (await this.myIn('：1', eachArry.text)) || 
             (await this.myIn(':1', eachArry.text)) || 
             (await this.myIn('比1', eachArry.text)) || 
             (await this.myIn('TB', eachArry.text)) || 
             (await this.myIn('某宝', eachArry.text)) || 
             (await this.myIn('淘宝', eachArry.text))
            )
          {
            ret = 1
            break
          }

          if((await this.myIn('金', eachArry.text)) && (await this.myIn('价', eachArry.text))){ret = 1;break}
          if((await this.myIn('凰', eachArry.text)) && (await this.myIn('冠', eachArry.text))){ret = 1;break}
          if((await this.myIn('黄', eachArry.text)) && (await this.myIn('冠', eachArry.text))){ret = 1;break}
          if((await this.myIn('黄', eachArry.text)) && (await this.myIn('瓜', eachArry.text))){ret = 1;break}
          if((await this.myIn('买', eachArry.text)) && (await this.myIn('车', eachArry.text))){ret = 1;break}
          if((await this.myIn('金', eachArry.text)) && (await this.myIn('车', eachArry.text))){ret = 1;break}
          if((await this.myIn('卖', eachArry.text)) && (await this.myIn('金', eachArry.text))){ret = 1;break}
          if((await this.myIn('买', eachArry.text)) && (await this.myIn('金', eachArry.text))){ret = 1;break}
          if((await this.myIn('买', eachArry.text)) && (await this.myIn('皇冠', eachArry.text))){ret = 1;break}
          if((await this.myIn('买', eachArry.text)) && (await this.myIn('王冠', eachArry.text))){ret = 1;break}
          if((await this.myIn('卖', eachArry.text)) && (await this.myIn('皇冠', eachArry.text))){ret = 1;break}
          if((await this.myIn('卖', eachArry.text)) && (await this.myIn('王冠', eachArry.text))){ret = 1;break}
          if((await this.myIn('出', eachArry.text)) && (await this.myIn('皇冠', eachArry.text))){ret = 1;break}
          if((await this.myIn('出', eachArry.text)) && (await this.myIn('王冠', eachArry.text))){ret = 1;break}
          if((await this.myIn('金', eachArry.text)) && (await this.myIn('价', eachArry.text))){ret = 1;break}
          if((await this.myIn('金', eachArry.text)) && (await this.myIn('价', eachArry.text))){ret = 1;break}
          if((await this.myIn('金', eachArry.text)) && (await this.myIn('价', eachArry.text))){ret = 1;break}
          if((await this.myIn('金', eachArry.text)) && (await this.myIn('价', eachArry.text))){ret = 1;break}
          if((await this.myIn('金', eachArry.text)) && (await this.myIn('价', eachArry.text))){ret = 1;break}
          if((await this.myIn('金', eachArry.text)) && (await this.myIn('价', eachArry.text))){ret = 1;break}
          if((await this.myIn('金', eachArry.text)) && (await this.myIn('价', eachArry.text))){ret = 1;break}
          if((await this.myIn('金', eachArry.text)) && (await this.myIn('价', eachArry.text))){ret = 1;break}
          if((await this.myIn('金', eachArry.text)) && (await this.myIn('价', eachArry.text))){ret = 1;break}
          if((await this.myIn('金', eachArry.text)) && (await this.myIn('价', eachArry.text))){ret = 1;break}
          if((await this.myIn('金', eachArry.text)) && (await this.myIn('价', eachArry.text))){ret = 1;break}
          if((await this.myIn('金', eachArry.text)) && (await this.myIn('价', eachArry.text))){ret = 1;break}
          if((await this.myIn('金', eachArry.text)) && (await this.myIn('价', eachArry.text))){ret = 1;break}
          if((await this.myIn('金', eachArry.text)) && (await this.myIn('价', eachArry.text))){ret = 1;break}
          if((await this.myIn('金', eachArry.text)) && (await this.myIn('价', eachArry.text))){ret = 1;break}
          */
        }
      }
    }
    //logger.info(e.message)
    //logger.info(e.message.length)

    return ret
  }

  //WhiteList
  async checkWhiteList (userId) {
    let ret = false
      
    if(userId == 2854196310)
    {
        ret = true
    }

    return ret
  }

  //判断字符串是否在字符串中
  async myIn (keyword, myStr) {
    let ret = false
    let keyLen = keyword.length
    let strLen = myStr.length
    let keyIndex = -1;
    let strIndex = -1;

    for (let eachChar of myStr) {
      keyIndex += 1;
      if(keyIndex+keyLen > strLen)
      {
        break;
      }

      if(eachChar == keyword[0])
      {
        ret = true
        strIndex = keyIndex-1
        for (let eachKey of keyword) {
          strIndex += 1
          if(eachKey != myStr[strIndex])
          {
            ret = false
            break;
          }
        }
        if(ret == true)
        {
          break;
        }
      }
    }

    return ret
  }

  // 开启群昵称检查
  async nicknameEnable(e) {
    await this.loadConfig()
    if(NicknameEnable == 1) return e.reply('群昵称检查本就开着啊', true)
    if (!e.member.is_owner && !e.member.is_admin) return e.reply('请联系管理员才能开启群昵称检查', true)
    NicknameEnable = 1
    await this.saveConfig()
    await this.e.reply('群昵称检查功能已开启')
  }

  // 关闭群昵称检查
  async nicknameDisable(e) {
    await this.loadConfig()
    if(NicknameEnable == 0) return e.reply('群昵称检查本就关着啊', true)
    if (!e.member.is_owner && !e.member.is_admin) return e.reply('请联系管理员才能关闭群昵称检查', true)
    NicknameEnable = 0
    await this.saveConfig()
    await this.e.reply('群昵称检查功能已关闭')
  }

  // 开启违规词检查
  async keywordEnable(e) {
    await this.loadConfig()
    if(keywordEnable == 1) return e.reply('违规词检查本就开着啊', true)
    if (!e.member.is_owner && !e.member.is_admin) return e.reply('请联系管理员才能开启违规词检查', true)
    keywordEnable = 1
    await this.saveConfig()
    await this.e.reply('违规词检查功能已开启')
  }

  // 关闭违规词检查
  async keywordDisable(e) {
    await this.loadConfig()
    if(keywordEnable == 0) return e.reply('违规词检查本就关着啊', true)
    if (!e.member.is_owner && !e.member.is_admin) return e.reply('请联系管理员才能关闭违规词检查', true)
    keywordEnable = 0
    await this.saveConfig()
    await this.e.reply('违规词检查功能已关闭')
  }
}
