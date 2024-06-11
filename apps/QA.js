import plugin from '../../../lib/plugins/plugin.js'

export class askQuestion extends plugin {
  constructor (e) {
    super({
      name: 'ESO:问答',
      dsc: '回答常见的问题',
      event: 'message',
      priority: 5000,
      rule: [
        {
          /** 命令正则匹配 */
          reg: '^#*(大力丸配方)$',
          /** 执行方法 */
          fnc: 'sendAnswer1'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(三回药配方)$',
          /** 执行方法 */
          fnc: 'sendAnswer2'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(隐身药配方)$',
          /** 执行方法 */
          fnc: 'sendAnswer3'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(三回药配方|大招药配方|终极点药配方|大招点药配方)$',
          /** 执行方法 */
          fnc: 'sendAnswer4'
        },
        //{
          /** 命令正则匹配 */
          //reg: '.*(加|拉|进|搜|申|入).*(公会|工会).*|.*(公会|工会).*(加|拉|进|搜|申|入).*|.*入会.*|.*进会.*|.*入下会.*|.*进下会.*|.*(批).*(申请).*|.*(申请).*(批).*',
          /** 执行方法 */
          //fnc: 'sendAnswer5'
        //},
        {
          /** 命令正则匹配 */
          reg: '^#*(攻略)$',
          /** 执行方法 */
          fnc: 'sendAnswer6'
        }
      ]
    })
  }

  async sendAnswer1 (e) {
    await this.reply(`大力丸是一种提高输出增加续航的药水，配方是：\n法系大力丸：碎米荠+矢车菊+娜米拉的腐坏物/水葫芦\n耐系大力丸：圣蓟+龙刺草+水葫芦/蒿草`)
  }

  async sendAnswer2 (e) {
    await this.reply(`三回药：蓝蓟草+耧斗花+山花/龙刺草`)
  }

  async sendAnswer3 (e) {
    await this.reply(`隐身药：蓝草菇+耧斗花+娜米拉的腐坏物`)
  }

  async sendAnswer4 (e) {
    await this.reply(`大招药：耧斗花+龙血+龙脓液`)
  }

  async sendAnswer6 (e) {
    await this.reply(`● 画苏的超级新手文字攻略的链接为：
https://docs.qq.com/doc/DWUhhTHZmT3RIZE5I\n
● 【上古卷轴OL 华人全新制造插件分享 完美又不失简单】 https://www.bilibili.com/video/BV1et42177aU/?share_source=copy_web&vd_source=d3a9d123bb7505332e2a2eef85a79781\n
● 【上古卷轴OL 新手保姆级指南超长十周年版2024】 https://www.bilibili.com/video/BV1Rz421y7xL/?share_source=copy_web&vd_source=d3a9d123bb7505332e2a2eef85a79781\n
● 全dlc4人副本hm攻略坦克视角【上古卷轴ol eso 亵渎坟墓hm UGhm 坦克视角攻略】 https://www.bilibili.com/video/BV1d24y1f7so/?share_source=copy_web&vd_source=d3a9d123bb7505332e2a2eef85a79781\n
● 【上古卷轴OL U41橡木重击术士 致命99.3K/瑞利98.3K/奈恩96.3K - PTS Wk5】 https://www.bilibili.com/video/BV11x4y1D7fP/?share_source=copy_web&vd_source=d3a9d123bb7505332e2a2eef85a79781\n
● 【上古卷轴ol ESO奥术师DPS构筑全介绍】 https://www.bilibili.com/video/BV11P411q7fn/?share_source=copy_web&vd_source=d3a9d123bb7505332e2a2eef85a79781\n`)
  }

  async sendAnswer5 (e) {
  	let ret = 1
    for (let eachArry of e.message) {
      if((typeof(eachArry.type) != "undefined") && (eachArry.type == 'text'))
      {
        if(typeof(eachArry.text) != "undefined")
        {
        	if((await this.myIn('斗士', eachArry.text)) || 
               (await this.myIn('战士', eachArry.text)) || 
               (await this.myIn('法师', eachArry.text)) || 
               (await this.myIn('塞', eachArry.text)) || 
               (await this.myIn('赛', eachArry.text)) || 
               (await this.myIn('贼', eachArry.text)) || 
               (await this.myIn('无畏', eachArry.text)) || 
               (await this.myIn('兄弟', eachArry.text)) || 
               (await this.myIn('闯世', eachArry.text)) || 
               (await this.myIn('大厅', eachArry.text)) || 
               (await this.myIn('仓库', eachArry.text)) || 
               (await this.myIn('银行', eachArry.text)) || 
               (await this.myIn('拍卖行', eachArry.text)) || 
               (await this.myIn('商人', eachArry.text)))
            {
              ret = 0
              break
            }
        }
      }
  	}

    if(ret)
    {
    	let message = [{ type: 'at', qq: e.user_id},{ type: 'text', text: '\n申请公会，请看群公告[申请流程]\n若已安装瑞文插件包2.0以上版本，按ESC，右上角公会按钮\n申请列表常年有几百人，请耐心等候批准'},
      				   { type: 'image', file: './plugins/eso/resources/img/tips/guildList.jpg', asface: false}]
    	await this.reply(message, false, { recallMsg: -1 })
    }
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
}
