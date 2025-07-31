import plugin from '../../../lib/plugins/plugin.js'
import SteamModel from '../model/steam.js'
import SteamUserModel from '../model/steamUser.js'
import fs from 'node:fs'
import path from 'node:path'
import moment from 'moment'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'

// 配置文件路径
const CONFIG_PATH = './plugins/eso/custome_resources/config/steam.yaml'
const TOKENS_PATH = './plugins/eso/custome_resources/config/steam_tokens.json'
const USERS_PATH = './plugins/eso/custome_resources/config/steam_users.json'

// Steam相关宏定义
const STEAM = {
  // Steam ID 格式验证正则
  STEAM_ID_REGEX: /^[0-9]{17}$/,
  // API Key 格式验证正则
  API_KEY_REGEX: /^[A-Fa-f0-9]{32}$/,
  // 状态文本映射
  STATUS_TEXT: {
    0: '离线',
    1: '在线',
    2: '忙碌',
    3: '离开',
    4: '打盹',
    5: '想交易',
    6: '想玩游戏'
  }
}

export class steamBind extends plugin {
  constructor() {
    super({
      /** 功能名称 */
      name: 'Steam账户管理',
      /** 功能描述 */
      dsc: 'Steam账户绑定、解绑、状态查询等功能',
      /** https://oicqjs.github.io/oicq/#events */
      event: 'message',
      /** 优先级，数字越小等级越高 */
      priority: 1000,
      rule: [
        {
          /** 命令正则匹配 */
          reg: '^#steam绑定(?:\\s+(\\d+))?$',
          /** 执行方法 */
          fnc: 'bind'
        },
        {
          reg: '^#steam解绑$',
          fnc: 'unbind'
        },
        {
          reg: '^#steam状态$',
          fnc: 'status'
        },
        {
          reg: '^#steam好友码$',
          fnc: 'friendCode'
        },
        {
          reg: '^#steam扫码登录$',
          fnc: 'qrLogin'
        },
        {
          reg: '^#steam统计$',
          fnc: 'stats'
        },
        {
          reg: '^#steam帮助$',
          fnc: 'help'
        },
        {
          reg: '^#steam调试\\s*(\\d+)$',
          fnc: 'debug'
        },
        {
          reg: '^#steam测试api$',
          fnc: 'testApi'
        },
        {
          reg: '^#steam网络测试$',
          fnc: 'testNetwork'
        },
        {
          reg: '^#steam验证id\\s*(\\d+)$',
          fnc: 'validateSteamId'
        }
      ]
    })
  }

  // Steam绑定
  async bind(e) {
    const match = e.msg.match(/^#steam绑定(?:\s+(\d+))?$/)
    const steamId = match[1]
    
    // 如果没有提供Steam ID，给出提示
    if (!steamId) {
      return await this.reply('请提供Steam ID\n\n使用方法：\n#steam绑定 <Steam ID>\n\n例如：\n#steam绑定 76561198012345678\n\n💡 提示：\n• Steam ID是17位数字\n• 可以在Steam个人资料页面找到\n• 或者使用 #steam帮助 查看更多信息')
    }
    
    // 验证Steam ID格式
    if (!STEAM.STEAM_ID_REGEX.test(steamId)) {
      return await this.reply('Steam ID格式不正确，请输入17位数字的Steam ID\n\n正确格式示例：\n#steam绑定 76561198012345678')
    }

    // 检查API Key是否配置
    if (!SteamModel.apiKey) {
      return await this.reply('Steam API Key未配置，请联系管理员配置')
    }

    try {
             // 获取Steam用户信息
       const userInfo = await SteamModel.getUserInfo(steamId)
       if (!userInfo) {
         return await this.reply('无法获取Steam用户信息\n\n可能的原因：\n• Steam ID不正确\n• 网络连接问题\n• Steam API服务异常\n• API Key配置问题\n\n请稍后重试或检查网络连接')
       }

      // 绑定用户
      const result = SteamUserModel.bindUser(e.user_id, steamId, userInfo.personaname)
      if (result.success) {
        return await this.reply(`绑定成功！\nSteam ID: ${steamId}\n用户名: ${userInfo.personaname}\n绑定时间: ${moment().format('YYYY-MM-DD HH:mm:ss')}`)
      } else {
        return await this.reply(result.message)
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 绑定失败: ${error.message}`)
      return await this.reply('绑定失败，请稍后重试')
    }
  }

  // Steam解绑
  async unbind(e) {
    try {
      const result = SteamUserModel.unbindUser(e.user_id)
      if (result.success) {
        return await this.reply('解绑成功！')
      } else {
        return await this.reply(result.message)
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 解绑失败: ${error.message}`)
      return await this.reply('解绑失败，请稍后重试')
    }
  }

  // 查询绑定状态
  async status(e) {
    try {
      // 获取用户QQ，转为字符串避免大数精度问题
      let userId = String(e.user_id);
      let personID = e.at
      let isOther = false

      if (typeof personID != "undefined") {
        isOther = true
        userId = String(personID);
      }

      const userInfo = SteamUserModel.getUserInfo(userId)
      if (!userInfo) {
        if(userId == e.user_id){
          return await this.reply('您还没有绑定Steam账户')
        }else{
          return await this.reply('该用户还没有绑定Steam账户')
        }
      }

      await this.reply(`在查了，在查了....`)

      // 获取最新的Steam信息
      const steamInfo = await SteamModel.getUserInfo(userInfo.steamId)
      if (steamInfo) {
        SteamUserModel.updateUserInfo(e.user_id, steamInfo.personaname)
        
                 // 准备渲染数据
         let statusText = STEAM.STATUS_TEXT[steamInfo.personastate] || '未知'
         let statusClass = steamInfo.personastate === 1 ? 'online' : 
                          steamInfo.personastate === 0 ? 'offline' : 
                          steamInfo.personastate === 2 ? 'busy' : 
                          steamInfo.personastate === 3 ? 'away' :
                          steamInfo.personastate === 4 ? 'snooze' :
                          steamInfo.personastate === 5 ? 'looking_to_trade' :
                          steamInfo.personastate === 6 ? 'looking_to_play' : 'away'
         
         // 特殊处理：如果用户是好友可见或公开，但显示离线，提示隐私设置问题
         if (steamInfo.personastate === 0 &&  steamInfo.communityvisibilitystate != 3) {
           statusText = '隐私设置未改为公开'
           statusClass = 'offline' // 保持灰色圆圈
         }
        
        // 获取好友码
        const friendCode = SteamModel.getFriendCode(steamInfo.steamid)
        
        // 获取注册时间
        const registerTime = steamInfo.timecreated ? 
          moment.unix(steamInfo.timecreated).format('YYYY-MM-DD HH:mm:ss') : '未知'
        
        // 获取游戏图片
        let gameImage = ''
        if (steamInfo.gameid) {
          gameImage = SteamModel.getHeaderImgUrlByAppid(steamInfo.gameid)
        }
        
        const renderData = {
          cmd: 'steam状态',
          title: 'Steam 账户状态',
          userInfo: {
            steamid: steamInfo.steamid,
            personaname: steamInfo.personaname,
            avatarfull: steamInfo.avatarfull || 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
            gameextrainfo: steamInfo.gameextrainfo
          },
          statusText: statusText,
          statusClass: statusClass,
          friendCode: friendCode,
          registerTime: registerTime,
          gameImage: gameImage,
          date: moment().format('YYYY-MM-DD HH:mm:ss'),
          tplFile: './plugins/eso/resources/html/steam/steam.html',
          pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`
        }
        
        // 生成图片
        const img = await puppeteer.screenshot('steam', renderData)
        return await this.reply(img)
      } else {
        const renderData = {
          cmd: 'steam状态',
          title: 'Steam 账户状态',
          userInfo: {
            steamid: userInfo.steamId,
            personaname: userInfo.steamName,
            avatarfull: 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
            gameextrainfo: null
          },
          statusText: '未知',
          statusClass: 'offline',
          friendCode: SteamModel.getFriendCode(userInfo.steamId),
          registerTime: '未知',
          gameImage: '',
          date: moment().format('YYYY-MM-DD HH:mm:ss'),
          tplFile: './plugins/eso/resources/html/steam/steam.html',
          pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`
        }
        
        const img = await puppeteer.screenshot('steam', renderData)
        return await this.reply(img)
      }
    } catch (error) {
      logger.error(`[ESO:Steam] 查询状态失败: ${error.message}`)
      return await this.reply('查询失败，请稍后重试')
    }
  }

  // 查询好友码
  async friendCode(e) {
    try {
      const userInfo = SteamUserModel.getUserInfo(e.user_id)
      if (!userInfo) {
        return await this.reply('您还没有绑定Steam账户，请先使用 #steam绑定 命令绑定账户')
      }

      // 获取好友列表
      const friends = await SteamModel.getFriendList(userInfo.steamId)
      if (friends.length === 0) {
        return await this.reply('您还没有Steam好友')
      }

      let msg = `🎮 Steam好友列表 (${friends.length}人):\n\n`
      
      for (const friend of friends.slice(0, 10)) {
        const friendInfo = await SteamModel.getUserInfo(friend.steamid)
        if (friendInfo) {
          msg += `• ${friendInfo.personaname} (ID: ${friend.steamid})\n`
        }
      }

      if (friends.length > 10) {
        msg += `\n... 还有 ${friends.length - 10} 个好友`
      }

      return await this.reply(msg)
    } catch (error) {
      logger.error(`[ESO:Steam] 查询好友码失败: ${error.message}`)
      return await this.reply('查询失败，请稍后重试')
    }
  }

  // QR码登录
  async qrLogin(e) {
    try {
      const qrData = await SteamModel.generateQRLogin()
      if (!qrData) {
        return await this.reply('生成二维码失败，请稍后重试')
      }

      // 发送二维码
      await this.reply(['请在30秒内使用Steam App扫描二维码进行登录', segment.image(qrData.qrCode)], true)

      // 轮询登录状态
      for (let i = 0; i < 6; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000))
        
        const loginResult = await SteamModel.pollAuthSessionStatus(
          qrData.session.client_id,
          qrData.session.request_id
        )

        if (loginResult && loginResult.access_token) {
          // 登录成功，保存token信息
          let tokens = {}
          
          if (fs.existsSync(TOKENS_PATH)) {
            tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'))
          }

          tokens[e.user_id] = {
            access_token: loginResult.access_token,
            refresh_token: loginResult.refresh_token,
            steam_id: loginResult.steamid,
            login_time: moment().format('YYYY-MM-DD HH:mm:ss')
          }

          fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2))

          // 自动绑定Steam账户
          const userInfo = await SteamModel.getUserInfo(loginResult.steamid)
          if (userInfo) {
            SteamUserModel.bindUser(e.user_id, loginResult.steamid, userInfo.personaname)
          }

          return await this.reply(`登录成功！\nSteam ID: ${loginResult.steamid}\n登录名: ${loginResult.account_name.replace(/^(.)(.*)(.)$/, '$1***$3')}`)
        }
      }

      return await this.reply('登录超时，请重新尝试')
    } catch (error) {
      logger.error(`[ESO:Steam] QR码登录失败: ${error.message}`)
      return await this.reply('登录失败，请稍后重试')
    }
  }

  // 查询绑定统计
  async stats(e) {
    try {
      const stats = SteamUserModel.getBindStats()
      const allUsers = SteamUserModel.getAllUsers()
      
      // 准备渲染数据
      const statsData = [
        {
          label: '总绑定用户',
          value: stats.total
        },
        {
          label: '今日新增',
          value: stats.today
        }
      ]
      
      // 显示最近5个绑定的用户
      const recentUsers = Object.entries(allUsers)
        .sort((a, b) => moment(b[1].bindTime).valueOf() - moment(a[1].bindTime).valueOf())
        .slice(0, 5)

      const games = recentUsers.map(([qqId, userData]) => ({
        name: `QQ: ${qqId}`,
        image: 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
        playtime: `Steam: ${userData.steamName} | ${userData.bindTime}`
      }))

      const renderData = {
        cmd: 'steam统计',
        title: 'Steam 绑定统计',
        stats: statsData,
        games: games,
        date: moment().format('YYYY-MM-DD HH:mm:ss'),
        tplFile: './plugins/eso/resources/html/steam/steam.html',
        pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`
      }

      const img = await puppeteer.screenshot('steam', renderData)
      return await this.reply(img)
    } catch (error) {
      logger.error(`[ESO:Steam] 查询统计失败: ${error.message}`)
      return await this.reply('查询失败，请稍后重试')
    }
  }

  // Steam帮助
  async help(e) {
    const helpMsg = `Steam功能帮助：

📋 账户管理：
#steam绑定 <Steam ID> - 绑定Steam账户
#steam解绑 - 解绑Steam账户
#steam状态 - 查询绑定状态
#steam好友码 - 查询Steam好友列表
#steam扫码登录 - 使用二维码登录Steam
#steam统计 - 查看绑定统计
#steam调试 <Steam ID> - 调试Steam用户信息
#steam测试api - 测试Steam API连接
#steam网络测试 - 测试网络连接
#steam验证id <Steam ID> - 验证Steam ID有效性
#steam帮助 - 获取帮助信息

📢 推送功能：
#steam开启游玩推送 - 开启游戏状态推送
#steam关闭游玩推送 - 关闭游戏状态推送
#steam开启状态推送 - 开启在线状态推送
#steam关闭状态推送 - 关闭在线状态推送
#steam开启推送 - 开启所有推送
#steam关闭推送 - 关闭所有推送

💡 使用说明：
1. 首次使用需要管理员配置Steam API Key
2. 可以使用 #steam绑定 命令绑定Steam账户
3. 也可以使用 #steam扫码登录 自动绑定账户
4. 绑定后可以使用其他Steam功能
5. 绑定后默认开启游玩推送和状态推送
6. 可以使用命令单独控制游玩推送和状态推送
7. 一定要填Steam Web API Key, 否则无法使用绝大部分功能,请前往Steam API https://steamcommunity.com/dev/apikey 申请API Key, 域名随意填写

🔗 获取Steam ID：
1. 访问 https://steamidfinder.com/
2. 输入您的Steam用户名
3. 复制Steam ID (17位数字)`

    const renderData = {
      cmd: 'steam帮助',
      title: 'Steam 功能帮助',
      message: helpMsg,
      date: moment().format('YYYY-MM-DD HH:mm:ss'),
      tplFile: './plugins/eso/resources/html/steam/steam.html',
      pluResPath: `${process.cwd().replace(/\\/g, '/')}/plugins/eso/resources/`
    }

    const img = await puppeteer.screenshot('steam', renderData)
    return await this.reply(img)
  }

   // Steam调试
   async debug(e) {
     try {
       const steamId = e.msg.match(/^#steam调试\s*(\d+)$/)[1]
       
       if (!STEAM.STEAM_ID_REGEX.test(steamId)) {
         return await this.reply('Steam ID格式不正确，请输入17位数字的Steam ID')
       }

       // 检查API Key是否配置
       if (!SteamModel.apiKey) {
         return await this.reply('Steam API Key未配置，请联系管理员配置')
       }

       // 获取Steam用户信息
       const userInfo = await SteamModel.getUserInfo(steamId)
       if (!userInfo) {
         return await this.reply('无法获取Steam用户信息\n\n可能的原因：\n• Steam ID不正确\n• 网络连接问题\n• Steam API服务异常\n• API Key配置问题\n\n请稍后重试或检查网络连接')
       }

       let msg = `🔍 Steam调试信息\n\n`
       msg += `Steam ID: ${userInfo.steamid}\n`
       msg += `用户名: ${userInfo.personaname}\n`
       msg += `个人资料状态: ${userInfo.profilestate === 1 ? '已设置' : '未设置'}\n`
       msg += `社区可见性: ${userInfo.communityvisibilitystate === 1 ? '私密' : userInfo.communityvisibilitystate === 2 ? '好友可见' : '公开'}\n`
               msg += `在线状态: ${userInfo.personastate} (${STEAM.STATUS_TEXT[userInfo.personastate] || '未知'})\n`
        if (userInfo.lastlogoff) {
          msg += `最后在线: ${moment.unix(userInfo.lastlogoff).format('YYYY-MM-DD HH:mm:ss')}\n`
        } else {
          msg += `最后在线: 未知\n`
        }
       
       if (userInfo.gameid) {
         msg += `正在游戏: ${userInfo.gameextrainfo || `游戏ID: ${userInfo.gameid}`}\n`
       }

               // 隐私设置说明
        if (userInfo.communityvisibilitystate === 1) {
          msg += `\n⚠️ 注意：该用户的个人资料是私密的，无法获取准确的在线状态信息。\n`
          msg += `建议用户将个人资料设置为"好友可见"或"公开"以获得更好的功能体验。`
        } else if (userInfo.communityvisibilitystate === 2) {
          msg += `\n⚠️ 注意：该用户的个人资料设置为"好友可见"，非好友的API Key可能无法获取完整状态信息。\n`
          msg += `如果状态显示不准确，建议将个人资料设置为"公开"以获得最佳功能体验。`
        }

               return await this.reply(msg)
      } catch (error) {
        logger.error(`[ESO:Steam] 调试失败: ${error.message}`)
        return await this.reply('调试失败，请稍后重试')
      }
    }

    // Steam API测试
    async testApi(e) {
      try {
        // 检查API Key是否配置
        if (!SteamModel.apiKey) {
          return await this.reply('Steam API Key未配置，请联系管理员配置')
        }

        // 测试一个公开的Steam用户（Valve官方账户）
        const testSteamId = '76561197960287930' // Valve官方账户
        const userInfo = await SteamModel.getUserInfo(testSteamId)
        
        if (!userInfo) {
          return await this.reply('❌ API测试失败：无法获取测试用户信息\n\n可能的原因：\n• API Key无效或已过期\n• 网络连接问题\n• Steam API服务异常')
        }

        let msg = `✅ Steam API测试成功\n\n`
        msg += `测试用户: ${userInfo.personaname}\n`
        msg += `Steam ID: ${userInfo.steamid}\n`
        msg += `在线状态: ${userInfo.personastate} (${STEAM.STATUS_TEXT[userInfo.personastate] || '未知'})\n`
        msg += `社区可见性: ${userInfo.communityvisibilitystate === 1 ? '私密' : userInfo.communityvisibilitystate === 2 ? '好友可见' : '公开'}\n`
        
        if (userInfo.lastlogoff) {
          msg += `最后在线: ${moment.unix(userInfo.lastlogoff).format('YYYY-MM-DD HH:mm:ss')}\n`
        }

        msg += `\n💡 如果API测试成功但您的状态显示离线，可能的原因：\n`
        msg += `• Steam客户端未登录或已离线\n`
        msg += `• 个人资料隐私设置限制了状态信息\n`
        msg += `• 需要等待一段时间让状态更新\n\n`
        msg += `🔧 隐私设置建议：\n`
        msg += `• 将个人资料设置为"公开"以获得最佳功能体验\n`
        msg += `• "好友可见"设置可能限制非好友API获取状态信息\n`
        msg += `• "私密"设置完全无法获取状态信息`

        return await this.reply(msg)
      } catch (error) {
        logger.error(`[ESO:Steam] API测试失败: ${error.message}`)
        return await this.reply('API测试失败，请稍后重试')
      }
    }

    // Steam网络连接测试
    async testNetwork(e) {
      try {
        let msg = `🌐 Steam网络连接测试\n\n`
        
        // 测试基本网络连接
        const startTime = Date.now()
        try {
          const response = await fetch('https://api.steampowered.com', {
            method: 'HEAD',
            signal: AbortSignal.timeout(10000)
          })
          const endTime = Date.now()
          const latency = endTime - startTime
          
          if (response.ok) {
            msg += `✅ Steam API基础连接: 正常 (延迟: ${latency}ms)\n`
          } else {
            msg += `⚠️ Steam API基础连接: HTTP ${response.status}\n`
          }
        } catch (error) {
          msg += `❌ Steam API基础连接: 失败 (${error.message})\n`
        }
        
        // 测试API Key连接
        if (SteamModel.apiKey) {
          try {
            const testSteamId = '76561197960287930' // Valve官方账户
            const userInfo = await SteamModel.getUserInfo(testSteamId)
            
            if (userInfo) {
              msg += `✅ Steam API Key连接: 正常\n`
              msg += `✅ 测试用户: ${userInfo.personaname}\n`
            } else {
              msg += `❌ Steam API Key连接: 失败\n`
            }
          } catch (error) {
            msg += `❌ Steam API Key连接: 失败 (${error.message})\n`
          }
        } else {
          msg += `⚠️ Steam API Key: 未配置\n`
        }
        
        // 网络建议
        msg += `\n💡 网络问题解决建议：\n`
        msg += `• 检查网络连接是否正常\n`
        msg += `• 尝试使用代理服务器\n`
        msg += `• 检查防火墙设置\n`
        msg += `• 联系网络管理员`
        
        return await this.reply(msg)
      } catch (error) {
        logger.error(`[ESO:Steam] 网络测试失败: ${error.message}`)
        return await this.reply('网络测试失败，请稍后重试')
      }
    }

    // Steam ID验证
    async validateSteamId(e) {
      try {
        const steamId = e.msg.match(/^#steam验证id\s*(\d+)$/)[1]
        
        if (!STEAM.STEAM_ID_REGEX.test(steamId)) {
          return await this.reply('Steam ID格式不正确，请输入17位数字的Steam ID')
        }

        let msg = `🔍 Steam ID验证: ${steamId}\n\n`
        
        // 检查API Key
        if (!SteamModel.apiKey) {
          msg += `❌ Steam API Key: 未配置\n`
          return await this.reply(msg)
        }
        
        msg += `✅ Steam ID格式: 正确\n`
        msg += `✅ Steam API Key: 已配置\n\n`
        
        // 尝试快速连接测试
        msg += `🔄 正在测试连接...\n`
        
        try {
          const startTime = Date.now()
          const userInfo = await SteamModel.getUserInfo(steamId)
          const endTime = Date.now()
          const duration = endTime - startTime
          
          if (userInfo) {
            msg += `✅ 连接成功 (耗时: ${duration}ms)\n`
            msg += `✅ 用户存在: ${userInfo.personaname}\n`
            msg += `✅ 个人资料: ${userInfo.profilestate === 1 ? '已设置' : '未设置'}\n`
            msg += `✅ 社区可见性: ${userInfo.communityvisibilitystate === 1 ? '私密' : userInfo.communityvisibilitystate === 2 ? '好友可见' : '公开'}\n`
            msg += `✅ 在线状态: ${userInfo.personastate} (${STEAM.STATUS_TEXT[userInfo.personastate] || '未知'})\n`
          } else {
            msg += `❌ 连接失败 (耗时: ${duration}ms)\n`
            msg += `❌ 可能的原因:\n`
            msg += `• Steam ID不存在或已被删除\n`
            msg += `• 账户被VAC封禁\n`
            msg += `• 网络连接问题\n`
            msg += `• Steam API服务异常`
          }
        } catch (error) {
          msg += `❌ 连接异常: ${error.message}\n`
          msg += `❌ 建议检查网络连接或稍后重试`
        }
        
        return await this.reply(msg)
      } catch (error) {
        logger.error(`[ESO:Steam] ID验证失败: ${error.message}`)
        return await this.reply('ID验证失败，请稍后重试')
      }
    }
  } 