/**
 * dsh-bili — 结衣的 B 站工具
 *
 * 为什么自己写而不直接用 dsh-bili-watch：
 *   插件是黑盒，风控（-352）需要【精确控制请求头 + 限速 + wbi 签名】，
 *   这三件事都必须能改。所以这里自己实现，插件保留作为兜底。
 *
 * 踩过的坑（都在代码里对应修掉了）：
 *   ① 缺 Referer/Origin → B 站 2023+ 一律回 -352 风控
 *   ② 无 wbi 签名      → /x/space/wbi/arc/search 回 -403 访问权限不足
 *   ③ 无速率限制       → 连发几个就"请求过于频繁"→ 跳验证码
 *
 * 凭证：复用 dsh-bili-watch 的 ~/.dsh/bili-watch/credential.json
 *       （sessdata / bili_jct / buvid3 / buvid4）
 */

import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const TIMEOUT = 20000
const MIN_INTERVAL = 1500 // 两次请求最小间隔（ms）——防风控
const CACHE_TTL = 5 * 60 * 1000

let _ctx = null
function log(msg) {
  const line = `[dsh-bili] ${msg}`
  try { _ctx?.logger?.info?.(line) } catch { /* 不管 */ }
  try { console.log(line) } catch { /* 不管 */ }
}

// ───────────────────────── 凭证 ─────────────────────────

let _cred = null
function cred() {
  if (_cred) return _cred
  const p = process.env.TRSS_BILI_CREDENTIAL
    || join(process.cwd(), 'data', 'eso', 'bili-watch', 'credential.json')
  try {
    if (existsSync(p)) {
      const j = JSON.parse(readFileSync(p, 'utf8'))
      _cred = {
        sessdata: j.sessdata || '',
        bili_jct: j.bili_jct || '',
        dedeuserid: j.dedeuserid || '',
        buvid3: j.buvid3 || '',
        buvid4: j.buvid4 || '',
      }
      return _cred
    }
  } catch { /* 读不到就用匿名 */ }
  _cred = { sessdata: '', bili_jct: '', dedeuserid: '', buvid3: '', buvid4: '' }
  return _cred
}

function cookieStr() {
  const c = cred()
  const bits = []
  if (c.sessdata) bits.push(`SESSDATA=${c.sessdata}`)
  if (c.bili_jct) bits.push(`bili_jct=${c.bili_jct}`)
  if (c.dedeuserid) bits.push(`DedeUserID=${c.dedeuserid}`)
  if (c.buvid3) bits.push(`buvid3=${c.buvid3}`)
  if (c.buvid4) bits.push(`buvid4=${c.buvid4}`)
  return bits.join('; ')
}

const loggedIn = () => !!cred().sessdata

// ───────────────────────── 限速 ─────────────────────────

let _lastAt = 0
async function pace() {
  const wait = MIN_INTERVAL - (Date.now() - _lastAt)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  _lastAt = Date.now()
}

// ───────────────────────── wbi 签名 ─────────────────────────

// B 站官方 mixinKey 置换表（64 项）
const MIXIN_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39,
  12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6,
  63, 57, 62, 11, 36, 20, 34, 44, 52,
]

const md5 = (s) => createHash('md5').update(s).digest('hex')

let _mixin = ''
let _mixinAt = 0

/** 取 mixin_key（15 分钟刷新一次） */
async function mixinKey(force = false) {
  if (!force && _mixin && Date.now() - _mixinAt < 15 * 60 * 1000) return _mixin
  const nav = await rawJson('https://api.bilibili.com/x/web-interface/nav')
  const w = nav?.data?.wbi_img || {}
  const key = (u) => String(u || '').split('/').pop().split('.')[0]
  const raw = key(w.img_url) + key(w.sub_url)
  if (raw.length < 64) throw new Error('拿不到 wbi keys（可能未登录或接口变了）')
  _mixin = MIXIN_TAB.map((i) => raw[i]).join('').slice(0, 32)
  _mixinAt = Date.now()
  return _mixin
}

/** 给参数加 wts + w_rid，返回 query 串 */
async function signParams(params) {
  const mk = await mixinKey()
  const wts = Math.floor(Date.now() / 1000)
  const p = { ...params, wts }
  const q = Object.keys(p)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(p[k]).replace(/[!'()*]/g, ''))}`)
    .join('&')
  return `${q}&w_rid=${md5(q + mk)}`
}

// ───────────────────────── HTTP ─────────────────────────

const CACHE = new Map()

/**
 * 发请求。referer 按接口不同而变（B 站会校验）。
 * 不做缓存、不做重试 —— 由上层决定。
 */
async function rawJson(url, referer = 'https://www.bilibili.com/') {
  await pace()
  const headers = {
    'user-agent': UA,
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9',
    referer,
    origin: new URL(referer).origin,
  }
  const ck = cookieStr()
  if (ck) headers.cookie = ck
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

/** 带缓存 + 风控识别 */
async function api(url, { referer, ttl = CACHE_TTL, signed = false } = {}) {
  const ck = `${signed ? 'wbi:' : ''}${url}`
  const hit = CACHE.get(ck)
  if (hit && Date.now() - hit.at < ttl) return hit.data

  let j = await rawJson(url, referer)
  // -352 风控 / -403 权限 → 刷一次 mixin_key 再试
  if ((j?.code === -352 || j?.code === -403 || j?.code === -412) && !hit) {
    await mixinKey(true)
    await new Promise((r) => setTimeout(r, 2000))
    j = await rawJson(url, referer)
  }
  if (j?.code === -352) throw new Error('B 站风控（-352）：请求太频繁或请求头被识别，等几分钟再试')
  if (j?.code === -412) throw new Error('B 站风控（-412）：被限流了，等几分钟再试')
  if (j?.code === -404) throw new Error('B 站返回 -404：目标不存在')
  if (j?.code === -403) throw new Error('B 站返回 -403：访问权限不足（可能签名失效）')
  if (j?.code === 0) {
    CACHE.set(ck, { at: Date.now(), data: j.data })
    return j.data
  }
  throw new Error(`B 站接口错误 code=${j?.code}：${j?.message || ''}`)
}

// ───────────────────────── 小工具 ─────────────────────────

function plain(s, max = 400) {
  if (s == null) return ''
  let t = String(s)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length > max) t = t.slice(0, max) + '…'
  return t
}

function dur(sec) {
  // vlist 里的 length 是 "12:34" 这种字符串，不是秒数
  if (typeof sec === 'string' && sec.includes(':')) return sec
  const s = Number(sec) || 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`
}

function timeCn(ts) {
  if (!ts) return ''
  const d = new Date(Number(ts) * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const num = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v ?? '')
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return String(n)
}

// ───────────────────────── 核心数据 ─────────────────────────

/** UP 主基本信息（card 接口，限制最松） */
async function upInfo(mid) {
  const d = await api(`https://api.bilibili.com/x/web-interface/card?mid=${mid}`, {
    referer: `https://space.bilibili.com/${mid}`,
  })
  const c = d?.card || {}
  return {
    mid: String(mid),
    name: plain(c.name, 40),
    sign: plain(c.sign, 200),
    face: plain(c.face, 200),
    level: c.level,
    follower: d?.follower,
    archiveCount: c?.archive_count ?? d?.archive_count ?? null,
    likeNum: c?.likes,
  }
}

/** UP 的全部视频（自动翻页 + wbi 签名 + 可选过滤） */
async function upVideos(mid, { limit, order = 'pubdate', maxPages = 20 } = {}) {
  const out = []
  let total = 0
  const ps = 30
  for (let pn = 1; pn <= maxPages; pn++) {
    const q = await signParams({ mid: String(mid), ps, pn, order })
    const d = await api(`https://api.bilibili.com/x/space/wbi/arc/search?${q}`, {
      referer: `https://space.bilibili.com/${mid}/video`,
      signed: true,
    })
    const page = d?.page || {}
    total = Number(page.count) || total
    const list = d?.list?.vlist || []
    for (const v of list) {
      out.push({
        bvid: v.bvid,
        aid: v.aid,
        title: plain(v.title, 120),
        desc: plain(v.description, 300),
        play: v.play,
        length: v.length,
        created: v.created,
        createdText: timeCn(v.created),
        comment: v.comment,
      })
    }
    if (!list.length || out.length >= total) break
    if (limit && out.length >= limit) break
  }
  if (limit) out.length = Math.min(out.length, limit)
  return { total, videos: out }
}

/** 单个视频信息 */
async function videoInfo(bvid) {
  const d = await api(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`, {
    referer: `https://www.bilibili.com/video/${bvid}`,
  })
  return {
    bvid: d.bvid,
    aid: d.aid,
    cid: d.cid,
    title: plain(d.title, 160),
    desc: plain(d.desc, 800),
    owner: plain(d?.owner?.name, 40),
    ownerMid: d?.owner?.mid,
    duration: dur(d.duration),
    tname: d.tname,
    pubdate: timeCn(d.pubdate),
    view: d.stat?.view,
    like: d.stat?.like,
    danmaku: d.stat?.danmaku,
    reply: d.stat?.reply,
    pages: (d.pages || []).map((p) => ({ cid: p.cid, page: p.page, part: plain(p.part, 60), duration: dur(p.duration) })),
  }
}

/** 取字幕（优先 AI 中文），返回 [{lan, lan_doc, text}] */
async function videoSubs(bvid, cidArg) {
  const info = cidArg ? null : await videoInfo(bvid)
  const cid = cidArg || info.cid
  const d = await api(`https://api.bilibili.com/x/player/v2?bvid=${encodeURIComponent(bvid)}&cid=${cid}`, {
    referer: `https://www.bilibili.com/video/${bvid}`,
    ttl: 10 * 60 * 1000,
  })
  const subs = (d?.subtitle?.subtitles || []).filter((s) => s.subtitle_url)
  if (!subs.length) {
    return { has: false, list: [], hint: loggedIn() ? '这个视频没有字幕（UP 没传也没开 AI 字幕）' : '未登录，AI 字幕取不到' }
  }
  // 中文优先
  subs.sort((a, b) => {
    const score = (x) => (/zh/i.test(x.lan || '') ? 0 : /ai-zh/i.test(x.lan || '') ? 1 : 2)
    return score(a) - score(b)
  })
  const out = []
  for (const s of subs.slice(0, 3)) {
    try {
      const url = s.subtitle_url.startsWith('//') ? `https:${s.subtitle_url}` : s.subtitle_url
      const j = await rawJson(url, `https://www.bilibili.com/video/${bvid}`)
      const body = (j?.body || []).map((x) => plain(x.content, 400)).filter(Boolean)
      out.push({ lan: s.lan, lan_doc: s.lan_doc, lines: body.length, text: body.join('\n') })
    } catch (e) {
      out.push({ lan: s.lan, lan_doc: s.lan_doc, lines: 0, text: '', error: String(e?.message || e) })
    }
  }
  return { has: true, list: out, hint: '' }
}

/** 关键词搜视频（wbi） */
async function searchVideo(keyword, { page = 1, order = 'totalrank', days } = {}) {
  const q = await signParams({
    search_type: 'video',
    keyword: String(keyword),
    page: String(page),
    page_size: '30',
    order,
  })
  const d = await api(`https://api.bilibili.com/x/web-interface/wbi/search/type?${q}`, {
    referer: 'https://search.bilibili.com/',
    signed: true,
    ttl: 2 * 60 * 1000,
  })
  let list = (d?.result || []).map((v) => ({
    bvid: v.bvid,
    title: plain(v.title, 120),
    author: plain(v.author, 40),
    mid: v.mid,
    play: v.play,
    danmaku: v.video_review,
    duration: v.duration,
    pubdate: v.pubdate,
    createdText: timeCn(v.pubdate),
  }))
  if (days) {
    const cut = Date.now() / 1000 - Number(days) * 86400
    list = list.filter((v) => Number(v.pubdate) >= cut)
  }
  return { total: d?.numResults, list }
}

/** 兜底：抓主页 HTML 的 <title> */
async function htmlTitle(url) {
  await pace()
  const headers = { 'user-agent': UA, referer: 'https://www.bilibili.com/' }
  const ck = cookieStr()
  if (ck) headers.cookie = ck
  const r = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const html = await r.text()
  const m = html.match(/<title>([^<]*)<\/title>/i)
  return m ? plain(m[1], 200) : ''
}

// ───────────────────────── 渲染 ─────────────────────────

function renderUp(u) {
  const out = [`【${u.name}】`, `  UID：${u.mid}`]
  if (u.sign) out.push(`  签名：${u.sign}`)
  out.push(`  粉丝：${num(u.follower)}｜投稿：${u.archiveCount ?? '待查'} 个${u.likeNum ? `｜获赞 ${num(u.likeNum)}` : ''}`)
  out.push(`  主页：https://space.bilibili.com/${u.mid}`)
  return out.join('\n')
}

function renderVideo(v) {
  const out = [
    `【${v.title}】`,
    `  UP：${v.owner}｜分区：${v.tname || '?'}｜时长：${v.duration}｜发布：${v.pubdate}`,
    `  播放 ${num(v.view)}｜点赞 ${num(v.like)}｜弹幕 ${num(v.danmaku)}｜评论 ${num(v.reply)}`,
  ]
  if (v.desc) out.push(`  简介：${v.desc}`)
  if (v.pages.length > 1) {
    out.push(`  分P（${v.pages.length}）：`)
    for (const p of v.pages.slice(0, 10)) out.push(`    ${p.page}. ${p.part} (${p.duration})`)
  }
  out.push(`  链接：https://www.bilibili.com/video/${v.bvid}`)
  return out.join('\n')
}

function renderVideoList(videos, total, { mid, keyword } = {}) {
  if (!videos.length) return '没找到视频。'
  const out = [`共 ${total ?? videos.length} 个，列出 ${videos.length} 个：`]
  for (const v of videos) {
    const bits = [`${v.createdText || v.pubdate || ''}`, `${num(v.play)} 播放`, dur(Number(v.length) || 0)]
    out.push(`\n▸ ${v.title}`)
    out.push(`  ${bits.filter(Boolean).join('｜')}｜${v.bvid}`)
    if (v.desc) out.push(`  ${v.desc}`)
  }
  return out.join('\n')
}

// ───────────────────────── 工具 ─────────────────────────

function buildTools() {
  const T = (name, description, parameters, fn) =>
    ({
      name,
      description,
      parameters,
      timeoutMs: 60000,
      async run(args) {
        try {
          return { content: String(await fn(args || {})) }
        } catch (e) {
          return { content: `查询失败：${e?.message || e}`, isError: true }
        }
      },
    })

  return [
    T(
      'bili_up',
      '【B站】按 UID 查一个 UP 主是谁：昵称、签名、粉丝数、投稿数、主页链接。' +
        '用户给出数字 UID（或 space.bilibili.com/数字）时用。',
      { mid: { type: 'string', description: 'UP 主 UID，如 436157847' } },
      async (a) => {
        const mid = String(a.mid || '').replace(/\D/g, '')
        if (!mid) throw new Error('请给出数字 UID')
        return renderUp(await upInfo(mid))
      }
    ),

    T(
      'bili_up_videos',
      '【B站】列某个 UP 主的视频作品（自动翻页，可拿全部）。' +
        '用户要"看看他都有什么视频""哪些跟XX有关"时用。' +
        '支持用 keyword 在标题+简介里本地过滤，order 可选 pubdate(最新)/click(最热)。',
      {
        mid: { type: 'string', description: 'UP 主 UID' },
        keyword: { type: 'string', description: '在标题/简介里过滤的关键词（多个用空格，全部命中）' },
        limit: { type: 'number', description: '最多返回几个，默认 30，拿全部传 0' },
        order: { type: 'string', enum: ['pubdate', 'click'], description: 'pubdate=最新（默认）；click=播放最多' },
        maxPages: { type: 'number', description: '最多翻几页（每页 30），默认 20 页=600 个' },
      },
      async (a) => {
        const mid = String(a.mid || '').replace(/\D/g, '')
        if (!mid) throw new Error('请给出数字 UID')
        const lim = a.limit === 0 ? undefined : Number(a.limit) || 30
        const { total, videos } = await upVideos(mid, {
          limit: lim,
          order: String(a.order || 'pubdate'),
          maxPages: Math.max(1, Math.min(Number(a.maxPages) || 20, 50)),
        })
        let list = videos
        const kw = String(a.keyword || '').trim()
        if (kw) {
          const words = kw.toLowerCase().split(/\s+/).filter(Boolean)
          list = videos.filter((v) => {
            const blob = `${v.title} ${v.desc}`.toLowerCase()
            return words.every((w) => blob.includes(w))
          })
        }
        const head = kw ? `（在 ${videos.length} 个里过滤「${kw}」，命中 ${list.length} 个）\n` : ''
        return head + renderVideoList(list, total, { mid, keyword: kw })
      }
    ),

    T(
      'bili_video',
      '【B站】按 BV 号查单个视频：标题、UP、播放/点赞/弹幕、简介、分P、链接。',
      { bvid: { type: 'string', description: 'BV 号，如 BV1GJ411x7h7' } },
      async (a) => {
        const bv = String(a.bvid || '').trim()
        if (!/^BV/i.test(bv)) throw new Error('请给出 BV 号（以 BV 开头）')
        return renderVideo(await videoInfo(bv))
      }
    ),

    T(
      'bili_subs',
      '【B站】取视频字幕（优先 AI 中文字幕）。拿到字幕后由你负责理解与总结。' +
        '用户要"看看这个视频讲了什么"时，先用这个拿原文，再总结。',
      {
        bvid: { type: 'string', description: 'BV 号' },
        maxChars: { type: 'number', description: '正文最多返回多少字，默认 6000' },
      },
      async (a) => {
        const bv = String(a.bvid || '').trim()
        if (!/^BV/i.test(bv)) throw new Error('请给出 BV 号')
        const info = await videoInfo(bv)
        const r = await videoSubs(bv, info.cid)
        if (!r.has) return `【${info.title}】\n${r.hint}`
        const cap = Math.max(1000, Math.min(Number(a.maxChars) || 6000, 30000))
        const best = r.list[0]
        let body = best.text
        const trunc = body.length > cap
        if (trunc) body = body.slice(0, cap) + `\n…（全文字数 ${best.text.length}，已截断）`
        const head = [
          `【${info.title}】`,
          `UP：${info.owner}｜时长：${info.duration}｜发布：${info.pubdate}`,
          `字幕：${best.lan_doc || best.lan}（${best.lines} 段）${r.list.length > 1 ? `，另有 ${r.list.length - 1} 种语言` : ''}`,
          '',
        ]
        return head.join('\n') + body
      }
    ),

    T(
      'bili_search',
      '【B站】按关键词搜视频。可按 days 限制最近 N 天，按播放量排序找热门的。',
      {
        keyword: { type: 'string', description: '搜索关键词，如「ESO 坦克视角」' },
        days: { type: 'number', description: '只保留最近 N 天发布的' },
        order: {
          type: 'string',
          enum: ['totalrank', 'click', 'pubdate', 'dm', 'stow'],
          description: 'totalrank=综合（默认）；click=播放多；pubdate=最新',
        },
        limit: { type: 'number', description: '最多几个，默认 15' },
      },
      async (a) => {
        const kw = String(a.keyword || '').trim()
        if (!kw) throw new Error('请给出搜索关键词')
        const r = await searchVideo(kw, { order: String(a.order || 'totalrank'), days: a.days })
        const lim = Math.max(1, Math.min(Number(a.limit) || 15, 40))
        if (!r.list.length) return `没搜到「${kw}」的视频${a.days ? `（限最近 ${a.days} 天）` : ''}。`
        const out = [`共 ${r.total ?? r.list.length} 条，列出 ${Math.min(lim, r.list.length)} 条（按${{ totalrank: '综合', click: '播放', pubdate: '最新', dm: '弹幕', stow: '收藏' }[a.order] || '综合'}排）：`]
        for (const v of r.list.slice(0, lim)) {
          out.push(`\n▸ ${v.title}`)
          out.push(`  UP：${v.author}｜${v.createdText}｜${num(v.play)} 播放｜${dur(Number(v.duration))}｜${v.bvid}`)
        }
        return out.join('\n')
      }
    ),

    T(
      'bili_page',
      '【B站】兜底工具：直接抓 B 站页面的 <title>。' +
        'API 全被风控时用它至少能确认"这个链接/UID 是谁"。传完整 URL。',
      { url: { type: 'string', description: 'B站页面 URL，如 https://space.bilibili.com/436157847' } },
      async (a) => {
        const u = String(a.url || '').trim()
        if (!/^https?:\/\//i.test(u)) throw new Error('请给出完整 http(s) 链接')
        const t = await htmlTitle(u)
        return t ? `页面标题：${t}\n（这是兜底方式，只能拿到标题，拿不到详细数据）` : '页面没有 title（可能被拦了验证码页）'
      }
    ),
  ]
}

export const _internal = {
  upInfo, upVideos, videoInfo, videoSubs, searchVideo, htmlTitle,
  signParams, mixinKey, renderUp, renderVideo, renderVideoList,
  pace, plain, dur, timeCn, num,
}

export default buildTools()
