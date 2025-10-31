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

// 辅助函数：将EDT时间转换为北京时间
function convertEDTtoBeijing(time, ampm) {
  let [hours, minutes] = time.split(':').map(Number);
  
  // 转换为24小时制
  if (ampm === 'PM' && hours !== 12) {
    hours += 12;
  } else if (ampm === 'AM' && hours === 12) {
    hours = 0;
  }
  
  // EDT比北京时间慢12小时，所以加12小时
  hours += 12;
  
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
        const singleTimeRegex = /(\d{1,2}:\d{2})\s*(AM|PM)\s*EDT/i;
        const singleTimeMatch = line.match(singleTimeRegex);
        
        if (singleTimeMatch) {
            const maintenanceDateMatch = line.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/);
            const maintenanceMonth = maintenanceDateMatch ? getMonthName(maintenanceDateMatch[1]) : '';
            const maintenanceDay = maintenanceDateMatch ? maintenanceDateMatch[2] : '';
            
            const localTime = convertEDTtoBeijing(singleTimeMatch[1], singleTimeMatch[2]);
            return ` 北京时间${maintenanceMonth}${maintenanceDay}日 ${localTime}`;
        }
        
        return '';
    },

    parseTimeMatch(timeMatch, isEdtFirst, line) {
        const startDateMatch = line.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/);
        const startMonth = startDateMatch ? getMonthName(startDateMatch[1]) : '';
        const startDay = startDateMatch ? startDateMatch[2] : '';

        let startLocalTime, endLocalTime, startUTC, endUTC;
        let endMonth = startMonth;
        let endDay = startDay;
        
        if (isEdtFirst) {
            startLocalTime = convertEDTtoBeijing(timeMatch[1], timeMatch[2]);
            endLocalTime = convertEDTtoBeijing(timeMatch[4], timeMatch[5]);
            startUTC = timeMatch[3];
            endUTC = timeMatch[6];
        } else {
            startLocalTime = convertEDTtoBeijing(timeMatch[2], timeMatch[3]);
            startUTC = timeMatch[1];
            
            if (timeMatch[4] && timeMatch[5]) {
                endMonth = getMonthName(timeMatch[4]);
                endDay = timeMatch[5];
                endLocalTime = convertEDTtoBeijing(timeMatch[7], timeMatch[8]);
                endUTC = timeMatch[6];
            } else {
                endLocalTime = convertEDTtoBeijing(timeMatch[7], timeMatch[8]);
                endUTC = timeMatch[6];
            }
        }

        
        if (endMonth !== startMonth || endDay !== startDay) {
            return ` 北京时间${startMonth}${startDay}日 ${startLocalTime} (${startUTC} UTC) - ${endMonth}${endDay}日 ${endLocalTime} (${endUTC} UTC)`;
        } else {
            return ` 北京时间${startMonth}${startDay}日 ${startLocalTime} (${startUTC} UTC) - ${endLocalTime} (${endUTC} UTC)`;
        }
    },

    parseMaintenanceTime(line) {
        if (line.includes('No maintenance')) {
            return '';
        }

        const edtFirstRegex = /(\d{1,2}:\d{2})\s*(AM|PM)\s*EDT\s*\((\d{1,2}:\d{2})\s*UTC\)\s*-\s*(\d{1,2}:\d{2})\s*(AM|PM)\s*EDT\s*\((\d{1,2}:\d{2})\s*UTC\)/i;
        const utcFirstRegex = /(\d{1,2}:\d{2})\s*UTC\s*\((\d{1,2}:\d{2})\s*(AM|PM)\s*EDT\)\s*-\s*(?:(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+)?(\d{1,2}:\d{2})\s*UTC\s*\((\d{1,2}:\d{2})\s*(AM|PM)\s*EDT\)/i;
        
        let timeMatch = line.match(edtFirstRegex);
        let isEdtFirst = true;
        
        if (!timeMatch) {
            timeMatch = line.match(utcFirstRegex);
            isEdtFirst = false;
        }

        if (timeMatch) {
            return this.parseTimeMatch(timeMatch, isEdtFirst, line);
        } else {
            return this.parseSingleTime(line);
        }
    },

    parseMaintenanceLine(line) {
        const status = this.getMaintenanceStatus(line);
        const platformInfo = this.getPlatformInfo(line);
        
        if (!platformInfo.isValid) return null;

        const serverRegion = this.getServerRegion(line);
        const maintenanceType = this.getMaintenanceType(line);
        const translatedTime = this.parseMaintenanceTime(line);

        return {
            status,
            platform: platformInfo.platform,
            isPlatformSpecific: platformInfo.isPlatformSpecific,
            serverRegion,
            maintenanceType,
            translatedTime
        };
    },

    assignToPlatform(finalLines, maintenanceInfo, line) {
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
        const lineObject = {
            text: newLine,
            color: statusColor
        };
        
        if (isPlatformSpecific) {
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
            } else if (line.includes('Xbox')) {
                if (!finalLines["Xbox"]) finalLines["Xbox"] = [];
                finalLines["Xbox"].push(lineObject);
            } else if (line.includes('PlayStation')) {
                if (!finalLines["PlayStation"]) finalLines["PlayStation"] = [];
                finalLines["PlayStation"].push(lineObject);
            }
        } else {
            if (!finalLines["PC"]) finalLines["PC"] = [];
            finalLines["PC"].push(lineObject);
        }
    }
};

function normalizeMaintenanceMessage(htmlContent) {
    if (!htmlContent) {
        return '';
    }

    const $ = cheerio.load(`<div>${htmlContent}</div>`);
    const text = $.text()
        .replace(/\r/g, '')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');

    return text;
}

async function fetchMaintenanceMessage() {
    const url = 'https://forums.elderscrollsonline.com/en/categories/official-news';

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': DEFAULT_USER_AGENT
            }
        });

        if (!response || !response.ok) {
            logger.warn(`[ESO:服务器状态] 获取维护公告失败，状态码: ${response ? response.status : '未知'}`);
            return '';
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const dismissMessage = $('.DismissMessage');

        if (!dismissMessage || dismissMessage.length === 0) {
            logger.warn('[ESO:服务器状态] 未能在官方论坛页面找到维护公告内容');
            return '';
        }

        const normalized = normalizeMaintenanceMessage(dismissMessage.html());
        return normalized;
    } catch (error) {
        logger.error('[ESO:服务器状态] 拉取维护公告时出现异常:', error);
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
            logger.warn(`[ESO:服务器状态] 获取服务器状态失败，状态码: ${response ? response.status : '未知'}`);
            return null;
        }

        const raw = await response.text();
        //logger.info(`[ESO:服务器状态] 服务器状态原始数据: ${raw}`);
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
                status[key] = statusValue;
            } else {
                logger.info(`[ESO:服务器状态] 未识别的服务器条目: ${titleText}`);
            }
        });

        const lastUpdatedText = $('.uespEsoServerUpdated').text().replace('Last Updated', '').replace(':', '').trim();

        return {
            raw,
            lastUpdated: lastUpdatedText,
            displayNames: displayNameMap
        };
    } catch (error) {
        logger.error('[ESO:服务器状态] 拉取服务器状态数据时出现异常:', error);
        return null;
    }
}

// 维护信息处理函数
function processMaintenanceInfo(maintenanceMessage) {
    const lines = maintenanceMessage.trim().split('\n').filter(line => line.trim() !== '');
    const finalLines = {};
    const currentYear = new Date().getFullYear();

    const firstLine = lines[0];
    const dateMatch = firstLine.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/);
    if (dateMatch) {
        const monthName = dateMatch[1];
        const day = dateMatch[2];
        const monthNumber = getMonthNumber(monthName);
        finalLines["header"] = {
            text: `${currentYear}-${monthNumber}-${day} 当周服务器维护信息`,
            color: 'rgb(58, 146, 254)' // 蓝色标题
        };
    }

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const maintenanceInfo = parseMaintenanceFunctions.parseMaintenanceLine(line);
        if (!maintenanceInfo) continue;

        parseMaintenanceFunctions.assignToPlatform(finalLines, maintenanceInfo, line);
    }
    
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
        	logger.error('[ESO:服务器状态] 初始化结构体失败')
            return
        }
        serverData = ssData
    }

    // 处理维护信息
    let maintenanceInfo = [];
    try {
      const maintenanceData = processMaintenanceInfo(status.msg);
      if (maintenanceData.header) {
        maintenanceInfo.push(maintenanceData.header);
      }
      if (maintenanceData.PC) {
        if (Array.isArray(maintenanceData.PC)) {
          maintenanceInfo.push(...maintenanceData.PC);
        } else {
          maintenanceInfo.push(maintenanceData.PC);
        }
      }
      if (maintenanceData.Mac) {
        if (Array.isArray(maintenanceData.Mac)) {
          maintenanceInfo.push(...maintenanceData.Mac);
        } else {
          maintenanceInfo.push(maintenanceData.Mac);
        }
      }
      if (maintenanceData.Xbox) {
        if (Array.isArray(maintenanceData.Xbox)) {
          maintenanceInfo.push(...maintenanceData.Xbox);
        } else {
          maintenanceInfo.push(maintenanceData.Xbox);
        }
      }
      if (maintenanceData.PlayStation) {
        if (Array.isArray(maintenanceData.PlayStation)) {
          maintenanceInfo.push(...maintenanceData.PlayStation);
        } else {
          maintenanceInfo.push(maintenanceData.PlayStation);
        }
      }
    } catch (error) {
      logger.error('[ESO:服务器状态] 处理维护信息失败:', error);
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
    //logger.info(serverData.serverData[1].msg)
    serverData.serverData[1].servers = []
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
    }

    //logger.info(serverData.serverData[0])
    //logger.info(serverData.serverData[1])
	let img = await this.cache(serverData, serverImg)
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
  	const maintenanceMessage = await fetchMaintenanceMessage()
    if (maintenanceMessage) {
      status.msg = maintenanceMessage
    } else if (!status.msg || status.msg.length === 0) {
      status.msg = 'Maintenance information unavailable'
    }

    await fetchServerStatusRaw()
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
        logger.info('美服维护了！')
        if (!isInCooldown('pcNA_maintenance')) {
          message = [{ type: 'at', qq: 'all', text: '@全体成员' },{ type: 'text', text: '美服维护了！' }]
          await this.e.reply(message, false, { recallMsg: -1 })
          updateNotifyTime('pcNA_maintenance')
        }
      }
      if((lastStatus.pcNA == 0) && (status.pcNA == 1))//美服完成维护
      {
        logger.info('美服开服了！')
        if (!isInCooldown('pcNA_online')) {
          message = [{ type: 'at', qq: 'all', text: '@全体成员' },{ type: 'text', text: '美服开服了！' }]
          await this.e.reply(message, false, { recallMsg: -1 })
          updateNotifyTime('pcNA_online')
        }
      }
      if((lastStatus.pcEU == 1) && (status.pcEU == 0))//欧服进入维护
      {
        logger.info('欧服维护了！')
        if (!isInCooldown('pcEU_maintenance')) {
          message = [{ type: 'at', qq: 'all', text: '@全体成员' },{ type: 'text', text: '欧服维护了！' }]
          await this.e.reply(message, false, { recallMsg: -1 })
          updateNotifyTime('pcEU_maintenance')
        }
      }
      if((lastStatus.pcEU == 0) && (status.pcEU == 1))//欧服完成维护
      {
        logger.info('欧服开服了！')
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
