import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import General from '../model/general.js'
import md5 from 'md5'

let helpData = {
  md5: '',
  img: ''
}

export class help extends plugin {
  constructor (e) {
    super({
      name: 'ESO:帮助',
      dsc: '帮助',
      event: 'message',
      priority: 500,
      rule: [
        {
          reg: '^#*(命令|帮助|菜单|help|说明|功能|指令|使用说明)$',
          fnc: 'help'
        }
      ]
    })
  }

  async help () {
    let data = await General.get(this.e, 'bot', 'help', 'help')
    if (!data) return

    let img = await this.cache(data)
    await this.reply(img)
  }

  async cache (data) {
    let tmp = md5(JSON.stringify(data))
    if (helpData.md5 == tmp) return helpData.img

    helpData.img = await puppeteer.screenshot('help', data) /*html file saved in folder data/html/test/ */
    helpData.md5 = tmp

    return helpData.img
  }
}
