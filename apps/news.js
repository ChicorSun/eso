import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import getimgs from '../model/getimgs.js'
import fetch from 'node-fetch'
import moment from 'moment'
import md5 from 'md5'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.join(__dirname, '../custome_resources/news/newsList.json')
const CONTEXT_DIR = path.join(__dirname, '../custome_resources/news/context')
const NEWS_IMG_DIR = path.join(__dirname, '../custome_resources/img/news')
const CLEANUP_AGE_MS = 30 * 24 * 60 * 60 * 1000

const NEWS_LIST_API = 'https://api.esocn.com.cn/api/news/getNewsList'
const NEWS_DETAIL_API = 'https://api.esocn.com.cn/api/news/getNewsDetail'
const CACHE_EXPIRE_MS = 60 * 60 * 1000

const NEWS_CMD_REG = '^#*(新闻列表)$'
const NEWS_REFRESH_REG = '^#*(刷新新闻列表|更新新闻列表)$'
const NEWS_DETAIL_REG = '^#新闻(\\d+)$'
const NEWS_DETAIL_REFRESH_REG = '^#(更新新闻|刷新新闻)(\\d+)$'

let newsCache = { md5: '', img: '' }
let newsDetailCache = {}

function stripHtml(html) {
  if (!html || typeof html !== 'string') return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function cleanupOldFiles(dir, maxAgeMs) {
  if (!fs.existsSync(dir)) return
  try {
    const files = fs.readdirSync(dir)
    const now = Date.now()
    for (const f of files) {
      const fp = path.join(dir, f)
      const stat = fs.statSync(fp)
      if (stat.isFile() && now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(fp)
        logger.info('[新闻] 删除过期文件: ' + fp)
      }
    }
  } catch (err) {
    logger.error('[新闻] 清理失败: ' + (err?.message || err))
  }
}

export class news extends plugin {
  constructor () {
    super({
      name: 'ESO:新闻列表',
      dsc: '查询《上古卷轴OL》新闻资讯',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: NEWS_CMD_REG, fnc: 'queryNewsList' },
        { reg: NEWS_REFRESH_REG, fnc: 'refreshNewsList' },
        { reg: NEWS_DETAIL_REG, fnc: 'queryNewsDetail' },
        { reg: NEWS_DETAIL_REFRESH_REG, fnc: 'refreshNewsDetail' }
      ]
    })
  }

  async queryNewsList (e) {
    const needFetch = !this.isCacheValid()
    if (needFetch) await this.reply('正在查询新闻列表…')
    const data = await this.getNewsData(false)
    if (!data) return
    const img = await this.cache(data)
    await this.reply(img)
    cleanupOldFiles(NEWS_IMG_DIR, CLEANUP_AGE_MS)
  }

  async queryNewsDetail (e) {
    const match = e.msg?.match(/^#新闻(\d+)$/)
    const id = match ? match[1] : ''
    if (!id) return
    let data = await this.loadNewsDetailFromLocal(id)
    if (!data) {
      await this.reply('正在获取新闻详情…')
      data = await this.fetchNewsDetailFromApi(id)
    }
    if (!data) return
    const img = await this.cacheDetail(id, data)
    await this.reply(img)
    cleanupOldFiles(CONTEXT_DIR, CLEANUP_AGE_MS)
    cleanupOldFiles(NEWS_IMG_DIR, CLEANUP_AGE_MS)
  }

  async refreshNewsDetail (e) {
    const match = e.msg?.match(/^#(更新新闻|刷新新闻)(\d+)$/)
    const id = match ? match[2] : ''
    if (!id) return
    await this.reply('正在刷新新闻详情…')
    const data = await this.fetchNewsDetailFromApi(id)
    if (!data) return
    const img = await this.cacheDetail(id, data)
    await this.reply(img)
    cleanupOldFiles(CONTEXT_DIR, CLEANUP_AGE_MS)
    cleanupOldFiles(NEWS_IMG_DIR, CLEANUP_AGE_MS)
  }

  isCacheValid () {
    if (!fs.existsSync(CONFIG_PATH)) return false
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
      const cached = JSON.parse(raw)
      const savedAt = cached.savedAt ? new Date(cached.savedAt).getTime() : 0
      return Date.now() - savedAt < CACHE_EXPIRE_MS
    } catch (_) {
      return false
    }
  }

  async refreshNewsList (e) {
    await this.reply('正在刷新新闻列表…')
    const data = await this.getNewsData(true)
    if (!data) return
    const img = await this.cache(data)
    await this.reply(img)
    cleanupOldFiles(NEWS_IMG_DIR, CLEANUP_AGE_MS)
  }

  async getNewsData (forceRefresh) {
    const data = await this.loadNewsData(forceRefresh)
    if (!data || !Array.isArray(data.list) || data.list.length === 0) {
      if (!forceRefresh) await this.reply('暂无新闻数据，请尝试 #刷新新闻列表')
      return null
    }

    const _path = process.cwd().replace(/\\/g, '/')
    const tplData = {
      init: 'done',
      saveId: 'news',
      tplFile: './plugins/eso/resources/html/news/news.html',
      pluResPath: `${_path}/plugins/eso/resources/`,
      customeResPath: `${_path}/plugins/eso/custome_resources/`,
      list: [],
      updateTime: data.savedAt || moment().format('YYYY-MM-DD HH:mm:ss')
    }

    for (const it of data.list.slice(0, 10)) {
      const cover = (it.cover || '').trim()
      let coverPath = ''
      if (cover && (cover.startsWith('http://') || cover.startsWith('https://'))) {
        try {
          coverPath = await getimgs.realpath(cover, 'news')
        } catch (err) {
          logger.debug('[新闻列表] 封面加载失败: ' + (err?.message || ''))
        }
      }
      const newsId = it.id != null ? String(it.id) : ''
      tplData.list.push({
        coverPath: coverPath || '',
        date: it.date || '',
        name: it.name || '',
        des: it.des || '',
        id: newsId,
        cmdText: newsId ? '#新闻' + newsId : ''
      })
    }

    return tplData
  }

  async loadNewsDetailFromLocal (id) {
    const ctxPath = path.join(CONTEXT_DIR, `${id}.json`)
    if (!fs.existsSync(ctxPath)) return null
    try {
      const raw = fs.readFileSync(ctxPath, 'utf8')
      const detail = JSON.parse(raw)
      return await this.buildTplDataFromDetail(detail, id)
    } catch (err) {
      logger.debug('[新闻详情] 读取本地失败: ' + (err?.message || ''))
      return null
    }
  }

  async buildTplDataFromDetail (detail, id) {
    const cover = (detail.cover || '').trim()
    let coverPath = ''
    if (cover && (cover.startsWith('http://') || cover.startsWith('https://'))) {
      try {
        coverPath = await getimgs.realpath(cover, 'news')
      } catch (err) {
        logger.debug('[新闻详情] 封面加载失败: ' + (err?.message || ''))
      }
    }

    let contentHtml = (detail.content || '').trim()
    const bodyMatch = contentHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    if (bodyMatch) contentHtml = bodyMatch[1]

    const _path = process.cwd().replace(/\\/g, '/')
    return {
      init: 'done',
      saveId: 'newsDetail_' + id,
      tplFile: './plugins/eso/resources/html/news/newsDetails.html',
      pluResPath: `${_path}/plugins/eso/resources/`,
      id: detail.id,
      name: detail.name || '',
      date: detail.date || '',
      des: detail.des || '',
      content: contentHtml,
      coverPath: coverPath || ''
    }
  }

  async fetchNewsDetailFromApi (id) {
    let res
    try {
      res = await fetch(`${NEWS_DETAIL_API}/${id}`)
    } catch (err) {
      logger.error('[新闻详情] 请求失败: ' + (err && err.message))
      await this.reply('接口请求失败，请稍后再试。')
      return null
    }

    if (!res || !res.ok) {
      logger.error('[新闻详情] 接口异常: ' + (res && res.status))
      await this.reply('未找到该新闻或接口异常。')
      return null
    }

    let json
    try {
      json = await res.json()
    } catch (err) {
      logger.error('[新闻详情] 解析失败: ' + (err && err.message))
      await this.reply('数据解析失败，请稍后再试。')
      return null
    }

    if (!json.success || !json.data) {
      await this.reply('未找到该新闻。')
      return null
    }

    const detail = json.data
    const ctxDir = CONTEXT_DIR
    if (!fs.existsSync(ctxDir)) fs.mkdirSync(ctxDir, { recursive: true })
    const ctxPath = path.join(ctxDir, `${id}.json`)
    try {
      fs.writeFileSync(ctxPath, JSON.stringify(detail, null, 2), 'utf8')
    } catch (err) {
      logger.error('[新闻详情] 保存失败: ' + (err?.message || err))
    }

    return this.buildTplDataFromDetail(detail, id)
  }

  async loadNewsData (forceRefresh) {
    const dir = path.dirname(CONFIG_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    if (!forceRefresh && fs.existsSync(CONFIG_PATH)) {
      try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
        const cached = JSON.parse(raw)
        const savedAt = cached.savedAt ? new Date(cached.savedAt).getTime() : 0
        if (Date.now() - savedAt < CACHE_EXPIRE_MS) {
          return cached
        }
      } catch (_) {}
    }

    let res
    try {
      res = await fetch(NEWS_LIST_API + '?params%5Bpage%5D=1&params%5Blimit%5D=10')
    } catch (err) {
      logger.error('[新闻列表] 请求失败: ' + (err && err.message))
      if (forceRefresh) await this.reply('接口请求失败，请稍后再试。')
      return null
    }

    if (!res || !res.ok) {
      logger.error('[新闻列表] 接口异常: ' + (res && res.status))
      if (forceRefresh) await this.reply('接口返回异常，请稍后再试。')
      return null
    }

    let json
    try {
      json = await res.json()
    } catch (err) {
      logger.error('[新闻列表] 解析失败: ' + (err && err.message))
      if (forceRefresh) await this.reply('数据解析失败，请稍后再试。')
      return null
    }

    if (!json.success || !json.data || !Array.isArray(json.data.list)) {
      if (forceRefresh) await this.reply('暂无新闻数据。')
      return null
    }

    const savedAt = moment().toISOString()
    const cacheData = {
      savedAt,
      list: json.data.list
    }

    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cacheData, null, 2), 'utf8')
    } catch (err) {
      logger.error('[新闻列表] 保存缓存失败: ' + (err?.message || err))
    }

    return cacheData
  }

  async cache (data) {
    const tmp = md5(JSON.stringify(data))
    if (newsCache.md5 === tmp) return newsCache.img
    newsCache.img = await puppeteer.screenshot('news', data)
    newsCache.md5 = tmp
    return newsCache.img
  }

  async cacheDetail (id, data) {
    const tmp = md5(JSON.stringify(data))
    if (newsDetailCache[id]?.md5 === tmp) return newsDetailCache[id].img
    const img = await puppeteer.screenshot('news', data)
    newsDetailCache[id] = { md5: tmp, img }
    return img
  }
}
