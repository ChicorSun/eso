import plugin from '../../../lib/plugins/plugin.js'
import common from "../../../lib/common/common.js"
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import database from '../model/database.js'
import md5 from 'md5'

//Build结构体变量
let buildData = {
}

//Group结构体数组
let groupData = {
  reportsID: '',
  fightIndex: 0,
  memberData: [],
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
    let reportsID = ''
    let fightIndex = 1
    let sourceIndex = 1


    //开始查询并返回Build结构体
      
      //------------------------------------    
      //buildData = await database.updateData("", 3)
      //let img = await this.cache(buildData, buildImg)
      //return await this.reply(img)
      //------------------------------------  

    if(!url.includes("rankings"))
    {
      let reportTemp = url.split('reports/')
      if(reportTemp[1]) {
        if(url.includes("?")) {
          let reportTempID = reportTemp[1].split('?')
          reportsID = reportTempID[0]
        } else {
          reportsID = reportTemp[1]
        }
      } else {
        reportsID = ''
      }

      if(url.includes("fight=")) {
        let urlTemp2 = url.split('fight=')
        if(urlTemp2[1]) {
          let urlKeyText = urlTemp2[1].split('&')
          if(urlKeyText[0]) {
            fightIndex = urlKeyText[0]
          }
        } else {
          fightIndex = 0
        }
      } else {
        fightIndex = 0
      }

      if(url.includes("source="))
      {
        let urlTemp3 = url.split('source=')
        if(urlTemp3[1]) {
          let urlKeyText = urlTemp3[1].split('&')
          if(urlKeyText[0]) {
            sourceIndex = urlKeyText[0]
          }
        } else {
          sourceIndex = 0
        }
      } else {
        sourceIndex = 0
      }

      logger.info('reportsID:' + reportsID)
      logger.info('fightIndex:' + fightIndex)
      logger.info('sourceIndex:' + sourceIndex)
    }

    if(url.includes("rankings"))
    {
      await this.reply('正在为您查询，请稍后...(大概需要15~25s)', true)
      let msg = await this.getRankLog(url)
      await this.reply(msg)
    }
    else if(url.includes("source"))
    {
      await this.reply('正在为您查询，请稍后...(大概需要15s)', true)
      if((groupData.reportsID != reportsID) || (groupData.fightIndex != fightIndex))
      {
        await this.getGroupLog(reportsID, fightIndex)
      }
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
        if((groupData.reportsID != reportsID) || (groupData.fightIndex != fightIndex))
        {
          await this.getGroupLog(reportsID, fightIndex)
        }
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

  async getGroupLog (reportsID, fightIndex) {
    let tfbURL = `https://tfb.gg/log-insights?url=https://www.esologs.com/reports/${reportsID}?fight=${fightIndex}`

    //logger.info('reportsID:' + reportsID)
    //logger.info('fightIndex:' + fightIndex)
    logger.info('tfbURL:' + tfbURL)

    let GD = await this.getTfbLog(tfbURL)
    if(GD.virtual)
    {
      logger.info('获取grouplog失败')
      let text = `抱歉，不支持解析该目标\n`+`请发送包含装备以及技能信息的esologs地址`
      return text
    }
    else
    {
      
      groupData.reportsID = reportsID
      groupData.fightIndex = fightIndex
      groupData.memberData = []
      for (let singleData of GD.data) {
        let url = singleData.href
        let sourceIndex = 0

        if(url.includes("source="))
        {
          let urlTemp3 = url.split('source=')
          if(urlTemp3[1])
          {
            let urlKeyText = urlTemp3[1].split('&')
            if(urlKeyText[0])
            {
              sourceIndex = urlKeyText[0]
            }
          }
          else
          {
            sourceIndex = 0
          }
        }
        else
        {
          sourceIndex = 0
        }


        /*--------------------分析span内的文本---------------------*/
        let accountName = ''
        let playerName = ''
        let lNum = 0
        let mNum = 0
        let hNum = 0
        let gearSets = []
        let race = ''
        let stone = ''
        let food = ''
        let potion = ''
        let extra_potion = ''

        let setsNum = singleData.preContent.length
        let spanIndex = 0
        let have_stone = 0
        let have_food = 0
        let stoneIndex = 0

        for (let spanInfo of singleData.spans) {
          if(spanIndex == 0){accountName = spanInfo}
          else if(spanIndex == 1){playerName = spanInfo}
          else if(spanIndex == 2){lNum = spanInfo}
          else if(spanIndex == 4){mNum = spanInfo}
          else if(spanIndex == 6){hNum = spanInfo}
          else if(spanIndex > 6 && spanIndex < 7+setsNum){
            gearSets.push(spanInfo);
          }
          else if(spanIndex == 7+setsNum){race = spanInfo}
          else if(spanIndex == 8+setsNum){
            if((spanInfo[0] == 'T') && (spanInfo[1] == 'h') && (spanInfo[2] == 'e'))
            {
              stoneIndex = spanIndex
              have_stone = 1
              stone = spanInfo
            } else {
              food = spanInfo
            }
          }
          else if(spanIndex == 9+setsNum){
            if(have_stone)
            {
              food = spanInfo
            } else {
              potion = spanInfo
            }
          }
          else if(spanIndex == 10+setsNum){
            if(have_stone)
            {
              potion = spanInfo
            }
            else
            {
              extra_potion = spanInfo
            }
          }
          else if(spanIndex == 11+setsNum){extra_potion = spanInfo}
          spanIndex++
        }
        if(food == '☹️')
        {
          food = potion
          potion = extra_potion
          have_food = 0
        } else {
          have_food = 1
        }
        /*--------------------------------------------------------*/


        /*--------------------分析imgs内的文本---------------------*/
        let className = ''
        let roleName = ''
        let talentPics = []
        let food_icon = ''
        let potion_icon = ''
        let talentNum = 0
        let imgIndex = 0
        let after_skills = 0
        for (let imgData of singleData.images) {
          //logger.info(imgData)
          if(imgIndex == 0){
            className = imgData.alt.split(' ')[0]
            roleName = imgData.alt.split(' ')[1]
          }
          else if(imgIndex > 0){
            if(!after_skills)
            {
              if(imgData.src.includes("abilities"))
              {
                talentPics.push(imgData.src);
                talentNum++
              }
              else
              {
                after_skills = 1
              }
            }
            else
            {
              if(have_food && (imgIndex == talentNum+3))
              {
                food_icon = imgData.src
              }
              if(have_food && (imgIndex == talentNum+4))
              {
                potion_icon = imgData.src
              }
              if(!have_food && (imgIndex == talentNum+3))
              {
                potion_icon = imgData.src
              }
            }
          }
          imgIndex++
        }
        
        let oneMember = {
          sourceIndex: sourceIndex,
          accountName: accountName,
          playerName: playerName,
          className: className,
          roleName: roleName,
          gearSets: gearSets,
          setsNum: singleData.preContent,
          talentPics: talentPics,
          lNum: lNum,
          mNum: mNum,
          hNum: hNum,
          race: race,
          stone: stone,
          food: food,
          food_icon: food_icon,
          potion: potion,
          potion_icon: potion_icon,
        };
        groupData.memberData.push(oneMember);
      }
      /*
      groupData = {
        reportsID: '',
        fightIndex: 0,
        memberData: [],
      }
      */
      //logger.info(groupData.memberData)
    }
  }

  async getOneManLog (src_url) {
    let url = src_url
    if(url.includes("translate"))
    {
      if(url.includes("translate=false"))
      {
        url.replace("translate=false", "translate=true")
      }
    }
    else
    {
      url = url + "&translate=true"
    }
    let summaryURL = url
    let buffsURL = url
    let tfbURL = url
    let urlType = ''
    let urlTemp = url.split('type=')

    let reportTemp = url.split('reports/')
    let reportsID = ''

    let fightIndex = 1

    let sourceIndex = 1

    if(reportTemp[1])
    {
      if(url.includes("?"))
      {
        let reportTempID = reportTemp[1].split('?')
        reportsID = reportTempID[0]
      }
      else
      {
        reportsID = reportTemp[1]
      }
    }
    else
    {
      reportsID = ''
    }

    if(url.includes("fight="))
    {
      let urlTemp2 = url.split('fight=')
      if(urlTemp2[1])
      {
        let urlKeyText = urlTemp2[1].split('&')
        if(urlKeyText[0])
        {
          fightIndex = urlKeyText[0]
        }
      }
      else
      {
        fightIndex = 0
      }
    }
    else
    {
      fightIndex = 0
    }

    if(url.includes("source="))
    {
      let urlTemp3 = url.split('source=')
      if(urlTemp3[1])
      {
        let urlKeyText = urlTemp3[1].split('&')
        if(urlKeyText[0])
        {
          sourceIndex = urlKeyText[0]
        }
      }
      else
      {
        sourceIndex = 0
      }
    }
    else
    {
      sourceIndex = 0
    }


    //https://tfb.gg/log-insights?url=https://www.esologs.com/reports/DW7JaCGqYn4pzcFm?fight=6

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

    tfbURL = `https://tfb.gg/log-insights?url=https://www.esologs.com/reports/${reportsID}?fight=${fightIndex}`

    //logger.info('url:' + url)
    //logger.info('summaryURL:' + summaryURL)
    //logger.info('buffsURL:' + buffsURL)
    //logger.info('reportsID:' + reportsID)
    //logger.info('fightIndex:' + fightIndex)
    //logger.info('sourceIndex:' + sourceIndex)
    //logger.info('tfbURL:' + tfbURL)

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
      if((groupData.reportsID == reportsID) && (groupData.fightIndex == fightIndex))
      {
        /*
      let bd = {
        virtual,
        playerName,
        accountName,
        className,
        roleName,
        actorTable,
        links,
        gearData,
        talentData,
        gearSets,
        setsNum,
        talentPics,
        lNum,
        mNum,
        hNum,
        race,
        stone,
        food,
        food_icon,
        potion,
        potion_icon,
      };

        let oneMember = {
          sourceIndex: sourceIndex,
          accountName: accountName,
          playerName: playerName,
          className: className,
          roleName: roleName,
          gearSets: gearSets,
          setsNum: singleData.preContent,
          talentPics: talentPics,
          lNum: lNum,
          mNum: mNum,
          hNum: hNum,
          race: race,
          stone: stone,
          food: food,
          food_icon: food_icon,
          potion: potion,
          potion_icon: potion_icon,
        };
        groupData.memberData.push(oneMember);
         */
        let index = 0
        let find_it = 0
        for (let imgData of groupData.memberData) {
          if(groupData.memberData[index].sourceIndex == sourceIndex)
          {
            find_it = 1
            break
          }
          index++
        }
        if(find_it)
        {
          BD.accountName = groupData.memberData[index].accountName
          BD.playerName = groupData.memberData[index].playerName
          BD.className = groupData.memberData[index].className
          BD.roleName = groupData.memberData[index].roleName
          BD.gearSets = groupData.memberData[index].gearSets
          BD.setsNum = groupData.memberData[index].setsNum
          BD.talentPics = groupData.memberData[index].talentPics
          BD.lNum = groupData.memberData[index].lNum
          BD.mNum = groupData.memberData[index].mNum
          BD.hNum = groupData.memberData[index].hNum
          BD.race = groupData.memberData[index].race
          BD.stone = groupData.memberData[index].stone
          BD.food = groupData.memberData[index].food
          BD.food_icon = groupData.memberData[index].food_icon
          BD.potion = groupData.memberData[index].potion
          BD.potion_icon = groupData.memberData[index].potion_icon
        }
      }
      //logger.info(BD)

      //更新Build变量
      buildData = await database.updateData(BD, 3)
      //let img = await this.cache(buildData, buildImg)
      let img = await puppeteer.screenshot('eso', buildData)
      return img
    }
  }

  async getTfbLog (url) {

    // 启动浏览器
    if (!puppeteer.browser) {
      await puppeteer.browserInit()
    }
    const page = await puppeteer.browser.newPage()
    try {
      //logger.info('----waitForWebLoad----')
      page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });

      // 设置超时时间为30秒
      const selector = '#summary-gear-0_wrapper';
      const timeout = 30000; // 30秒

      // 等待页面加载完成，确保元素可访问
      //logger.info('----waitForSelector----')
      await page.waitForSelector('.grid.sm\\:grid-cols-2.gap-4.items-start', { timeout: 30000 });

      // 确保页面包含“Detected Issues”且不包含“Retrieving Player Data”
      await page.waitForFunction(
        () => {
          const issues = document.querySelector('.grid.sm\\:grid-cols-2.gap-4.items-start').textContent.includes('Detected Issues');
          const retrieving = document.querySelector('.grid.sm\\:grid-cols-2.gap-4.items-start').textContent.includes('Retrieving Player Data');
          return issues && !retrieving;
        },
        { timeout: 30000 }
      );

      const data = await page.evaluate(() => {
        const links = document.querySelectorAll('.grid.sm\\:grid-cols-2.gap-4.items-start a');
        const result = [];

        links.forEach(link => {
          const images = link.querySelectorAll('img');
          const spans = link.querySelectorAll('span');
          const preContent = link.querySelectorAll('pre') ? link.querySelectorAll('pre'): '';
          const item = {
            href: link.href,
            images: Array.from(images).map(img => ({
              src: img.src,
              alt: img.alt
            })),
            spans: Array.from(spans).map(span => span.textContent.trim()),
            preContent: Array.from(preContent).map(pre => pre.textContent.trim()),
          };
          result.push(item);
        });

        return result;
      });

      let virtual = 0
      let gd = {
        virtual,
        data,
      };
      return gd
    } catch (error) {
      let virtual = 1
      let gd = {
        virtual
      };
      return gd
    } finally {

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

      let className = ''
      let roleName = ''
      let lNum = 0
      let mNum = 0
      let hNum = 0
      let gearSets = []
      let setsNum = []
      let talentPics = []
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
        roleName,
        actorTable,
        links,
        gearData,
        talentData,
        gearSets,
        setsNum,
        talentPics,
        lNum,
        mNum,
        hNum,
        race,
        stone,
        food,
        food_icon,
        potion,
        potion_icon,
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

  async cache (data, cachedata) {
    let tmp = md5(JSON.stringify(data))
    if (cachedata.md5 == tmp) return cachedata.img

    //cachedata.img = 0
    cachedata.img = await puppeteer.screenshot('eso', data) /*html file saved in folder data/html/eso/ */
    cachedata.md5 = tmp

    return cachedata.img
  }
}