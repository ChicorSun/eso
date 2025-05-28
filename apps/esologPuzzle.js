import plugin from '../../../lib/plugins/plugin.js'
import common from "../../../lib/common/common.js"
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import database from '../model/database.js'
import md5 from 'md5'
import fs from 'node:fs'

// 配置文件路径
const CONFIG_PATH = './plugins/eso/custome_resources/config/esologcfg.json'
const ACCOUNT_PATH = './plugins/eso/custome_resources/data/account_data.json'
const BUILD_PATH = './plugins/eso/custome_resources/data/builds/'
let configLoaded = false

// 最大并发数
let MAX_WEB_NUM = 6
// 最大等待时间（毫秒）
let MAX_WAIT_TIME = 60000
// 日志打印间隔（毫秒）
const LOG_INTERVAL = 5000
// 当前运行的页面数
let running_page_num = 0

//快速模式开关
let fast_mode = 0

//Group结构体数组
let groupsData = []

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
        },
        {
          /** 命令正则匹配 */
          reg: '^#*绑定.*$',
          /** 执行方法 */
          fnc: 'bindAccount'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(解绑|解除绑定).*$',
          /** 执行方法 */
          fnc: 'unbindAccount'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(角色|查看角色).*$',
          /** 执行方法 */
          fnc: 'queryRole'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(删除角色).*$',
          /** 执行方法 */
          fnc: 'deleteRole'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(查询绑定|查看绑定|绑定查询|已绑定|查绑定)$',
          /** 执行方法 */
          fnc: 'queryBindings'
        },
        {
          reg: '^#*设置解析速度.*$',
          fnc: 'setMaxWebNum'
        },
        {
          reg: '^#*设置等待时间.*$',
          fnc: 'setMaxWaitTime'
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
    let recordEnable = 0
    let urlText = await this.trimText(e)
    if(urlText.includes("记录")) {
      recordEnable = 1
      urlText = urlText.replace("记录角色", "").replace("记录", "")
    } else {
      recordEnable = 0
    }
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
      else if(sourceIndex == '' || recordEnable)
      {
        //查询团队信息
        await this.reply('正在为您解析...', true)
        let has_find = false
        let recordID = -1
        let index = 0
        for (let groupData of groupsData) {
          if((groupData.reportsID == reportsID) && (groupData.fightIndex == fightIndex))
          {
            has_find = true
            recordID = index
            break
          }
          index++
        }
        if(!has_find)
        {
          recordID = await this.getGroupLog(reportsID, fightIndex)
          /*
          if(recordID != -1)
          {
            logger.info(groupsData[recordID])
          }
          */
        }
        
        if(recordID == -1)
        {
          let text = `抱歉，不支持解析该目标\n`+`请发送包含装备以及技能信息的esologs地址`
          await this.reply(text)
        }
        else
        {
          if(tmpComPuzzleEnable || recordEnable)
          {
            let maxNum = groupsData[recordID].memberData.length
            if(!recordEnable)
            {
              await this.reply('正在完整解析全队信息，请稍后...(可能需要120s)', true)
            }
            else
            {
              await this.reply('正在记录模式解析您的信息，请稍后...', true)
            }
            
            let completedCount = 0;
            let targetIndices = [];  // 移到外层作用域
            
            if(recordEnable) {
              let userId = String(e.user_id);
              
              // 读取用户绑定数据
              try {
                if (fs.existsSync(ACCOUNT_PATH)) {
                  const bindData = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));
                  if (bindData[userId] && bindData[userId].length > 0) {
                    // 遍历团队成员
                    groupsData[recordID].memberData.forEach((oneMan, index) => {
                      // 遍历用户绑定的角色
                      for (const binding of bindData[userId]) {
                        // 如果绑定了playerName，需要精确匹配角色名
                        if (binding.playerName) {
                          if (oneMan.playerName === binding.playerName) {
                            targetIndices.push(index);
                            break;
                          }
                        } 
                        // 如果只绑定了accountName，只需匹配账号
                        else if (binding.accountName)
                        {
                          let accountName = '@' + binding.accountName
                          if(oneMan.accountName == accountName)
                          {
                            targetIndices.push(index);
                            break
                          }
                        }
                      }
                    });
                  }
                }

                if (targetIndices.length === 0) {
                  return await this.reply('未在团队中找到您绑定的角色，请先使用#绑定命令绑定您的角色。');
                }
              } catch (error) {
                logger.error(`[ESO:战斗日志] 读取绑定数据失败: ${error.message}`);
                return await this.reply('读取绑定数据失败，请稍后重试');
              }
            }
            
            // 第一阶段：并发获取所有成员的日志和构建数据
            const memberPromises = groupsData[recordID].memberData.map(async (oneMan, index) => {
              // 如果是记录模式且不在目标索引中，跳过处理
              if (recordEnable && !targetIndices.includes(index)) {
                return null;
              }

              const sourceIndex = oneMan.sourceIndex;
              let BD = await this.getOneManLog(reportsID, fightIndex, sourceIndex, false);
              
              let result;
              if(BD.virtual) {
                result = {
                  index,
                  isError: true,
                  data: `抱歉，不支持解析该目标\n请发送包含装备以及技能信息的esologs地址`
                }
              } else {
                if(recordEnable) {
                  try {
                    // 确保目录存在
                    if (!fs.existsSync(BUILD_PATH)) {
                      fs.mkdirSync(BUILD_PATH, { recursive: true });
                    }

                    // 构建文件路径
                    const accountFileName = `${BUILD_PATH}${BD.accountName.replace('@', '')}.json`;
                    
                    // 读取现有数据或创建新的数据结构
                    let accountData = {};
                    if (fs.existsSync(accountFileName)) {
                      accountData = JSON.parse(fs.readFileSync(accountFileName, 'utf8'));
                    }

                    // 初始化玩家数据结构
                    if (!accountData[BD.playerName]) {
                      accountData[BD.playerName] = {
                        builds: []
                      };
                    }

                    // 检查是否存在完全相同的记录
                    const existingRecord = accountData[BD.playerName].builds.find(build => 
                      build.reportsID === reportsID &&
                      build.fightIndex === fightIndex &&
                      build.sourceIndex === sourceIndex
                    );

                    if (existingRecord) {
                      logger.info(`[ESO:战斗日志] 跳过重复记录: ${BD.accountName}/${BD.playerName}`);
                      await this.reply([
                        { type: 'at', qq: this.e.user_id },
                        { type: 'text', text: '该构建数据已经记录过了，跳过重复记录。' }
                      ], false, { recallMsg: 5 });
                    } else {
                      // 创建新的构建记录
                      const buildRecord = {
                        timestamp: new Date().toISOString(),
                        reportsID,
                        fightIndex,
                        sourceIndex,
                        buildData: BD
                      };

                      // 添加新的构建记录
                      accountData[BD.playerName].builds.push(buildRecord);

                      // 保存数据
                      fs.writeFileSync(accountFileName, JSON.stringify(accountData, null, 2));
                      logger.info(`[ESO:战斗日志] 已保存构建数据: ${BD.accountName}/${BD.playerName}`);
                    }
                  } catch (error) {
                    logger.error(`[ESO:战斗日志] 保存构建数据失败: ${error.message}`);
                  }
                }
                let buildData = JSON.parse(JSON.stringify(await database.updateData(BD, 3)));
                result = {
                  index,
                  isError: false,
                  data: buildData
                }
              }

              // 更新完成计数并发送进度
              completedCount++;
              const totalCount = recordEnable ? targetIndices.length : groupsData[recordID].memberData.length;
              if(completedCount % 5 === 0 || completedCount === totalCount) {
                let progressMsg = [
                  { type: 'at', qq: this.e.user_id },
                  { type: 'text', text: `已获取 ${completedCount}/${totalCount} 人的数据` }
                ]
                await this.reply(progressMsg, false, { recallMsg: -1 });
              }

              return result;
            });

            // 等待所有数据获取完成
            const results = await Promise.all(memberPromises);
            
            // 过滤掉null结果并按原始索引排序
            const filteredResults = results.filter(result => result !== null).sort((a, b) => a.index - b.index);

            // 第二阶段：生成截图
            await this.reply('所有数据获取完成，正在生成图片...', true)
            
            const fakeMsg = []
            for (const result of filteredResults) {
              let msg
              if (result.isError) {
                msg = result.data // 错误消息
              } else {
                msg = await puppeteer.screenshot('eso', result.data)
              }
              fakeMsg.push(msg)
            }
            
            // 发送结果
            await e.reply(await common.makeForwardMsg(e, fakeMsg, '团队LOG', true))
          } else {
            await this.reply('正在快速解析全队信息，请稍后...(快速解析只会展示简略信息)', true)
          }
          //delete groupsData[recordID]
        }      
      } else {
        //查询单人的信息
        await this.reply('正在为您分析，请稍后...(大概需要15s)', true)
        let BD = await this.getOneManLog(reportsID, fightIndex, sourceIndex, true)
        if(BD.virtual)
        {
          let text = `抱歉，不支持解析该目标\n`+`请发送包含装备以及技能信息的esologs地址`
          return text
        }
        else
        {
          //更新Build变量
          let buildData = JSON.parse(JSON.stringify(await database.updateData(BD, 3)))
          let msg = await puppeteer.screenshot('eso', buildData)
          await this.reply(msg)
        }
      }
    }
  }

  async getGroupLog (reportsID, fightIndex) {
    let groupURL = `https://www.esologs.com/reports/${reportsID}?fight=${fightIndex}&type=summary&translate=true`

    let GD = JSON.parse(JSON.stringify(await this.getWebData(groupURL, 'group')))
    if(!GD.virtual)
    {
      let groupData = {
        reportsID: '',
        fightIndex: 0,
        memberData: []
      };

      groupData.memberData = []
      for (let oneMan of GD.data) {
        let sourceIndex = 0
        let class_role = ''
        let className = ''
        let classNameCN = ''
        let roleName = ''
        let roleNameCN = ''

        sourceIndex = await this.splitStr(oneMan.link, 'source=', '&')
        class_role = oneMan.className_roleName

        //logger.info(class_role)
        if(class_role.includes("Arcanist")) {
          className = "Arcanist"
          classNameCN = "奥术"
        } else if(class_role.includes("Dragonknight")) {
          className = "Dragonknight"
          classNameCN = "龙骑"
        } else if(class_role.includes("Necromancer")) {
          className = "Necromancer"
          classNameCN = "死灵"
        } else if(class_role.includes("Nightblade")) {
          className = "Nightblade"
          classNameCN = "夜刃"
        } else if(class_role.includes("Sorcerer")) {
          className = "Sorcerer"
          classNameCN = "巫师"
        } else if(class_role.includes("Templar")) {
          className = "Templar"
          classNameCN = "圣骑"
        } else if(class_role.includes("Warden")) {
          className = "Warden"
          classNameCN = "窝登"
        }

        if(class_role.includes("Stamina")) {
          roleName = "StaminaDPS"
          roleNameCN = "耐系"
        } else if(class_role.includes("Magicka")) {
          roleName = "MagickaDPS"
          roleNameCN = "法系"
        } else if(class_role.includes("Healer")) {
          roleName = "Healer"
          roleNameCN = "奶妈"
        } else if(class_role.includes("Tank")) {
          roleName = "Tank"
          roleNameCN = "坦克"
        }

        let oneMember = {
          sourceIndex: sourceIndex,
          accountName: oneMan.accountName,
          playerName: oneMan.playerName,
          className: className,
          classNameCN: classNameCN,
          roleName: roleName,
          roleNameCN: roleNameCN,
          gears: oneMan.gears,
          talents: oneMan.talents
        };
        groupData.memberData.push(oneMember);
      }
      groupData.reportsID = reportsID
      groupData.fightIndex = fightIndex
      groupsData.push(groupData);

      let recordID = groupsData.length - 1
      return recordID
    }
    else
    {
      return -1
    }
  }

  async getOneManLog (reportsID, fightIndex, sourceIndex, delete_record) {
    let need_group_data = true
    let summaryURL = `https://www.esologs.com/reports/${reportsID}?fight=${fightIndex}&source=${sourceIndex}&type=summary&translate=true`
    let buffsURL = `https://www.esologs.com/reports/${reportsID}?fight=${fightIndex}&source=${sourceIndex}&target=${sourceIndex}&type=auras&translate=true`
    let buffInfo = ''
    //logger.info('summaryURL:' + summaryURL)
    //logger.info('buffsURL:' + buffsURL)

    let BD = JSON.parse(JSON.stringify(await this.getWebData(summaryURL, 'summary')))
    let SD = JSON.parse(JSON.stringify(await this.getWebData(buffsURL, 'buffs')))

    if(SD.virtual)
    {
      //logger.info('SD:获取失败')
    }
    else
    {
      let buffsData  = await database.updateData(SD, 5)
      //logger.info('SD.data:' + SD.data)
      //logger.info('Buff num:' + SD.data.length)
      //logger.info(buffsData)
      BD.stoneInfo = buffsData.stoneInfo
      BD.foodInfo = buffsData.foodInfo
      BD.raceInfo = buffsData.raceInfo 
      BD.skillLineInfo = buffsData.skillLineInfo 
    }

    if(BD.virtual)
    {
      logger.info('尝试解析失败' + BD.playerName + BD.accountName)
      return BD
    }
    else
    {
      let has_find = false
      let recordID = -1
      let index = 0
      index = 0
      for (let groupData of groupsData) {

        if((groupData.reportsID == reportsID) && (groupData.fightIndex == fightIndex))
        {
          has_find = true
          recordID = index
          break
        }
        index++
      }

      if((BD.className == '' || BD.roleName == '' || (!BD.accountName.includes('@'))) && need_group_data && !has_find)
      {
        recordID = await this.getGroupLog(reportsID, fightIndex)
      }

      if(recordID != -1)
      {
        for (let oneMan of groupsData[recordID].memberData) {
          if(sourceIndex == oneMan.sourceIndex)
          {
            BD.className = oneMan.className
            BD.classNameCN = oneMan.classNameCN
            BD.roleName = oneMan.roleName
            BD.roleNameCN = oneMan.roleNameCN
            BD.accountName = oneMan.accountName
            break
          }
        }
        if(delete_record)
        {
          //delete groupsData[recordID]
        }
      }

      if(!BD.accountName.includes('@'))
      {
        BD.accountName= ''
      }

      logger.info('已经完成解析' + BD.playerName + BD.accountName)
      //logger.info(BD)

      return BD
    }
  }

  async getWebData (url, type) {
    let result;
    
    try {
      // 等待直到有可用的并发槽或超时
      const startTime = Date.now();
      let lastLogTime = 0;
      while (running_page_num >= MAX_WEB_NUM) {
        // 每5秒打印一次日志
        const now = Date.now();
        if (now - lastLogTime >= LOG_INTERVAL) {
          logger.info(`[ESO:战斗日志] 当前运行页面数: ${running_page_num}，等待可用槽位...`);
          lastLogTime = now;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 检查是否超时
        if (now - startTime > MAX_WAIT_TIME) {
          throw new Error('[ESO:战斗日志] 等待可用槽位超时');
        }
      }

      // 增加运行页面计数
      running_page_num++;
      logger.info(`[ESO:战斗日志] 页面数+1: ${running_page_num}`);

      switch (type) {
        case 'summary':
          result = await this.getSummaryLog(url);
          break;
        case 'buffs':
          result = await this.getBuffsLog(url);
          break;
        case 'group':
          result = await this.getGroupData(url);
          break;
        case 'rank':
          result = await this.getRankData(url);
          break;
        default:
          result = await this.getSummaryLog(url);
          break;
      }

      return result;
    } catch (error) {
      logger.error(`[ESO:战斗日志] 获取页面数据出错: ${error.message}`);
      throw error;
    } finally {
      // 减少运行页面计数
      running_page_num--;
      logger.info(`[ESO:战斗日志] 页面数-1: ${running_page_num}`);
    }
  }

  async getBuffsLog (url) {
    // 启动浏览器
    if (!puppeteer.browser) {
      await puppeteer.browserInit()
    }
    const page = await puppeteer.browser.newPage()
    try {
      // 设置更短的导航超时时间
      page.setDefaultNavigationTimeout(30000);
      
      try {
        // 使用 domcontentloaded 而不是 load
        await Promise.race([
          page.goto(url, { waitUntil: 'domcontentloaded' }),
          // 一旦发现目标元素就继续执行
          page.waitForSelector('.spells-table-wrapper', { timeout: 120000 })
        ]);
      } catch (navError) {
        if (navError.message.includes('Navigating frame was detached')) {
          logger.debug('[ESO:战斗日志] 页面导航中断，继续处理');
        } else {
          throw navError;
        }
      }

      // 只等待必要的元素
      await page.waitForSelector('.spells-table-wrapper', { timeout: 120000 });
      
      const data = await page.evaluate(() => {
        // 获取所有包含auras-table的表格
        const tables = document.querySelectorAll('.spells-table-wrapper .auras-table');
        let dataList = [];
  
        // 遍历每个表格
        tables.forEach(table => {
          // 获取表格的所有行
          const rows = table.querySelectorAll('tbody tr');
          // 遍历每一行
          rows.forEach(row => {
            // 获取第一列的单元格
            const firstCell = row.querySelector('td:first-child');
            if (firstCell) {
              // 获取img的地址
              const img = firstCell.querySelector('img')?.src || '';
              // 获取class包含"tooltip main-table-link school-2"的超链接
              const linkElement = firstCell.querySelector('a.tooltip.main-table-link');
              const link = linkElement?.href || '';
              const buffName = linkElement?.textContent || '';
              
              if (img && link && buffName) {
                // 将数据添加到数组中
                dataList.push({
                  img: img,
                  link: link,
                  buffName: buffName
                });
              }
            }
          });
        });
  
        return dataList;
      });

      let virtual = 0
      let sd = {
        virtual,
        data
      };
      return sd
    } catch (error) {
      let virtual = 1
      let sd = {
        virtual
      };
      return sd
    } finally {
      if (page) {
        await page.close().catch(err => logger.error('[ESO:战斗日志] 关闭页面失败:', err));
      }
    }    
  }

  async getSummaryLog (url) {
    if (!puppeteer.browser) {
      await puppeteer.browserInit()
    }
    const page = await puppeteer.browser.newPage()
    try {
      // 设置更短的导航超时时间
      page.setDefaultNavigationTimeout(30000);
      
      try {
        // 使用 domcontentloaded 而不是 load
        await Promise.race([
          page.goto(url, { waitUntil: 'domcontentloaded' }),
          // 一旦发现目标元素就继续执行
          page.waitForSelector('#summary-gear-0_wrapper', { timeout: 120000 })
        ]);
      } catch (navError) {
        if (navError.message.includes('Navigating frame was detached')) {
          logger.debug('[ESO:战斗日志] 页面导航中断，继续处理');
        } else {
          throw navError;
        }
      }

      // 只等待必要的元素
      await page.waitForSelector('#summary-gear-0_wrapper', { timeout: 120000 });
      
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
      let stoneInfo = [];
      let foodInfo = [];
      let raceInfo = [];
      let skillLineInfo = [];
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
        stoneInfo,
        foodInfo,
        raceInfo,
        skillLineInfo,
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
      if (page) {
        await page.close().catch(err => logger.error('[ESO:战斗日志] 关闭页面失败:', err));
      }
    }    
  }

  async getGroupData (url) {
    if (!puppeteer.browser) {
      await puppeteer.browserInit()
    }
    const page = await puppeteer.browser.newPage()
    try {
      // 设置更短的导航超时时间
      page.setDefaultNavigationTimeout(30000);
      
      try {
        // 使用 domcontentloaded 而不是 load
        await Promise.race([
          page.goto(url, { waitUntil: 'domcontentloaded' }),
          // 一旦发现目标元素就继续执行
          page.waitForSelector('.character-details-contents', { timeout: 120000 })
        ]);
      } catch (navError) {
        if (navError.message.includes('Navigating frame was detached')) {
          logger.debug('[ESO:战斗日志] 页面导航中断，继续处理');
        } else {
          throw navError;
        }
      }

      // 只等待必要的元素
      await page.waitForSelector('.character-details-contents', { timeout: 120000 });
      
      const data = await page.evaluate(() => {
        // 获取character-details-contents下的所有.roles-table-0表格
        const tables = document.querySelectorAll('.character-details-contents .roles-table-0');
        let gdArray = [];

        // 遍历每个表格
        tables.forEach(table => {
          // 获取表格的所有行
          const rows = table.querySelectorAll('tbody tr');
          // 遍历每一行
          rows.forEach(row => {
            // 创建一个结构体对象
            let gdItem = {
              link: '',
              playerName: '',
              accountName: '',
              className_roleName: '',
              gears: [],
              talents: []
            };

            // 获取第一列的class=name-and-spec的span
            const nameAndSpecSpan = row.querySelector('td:first-child .name-and-spec');
            if (nameAndSpecSpan) {
              // 提取超链接地址和文本
              const linkAnchor = nameAndSpecSpan.querySelector('a');
              if (linkAnchor) {
                gdItem.link = linkAnchor.href;
                gdItem.playerName = linkAnchor.textContent.trim();
              }
              // 提取accountName
              const accountNameSpan = nameAndSpecSpan.querySelector('.display-name.artifact');
              if (accountNameSpan) {
                gdItem.accountName = accountNameSpan.textContent.trim();
              }
              // 提取className_roleName
              const classSpecDescSpan = nameAndSpecSpan.querySelector('.class-spec-desc');
              if (classSpecDescSpan) {
                gdItem.className_roleName = classSpecDescSpan.textContent.trim();
              }
            }

            // 获取第二列gear-cell中的所有超链接
            const gearAnchors = row.querySelectorAll('td.gear-cell a');
            gearAnchors.forEach(anchor => {
              gdItem.gears.push({
                gearUrl: anchor.href,
                gearName: anchor.title,
                img: anchor.querySelector('img').src
              });
            });

            // 获取第三列talents-cell中的所有超链接
            const talentAnchors = row.querySelectorAll('td.talents-cell a');
            talentAnchors.forEach(anchor => {
              gdItem.talents.push({
                talentUrl: anchor.href,
                talentName: anchor.title,
                img: anchor.querySelector('img').src
              });
            });

            // 将结构体对象添加到数组中
            gdArray.push(gdItem);
          });
        });

        return gdArray;
      });

      //logger.info(data)
      let virtual = 0
      let gd = {
        virtual,
        data,
      };

      return gd
    } catch (error) {
      let virtual = 1
      let gd = {
        virtual,
      };
      return gd
    } finally {
      if (page) {
        await page.close().catch(err => logger.error('[ESO:战斗日志] 关闭页面失败:', err));
      }
    }    
  }

  async getRankLog (url) {
    let rankURL = url
    let BuildTable = JSON.parse(JSON.stringify(await this.getWebData(rankURL, 'rank')))

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
      let rankData = await database.updateData(BuildTable, 4)
      let img = await puppeteer.screenshot('eso', rankData)
      return img
      //return "text"
    }
  }

  async getRankData (url) {
    if (!puppeteer.browser) {
      await puppeteer.browserInit()
    }
    const page = await puppeteer.browser.newPage()
    try {
      // 设置更短的导航超时时间
      page.setDefaultNavigationTimeout(30000);
      
      try {
        // 使用 domcontentloaded 而不是 load
        await Promise.race([
          page.goto(url, { waitUntil: 'domcontentloaded' }),
          // 一旦发现目标元素就继续执行
          page.waitForSelector('#DataTables_Table_0_wrapper', { timeout: 120000 })
        ]);
      } catch (navError) {
        if (navError.message.includes('Navigating frame was detached')) {
          logger.debug('[ESO:战斗日志] 页面导航中断，继续处理');
        } else {
          throw navError;
        }
      }

      // 只等待必要的元素
      await page.waitForSelector('#DataTables_Table_0_wrapper', { timeout: 120000 });
      
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
      if (page) {
        await page.close().catch(err => logger.error('[ESO:战斗日志] 关闭页面失败:', err));
      }
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

  async cache (data, cachedata) {
    let tmp = md5(JSON.stringify(data))
    if (cachedata.md5 == tmp) return cachedata.img

    cachedata.img = await puppeteer.screenshot('eso', data)
    cachedata.md5 = tmp

    return cachedata.img
  }

  // 加载配置
  async loadConfig() {
    if (configLoaded) return
    try {
      const configFile = CONFIG_PATH
      if (fs.existsSync(configFile)) {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
        MAX_WEB_NUM = config.MAX_WEB_NUM ?? MAX_WEB_NUM
        MAX_WAIT_TIME = config.MAX_WAIT_TIME ?? MAX_WAIT_TIME
        fast_mode = config.fast_mode ?? fast_mode
      } else {
        // 如果配置文件不存在，创建默认配置
        const defaultConfig = {
          MAX_WEB_NUM,
          MAX_WAIT_TIME,
          fast_mode
        }
        // 确保目录存在
        const configDir = './plugins/eso/custome_resources/config'
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true })
        }
        // 写入默认配置
        fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 4))
        logger.info(`[ESO:战斗日志] 已创建默认配置文件: ${configFile}`)
      }
    } catch (error) {
      logger.error(`[ESO:战斗日志] 加载配置文件失败: ${error.message}`)
    }
    configLoaded = true
  }

  // 保存配置
  async saveConfig() {
    try {
      const configFile = CONFIG_PATH
      const config = {
        MAX_WEB_NUM,
        MAX_WAIT_TIME,
        fast_mode
      }
      // 确保目录存在
      const configDir = './plugins/eso/custome_resources/config'
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }
      fs.writeFileSync(configFile, JSON.stringify(config, null, 4))
    } catch (error) {
      logger.error(`[ESO:战斗日志] 保存配置文件失败: ${error.message}`)
    }
  }

  
  /**
   * 绑定账号
   * @param {*} e 消息对象
   * @returns 
   */
  async bindAccount(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    const userId = String(e.user_id);

    // 获取命令内容
    let content = e.msg.replace(/^#*绑定/, '').trim();
    
    if (!content) {
      let progressMsg = [
        { type: 'at', qq: this.e.user_id },
        { type: 'text', text: `\n请按以下任意一种格式绑定账号：\n`},
        { type: 'text', text: `1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
      ]
      return await this.reply(progressMsg, false, { recallMsg: -1 });
    }

    // 确保目录存在
    const accountDir = './plugins/eso/custome_resources/data';
    if (!fs.existsSync(accountDir)) {
      fs.mkdirSync(accountDir, { recursive: true });
    }

    // 读取现有的绑定数据
    let bindData = {};
    if (fs.existsSync(ACCOUNT_PATH)) {
      bindData = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));
    }

    // 初始化用户的绑定列表
    if (!bindData[userId]) {
      bindData[userId] = [];
    }

    // 解析输入内容
    let playerName = '';
    let accountName = '';

    if (content.startsWith('@')) {
      // 格式1: #绑定@AccountName
      accountName = content.substring(1);
    } else if (content.includes('@')) {
      // 格式2: #绑定playerName@AccountName
      [playerName, accountName] = content.split('@');
    } else {
      // 如果输入的内容既不是以@开头，也不包含@，说明格式错误
      let progressMsg = [
        { type: 'at', qq: this.e.user_id },
        { type: 'text', text: `\n绑定角色时必须提供账号名！\n`},
        { type: 'text', text: `请使用以下格式：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
      ]
      return await this.reply(progressMsg, false, { recallMsg: -1 });
    }

    // 检查是否已经绑定
    const existingBind = bindData[userId].find(bind => 
      (accountName && bind.accountName === accountName) || 
      (playerName && bind.playerName === playerName)
    );

    if (existingBind) {
      let progressMsg = [
        { type: 'at', qq: this.e.user_id },
        { type: 'text', text: `\n该角色已经绑定过了哦~`}
      ]
      return await this.reply(progressMsg, false, { recallMsg: -1 });
    }

    // 添加新的绑定
    bindData[userId].push({
      playerName,
      accountName,
      bindTime: new Date().toISOString()
    });

    // 保存数据
    fs.writeFileSync(ACCOUNT_PATH, JSON.stringify(bindData, null, 2));

    let progressMsg = [
      { type: 'at', qq: this.e.user_id },
      { type: 'text', text: `\n绑定成功！`}
    ]
    return await this.reply(progressMsg, false, { recallMsg: -1 });
  }

  /**
   * 解绑账号
   * @param {*} e 消息对象
   * @returns 
   */
  async unbindAccount(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    const userId = String(e.user_id);
    let content = e.msg.replace(/^#*(解绑|解除绑定)/, '').trim();

    if (!content) {
      let progressMsg = [
        { type: 'at', qq: this.e.user_id },
        { type: 'text', text: `\n请指定要解绑的角色名或账号名\n`},
        { type: 'text', text: `格式：\n1. #解绑@AccountName\n2. #解绑playerName@AccountName\n3. #解绑playerName`}
      ]
      return await this.reply(progressMsg, false, { recallMsg: -1 });
    }

    // 读取现有的绑定数据
    if (!fs.existsSync(ACCOUNT_PATH)) {
      let progressMsg = [
        { type: 'at', qq: this.e.user_id },
        { type: 'text', text: `\n您还没有绑定任何角色哦~\n`},
        { type: 'text', text: `请先使用 #绑定，绑定你的角色`}
      ]
      return await this.reply(progressMsg, false, { recallMsg: -1 });
    }

    let bindData = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));

    if (!bindData[userId] || bindData[userId].length === 0) {
      let progressMsg = [
        { type: 'at', qq: this.e.user_id },
        { type: 'text', text: `\n您还没有绑定任何角色哦~\n`},
        { type: 'text', text: `请先使用 #绑定，绑定你的角色`}
      ]
      return await this.reply(progressMsg, false, { recallMsg: -1 });
    }

    // 查找要解绑的角色
    const index = bindData[userId].findIndex(bind => 
      bind.playerName === content || 
      bind.accountName === content.replace('@', '') ||
      `${bind.playerName}@${bind.accountName}` === content
    );

    if (index === -1) {
      let progressMsg = [
        { type: 'at', qq: this.e.user_id },
        { type: 'text', text: `\n未找到该绑定角色\n`},
        { type: 'text', text: `可使用 #查询绑定 命令查看已绑定的角色`}
      ]
      return await this.reply(progressMsg, false, { recallMsg: -1 });
    }

    // 移除绑定
    bindData[userId].splice(index, 1);

    // 如果用户没有任何绑定了，删除该用户的键
    if (bindData[userId].length === 0) {
      delete bindData[userId];
    }

    // 保存数据
    fs.writeFileSync(ACCOUNT_PATH, JSON.stringify(bindData, null, 2));

    let progressMsg = [
      { type: 'at', qq: this.e.user_id },
      { type: 'text', text: `\n解绑成功！`}
    ]
    return await this.reply(progressMsg, false, { recallMsg: -1 });
  }

  /**
   * 查询绑定
   * @param {*} e 消息对象
   * @returns 
   */
  async queryBindings(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    const userId = String(e.user_id);

    try {
      // 读取绑定数据
      if (!fs.existsSync(ACCOUNT_PATH)) {
        return await this.reply('您还没有绑定任何角色哦~');
      }

      let bindData = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));

      if (!bindData[userId] || bindData[userId].length === 0) {
        return await this.reply('您还没有绑定任何角色哦~');
      }

      // 构建回复消息
      let reply = '您当前绑定的角色有：\n';
      bindData[userId].forEach((bind, index) => {
        reply += `${index + 1}. `;
        if (bind.playerName && bind.accountName) {
          reply += `${bind.playerName}@${bind.accountName}`;
        } else if (bind.playerName) {
          reply += bind.playerName;
        } else if (bind.accountName) {
          reply += `@${bind.accountName}`;
        }
        reply += '\n';
      });

      return await this.reply(reply.trim());

    } catch (error) {
      logger.error(`[ESO:账号查询] 查询失败: ${error.message}`);
      return await this.reply('查询失败，请稍后重试');
    }
  }

  // 修改最大并发数
  async setMaxWebNum(e) {
    if (!e.isMaster) {
      return e.reply('权限不足', true)
    }
    this.loadConfig()
    const num = parseInt(e.msg.replace(/[^0-9]/g, ''))
    if (isNaN(num) || num < 1 || num > 20) {
      return e.reply('请输入1-20之间的数字', true)
    }
    MAX_WEB_NUM = num
    this.saveConfig()
    return e.reply(`已设置最大并发数为${num}`, true)
  }

  // 修改最大等待时间
  async setMaxWaitTime(e) {
    if (!e.isMaster) {
      return e.reply('权限不足', true)
    }
    this.loadConfig()
    const time = parseInt(e.msg.replace(/[^0-9]/g, ''))
    if (isNaN(time) || time < 10000 || time > 300000) {
      return e.reply('请输入10000-300000之间的数字（单位：毫秒）', true)
    }
    MAX_WAIT_TIME = time
    this.saveConfig()
    return e.reply(`已设置最大等待时间为${time}毫秒`, true)
  }

  // 启用快速模式
  async fastPuzzle_enable(e) {
    if (!e.isMaster) {
      return e.reply('权限不足', true)
    }
    this.loadConfig()
    if(fast_mode == 1) return e.reply('本就开着啊', true)
    fast_mode = 1
    this.saveConfig()
    return e.reply('已开启快速模式', true)
  }

  // 禁用快速模式
  async fastPuzzle_disable(e) {
    if (!e.isMaster) {
      return e.reply('权限不足', true)
    }
    this.loadConfig()
    if(fast_mode == 0) return e.reply('本就关着啊', true)
    fast_mode = 0
    this.saveConfig()
    return e.reply('已关闭快速模式', true)
  }

  /**
   * 查询角色构建数据
   * @param {*} e 消息对象
   * @returns 
   */
  async queryRole(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    const userId = String(e.user_id);

    try {
      // 读取用户绑定数据
      if (!fs.existsSync(ACCOUNT_PATH)) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n您还没有绑定任何角色哦~\n`},
          { type: 'text', text: `请先使用 #绑定，绑定你的角色`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      const bindData = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));
      if (!bindData[userId] || bindData[userId].length === 0) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n您还没有绑定任何角色哦~\n`},
          { type: 'text', text: `请先使用 #绑定，绑定你的角色`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 获取所有构建数据
      let allBuilds = [];
      for (const binding of bindData[userId]) {
        if (binding.accountName) {
          const accountFileName = `${BUILD_PATH}${binding.accountName}.json`;
          if (fs.existsSync(accountFileName)) {
            const accountData = JSON.parse(fs.readFileSync(accountFileName, 'utf8'));
            // 遍历该账号下的所有角色
            for (const [playerName, playerData] of Object.entries(accountData)) {
              // 如果绑定指定了角色名，只收集匹配的角色数据
              if (!binding.playerName || binding.playerName === playerName) {
                playerData.builds.forEach((build, index) => {
                  allBuilds.push({
                    index: allBuilds.length + 1,
                    playerName,
                    accountName: binding.accountName,
                    buildData: build
                  });
                });
              }
            }
          }
        }
      }

      if (allBuilds.length === 0) {
        let progressMsg = [
            { type: 'at', qq: this.e.user_id },
            { type: 'text', text: `\n未找到任何构建记录~\n`},
            { type: 'text', text: `请先使用 #记录+esolog网址的格式，记录你的角色`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 获取命令中的序号
      const match = e.msg.match(/^#*角色(\d+)$/);
      if (match) {
        // 查询特定序号的构建
        const index = parseInt(match[1]);
        if (index < 1 || index > allBuilds.length) {
          return await this.reply(`序号范围应为1-${allBuilds.length}`);
        }

        const build = allBuilds[index - 1];
        let buildData = JSON.parse(JSON.stringify(await database.updateData(build.buildData.buildData, 3)));
        let msg = await puppeteer.screenshot('eso', buildData);
        await this.reply(msg);
      } else {
        // 输出所有构建的表格
        let reply = '您的角色构建记录如下：\n';
        reply += '序号  角色@账号  种族  职责  职业\n';
        reply += '━━━━━━━━━━━━━━━━━━━━━━\n';
        
        allBuilds.forEach(build => {
          const bd = build.buildData.buildData;
          reply += `${build.index}.  ${build.playerName}@${build.accountName}  ${bd.raceInfo?.[0]?.name_cn || '未知'}  ${bd.roleNameCN || '未知'}  ${bd.classNameCN || '未知'}\n`;
        });

        await this.reply(reply);
      }
    } catch (error) {
      logger.error(`[ESO:角色查询] 查询失败: ${error.message}`);
      return await this.reply('查询失败，请稍后重试');
    }
  }

  /**
   * 删除角色构建数据
   * @param {*} e 消息对象
   * @returns 
   */
  async deleteRole(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    const userId = String(e.user_id);

    try {
      // 读取用户绑定数据
      if (!fs.existsSync(ACCOUNT_PATH)) {
        return await this.reply('您还没有绑定任何角色哦~');
      }

      const bindData = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));
      if (!bindData[userId] || bindData[userId].length === 0) {
        return await this.reply('您还没有绑定任何角色哦~');
      }

      // 获取所有构建数据
      let allBuilds = [];
      for (const binding of bindData[userId]) {
        if (binding.accountName) {
          const accountFileName = `${BUILD_PATH}${binding.accountName}.json`;
          if (fs.existsSync(accountFileName)) {
            const accountData = JSON.parse(fs.readFileSync(accountFileName, 'utf8'));
            // 遍历该账号下的所有角色
            for (const [playerName, playerData] of Object.entries(accountData)) {
              // 如果绑定指定了角色名，只收集匹配的角色数据
              if (!binding.playerName || binding.playerName === playerName) {
                playerData.builds.forEach((build, index) => {
                  allBuilds.push({
                    index: allBuilds.length + 1,
                    playerName,
                    accountName: binding.accountName,
                    accountFileName,
                    buildIndex: index,
                    accountData
                  });
                });
              }
            }
          }
        }
      }

      if (allBuilds.length === 0) {
        return await this.reply('未找到任何构建记录~');
      }

      // 获取命令中的序号
      const match = e.msg.match(/^#*删除角色(\d+)$/);
      if (!match) {
        return await this.reply('请使用正确的格式：#删除角色序号');
      }

      const index = parseInt(match[1]);
      if (index < 1 || index > allBuilds.length) {
        return await this.reply(`序号范围应为1-${allBuilds.length}`);
      }

      const build = allBuilds[index - 1];
      
      // 从文件中删除对应的构建记录
      const accountData = build.accountData;
      accountData[build.playerName].builds.splice(build.buildIndex, 1);

      // 如果该角色没有构建记录了，删除该角色
      if (accountData[build.playerName].builds.length === 0) {
        delete accountData[build.playerName];
      }

      // 如果该账号没有任何角色了，删除该账号的文件
      if (Object.keys(accountData).length === 0) {
        fs.unlinkSync(build.accountFileName);
      } else {
        // 否则更新文件
        fs.writeFileSync(build.accountFileName, JSON.stringify(accountData, null, 2));
      }

      return await this.reply('删除成功！');

    } catch (error) {
      logger.error(`[ESO:角色删除] 删除失败: ${error.message}`);
      return await this.reply('删除失败，请稍后重试');
    }
  }
}