import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import fetch from 'node-fetch'
import moment from 'moment'
import ServerStatus from '../model/serverstatus.js'
import md5 from 'md5'

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

// 维护信息处理函数
function processMaintenanceInfo(maintenanceMessage) {
    const lines = maintenanceMessage.trim().split('\n').filter(line => line.trim() !== '');
    const newLines = [];
    const currentYear = new Date().getFullYear();

    const firstLine = lines[0];
    const dateMatch = firstLine.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/);
    if (dateMatch) {
        const monthName = dateMatch[1];
        const day = dateMatch[2];
        const monthNumber = getMonthNumber(monthName);
        newLines.push({
            text: `${currentYear}-${monthNumber}-${day} 当周服务器维护信息`,
            color: 'rgb(58, 146, 254)' // 蓝色标题
        });
    }

    for (let i = 1; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        let statusText = '';
        let statusColor = '';
        
        if (line.includes('[COMPLETE]')) {
            statusText = '[已更新]';
            statusColor = 'rgb(19, 217, 98)'; // 绿色
        } else if (line.includes('[IN PROGRESS]')) {
            statusText = '[维护中]';
            statusColor = 'rgb(255, 105, 180)'; // 纯红色，更亮
        } else {
            statusText = '[待更新]';
            statusColor = 'rgb(255, 165, 0)'; // 橙色
        }
        
        const platformMatch = line.match(/(PC\/Mac|Xbox|PlayStation®)/);
        const platform = platformMatch ? platformMatch[0] : '';
        
        let serverRegion = '';
        const hasNA = line.includes('NA');
        const hasEU = line.includes('EU');
        if (hasNA && hasEU) {
            serverRegion = '美服和欧服';
        } else if (hasNA) {
            serverRegion = '美服';
        } else if (hasEU) {
            serverRegion = '欧服';
        }

        let maintenanceType = '';
        let translatedTime = '';
        let isNoMaintenance = false;

        if (line.includes('No maintenance')) {
            maintenanceType = '无需维护';
            isNoMaintenance = true;
        } else if (line.includes('patch')) {
            maintenanceType = '版本维护';
        } else {
            maintenanceType = '维护';
        }

        if (!isNoMaintenance) {
            const timeRegex = /(\d{1,2}:\d{2})(AM|PM)\sEDT\s+\((\d{1,2}:\d{2})\sUTC\)\s+-\s+(\d{1,2}:\d{2})(AM|PM)\sEDT\s+\((\d{1,2}:\d{2})\sUTC\)/;
            const timeMatch = line.match(timeRegex);

            if (timeMatch) {
                const maintenanceDateMatch = line.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/);
                const maintenanceMonth = maintenanceDateMatch ? getMonthName(maintenanceDateMatch[1]) : '';
                const maintenanceDay = maintenanceDateMatch ? maintenanceDateMatch[2] : '';

                const startLocalTime = convertEDTtoBeijing(timeMatch[1], timeMatch[2]);
                const endLocalTime = convertEDTtoBeijing(timeMatch[4], timeMatch[5]);

                translatedTime = ` 北京时间${maintenanceMonth}${maintenanceDay}日 ${startLocalTime} (${timeMatch[3]} UTC) - ${endLocalTime} (${timeMatch[6]} UTC)`;
            } else {
                translatedTime = '';
            }
        }
        
        const newLine = `${statusText} ${platform}：${serverRegion}${maintenanceType}${translatedTime ? ` -${translatedTime}` : ''}`;
        newLines.push({
            text: newLine,
            color: statusColor
        });
    }
    
    const finalLines = {};
    for (const line of newLines) {
        if (line.text.includes('当周服务器维护信息')) {
            finalLines["header"] = line;
        }
        else if (line.text.includes('PC/Mac')) {
            const pcLine = { ...line };
            pcLine.text = line.text.replace('PC/Mac', 'PC');
            const macLine = { ...line };
            macLine.text = line.text.replace('PC/Mac', 'Mac');
            finalLines["PC"] = pcLine;
            finalLines["Mac"] = macLine;
        } else {
            if (line.text.includes('Xbox')) {
                finalLines["Xbox"] = line;
            } else if (line.text.includes('PlayStation')) {
                finalLines["PlayStation"] = line;
            }
        }
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
        maintenanceInfo.push(maintenanceData.PC);
      }
      if (maintenanceData.Mac) {
        maintenanceInfo.push(maintenanceData.Mac);
      }
      if (maintenanceData.Xbox) {
        maintenanceInfo.push(maintenanceData.Xbox);
      }
      if (maintenanceData.PlayStation) {
        maintenanceInfo.push(maintenanceData.PlayStation);
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
  	/** 服务器状态接口地址 */
    let url = 'https://esoserverstatus.net/'
    /** 调用接口获取数据 */
    let res = await fetch(url)

    /** 判断接口是否请求成功 */
    if (!res) {
      logger.error('[服务器状态] 接口请求失败')
      return await this.reply('由于网络波动，更新服务器状态失败，请稍后重试')
    }

    //logger.info('[服务器公告] 更新服务器公告')
    let notesData = await res.text()
    let tempData = notesData.split('id="alert-box"')[1]
    tempData = tempData.split('align="center"')[0]
    tempData = tempData.split('status-text">')[1]
    tempData = tempData.split('</div>')[0]

    let msg = []
    var msgIndex = 0
    let srcMsgs = tempData.split('<br/>')
    for (let oneMsg of srcMsgs) {
      msg = msg + oneMsg
      msgIndex = msgIndex + 1
    }

    tempData = msg
    status.msg = []
    msgIndex = 0
    srcMsgs = tempData.split('<br />')
    for (let oneMsg of srcMsgs) {
      status.msg = status.msg + oneMsg
      msgIndex = msgIndex + 1
    }

    //logger.info('[服务器状态] 更新服务器状态')
    /** 接口结果，分别解析出每个服务器的状态 */
    let statusData = notesData
    tempData = statusData.split('PC-NA')[1]
    tempData = tempData.split('PC-PTS')[0]
    tempData = tempData.split('<b>')[1]
    tempData = tempData.split('</b>')[0]
    if(tempData == "Offline"){status.pcNA = 0}else{status.pcNA = 1}

    tempData = statusData.split('PC-EU')[1]
    tempData = tempData.split('PC-NA')[0]
    tempData = tempData.split('<b>')[1]
    tempData = tempData.split('</b>')[0]
    if(tempData == "Offline"){status.pcEU = 0}else{status.pcEU = 1}

    tempData = statusData.split('PC-PTS')[1]
    tempData = tempData.split('XBOX-EU')[0]
    tempData = tempData.split('<b>')[1]
    tempData = tempData.split('</b>')[0]
    if(tempData == "Offline"){status.pcPTS = 0}else{status.pcPTS = 1}

    tempData = statusData.split('XBOX-EU')[1]
    tempData = tempData.split('XBOX-NA')[0]
    tempData = tempData.split('<b>')[1]
    tempData = tempData.split('</b>')[0]
    if(tempData == "Offline"){status.xbEU = 0}else{status.xbEU = 1}

    tempData = statusData.split('XBOX-NA')[1]
    tempData = tempData.split('PS4-EU')[0]
    tempData = tempData.split('<b>')[1]
    tempData = tempData.split('</b>')[0]
    if(tempData == "Offline"){status.xbNA = 0}else{status.xbNA = 1}

    tempData = statusData.split('PS4-EU')[1]
    tempData = tempData.split('PS4-NA')[0]
    tempData = tempData.split('<b>')[1]
    tempData = tempData.split('</b>')[0]
    if(tempData == "Offline"){status.psEU = 0}else{status.psEU = 1}

    tempData = statusData.split('PS4-NA')[1]
	  tempData = tempData.split('<b>')[1]
    tempData = tempData.split('</b>')[0]
    if(tempData == "Offline"){status.psNA = 0}else{status.psNA = 1}
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
