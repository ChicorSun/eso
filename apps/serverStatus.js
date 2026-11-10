import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import fetch from 'node-fetch'
import moment from 'moment'
import ServerStatus from '../model/serverstatus.js'
import md5 from 'md5'
import * as cheerio from 'cheerio'
import fs from 'fs'
import path from 'path'

const CUSTOME_RESOURCES_ROOT = path.join(process.cwd(), 'data', 'eso', 'custome_resources')
const SERVER_NOTIFY_CONFIG_PATH = path.join(CUSTOME_RESOURCES_ROOT, 'config/serverList.json')

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const OFFICIAL_HELP_USER_AGENT = 'Mozilla/5.0'
const FETCH_TIMEOUT_MS = 8 * 1000
const FORCE_OFFICIAL_STATUS_FALLBACK = process.env.ESO_STATUS_FORCE_OFFICIAL_FALLBACK === '1'

const UESP_SERVER_STATUS_URL = 'https://esolog.uesp.net/getEsoServerStatus.php'
const OFFICIAL_MAINTENANCE_API = 'https://forums.elderscrollsonline.com/api/v2/discussions?categoryID=180&limit=5&sort=-dateInserted'
const OFFICIAL_SERVICE_ALERTS_URL = 'https://help.elderscrollsonline.com/app/answers/detail/a_id/4320'
const MAINTENANCE_MAX_AGE_DAYS = 45

let maintenanceArticle = null
let statusSource = 'unknown'

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchOfficialWithRetry(url, options = {}, attempts = 3) {
  const retryableStatuses = new Set([401, 403, 408, 425, 429, 500, 502, 503, 504])
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, options)
      if (response.ok || !retryableStatuses.has(response.status) || attempt === attempts) {
        return response
      }
    } catch (error) {
      lastError = error
      if (attempt === attempts) throw error
    }
    await new Promise(resolve => setTimeout(resolve, 600 * attempt))
  }
  throw lastError || new Error('官方接口请求失败')
}

function syncLastStatusFromCurrent() {
  lastStatus.time = status.time
  for (const [serverKey] of serverList) {
    lastStatus[serverKey] = status[serverKey] === 0 || status[serverKey] === 1
      ? status[serverKey]
      : -1
  }
}

function ensureConfigDir(filePath) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

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

function htmlFragmentToParagraphs(html) {
    const $ = cheerio.load(`<div id="maintenance-root">${String(html || '')}</div>`);
    $('#maintenance-root br').replaceWith('\n');
    return $('#maintenance-root')
        .text()
        .replace(/\u00a0/g, ' ')
        .replace(/\r/g, '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
}

function formatUtcTime(value) {
    if (!value) return '';
    const time = moment(value);
    return time.isValid() ? time.utc().format('YYYY-MM-DD HH:mm [UTC]') : '';
}

function isRecentMaintenance(value) {
    const time = moment(value);
    return time.isValid() && moment().diff(time, 'days') <= MAINTENANCE_MAX_AGE_DAYS;
}

async function fetchOfficialForumMaintenance() {
    const response = await fetchOfficialWithRetry(OFFICIAL_MAINTENANCE_API, {
        headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            'Accept': 'application/json'
        }
    });
    if (!response || !response.ok) {
        throw new Error(`官方论坛接口 HTTP ${response ? response.status : 'unknown'}`);
    }

    const discussions = await response.json();
    if (!Array.isArray(discussions)) throw new Error('官方论坛接口返回格式无效');

    const article = discussions.find(item =>
        item &&
        Number(item.categoryID) === 180 &&
        item.name &&
        item.body &&
        isRecentMaintenance(item.dateInserted)
    );
    if (!article) return null;

    return {
        kind: 'maintenance',
        dateInserted: article.dateInserted,
        title: String(article.name).trim(),
        paragraphs: htmlFragmentToParagraphs(article.body),
        publishedAt: formatUtcTime(article.dateInserted),
        author: article.insertUser?.name || 'ESO 官方论坛',
        sourceUrl: article.url || article.canonicalUrl || ''
    };
}

function parseServiceAlertDate(paragraphs) {
    for (const paragraph of paragraphs) {
        const match = paragraph.match(/(\d{4})\.(\d{2})\.(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*UTC/i);
        if (!match) continue;
        const time = moment.utc(
            `${match[1]}-${match[2]}-${match[3]} ${String(match[4]).padStart(2, '0')}:${match[5]}`,
            'YYYY-MM-DD HH:mm',
            true
        );
        if (time.isValid()) return time.toISOString();
    }
    return '';
}

function inferServiceAlertStatuses(paragraphs) {
    const result = {};
    for (const paragraph of paragraphs) {
        const text = paragraph.toLowerCase();
        const online = /\bavailable\b|resolved|restored/.test(text);
        const offline = /unavailable|maintenance|investigating/.test(text);
        if (!online && !offline) continue;

        const value = online ? 1 : 0;
        const platformKeys = [];
        const northAmerica = /north american/.test(text);
        const europe = /european/.test(text);
        const hasSpecificPlatform = /pc\/mac|xbox|playstation/.test(text);

        if (/pc\/mac/.test(text)) {
            if (northAmerica) platformKeys.push('pcNA');
            if (europe) platformKeys.push('pcEU');
        }
        if (/xbox/.test(text)) {
            if (northAmerica) platformKeys.push('xbNA');
            if (europe) platformKeys.push('xbEU');
        }
        if (/playstation/.test(text)) {
            if (northAmerica) platformKeys.push('psNA');
            if (europe) platformKeys.push('psEU');
        }

        if (!hasSpecificPlatform && /megaserver/.test(text)) {
            if (northAmerica) platformKeys.push('pcNA', 'xbNA', 'psNA');
            if (europe) platformKeys.push('pcEU', 'xbEU', 'psEU');
        }
        if (/\bpts\b/.test(text)) platformKeys.push('pcPTS');

        for (const key of platformKeys) {
            if (!Object.prototype.hasOwnProperty.call(result, key)) result[key] = value;
        }
    }
    return result;
}

async function fetchOfficialServiceAlerts() {
    const response = await fetchOfficialWithRetry(OFFICIAL_SERVICE_ALERTS_URL, {
        headers: {
            'User-Agent': OFFICIAL_HELP_USER_AGENT
        }
    });
    if (!response || !response.ok) {
        throw new Error(`官方 Service Alerts HTTP ${response ? response.status : 'unknown'}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const title = $('h1').filter((_, element) => $(element).text().includes('ESO Service Alerts')).first();
    if (!title.length) throw new Error('未找到 ESO Service Alerts');

    const blocks = [];
    let currentBlock = [];
    for (const element of title.nextAll().toArray()) {
        const tagName = element.tagName?.toLowerCase();
        if (tagName === 'hr') {
            if (currentBlock.length) blocks.push(currentBlock);
            currentBlock = [];
            continue;
        }
        if (tagName !== 'p') continue;
        const text = $(element).text().replace(/\u00a0/g, ' ').trim();
        if (text) currentBlock.push(text);
    }
    if (currentBlock.length) blocks.push(currentBlock);
    if (!blocks.length) throw new Error('ESO Service Alerts 暂无内容');

    const latestBlock = blocks[0];
    const publishedAt = parseServiceAlertDate(latestBlock);
    const statuses = inferServiceAlertStatuses(blocks.flat());

    return {
        article: {
            kind: 'service-alert',
            dateInserted: publishedAt,
            title: '当前 ESO 服务告警',
            paragraphs: latestBlock,
            publishedAt: formatUtcTime(publishedAt),
            author: 'ESO Support',
            sourceUrl: OFFICIAL_SERVICE_ALERTS_URL
        },
        statuses
    };
}

async function fetchForumMaintenanceSafe() {
    try {
        const article = await fetchOfficialForumMaintenance();
        if (article) return article;
        logger.warn('[ESO:服务器状态] 官方论坛没有近期维护公告');
    } catch (error) {
        logger.warn('[ESO:服务器状态] 获取官方论坛维护公告失败: ' + (error?.message || error));
    }
    return null;
}

async function fetchServiceAlertsSafe() {
    try {
        return await fetchOfficialServiceAlerts();
    } catch (error) {
        logger.warn('[ESO:服务器状态] 获取官方 Service Alerts 失败: ' + (error?.message || error));
    }
    return null;
}

async function fetchServerStatusRaw() {
    if (FORCE_OFFICIAL_STATUS_FALLBACK) {
        logger.warn('[ESO:服务器状态] 已配置强制使用官方 Service Alerts 兜底');
        return null;
    }
    try {
        const response = await fetchWithTimeout(UESP_SERVER_STATUS_URL, {
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

        if (serverStatusResults.length === 0) {
            logger.warn('[ESO:服务器状态] UESP 未返回可识别的服务器状态');
            return null;
        }

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

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseAnnouncementDate(text, referenceTime) {
    const match = String(text || '').match(
        /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/i
    );
    if (!match) return null;

    const month = MONTH_NAMES.indexOf(match[1].slice(0, 3).toLowerCase());
    const day = Number(match[2]);
    if (month < 0 || day < 1 || day > 31) return null;

    const reference = moment(referenceTime);
    let year = Number(match[3]) || (reference.isValid() ? reference.utc().year() : moment().utc().year());
    if (!match[3] && reference.isValid()) {
        const candidate = moment.utc({ year, month, day });
        const monthDistance = candidate.diff(reference.utc(), 'months', true);
        if (monthDistance > 6) year -= 1;
        if (monthDistance < -6) year += 1;
    }
    return { year, month, day };
}

function parseUtcTimes(text) {
    const times = [];
    const regex = /(?<!\d)(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*UTC/gi;
    let match;
    while ((match = regex.exec(String(text || ''))) !== null) {
        let hour = Number(match[1]);
        const minute = Number(match[2] || 0);
        const period = match[3]?.toUpperCase();
        if (period === 'AM' && hour === 12) hour = 0;
        if (period === 'PM' && hour < 12) hour += 12;
        if (hour > 23 || minute > 59) continue;
        const key = `${hour}:${minute}`;
        if (!times.some(item => item.key === key)) times.push({ hour, minute, key });
    }
    return times;
}

function parseMaintenanceWindow(article) {
    // 维护时间只以正文为准：标题可能是“new end time”等后续更新，不能参与时间段解析。
    const text = (article.paragraphs || []).join('\n');
    const date = parseAnnouncementDate(text, article.dateInserted);
    const times = parseUtcTimes(text);
    if (!date || times.length === 0) return null;

    const start = moment.utc({
        year: date.year,
        month: date.month,
        day: date.day,
        hour: times[0].hour,
        minute: times[0].minute
    });
    let end = null;
    if (times[1]) {
        end = start.clone().hour(times[1].hour).minute(times[1].minute).second(0);
        if (!end.isAfter(start)) end.add(1, 'day');
    }
    return { start, end };
}

function formatBeijingTime(value) {
    return value ? value.clone().utcOffset(8).format('MM月DD日 HH:mm') : '';
}

function buildMaintenanceScope(text) {
    const scope = [];
    const lower = String(text || '').toLowerCase();
    if (/all (?:live )?eso megaservers|all megaservers/.test(lower)) {
        scope.push('全部 ESO 大型服务器');
    } else {
        const platforms = [];
        if (/pc\/mac/.test(lower)) platforms.push('PC/Mac');
        if (/xbox/.test(lower)) platforms.push('Xbox');
        if (/playstation/.test(lower)) platforms.push('PlayStation');
        if (platforms.length) scope.push(`${platforms.join('、')} 服务器`);
    }
    if (/eso store and account system/.test(lower)) scope.push('ESO 商店及账号系统');
    if (/\bpts\b/.test(lower)) scope.push('PTS 测试服');
    return scope;
}

function translateServiceAlertLine(text) {
    const lower = String(text || '').toLowerCase();
    if (/^\d{4}\.\d{2}\.\d{2}/.test(lower)) return '';

    let target = '';
    if (/eso store and account system/.test(lower)) {
        target = 'ESO 商店及账号系统';
    } else if (/\bpts\b/.test(lower)) {
        target = 'PTS 测试服';
    } else {
        const regions = [];
        if (/north american/.test(lower)) regions.push('北美');
        if (/european/.test(lower)) regions.push('欧洲');
        let platform = '';
        if (/pc\/mac/.test(lower)) platform = ' PC/Mac';
        else if (/xbox/.test(lower)) platform = ' Xbox';
        else if (/playstation/.test(lower)) platform = ' PlayStation';
        if (regions.length) target = `${regions.join('和')}${platform}大型服务器`;
    }
    if (!target) return text;

    let state = '';
    if (/resolved|restored/.test(lower)) state = '相关问题已解决';
    else if (/\bavailable\b/.test(lower)) state = '当前可用';
    else if (/unavailable/.test(lower)) state = '当前不可用，正在维护';
    else if (/maintenance/.test(lower)) state = '正在维护';
    else if (/investigating/.test(lower)) state = '正在调查问题';
    return state ? `${target}${state}` : text;
}

function buildChineseMaintenanceSummary(article) {
    if (!article) return [];
    if (article.kind === 'service-alert') {
        const lines = [];
        const alertTime = moment(article.dateInserted);
        if (alertTime.isValid()) lines.push(`公告时间：北京时间 ${formatBeijingTime(alertTime)}`);
        for (const paragraph of article.paragraphs || []) {
            const translated = translateServiceAlertLine(paragraph);
            if (translated && !lines.includes(translated)) lines.push(translated);
        }
        return lines;
    }

    const text = (article.paragraphs || []).join('\n');
    const lower = text.toLowerCase();
    if (/no maintenance/.test(lower)) return ['维护安排：本周无需维护'];

    const summary = [];
    const window = parseMaintenanceWindow(article);
    if (window) {
        summary.push(window.end
            ? `维护时间：北京时间 ${formatBeijingTime(window.start)} 至 ${formatBeijingTime(window.end)}`
            : `维护时间：北京时间 ${formatBeijingTime(window.start)}`);

        const now = moment.utc();
        if (now.isBefore(window.start)) summary.push('当前状态：尚未开始');
        else if (window.end && now.isAfter(window.end)) summary.push('当前状态：已结束');
        else summary.push('当前状态：维护进行中（按公告时间推算）');
    }

    const scope = buildMaintenanceScope(text);
    if (scope.length) summary.push(`影响范围：${scope.join('、')}`);

    if (/backend datacenter fixes and updates/.test(lower)) {
        summary.push('维护内容：季度后端数据中心修复与更新');
    } else if (/patch|update/.test(lower)) {
        summary.push('维护内容：版本更新');
    } else if (/maintenance/.test(lower)) {
        summary.push('维护内容：服务器维护');
    }
    return summary;
}

function buildFallbackMaintenancePlatformLines(article) {
    const text = (article.paragraphs || []).join('\n');
    const lower = text.toLowerCase();
    const window = parseMaintenanceWindow(article);
    if (!window) return [];

    const platforms = [];
    if (/all (?:live )?eso megaservers|all megaservers/.test(lower)) {
        platforms.push('PC', 'Mac', 'Xbox', 'PlayStation');
    } else {
        if (/pc\/mac/.test(lower)) platforms.push('PC', 'Mac');
        else {
            if (/\bpc\b/.test(lower)) platforms.push('PC');
            if (/\bmac\b/.test(lower)) platforms.push('Mac');
        }
        if (/xbox/.test(lower)) platforms.push('Xbox');
        if (/playstation/.test(lower)) platforms.push('PlayStation');
    }
    if (/\bpts\b/.test(lower)) platforms.push('PTS');
    if (platforms.length === 0) return [];

    const hasNA = /north american/.test(lower);
    const hasEU = /european/.test(lower);
    const region = hasNA && hasEU
        ? '美服和欧服'
        : hasNA
            ? '美服'
            : hasEU
                ? '欧服'
                : /all (?:live )?eso megaservers|all megaservers/.test(lower)
                    ? '美服和欧服'
                    : '';

    const now = moment.utc();
    let status = '[待更新]';
    let color = 'rgb(255, 165, 0)';
    if (window.end && now.isAfter(window.end)) {
        status = '[已结束]';
        color = 'rgb(19, 217, 98)';
    } else if (!now.isBefore(window.start)) {
        status = '[维护中]';
        color = 'rgb(255, 105, 180)';
    }

    const timeText = window.end
        ? `北京时间${formatBeijingTime(window.start)} 至 ${formatBeijingTime(window.end)}`
        : `北京时间${formatBeijingTime(window.start)}`;
    const lines = platforms.map(platform => ({
        text: `${status} ${platform}：${region}维护 - ${timeText}`,
        color
    }));

    if (/eso store and account system/.test(lower)) {
        lines.push({
            text: `${status} ESO 商店及账号系统：${status === '[已结束]' ? '维护已结束' : '维护'}`,
            color
        });
    }
    return lines;
}

function buildMaintenanceInfo(article) {
    if (!article) {
        return ['Maintenance information unavailable'];
    }

    const rawText = (article.paragraphs || []).join('\n').trim();
    let parsed = {};
    try {
        parsed = processMaintenanceInfo(rawText);
    } catch (error) {
        logger.warn('[ESO:服务器状态] 解析维护信息失败: ' + (error?.message || error));
    }

    const lines = [];
    if (parsed.header) lines.push(parsed.header);
    const hasParsedPlatformLines = ['PC', 'Mac', 'Xbox', 'PlayStation']
        .some(platform => parsed[platform]);
    for (const platform of ['PC', 'Mac', 'Xbox', 'PlayStation']) {
        const platformLines = parsed[platform];
        if (Array.isArray(platformLines)) lines.push(...platformLines);
        else if (platformLines) lines.push(platformLines);
    }
    if (!hasParsedPlatformLines) {
        lines.push(...buildFallbackMaintenancePlatformLines(article));
    }

    const rawLines = rawText
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(line => line.replace(/\t/g, ''));
    lines.push(...rawLines);
    return lines;
}

function buildDataSourceLabel() {
    const sources = [];
    if (statusSource === 'uesp') sources.push('UESP');
    else if (statusSource === 'official') sources.push('ESO Service Alerts');
    else sources.push('服务器状态不可用');

    if (maintenanceArticle?.kind === 'maintenance') sources.push('ESO 官方论坛');
    else if (maintenanceArticle?.kind === 'service-alert') sources.push('ESO Service Alerts');
    else sources.push('维护公告不可用');

    return [...new Set(sources)].join(' + ');
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

const SERVER_NOTIFY_KEYS = serverList.map(item => item[0])
const DEFAULT_SERVER_NOTIFY_MASK = '1100000'
let serverNotifyMask = DEFAULT_SERVER_NOTIFY_MASK
let serverNotifyMap = new Map()

function normalizeNotifyMask(rawMask) {
  const raw = String(rawMask ?? '').trim()
  if (!/^\d+$/.test(raw)) return null
  if (raw === '0') return '0000000'
  if (raw.length > SERVER_NOTIFY_KEYS.length) return null
  if (raw.length === SERVER_NOTIFY_KEYS.length) return raw
  // 兼容用户示例：6位按左对齐补尾0
  if (raw.length === 6) return raw + '0'
  // 兼容用户示例：10000 表示 pcPTS
  if (raw.length === 5 && raw === '10000') return '0010000'
  return raw.padStart(SERVER_NOTIFY_KEYS.length, '0')
}

function applyNotifyMask(mask) {
  serverNotifyMask = mask
  serverNotifyMap = new Map()
  SERVER_NOTIFY_KEYS.forEach((key, idx) => {
    serverNotifyMap.set(key, mask[idx] === '1')
  })
}

function saveServerNotifyMask() {
  try {
    ensureConfigDir(SERVER_NOTIFY_CONFIG_PATH)
    fs.writeFileSync(SERVER_NOTIFY_CONFIG_PATH, JSON.stringify({ notify: serverNotifyMask }, null, 2), 'utf8')
  } catch (err) {
    logger.error('[ESO:服务器状态] 保存服务器通知配置失败: ' + (err?.message || err))
  }
}

function loadServerNotifyMask() {
  try {
    ensureConfigDir(SERVER_NOTIFY_CONFIG_PATH)
    if (!fs.existsSync(SERVER_NOTIFY_CONFIG_PATH)) {
      applyNotifyMask(DEFAULT_SERVER_NOTIFY_MASK)
      saveServerNotifyMask()
      return
    }
    const data = JSON.parse(fs.readFileSync(SERVER_NOTIFY_CONFIG_PATH, 'utf8'))
    const normalized = normalizeNotifyMask(data?.notify)
    if (!normalized) {
      applyNotifyMask(DEFAULT_SERVER_NOTIFY_MASK)
      saveServerNotifyMask()
      return
    }
    applyNotifyMask(normalized)
  } catch (_) {
    applyNotifyMask(DEFAULT_SERVER_NOTIFY_MASK)
    saveServerNotifyMask()
  }
}

function isServerNotifyEnabled(serverKey) {
  return serverNotifyMap.get(serverKey) === true
}

function buildNotifySummary() {
  const enabled = serverList.filter(item => isServerNotifyEnabled(item[0])).map(item => item[1])
  if (enabled.length === 0) return '当前未开启任何服务器通知'
  return `当前开启通知：${enabled.join('、')}`
}

loadServerNotifyMask()

//服务器状态
let status = {
  time: '2023-01-01_00:00',
  pcNA: -1,
  pcEU: -1,
  pcPTS: -1,
  xbNA: -1,
  xbEU: -1,
  psNA: -1,
  psEU: -1,
}

let lastStatus = {
  time: '2023-01-01_00:00',
  pcNA: -1,
  pcEU: -1,
  pcPTS: -1,
  xbNA: -1,
  xbEU: -1,
  psNA: -1,
  psEU: -1,
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
        },
        {
          reg: '^#*服务器通知\\s*(\\d+)$',
          fnc: 'setServerNotify'
        },
        {
          reg: '^#*服务器通知$',
          fnc: 'showServerNotify'
        }
      ]
    })
    
    // 初始化定时器ID
    this.checkInterval = null
  }

  /**
   * 启动自动检查，每分钟从 UESP 获取一次服务器状态
   * @private
   */
  async startAutoCheck(e) {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    const intervalMs = 1 * 60 * 1000
    this.checkInterval = setInterval(async () => {
      await this.getESOStatus(this.e)
    }, intervalMs)
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

    serverData.serverData[1].msg = buildMaintenanceInfo(maintenanceArticle)
    serverData.serverData[1].dataSource = buildDataSourceLabel()
    serverData.serverData[1].announcementPublishedAt = maintenanceArticle?.publishedAt || '未知'
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
        if (status[server[0]] == 0) {
            oneServer.status = `Offline`
            oneServer.color = `rgb(254, 0, 0)`
        } else if (status[server[0]] == 1) {
            oneServer.status = `Online`
            oneServer.color = `rgb(19, 217, 98)`
        } else {
            oneServer.status = `Unknown`
            oneServer.color = `rgb(255, 165, 0)`
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

  async setServerNotify(e) {
    if (!e.member.is_owner && !e.member.is_admin) return e.reply('请联系管理员才能设置服务器通知', true)
    const value = e.msg.replace(/^#*服务器通知\s*/, '').trim()
    if (!/^\d+$/.test(value)) {
      await e.reply('服务器通知配置无效，只允许输入数字。')
      return true
    }
    if (value !== '0' && !/^[01]+$/.test(value)) {
      await e.reply('服务器通知配置无效，只允许使用0和1。')
      return true
    }
    const normalized = normalizeNotifyMask(value)
    if (!normalized) {
      await e.reply(`服务器通知配置无效，请输入0或最多${SERVER_NOTIFY_KEYS.length}位01串。`)
      return true
    }
    applyNotifyMask(normalized)
    saveServerNotifyMask()
    const serverOrder = serverList.map(item => item[1]).join('、')
    await e.reply([
      `服务器通知设置成功：${value}`,
      `实际应用掩码：${serverNotifyMask}`,
      `服务器顺序：${serverOrder}`,
      buildNotifySummary()
    ].join('\n'))
    return true
  }

  async showServerNotify(e) {
    const serverOrder = serverList.map(item => item[1]).join('、')
    await e.reply([
      `当前服务器通知掩码：${serverNotifyMask}`,
      `服务器顺序：${serverOrder}`,
      buildNotifySummary()
    ].join('\n'))
    return true
  }

  async getESOStatus (e) {
    const now = moment().format('YYYY-MM-DD_HH:mm')
    if (now !== status.time) {
      const updated = await this.updateESOStatus()
      status.time = now
      if (!updated) return
      await this.checkStatusChange(e)
      syncLastStatusFromCurrent()
    }
  }

  /**
   * 使用 UESP 和 ESO 官方来源更新；UESP 不可用时由官方 Service Alerts 兜底
   */
  async updateESOStatus() {
    const [serverStatusData, forumArticle] = await Promise.all([
      fetchServerStatusRaw(),
      fetchForumMaintenanceSafe()
    ])
    const serviceAlerts = !serverStatusData || !forumArticle
      ? await fetchServiceAlertsSafe()
      : null
    maintenanceArticle = forumArticle || serviceAlerts?.article || null

    if (serverStatusData) {
      statusSource = 'uesp'
      return true
    }

    for (const [serverKey] of serverList) status[serverKey] = -1
    const fallbackStatuses = serviceAlerts?.statuses || {}
    let fallbackCount = 0
    for (const [serverKey, value] of Object.entries(fallbackStatuses)) {
      if (!Object.prototype.hasOwnProperty.call(status, serverKey)) continue
      if (value !== 0 && value !== 1) continue
      status[serverKey] = value
      fallbackCount += 1
    }

    statusSource = fallbackCount > 0 ? 'official' : 'unknown'
    if (fallbackCount === 0) {
      logger.warn('[ESO:服务器状态] UESP 与官方 Service Alerts 均未能提供服务器状态')
      return false
    }

    logger.warn(`[ESO:服务器状态] UESP 不可用，已从官方 Service Alerts 恢复 ${fallbackCount} 个状态`)
    return true
  }


  /**
   * @判断服务器状态变更
   */
  async checkStatusChange (e) {
    if (lastStatus.time === '2023-01-01_00:00') return

    for (const [serverKey, serverName] of serverList) {
      if (!isServerNotifyEnabled(serverKey)) continue
      const before = lastStatus[serverKey]
      const after = status[serverKey]
      if ((before !== 0 && before !== 1) || (after !== 0 && after !== 1)) continue
      if (before === after) continue

      if (before === 1 && after === 0) {
        const cooldownKey = `${serverKey}_maintenance`
        if (isInCooldown(cooldownKey)) continue
        const message = [{ type: 'at', qq: 'all', text: '@全体成员' }, { type: 'text', text: `${serverName}维护了！` }]
        await e.reply(message, false, { recallMsg: -1 })
        updateNotifyTime(cooldownKey)
      } else if (before === 0 && after === 1) {
        const cooldownKey = `${serverKey}_online`
        if (isInCooldown(cooldownKey)) continue
        const message = [{ type: 'at', qq: 'all', text: '@全体成员' }, { type: 'text', text: `${serverName}开服了！` }]
        await e.reply(message, false, { recallMsg: -1 })
        updateNotifyTime(cooldownKey)
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
