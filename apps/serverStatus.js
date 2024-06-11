import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import moment from 'moment'

//服务器状态
let status = {
  time: '2023-01-01_00:00',
  pcNA: 1,
  pcEU: 1,
  pts: 1,
}

let lastStatus = {
  time: '2023-01-01_00:00',
  pcNA: 1,
  pcEU: 1,
  pts: 1,
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
          reg: '^#*(服务器状态)$',
          /** 执行方法 */
          fnc: 'sendStatus'
        }
      ]
    })
  }

  /**
   * #服务器状态
   * @提供服务器状态查询
   */
  async sendStatus (e) {
  	//判断是否需要更新服务器状态变量并执行
    let now = moment(new Date().getTime()).format('YYYY'+'-'+'MM'+'-'+'DD'+'_'+'HH'+':'+'mm').replace(/是0/g, "是").replace(/点0/g, "点")
    if(now != status.time)
    {
    	await this.updateESOStatus()
    	status.time = now
    	await this.checkStatusChange()
    	lastStatus = status
    }

    let index = status.pcNA + 2*status.pcEU + 4*status.pts
    let imgPath = `./plugins/eso/resources/img/status/status_${index}.jpg`

    /** 最后回复消息 */
    await this.e.reply(segment.image(`file://${imgPath}`))
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

    logger.info('[服务器状态] 更新服务器状态')
    /** 接口结果，分别解析出美服、欧服、测试服状态 */
    let statusData = await res.text()
    let tempData = statusData.split('PC-NA')[1]
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
    if(tempData == "Offline"){status.pts = 0}else{status.pts = 1}
  }


  /**
   * @判断服务器状态变更
   */
  async checkStatusChange (e) {
  	let message = [{ type: 'at', qq: 'all', text: '@全体成员' },{ type: 'text', text: '美服维护了！' }]
    //logger.info(lastStatus.time)
  	if(lastStatus.time != '2023-01-01_00:00')
  	{
      //logger.info('lastStatus.pcNA ：'+lastStatus.pcNA+'|status.pcNA :'+status.pcNA)
      //logger.info('lastStatus.pcEU ：'+lastStatus.pcEU+'|status.pcEU'+status.pcEU)
  		if((lastStatus.pcNA == 1) && (status.pcNA == 0))//美服进入维护
  		{
        logger.info('美服维护了！')
  			message = [{ type: 'at', qq: 'all', text: '@全体成员' },{ type: 'text', text: '美服维护了！' }]
  			await this.e.reply(message, false, { recallMsg: -1 })
  		}
  		if((lastStatus.pcNA == 0) && (status.pcNA == 1))//美服完成维护
  		{
        logger.info('美服开服了！')
  			message = [{ type: 'at', qq: 'all', text: '@全体成员' },{ type: 'text', text: '美服开服了！' }]
  			await this.e.reply(message, false, { recallMsg: -1 })
  		}
  		if((lastStatus.pcEU == 1) && (status.pcEU == 0))//欧服进入维护
  		{
        logger.info('欧服维护了！')
  			message = [{ type: 'at', qq: 'all', text: '@全体成员' },{ type: 'text', text: '欧服维护了！' }]
  			await this.e.reply(message, false, { recallMsg: -1 })
  		}
  		if((lastStatus.pcEU == 0) && (status.pcEU == 1))//欧服完成维护
  		{
        logger.info('欧服开服了！')
  			message = [{ type: 'at', qq: 'all', text: '@全体成员' },{ type: 'text', text: '欧服开服了！' }]
  			await this.e.reply(message, false, { recallMsg: -1 })
  		}
  	}
  }
}
