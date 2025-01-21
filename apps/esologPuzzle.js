import plugin from '../../../lib/plugins/plugin.js'
import common from "../../../lib/common/common.js"
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import database from '../model/database.js'
import md5 from 'md5'

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
    let urlText = this.e.message[0].text
    let urlTemp = urlText.split('esologs.com')
    if(urlTemp.length < 2)
    {
      return await this.reply(`抱歉，不支持解析该目标\n`
                      +`请发送esologs相关的地址`)
    }

    let url = 'https://www.esologs.com' + urlTemp[1]

    //开始查询并返回Build结构体
      
      //------------------------------------    
      //buildData = await database.updateData("", 3)
      //let img = await this.cache(buildData, buildImg)
      //return await this.reply(img)
      //------------------------------------  

    if(url.includes("rankings"))
    {
      await this.reply('正在为您查询，请稍后...(大概需要15s)', true)
      let msg = await this.getRankLog(url)
      await this.reply(msg)
    }
    else if(url.includes("source"))
    {
      await this.reply('正在为您查询，请稍后...(大概需要15s)', true)
      let msg = await this.getOneManLog(url)
      await this.reply(msg)
    }
    else
    {
      await this.reply('正在为您查询，请稍后...(可能需要120s)', true)
      let urls = await this.getAllLinks(url)
      //logger.info(urls)

      if(urls.virtual || urls.links.length == 0)
      {
        let text = `抱歉，不支持解析该目标\n`+`请发送包含装备以及技能信息的esologs地址`
        await this.reply(text)
      }
      else
      {
        let index = 0
        let maxNum = urls.links.length
        let thisMsgSenderQQ = 1456181660;
        let thisMsgSenderNickname = '@Yui结衣(导航精灵)';
        let fakeMsg = [];
        for (let oneMan of urls.links) {
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

          let msg = await this.getOneManLog(oneMan)
          fakeMsg.push(msg)
        }
        await e.reply(await common.makeForwardMsg(e, fakeMsg, '团队LOG', true))
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

  async getOneManLog (url) {
    let summaryURL = url
    let buffsURL = url
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
        buffsURL = url.replace(urlType, "auras")
      }
    }
    //logger.info('url:' + url)
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
        // 获取所有角色菜单项
        const actorMenuItems = document.querySelectorAll('.actor-menu-item > a.actor-menu-link');

        // 遍历每个角色菜单项
        return Array.from(actorMenuItems).map(item => {
          // 提取角色名
          const actorName = item.textContent.trim();
          // 提取账户名，它位于角色名同一行的下一个td元素中
          const accountId = item.closest('tr').querySelector('.ability-menu-id')?.textContent.trim() || '';
      
          return { actorName, accountId };
        });
      });
      actorTable.push(...result);

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
      let has_find = false
      for (let oneActor of actorTable) {
        oneActor.actorName = oneActor.actorName.replace("+", "")
        if(!has_find && oneActor.actorName == playerName)
        {
          accountName = oneActor.accountId
          has_find = true
        }
      }

      let virtual = 0
      let bd = {
        virtual,
        playerName,
        accountName,
        actorTable,
        links,
        gearData,
        talentData
      };
      //logger.info(bd.playerName)
      //logger.info(bd.actorTable)
      //logger.info(bd.links)
      //logger.info(bd.accountName)
      //logger.info(bd.gearData)
      //logger.info(bd.talentData) 


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
      rankData = await database.updateData(RT, 4)
      let img = await puppeteer.screenshot('eso', rankData)
      return img
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

      //#DataTables_Table_0 tbody tr
      const ranks = await page.evaluate(() => {
        const rows = document.querySelectorAll('#DataTables_Table_0 tbody tr');
        const data = [];

        rows.forEach(row => {
            const classImg = row.querySelector('.players-table-name img').src;
            const classType = row.querySelector('.players-table-name img').alt;
            const link = row.querySelector('.players-table-name a').href;
            const roleName = row.querySelector('.players-table-name a').textContent;
            const accountName = row.querySelector('.display-name-col').textContent
            const scriptText = row.querySelectorAll('script')[1].textContent;
            const talentsCellMatch = scriptText.match(/talentsCell: '([^']+)'/);
            const talents = talentsCellMatch ? talentsCellMatch[1].match(/src="([^"]+)"/g).map(img => img.replace('src="', '').replace('"', '')) : [];
            const gearsMatch = scriptText.match(/talentsAndGear\["row-\d+-\d+"\]\.gear\.push\(([^)]+)\)/g);
            /*
            const gears = gearsMatch ? gearsMatch.map(gear => {
                const gearObj = JSON.parse(gear.replace(/gear: /g, '"gear": ').replace(/name: /g, '"name": ').replace(/icon: /g, '"icon": ').replace(/quality: /g, '"quality": ').replace(/id: /g, '"id": '));
                return {
                    name: gearObj.name,
                    icon: gearObj.icon,
                    quality: gearObj.quality,
                    id: gearObj.id
                };
            }) : [];
            */
            const gears = gearsMatch.map(gearStr => {
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
            });


            data.push({
                classImg,
                classType,
                link,
                roleName,
                accountName,
                //script: scriptText,
                talents,
                //gearsMatch,
                gears
            });
        });

        return data;
      });

      //logger.info(ranks)
      let virtual = 0
      let rankTable = {
        virtual,
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

  async cache (data, cachedata) {
    let tmp = md5(JSON.stringify(data))
    if (cachedata.md5 == tmp) return cachedata.img

    //cachedata.img = 0
    cachedata.img = await puppeteer.screenshot('eso', data) /*html file saved in folder data/html/eso/ */
    cachedata.md5 = tmp

    return cachedata.img
  }
}