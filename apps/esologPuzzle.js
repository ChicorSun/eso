import plugin from '../../../lib/plugins/plugin.js'
import common from "../../../lib/common/common.js"
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import database from '../model/database.js'
import md5 from 'md5'
import fs from 'node:fs'

// 配置文件路径
const CONFIG_PATH = './plugins/eso/custome_resources/config/esologcfg.json'
const ACCOUNT_PATH = './plugins/eso/custome_resources/data/account_data.json'
const CARD_PATH = './plugins/eso/custome_resources/data/card_data.json'
const BUILD_PATH = './plugins/eso/custome_resources/data/builds/'
const RECORD_PATH = './plugins/eso/custome_resources/data/record_data.json'
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
          reg: '^#绑定.*$',
          /** 执行方法 */
          fnc: 'bindAccount'
        },
        {
          /** 命令正则匹配 */
          reg: '^#(解绑|解除绑定).*$',
          /** 执行方法 */
          fnc: 'unbindAccount'
        },
        {
          /** 命令正则匹配 */
          reg: '^#(角色|查看角色).*$',
          /** 执行方法 */
          fnc: 'queryRole'
        },
        {
          /** 命令正则匹配 */
          reg: '^#(删除角色).*$',
          /** 执行方法 */
          fnc: 'deleteRole'
        },
        {
          /** 命令正则匹配 */
          reg: '^#(编辑角色|修改角色).*$',
          /** 执行方法 */
          fnc: 'editBuild'
        },
        {
          /** 命令正则匹配 */
          reg: '^#(设置职业).*$',
          /** 执行方法 */
          fnc: 'setClass'
        },
        {
          /** 命令正则匹配 */
          reg: '^#(设置定位).*$',
          /** 执行方法 */
          fnc: 'setRole'
        },
        {
          /** 命令正则匹配 */
          reg: '^#(设置标题).*$',
          /** 执行方法 */
          fnc: 'setTitle'
        },
        {
          /** 命令正则匹配 */
          reg: '^#(添加标签).*$',
          /** 执行方法 */
          fnc: 'addTag'
        },
        {
          /** 命令正则匹配 */
          reg: '^#(查看标签).*$',
          /** 执行方法 */
          fnc: 'queryTag'
        },
        {
          /** 命令正则匹配 */
          reg: '^#(删除标签).*$',
          /** 执行方法 */
          fnc: 'deleteTag'
        },
        {
          /** 命令正则匹配 */
          reg: '^#(名片化).*$',
          /** 执行方法 */
          fnc: 'addCard'
        },
        {
          /** 命令正则匹配 */
          reg: '^#(查看名片|名片).*$',
          /** 执行方法 */
          fnc: 'queryCard'
        },
        {
          /** 命令正则匹配 */
          reg: '^#(删除名片).*$',
          /** 执行方法 */
          fnc: 'deleteCard'
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
    // 初始化时清理非法账号
    this.cleanInvalidBindings()
  }

  /**
   * #解析https://cn.esologs.com/reports/xxxxxxxxxxxxxxxxxxxxxx
   * @提供配装查询与分析
   */
  async logPuzzle (e) {
    //解析url
    let tmpComPuzzleEnable = 0
    let recordEnable = 0
    let anonymousEnable = 1
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
    if(urlText.includes("不匿名") || urlText.includes("去匿名") || urlText.includes("去除匿名")) {
      anonymousEnable = 0
    } else {
      anonymousEnable = 1
    }
    urlText = urlText.replace("不匿名", "").replace("去匿名", "").replace("去除匿名", "").replace("完整分析", "").replace("快速分析", "").replace("完整解析", "").replace("快速解析", "").replace("完整", "").replace("快速", "")

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
      else
      {
        // 先获取团队信息
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
          // 获取所有用户绑定的角色信息
          let boundMembers = new Set(); // 存储所有被绑定的成员索引
          let userBindings = new Map(); // 存储用户绑定信息 Map<userId, Array<memberIndex>>
          try {
            if (fs.existsSync(ACCOUNT_PATH)) {
              const bindData = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));
              // 遍历所有用户的绑定信息
              for (const [userId, bindings] of Object.entries(bindData)) {
                if (bindings && bindings.length > 0) {
                  userBindings.set(userId, []);
                  // 遍历团队成员
                  groupsData[recordID].memberData.forEach((oneMan, index) => {
                    // 遍历用户绑定的角色
                    for (const binding of bindings) {
                      if (binding.playerName && oneMan.playerName === binding.playerName) {
                        boundMembers.add(index);
                        userBindings.get(userId).push(index);
                        break;
                      } else if (binding.accountName) {
                        let accountName = '@' + binding.accountName;
                        if(oneMan.accountName == accountName) {
                          boundMembers.add(index);
                          userBindings.get(userId).push(index);
                          break;
                        }
                      }
                    }
                  });
                }
              }
            }
          } catch (error) {
            logger.error(`[ESO:战斗日志] 读取绑定数据失败: ${error.message}`);
          }

          if(tmpComPuzzleEnable || recordEnable)
          {
            let maxNum = groupsData[recordID].memberData.length;
            let recordResults = new Map(); // 记录处理结果 Map<memberIndex, {success: boolean, name: string}>

            // 第一步骤：处理优先成员
            let priorityMembers = new Set();
            if (sourceIndex) {
              // 单人模式
              const targetIndex = groupsData[recordID].memberData.findIndex(member => member.sourceIndex === sourceIndex);
              if (targetIndex !== -1) {
                priorityMembers.add(targetIndex);
              }
              await this.reply('正在为您分析，请稍后...(大概需要15s)', true);
            } else if (recordEnable) {
              // 记录模式
              const currentUserBindings = userBindings.get(String(e.user_id)) || [];
              if (currentUserBindings.length === 0) {
                await this.reply('未在团队中找到您绑定的角色，将继续处理其他用户绑定的角色。', true);
              } else {
                currentUserBindings.forEach(index => priorityMembers.add(index));
                await this.reply('正在记录模式解析您的信息，请稍后...', true);
              }
            } else {
              // 全队模式
              for (let i = 0; i < maxNum; i++) {
                priorityMembers.add(i);
              }
              await this.reply('正在完整解析全队信息，请稍后...(可能需要120s)', true);
            }

            // 第一阶段：并发处理优先成员
            if (priorityMembers.size > 0) {
              const priorityResults = await Promise.all(Array.from(priorityMembers).map(async (index) => {
                const oneMan = groupsData[recordID].memberData[index];
                const shouldRecord = boundMembers.has(index);
                const { BD, recordStatus } = await this.getOneManLog(reportsID, fightIndex, oneMan.sourceIndex, false, shouldRecord);
                
                if (!BD.virtual) {
                  if (anonymousEnable) {
                    BD.playerName = 'Anonymous ' + oneMan.sourceIndex
                    BD.accountName = BD.accountName.startsWith('@') ? 
                      '@' + BD.accountName.charAt(1) + 'xxxxx' + BD.accountName.charAt(BD.accountName.length - 1) :
                      BD.accountName
                  }
                  let buildData = JSON.parse(JSON.stringify(await database.updateData(BD, 3)));
                  recordResults.set(index, {
                    success: recordStatus,
                    name: `${BD.playerName}@${BD.accountName.substring(1)}`
                  });
                  return {
                    index,
                    isError: false,
                    data: buildData
                  };
                } else {
                  return {
                    index,
                    isError: true,
                    data: `抱歉，不支持解析该目标\n请发送包含装备以及技能信息的esologs地址`
                  };
                }
              }));

              // 第二阶段：发送截图
              if (sourceIndex || recordEnable) {
                // 单人模式和记录模式：直接发送每个截图
                for (const result of priorityResults) {
                  if (!result.isError) {
                    let msg = await puppeteer.screenshot('eso', result.data);
                    await this.reply(msg);
                  } else {
                    await this.reply(result.data);
                  }
                }
              } else {
                // 全队模式：使用合并转发
                await this.reply('所有数据获取完成，正在生成图片...', true);
                const fakeMsg = [];
                for (const result of priorityResults) {
                  let msg;
                  if (result.isError) {
                    msg = result.data;
                  } else {
                    msg = await puppeteer.screenshot('eso', result.data);
                  }
                  fakeMsg.push(msg);
                }
                await e.reply(await common.makeForwardMsg(e, fakeMsg, '团队LOG', true));
              }
            }

            // 第二步骤：处理剩余的绑定成员
            const remainingMembers = new Set(boundMembers);
            priorityMembers.forEach(index => remainingMembers.delete(index));

            if (remainingMembers.size > 0) {
              await this.reply('正在处理其他用户绑定的角色...', true);
              const remainingResults = await Promise.all(Array.from(remainingMembers).map(async (index) => {
                const oneMan = groupsData[recordID].memberData[index];
                const { BD, recordStatus } = await this.getOneManLog(reportsID, fightIndex, oneMan.sourceIndex, false, true);
                
                if (!BD.virtual) {
                  if (anonymousEnable) {
                    BD.playerName = 'Anonymous ' + oneMan.sourceIndex
                    BD.accountName = BD.accountName.startsWith('@') ? 
                      '@' + BD.accountName.charAt(1) + 'xxxxx' + BD.accountName.charAt(BD.accountName.length - 1) :
                      BD.accountName
                  }
                  recordResults.set(index, {
                    success: recordStatus,
                    name: `${BD.playerName}@${BD.accountName.substring(1)}`
                  });
                }
              }));
            }

            // 第三步骤：报告记录结果
            if (recordResults.size > 0) {
              const successRecords = [];
              const failedRecords = [];
              const existingRecords = [];
              const skippedRecords = [];  // 新增：无需记录的成员

              recordResults.forEach(result => {
                if (result.success === 1) {  // 成功记录
                  successRecords.push(result.name);
                } else if (result.success === 2) {  // 已有记录
                  existingRecords.push(result.name);
                } else if (result.success === -1) {  // 无需记录
                  skippedRecords.push(result.name);
                } else if (result.success === 0) {  // 记录失败
                  failedRecords.push(result.name);
                }
              });

              let reportMsg = [`\n本次战斗记录结果：`];
              if (successRecords.length > 0) {
                reportMsg.push(`\n成功记录：\n${successRecords.join('\n')}`);
              }
              if (existingRecords.length > 0) {
                reportMsg.push(`\n跳过早已存在的记录：\n${existingRecords.join('\n')}`);
              }
              if (failedRecords.length > 0) {
                reportMsg.push(`\n记录失败：\n${failedRecords.join('\n')}`);
              }
              if (skippedRecords.length > 0 && recordEnable) {
                reportMsg.push(`\n未绑定的角色（跳过记录）：\n${skippedRecords.join('\n')}`);
              }

              if (successRecords.length > 0 || existingRecords.length > 0 || failedRecords.length > 0 || (skippedRecords.length > 0 && recordEnable)) {
                await this.reply([
                  { type: 'at', qq: e.user_id },
                  { type: 'text', text: reportMsg.join('') }
                ], false, { recallMsg: -1 });
              }
            }
          } else {
            await this.reply('正在快速解析全队信息，请稍后...(快速解析只会展示简略信息)', true)
          }
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

  async getOneManLog (reportsID, fightIndex, sourceIndex, delete_record, shouldRecord = false) {
    // 首先检查是否已经存在记录
    let existingBD = null;
    let need_group_data = true;
    let recordID = -1;
    let index = 0;
    
    try {
      // 先获取团队信息以确定账号和角色名
      for (let groupData of groupsData) {
        if((groupData.reportsID == reportsID) && (groupData.fightIndex == fightIndex)) {
          recordID = index;
          break;
        }
        index++;
      }

      if(recordID == -1) {
        recordID = await this.getGroupLog(reportsID, fightIndex);
      }

      if(recordID != -1) {
        let targetMember = null;
        for (let oneMan of groupsData[recordID].memberData) {
          if(sourceIndex == oneMan.sourceIndex) {
            targetMember = oneMan;
            break;
          }
        }

        if(targetMember && targetMember.accountName) {
          const accountFileName = `${BUILD_PATH}${targetMember.accountName.replace('@', '')}.json`;
          if (fs.existsSync(accountFileName)) {
            const accountData = JSON.parse(fs.readFileSync(accountFileName, 'utf8'));
            if (accountData[targetMember.playerName]) {
              const existingRecord = accountData[targetMember.playerName].builds.find(build => 
                build.reportsID === reportsID &&
                build.fightIndex === fightIndex &&
                build.sourceIndex === sourceIndex
              );
              if (existingRecord) {
                logger.info(`[ESO:战斗日志] 发现已有记录: ${targetMember.accountName}/${targetMember.playerName}`);
                existingBD = existingRecord.buildData;
                return { 
                  BD: existingBD, 
                  recordStatus: shouldRecord ? 2 : -1 
                };
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error(`[ESO:战斗日志] 检查已有记录失败: ${error.message}`);
    }

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
      BD.stoneInfo = buffsData.stoneInfo
      BD.foodInfo = buffsData.foodInfo
      BD.raceInfo = buffsData.raceInfo 
      BD.skillLineInfo = buffsData.skillLineInfo 
    }

    if(BD.virtual)
    {
      logger.info('尝试解析失败' + BD.playerName + BD.accountName)
      if (shouldRecord) {
        return { BD, recordStatus: 0 }
      }
      else
      {
        return { BD, recordStatus: -1 }
      }
    }
    else
    {
      let has_find = false;
      index = 0;  // 重置index
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

      // 如果需要记录数据
      let recordStatus = -1;
      if (shouldRecord) {
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
          recordStatus = 1;
        } catch (error) {
          logger.error(`[ESO:战斗日志] 保存构建数据失败: ${error.message}`);
          recordStatus = 0;
        }
      }

      return { BD, recordStatus }
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
      return await this.reply('请按以下任意一种格式绑定账号：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName');
    }

    try {
      // 解析输入内容
      let playerName = '';
      let accountName = '';

      if (content.startsWith('@')) {
        // 格式1: #绑定@AccountName
        accountName = content.substring(1);
      } else if (content.includes('@')) {
        // 格式2: #绑定playerName@AccountName
        [playerName, accountName] = content.split('@');
        // 验证playerName
        const playerValidation = this.validatePlayerName(playerName);
        if (!playerValidation.isValid) {
          // 记录具体原因但不展示给用户
          logger.info(`[ESO:账号绑定] 角色名称验证失败: ${playerName}, 原因: ${playerValidation.reason}`);
          let progressMsg = [
            { type: 'at', qq: this.e.user_id },
            { type: 'text', text: `\n请绑定你自己的角色名！`}
          ]
          return await this.reply(progressMsg, false, { recallMsg: -1 });
        }
      } else {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n绑定角色时必须提供账号名！\n`},
          { type: 'text', text: `请使用以下格式：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 验证AccountName
      const validation = this.validateAccountName(accountName);
      if (!validation.isValid) {
        // 记录具体原因但不展示给用户
        logger.info(`[ESO:账号绑定] 账号名称验证失败: ${accountName}, 原因: ${validation.reason}`);
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n请绑定你自己的用户名！`}
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

      // 检查是否已经存在完全相同的绑定（相同的playerName和accountName组合）
      const existingBind = bindData[userId].find(bind => 
        bind.accountName === accountName && 
        bind.playerName === playerName
      );

      if (existingBind) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n该角色已经绑定过了哦~`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 检查用户绑定的不同AccountName数量
      const boundAccountNames = new Set(bindData[userId].map(bind => bind.accountName));
      if (boundAccountNames.size >= 3 && !boundAccountNames.has(accountName)) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n每个用户最多只能绑定3个不同的账号名称哦~\n使用 #解绑 来解绑账号`}
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

    } catch (error) {
      logger.error(`[ESO:账号绑定] 保存绑定数据失败: ${error.message}`);
      let progressMsg = [
        { type: 'at', qq: this.e.user_id },
        { type: 'text', text: `\n绑定失败，请稍后重试`}
      ]
      return await this.reply(progressMsg, false, { recallMsg: -1 });
    }
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
      return await this.reply('请指定要解绑的角色名或账号名');
    }

    try {
      // 读取现有的绑定数据
      if (!fs.existsSync(ACCOUNT_PATH)) {
        return await this.reply('您还没有绑定任何角色哦~');
      }

      let bindData = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));

      if (!bindData[userId] || bindData[userId].length === 0) {
        return await this.reply('您还没有绑定任何角色哦~');
      }

      // 查找要解绑的角色
      const index = bindData[userId].findIndex(bind => 
        bind.playerName === content || 
        bind.accountName === content.replace('@', '') ||
        `${bind.playerName}@${bind.accountName}` === content
      );

      if (index === -1) {
        return await this.reply('未找到该绑定角色');
      }

      // 移除绑定
      bindData[userId].splice(index, 1);

      // 如果用户没有任何绑定了，删除该用户的键
      if (bindData[userId].length === 0) {
        delete bindData[userId];
      }

      // 保存数据
      fs.writeFileSync(ACCOUNT_PATH, JSON.stringify(bindData, null, 2));

      return await this.reply('解绑成功！');

    } catch (error) {
      logger.error(`[ESO:账号解绑] 解绑失败: ${error.message}`);
      return await this.reply('解绑失败，请稍后重试');
    }
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
        // 获取用户的名片数据
        let cardData = {};
        if (fs.existsSync(CARD_PATH)) {
          cardData = JSON.parse(fs.readFileSync(CARD_PATH, 'utf8'));
        }

        // 输出所有构建的表格
        let reply = '您的角色构建记录如下：\n';
        reply += '序号  角色@账号  种族  职责  职业\n';
        reply += '━━━━━━━━━━━━━━━━━━━━━━\n';
        
        allBuilds.forEach(build => {
          const bd = build.buildData.buildData;
          
          // 检查是否为名片
          let isCard = false;
          if (cardData[userId] && cardData[userId].cards_info) {
            isCard = cardData[userId].cards_info.some(card => 
              card.accountName === build.accountName &&
              card.playerName === build.playerName &&
              card.reportsID === build.buildData.reportsID &&
              card.fightIndex === build.buildData.fightIndex &&
              card.sourceIndex === build.buildData.sourceIndex
            );
          }
          
          reply += `${isCard ? '[√]' : '[×]'}${build.index}.  ${build.playerName}@${build.accountName}  ${bd.raceInfo?.[0]?.name_cn || '未知'}  ${bd.roleNameCN || '未知'}  ${bd.classNameCN || '未知'}\n`;
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

      // 检查是否被设置为名片
      let cardIndex = -1;
      if (fs.existsSync(CARD_PATH)) {
        const cardData = JSON.parse(fs.readFileSync(CARD_PATH, 'utf8'));
        if (cardData[userId] && cardData[userId].cards_info) {
          cardIndex = cardData[userId].cards_info.findIndex(card => 
            card.accountName === build.accountName &&
            card.playerName === build.playerName &&
            card.reportsID === build.accountData[build.playerName].builds[build.buildIndex].reportsID &&
            card.fightIndex === build.accountData[build.playerName].builds[build.buildIndex].fightIndex &&
            card.sourceIndex === build.accountData[build.playerName].builds[build.buildIndex].sourceIndex
          );
          
          if (cardIndex != -1) {
            return await this.reply(`角色${index} 已被 名片${cardData[userId].cards_info[cardIndex].index} 绑定，请先使用 #删除名片${cardData[userId].cards_info[cardIndex].index}`);
          }
        }
      }
      
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

  async editBuild(e) {
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

      // 获取该用户绑定的所有账号和角色的组合
      const userBindings = bindData[userId];
      
      // 获取所有构建数据
      let allBuilds = [];
      for (const binding of userBindings) {
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
        return await this.reply('未找到任何构建记录~');
      }

      // 获取命令中的序号
      const match = e.msg.match(/^#*(编辑角色|修改角色)(\d+)$/);
      if (!match) {
        return await this.reply('请使用正确的格式：#编辑角色序号');
      }

      const index = parseInt(match[2]);
      if (index < 1 || index > allBuilds.length) {
        return await this.reply(`序号范围应为1-${allBuilds.length}`);
      }

      // 获取选中的构建数据
      const selectedBuild = allBuilds[index - 1];
      const buildData = selectedBuild.buildData;

      // 读取或创建名片数据文件
      let cardData = {};
      if (fs.existsSync(CARD_PATH)) {
        cardData = JSON.parse(fs.readFileSync(CARD_PATH, 'utf8'));
      }

      // 初始化用户的名片数据结构
      if (!cardData[userId]) {
        cardData[userId] = {
          edit_index: {},
          cards_info: []
        };
      }

      // 更新edit_index数据
      cardData[userId].edit_index = {
        accountName: selectedBuild.accountName,
        playerName: selectedBuild.playerName,
        reportsID: buildData.reportsID,
        fightIndex: buildData.fightIndex,
        sourceIndex: buildData.sourceIndex
      };

      // 保存名片数据
      fs.writeFileSync(CARD_PATH, JSON.stringify(cardData, null, 2));

      return await this.reply('编辑标记设置成功！');

    } catch (error) {
      logger.error(`[ESO:角色编辑] 编辑失败: ${error.message}`);
      return await this.reply('编辑失败，请稍后重试');
    }
  }

  async setRole(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    const userId = String(e.user_id);

    try {
      // 1. 检查用户是否绑定角色
      if (!fs.existsSync(ACCOUNT_PATH)) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n您尚未绑定角色！\n`},
          { type: 'text', text: `请使用以下格式：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      const bindData = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));
      if (!bindData[userId] || bindData[userId].length === 0) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n您尚未绑定角色！\n`},
          { type: 'text', text: `请使用以下格式：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 2. 获取用户绑定的所有构建数据
      const userBindings = bindData[userId];
      let allBuilds = [];
      
      for (const binding of userBindings) {
        if (binding.accountName) {
          const accountFileName = `${BUILD_PATH}${binding.accountName}.json`;
          if (fs.existsSync(accountFileName)) {
            const accountData = JSON.parse(fs.readFileSync(accountFileName, 'utf8'));
            
            // 遍历该账号下的所有角色
            for (const [playerName, playerData] of Object.entries(accountData)) {
              // 如果绑定指定了角色名，只收集匹配的角色数据
              if (!binding.playerName || binding.playerName === playerName) {
                playerData.builds.forEach(build => {
                  allBuilds.push({
                    playerName,
                    accountName: binding.accountName,
                    accountFileName,
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
          { type: 'text', text: `\n您尚未记录战斗！\n`},
          { type: 'text', text: `请发送包含您战斗的esolog网址，网址内必须包含fight的字样`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 3. 从CARD_PATH获取edit_index
      if (!fs.existsSync(CARD_PATH)) {
        return await this.reply('请先使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      const cardData = JSON.parse(fs.readFileSync(CARD_PATH, 'utf8'));
      if (!cardData[userId] || !cardData[userId].edit_index) {
        return await this.reply('请先使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      const editIndex = cardData[userId].edit_index;

      // 4. 找到匹配的构建
      const targetBuild = allBuilds.find(build => 
        build.buildData.reportsID === editIndex.reportsID &&
        build.buildData.fightIndex === editIndex.fightIndex &&
        build.buildData.sourceIndex === editIndex.sourceIndex
      );

      if (!targetBuild) {
        return await this.reply('未找到对应的构建数据，请使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      // 5. 解析定位设置命令
      const roleName = e.msg.replace(/^#设置定位/, '').trim();
      let newRoleName = '';
      let newRoleNameCN = '';

      // 根据输入设置对应的定位名称
      if (roleName === '耐系' || roleName === '耐力输出') {
        newRoleName = 'StaminaDPS';
        newRoleNameCN = '耐系';
      } else if (roleName === '法系' || roleName === '魔法输出') {
        newRoleName = 'MagickaDPS';
        newRoleNameCN = '法系';
      } else if (roleName === '奶妈' || roleName === '治疗' || roleName === '治疗者') {
        newRoleName = 'Healer';
        newRoleNameCN = '奶妈';
      } else if (roleName === '坦克' || roleName === '坦克手') {
        newRoleName = 'Tank';
        newRoleNameCN = '坦克';
      } else {
        return await this.reply('无效的定位名称，可选值：耐系、法系、奶妈、坦克');
      }

      // 6. 更新构建数据
      targetBuild.buildData.buildData.roleName = newRoleName;
      targetBuild.buildData.buildData.roleNameCN = newRoleNameCN;

      // 7. 保存更新后的数据
      const accountData = JSON.parse(fs.readFileSync(targetBuild.accountFileName, 'utf8'));
      const playerBuilds = accountData[targetBuild.playerName].builds;
      
      // 找到并更新对应的构建
      const buildIndex = playerBuilds.findIndex(build => 
        build.reportsID === editIndex.reportsID &&
        build.fightIndex === editIndex.fightIndex &&
        build.sourceIndex === editIndex.sourceIndex
      );

      if (buildIndex !== -1) {
        // 找到当前编辑的角色在allBuilds中的索引
        const roleIndex = allBuilds.findIndex(build => 
          build.buildData.reportsID === editIndex.reportsID &&
          build.buildData.fightIndex === editIndex.fightIndex &&
          build.buildData.sourceIndex === editIndex.sourceIndex
        ) + 1;
        playerBuilds[buildIndex] = targetBuild.buildData;
        fs.writeFileSync(targetBuild.accountFileName, JSON.stringify(accountData, null, 2));
        return await this.reply(`角色${roleIndex}的定位设置成功！`);
      } else {
        return await this.reply('保存失败，未找到对应的构建数据');
      }

    } catch (error) {
      logger.error(`[ESO:定位设置] 设置失败: ${error.message}`);
      return await this.reply('设置失败，请稍后重试');
    }
  }

  async setClass(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    const userId = String(e.user_id);

    try {
      // 1. 检查用户是否绑定角色
      if (!fs.existsSync(ACCOUNT_PATH)) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n您尚未绑定角色！\n`},
          { type: 'text', text: `请使用以下格式：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      const bindData = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));
      if (!bindData[userId] || bindData[userId].length === 0) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n您尚未绑定角色！\n`},
          { type: 'text', text: `请使用以下格式：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 2. 获取用户绑定的所有构建数据
      const userBindings = bindData[userId];
      let allBuilds = [];
      
      for (const binding of userBindings) {
        if (binding.accountName) {
          const accountFileName = `${BUILD_PATH}${binding.accountName}.json`;
          if (fs.existsSync(accountFileName)) {
            const accountData = JSON.parse(fs.readFileSync(accountFileName, 'utf8'));
            
            // 遍历该账号下的所有角色
            for (const [playerName, playerData] of Object.entries(accountData)) {
              // 如果绑定指定了角色名，只收集匹配的角色数据
              if (!binding.playerName || binding.playerName === playerName) {
                playerData.builds.forEach(build => {
                  allBuilds.push({
                    playerName,
                    accountName: binding.accountName,
                    accountFileName,
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
          { type: 'text', text: `\n您尚未记录战斗！\n`},
          { type: 'text', text: `请发送包含您战斗的esolog网址，网址内必须包含fight的字样`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 3. 从CARD_PATH获取edit_index
      if (!fs.existsSync(CARD_PATH)) {
        return await this.reply('请先使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      const cardData = JSON.parse(fs.readFileSync(CARD_PATH, 'utf8'));
      if (!cardData[userId] || !cardData[userId].edit_index) {
        return await this.reply('请先使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      const editIndex = cardData[userId].edit_index;

      // 4. 找到匹配的构建
      const targetBuild = allBuilds.find(build => 
        build.buildData.reportsID === editIndex.reportsID &&
        build.buildData.fightIndex === editIndex.fightIndex &&
        build.buildData.sourceIndex === editIndex.sourceIndex
      );

      if (!targetBuild) {
        return await this.reply('未找到对应的构建数据，请使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      // 5. 解析职业设置命令
      const className = e.msg.replace(/^#设置职业/, '').trim();
      let newClassName = '';
      let newClassNameCN = '';

      // 根据输入设置对应的职业名称
      if (className === '奥术' || className === '奥术师') {
        newClassName = 'Arcanist';
        newClassNameCN = '奥术';
      } else if (className === '龙骑' || className === '龙骑士') {
        newClassName = 'Dragonknight';
        newClassNameCN = '龙骑';
      } else if (className === '死灵' || className === '死灵法师') {
        newClassName = 'Necromancer';
        newClassNameCN = '死灵';
      } else if (className === '夜刃' || className === '夜刃刺客') {
        newClassName = 'Nightblade';
        newClassNameCN = '夜刃';
      } else if (className === '巫师' || className === '术士' || className === '巫术师' || className === '法法' || className === '法师') {
        newClassName = 'Sorcerer';
        newClassNameCN = '巫师';
      } else if (className === '圣骑' || className === '圣骑士' || className === '圣殿' || className === '圣殿骑士') {
        newClassName = 'Templar';
        newClassNameCN = '圣骑';
      } else if (className === '窝登' || className === '守望' || className === '守望者') {
        newClassName = 'Warden';
        newClassNameCN = '窝登';
      } else {
        return await this.reply('无效的职业名称，可选值：奥术、龙骑、死灵、夜刃、巫师、圣骑、窝登');
      }

      // 6. 更新构建数据
      targetBuild.buildData.buildData.className = newClassName;
      targetBuild.buildData.buildData.classNameCN = newClassNameCN;

      // 7. 保存更新后的数据
      const accountData = JSON.parse(fs.readFileSync(targetBuild.accountFileName, 'utf8'));
      const playerBuilds = accountData[targetBuild.playerName].builds;
      
      // 找到并更新对应的构建
      const buildIndex = playerBuilds.findIndex(build => 
        build.reportsID === editIndex.reportsID &&
        build.fightIndex === editIndex.fightIndex &&
        build.sourceIndex === editIndex.sourceIndex
      );

      if (buildIndex !== -1) {
        // 找到当前编辑的角色在allBuilds中的索引
        const roleIndex = allBuilds.findIndex(build => 
          build.buildData.reportsID === editIndex.reportsID &&
          build.buildData.fightIndex === editIndex.fightIndex &&
          build.buildData.sourceIndex === editIndex.sourceIndex
        ) + 1;
        playerBuilds[buildIndex] = targetBuild.buildData;
        fs.writeFileSync(targetBuild.accountFileName, JSON.stringify(accountData, null, 2));
        return await this.reply(`角色${roleIndex}的职业设置成功！`);
      } else {
        return await this.reply('保存失败，未找到对应的构建数据');
      }

    } catch (error) {
      logger.error(`[ESO:职业设置] 设置失败: ${error.message}`);
      return await this.reply('设置失败，请稍后重试');
    }
  }

  async setTitle(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    const userId = String(e.user_id);

    try {
      // 1. 检查用户是否绑定角色
      if (!fs.existsSync(ACCOUNT_PATH)) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n您尚未绑定角色！\n`},
          { type: 'text', text: `请使用以下格式：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      const bindData = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));
      if (!bindData[userId] || bindData[userId].length === 0) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n您尚未绑定角色！\n`},
          { type: 'text', text: `请使用以下格式：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 2. 获取用户绑定的所有构建数据
      const userBindings = bindData[userId];
      let allBuilds = [];
      
      for (const binding of userBindings) {
        if (binding.accountName) {
          const accountFileName = `${BUILD_PATH}${binding.accountName}.json`;
          if (fs.existsSync(accountFileName)) {
            const accountData = JSON.parse(fs.readFileSync(accountFileName, 'utf8'));
            
            // 遍历该账号下的所有角色
            for (const [playerName, playerData] of Object.entries(accountData)) {
              // 如果绑定指定了角色名，只收集匹配的角色数据
              if (!binding.playerName || binding.playerName === playerName) {
                playerData.builds.forEach(build => {
                  allBuilds.push({
                    playerName,
                    accountName: binding.accountName,
                    accountFileName,
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
          { type: 'text', text: `\n您尚未记录战斗！\n`},
          { type: 'text', text: `请发送包含您战斗的esolog网址，网址内必须包含fight的字样`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 3. 从CARD_PATH获取edit_index
      if (!fs.existsSync(CARD_PATH)) {
        return await this.reply('请先使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      const cardData = JSON.parse(fs.readFileSync(CARD_PATH, 'utf8'));
      if (!cardData[userId] || !cardData[userId].edit_index) {
        return await this.reply('请先使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      const editIndex = cardData[userId].edit_index;

      // 4. 找到匹配的构建
      const targetBuild = allBuilds.find(build => 
        build.buildData.reportsID === editIndex.reportsID &&
        build.buildData.fightIndex === editIndex.fightIndex &&
        build.buildData.sourceIndex === editIndex.sourceIndex
      );

      if (!targetBuild) {
        return await this.reply('未找到对应的构建数据，请使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      // 5. 解析标题设置命令
      const title = e.msg.replace(/^#设置标题\s*/, '').trim();
      
      // 如果标题为空
      if (!title) {
        return await this.reply('请输入要设置的标题');
      }
      
      // 检查标题长度
      if (title.length > 25) {
        return await this.reply('标题长度不能超过25个字符，请重新设置');
      }

      // 6. 更新构建数据
      if (!targetBuild.buildData.buildData) {
        targetBuild.buildData.buildData = {};
      }
      targetBuild.buildData.buildData.title = title;

      // 7. 保存更新后的数据
      const accountData = JSON.parse(fs.readFileSync(targetBuild.accountFileName, 'utf8'));
      const playerBuilds = accountData[targetBuild.playerName].builds;
      
      // 找到并更新对应的构建
      const buildIndex = playerBuilds.findIndex(build => 
        build.reportsID === editIndex.reportsID &&
        build.fightIndex === editIndex.fightIndex &&
        build.sourceIndex === editIndex.sourceIndex
      );

      if (buildIndex !== -1) {
        // 找到当前编辑的角色在allBuilds中的索引
        const roleIndex = allBuilds.findIndex(build => 
          build.buildData.reportsID === editIndex.reportsID &&
          build.buildData.fightIndex === editIndex.fightIndex &&
          build.buildData.sourceIndex === editIndex.sourceIndex
        ) + 1;
        playerBuilds[buildIndex] = targetBuild.buildData;
        fs.writeFileSync(targetBuild.accountFileName, JSON.stringify(accountData, null, 2));
        return await this.reply(`角色${roleIndex}的标题设置成功！`);
      } else {
        return await this.reply('保存失败，未找到对应的构建数据');
      }

    } catch (error) {
      logger.error(`[ESO:标题设置] 设置失败: ${error.message}`);
      return await this.reply('设置失败，请稍后重试');
    }
  }

  // 验证AccountName是否合法
  validateAccountName(accountName) {
    try {
      // 移除可能的@前缀
      accountName = accountName.replace(/^@/, '');

      // 1. 长度检查(3-20字符)
      if (accountName.length < 3 || accountName.length > 20) {
        return {
          isValid: false,
          reason: '账号名称长度必须在3-20个字符之间'
        };
      }

      // 2. 必须以字母开头
      if (!/^[a-zA-Z]/.test(accountName)) {
        return {
          isValid: false,
          reason: '账号名称必须以字母开头'
        };
      }

      // 3. 检查是否包含空格
      if (/\s/.test(accountName)) {
        return {
          isValid: false,
          reason: '账号名称不能包含空格'
        };
      }

      // 4. 检查是否以符号开头或结尾
      if (/^[._'-]|[._'-]$/.test(accountName)) {
        return {
          isValid: false,
          reason: '账号名称不能以符号开头或结尾'
        };
      }

      // 5. 检查是否只包含允许的字符（字母、数字和单个的点、连字符、撇号、下划线）
      if (!/^[a-zA-Z0-9._'-]+$/.test(accountName)) {
        return {
          isValid: false,
          reason: '账号名称只能包含字母、数字和单个的点、连字符、撇号、下划线'
        };
      }

      // 6. 检查字符重复次数（不超过3次连续）
      // 对于字母，忽略大小写进行检查
      for (let i = 0; i < accountName.length - 3; i++) {
        const current = accountName[i];
        const next1 = accountName[i + 1];
        const next2 = accountName[i + 2];
        const next3 = accountName[i + 3];

        // 如果是字母，忽略大小写比较
        if (/[a-zA-Z]/.test(current)) {
          if (current.toLowerCase() === next1.toLowerCase() && 
              current.toLowerCase() === next2.toLowerCase() && 
              current.toLowerCase() === next3.toLowerCase()) {
            return {
              isValid: false,
              reason: '账号名称中每个字母（忽略大小写）不能连续重复超过3次'
            };
          }
        }
        // 如果是数字或其他字符，直接比较
        else if (current === next1 && current === next2 && current === next3) {
          return {
            isValid: false,
            reason: '账号名称中每个字符不能连续重复超过3次'
          };
        }
      }

      // 7. 检查特殊字符是否只出现一次（点、连字符、撇号、下划线）
      const periods = (accountName.match(/\./g) || []).length;
      const hyphens = (accountName.match(/-/g) || []).length;
      const apostrophes = (accountName.match(/'/g) || []).length;
      const underscores = (accountName.match(/_/g) || []).length;

      if (periods > 1 || hyphens > 1 || apostrophes > 1 || underscores > 1) {
        return {
          isValid: false,
          reason: '账号名称中的点、连字符、撇号和下划线只能出现一次'
        };
      }

      return {
        isValid: true,
        reason: ''
      };
    } catch (error) {
      return {
        isValid: false,
        reason: '账号名称验证过程出错'
      };
    }
  }

  // 验证PlayerName是否合法
  validatePlayerName(playerName) {
    try {
      // 如果playerName为空，表示用户只绑定AccountName，这是允许的
      if (!playerName) {
        return {
          isValid: true,
          reason: ''
        };
      }

      // 1. 检查长度（3-25个字符）
      if (playerName.length < 3 || playerName.length > 25) {
        return {
          isValid: false,
          reason: '角色名称长度必须在3-25个字符之间'
        };
      }

      // 2. 检查是否以空格开头
      if (playerName.startsWith(' ')) {
        return {
          isValid: false,
          reason: '角色名称不能以空格开头'
        };
      }

      // 3. 检查是否以字母结尾
      if (!/[a-zA-Z]$/.test(playerName)) {
        return {
          isValid: false,
          reason: '角色名称必须以字母结尾'
        };
      }

      // 4. 检查连续字母（忽略大小写）
      const lowerName = playerName.toLowerCase();
      for (let i = 0; i < lowerName.length - 2; i++) {
        if (lowerName[i] === lowerName[i + 1] && lowerName[i] === lowerName[i + 2] && /[a-z]/.test(lowerName[i])) {
          return {
            isValid: false,
            reason: '角色名称中同一字母（忽略大小写）不能连续出现超过两个'
          };
        }
      }

      // 5. 检查是否包含数字
      if (/\d/.test(playerName)) {
        return {
          isValid: false,
          reason: '角色名称不能包含数字'
        };
      }

      // 6. 检查相邻的标点符号
      if (/['-\s]{2}/.test(playerName)) {
        return {
          isValid: false,
          reason: '角色名称不能包含相邻的标点符号'
        };
      }

      // 7. 检查连字符、撇号和空格的总数
      const specialChars = (playerName.match(/[-'\s]/g) || []).length;
      if (specialChars > 4) {
        return {
          isValid: false,
          reason: '角色名称最多可以包含四个连字符、撇号或空格'
        };
      }

      // 8. 检查无效字符（只允许字母、连字符、撇号和空格）
      if (!/^[a-zA-Z'-\s]+$/.test(playerName)) {
        return {
          isValid: false,
          reason: '角色名称包含无效字符'
        };
      }

      // 9. 检查是否包含汉字
      if (/[\u4e00-\u9fa5]/.test(playerName)) {
        return {
          isValid: false,
          reason: '角色名称不能包含汉字'
        };
      }

      // 10. 检查大写字母的位置
      const words = playerName.split(/[-'\s]/);
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (word.length === 0) continue;
        
        // 检查每个单词
        // 第一个单词可以首字母大写
        if (i === 0) {
          // 除了首字母外的其他字母必须小写
          if (!/^[A-Z]?[a-z]*$/.test(word)) {
            return {
              isValid: false,
              reason: '角色名称只有开头的字母以及符号后面那一个字母允许大写'
            };
          }
        } else {
          // 其他单词可以首字母大写，但其余必须小写
          if (!/^[A-Z]?[a-z]*$/.test(word)) {
            return {
              isValid: false,
              reason: '角色名称只有开头的字母以及符号后面那一个字母允许大写'
            };
          }
        }
      }

      return {
        isValid: true,
        reason: ''
      };
    } catch (error) {
      return {
        isValid: false,
        reason: '角色名称验证过程出错'
      };
    }
  }

  // 清理非法的AccountName绑定
  async cleanInvalidBindings() {
    try {
      if (!fs.existsSync(ACCOUNT_PATH)) {
        return;
      }

      let bindData = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));
      let hasChanges = false;

      // 遍历所有用户的绑定
      for (const [userId, bindings] of Object.entries(bindData)) {
        if (!Array.isArray(bindings)) continue;

        // 过滤出合法的绑定
        let validBindings = bindings.filter(binding => {
          // 验证AccountName
          const accountValidation = this.validateAccountName(binding.accountName);
          // 验证PlayerName
          const playerValidation = this.validatePlayerName(binding.playerName);
          
          if (!accountValidation.isValid || !playerValidation.isValid) {
            hasChanges = true;
            logger.info(`[ESO:账号清理] 删除非法绑定: ${binding.playerName}@${binding.accountName}`);
            return false;
          }
          return true;
        });

        // 检查不同AccountName的数量限制
        if (validBindings.length > 0) {
          // 按bindTime排序，保留最早绑定的账号
          validBindings.sort((a, b) => new Date(a.bindTime) - new Date(b.bindTime));
          
          // 获取不同的AccountName
          const uniqueAccounts = new Map();
          const finalBindings = [];
          
          for (const binding of validBindings) {
            if (uniqueAccounts.size < 3 || uniqueAccounts.has(binding.accountName)) {
              finalBindings.push(binding);
              if (!uniqueAccounts.has(binding.accountName)) {
                uniqueAccounts.set(binding.accountName, true);
              }
            } else {
              hasChanges = true;
              logger.info(`[ESO:账号清理] 删除超出限制的账号绑定: ${binding.playerName}@${binding.accountName}`);
            }
          }
          
          validBindings = finalBindings;
        }

        if (validBindings.length === 0) {
          delete bindData[userId];
          hasChanges = true;
        } else {
          bindData[userId] = validBindings;
        }
      }

      if (hasChanges) {
        fs.writeFileSync(ACCOUNT_PATH, JSON.stringify(bindData, null, 2));
        logger.info('[ESO:账号清理] 已完成非法账号清理');
      }
    } catch (error) {
      logger.error(`[ESO:账号清理] 清理失败: ${error.message}`);
    }
  }

  async addTag(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    const userId = String(e.user_id);

    try {
      // 1. 检查用户是否绑定角色
      if (!fs.existsSync(ACCOUNT_PATH)) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n您尚未绑定角色！\n`},
          { type: 'text', text: `请使用以下格式：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      const bindData = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));
      if (!bindData[userId] || bindData[userId].length === 0) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n您尚未绑定角色！\n`},
          { type: 'text', text: `请使用以下格式：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 2. 获取用户绑定的所有构建数据
      const userBindings = bindData[userId];
      let allBuilds = [];
      
      for (const binding of userBindings) {
        if (binding.accountName) {
          const accountFileName = `${BUILD_PATH}${binding.accountName}.json`;
          if (fs.existsSync(accountFileName)) {
            const accountData = JSON.parse(fs.readFileSync(accountFileName, 'utf8'));
            
            // 遍历该账号下的所有角色
            for (const [playerName, playerData] of Object.entries(accountData)) {
              // 如果绑定指定了角色名，只收集匹配的角色数据
              if (!binding.playerName || binding.playerName === playerName) {
                playerData.builds.forEach(build => {
                  allBuilds.push({
                    playerName,
                    accountName: binding.accountName,
                    accountFileName,
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
          { type: 'text', text: `\n您尚未记录战斗！\n`},
          { type: 'text', text: `请发送包含您战斗的esolog网址，网址内必须包含fight的字样`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 3. 从CARD_PATH获取edit_index
      if (!fs.existsSync(CARD_PATH)) {
        return await this.reply('请先使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      const cardData = JSON.parse(fs.readFileSync(CARD_PATH, 'utf8'));
      if (!cardData[userId] || !cardData[userId].edit_index) {
        return await this.reply('请先使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      const editIndex = cardData[userId].edit_index;

      // 4. 找到匹配的构建
      const targetBuild = allBuilds.find(build => 
        build.buildData.reportsID === editIndex.reportsID &&
        build.buildData.fightIndex === editIndex.fightIndex &&
        build.buildData.sourceIndex === editIndex.sourceIndex
      );

      if (!targetBuild) {
        return await this.reply('未找到对应的构建数据，请使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      // 5. 解析标签添加命令
      const tag = e.msg.replace(/^#添加标签\s*/, '').trim();
      
      // 如果标签为空
      if (!tag) {
        return await this.reply('请输入要添加的标签');
      }
      
      // 检查标签长度
      if (tag.length > 8) {
        return await this.reply('标签长度不能超过8个字符，请重新设置');
      }

      // 6. 更新构建数据
      if (!targetBuild.buildData.buildData) {
        targetBuild.buildData.buildData = {};
      }
      if (!targetBuild.buildData.buildData.tags) {
        targetBuild.buildData.buildData.tags = [];
      }

      // 检查标签是否已存在
      if (targetBuild.buildData.buildData.tags.includes(tag)) {
        return await this.reply('该标签已存在！');
      }

      // 检查标签数量
      if (targetBuild.buildData.buildData.tags.length >= 6) {
        return await this.reply('每个构建最多只能添加6个标签！');
      }

      // 添加新标签
      targetBuild.buildData.buildData.tags.push(tag);

      // 7. 保存更新后的数据
      const accountData = JSON.parse(fs.readFileSync(targetBuild.accountFileName, 'utf8'));
      const playerBuilds = accountData[targetBuild.playerName].builds;
      
      // 找到并更新对应的构建
      const buildIndex = playerBuilds.findIndex(build => 
        build.reportsID === editIndex.reportsID &&
        build.fightIndex === editIndex.fightIndex &&
        build.sourceIndex === editIndex.sourceIndex
      );

      if (buildIndex !== -1) {
        // 找到当前编辑的角色在allBuilds中的索引
        const roleIndex = allBuilds.findIndex(build => 
          build.buildData.reportsID === editIndex.reportsID &&
          build.buildData.fightIndex === editIndex.fightIndex &&
          build.buildData.sourceIndex === editIndex.sourceIndex
        ) + 1;
        playerBuilds[buildIndex] = targetBuild.buildData;
        fs.writeFileSync(targetBuild.accountFileName, JSON.stringify(accountData, null, 2));
        return await this.reply(`角色${roleIndex}添加标签"${tag}"成功！`);
      } else {
        return await this.reply('保存失败，未找到对应的构建数据');
      }

    } catch (error) {
      logger.error(`[ESO:标签添加] 添加失败: ${error.message}`);
      return await this.reply('添加失败，请稍后重试');
    }
  }

  async queryTag(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    const userId = String(e.user_id);

    try {
      // 1. 检查用户是否绑定角色
      if (!fs.existsSync(ACCOUNT_PATH)) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n您尚未绑定角色！\n`},
          { type: 'text', text: `请使用以下格式：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      const bindData = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));
      if (!bindData[userId] || bindData[userId].length === 0) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n您尚未绑定角色！\n`},
          { type: 'text', text: `请使用以下格式：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 2. 获取用户绑定的所有构建数据
      const userBindings = bindData[userId];
      let allBuilds = [];
      
      for (const binding of userBindings) {
        if (binding.accountName) {
          const accountFileName = `${BUILD_PATH}${binding.accountName}.json`;
          if (fs.existsSync(accountFileName)) {
            const accountData = JSON.parse(fs.readFileSync(accountFileName, 'utf8'));
            
            // 遍历该账号下的所有角色
            for (const [playerName, playerData] of Object.entries(accountData)) {
              // 如果绑定指定了角色名，只收集匹配的角色数据
              if (!binding.playerName || binding.playerName === playerName) {
                playerData.builds.forEach(build => {
                  allBuilds.push({
                    playerName,
                    accountName: binding.accountName,
                    accountFileName,
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
          { type: 'text', text: `\n您尚未记录战斗！\n`},
          { type: 'text', text: `请发送包含您战斗的esolog网址，网址内必须包含fight的字样`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 3. 从CARD_PATH获取edit_index
      if (!fs.existsSync(CARD_PATH)) {
        return await this.reply('请先使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      const cardData = JSON.parse(fs.readFileSync(CARD_PATH, 'utf8'));
      if (!cardData[userId] || !cardData[userId].edit_index) {
        return await this.reply('请先使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      const editIndex = cardData[userId].edit_index;

      // 4. 找到匹配的构建
      const targetBuild = allBuilds.find(build => 
        build.buildData.reportsID === editIndex.reportsID &&
        build.buildData.fightIndex === editIndex.fightIndex &&
        build.buildData.sourceIndex === editIndex.sourceIndex
      );

      if (!targetBuild) {
        return await this.reply('未找到对应的构建数据，请使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      // 5. 检查标签是否存在
      if (!targetBuild.buildData.buildData || !targetBuild.buildData.buildData.tags || targetBuild.buildData.buildData.tags.length === 0) {
        return await this.reply('当前构建还没有添加任何标签');
      }

      // 6. 构建标签表格
      const roleIndex = allBuilds.findIndex(build => 
        build.buildData.reportsID === editIndex.reportsID &&
        build.buildData.fightIndex === editIndex.fightIndex &&
        build.buildData.sourceIndex === editIndex.sourceIndex
      ) + 1;

      let reply = `角色${roleIndex}的标签列表：\n`;
      reply += '序号  标签内容\n';
      reply += '━━━━━━━━━━\n';
      
      targetBuild.buildData.buildData.tags.forEach((tag, index) => {
        reply += `${index + 1}.    ${tag}\n`;
      });

      return await this.reply(reply);

    } catch (error) {
      logger.error(`[ESO:标签查询] 查询失败: ${error.message}`);
      return await this.reply('查询失败，请稍后重试');
    }
  }

  async deleteTag(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    const userId = String(e.user_id);

    try {
      // 1. 检查用户是否绑定角色
      if (!fs.existsSync(ACCOUNT_PATH)) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n您尚未绑定角色！\n`},
          { type: 'text', text: `请使用以下格式：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      const bindData = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));
      if (!bindData[userId] || bindData[userId].length === 0) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n您尚未绑定角色！\n`},
          { type: 'text', text: `请使用以下格式：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 2. 获取用户绑定的所有构建数据
      const userBindings = bindData[userId];
      let allBuilds = [];
      
      for (const binding of userBindings) {
        if (binding.accountName) {
          const accountFileName = `${BUILD_PATH}${binding.accountName}.json`;
          if (fs.existsSync(accountFileName)) {
            const accountData = JSON.parse(fs.readFileSync(accountFileName, 'utf8'));
            
            // 遍历该账号下的所有角色
            for (const [playerName, playerData] of Object.entries(accountData)) {
              // 如果绑定指定了角色名，只收集匹配的角色数据
              if (!binding.playerName || binding.playerName === playerName) {
                playerData.builds.forEach(build => {
                  allBuilds.push({
                    playerName,
                    accountName: binding.accountName,
                    accountFileName,
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
          { type: 'text', text: `\n您尚未记录战斗！\n`},
          { type: 'text', text: `请发送包含您战斗的esolog网址，网址内必须包含fight的字样`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 3. 从CARD_PATH获取edit_index
      if (!fs.existsSync(CARD_PATH)) {
        return await this.reply('请先使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      const cardData = JSON.parse(fs.readFileSync(CARD_PATH, 'utf8'));
      if (!cardData[userId] || !cardData[userId].edit_index) {
        return await this.reply('请先使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      const editIndex = cardData[userId].edit_index;

      // 4. 找到匹配的构建
      const targetBuild = allBuilds.find(build => 
        build.buildData.reportsID === editIndex.reportsID &&
        build.buildData.fightIndex === editIndex.fightIndex &&
        build.buildData.sourceIndex === editIndex.sourceIndex
      );

      if (!targetBuild) {
        return await this.reply('未找到对应的构建数据，请使用 #编辑角色1 #编辑角色2 选择要编辑的角色');
      }

      // 5. 检查标签是否存在
      if (!targetBuild.buildData.buildData || !targetBuild.buildData.buildData.tags || targetBuild.buildData.buildData.tags.length === 0) {
        return await this.reply('当前构建还没有添加任何标签');
      }

      // 6. 解析要删除的标签序号
      const tagIndex = parseInt(e.msg.replace(/^#删除标签/, '').trim()) - 1;
      const maxTagIndex = targetBuild.buildData.buildData.tags.length;
      
      // 检查序号是否合法
      if (isNaN(tagIndex) || tagIndex < 0 || tagIndex >= maxTagIndex) {
        return await this.reply(`标签序号必须在1到${maxTagIndex}之间`);
      }

      // 7. 删除标签
      const deletedTag = targetBuild.buildData.buildData.tags[tagIndex];
      targetBuild.buildData.buildData.tags.splice(tagIndex, 1);

      // 8. 保存更新后的数据
      const accountData = JSON.parse(fs.readFileSync(targetBuild.accountFileName, 'utf8'));
      const playerBuilds = accountData[targetBuild.playerName].builds;
      
      // 找到并更新对应的构建
      const buildIndex = playerBuilds.findIndex(build => 
        build.reportsID === editIndex.reportsID &&
        build.fightIndex === editIndex.fightIndex &&
        build.sourceIndex === editIndex.sourceIndex
      );

      if (buildIndex !== -1) {
        // 找到当前编辑的角色在allBuilds中的索引
        const roleIndex = allBuilds.findIndex(build => 
          build.buildData.reportsID === editIndex.reportsID &&
          build.buildData.fightIndex === editIndex.fightIndex &&
          build.buildData.sourceIndex === editIndex.sourceIndex
        ) + 1;
        playerBuilds[buildIndex] = targetBuild.buildData;
        fs.writeFileSync(targetBuild.accountFileName, JSON.stringify(accountData, null, 2));
        return await this.reply(`角色${roleIndex}删除标签${tagIndex + 1}："${deletedTag}"成功！`);
      } else {
        return await this.reply('保存失败，未找到对应的构建数据');
      }

    } catch (error) {
      logger.error(`[ESO:标签删除] 删除失败: ${error.message}`);
      return await this.reply('删除失败，请稍后重试');
    }
  }

  async addCard(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    const userId = String(e.user_id);

    try {
      // 1. 检查用户是否绑定角色
      if (!fs.existsSync(ACCOUNT_PATH)) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n您尚未绑定角色！\n`},
          { type: 'text', text: `请使用以下格式：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      const bindData = JSON.parse(fs.readFileSync(ACCOUNT_PATH, 'utf8'));
      if (!bindData[userId] || bindData[userId].length === 0) {
        let progressMsg = [
          { type: 'at', qq: this.e.user_id },
          { type: 'text', text: `\n您尚未绑定角色！\n`},
          { type: 'text', text: `请使用以下格式：\n1. #绑定@AccountName\n2. #绑定playerName@AccountName`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 2. 获取用户绑定的所有构建数据
      const userBindings = bindData[userId];
      let allBuilds = [];
      
      for (const binding of userBindings) {
        if (binding.accountName) {
          const accountFileName = `${BUILD_PATH}${binding.accountName}.json`;
          if (fs.existsSync(accountFileName)) {
            const accountData = JSON.parse(fs.readFileSync(accountFileName, 'utf8'));
            
            // 遍历该账号下的所有角色
            for (const [playerName, playerData] of Object.entries(accountData)) {
              // 如果绑定指定了角色名，只收集匹配的角色数据
              if (!binding.playerName || binding.playerName === playerName) {
                playerData.builds.forEach(build => {
                  allBuilds.push({
                    playerName,
                    accountName: binding.accountName,
                    accountFileName,
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
          { type: 'text', text: `\n您尚未记录战斗！\n`},
          { type: 'text', text: `请发送包含您战斗的esolog网址，网址内必须包含fight的字样`}
        ]
        return await this.reply(progressMsg, false, { recallMsg: -1 });
      }

      // 3. 解析要名片化的构建序号
      const buildNumStr = e.msg.replace(/^#名片化\s*(?:角色)?/, '').trim();
      const buildNum = parseInt(buildNumStr);

      if (isNaN(buildNum) || buildNum <= 0 || buildNum > allBuilds.length) {
        return await this.reply(`请输入正确的构建序号（1-${allBuilds.length}）`);
      }

      // 4. 获取对应的构建数据
      const targetBuild = allBuilds[buildNum - 1];

      // 5. 检查并更新CARD_PATH
      let cardData = {};
      if (fs.existsSync(CARD_PATH)) {
        cardData = JSON.parse(fs.readFileSync(CARD_PATH, 'utf8'));
      }

      // 初始化用户的卡片数据
      if (!cardData[userId]) {
        cardData[userId] = {
          cards_info: []
        };
      }

      // 检查卡片数量限制
      if (cardData[userId].cards_info.length >= 5) {
        return await this.reply('你最多可以设置5个名片，槽位已满。请使用 #删除名片1 #删除名片2 等，来清理出空位');
      }

      // 6. 创建新的卡片数据
      const newCard = {
        index: cardData[userId].cards_info.length + 1,
        accountName: targetBuild.accountName,
        playerName: targetBuild.playerName,
        reportsID: targetBuild.buildData.reportsID,
        fightIndex: targetBuild.buildData.fightIndex,
        sourceIndex: targetBuild.buildData.sourceIndex
      };

      // 7. 添加新卡片并保存
      cardData[userId].cards_info.push(newCard);
      fs.writeFileSync(CARD_PATH, JSON.stringify(cardData, null, 2));

      return await this.reply(`角色${buildNum}已成功添加为名片${newCard.index}`);

    } catch (error) {
      logger.error(`[ESO:名片化] 添加名片失败: ${error.message}`);
      return await this.reply('添加名片失败，请稍后重试');
    }
  }

  async queryCard(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    let userId = String(e.user_id);
    let personID = e.at

    if (typeof personID != "undefined")
    {
      userId = String(personID);
    }

    try {
      // 1. 检查CARD_PATH是否存在
      if (!fs.existsSync(CARD_PATH)) {
        return await this.reply('未设置任何名片');
      }

      // 2. 读取卡片数据
      const cardData = JSON.parse(fs.readFileSync(CARD_PATH, 'utf8'));
      if (!cardData[userId] || !cardData[userId].cards_info || cardData[userId].cards_info.length === 0) {
        return await this.reply('未设置任何名片');
      }

      // 3. 解析命令中的序号
      const cardNumStr = e.msg.replace(/^#(?:查看名片|名片)\s*/, '').trim();
      const cardNum = parseInt(cardNumStr);

      // 4. 获取所有名片对应的构建数据
      const allCards = [];
      for (const card of cardData[userId].cards_info) {
        const accountFileName = `${BUILD_PATH}${card.accountName}.json`;
        if (fs.existsSync(accountFileName)) {
          const accountData = JSON.parse(fs.readFileSync(accountFileName, 'utf8'));
          if (accountData[card.playerName]) {
            const build = accountData[card.playerName].builds.find(b => 
              b.reportsID === card.reportsID &&
              b.fightIndex === card.fightIndex &&
              b.sourceIndex === card.sourceIndex
            );
            if (build) {
              allCards.push({
                index: card.index,
                accountName: card.accountName,
                playerName: card.playerName,
                buildData: build
              });
            }
          }
        }
      }

      // 5. 如果没有找到任何有效的名片数据
      if (allCards.length === 0) {
        return await this.reply('未找到有效的名片数据');
      }

      // 6. 处理不同的显示情况
      if (isNaN(cardNum)) {
        // 显示名片列表
        let reply = '查询到如下名片：\n';
        reply += '序号  角色@账号  种族  职责  职业\n';
        reply += '━━━━━━━━━━━━━━━━━━━━━━\n';
        
        allCards.forEach(card => {
          const buildData = card.buildData.buildData || {};
          const role = buildData.roleNameCN || '未知';
          const race = buildData.raceInfo?.[0]?.name_cn || '未知';
          const className = buildData.classNameCN || '未知';
          
          reply += `${card.index}.    ${card.playerName}@${card.accountName}  ${race}  ${role}  ${className}\n`;
        });

        return await this.reply(reply);
      } else {
        // 显示指定名片的图片
        if (cardNum <= 0 || cardNum > allCards.length) {
          return await this.reply(`请输入正确的名片序号（1-${allCards.length}）`);
        }

        const targetCard = allCards.find(card => card.index === cardNum);
        if (!targetCard) {
          return await this.reply('未找到对应的名片数据');
        }

        // 生成并发送图片
        targetCard.buildData.buildData.userId = userId
        let cardData = JSON.parse(JSON.stringify(await database.updateData(targetCard.buildData.buildData, 7)));
        let msg = await puppeteer.screenshot('eso', cardData);
        return await this.reply(msg);
      }

    } catch (error) {
      logger.error(`[ESO:查看名片] 查询失败: ${error.message}`);
      return await this.reply('查询名片失败，请稍后重试');
    }
  }

  async deleteCard(e) {
    // 获取用户QQ，转为字符串避免大数精度问题
    const userId = String(e.user_id);

    try {
      // 1. 检查CARD_PATH是否存在
      if (!fs.existsSync(CARD_PATH)) {
        return await this.reply('未设置任何名片');
      }

      // 2. 读取卡片数据
      const cardData = JSON.parse(fs.readFileSync(CARD_PATH, 'utf8'));
      if (!cardData[userId] || !cardData[userId].cards_info || cardData[userId].cards_info.length === 0) {
        return await this.reply('未设置任何名片');
      }

      // 3. 解析要删除的名片序号
      const cardNumStr = e.msg.replace(/^#删除名片/, '').trim();
      const cardNum = parseInt(cardNumStr);

      if (isNaN(cardNum) || cardNum <= 0 || cardNum > cardData[userId].cards_info.length) {
        return await this.reply(`请输入正确的名片序号（1-${cardData[userId].cards_info.length}）`);
      }

      // 4. 找到并删除对应的名片
      const targetCardIndex = cardData[userId].cards_info.findIndex(card => card.index === cardNum);
      if (targetCardIndex === -1) {
        return await this.reply('未找到对应的名片');
      }

      // 保存被删除的名片信息用于提示
      const deletedCard = cardData[userId].cards_info[targetCardIndex];
      
      // 删除名片
      cardData[userId].cards_info.splice(targetCardIndex, 1);

      // 5. 更新剩余名片的序号
      for (let i = targetCardIndex; i < cardData[userId].cards_info.length; i++) {
        cardData[userId].cards_info[i].index = i + 1;
      }

      // 6. 保存更新后的数据
      fs.writeFileSync(CARD_PATH, JSON.stringify(cardData, null, 2));

      return await this.reply(`名片${cardNum}（${deletedCard.playerName}@${deletedCard.accountName}）已删除`);

    } catch (error) {
      logger.error(`[ESO:删除名片] 删除失败: ${error.message}`);
      return await this.reply('删除名片失败，请稍后重试');
    }
  }
}