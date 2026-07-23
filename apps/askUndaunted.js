import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import General from '../model/general.js'
import database, { parseColorTags } from '../model/database.js'
import { getNamecardThemeByPic } from '../model/namecardColor.js'
import moment from 'moment'
import md5 from 'md5'
import fs from 'node:fs'
import path from 'node:path'
import undauntedApi from '../model/undauntedApi.js'

/** 无畏者查询信息来源：'local' 本地推算（默认）| 'api' ESOCN API 查询（失败自动回退本地） */
let srcMode = 'local'

/** 头图按日轮换：自该日起第 1 天使用排序后第 1 张 PNG（与 moment 日历日对齐） */
const NAMECARD_ROTATION_EPOCH = '2026-01-01'

function getSortedNamecardBasenames () {
  const dir = path.join(process.cwd(), 'plugins', 'eso', 'resources', 'img', 'namecard')
  try {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir)
      .filter(f => /\.png$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .map(f => path.parse(f).name)
  } catch (err) {
    logger.error(`[无畏] 读取 namecard 目录失败 ${err}`)
    return []
  }
}

function getNamecardPicBasenameForDate (dateStr) {
  const basenames = getSortedNamecardBasenames()
  if (!basenames.length) return null
  const start = moment(NAMECARD_ROTATION_EPOCH, 'YYYY-MM-DD').startOf('day')
  const day = moment(dateStr, 'YYYY-MM-DD').startOf('day')
  if (!day.isValid()) return basenames[0]
  const offset = day.diff(start, 'days')
  const n = basenames.length
  const idx = ((offset % n) + n) % n
  return basenames[idx]
}

function applyNamecardPic (data, dateStr) {
  const pic = getNamecardPicBasenameForDate(dateStr)
  if (pic && data?.generalData?.[0]) data.generalData[0].pic = pic
}

function applyNamecardPageBg (data) {
  const pic = data?.generalData?.[0]?.pic
  Object.assign(data, getNamecardThemeByPic(pic))
}

//无畏者副本序号校准码
let adjust = [4,4,1]

//无畏者副本数量
let num0 = 12
let num1 = 12
let num2 = 30

//装备数据库
let setsData = [{
}]

let setsDataCN = [{
}]

//无畏者副本总数量
let numDungeons = 0
let dgList = [
]

let dgSetsTable = [
]

//无畏者序号
let unIndex = {
  date: '2023-01-01',
  t0: '0', /*今日的第一个无畏者任务序号*/
  t1: '0', /*今日的第二个无畏者任务序号*/
  t2: '0', /*今日的第三个无畏者任务序号*/
  y0: '0', /*昨日的第一个无畏者任务序号*/
  y1: '0', /*昨日的第二个无畏者任务序号*/
  y2: '0', /*昨日的第三个无畏者任务序号*/
  tm0: '0', /*明日第的一个无畏者任务序号*/
  tm1: '0', /*明日第的二个无畏者任务序号*/
  tm2: '0', /*明日第的三个无畏者任务序号*/
}

//无畏者结构体变量
let unData = {
}
let unYesterdayData = {
}
let unTodayData = {
}
let unTomorrowData = {
}

//cacheData to save img
let undauntedData = {
  md5: '',
  img: ''
}
let undauntedYesterdayData = {
  md5: '',
  img: ''
}
let undauntedTodayData = {
  md5: '',
  img: ''
}
let undauntedTomorrowData = {
  md5: '',
  img: ''
}

export class askUndaunted extends plugin {
  constructor (e) {
    super({
      /** 功能名称 */
      name: 'ESO:无畏',
      /** 功能描述 */
      dsc: '无畏者日常任务查询',
      event: 'message',
      /** 优先级，数字越小等级越高 */
      priority: 5000,
      /** 匹配不同的关键词 */
      rule: [
        {
          /** 命令正则匹配 */
          reg: '^#*(无畏|无畏者|无畏者副本|无畏者日常|无畏者任务|无畏者日常任务|闯世|闯世者|闯世者副本|闯世者日常|闯世者任务|闯世者日常任务)$',
          /** 执行方法 */
          fnc: 'showUndaunted'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(昨日无畏|昨日无畏者|昨日无畏者副本|昨日无畏者日常|昨日无畏者任务|昨日无畏者日常任务|昨日闯世|昨日闯世者|昨日闯世者副本|昨日闯世者日常|昨日闯世者任务|昨日闯世者日常任务)$',
          /** 执行方法 */
          fnc: 'showYesterdayUndaunted'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(今日无畏|今日无畏者|今日无畏者副本|今日无畏者日常|今日无畏者任务|今日无畏者日常任务|今日闯世|今日闯世者|今日闯世者副本|今日闯世者日常|今日闯世者任务|今日闯世者日常任务)$',
          /** 执行方法 */
          fnc: 'showTodayUndaunted'
        },
        {
          /** 命令正则匹配 */
          reg: '^#*(明日无畏|明日无畏者|明日无畏者副本|明日无畏者日常|明日无畏者任务|明日无畏者日常任务|明日闯世|明日闯世者|明日闯世者副本|明日闯世者日常|明日闯世者任务|明日闯世者日常任务)$',
          /** 执行方法 */
          fnc: 'showTomorrowUndaunted'
        }
      ]
    })
  }

  /**
   * #(无畏|无畏者|无畏者日常|无畏者任务|无畏者日常任务|闯世|闯世者|闯世者日常|闯世者任务|闯世者日常任务)
   * @提供无畏者日常任务
   */
  async showUndaunted (e) {
    //判断是否需要初始化无畏者变量并执行
    if('done' != unData.init)
    {
      let data = await General.get(this.e, 'eso', 'undaunted', 'undaunted')
      if (!data)
      {
        logger.error('[无畏] 初始化结构体失败')
        return
      }
      unData = data
      //logger.info('[无畏] 初始化结构体变量')
    }

    //判断是否需要更新无畏者变量并执行
    let now = moment(new Date().getTime()).format('YYYY'+'-'+'MM'+'-'+'DD').replace(/是0/g, "是").replace(/点0/g, "点")
    let places = ''
    if(now != unData.generalData[0].date)
    {
      let apiOk = false
      if (srcMode === 'api') {
        try {
          await this.fillSummaryFromApi(unData)
          apiOk = true
        } catch (err) {
          logger.error('[无畏] API 模式失败，回退本地推算: ' + (err && err.message || err))
        }
      }
      if (!apiOk) {
      await this.cal_index(now)
      places = await database.get_setsPlace(dgSetsTable[unIndex.t0][0])
      unData.generalData[1].list[0].title = places.loot_place_cn
      unData.generalData[1].list[0].desc = "<"+places.loot_place_en+">"
      unData.generalData[1].list[1].icon = setsData[dgSetsTable[unIndex.t0][0]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unData.generalData[1].list[1].title = setsDataCN[setsData[dgSetsTable[unIndex.t0][0]].id].name
      unData.generalData[1].list[1].desc = "<"+setsData[dgSetsTable[unIndex.t0][0]].name+">"
      unData.generalData[1].list[2].icon = setsData[dgSetsTable[unIndex.t0][1]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unData.generalData[1].list[2].title = setsDataCN[setsData[dgSetsTable[unIndex.t0][1]].id].name
      unData.generalData[1].list[2].desc = "<"+setsData[dgSetsTable[unIndex.t0][1]].name+">"
      unData.generalData[1].list[3].icon = setsData[dgSetsTable[unIndex.t0][2]].styles.Apparel.Head.Medium.icon.split('.')[0].split('icons/')[1]
      unData.generalData[1].list[3].title = setsDataCN[setsData[dgSetsTable[unIndex.t0][2]].id].name
      unData.generalData[1].list[3].desc = "<"+setsData[dgSetsTable[unIndex.t0][2]].name+">"
      unData.generalData[1].list[4].icon = setsData[dgSetsTable[unIndex.t0][3]].styles.Apparel.Head.Heavy.icon.split('.')[0].split('icons/')[1]
      unData.generalData[1].list[4].title = setsDataCN[setsData[dgSetsTable[unIndex.t0][3]].id].name
      unData.generalData[1].list[4].desc = "<"+setsData[dgSetsTable[unIndex.t0][3]].name+">"

      places = await database.get_setsPlace(dgSetsTable[unIndex.t1][0])
      unData.generalData[1].list[5].title = places.loot_place_cn
      unData.generalData[1].list[5].desc = "<"+places.loot_place_en+">"
      unData.generalData[1].list[6].icon = setsData[dgSetsTable[unIndex.t1][0]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unData.generalData[1].list[6].title = setsDataCN[setsData[dgSetsTable[unIndex.t1][0]].id].name
      unData.generalData[1].list[6].desc = "<"+setsData[dgSetsTable[unIndex.t1][0]].name+">"
      unData.generalData[1].list[7].icon = setsData[dgSetsTable[unIndex.t1][1]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unData.generalData[1].list[7].title = setsDataCN[setsData[dgSetsTable[unIndex.t1][1]].id].name
      unData.generalData[1].list[7].desc = "<"+setsData[dgSetsTable[unIndex.t1][1]].name+">"
      unData.generalData[1].list[8].icon = setsData[dgSetsTable[unIndex.t1][2]].styles.Apparel.Head.Medium.icon.split('.')[0].split('icons/')[1]
      unData.generalData[1].list[8].title = setsDataCN[setsData[dgSetsTable[unIndex.t1][2]].id].name
      unData.generalData[1].list[8].desc = "<"+setsData[dgSetsTable[unIndex.t1][2]].name+">"
      unData.generalData[1].list[9].icon = setsData[dgSetsTable[unIndex.t1][3]].styles.Apparel.Head.Heavy.icon.split('.')[0].split('icons/')[1]
      unData.generalData[1].list[9].title = setsDataCN[setsData[dgSetsTable[unIndex.t1][3]].id].name
      unData.generalData[1].list[9].desc = "<"+setsData[dgSetsTable[unIndex.t1][3]].name+">"

      places = await database.get_setsPlace(dgSetsTable[unIndex.t2][0])
      unData.generalData[1].list[10].title = places.loot_place_cn
      unData.generalData[1].list[10].desc = "<"+places.loot_place_en+">"
      unData.generalData[1].list[11].icon = setsData[dgSetsTable[unIndex.t2][0]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unData.generalData[1].list[11].title = setsDataCN[setsData[dgSetsTable[unIndex.t2][0]].id].name
      unData.generalData[1].list[11].desc = "<"+setsData[dgSetsTable[unIndex.t2][0]].name+">"
      unData.generalData[1].list[12].icon = setsData[dgSetsTable[unIndex.t2][1]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unData.generalData[1].list[12].title = setsDataCN[setsData[dgSetsTable[unIndex.t2][1]].id].name
      unData.generalData[1].list[12].desc = "<"+setsData[dgSetsTable[unIndex.t2][1]].name+">"
      unData.generalData[1].list[13].icon = setsData[dgSetsTable[unIndex.t2][2]].styles.Apparel.Head.Medium.icon.split('.')[0].split('icons/')[1]
      unData.generalData[1].list[13].title = setsDataCN[setsData[dgSetsTable[unIndex.t2][2]].id].name
      unData.generalData[1].list[13].desc = "<"+setsData[dgSetsTable[unIndex.t2][2]].name+">"
      unData.generalData[1].list[14].icon = setsData[dgSetsTable[unIndex.t2][3]].styles.Apparel.Head.Heavy.icon.split('.')[0].split('icons/')[1]
      unData.generalData[1].list[14].title = setsDataCN[setsData[dgSetsTable[unIndex.t2][3]].id].name
      unData.generalData[1].list[14].desc = "<"+setsData[dgSetsTable[unIndex.t2][3]].name+">"

      places = await database.get_setsPlace(dgSetsTable[unIndex.y0][0])
      unData.generalData[2].list[0].title = places.loot_place_cn
      unData.generalData[2].list[0].desc = "<"+places.loot_place_en+">"
      places = await database.get_setsPlace(dgSetsTable[unIndex.y1][0])
      unData.generalData[2].list[1].title = places.loot_place_cn
      unData.generalData[2].list[1].desc = "<"+places.loot_place_en+">"
      places = await database.get_setsPlace(dgSetsTable[unIndex.y2][0])
      unData.generalData[2].list[2].title = places.loot_place_cn
      unData.generalData[2].list[2].desc = "<"+places.loot_place_en+">"

      places = await database.get_setsPlace(dgSetsTable[unIndex.tm0][0])
      unData.generalData[3].list[0].title = places.loot_place_cn
      unData.generalData[3].list[0].desc = "<"+places.loot_place_en+">"
      places = await database.get_setsPlace(dgSetsTable[unIndex.tm1][0])
      unData.generalData[3].list[1].title = places.loot_place_cn
      unData.generalData[3].list[1].desc = "<"+places.loot_place_en+">"
      places = await database.get_setsPlace(dgSetsTable[unIndex.tm2][0])
      unData.generalData[3].list[2].title = places.loot_place_cn
      unData.generalData[3].list[2].desc = "<"+places.loot_place_en+">"

      }
      unData.generalData[0].date = now
      //unData.generalData[2].group = '明日无畏';
      //logger.info('[无畏] 计算无畏者日常')
    }

    //logger.info(unData.generalData[1].list[0].title + ' ' + unData.generalData[1].list[0].desc)
    //logger.info(unData.generalData[1].list[5].title + ' ' + unData.generalData[1].list[5].desc)
    //logger.info(unData.generalData[1].list[10].title + ' ' + unData.generalData[1].list[10].desc)

    applyNamecardPic(unData, now)
    applyNamecardPageBg(unData)
    let img = await this.cache(unData, undauntedData)
    await this.reply(img)
  }

  async showTodayUndaunted (e) {
    //判断是否需要初始化无畏者变量并执行
    if('done' != unTodayData.init)
    {
      let data = await General.get(this.e, 'eso', 'undauntedToday', 'undauntedToday')
      if (!data)
      {
        logger.error('[今日无畏] 初始化结构体失败')
        return
      }
      unTodayData = data
      //logger.info('[今日无畏] 初始化结构体变量')
    }

    //判断是否需要更新无畏者变量并执行
    let now = moment(new Date().getTime()).format('YYYY'+'-'+'MM'+'-'+'DD').replace(/是0/g, "是").replace(/点0/g, "点")
    let places = ''
    if(now != unTodayData.generalData[0].date)
    {
      let apiOk = false
      if (srcMode === 'api') {
        try {
          await this.fillDetailFromApi(unTodayData, 'today')
          apiOk = true
        } catch (err) {
          logger.error('[今日无畏] API 模式失败，回退本地推算: ' + (err && err.message || err))
        }
      }
      if (!apiOk) {
      await this.cal_index(now)
      places = await database.get_setsPlace(dgSetsTable[unIndex.t0][0])
      unTodayData.generalData[1].list[0].title = places.loot_place_cn
      unTodayData.generalData[1].list[0].msg[0] = "<"+places.loot_place_en+">"
      
      unTodayData.generalData[1].list[1].icon = setsData[dgSetsTable[unIndex.t0][0]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unTodayData.generalData[1].list[1].title = setsDataCN[setsData[dgSetsTable[unIndex.t0][0]].id].name
      unTodayData.generalData[1].list[1].desc = "<"+setsData[dgSetsTable[unIndex.t0][0]].name+">"
      unTodayData.generalData[1].list[1].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.t0][0]].id].bonuses['5'])


      unTodayData.generalData[1].list[2].icon = setsData[dgSetsTable[unIndex.t0][1]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unTodayData.generalData[1].list[2].title = setsDataCN[setsData[dgSetsTable[unIndex.t0][1]].id].name
      unTodayData.generalData[1].list[2].desc = "<"+setsData[dgSetsTable[unIndex.t0][1]].name+">"
      unTodayData.generalData[1].list[2].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.t0][1]].id].bonuses['5'])


      unTodayData.generalData[1].list[3].icon = setsData[dgSetsTable[unIndex.t0][2]].styles.Apparel.Head.Medium.icon.split('.')[0].split('icons/')[1]
      unTodayData.generalData[1].list[3].title = setsDataCN[setsData[dgSetsTable[unIndex.t0][2]].id].name
      unTodayData.generalData[1].list[3].desc = "<"+setsData[dgSetsTable[unIndex.t0][2]].name+">"
      unTodayData.generalData[1].list[3].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.t0][2]].id].bonuses['5'])


      unTodayData.generalData[1].list[4].icon = setsData[dgSetsTable[unIndex.t0][3]].styles.Apparel.Head.Heavy.icon.split('.')[0].split('icons/')[1]
      unTodayData.generalData[1].list[4].title = setsDataCN[setsData[dgSetsTable[unIndex.t0][3]].id].name
      unTodayData.generalData[1].list[4].desc = "<"+setsData[dgSetsTable[unIndex.t0][3]].name+">"
      unTodayData.generalData[1].list[4].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.t0][3]].id].bonuses['5'])
      /*----------------------------------------------------------------------------*/
      places = await database.get_setsPlace(dgSetsTable[unIndex.t1][0])
      unTodayData.generalData[2].list[0].title = places.loot_place_cn
      unTodayData.generalData[2].list[0].msg[0] = "<"+places.loot_place_en+">"
      
      unTodayData.generalData[2].list[1].icon = setsData[dgSetsTable[unIndex.t1][0]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unTodayData.generalData[2].list[1].title = setsDataCN[setsData[dgSetsTable[unIndex.t1][0]].id].name
      unTodayData.generalData[2].list[1].desc = "<"+setsData[dgSetsTable[unIndex.t1][0]].name+">"
      unTodayData.generalData[2].list[1].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.t1][0]].id].bonuses['5'])


      unTodayData.generalData[2].list[2].icon = setsData[dgSetsTable[unIndex.t1][1]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unTodayData.generalData[2].list[2].title = setsDataCN[setsData[dgSetsTable[unIndex.t1][1]].id].name
      unTodayData.generalData[2].list[2].desc = "<"+setsData[dgSetsTable[unIndex.t1][1]].name+">"
      unTodayData.generalData[2].list[2].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.t1][1]].id].bonuses['5'])


      unTodayData.generalData[2].list[3].icon = setsData[dgSetsTable[unIndex.t1][2]].styles.Apparel.Head.Medium.icon.split('.')[0].split('icons/')[1]
      unTodayData.generalData[2].list[3].title = setsDataCN[setsData[dgSetsTable[unIndex.t1][2]].id].name
      unTodayData.generalData[2].list[3].desc = "<"+setsData[dgSetsTable[unIndex.t1][2]].name+">"
      unTodayData.generalData[2].list[3].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.t1][2]].id].bonuses['5'])


      unTodayData.generalData[2].list[4].icon = setsData[dgSetsTable[unIndex.t1][3]].styles.Apparel.Head.Heavy.icon.split('.')[0].split('icons/')[1]
      unTodayData.generalData[2].list[4].title = setsDataCN[setsData[dgSetsTable[unIndex.t1][3]].id].name
      unTodayData.generalData[2].list[4].desc = "<"+setsData[dgSetsTable[unIndex.t1][3]].name+">"
      unTodayData.generalData[2].list[4].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.t1][3]].id].bonuses['5'])
      /*----------------------------------------------------------------------------*/
      places = await database.get_setsPlace(dgSetsTable[unIndex.t2][0])
      unTodayData.generalData[3].list[0].title = places.loot_place_cn
      unTodayData.generalData[3].list[0].msg[0] = "<"+places.loot_place_en+">"
      
      unTodayData.generalData[3].list[1].icon = setsData[dgSetsTable[unIndex.t2][0]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unTodayData.generalData[3].list[1].title = setsDataCN[setsData[dgSetsTable[unIndex.t2][0]].id].name
      unTodayData.generalData[3].list[1].desc = "<"+setsData[dgSetsTable[unIndex.t2][0]].name+">"
      unTodayData.generalData[3].list[1].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.t2][0]].id].bonuses['5'])


      unTodayData.generalData[3].list[2].icon = setsData[dgSetsTable[unIndex.t2][1]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unTodayData.generalData[3].list[2].title = setsDataCN[setsData[dgSetsTable[unIndex.t2][1]].id].name
      unTodayData.generalData[3].list[2].desc = "<"+setsData[dgSetsTable[unIndex.t2][1]].name+">"
      unTodayData.generalData[3].list[2].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.t2][1]].id].bonuses['5'])


      unTodayData.generalData[3].list[3].icon = setsData[dgSetsTable[unIndex.t2][2]].styles.Apparel.Head.Medium.icon.split('.')[0].split('icons/')[1]
      unTodayData.generalData[3].list[3].title = setsDataCN[setsData[dgSetsTable[unIndex.t2][2]].id].name
      unTodayData.generalData[3].list[3].desc = "<"+setsData[dgSetsTable[unIndex.t2][2]].name+">"
      unTodayData.generalData[3].list[3].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.t2][2]].id].bonuses['5'])


      unTodayData.generalData[3].list[4].icon = setsData[dgSetsTable[unIndex.t2][3]].styles.Apparel.Head.Heavy.icon.split('.')[0].split('icons/')[1]
      unTodayData.generalData[3].list[4].title = setsDataCN[setsData[dgSetsTable[unIndex.t2][3]].id].name
      unTodayData.generalData[3].list[4].desc = "<"+setsData[dgSetsTable[unIndex.t2][3]].name+">"
      unTodayData.generalData[3].list[4].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.t2][3]].id].bonuses['5'])

      }
      unTodayData.generalData[0].date = now
      //unTodayData.generalData[2].group = '明日无畏';
      //logger.info('[今日无畏] 计算无畏者日常')s
    }

    //logger.info(unTodayData.generalData[1].list[0].title + ' ' + unTodayData.generalData[1].list[0].msg[0])
    //logger.info(unTodayData.generalData[2].list[0].title + ' ' + unTodayData.generalData[2].list[0].msg[0])
    //logger.info(unTodayData.generalData[3].list[0].title + ' ' + unTodayData.generalData[3].list[0].msg[0])

    applyNamecardPic(unTodayData, now)
    applyNamecardPageBg(unTodayData)
    let img = await this.cache(unTodayData, undauntedTodayData)
    await this.reply(img)
  }

  async showYesterdayUndaunted (e) {
    //判断是否需要初始化无畏者变量并执行
    if('done' != unYesterdayData.init)
    {
      let data = await General.get(this.e, 'eso', 'undauntedYesterday', 'undauntedYesterday')
      if (!data)
      {
        logger.error('[昨日无畏] 初始化结构体失败')
        return
      }
      unYesterdayData = data
      //logger.info('[昨日无畏] 初始化结构体变量')
    }

    //判断是否需要更新无畏者变量并执行
    let now = moment(new Date().getTime()).format('YYYY'+'-'+'MM'+'-'+'DD').replace(/是0/g, "是").replace(/点0/g, "点")
    let places = ''
    if(now != unYesterdayData.generalData[0].date)
    {
      let apiOk = false
      if (srcMode === 'api') {
        try {
          await this.fillDetailFromApi(unYesterdayData, 'yesterday')
          apiOk = true
        } catch (err) {
          logger.error('[昨日无畏] API 模式失败，回退本地推算: ' + (err && err.message || err))
        }
      }
      if (!apiOk) {
      await this.cal_index(now)
      places = await database.get_setsPlace(dgSetsTable[unIndex.y0][0])
      unYesterdayData.generalData[1].list[0].title = places.loot_place_cn
      unYesterdayData.generalData[1].list[0].msg[0] = "<"+places.loot_place_en+">"
      
      unYesterdayData.generalData[1].list[1].icon = setsData[dgSetsTable[unIndex.y0][0]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unYesterdayData.generalData[1].list[1].title = setsDataCN[setsData[dgSetsTable[unIndex.y0][0]].id].name
      unYesterdayData.generalData[1].list[1].desc = "<"+setsData[dgSetsTable[unIndex.y0][0]].name+">"
      unYesterdayData.generalData[1].list[1].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.y0][0]].id].bonuses['5'])

      unYesterdayData.generalData[1].list[2].icon = setsData[dgSetsTable[unIndex.y0][1]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unYesterdayData.generalData[1].list[2].title = setsDataCN[setsData[dgSetsTable[unIndex.y0][1]].id].name
      unYesterdayData.generalData[1].list[2].desc = "<"+setsData[dgSetsTable[unIndex.y0][1]].name+">"
      unYesterdayData.generalData[1].list[2].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.y0][1]].id].bonuses['5'])

      unYesterdayData.generalData[1].list[3].icon = setsData[dgSetsTable[unIndex.y0][2]].styles.Apparel.Head.Medium.icon.split('.')[0].split('icons/')[1]
      unYesterdayData.generalData[1].list[3].title = setsDataCN[setsData[dgSetsTable[unIndex.y0][2]].id].name
      unYesterdayData.generalData[1].list[3].desc = "<"+setsData[dgSetsTable[unIndex.y0][2]].name+">"
      unYesterdayData.generalData[1].list[3].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.y0][2]].id].bonuses['5'])

      unYesterdayData.generalData[1].list[4].icon = setsData[dgSetsTable[unIndex.y0][3]].styles.Apparel.Head.Heavy.icon.split('.')[0].split('icons/')[1]
      unYesterdayData.generalData[1].list[4].title = setsDataCN[setsData[dgSetsTable[unIndex.y0][3]].id].name
      unYesterdayData.generalData[1].list[4].desc = "<"+setsData[dgSetsTable[unIndex.y0][3]].name+">"
      unYesterdayData.generalData[1].list[4].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.y0][3]].id].bonuses['5'])
      /*----------------------------------------------------------------------------*/
      places = await database.get_setsPlace(dgSetsTable[unIndex.y1][0])
      unYesterdayData.generalData[2].list[0].title = places.loot_place_cn
      unYesterdayData.generalData[2].list[0].msg[0] = "<"+places.loot_place_en+">"
      
      unYesterdayData.generalData[2].list[1].icon = setsData[dgSetsTable[unIndex.y1][0]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unYesterdayData.generalData[2].list[1].title = setsDataCN[setsData[dgSetsTable[unIndex.y1][0]].id].name
      unYesterdayData.generalData[2].list[1].desc = "<"+setsData[dgSetsTable[unIndex.y1][0]].name+">"
      unYesterdayData.generalData[2].list[1].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.y1][0]].id].bonuses['5'])

      unYesterdayData.generalData[2].list[2].icon = setsData[dgSetsTable[unIndex.y1][1]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unYesterdayData.generalData[2].list[2].title = setsDataCN[setsData[dgSetsTable[unIndex.y1][1]].id].name
      unYesterdayData.generalData[2].list[2].desc = "<"+setsData[dgSetsTable[unIndex.y1][1]].name+">"
      unYesterdayData.generalData[2].list[2].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.y1][1]].id].bonuses['5'])

      unYesterdayData.generalData[2].list[3].icon = setsData[dgSetsTable[unIndex.y1][2]].styles.Apparel.Head.Medium.icon.split('.')[0].split('icons/')[1]
      unYesterdayData.generalData[2].list[3].title = setsDataCN[setsData[dgSetsTable[unIndex.y1][2]].id].name
      unYesterdayData.generalData[2].list[3].desc = "<"+setsData[dgSetsTable[unIndex.y1][2]].name+">"
      unYesterdayData.generalData[2].list[3].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.y1][2]].id].bonuses['5'])

      unYesterdayData.generalData[2].list[4].icon = setsData[dgSetsTable[unIndex.y1][3]].styles.Apparel.Head.Heavy.icon.split('.')[0].split('icons/')[1]
      unYesterdayData.generalData[2].list[4].title = setsDataCN[setsData[dgSetsTable[unIndex.y1][3]].id].name
      unYesterdayData.generalData[2].list[4].desc = "<"+setsData[dgSetsTable[unIndex.y1][3]].name+">"
      unYesterdayData.generalData[2].list[4].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.y1][3]].id].bonuses['5'])
      /*----------------------------------------------------------------------------*/
      places = await database.get_setsPlace(dgSetsTable[unIndex.y2][0])
      unYesterdayData.generalData[3].list[0].title = places.loot_place_cn
      unYesterdayData.generalData[3].list[0].msg[0] = "<"+places.loot_place_en+">"
      
      unYesterdayData.generalData[3].list[1].icon = setsData[dgSetsTable[unIndex.y2][0]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unYesterdayData.generalData[3].list[1].title = setsDataCN[setsData[dgSetsTable[unIndex.y2][0]].id].name
      unYesterdayData.generalData[3].list[1].desc = "<"+setsData[dgSetsTable[unIndex.y2][0]].name+">"
      unYesterdayData.generalData[3].list[1].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.y2][0]].id].bonuses['5'])

      unYesterdayData.generalData[3].list[2].icon = setsData[dgSetsTable[unIndex.y2][1]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unYesterdayData.generalData[3].list[2].title = setsDataCN[setsData[dgSetsTable[unIndex.y2][1]].id].name
      unYesterdayData.generalData[3].list[2].desc = "<"+setsData[dgSetsTable[unIndex.y2][1]].name+">"
      unYesterdayData.generalData[3].list[2].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.y2][1]].id].bonuses['5'])

      unYesterdayData.generalData[3].list[3].icon = setsData[dgSetsTable[unIndex.y2][2]].styles.Apparel.Head.Medium.icon.split('.')[0].split('icons/')[1]
      unYesterdayData.generalData[3].list[3].title = setsDataCN[setsData[dgSetsTable[unIndex.y2][2]].id].name
      unYesterdayData.generalData[3].list[3].desc = "<"+setsData[dgSetsTable[unIndex.y2][2]].name+">"
      unYesterdayData.generalData[3].list[3].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.y2][2]].id].bonuses['5'])

      unYesterdayData.generalData[3].list[4].icon = setsData[dgSetsTable[unIndex.y2][3]].styles.Apparel.Head.Heavy.icon.split('.')[0].split('icons/')[1]
      unYesterdayData.generalData[3].list[4].title = setsDataCN[setsData[dgSetsTable[unIndex.y2][3]].id].name
      unYesterdayData.generalData[3].list[4].desc = "<"+setsData[dgSetsTable[unIndex.y2][3]].name+">"
      unYesterdayData.generalData[3].list[4].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.y2][3]].id].bonuses['5'])

      }
      unYesterdayData.generalData[0].date = now
      //unYesterdayData.generalData[2].group = '昨日日无畏';
      //logger.info('[昨日无畏] 计算无畏者日常')
    }

    //logger.info(unYesterdayData.generalData[1].list[0].title + ' ' + unYesterdayData.generalData[1].list[0].msg[0])
    //logger.info(unYesterdayData.generalData[2].list[0].title + ' ' + unYesterdayData.generalData[2].list[0].msg[0])
    //logger.info(unYesterdayData.generalData[3].list[0].title + ' ' + unYesterdayData.generalData[3].list[0].msg[0])

    applyNamecardPic(unYesterdayData, now)
    applyNamecardPageBg(unYesterdayData)
    let img = await this.cache(unYesterdayData, undauntedYesterdayData)
    await this.reply(img)
  }


  async showTomorrowUndaunted (e) {
    //判断是否需要初始化无畏者变量并执行
    if('done' != unTomorrowData.init)
    {
      let data = await General.get(this.e, 'eso', 'undauntedTomorrow', 'undauntedTomorrow')
      if (!data)
      {
        logger.error('[明日无畏] 初始化结构体失败')
        return
      }
      unTomorrowData = data
      //logger.info('[明日无畏] 初始化结构体变量')
    }

    //判断是否需要更新无畏者变量并执行
    let now = moment(new Date().getTime()).format('YYYY'+'-'+'MM'+'-'+'DD').replace(/是0/g, "是").replace(/点0/g, "点")
    let places = ''
    if(now != unTomorrowData.generalData[0].date)
    {
      let apiOk = false
      if (srcMode === 'api') {
        try {
          await this.fillDetailFromApi(unTomorrowData, 'tomorrow')
          apiOk = true
        } catch (err) {
          logger.error('[明日无畏] API 模式失败，回退本地推算: ' + (err && err.message || err))
        }
      }
      if (!apiOk) {
      await this.cal_index(now)
      places = await database.get_setsPlace(dgSetsTable[unIndex.tm0][0])
      unTomorrowData.generalData[1].list[0].title = places.loot_place_cn
      unTomorrowData.generalData[1].list[0].msg[0] = "<"+places.loot_place_en+">"
      
      unTomorrowData.generalData[1].list[1].icon = setsData[dgSetsTable[unIndex.tm0][0]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unTomorrowData.generalData[1].list[1].title = setsDataCN[setsData[dgSetsTable[unIndex.tm0][0]].id].name
      unTomorrowData.generalData[1].list[1].desc = "<"+setsData[dgSetsTable[unIndex.tm0][0]].name+">"
      unTomorrowData.generalData[1].list[1].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.tm0][0]].id].bonuses['5'])

      unTomorrowData.generalData[1].list[2].icon = setsData[dgSetsTable[unIndex.tm0][1]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unTomorrowData.generalData[1].list[2].title = setsDataCN[setsData[dgSetsTable[unIndex.tm0][1]].id].name
      unTomorrowData.generalData[1].list[2].desc = "<"+setsData[dgSetsTable[unIndex.tm0][1]].name+">"
      unTomorrowData.generalData[1].list[2].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.tm0][1]].id].bonuses['5'])

      unTomorrowData.generalData[1].list[3].icon = setsData[dgSetsTable[unIndex.tm0][2]].styles.Apparel.Head.Medium.icon.split('.')[0].split('icons/')[1]
      unTomorrowData.generalData[1].list[3].title = setsDataCN[setsData[dgSetsTable[unIndex.tm0][2]].id].name
      unTomorrowData.generalData[1].list[3].desc = "<"+setsData[dgSetsTable[unIndex.tm0][2]].name+">"
      unTomorrowData.generalData[1].list[3].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.tm0][2]].id].bonuses['5'])

      unTomorrowData.generalData[1].list[4].icon = setsData[dgSetsTable[unIndex.tm0][3]].styles.Apparel.Head.Heavy.icon.split('.')[0].split('icons/')[1]
      unTomorrowData.generalData[1].list[4].title = setsDataCN[setsData[dgSetsTable[unIndex.tm0][3]].id].name
      unTomorrowData.generalData[1].list[4].desc = "<"+setsData[dgSetsTable[unIndex.tm0][3]].name+">"
      unTomorrowData.generalData[1].list[4].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.tm0][3]].id].bonuses['5'])
      /*----------------------------------------------------------------------------*/
      places = await database.get_setsPlace(dgSetsTable[unIndex.tm1][0])
      unTomorrowData.generalData[2].list[0].title = places.loot_place_cn
      unTomorrowData.generalData[2].list[0].msg[0] = "<"+places.loot_place_en+">"
      
      unTomorrowData.generalData[2].list[1].icon = setsData[dgSetsTable[unIndex.tm1][0]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unTomorrowData.generalData[2].list[1].title = setsDataCN[setsData[dgSetsTable[unIndex.tm1][0]].id].name
      unTomorrowData.generalData[2].list[1].desc = "<"+setsData[dgSetsTable[unIndex.tm1][0]].name+">"
      unTomorrowData.generalData[2].list[1].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.tm1][0]].id].bonuses['5'])

      unTomorrowData.generalData[2].list[2].icon = setsData[dgSetsTable[unIndex.tm1][1]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unTomorrowData.generalData[2].list[2].title = setsDataCN[setsData[dgSetsTable[unIndex.tm1][1]].id].name
      unTomorrowData.generalData[2].list[2].desc = "<"+setsData[dgSetsTable[unIndex.tm1][1]].name+">"
      unTomorrowData.generalData[2].list[2].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.tm1][1]].id].bonuses['5'])

      unTomorrowData.generalData[2].list[3].icon = setsData[dgSetsTable[unIndex.tm1][2]].styles.Apparel.Head.Medium.icon.split('.')[0].split('icons/')[1]
      unTomorrowData.generalData[2].list[3].title = setsDataCN[setsData[dgSetsTable[unIndex.tm1][2]].id].name
      unTomorrowData.generalData[2].list[3].desc = "<"+setsData[dgSetsTable[unIndex.tm1][2]].name+">"
      unTomorrowData.generalData[2].list[3].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.tm1][2]].id].bonuses['5'])

      unTomorrowData.generalData[2].list[4].icon = setsData[dgSetsTable[unIndex.tm1][3]].styles.Apparel.Head.Heavy.icon.split('.')[0].split('icons/')[1]
      unTomorrowData.generalData[2].list[4].title = setsDataCN[setsData[dgSetsTable[unIndex.tm1][3]].id].name
      unTomorrowData.generalData[2].list[4].desc = "<"+setsData[dgSetsTable[unIndex.tm1][3]].name+">"
      unTomorrowData.generalData[2].list[4].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.tm1][3]].id].bonuses['5'])
      /*----------------------------------------------------------------------------*/
      places = await database.get_setsPlace(dgSetsTable[unIndex.tm2][0])
      unTomorrowData.generalData[3].list[0].title = places.loot_place_cn
      unTomorrowData.generalData[3].list[0].msg[0] = "<"+places.loot_place_en+">"
      
      unTomorrowData.generalData[3].list[1].icon = setsData[dgSetsTable[unIndex.tm2][0]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unTomorrowData.generalData[3].list[1].title = setsDataCN[setsData[dgSetsTable[unIndex.tm2][0]].id].name
      unTomorrowData.generalData[3].list[1].desc = "<"+setsData[dgSetsTable[unIndex.tm2][0]].name+">"
      unTomorrowData.generalData[3].list[1].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.tm2][0]].id].bonuses['5'])

      unTomorrowData.generalData[3].list[2].icon = setsData[dgSetsTable[unIndex.tm2][1]].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      unTomorrowData.generalData[3].list[2].title = setsDataCN[setsData[dgSetsTable[unIndex.tm2][1]].id].name
      unTomorrowData.generalData[3].list[2].desc = "<"+setsData[dgSetsTable[unIndex.tm2][1]].name+">"
      unTomorrowData.generalData[3].list[2].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.tm2][1]].id].bonuses['5'])

      unTomorrowData.generalData[3].list[3].icon = setsData[dgSetsTable[unIndex.tm2][2]].styles.Apparel.Head.Medium.icon.split('.')[0].split('icons/')[1]
      unTomorrowData.generalData[3].list[3].title = setsDataCN[setsData[dgSetsTable[unIndex.tm2][2]].id].name
      unTomorrowData.generalData[3].list[3].desc = "<"+setsData[dgSetsTable[unIndex.tm2][2]].name+">"
      unTomorrowData.generalData[3].list[3].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.tm2][2]].id].bonuses['5'])

      unTomorrowData.generalData[3].list[4].icon = setsData[dgSetsTable[unIndex.tm2][3]].styles.Apparel.Head.Heavy.icon.split('.')[0].split('icons/')[1]
      unTomorrowData.generalData[3].list[4].title = setsDataCN[setsData[dgSetsTable[unIndex.tm2][3]].id].name
      unTomorrowData.generalData[3].list[4].desc = "<"+setsData[dgSetsTable[unIndex.tm2][3]].name+">"
      unTomorrowData.generalData[3].list[4].msg = await this.bonuses2msg(setsDataCN[setsData[dgSetsTable[unIndex.tm2][3]].id].bonuses['5'])

      }
      unTomorrowData.generalData[0].date = now
      //unTomorrowData.generalData[2].group = '明日无畏'
      //logger.info('[明日无畏] 计算无畏者日常')
    }

    //logger.info(unTomorrowData.generalData[1].list[0].title + ' ' + unTomorrowData.generalData[1].list[0].msg[0])
    //logger.info(unTomorrowData.generalData[2].list[0].title + ' ' + unTomorrowData.generalData[2].list[0].msg[0])
    //logger.info(unTomorrowData.generalData[3].list[0].title + ' ' + unTomorrowData.generalData[3].list[0].msg[0])

    applyNamecardPic(unTomorrowData, now)
    applyNamecardPageBg(unTomorrowData)
    let img = await this.cache(unTomorrowData, undauntedTomorrowData)
    await this.reply(img)
  }

  /**
   * 从 ESOCN API 获取某一天的 3 个无畏者副本及其套装
   * @param dayKind 'today' | 'yesterday' | 'tomorrow'
   * @returns {Promise<Array<{dg: {name, enName}, sets: [怪物套, 轻甲套, 中甲套, 重甲套]}>>}
   */
  async getApiDayData (dayKind) {
    const offsets = undauntedApi.resolveOffsets()
    const pledges = await undauntedApi.getPledges(offsets[dayKind])
    const days = []
    for (const dgEn of pledges) {
      const dg = await undauntedApi.getDungeon(dgEn)
      const sets = [null, null, null, null]
      for (const setEn of dg.equipment) {
        const s = await undauntedApi.getSet(setEn)
        if (s.type === '8') sets[0] = s
        else if (s.armor === '轻甲') sets[1] = s
        else if (s.armor === '中甲') sets[2] = s
        else if (s.armor === '重甲') sets[3] = s
      }
      if (!sets[0] || !sets[1] || !sets[2] || !sets[3]) {
        logger.warn(`[无畏:API] ${dgEn} 套装分类不完整: [${sets.map(s => (s ? s.enName : 'null')).join(', ')}]`)
      }
      days.push({ dg, sets })
    }
    return days
  }

  /** 用 API 数据填充详情模板（今日/昨日/明日共用结构） */
  async fillDetailFromApi (data, dayKind) {
    const days = await this.getApiDayData(dayKind)
    const iconKinds = ['Light', 'Light', 'Medium', 'Heavy']
    for (let i = 0; i < 3; i++) {
      const group = data.generalData[i + 1]
      const { dg, sets } = days[i]
      group.list[0].title = dg.name
      group.list[0].msg[0] = `<${dg.enName}>`
      for (let j = 0; j < 4; j++) {
        const s = sets[j]
        if (!s) continue
        const item = group.list[j + 1]
        item.icon = s.icons[iconKinds[j]]
        item.title = s.name
        item.desc = `<${s.enName}>`
        item.msg = await this.bonuses2msg(s.bonuses)
      }
    }
  }

  /** 用 API 数据填充 #无畏 汇总模板 */
  async fillSummaryFromApi (data) {
    const todayDays = await this.getApiDayData('today')
    const yesterdayDays = await this.getApiDayData('yesterday')
    const tomorrowDays = await this.getApiDayData('tomorrow')
    const iconKinds = ['Light', 'Light', 'Medium', 'Heavy']

    // 今日：3 副本 × (副本名 + 4 套装)
    const list = data.generalData[1].list
    for (let i = 0; i < 3; i++) {
      const { dg, sets } = todayDays[i]
      list[i * 5].title = dg.name
      list[i * 5].desc = `<${dg.enName}>`
      for (let j = 0; j < 4; j++) {
        const s = sets[j]
        if (!s) continue
        const item = list[i * 5 + 1 + j]
        item.icon = s.icons[iconKinds[j]]
        item.title = s.name
        item.desc = `<${s.enName}>`
      }
    }

    // 昨日/明日：仅副本名
    for (const [idx, days] of [[2, yesterdayDays], [3, tomorrowDays]]) {
      const group = data.generalData[idx]
      for (let i = 0; i < 3; i++) {
        group.list[i].title = days[i].dg.name
        group.list[i].desc = `<${days[i].dg.enName}>`
      }
    }
  }

  async cal_index (now) {
    await this.init_database()

    if(now != unIndex.date)
    {
      logger.info('[无畏] 计算无畏者序号')
      let passSeconds = new Date().getTime()
      passSeconds = passSeconds-57600000
      let passDays = (passSeconds-(passSeconds%86400000))/86400000
      unIndex.t0 = (passDays + adjust[0])%num0
      unIndex.t1 = (passDays + adjust[1])%num1 + 12
      unIndex.t2 = (passDays + adjust[2])%num2 + 24
      unIndex.y0 = (passDays + adjust[0] - 1)%num0
      unIndex.y1 = (passDays + adjust[1] - 1)%num1 + 12
      unIndex.y2 = (passDays + adjust[2] - 1)%num2 + 24
      unIndex.tm0 = (passDays + adjust[0] + 1)%num0
      unIndex.tm1 = (passDays + adjust[1] + 1)%num1 + 12
      unIndex.tm2 = (passDays + adjust[2] + 1)%num2 + 24
      unIndex.date = now
    }
    //logger.info('今日序号：['+unIndex.t0+']['+unIndex.t1+']['+unIndex.t2+']')
    //logger.info('昨日序号：['+unIndex.y0+']['+unIndex.y1+']['+unIndex.y2+']')
    //logger.info('明日序号：['+unIndex.tm0+']['+unIndex.tm1+']['+unIndex.tm2+']')

    //let places = await database.get_setsPlace(dgSetsTable[unIndex.t0][0])
    //logger.info(places.loot_place_cn)

    return 0
  }

  async init_database () {
    if (numDungeons > 0)
    {
      return 0
    }
    logger.info('[无畏] 初始化无畏者数据库')
    setsData   = await database.getSetsEN()
    setsDataCN = await database.getSetsCN()
    numDungeons   = await database.getDgNum()
    dgList   = await database.getdgList()
    dgSetsTable   = await database.getdgSets()
    num2 = numDungeons-24
  }

  async bonuses2msg (bonuses) {
    let msg = []
    var msgIndex = 0
    var keysBonuses = Object.keys(bonuses)
    var numBonuses = keysBonuses.length

    for (let bonuseKey of keysBonuses) {
      msg[msgIndex] = parseColorTags(bonuses[bonuseKey])
      msgIndex = msgIndex + 1
    }

    //logger.info(msg)
    return msg
  }

  async cache (data, cachedata) {
    let tmp = md5(JSON.stringify(data))
    if (cachedata.md5 == tmp) return cachedata.img

    cachedata.img = await puppeteer.screenshot('eso', data) /*html file saved in folder data/html/eso/ */
    cachedata.md5 = tmp

    return cachedata.img
  }
}
