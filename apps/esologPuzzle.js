import plugin from '../../../lib/plugins/plugin.js'
import common from "../../../lib/common/common.js"
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import database from '../model/database.js'
import md5 from 'md5'

//快速模式开关
let fast_mode = 0

//Build结构体变量
let buildData = {
}

//Rank结构体变量
let rankData = {
}

//cacheData to save img
let buildImg = {
  md5: '',
  img: ''
}

export class esologPuzzle extends plugin {
  constructor () {
    super({
      /** 功能名称 */
      name: 'ESO:配装查询与分析',
      /** 功能描述 */
      dsc: '查询esolog网站的log',
      event: 'message',
      /** 优先级，数字越小等级越高 */
      priority: 5000,
      rule: [
        {
          /** 命令正则匹配 */
          reg: '^.*esologs.com.*$',
          /** 执行方法 */
          fnc: 'logPuzzle'
        },
        {
          reg: '^#*(快速分析开|快速分析开启|开启快速分析|开快速分析|快速解析开|快速解析开启|开启快速解析|开快速解析)$',
          fnc: 'fastPuzzle_enable'
        },
        {
          reg: '^#*(快速分析关|快速分析关闭|关闭快速分析|关快速分析|快速解析关|快速解析关闭|关闭快速解析|关快速解析)$',
          fnc: 'fastPuzzle_disable'
        }
      ]
    })
  }

  /**
   * #解析https://cn.esologs.com/reports/xxxxxxxxxxxxxxxxxxxxxx
   * @提供配装查询与分析
   */
  async logPuzzle (e) {
    //解析url
    let tmpComPuzzleEnable = 0
    let urlText = this.e.message[0].text
    if(urlText.includes("完整") || !fast_mode) {
      tmpComPuzzleEnable = 1
    } else {
      tmpComPuzzleEnable = 0
    }
    if(urlText.includes("快速") || fast_mode) {
      tmpComPuzzleEnable = 0
    } else {
      tmpComPuzzleEnable = 1
    }
    urlText = urlText.replace("完整分析", "").replace("快速分析", "").replace("完整解析", "").replace("快速解析", "").replace("完整", "").replace("快速", "")

    let urlTemp = urlText.split('esologs.com')
    if(urlTemp.length < 2)
    {
      return await this.reply(`我可以帮忙分析log，你只需将页面网址发群里就行`)
    }

    let url = 'https://www.esologs.com' + urlTemp[1]

    if(url.includes("rankings"))
    {
      await this.reply('正在为您查询，请稍后...(大概需要15~25s)', true)
      let msg = await this.getRankLog(url)
      await this.reply(msg)
    }
    else
    {
      let reportsID = ''
      let fightIndex = 1
      let sourceIndex = 1

      reportsID = await this.splitStr(url, 'reports/', '?')

      fightIndex = await this.splitStr(url, 'fight=', '&')

      sourceIndex = await this.splitStr(url, 'source=', '&')

      logger.info('reportsID:' + reportsID)
      logger.info('fightIndex:' + fightIndex)
      logger.info('sourceIndex:' + sourceIndex)

      if(reportsID == '')
      {
        return await this.reply('请发送详细页面的地址', true)
      }
      else if(fightIndex == '')
      {
        return await this.reply('请发送详细的某次战斗的地址', true)
      }
      else if(sourceIndex == '')
      {
        //查询团队信息
        await this.reply('正在为您查询...', true)
        let summaryURL = `https://www.esologs.com/reports/${reportsID}?fight=${fightIndex}&type=summary&translate=true`
        let urls = await this.getAllLinks(summaryURL)
        logger.info(summaryURL)
        logger.info(urls)

        if(urls.virtual || urls.links.length == 0)
        {
          let text = `抱歉，不支持解析该目标\n`+`请发送包含装备以及技能信息的esologs地址`
          await this.reply(text)
        }
        else
        {
          if(tmpComPuzzleEnable)
          {
            let index = 0
            let maxNum = urls.links.length
            let thisMsgSenderQQ = 1456181660;
            let thisMsgSenderNickname = '@Yui结衣(导航精灵)';
            let fakeMsg = [];
            let sourceIndex = ''
            await this.reply('正在完整解析全队信息，请稍后...(可能需要120s)', true)
            for (let oneMan of urls.links) {
              sourceIndex = await this.splitStr(oneMan, 'source=', '&')
              //logger.info(oneMan)
              let myMss = '已解析' + index + '人/' + maxNum + '人'

              let message = [
              { type: 'at', qq: this.e.user_id},
              { type: 'text', text: myMss }
              ]
              if(index==1 || index==6 || index==11)
              {
                await this.reply(message, false, { recallMsg: -1 })
              }
              index++

              let msg = await this.getOneManLog(reportsID, fightIndex, sourceIndex)
              fakeMsg.push(msg)
            }
            await e.reply(await common.makeForwardMsg(e, fakeMsg, '团队LOG', true))
          } else {
            await this.reply('正在快速解析全队信息，请稍后...(快速解析只会展示简略信息)', true)
          }
        }      
      } else {
        //查询单人的信息
        await this.reply('正在为您查询，请稍后...(大概需要15s)', true)
        let msg = await this.getOneManLog(reportsID, fightIndex, sourceIndex)
        await this.reply(msg)
      }
    }
  }

  async getAllLinks (url) {
    let summaryURL = url
    let urlType = ''
    let urlTemp = url.split('type=')

    if(urlTemp[1])
    {
      let urlKeyText = urlTemp[1].split('&')
      if(urlKeyText[0])
      {
        urlType = urlKeyText[0]
        //logger.info(urlType)
        summaryURL = url.replace(urlType, "summary")
      }
    }
    //logger.info('url:' + url)
    //logger.info('summaryURL:' + summaryURL)

    let allLinks = await this.getLinks(summaryURL)
    return allLinks
  }

  async getOneManLog (reportsID, fightIndex, sourceIndex) {
    let summaryURL = `https://www.esologs.com/reports/${reportsID}?fight=${fightIndex}&source=${sourceIndex}&type=summary&translate=true`
    let buffsURL = `https://www.esologs.com/reports/${reportsID}?fight=${fightIndex}&source=${sourceIndex}&type=auras&translate=true`

    //logger.info('summaryURL:' + summaryURL)
    //logger.info('buffsURL:' + buffsURL)

    let BD = await this.getSummaryLog(summaryURL)
    if(BD.virtual)
    {
      let text = `抱歉，不支持解析该目标\n`+`请发送包含装备以及技能信息的esologs地址`
      return text
    }
    else
    {
      if(!BD.accountName.includes('@'))
      {
        BD.accountName= ''
      }
      //logger.info('playerName:' + BD.playerName + ', accountName:' + BD.accountName)
      //logger.info(BD)

      //更新Build变量
      buildData = await database.updateData(BD, 3)
      //let img = await this.cache(buildData, buildImg)
      let img = await puppeteer.screenshot('eso', buildData)
      return img
    }
  }

  async getSummaryLog (url) {

    // 启动浏览器
    if (!puppeteer.browser) {
      await puppeteer.browserInit()
    }
    const page = await puppeteer.browser.newPage()
    try {
      //logger.info('----waitForWebLoad----')
      page.goto(url, { waitUntil: 'load', timeout: 120000 });

      // 设置超时时间为30秒
      const selector = '#summary-gear-0_wrapper';
      const timeout = 30000; // 30秒

      // 等待页面加载完成，确保元素可访问
      //logger.info('----waitForSelector----')
      await page.waitForSelector('#summary-gear-0_wrapper');
      //await page.waitForSelector(selector, { timeout: timeout });

      const actorName = await page.evaluate(() => {
        const actorElement = document.getElementById('filter-source-text');
        const actorName = actorElement ? actorElement.textContent : 'NONE';

        return actorName
      });
      let playerName = actorName.replace(" ", "")

      const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('#filter-source-text a'));
        return anchors.map(anchor => anchor.href);
      });
            
      const actorTable = [];
      // 使用页面评估函数来提取角色名和账户名
      const result = await page.evaluate(() => {
        const container = document.getElementById("filter-source-selection-container")
        const table = container.querySelector("table.actor-menu-table")
        const uls = table.querySelectorAll("ul")
        uls.forEach(ul => ul.remove());

        const actorMenuItems = table.querySelectorAll('.actor-menu-item > a.actor-menu-link');
        // 遍历每个角色菜单项
        return Array.from(actorMenuItems).map(item => {
          // 提取角色名
          const actorName = item.textContent.trim();

          const img = item.querySelector("img")
          const img_class = img.getAttribute("class")

          // 提取账户名，它位于角色名同一行的下一个td元素中
          const accountId = item.closest('tr').querySelector('.ability-menu-id')?.textContent.trim() || '';
      
          return { actorName, img_class, accountId };
        });
      });
      actorTable.push(...result);
      //logger.info(actorTable)

      const gearData = await page.evaluate(() => {
        // 获取表格中所有的行（除去标题行）
        const rows = Array.from(document.querySelectorAll('#summary-gear-0 tbody tr'));

        // 映射每一行数据，创建装备信息对象
        const gearItems = rows.map(row => {
          // 获取单元格数据
          const cells = row.querySelectorAll('td');
          const nameAnchor = cells[3].querySelector('a');
          const enchantCell = cells[6];

          // 构建装备对象
          return {
            level: cells[0].textContent.trim(), // 勇士等级
            type: cells[1].textContent.trim(), // 类型
            slot: cells[2].textContent.trim(), // 插槽
            name: {
              text: nameAnchor ? nameAnchor.textContent.trim() : '', // 名称文本
              link: nameAnchor ? nameAnchor.href : '', // 对应链接
              color: nameAnchor ? window.getComputedStyle(nameAnchor).getPropertyValue('color') : '', // 名称颜色
              image: nameAnchor ? nameAnchor.querySelector('img') ? nameAnchor.querySelector('img').src : '' : '' // 名称图片地址
            },
            set: cells[4].querySelector('a') ? cells[4].querySelector('a').textContent.trim() : '', // 套装
            trait: cells[5].textContent.trim(), // 特性
            enchant: {
              text: enchantCell.textContent.trim(), // 附魔文本
              color: window.getComputedStyle(enchantCell).getPropertyValue('color') // 附魔颜色
            }
          };
        });

        // 返回装备信息数组
        return gearItems;
      });

      const talentData = await page.evaluate(() => {
        //获取表格中所有的行
        const rows = Array.from(document.querySelectorAll('#summary-talents-0 tbody tr'));

        // 映射每一行数据，创建表格信息对象
        const talentItems = rows.map(row => {
          // 获取单元格数据
          const cells = row.querySelectorAll('td');
          const mainSkillCell = cells[0];
          const offSkillCell = cells[1];

          // 获取图标和文本信息
          const mainSkill = {
            icon: mainSkillCell.querySelector('img') ? mainSkillCell.querySelector('img').src : '',
            text: mainSkillCell.querySelector('span') ? mainSkillCell.querySelector('span').textContent.trim() : '',
            color: mainSkillCell.querySelector('span') ? window.getComputedStyle(mainSkillCell.querySelector('span')).getPropertyValue('color') : '' // 颜色
          };

          const offSkill = {
            icon: offSkillCell.querySelector('img') ? offSkillCell.querySelector('img').src : '',
            text: offSkillCell.querySelector('span') ? offSkillCell.querySelector('span').textContent.trim() : '',
            color: offSkillCell.querySelector('span') ? window.getComputedStyle(offSkillCell.querySelector('span')).getPropertyValue('color') : '' // 颜色
          };

          // 返回行对象
          return {
            mainSkill,
            offSkill
          };
        });

        // 返回技能信息数组
        return talentItems;
      });

      let accountName = ''
      let className = ''
      let roleName = ''
      let classNameCN = ''
      let roleNameCN = ''
      let has_find = false
      for (let oneActor of actorTable) {
        oneActor.actorName = oneActor.actorName.replace("+", "")
        if(!has_find && oneActor.actorName == playerName)
        {
          //logger.info(oneActor.img_class)
          if(oneActor.img_class.includes("Arcanist")) {
            className = "Arcanist"
            classNameCN = "奥术"
          } else if(oneActor.img_class.includes("Dragonknight")) {
            className = "Dragonknight"
            classNameCN = "龙骑"
          } else if(oneActor.img_class.includes("Necromancer")) {
            className = "Necromancer"
            classNameCN = "死灵"
          } else if(oneActor.img_class.includes("Nightblade")) {
            className = "Nightblade"
            classNameCN = "夜刃"
          } else if(oneActor.img_class.includes("Sorcerer")) {
            className = "Sorcerer"
            classNameCN = "巫师"
          } else if(oneActor.img_class.includes("Templar")) {
            className = "Templar"
            classNameCN = "圣骑"
          } else if(oneActor.img_class.includes("Warden")) {
            className = "Warden"
            classNameCN = "窝登"
          }

          if(oneActor.img_class.includes("StaminaDPS")) {
            roleName = "StaminaDPS"
            roleNameCN = "耐系"
          } else if(oneActor.img_class.includes("MagickaDPS")) {
            roleName = "MagickaDPS"
            roleNameCN = "法系"
          } else if(oneActor.img_class.includes("Healer")) {
            roleName = "Healer"
            roleNameCN = "奶妈"
          } else if(oneActor.img_class.includes("Tank")) {
            roleName = "Tank"
            roleNameCN = "坦克"
          }
          
          accountName = oneActor.accountId
          //logger.info(oneActor.img_class)
          has_find = true
        }
      }
      
      let race = ''
      let stone = ''
      let food = ''
      let food_icon = ''
      let potion = ''
      let potion_icon = ''

      let virtual = 0
      let bd = {
        virtual,
        playerName,
        accountName,
        className,
        classNameCN,
        roleName,
        roleNameCN,
        links,
        gearData,
        talentData,
        race,
        stone,
        food,
        food_icon,
        potion,
        potion_icon,
      };
      //logger.info(bd.playerName)
      //logger.info(bd.accountName)
      //logger.info(bd.className)
      //logger.info(bd.roleName)

      return bd
    } catch (error) {
      let virtual = 1
      let bd = {
        virtual
      };
      return bd
    } finally {

    }    
  }

  async getLinks (url) {

    // 启动浏览器
    if (!puppeteer.browser) {
      await puppeteer.browserInit()
    }
    const page = await puppeteer.browser.newPage()
    try {
      //logger.info('----waitForWebLoad----')
      page.goto(url, { waitUntil: 'load', timeout: 120000 });

      // 设置超时时间为30秒
      const selector = '#DataTables_Table_0_wrapper';
      const timeout = 30000; // 30秒

      // 等待页面加载完成，确保元素可访问
      //logger.info('----waitForSelector----')
      await page.waitForSelector('#DataTables_Table_0_wrapper');
      //await page.waitForSelector(selector, { timeout: timeout });

      const links = await page.evaluate(() => {
        // 获取所有表格
        const tables = document.querySelectorAll('.roles-table-0');
        let linkList = [];
        // 遍历每个表格
        tables.forEach(table => {
          // 获取表格第一列的所有单元格
          const cells = table.querySelectorAll('tbody tr td:first-child a');
          // 遍历每个单元格，提取超链接地址
          cells.forEach(cell => {
            linkList.push(cell.href);
          });
        });
        return linkList;
      });

      //logger.info(links)
      let virtual = 0
      let allLinks = {
        virtual,
        links
      };

      return allLinks
    } catch (error) {
      let virtual = 1
      let allLinks = {
        virtual,
      };
      return allLinks
    } finally {

    }    
  }

  async getRankLog (url) {
    let URL = url

    let BuildTable = await this.getRankData(URL)

    if(BuildTable.virtual)
    {
      let text = `抱歉，不支持解析该目标\n`+`请发送包含装备以及技能信息的esologs地址`
      return text
    }
    else
    {
      let RT = BuildTable.ranks
      //logger.info(BuildTable.zone)
      //logger.info(BuildTable.filterInfo)
      //logger.info('一共' + RT.length + '个目标')
      //logger.info(RT)

      /*
      for (let oneInfo of RT) {
        let msg = ''
        if(oneInfo.roleName[0] == '-')
        {
          oneInfo.roleName = oneInfo.roleName.replace('-','')
        }
        oneInfo.accountName = oneInfo.accountName.split('\n')[0];
        msg += '\n' + 'Class: ' + oneInfo.classType + '\n' + 'RoleName: ' + oneInfo.roleName + '\n' + 'AccountName: ' + oneInfo.accountName
        let index = 0
        for (let oneTalent of oneInfo.talents) {
          msg += '\n' + 'Talents[' + index + ']: ' + oneTalent
          index++;
        }
        index = 0;
        for (let oneGear of oneInfo.gears) {
          msg += '\n' + 'Gears[' + index + ']: ' + oneGear.name + '|' + oneGear.icon + '(' + oneGear.quality + ')' + '[' + oneGear.id + ']' //name, icon, quality, id
          index++;
        }
        logger.info(msg)
      }
      */
      
      
      //更新Build变量
      rankData = await database.updateData(BuildTable, 4)
      let img = await puppeteer.screenshot('eso', rankData)
      return img
      //return "text"
    }
  }

  async getRankData (url) {

    // 启动浏览器
    if (!puppeteer.browser) {
      await puppeteer.browserInit()
    }
    const page = await puppeteer.browser.newPage()
    try {
      //logger.info('----waitForWebLoad----')
      page.goto(url, { waitUntil: 'load', timeout: 120000 });

      // 设置超时时间为30秒
      const selector = '#DataTables_Table_0_wrapper';
      const timeout = 30000; // 30秒

      // 等待页面加载完成，确保元素可访问
      //logger.info('----waitForSelector----')
      await page.waitForSelector('#DataTables_Table_0_wrapper');
      //await page.waitForSelector(selector, { timeout: timeout });

      const zoneImage = await page.$eval('#zone-image', img => img.src);
      const zoneName = await page.$eval('.zone-name', a => a.textContent);
      const zoneType = await page.$eval('#zone-type', span => span.textContent.trim());
      let zone = {
        zoneImage,
        zoneName,
        zoneType
      };

      const filterInfo = await page.evaluate(() => {
        const filterConfig = {};

        // 提取 metric
        const metricText = document.querySelector('#filter-metric-text')?.textContent || 'N/A';
        filterConfig.metric = metricText;

        // 提取 boss
        const bossText = document.querySelector('#filter-boss-text')?.textContent || 'N/A';
        filterConfig.boss = bossText;

        // 提取 difficulty
        const difficultyText = document.querySelector('#filter-difficulty-text')?.textContent || 'N/A';
        filterConfig.difficulty = difficultyText;

        // 提取 class
        const classText = document.querySelector('#filter-class-text')?.textContent || 'N/A';
        filterConfig.class = classText;

        return filterConfig;
      });

      //#DataTables_Table_0 tbody tr
      const ranks = await page.evaluate(() => {
        const rows = document.querySelectorAll('#DataTables_Table_0 tbody tr');
        const data = [];

        rows.forEach(row => {
            const classImg = row.querySelector('.players-table-name img').src;
            const classType = row.querySelector('.players-table-name img').alt;
            const link = row.querySelector('.players-table-name a').href;
            const roleName = row.querySelector('.players-table-name a').textContent;
            const accountName = row.querySelector('.display-name-col').textContent;
            const scriptText = row.querySelectorAll('script') ? row.querySelectorAll('script')[1].textContent : 0;
            const talentsCellMatch = scriptText ? scriptText.match(/talentsCell: '([^']+)'/) : 0;
            let talents = false; // 默认值
            if(talentsCellMatch != 0 && talentsCellMatch.length > 1)
            {
              talents = [];
              talents = (talentsCellMatch[1].includes("png")) ? talentsCellMatch[1].match(/src="([^"]+)"/g).map(img => img.replace('src="', '').replace('"', '')) : [];
           }
            else
            {
              talents = [];
            }

            const gearsMatch = scriptText ? scriptText.match(/talentsAndGear\["row-\d+-\d+"\]\.gear\.push\(([^)]+)\)/g) : 0;
            
            const gears = gearsMatch ? gearsMatch.map(gearStr => {
                const gearObj = {};

                // 使用正则表达式匹配每个属性的值
                const nameMatch = gearStr.match(/name: "([^"]+)"/);
                const iconMatch = gearStr.match(/icon: "([^"]+)"/);
                const qualityMatch = gearStr.match(/quality: "([^"]+)"/);
                const idMatch = gearStr.match(/id: (\d+)/);

                if (nameMatch) gearObj.name = nameMatch[1];
                if (iconMatch) gearObj.icon = iconMatch[1];
                if (qualityMatch) gearObj.quality = qualityMatch[1];
                if (idMatch) gearObj.id = parseInt(idMatch[1], 10);

                return {
                    name: gearObj.name,
                    icon: gearObj.icon,
                    quality: gearObj.quality,
                    id: gearObj.id
                };
            }) : [];

            data.push({
                classImg,
                classType,
                link,
                roleName,
                accountName,
                talents,
                gears
            });
        });

        return data;
      });

      //logger.info(ranks)
      let virtual = 0
      let rankTable = {
        virtual,
        zone,
        filterInfo,
        ranks
      };

      return rankTable
    } catch (error) {
      let virtual = 1
      let rankTable = {
        virtual,
      };

      return rankTable
    } finally {

    }    
  }

  async splitStr (inputStr, beforeStr, afterStr) {
    let sourceStr = inputStr
    let outputStr = ''

    if(inputStr.includes(beforeStr)) {
      let tmpStr1 = inputStr.split(beforeStr)
      if(tmpStr1[1]) {
        let tmpStr2 = tmpStr1[1].split(afterStr)
        if(tmpStr2[0]) {
          outputStr = tmpStr2[0]
        }
        else
        {
          outputStr = tmpStr1[1]
        }
      } else {
        outputStr = ''
      }
    } else {
      outputStr = ''
    }

    return outputStr
  }

  async cache (data, cachedata) {
    let tmp = md5(JSON.stringify(data))
    if (cachedata.md5 == tmp) return cachedata.img

    //cachedata.img = 0
    cachedata.img = await puppeteer.screenshot('eso', data) /*html file saved in folder data/html/eso/ */
    cachedata.md5 = tmp

    return cachedata.img
  }

  async fastPuzzle_enable(e) {
    if(fast_mode == 1) return e.reply('本就开着啊', true)
    let userinfo = await Bot.pickMember(e.group_id, e.user_id).getSimpleInfo()
    userinfo.is_owner = await Bot.pickMember(e.group_id, e.user_id).is_owner
    userinfo.is_admin = await Bot.pickMember(e.group_id, e.user_id).is_admin
    if (!userinfo.is_owner && !userinfo.is_admin) return e.reply('请联系管理员才能开启快速分析', true)
    fast_mode = 1
    await this.e.reply('快速分析ESOLOG功能已开启')
  }
  async fastPuzzle_disable(e) {
    if(fast_mode == 0) return e.reply('本就关着啊', true)
    let userinfo = await Bot.pickMember(e.group_id, e.user_id).getSimpleInfo()
    userinfo.is_owner = await Bot.pickMember(e.group_id, e.user_id).is_owner
    userinfo.is_admin = await Bot.pickMember(e.group_id, e.user_id).is_admin
    if (!userinfo.is_owner && !userinfo.is_admin) return e.reply('请联系管理员才能关闭快速分析', true)
    fast_mode = 0
    await this.e.reply('快速分析ESOLOG功能已关闭')
  }
}