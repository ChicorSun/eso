import plugin from '../../../lib/plugins/plugin.js'
import SteamModel from '../model/steam.js'
import SteamPushModel from '../model/steamPush.js'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import moment from 'moment'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'

// 配置文件路径
const CONFIG_PATH = './plugins/eso/custome_resources/config/steam.yaml'
const PUSH_PATH = './plugins/eso/custome_resources/config/steam_push.json'
const ONLINE_STATUS_PATH = './plugins/eso/custome_resources/config/steam_online_status.json'

// Steam设置相关宏定义
const STEAM_SETTING = {
  // 支持的地区代码
  VALID_REGIONS: ['cn', 'us', 'eu', 'jp', 'kr', 'tw', 'hk', 'sg'],
  // API Key 格式验证正则
  API_KEY_REGEX: /^[A-Fa-f0-9]{32}$/,
  // 默认配置
  DEFAULT_CONFIG: {
    apiKey: '',
    proxyUrl: '',
    regionCode: 'cn',
    monitoring: {
      checkInterval: 30000,
      autoStart: false
    },
    push: {
      defaultOnlinePush: true,
      defaultGamePush: true
    }
  }
}

export class steamSetting extends plugin {
  constructor() {
    super({
      name: 'Steam系统设置',
      dsc: 'Steam API Key、反代链接、地区代码等系统配置',
      event: 'message',
      priority: 1000,
      rule: [
        { reg: '^#steam设置apikey(?:\\s+(.+))?$', fnc: 'setApiKey' },
        { reg: '^#steam设置反代(?:\\s+(.+))?$', fnc: 'setProxy' },
        { reg: '^#steam设置地区(?:\\s+(.+))?$', fnc: 'setRegion' },
        { reg: '^#steam配置$', fnc: 'showConfig' },
        { reg: '^#steam开启群推送$', fnc: 'toggleGroupPush' },
        { reg: '^#steam关闭群推送$', fnc: 'toggleGroupPush' },
        { reg: '^#steam开启监控$', fnc: 'toggleMonitoring' },
        { reg: '^#steam关闭监控$', fnc: 'toggleMonitoring' },
        { reg: '^#steam清理数据$', fnc: 'cleanupData' },
        { reg: '^#steam重置配置$', fnc: 'resetConfig' },
        { reg: '^#steam设置帮助$', fnc: 'help' }
      ]
    })
  }

  async setApiKey(e) {
    try {
      if (!e.isMaster) {
        return await this.reply('只有主人才可以设置API Key')
      }

      const match = e.msg.match(/^#steam设置apikey(?:\s+(.+))?$/)
      const apiKey = match[1] ? match[1].trim() : null
      
      // 如果没有提供API Key，给出提示
      if (!apiKey) {
        return await this.reply('请提供Steam API Key\n\n使用方法：\n#steam设置apikey <API Key>\n\n例如：\n#steam设置apikey 1234567890ABCDEF1234567890ABCDEF\n\n💡 获取API Key：\n1. 访问 https://steamcommunity.com/dev/apikey\n2. 登录Steam账户\n3. 填写域名（可随意填写）\n4. 复制生成的API Key\n\n⚠️ 注意：API Key是32位十六进制字符串')
      }
      
      if (!STEAM_SETTING.API_KEY_REGEX.test(apiKey)) {
        return await this.reply('API Key格式不正确，请输入32位十六进制字符串\n\n正确格式示例：\n#steam设置apikey 1234567890ABCDEF1234567890ABCDEF')
      }

      const configPath = CONFIG_PATH
      let config = {}
      
      if (fs.existsSync(configPath)) {
        config = YAML.parse(fs.readFileSync(configPath, 'utf8'))
      }

      config.apiKey = apiKey
      config.lastUpdate = moment().format('YYYY-MM-DD HH:mm:ss')

      const configDir = path.dirname(configPath)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      fs.writeFileSync(configPath, YAML.stringify(config, null, 2))
      SteamModel.loadConfig()

      return await this.reply(`API Key设置成功！\n\n配置已生效，Steam功能现在可以正常使用了。\n\n💡 提示：请确保API Key的安全性，不要泄露给他人。`)
    } catch (error) {
      logger.error(`[ESO:Steam] 设置API Key失败: ${error.message}`)
      return await this.reply('设置失败，请稍后重试')
    }
  }

  async setProxy(e) {
    try {
      if (!e.isMaster) {
        return await this.reply('只有主人才可以设置反代链接')
      }

      const match = e.msg.match(/^#steam设置反代(?:\s+(.+))?$/)
      const proxyUrl = match[1] ? match[1].trim() : null
      
      // 如果没有提供反代链接，给出提示
      if (!proxyUrl) {
        return await this.reply('请提供反代链接\n\n使用方法：\n#steam设置反代 <URL>\n\n例如：\n#steam设置反代 https://your-proxy.com/{{url}}\n\n💡 提示：\n• 反代链接用于解决网络连接问题\n• 格式：https://your-proxy.com/{{url}}\n• {{url}} 会被替换为实际的请求URL\n• 如果不需要反代，可以留空')
      }
      
      try {
        new URL(proxyUrl)
      } catch (error) {
        return await this.reply('反代链接格式不正确，请输入有效的URL\n\n正确格式示例：\n#steam设置反代 https://your-proxy.com/{{url}}')
      }

      const configPath = CONFIG_PATH
      let config = {}
      
      if (fs.existsSync(configPath)) {
        config = YAML.parse(fs.readFileSync(configPath, 'utf8'))
      }

      config.proxyUrl = proxyUrl
      config.lastUpdate = moment().format('YYYY-MM-DD HH:mm:ss')

      const configDir = path.dirname(configPath)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      fs.writeFileSync(configPath, YAML.stringify(config, null, 2))
      SteamModel.loadConfig()

      return await this.reply(`反代链接设置成功：\n${proxyUrl}\n\n配置已生效，新的API请求将使用此反代链接。`)
    } catch (error) {
      logger.error(`[ESO:Steam] 设置反代链接失败: ${error.message}`)
      return await this.reply('设置失败，请稍后重试')
    }
  }

  async setRegion(e) {
    try {
      if (!e.isMaster) {
        return await this.reply('只有主人才可以设置地区代码')
      }

      const match = e.msg.match(/^#steam设置地区(?:\s+(.+))?$/)
      const regionCode = match[1] ? match[1].trim().toLowerCase() : null
      
      // 如果没有提供地区代码，给出提示
      if (!regionCode) {
        return await this.reply('请提供地区代码\n\n使用方法：\n#steam设置地区 <地区代码>\n\n例如：\n#steam设置地区 cn\n\n💡 支持的地区：\n' + STEAM_SETTING.VALID_REGIONS.join(', ') + '\n\n• cn: 中国\n• us: 美国\n• eu: 欧洲\n• jp: 日本\n• kr: 韩国\n• tw: 台湾\n• hk: 香港\n• sg: 新加坡')
      }
      
      if (!STEAM_SETTING.VALID_REGIONS.includes(regionCode)) {
        return await this.reply(`地区代码无效，支持的地区：${STEAM_SETTING.VALID_REGIONS.join(', ')}\n\n正确格式示例：\n#steam设置地区 cn`)
      }

      const configPath = CONFIG_PATH
      let config = {}
      
      if (fs.existsSync(configPath)) {
        config = YAML.parse(fs.readFileSync(configPath, 'utf8'))
      }

      config.regionCode = regionCode
      config.lastUpdate = moment().format('YYYY-MM-DD HH:mm:ss')

      const configDir = path.dirname(configPath)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      fs.writeFileSync(configPath, YAML.stringify(config, null, 2))
      SteamModel.loadConfig()

      return await this.reply(`地区代码设置成功：${regionCode}\n\n配置已生效，游戏信息和价格将显示为${regionCode}地区的内容。`)
    } catch (error) {
      logger.error(`[ESO:Steam] 设置地区代码失败: ${error.message}`)
      return await this.reply('设置失败，请稍后重试')
    }
  }

  async showConfig(e) {
    try {
      if (!e.isMaster) {
        return await this.reply('只有主人才可以查看配置信息')
      }

      const configPath = CONFIG_PATH
      let config = {}
      
      if (fs.existsSync(configPath)) {
        config = YAML.parse(fs.readFileSync(configPath, 'utf8'))
      }

      const settings = [
        {
          label: 'API Key',
          value: config.apiKey ? config.apiKey.substring(0, 8) + '****' + config.apiKey.substring(28) : '❌ 未配置',
          valueClass: config.apiKey ? 'enabled' : 'disabled'
        },
        {
          label: '反代链接',
          value: config.proxyUrl || '❌ 未配置',
          valueClass: config.proxyUrl ? 'enabled' : 'disabled'
        },
        {
          label: '地区代码',
          value: config.regionCode || 'cn',
          valueClass: 'neutral'
        },
        {
          label: '最后更新',
          value: config.lastUpdate || '未知',
          valueClass: 'neutral'
        }
      ]

      const monitoringStats = SteamPushModel.getMonitoringStats()
      const stats = [
        {
          label: '监控运行',
          value: monitoringStats.monitoring ? '🟢 是' : '🔴 否'
        },
        {
          label: '推送群数',
          value: monitoringStats.totalGroups
        },
        {
          label: '推送用户',
          value: monitoringStats.totalUsers
        }
      ]

      const renderData = {
        cmd: 'steam配置',
        title: 'Steam 配置信息',
        settings: settings,
        stats: stats,
        date: moment().format('YYYY-MM-DD HH:mm:ss'),
        tplFile: './plugins/eso/resources/html/steam/steam.html',
        pluResPath: './plugins/eso/resources/'
      }

      const img = await puppeteer.screenshot('steam', renderData)
      return await this.reply(img)
    } catch (error) {
      logger.error(`[ESO:Steam] 查看配置失败: ${error.message}`)
      return await this.reply('查看配置失败，请稍后重试')
    }
  }

  async toggleGroupPush(e) {
    try {
      if (!e.isMaster) {
        return await this.reply('只有主人才可以设置群推送')
      }

      const isEnable = e.msg.includes('开启')
      SteamPushModel.setGroupPush(e.group_id, isEnable)

      return await this.reply(`群推送已${isEnable ? '开启' : '关闭'}！`)
    } catch (error) {
      logger.error(`[ESO:Steam] 设置群推送失败: ${error.message}`)
      return await this.reply('设置失败，请稍后重试')
    }
  }

  async toggleMonitoring(e) {
    try {
      if (!e.isMaster) {
        return await this.reply('只有主人才可以设置监控服务')
      }

      const isEnable = e.msg.includes('开启')
      SteamPushModel.setMonitoring(isEnable)

      return await this.reply(`监控服务已${isEnable ? '开启' : '关闭'}！`)
    } catch (error) {
      logger.error(`[ESO:Steam] 设置监控服务失败: ${error.message}`)
      return await this.reply('设置失败，请稍后重试')
    }
  }

  async cleanupData(e) {
    try {
      if (!e.isMaster) {
        return await this.reply('只有主人才可以清理数据')
      }

      // 清理在线状态数据
      if (fs.existsSync(ONLINE_STATUS_PATH)) {
        fs.unlinkSync(ONLINE_STATUS_PATH)
      }

      // 清理推送设置
      if (fs.existsSync(PUSH_PATH)) {
        fs.unlinkSync(PUSH_PATH)
      }

      return await this.reply('数据清理完成！\n已清理在线状态数据和推送设置。')
    } catch (error) {
      logger.error(`[ESO:Steam] 清理数据失败: ${error.message}`)
      return await this.reply('清理失败，请稍后重试')
    }
  }

  async resetConfig(e) {
    try {
      if (!e.isMaster) {
        return await this.reply('只有主人才可以重置配置')
      }

      // 重置配置文件
      const configPath = CONFIG_PATH
      const configDir = path.dirname(configPath)
      
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      fs.writeFileSync(configPath, YAML.stringify(STEAM_SETTING.DEFAULT_CONFIG, null, 2))
      SteamModel.loadConfig()

      return await this.reply('配置已重置为默认值！\n请重新设置API Key等必要配置。')
    } catch (error) {
      logger.error(`[ESO:Steam] 重置配置失败: ${error.message}`)
      return await this.reply('重置失败，请稍后重试')
    }
  }

  async help(e) {
    const helpMsg = `Steam设置功能帮助：

⚙️ 系统配置：
#steam设置apikey <API Key> - 设置Steam API Key（必需）
#steam设置反代 <URL> - 设置反代链接（可选）
#steam设置地区 <地区代码> - 设置地区代码（可选）
#steam配置 - 查看当前配置

🔧 功能控制：
#steam开启群推送 - 开启群推送功能
#steam关闭群推送 - 关闭群推送功能
#steam开启监控 - 开启监控服务
#steam关闭监控 - 关闭监控服务

🧹 数据管理：
#steam清理数据 - 清理在线状态和推送数据
#steam重置配置 - 重置所有配置为默认值

💡 使用说明：
1. 首次使用必须设置Steam API Key
2. 如果遇到网络问题，可以设置反代链接
3. 地区代码影响游戏信息和价格显示
4. 只有主人可以执行设置命令

🔗 获取API Key：
1. 访问 https://steamcommunity.com/dev/apikey
2. 登录Steam账户
3. 填写域名（可随意填写）
4. 复制生成的API Key`

    return await this.reply(helpMsg)
  }
} 