import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import fetch from 'node-fetch'
import moment from 'moment'
import ServerStatus from '../model/serverstatus.js'
import md5 from 'md5'
import * as cheerio from 'cheerio'

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// 辅助函数：获取月份数字
function getMonthNumber(monthName) {
  const months = {
    'January': '01', 'February': '02', 'March': '03', 'April': '04',
    'May': '05', 'June': '06', 'July': '07', 'August': '08',
    'September': '09', 'October': '10', 'November': '11', 'December': '12'
  };
  return months[monthName] || '01';
}

// 辅助函数：获取中文月份名称
function getMonthName(monthName) {
  const months = {
    'January': '1月', 'February': '2月', 'March': '3月', 'April': '4月',
    'May': '5月', 'June': '6月', 'July': '7月', 'August': '8月',
    'September': '9月', 'October': '10月', 'November': '11月', 'December': '12月'
  };
  return months[monthName] || '1月';
}

// 辅助函数：将UTC时间转换为北京时间
// 输入：UTC时间（HH:MM格式，24小时制），如 "9:00" 或 "17:00"
// 输出：北京时间（HH:MM格式，24小时制）
function convertUTCtoBeijing(utcTime) {
  let [hours, minutes] = utcTime.split(':').map(Number);
  
  // UTC + 8小时 = 北京时间
  hours += 8;
  
  // 处理跨日
  if (hours >= 24) {
    hours -= 24;
  }
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// 维护信息解析函数对象
const parseMaintenanceFunctions = {
    getMaintenanceStatus(line) {
        if (line.includes('[COMPLETE]')) {
            return '[已更新]';
        } else if (line.includes('[IN PROGRESS]')) {
            return '[维护中]';
        } else {
            return '[待更新]';
        }
    },

    getPlatformInfo(line) {
        const platformMatch = line.match(/(PC\/Mac|Xbox|PlayStation®)/);
        if (platformMatch) {
            return {
                platform: platformMatch[0],
                isPlatformSpecific: true,
                isValid: true
            };
        }
        
        const megaserverMatch = line.match(/(NA|EU)\s+megaservers/i);
        if (megaserverMatch) {
            return {
                platform: 'PC', // 通用信息归类到PC
                isPlatformSpecific: false,
                isValid: true
            };
        }
        
        return { isValid: false };
    },

    getServerRegion(line) {
        const hasNA = line.includes('NA');
        const hasEU = line.includes('EU');
        
        if (hasNA && hasEU) {
            return '美服和欧服';
        } else if (hasNA) {
            return '美服';
        } else if (hasEU) {
            return '欧服';
        }
        return '';
    },

    getMaintenanceType(line) {
        if (line.includes('No maintenance')) {
            return '无需维护';
        } else if (line.includes('patch')) {
            return '版本维护';
        } else {
            return '维护';
        }
    },

    parseSingleTime(line) {
        // 优先查找UTC时间（格式：(9:00 UTC) 或 (09:00 UTC)）
        const utcTimeRegex = /\((\d{1,2}:\d{2})\s*UTC\)/i;
        const utcTimeMatch = line.match(utcTimeRegex);
        
        if (utcTimeMatch) {
            // 日期格式支持 "November 3," 或 "November 3"
            const maintenanceDateMatch = line.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?/);
            const maintenanceMonth = maintenanceDateMatch ? getMonthName(maintenanceDateMatch[1]) : '';
            const maintenanceDay = maintenanceDateMatch ? maintenanceDateMatch[2] : '';
            
            // 使用UTC时间计算北京时间
            const utcTime = utcTimeMatch[1];
            const localTime = convertUTCtoBeijing(utcTime);
            return ` 北京时间${maintenanceMonth}${maintenanceDay}日 ${localTime}`;
        }
        
        // 如果没有UTC时间，尝试使用EST/EDT时间（向后兼容）
        const singleTimeRegex = /(\d{1,2}:\d{2})\s*(AM|PM)\s*E(D|S)T/i;
        const singleTimeMatch = line.match(singleTimeRegex);
        
        if (singleTimeMatch) {
            // 日期格式支持 "November 3," 或 "November 3"
            const maintenanceDateMatch = line.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?/);
            const maintenanceMonth = maintenanceDateMatch ? getMonthName(maintenanceDateMatch[1]) : '';
            const maintenanceDay = maintenanceDateMatch ? maintenanceDateMatch[2] : '';
            
            //logger.warn('[ESO:服务器状态] parseSingleTime 未找到UTC时间，使用EST/EDT时间，但建议使用UTC时间');
            // 如果没有UTC时间，返回空（用户要求使用UTC时间）
            return '';
        }
        
        return '';
    },

    parseTimeMatch(timeMatch, isEdtFirst, line) {
        // 日期格式支持 "November 3," 或 "November 3"
        const startDateMatch = line.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?/);
        const startMonth = startDateMatch ? getMonthName(startDateMatch[1]) : '';
        const startDay = startDateMatch ? startDateMatch[2] : '';

        let startLocalTime, endLocalTime, startUTC, endUTC;
        let endMonth = startMonth;
        let endDay = startDay;
        
        if (isEdtFirst) {
            // EDT/EST格式：(\d{1,2}:\d{2})\s*(AM|PM)\s*E(D|S)T\s*\((\d{1,2}:\d{2})\s*UTC\)\s*-\s*(\d{1,2}:\d{2})\s*(AM|PM)\s*E(D|S)T\s*\((\d{1,2}:\d{2})\s*UTC\)
            // 组索引：[1]=开始时间 [2]=开始AM/PM [3]=EST/EDT的D/S [4]=开始UTC [5]=结束时间 [6]=结束AM/PM [7]=EST/EDT的D/S [8]=结束UTC
            // 直接使用UTC时间计算北京时间
            startUTC = timeMatch[4];
            endUTC = timeMatch[8];
            startLocalTime = convertUTCtoBeijing(startUTC);
            endLocalTime = convertUTCtoBeijing(endUTC);
        } else {
            // UTC格式：(\d{1,2}:\d{2})\s*UTC\s*\((\d{1,2}:\d{2})\s*(AM|PM)\s*E(D|S)T\)\s*-\s*(?:(January|...)\s+(\d{1,2}),?\s+)?(\d{1,2}:\d{2})\s*UTC\s*\((\d{1,2}:\d{2})\s*(AM|PM)\s*E(D|S)T\)
            // 组索引：[1]=开始UTC [2]=开始时间 [3]=开始AM/PM [4]=EST/EDT的D/S [5]=结束月份 [6]=结束日期 [7]=结束UTC [8]=结束时间 [9]=结束AM/PM [10]=EST/EDT的D/S
            // 直接使用UTC时间计算北京时间
            startUTC = timeMatch[1];
            startLocalTime = convertUTCtoBeijing(startUTC);
            
            if (timeMatch[5] && timeMatch[6]) {
                endMonth = getMonthName(timeMatch[5]);
                endDay = timeMatch[6];
                endUTC = timeMatch[7];
            } else {
                endUTC = timeMatch[7];
            }
            endLocalTime = convertUTCtoBeijing(endUTC);
        }

        
        if (endMonth !== startMonth || endDay !== startDay) {
            return ` 北京时间${startMonth}${startDay}日 ${startLocalTime} (${startUTC} UTC) - ${endMonth}${endDay}日 ${endLocalTime} (${endUTC} UTC)`;
        } else {
            return ` 北京时间${startMonth}${startDay}日 ${startLocalTime} (${startUTC} UTC) - ${endLocalTime} (${endUTC} UTC)`;
        }
    },

    parseMaintenanceTime(line) {
//logger.info(`[ESO:服务器状态] parseMaintenanceTime 输入: "${line}"`);
        
        if (line.includes('No maintenance')) {
//logger.info('[ESO:服务器状态] 检测到无需维护');
            return '';
        }

        // 支持 EST 和 EDT，格式：4:00AM EST (9:00 UTC) - 12:00PM EST (17:00 UTC)
        const edtFirstRegex = /(\d{1,2}:\d{2})\s*(AM|PM)\s*E(D|S)T\s*\((\d{1,2}:\d{2})\s*UTC\)\s*-\s*(\d{1,2}:\d{2})\s*(AM|PM)\s*E(D|S)T\s*\((\d{1,2}:\d{2})\s*UTC\)/i;
        // 支持 EST 和 EDT，格式：9:00 UTC (4:00AM EST) - 17:00 UTC (12:00PM EST)
        const utcFirstRegex = /(\d{1,2}:\d{2})\s*UTC\s*\((\d{1,2}:\d{2})\s*(AM|PM)\s*E(D|S)T\)\s*-\s*(?:(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+)?(\d{1,2}:\d{2})\s*UTC\s*\((\d{1,2}:\d{2})\s*(AM|PM)\s*E(D|S)T\)/i;
        
        let timeMatch = line.match(edtFirstRegex);
        let isEdtFirst = true;
        
        if (timeMatch) {
//logger.info('[ESO:服务器状态] EDT/EST格式匹配成功:', timeMatch);
        } else {
            timeMatch = line.match(utcFirstRegex);
            isEdtFirst = false;
            if (timeMatch) {
//logger.info('[ESO:服务器状态] UTC格式匹配成功:', timeMatch);
            } else {
//logger.warn('[ESO:服务器状态] 时间格式未匹配到，尝试parseSingleTime');
            }
        }

        if (timeMatch) {
            const result = this.parseTimeMatch(timeMatch, isEdtFirst, line);
//logger.info('[ESO:服务器状态] parseTimeMatch 结果:', result);
            return result;
        } else {
            const result = this.parseSingleTime(line);
//logger.info('[ESO:服务器状态] parseSingleTime 结果:', result);
            return result;
        }
    },

    parseMaintenanceLine(line) {
//logger.info(`[ESO:服务器状态] parseMaintenanceLine 输入: "${line}"`);
        
        const status = this.getMaintenanceStatus(line);
//logger.info('[ESO:服务器状态] 解析状态:', status);
        
        const platformInfo = this.getPlatformInfo(line);
//logger.info('[ESO:服务器状态] 解析平台信息:', JSON.stringify(platformInfo));
        
        if (!platformInfo.isValid) {
//logger.warn('[ESO:服务器状态] 平台信息无效，返回null');
            return null;
        }

        const serverRegion = this.getServerRegion(line);
//logger.info('[ESO:服务器状态] 解析服务器区域:', serverRegion);
        
        const maintenanceType = this.getMaintenanceType(line);
//logger.info('[ESO:服务器状态] 解析维护类型:', maintenanceType);
        
        const translatedTime = this.parseMaintenanceTime(line);
//logger.info('[ESO:服务器状态] 解析翻译时间:', translatedTime);

        const result = {
            status,
            platform: platformInfo.platform,
            isPlatformSpecific: platformInfo.isPlatformSpecific,
            serverRegion,
            maintenanceType,
            translatedTime
        };
        
//logger.info('[ESO:服务器状态] parseMaintenanceLine 最终结果:', JSON.stringify(result, null, 2));
        return result;
    },

    assignToPlatform(finalLines, maintenanceInfo, line) {
//logger.info(`[ESO:服务器状态] assignToPlatform 输入:`, JSON.stringify(maintenanceInfo, null, 2));
//logger.info(`[ESO:服务器状态] assignToPlatform 原始行: "${line}"`);
        
        const { status, platform, isPlatformSpecific, serverRegion, maintenanceType, translatedTime } = maintenanceInfo;
        
        // 根据状态确定颜色
        let statusColor = '';
        if (status.includes('已更新')) {
            statusColor = 'rgb(19, 217, 98)'; // 绿色
        } else if (status.includes('维护中')) {
            statusColor = 'rgb(255, 105, 180)'; // 纯红色，更亮
        } else {
            statusColor = 'rgb(255, 165, 0)'; // 橙色
        }
        
        const newLine = `${status} ${platform}：${serverRegion}${maintenanceType}${translatedTime ? ` -${translatedTime}` : ''}`;
//logger.info('[ESO:服务器状态] 生成的文本行:', newLine);
//logger.info('[ESO:服务器状态] 分配的颜色:', statusColor);
        
        const lineObject = {
            text: newLine,
            color: statusColor
        };
        
        if (isPlatformSpecific) {
//logger.info('[ESO:服务器状态] 平台特定信息，isPlatformSpecific:', isPlatformSpecific);
            if (line.includes('PC/Mac')) {
                const pcLine = { ...lineObject };
                pcLine.text = newLine.replace('PC/Mac', 'PC');
                const macLine = { ...lineObject };
                macLine.text = newLine.replace('PC/Mac', 'Mac');
                
                // 初始化数组
                if (!finalLines["PC"]) finalLines["PC"] = [];
                if (!finalLines["Mac"]) finalLines["Mac"] = [];
                finalLines["PC"].push(pcLine);
                finalLines["Mac"].push(macLine);
//logger.info('[ESO:服务器状态] 已分配到PC和Mac平台');
            } else if (line.includes('Xbox')) {
                if (!finalLines["Xbox"]) finalLines["Xbox"] = [];
                finalLines["Xbox"].push(lineObject);
//logger.info('[ESO:服务器状态] 已分配到Xbox平台');
            } else if (line.includes('PlayStation')) {
                if (!finalLines["PlayStation"]) finalLines["PlayStation"] = [];
                finalLines["PlayStation"].push(lineObject);
//logger.info('[ESO:服务器状态] 已分配到PlayStation平台');
            }
        } else {
//logger.info('[ESO:服务器状态] 通用信息，分配到PC平台');
            if (!finalLines["PC"]) finalLines["PC"] = [];
            finalLines["PC"].push(lineObject);
        }
        
//logger.info('[ESO:服务器状态] assignToPlatform 当前finalLines状态:', JSON.stringify(finalLines, null, 2));
    }
};

async function fetchMaintenanceMessage() {
    const url = 'https://forums.elderscrollsonline.com/en/categories/official-news';

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': DEFAULT_USER_AGENT
            }
        });

        if (!response || !response.ok) {
//logger.warn(`[ESO:服务器状态] 获取维护公告失败，状态码: ${response ? response.status : '未知'}`);
            return '';
        }

        const html = await response.text();
        
        // 检查是否包含 DismissMessage（与 maintenance.js 逻辑一致）
        if (!html.includes("DismissMessage")) {
//logger.warn('[ESO:服务器状态] 未能在官方论坛页面找到维护公告内容');
            return '';
        }

        const $ = cheerio.load(html);
        const dismissMessage = $('.DismissMessage');

        if (!dismissMessage || dismissMessage.length === 0) {
//logger.warn('[ESO:服务器状态] 未能在官方论坛页面找到维护公告内容');
            return '';
        }

        // 直接使用 .text().trim() 获取文本，与 maintenance.js 保持一致
        const maintenanceMessage = dismissMessage.text().trim();
//logger.info('[ESO:服务器状态] 获取到的维护公告原始文本:');
//logger.info(maintenanceMessage);
//logger.info('[ESO:服务器状态] 维护公告原始文本长度:', maintenanceMessage.length);
        return maintenanceMessage;
    } catch (error) {
//logger.error('[ESO:服务器状态] 拉取维护公告时出现异常:', error);
        return '';
    }
}

async function fetchServerStatusRaw() {
    const url = 'https://esolog.uesp.net/getEsoServerStatus.php';

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': DEFAULT_USER_AGENT
            }
        });

        if (!response || !response.ok) {
//logger.warn(`[ESO:服务器状态] 获取服务器状态失败，状态码: ${response ? response.status : '未知'}`);
            return null;
        }

        const raw = await response.text();
//logger.info(`[ESO:服务器状态] fetchServerStatusRaw 获取到的原始HTML数据:`);
//logger.info(raw);
        
        const $ = cheerio.load(raw);
        const statusKeyMap = {
            'pc - na': 'pcNA',
            'pc - eu': 'pcEU',
            'pts': 'pcPTS',
            'xbox - na': 'xbNA',
            'xbox - eu': 'xbEU',
            'playstation - na': 'psNA',
            'playstation - eu': 'psEU'
        };

        const displayNameMap = serverList.reduce((acc, item) => {
            acc[item[0]] = item[1];
            return acc;
        }, {});

//logger.info('[ESO:服务器状态] fetchServerStatusRaw 开始解析服务器状态');
        const serverStatusResults = [];

        $('.uespEsoServer').each((_, element) => {
            const titleText = $(element).find('.uespEsoServerTitle').text().replace(':', '').trim();
            if (!titleText) return;

            const normalizedTitle = titleText.toLowerCase();
            const key = statusKeyMap[normalizedTitle];
            const statusElement = $(element).find("[class^='uespEsoStatus']");
            const statusClass = statusElement.attr('class') || '';
            const statusText = statusElement.text().trim();
            const isUp = statusClass.toLowerCase().includes('up') || statusText.toLowerCase() === 'up' || statusText.toLowerCase() === 'online';
            const statusValue = isUp ? 1 : 0;

            if (key && Object.prototype.hasOwnProperty.call(status, key)) {
                const oldValue = status[key];
                status[key] = statusValue;
                const displayName = displayNameMap[key] || titleText;
                
                const serverInfo = {
                    key,
                    displayName,
                    titleText,
                    statusClass,
                    statusText,
                    isUp,
                    statusValue,
                    oldValue,
                    changed: oldValue !== statusValue
                };
                serverStatusResults.push(serverInfo);
                
//logger.info(`[ESO:服务器状态] 服务器 ${displayName} (${key}): ${statusText} (${statusClass}) -> 状态值: ${statusValue}${serverInfo.changed ? ` (从 ${oldValue} 变更)` : ''}`);
            } else {
//logger.info(`[ESO:服务器状态] 未识别的服务器条目: ${titleText}`);
            }
        });

        const lastUpdatedText = $('.uespEsoServerUpdated').text().replace('Last Updated', '').replace(':', '').trim();
//logger.info(`[ESO:服务器状态] fetchServerStatusRaw 最后更新时间: ${lastUpdatedText}`);
//logger.info(`[ESO:服务器状态] fetchServerStatusRaw 解析到的服务器状态总数: ${serverStatusResults.length}`);
//logger.info(`[ESO:服务器状态] fetchServerStatusRaw 当前status对象状态:`);
//logger.info(JSON.stringify({
//            pcNA: status.pcNA,
//            pcEU: status.pcEU,
//            pcPTS: status.pcPTS,
//            xbNA: status.xbNA,
//            xbEU: status.xbEU,
//            psNA: status.psNA,
//            psEU: status.psEU
//        }, null, 2));

        return {
            raw,
            lastUpdated: lastUpdatedText,
            displayNames: displayNameMap,
            serverStatusResults
        };
    } catch (error) {
//logger.error('[ESO:服务器状态] 拉取服务器状态数据时出现异常:', error);
        return null;
    }
}

// 维护信息处理函数
function processMaintenanceInfo(maintenanceMessage) {
//logger.info('[ESO:服务器状态] processMaintenanceInfo 输入:');
//logger.info(maintenanceMessage);
    
    const lines = maintenanceMessage.trim().split('\n').filter(line => line.trim() !== '');
//logger.info('[ESO:服务器状态] 分割后的行数:', lines.length);
//logger.info('[ESO:服务器状态] 分割后的每行内容:');
    lines.forEach((line, index) => {
//logger.info(`  行${index + 1}: "${line}"`);
    });
    
    const finalLines = {};
    const currentYear = new Date().getFullYear();

    const firstLine = lines[0];
//logger.info('[ESO:服务器状态] 第一行内容:', firstLine);
    // 日期格式支持 "November 3," 或 "November 3"
    const dateMatch = firstLine.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?/);
    if (dateMatch) {
//logger.info('[ESO:服务器状态] 日期匹配成功:', dateMatch);
        const monthName = dateMatch[1];
        const day = dateMatch[2];
        const monthNumber = getMonthNumber(monthName);
        finalLines["header"] = {
            text: `${currentYear}-${monthNumber}-${day} 当周服务器维护信息`,
            color: 'rgb(58, 146, 254)' // 蓝色标题
        };
//logger.info('[ESO:服务器状态] 生成的标题:', finalLines["header"]);
    } else {
//logger.warn('[ESO:服务器状态] 第一行未匹配到日期格式');
    }

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

//logger.info(`[ESO:服务器状态] 处理第${i + 1}行: "${line}"`);
        const maintenanceInfo = parseMaintenanceFunctions.parseMaintenanceLine(line);
        if (!maintenanceInfo) {
//logger.warn(`[ESO:服务器状态] 第${i + 1}行解析失败，返回null`);
            continue;
        }
        
//logger.info(`[ESO:服务器状态] 第${i + 1}行解析结果:`, JSON.stringify(maintenanceInfo, null, 2));
        parseMaintenanceFunctions.assignToPlatform(finalLines, maintenanceInfo, line);
    }
    
//logger.info('[ESO:服务器状态] processMaintenanceInfo 最终结果:');
//logger.info(JSON.stringify(finalLines, null, 2));
    return finalLines;
}

//serverStatus结构体变量
let serverData = {
}

//cacheData to save img
let serverImg = {
  md5: '',
  img: ''
}

// 冷却时间（毫秒）
const COOLDOWN_TIME = 30 * 1000 // 30秒冷却

// 用于跟踪每个状态的最后发送时间
const lastNotifyTime = new Map()

// 检查是否在冷却中
function isInCooldown(key) {
  const lastTime = lastNotifyTime.get(key)
  if (!lastTime) return false
  return Date.now() - lastTime < COOLDOWN_TIME
}

// 更新发送时间
function updateNotifyTime(key) {
  lastNotifyTime.set(key, Date.now())
}

//服务器列表
let serverList= [
  ['pcNA','PC 美服'],
  ['pcEU','PC 欧服'],
  ['pcPTS','PC 测试服'],
  ['xbNA','XBOX 美服'],
  ['xbEU','XBOX 欧服'],
  ['psNA','PS 美服'],
  ['psEU','PS 欧服']
]

//服务器状态
let status = {
  time: '2023-01-01_00:00',
  msg: 'Not all Systems Operational',
  pcNA: 1,
  pcEU: 1,
  pcPTS: 1,
  xbNA: 1,
  xbEU: 1,
  psNA: 1,
  psEU: 1,
}

let lastStatus = {
  time: '2023-01-01_00:00',
  msg: 'Not all Systems Operational',
  pcNA: 1,
  pcEU: 1,
  pcPTS: 1,
  xbNA: 1,
  xbEU: 1,
  psNA: 1,
  psEU: 1,
}

export class serverStatus extends plugin {
  constructor () {
    super({
      /** 功能名称 */
      name: 'ESO:服务器状态',
      /** 功能描述 */
      dsc: '查询服务器状态',
      event: 'message',
      /** 优先级，数字越小等级越高 */
      priority: 5000,
      rule: [
        {
          /** 命令正则匹配 */
          reg: '^#*(服务器|服务器公告|服务器状态|服务器维护|服务器维护时间|服务器维护计划)$',
          /** 执行方法 */
          fnc: 'sendStatus'
        }
      ]
    })
    
    // 初始化定时器ID为null
    this.checkInterval = null
  }

  /**
   * 启动自动检查
   * @private
   */
  async startAutoCheck(e) {
    // 如果定时器已经存在，先清除它
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
    }
    
    // 设置新的定时器，每隔一段时间执行一次
    this.checkInterval = setInterval(async () => {
      await this.getESOStatus(this.e)
    }, 1 * 60 * 1000)
  }

  /**
   * #服务器状态
   * @提供服务器状态查询
   */
  async sendStatus (e) {
    await this.getESOStatus(e)

    // 在首次执行后启动自动检查
    await this.startAutoCheck(e)

	  if('done' != serverData.init)
    {
    	let ssData = await ServerStatus.get(this.e, 'eso', 'serverStatus', 'serverStatus')
        if (!ssData)
        {
//logger.error('[ESO:服务器状态] 初始化结构体失败')
            return
        }
        serverData = ssData
    }

    // 处理维护信息
//logger.info('[ESO:服务器状态] sendStatus 开始处理维护信息');
//logger.info('[ESO:服务器状态] sendStatus 当前status.msg:', status.msg);
    
    let maintenanceInfo = [];
    try {
      const maintenanceData = processMaintenanceInfo(status.msg);
//logger.info('[ESO:服务器状态] sendStatus processMaintenanceInfo 返回结果:', JSON.stringify(maintenanceData, null, 2));
      
      if (maintenanceData.header) {
//logger.info('[ESO:服务器状态] sendStatus 添加标题:', maintenanceData.header);
        maintenanceInfo.push(maintenanceData.header);
      }
      if (maintenanceData.PC) {
//logger.info('[ESO:服务器状态] sendStatus PC平台信息:', maintenanceData.PC);
        if (Array.isArray(maintenanceData.PC)) {
          maintenanceInfo.push(...maintenanceData.PC);
        } else {
          maintenanceInfo.push(maintenanceData.PC);
        }
      }
      if (maintenanceData.Mac) {
//logger.info('[ESO:服务器状态] sendStatus Mac平台信息:', maintenanceData.Mac);
        if (Array.isArray(maintenanceData.Mac)) {
          maintenanceInfo.push(...maintenanceData.Mac);
        } else {
          maintenanceInfo.push(maintenanceData.Mac);
        }
      }
      if (maintenanceData.Xbox) {
//logger.info('[ESO:服务器状态] sendStatus Xbox平台信息:', maintenanceData.Xbox);
        if (Array.isArray(maintenanceData.Xbox)) {
          maintenanceInfo.push(...maintenanceData.Xbox);
        } else {
          maintenanceInfo.push(maintenanceData.Xbox);
        }
      }
      if (maintenanceData.PlayStation) {
//logger.info('[ESO:服务器状态] sendStatus PlayStation平台信息:', maintenanceData.PlayStation);
        if (Array.isArray(maintenanceData.PlayStation)) {
          maintenanceInfo.push(...maintenanceData.PlayStation);
        } else {
          maintenanceInfo.push(maintenanceData.PlayStation);
        }
      }
//logger.info('[ESO:服务器状态] sendStatus 最终maintenanceInfo数组:', JSON.stringify(maintenanceInfo, null, 2));
    } catch (error) {
//logger.error('[ESO:服务器状态] 处理维护信息失败:', error);
//logger.error('[ESO:服务器状态] 错误堆栈:', error.stack);
    }

    serverData.serverData[1].msg = []
    let msgIndex = 0
    
    // 首先添加维护信息
    for (let maintenanceMsg of maintenanceInfo) {
      serverData.serverData[1].msg[msgIndex] = maintenanceMsg
      msgIndex = msgIndex + 1
    }
    
    // 然后添加原有的服务器状态信息
    let tmpMsg = status.msg
    let srcMsgs = tmpMsg.split('\n').filter(line => line.trim() !== '').map(line => line.replace(/\t/g, ''));
    for (let oneMsg of srcMsgs) {
      serverData.serverData[1].msg[msgIndex] = oneMsg
      msgIndex = msgIndex + 1
    }
//logger.info('[ESO:服务器状态] sendStatus 准备生成服务器状态信息');
//logger.info(`[ESO:服务器状态] sendStatus 当前status对象状态:`);
//logger.info(JSON.stringify({
//        pcNA: status.pcNA,
//        pcEU: status.pcEU,
//        pcPTS: status.pcPTS,
//        xbNA: status.xbNA,
//        xbEU: status.xbEU,
//        psNA: status.psNA,
//        psEU: status.psEU
//    }, null, 2));
    
    serverData.serverData[1].servers = []
//logger.info('[ESO:服务器状态] sendStatus 开始生成服务器显示信息');
    for (let server of serverList) {
    	let oneServer = {
    		name: `PC-NA`,
    		status: `Online`,
    		color: `rgb(58, 146, 254)`
    	};
    	oneServer.name = server[1]
    	if(status[server[0]] == 0)
    	{
    		oneServer.status = `Offline`
    		oneServer.color = `rgb(254, 0, 0)`
    	}
    	else
    	{
    		oneServer.status = `Online`
    		oneServer.color = `rgb(19, 217, 98)`
    	}
        serverData.serverData[1].servers.push(oneServer);
//logger.info(`[ESO:服务器状态] sendStatus 服务器 ${oneServer.name} (${server[0]}): 状态=${oneServer.status}, 颜色=${oneServer.color}, 原始值=${status[server[0]]}`);
    }

//logger.info('[ESO:服务器状态] sendStatus 最终生成的服务器列表:');
//logger.info(JSON.stringify(serverData.serverData[1].servers, null, 2));
//logger.info('[ESO:服务器状态] sendStatus 最终生成的完整serverData:');
//logger.info(JSON.stringify({
//        msg: serverData.serverData[1].msg,
//        servers: serverData.serverData[1].servers
//    }, null, 2));
    
	let img = await this.cache(serverData, serverImg)
//logger.info('[ESO:服务器状态] sendStatus 图片生成完成，准备发送回复');
    await this.e.reply(img)
  }

  async getESOStatus (e) {
  	//判断是否需要更新服务器状态变量并执行
    let now = moment(new Date().getTime()).format('YYYY'+'-'+'MM'+'-'+'DD'+'_'+'HH'+':'+'mm').replace(/是0/g, "是").replace(/点0/g, "点")
    if(now != status.time)
    {
    	await this.updateESOStatus()
    	status.time = now
    	await this.checkStatusChange(e)
    	lastStatus.time = status.time
      if(status.pcNA != 1){lastStatus.pcNA = 0}else{lastStatus.pcNA = 1}
      if(status.pcEU != 1){lastStatus.pcEU = 0}else{lastStatus.pcEU = 1}
      if(status.pcPTS != 1){lastStatus.pcPTS = 0}else{lastStatus.pcPTS = 1}
      if(status.xbNA != 1){lastStatus.xbNA = 0}else{lastStatus.xbNA = 1}
      if(status.xbEU != 1){lastStatus.xbEU = 0}else{lastStatus.xbEU = 1}
      if(status.psNA != 1){lastStatus.psNA = 0}else{lastStatus.psNA = 1}
      if(status.psEU != 1){lastStatus.psEU = 0}else{lastStatus.psEU = 1}
      lastStatus.msg = []
      lastStatus.msg += status.msg
    }
  }

  /**
   * @更新服务器状态
   */
  async updateESOStatus (e) {
//logger.info('[ESO:服务器状态] updateESOStatus 开始更新服务器状态');
  	const maintenanceMessage = await fetchMaintenanceMessage()
//logger.info('[ESO:服务器状态] updateESOStatus 获取到的维护消息:', maintenanceMessage);
    
    if (maintenanceMessage) {
      status.msg = maintenanceMessage
//logger.info('[ESO:服务器状态] updateESOStatus 已将维护消息写入status.msg');
    } else if (!status.msg || status.msg.length === 0) {
      status.msg = 'Maintenance information unavailable'
//logger.warn('[ESO:服务器状态] updateESOStatus 未获取到维护消息，使用默认值');
    } else {
//logger.info('[ESO:服务器状态] updateESOStatus 未获取到维护消息，保留原有status.msg:', status.msg);
    }

//logger.info('[ESO:服务器状态] updateESOStatus 当前status.msg值:', status.msg);
    
//logger.info('[ESO:服务器状态] updateESOStatus 更新前的服务器状态:');
//logger.info(JSON.stringify({
//        pcNA: status.pcNA,
//        pcEU: status.pcEU,
//        pcPTS: status.pcPTS,
//        xbNA: status.xbNA,
//        xbEU: status.xbEU,
//        psNA: status.psNA,
//        psEU: status.psEU
//    }, null, 2));
    
    const serverStatusData = await fetchServerStatusRaw()
    
    if (serverStatusData) {
//logger.info('[ESO:服务器状态] updateESOStatus 服务器状态数据获取成功');
        if (serverStatusData.serverStatusResults && serverStatusData.serverStatusResults.length > 0) {
//logger.info(`[ESO:服务器状态] updateESOStatus 共更新了 ${serverStatusData.serverStatusResults.length} 个服务器状态`);
            const changedServers = serverStatusData.serverStatusResults.filter(s => s.changed);
            if (changedServers.length > 0) {
//logger.info(`[ESO:服务器状态] updateESOStatus 状态发生变更的服务器数量: ${changedServers.length}`);
                changedServers.forEach(server => {
//logger.info(`[ESO:服务器状态] updateESOStatus 服务器 ${server.displayName} (${server.key}) 状态变更: ${server.oldValue} -> ${server.statusValue}`);
                });
            } else {
//logger.info('[ESO:服务器状态] updateESOStatus 所有服务器状态均无变更');
            }
        }
    } else {
//logger.warn('[ESO:服务器状态] updateESOStatus 服务器状态数据获取失败');
    }
    
//logger.info('[ESO:服务器状态] updateESOStatus 更新后的服务器状态:');
//logger.info(JSON.stringify({
//        pcNA: status.pcNA,
//        pcEU: status.pcEU,
//        pcPTS: status.pcPTS,
//        xbNA: status.xbNA,
//        xbEU: status.xbEU,
//        psNA: status.psNA,
//        psEU: status.psEU
//    }, null, 2));
    
//logger.info('[ESO:服务器状态] updateESOStatus 更新完成');
  }


  /**
   * @判断服务器状态变更
   */
  async checkStatusChange (e) {
    let message = [{ type: 'at', qq: 'all', text: '@全体成员' },{ type: 'text', text: '美服维护了！' }]
    
    if(lastStatus.time != '2023-01-01_00:00')
    {
      if((lastStatus.pcNA == 1) && (status.pcNA == 0))//美服进入维护
      {
//logger.info('美服维护了！')
        if (!isInCooldown('pcNA_maintenance')) {
          message = [{ type: 'at', qq: 'all', text: '@全体成员' },{ type: 'text', text: '美服维护了！' }]
          await this.e.reply(message, false, { recallMsg: -1 })
          updateNotifyTime('pcNA_maintenance')
        }
      }
      if((lastStatus.pcNA == 0) && (status.pcNA == 1))//美服完成维护
      {
//logger.info('美服开服了！')
        if (!isInCooldown('pcNA_online')) {
          message = [{ type: 'at', qq: 'all', text: '@全体成员' },{ type: 'text', text: '美服开服了！' }]
          await this.e.reply(message, false, { recallMsg: -1 })
          updateNotifyTime('pcNA_online')
        }
      }
      if((lastStatus.pcEU == 1) && (status.pcEU == 0))//欧服进入维护
      {
//logger.info('欧服维护了！')
        if (!isInCooldown('pcEU_maintenance')) {
          message = [{ type: 'at', qq: 'all', text: '@全体成员' },{ type: 'text', text: '欧服维护了！' }]
          await this.e.reply(message, false, { recallMsg: -1 })
          updateNotifyTime('pcEU_maintenance')
        }
      }
      if((lastStatus.pcEU == 0) && (status.pcEU == 1))//欧服完成维护
      {
//logger.info('欧服开服了！')
        if (!isInCooldown('pcEU_online')) {
          message = [{ type: 'at', qq: 'all', text: '@全体成员' },{ type: 'text', text: '欧服开服了！' }]
          await this.e.reply(message, false, { recallMsg: -1 })
          updateNotifyTime('pcEU_online')
        }
      }
    }
  }
  async cache (data) {
    let tmp = md5(JSON.stringify(data))
    if (serverImg.md5 == tmp) return serverImg.img

    //serverImg.img = 0
    serverImg.img = await puppeteer.screenshot('serverStatus', data) /*html file saved in folder data/html/eso/ */
    serverImg.md5 = tmp

    return serverImg.img
  }
}
