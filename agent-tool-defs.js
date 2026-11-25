import fs from 'node:fs'
import database, {
  getScriptList,
  isSetIndexResultEmpty,
  resolveSetIndexEntry
} from './model/database.js'
import undauntedApi from './model/undauntedApi.js'
import { getServerStatusText } from './apps/serverStatus.js'
import { decodeShareLink } from './model/sssDecoder.js'
import { muteGroupMember, recallGroupMessage } from './model/groupModeration.js'
import SpeechAnalytics from './model/speechAnalytics.js'
import SteamPlayRecords from './model/steamPlayRecords.js'
import SteamUser from './model/steamUser.js'
import biliApiTools from './bili-api.js'
import biliWatchTool from './bili-watch-tool.js'

const API = 'https://api.esocn.com.cn'

function stripHtml (value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cleanQuery (value) {
  return String(value ?? '')
    .trim()
    .replace(/^[#*%!！]+/, '')
    .replace(/装备名|套装名|装备|套装/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function apiJson (path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'user-agent': 'TRSS-ESO-Agent',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {})
    },
    signal: AbortSignal.timeout(options.timeout ?? 20000)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}（${path}）`)
  const payload = await response.json()
  if (payload?.success === false) throw new Error(payload?.message || `接口失败（${path}）`)
  return payload?.data ?? payload
}

function asList (value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  for (const key of ['list', 'items', 'records', 'builds', 'guides', 'activities', 'dungeons', 'trials', 'arenas']) {
    if (Array.isArray(value[key])) return value[key]
  }
  return []
}

async function indexKeys (query, type, limit = 8) {
  const keys = await database.name2index(query, type)
  if (isSetIndexResultEmpty(keys)) return []
  return keys.slice(0, limit).map(entry => resolveSetIndexEntry(entry).setKey)
}

function itemName (item) {
  return item?.new_cn_name || item?.name || item?.title || item?.src_cn_name || '?'
}

function itemEn (item) {
  return stripHtml(item?.new_en_name || item?.name_en || item?.src_en_name || item?.enName || '')
}

function antiquityLeadLines (lead, index, includeLore = false) {
  const name = lead?.name || lead?.enName || '未知线索'
  const en = String(lead?.enName || '').replace(/[<>]/g, '')
  const lines = [`${index}. 【${name}】${en && en !== name ? ` <${en}>` : ''}`]
  lines.push(`   图标：${lead?.iconUrl || '未获取'}`)
  if (lead?.dropHint) lines.push(`   出处：${lead.dropHint}`)
  if (lead?.dropType && lead.dropType !== lead.dropHint) lines.push(`   获取方式：${lead.dropType}`)
  if (lead?.zoneName) lines.push(`   地区：${lead.zoneName}`)
  if (lead?.itemTypeName) lines.push(`   物品类型：${lead.itemTypeName}`)
  if (lead?.quality) lines.push(`   品质：${lead.quality}`)
  if (lead?.difficulty) lines.push(`   难度：${lead.difficulty}`)
  if (includeLore && Array.isArray(lead?.loreEntries) && lead.loreEntries.length) {
    lines.push('   线索故事：')
    for (const entry of lead.loreEntries) {
      lines.push(`   · ${entry?.name || '佚名'}：${stripHtml(entry?.description || '')}`)
    }
  }
  return lines
}

function formatAntiquityLeads (leads, includeLore = false, heading = '古物线索') {
  if (!Array.isArray(leads) || leads.length === 0) return ''
  const lines = [`${heading}（${leads.length}）：`]
  leads.forEach((lead, index) => lines.push(...antiquityLeadLines(lead, index + 1, includeLore)))
  return lines.join('\n')
}

function antiquityImageParts (leads, max = 8) {
  const images = []
  const seen = new Set()
  for (const lead of leads) {
    const file = String(lead?.iconPath || '')
    if (!file || seen.has(file) || !fs.existsSync(file)) continue
    try {
      images.push({ type: 'image', data: fs.readFileSync(file).toString('base64'), mime: 'image/png' })
      seen.add(file)
      if (images.length >= max) break
    } catch {}
  }
  return images
}

function formatItem (item, index = 0) {
  const name = itemName(item)
  const en = itemEn(item)
  const lines = [`${index ? `${index}. ` : ''}【${name}】${en && !en.includes(name) ? ` <${en.replace(/[<>]/g, '')}>` : ''}`]
  if (item.type_cn || item.type) lines.push(`类型：${item.type_cn || item.type}`)
  if (item.weight) lines.push(`护甲：${item.weight}`)
  if (item.place_cn || item.place) lines.push(`出处：${item.place_cn || item.place}${item.place_en ? `（${stripHtml(item.place_en)}）` : ''}`)
  if (item.place_en && !(item.place_cn || item.place)) lines.push(`出处：${stripHtml(item.place_en)}`)
  if (Array.isArray(item.p_name) && Array.isArray(item.p_value)) {
    item.p_name.forEach((key, i) => {
      if (item.p_value[i]) lines.push(`${key}：${stripHtml(item.p_value[i])}`)
    })
  }
  const messages = Array.isArray(item.msg) ? item.msg : []
  for (const message of messages) {
    const plain = stripHtml(message)
    if (plain) lines.push(plain)
  }
  const extra = stripHtml(item.new_msg)
  if (extra && !lines.some(line => line.includes(extra))) lines.push(extra)
  if (Array.isArray(item.antiquityLeads) && item.antiquityLeads.length) {
    lines.push('', formatAntiquityLeads(item.antiquityLeads))
  } else if (item.isAntiquity || item.type === '神话') {
    lines.push('', '古物线索：暂未查到')
  }
  return lines.join('\n')
}

async function loadAtlasItems (query, searchType, dataType, limit = 8) {
  const keys = await indexKeys(query, searchType, limit)
  const items = []
  for (const key of keys) {
    try {
      const data = await database.updateData(key, dataType)
      const item = data?.atlasData?.[1]
      if (item) items.push(item)
    } catch (err) {
      logger.warn(`[ESO:Agent] 读取 ${key} 失败: ${err?.message || err}`)
    }
  }
  return items
}

function articleText (node) {
  if (node == null) return ''
  if (typeof node === 'string') return stripHtml(node)
  if (Array.isArray(node)) return node.map(articleText).join('')
  if (node.type === 'text') return String(node.text ?? '')
  if (node.type === 'hardBreak') return '\n'
  const children = Array.isArray(node.content) ? node.content.map(articleText).join('') : ''
  return /^(paragraph|heading|listItem|blockquote|codeBlock)$/.test(node.type) ? `${children}\n` : children
}

async function officialNews (id = '') {
  if (String(id).trim()) {
    const data = await apiJson(`/api/news/getNewsDetail/${encodeURIComponent(String(id).trim())}`)
    const body = stripHtml(data?.content || data?.html || '')
    return [
      `【${data?.name || `官方新闻 ${id}`}】`,
      data?.date && `日期：${data.date}`,
      data?.des && `摘要：${stripHtml(data.des)}`,
      body && `正文：\n${body.slice(0, 5000)}`
    ].filter(Boolean).join('\n')
  }
  const data = await apiJson('/api/news/getNewsList')
  const list = asList(data).slice(0, 12)
  return ['官方新闻：', ...list.map((item, index) =>
    `${index + 1}. ${item.name || '?'}（${String(item.date || '').slice(0, 10)}）\n   ${stripHtml(item.des || '')}\n   id: ${item.id}`
  )].join('\n')
}

async function communityNews (id = '') {
  if (String(id).trim()) {
    const data = await apiJson('/api/activity/getDetail', {
      method: 'POST',
      body: JSON.stringify({ activityId: String(id).trim() })
    })
    return [
      `【${data?.title || `社区新闻 ${id}`}】`,
      `日期：${String(data?.createTime || data?.lastUpdateTime || '').slice(0, 10)}`,
      `正文：\n${articleText(data?.article || data?.content || '').slice(0, 5000)}`
    ].filter(Boolean).join('\n')
  }
  const data = await apiJson('/api/activity/list')
  const all = asList(data)
  const community = all.filter(item => String(item.category || '').includes('社区新闻'))
  const list = (community.length ? community : all).slice(0, 12)
  return ['社区新闻：', ...list.map((item, index) =>
    `${index + 1}. ${item.title || '?'}（${String(item.createTime || item.lastUpdateTime || '').slice(0, 10)}）\n   id: ${item.id}`
  )].join('\n')
}

async function buffSources (name) {
  const query = cleanQuery(name)
  const entry = await database.findBuffDebuffByExactName(query)
  if (!entry) return `没找到 Buff「${query}」。`
  const setKeys = await database.setIdsToSetKeys(entry.setsList || [])
  const skillKeys = await database.skillIdsToSkillIndices(entry.skillsList || [])
  const sets = []
  for (const key of setKeys) {
    const data = await database.updateData(key, 1)
    const item = data?.atlasData?.[1]
    if (item) sets.push(`· ${itemName(item)} <${itemEn(item)}> · ${item.place || '未知出处'}`)
  }
  const skills = []
  for (const key of skillKeys) {
    const data = await database.updateData(key, 2)
    const item = data?.atlasData?.[1]
    if (item) skills.push(`· ${itemName(item)} <${itemEn(item)}> · ${item.place_cn || item.type_cn || '技能'}`)
  }
  return [
    `【${entry.displayName || entry.name}】${entry.isBuff ? '增益' : '减益'}`,
    '',
    `套装来源（${sets.length}）`,
    ...(sets.length ? sets : ['（无）']),
    '',
    `技能来源（${skills.length}）`,
    ...(skills.length ? skills : ['（无）'])
  ].join('\n')
}

async function searchDungeons (query, kind = 'all') {
  const sources = kind === 'trial'
    ? [['/api/trials', '试炼']]
    : kind === 'arena'
      ? [['/api/arenas', '竞技场']]
      : kind === 'dungeon'
        ? [['/api/dungeons/dungeon', '4人本']]
        : [['/api/dungeons/dungeon', '4人本'], ['/api/trials', '试炼'], ['/api/arenas', '竞技场']]
  const needle = String(query || '').trim().toLowerCase()
  const hits = []
  for (const [path, label] of sources) {
    const data = await apiJson(path)
    for (const item of asList(data)) {
      const name = String(item.name || '')
      const en = String(item.enName || item.en_name || '')
      if (!needle || name.toLowerCase().includes(needle) || en.toLowerCase().includes(needle)) {
        hits.push({ ...item, _kind: label })
      }
    }
  }
  return [
    `副本搜索结果（${hits.length}）：`,
    ...hits.slice(0, 20).map((item, index) =>
      `${index + 1}. ${item.name || '?'} <${item.enName || item.en_name || ''}> · ${item._kind}${item.dlc ? ` · ${item.dlc}` : ''}`
    )
  ].join('\n')
}

async function dungeonDetail (query) {
  const search = await searchDungeons(query, 'all')
  const enMatch = search.match(/<([^>]+)>/)
  if (!enMatch) return search
  const en = enMatch[1]
  const endpoints = ['/api/dungeons/dungeon', '/api/trials', '/api/arenas']
  for (const endpoint of endpoints) {
    try {
      const data = await apiJson(`${endpoint}/${encodeURIComponent(en)}`)
      return `【${data.name || query}】\n${JSON.stringify(data, null, 2).slice(0, 6500)}`
    } catch {}
  }
  return search
}

async function dailyUndaunted (day = 'today') {
  const offsets = undauntedApi.resolveOffsets()
  const wanted = day === 'all' ? ['yesterday', 'today', 'tomorrow'] : [day]
  const labels = { yesterday: '昨日', today: '今日', tomorrow: '明日' }
  const lines = ['【无畏者誓约】']
  for (const section of wanted) {
    const offset = offsets[section]
    const pledges = await undauntedApi.getPledges(offset)
    const dungeons = []
    for (const en of pledges) {
      try {
        const detail = await undauntedApi.getDungeon(en)
        dungeons.push(`${detail.name || en} <${detail.enName || en}>`)
      } catch {
        dungeons.push(String(en))
      }
    }
    lines.push(`${labels[section]}：`, ...dungeons.map((name, index) => `  ${index + 1}. ${name}`))
  }
  return lines.join('\n')
}

async function vendor (kind = 'golden') {
  const map = {
    golden: ['/api/golden-vendor', '黄金商人'],
    infinite: ['/api/infinite-vendor', '无限商人'],
    luxury: ['/api/luxury-furnisher', '奢侈家具商'],
    telvar: ['/api/tel-var-vendor', '泰尔瓦商人']
  }
  const entries = kind === 'all' ? Object.entries(map) : [[kind, map[kind]]]
  const out = []
  for (const [, [path, label]] of entries) {
    if (!path) continue
    const data = await apiJson(path)
    const items = asList(data)
    out.push(`【${label}】${data?.time ? ` · ${data.time}` : ''}`)
    for (const item of items.slice(0, 40)) {
      const prices = [item.gp != null && `${item.gp}G`, item.ap != null && `${item.ap} AP`].filter(Boolean).join(' / ')
      out.push(`· ${item.setName || item.name || item.title || '?'}${prices ? ` — ${prices}` : ''}`)
    }
  }
  return out.join('\n')
}

async function builds (query = '', version = '', limit = 12) {
  let ver = String(version || '').trim()
  if (!ver) {
    const latest = await apiJson('/api/esocn-version')
    ver = String(latest || '').split('_')[0]
  }
  const params = new URLSearchParams({ page: '1', limit: '100', sortOrder: 'desc' })
  if (ver && ver.toLowerCase() !== 'all') params.set('version', ver)
  const data = await apiJson(`/api/builds/listBuilds?${params}`)
  let list = asList(data)
  const needle = String(query || '').trim().toLowerCase()
  if (needle) list = list.filter(item => JSON.stringify(item).toLowerCase().includes(needle))
  list = list.slice(0, Math.max(1, Math.min(Number(limit) || 12, 30)))
  return [
    `配装列表${ver && ver.toLowerCase() !== 'all' ? `（版本 ${ver}）` : ''}：`,
    ...list.map((item, index) => [
      `${index + 1}. ${item.buildName || item.title || '?'}`,
      `   ${[item.className || item.class, item.role, item.version, item.authorName || item.author].filter(Boolean).join(' · ')}`,
      `   id: ${item.id || item.buildId || ''}`
    ].join('\n'))
  ].join('\n')
}

async function buildDetail (id) {
  const input = String(id || '').trim()
  if (/\|H1:sss:/i.test(input)) {
    const decoded = decodeShareLink(input)
    return `SuperStar 分享码解码：\n${JSON.stringify(decoded, null, 2).slice(0, 7000)}`
  }
  const urlId = input.match(/esocn\.com\.cn\/build\/([A-Za-z0-9_-]+)/i)?.[1]
  const buildId = urlId || input.replace(/^#?\s*(?:配装|构筑|build)\s*/i, '')
  if (!buildId) throw new Error('请给出 ESOCN 配装 ID、链接或 SuperStar 分享码')
  const data = await apiJson('/api/builds/getBuildDetail', {
    method: 'POST',
    body: JSON.stringify({ buildId })
  })
  return `配装详情：\n${JSON.stringify(data, null, 2).slice(0, 7500)}`
}

function formatEsocnUser (data, fallbackName) {
  if (!data?.userId && !data?.username) return ''
  return [
    `【${data.username || fallbackName}】ESOCN 账号`,
    `用户 ID：${data.userId || '未知'}`,
    `等级：${data.rank === '' || data.rank == null ? '未设置' : data.rank}`,
    `游戏 ID（CID）：${data.cid || '未设置'}`,
    `服务器：${data.server || '未设置'}`,
    `定位标签：${data.roleTag || '未设置'}`,
    `玩法标签：${data.playstyleTag || '未设置'}`,
    `头像：${data.avatar || '未设置'}`,
    `签名：${data.sign || '未设置'}`
  ].join('\n')
}

async function esocnUserByName (username) {
  const name = String(username || '').trim().replace(/^@+/, '')
  if (!name) throw new Error('请给出 ESOCN 用户名')
  let data
  try {
    data = await apiJson('/api/user/getUserInfoByName', {
      method: 'POST',
      body: JSON.stringify({ username: name })
    })
  } catch (err) {
    if (/HTTP 404/.test(String(err?.message || err))) return `没找到 ESOCN 用户「${name}」。`
    throw err
  }
  return formatEsocnUser(data, name) || `没找到 ESOCN 用户「${name}」。`
}

async function esocnUserById (userId) {
  const raw = String(userId || '').trim()
  if (!raw) throw new Error('请给出 ESOCN 用户 ID')
  const id = /^\d+$/.test(raw) ? raw.padStart(7, '0') : raw
  let data
  try {
    data = await apiJson('/api/user/getUserInfo', {
      method: 'POST',
      body: JSON.stringify({ userId: id })
    })
  } catch (err) {
    if (/HTTP 404/.test(String(err?.message || err))) return `没找到 ESOCN 用户 ID「${id}」。`
    throw err
  }
  return formatEsocnUser(data, id) || `没找到 ESOCN 用户 ID「${id}」。`
}

async function guides (query = '', category = '', limit = 15) {
  const params = new URLSearchParams({ page: '1', limit: '100' })
  if (category) params.set('category', category)
  const data = await apiJson(`/api/guides/list?${params}`)
  let list = asList(data)
  const needle = String(query || '').trim().toLowerCase()
  if (needle) list = list.filter(item => JSON.stringify(item).toLowerCase().includes(needle))
  list = list.slice(0, Math.max(1, Math.min(Number(limit) || 15, 30)))
  return [
    `攻略列表（${list.length}）：`,
    ...list.map((item, index) =>
      `${index + 1}. ${item.title || '?'} · ${item.category || ''}\n   ${stripHtml(item.summary || item.des || '').slice(0, 160)}\n   id: ${item.id || item.guideId || ''}`
    )
  ].join('\n')
}

async function guideDetail (id, maxChars = 4000) {
  const data = await apiJson('/api/guides/getDetail', {
    method: 'POST',
    body: JSON.stringify({ guideId: String(id).trim() })
  })
  const body = articleText(data?.article || data?.content || data?.summary || '')
  return [
    `【${data?.title || `攻略 ${id}`}】`,
    body.slice(0, Math.max(500, Math.min(Number(maxChars) || 4000, 20000)))
  ].join('\n')
}

async function searchScribing (query = '') {
  const q = cleanQuery(query)
  if (/脚本/.test(q)) {
    const keyword = q.replace(/^.*?脚本\s*/, '')
    const scripts = Object.values(getScriptList('cn'))
      .filter(item => !keyword || String(item.name || '').includes(keyword))
      .slice(0, 30)
    return ['篆刻脚本：', ...scripts.map((item, index) =>
      `${index + 1}. ${item.name || '?'}：${stripHtml(item.description || '').slice(0, 180)}`
    )].join('\n')
  }
  const items = await loadAtlasItems(`*篆刻${q ? ` ${q}` : ''}`, 2, 2, 12)
  if (!items.length) return `没找到篆刻技能「${q || '全部'}」。`
  return items.map((item, index) => formatItem(item, index + 1)).join('\n\n')
}

function formatSteamTime (timestamp) {
  const value = Number(timestamp)
  if (!Number.isFinite(value)) return '未知'
  return new Date(value + 8 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ')
}

function formatSteamDuration (minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  const hours = Math.floor(total / 60)
  const mins = total % 60
  return `${hours ? `${hours}小时` : ''}${mins}分钟`
}

function steamBindingsForQq (qqId, label = '') {
  return SteamUser.getAllBindings(qqId).map(binding => ({
    qqId: String(qqId),
    label: label || String(qqId),
    steamId: String(binding.steamId || ''),
    steamName: String(binding.steamName || '')
  })).filter(binding => binding.steamId)
}

async function groupSteamBindings (args, ctx) {
  const scope = args.scope === 'all' ? 'all' : 'group'
  if (scope === 'all' && !ctx.isAdmin) throw new Error('只有管理员可以查询全部绑定账号的 Steam 游玩历史')

  if (scope === 'all') {
    const bindings = []
    for (const qqId of Object.keys(SteamUser.getAllUsers())) {
      if (args.qq && String(args.qq) !== String(qqId)) continue
      bindings.push(...steamBindingsForQq(qqId))
    }
    return { scope, groupId: '', bindings }
  }

  const groupId = String(args.group || ctx.e?.group_id || '').trim()
  if (!/^\d+$/.test(groupId)) throw new Error('当前不是群聊，请提供群号 group')
  const group = String(ctx.e?.group_id) === groupId
    ? ctx.e.group
    : globalThis.Bot?.[ctx.e?.self_id]?.pickGroup?.(Number(groupId))
  if (!group) throw new Error(`无法访问群 ${groupId}`)

  const members = await group.getMemberMap()
  const bindings = []
  for (const [qqId, member] of members) {
    if (args.qq && String(args.qq) !== String(qqId)) continue
    const label = member?.card || member?.nickname || String(qqId)
    bindings.push(...steamBindingsForQq(qqId, label))
  }
  return { scope, groupId, bindings }
}

async function steamPlayHistory (args = {}, ctx = {}) {
  const days = Math.max(1, Math.min(Math.floor(Number(args.days) || 365), 365))
  const page = Math.max(1, Math.floor(Number(args.page) || 1))
  const pageSize = Math.max(1, Math.min(Math.floor(Number(args.pageSize) || 30), 100))
  const { scope, groupId, bindings } = await groupSteamBindings(args, ctx)

  const filteredBindings = bindings.filter(binding => {
    if (args.steamId && String(args.steamId) !== binding.steamId) return false
    return true
  })
  if (!filteredBindings.length) {
    return scope === 'group'
      ? `群 ${groupId} 中没有符合条件且已绑定 Steam 的群友。`
      : '没有符合条件的 Steam 绑定账号。'
  }

  const bindingMap = new Map()
  for (const binding of filteredBindings) {
    if (!bindingMap.has(binding.steamId)) bindingMap.set(binding.steamId, binding)
  }
  const end = Date.now()
  const start = end - days * 24 * 3600 * 1000
  const offset = (page - 1) * pageSize
  const result = SteamPlayRecords.query({
    start,
    end,
    steamIds: [...bindingMap.keys()],
    appid: args.appid,
    game: args.game,
    limit: pageSize,
    offset
  })
  const totalPages = Math.max(1, Math.ceil(result.total / pageSize))
  const scopeText = scope === 'group' ? `群 ${groupId}` : '全部绑定账号'
  const lines = [
    `Steam 游玩会话历史（${scopeText}）`,
    `时间范围：${formatSteamTime(start)} 至 ${formatSteamTime(end)}（北京时间）`,
    `共 ${result.total} 场，第 ${page}/${totalPages} 页，本页 ${result.records.length} 场`
  ]
  if (!result.records.length) return [...lines, '', '该时间范围内没有游玩记录。'].join('\n')

  result.records.forEach((record, index) => {
    const binding = bindingMap.get(String(record.steamId)) || {}
    lines.push(
      '',
      `${offset + index + 1}. 群友：${binding.label || record.name || record.steamId}（QQ ${binding.qqId || '未知'}）`,
      `   Steam：${binding.steamName || record.name || record.steamId}（${record.steamId}）`,
      `   开始：${formatSteamTime(record.start)}`,
      `   结束：${formatSteamTime(record.end)}`,
      `   时长：${formatSteamDuration(record.minutes)}`,
      `   游戏：${record.game || '未知'}`,
      `   AppID：${record.appid || '未知'}`
    )
  })
  if (page < totalPages) lines.push('', `继续查询下一页请传 page=${page + 1}。`)
  return lines.join('\n')
}

function resolveSpeechGroup (args = {}, ctx = {}) {
  const current = String(ctx.e?.group_id || '').trim()
  const groupId = String(args.group || current).trim()
  if (!groupId) throw new Error('当前不是群聊，请提供群号 group')
  if (!/^[A-Za-z0-9_-]+$/.test(groupId)) throw new Error('群号格式不正确')
  if (current && groupId !== current && !ctx.isAdmin) throw new Error('只有管理员可以查询其他群的发言统计')
  if (!current && !ctx.isAdmin) throw new Error('只有管理员可以指定群号查询发言统计')
  return groupId
}

function speechRankTool (args = {}, ctx = {}) {
  const groupId = resolveSpeechGroup(args, ctx)
  const result = SpeechAnalytics.rank({
    groupId,
    period: args.period,
    date: args.date,
    metric: args.metric
  })
  const periodLabel = { day: '日榜', month: '月榜', year: '近12个月年榜' }[result.period]
  const metricLabel = result.metric === 'words' ? '文本字符数' : '发言次数'
  const lines = [
    `群 ${groupId} 发言${periodLabel} · 按${metricLabel}`,
    `统计范围：${result.rangeText}`,
    `参与成员：${result.total} 人 · 发言总数：${result.totalNumber} 次 · 文本总字符数：${result.totalWords}`
  ]
  if (!result.entries.length) return [...lines, '', '该时间段没有发言记录。'].join('\n')
  for (const item of result.entries) {
    lines.push(`${item.rank}. ${item.nickname}（${item.userId}）：${item.number}次 / ${item.words}字 / 均${item.averageWords}字`)
  }
  return lines.join('\n')
}

function speechMemberTool (args = {}, ctx = {}) {
  const groupId = resolveSpeechGroup(args, ctx)
  const member = String(args.member || ctx.e?.user_id || '').trim()
  if (!member) throw new Error('请提供群友 QQ、平台用户 ID 或昵称')
  const result = SpeechAnalytics.memberStats({
    groupId,
    member,
    days: args.days
  })
  if (result.notFound) {
    if (!result.candidates.length) return `群 ${groupId} 中没有找到成员「${member}」。`
    return [
      `群 ${groupId} 中有多个成员匹配「${member}」，请使用用户 ID 或更完整昵称：`,
      ...result.candidates.map(item => `· ${item.nickname}（${item.userId}）`)
    ].join('\n')
  }

  const activityByMonth = new Map()
  for (const item of result.activities) {
    const month = item.date.slice(0, 7)
    if (!activityByMonth.has(month)) activityByMonth.set(month, [])
    activityByMonth.get(month).push(`${item.date.slice(8)}日 ${item.number}次/${item.words}字`)
  }
  const lines = [
    `发言成员统计 · 群 ${groupId}`,
    `成员：${result.member.nickname}（${result.member.userId}）`,
    `范围：${result.startDate} 至 ${result.endDate}`,
    `总发言：${result.totalNumber} 次`,
    `文本总量：${result.totalWords} 个字符`,
    `平均长度：${result.averageWords} 字/条`,
    `活跃天数：${result.activeDays} 天`,
    `当前连续发言：${result.currentStreak} 天（从今天连续向前）`,
    `最长连续发言：${result.longestStreak} 天`,
    `首次记录：${result.firstDate || '无'} · 最后记录：${result.lastDate || '无'}`,
    '',
    `按月统计（${result.months.length}）：`,
    ...(result.months.length
      ? result.months.map(item => `· ${item.month}：${item.number} 次，${item.words} 字，活跃 ${item.activeDays} 天`)
      : ['（无）']),
    '',
    `有发言的日期（${result.activityTotal}）：`,
    ...(activityByMonth.size
      ? [...activityByMonth].map(([month, items]) => `· ${month}：${items.join('；')}`)
      : ['（无）'])
  ]
  return lines.join('\n')
}

async function antiquityLeads (query = '', limit = 20, includeLore = false) {
  const q = cleanQuery(query)
  if (!q) throw new Error('请给出神话装备名或古物线索名')

  const setItems = await loadAtlasItems(`#${q}`, 1, 1, 8)
  const mythicItems = setItems.filter(item =>
    item?.isAntiquity || Number(item?.item_class) === 12 || item?.type === '神话'
  )
  const equipped = mythicItems.filter(item => item?.antiquityLeads?.length)
  if (equipped.length) {
    const leads = equipped.flatMap(item => item.antiquityLeads)
    const content = equipped.map(item =>
      `【${itemName(item)}】${itemEn(item) ? ` <${itemEn(item)}>` : ''}\n${formatAntiquityLeads(item.antiquityLeads, includeLore)}`
    ).join('\n\n')
    return { content, images: antiquityImageParts(leads) }
  }

  const leads = await database.searchAntiquityLeads(q, limit)
  if (!leads.length) {
    if (mythicItems.length) return `【${itemName(mythicItems[0])}】暂未查到古物线索。`
    return `没找到与「${q}」相关的古物线索。`
  }
  return {
    content: formatAntiquityLeads(leads, includeLore, `「${q}」古物线索`),
    images: antiquityImageParts(leads)
  }
}

async function groupRole (args, ctx) {
  const groupId = String(args.group || ctx.e?.group_id || '').trim()
  if (!/^\d+$/.test(groupId)) throw new Error('请给出正确的群号')
  const group = String(ctx.e?.group_id) === groupId
    ? ctx.e.group
    : globalThis.Bot?.[ctx.e?.self_id]?.pickGroup?.(Number(groupId))
  if (!group) throw new Error(`无法访问群 ${groupId}`)
  const roleCn = { owner: '群主', admin: '管理员', member: '成员' }
  const label = member => `${member.user_id || member.qq}${member.card || member.nickname ? `（${member.card || member.nickname}）` : ''}`
  const qq = String(args.qq || '').trim()
  if (qq) {
    const member = String(ctx.e?.user_id) === qq && ctx.e?.member
      ? ctx.e.member
      : await group.pickMember(Number(qq)).getInfo(true, true)
    return [
      `群 ${groupId} · ${qq} · ${roleCn[member.role] || member.role}`,
      member.nickname && `昵称：${member.nickname}`,
      member.card && `群名片：${member.card}`
    ].filter(Boolean).join('\n')
  }
  const members = [...(await group.getMemberMap()).values()]
  const owners = members.filter(item => item.role === 'owner')
  const admins = members.filter(item => item.role === 'admin')
  return [
    `群 ${groupId}`,
    `群主：${owners.length ? owners.map(label).join('、') : '（未查到）'}`,
    `管理员（${admins.length}）：`,
    ...(admins.length ? admins.map(item => `  ${label(item)}`) : ['  （无）']),
    `成员记录：${members.length} 人`
  ].join('\n')
}

function define (name, description, parameters, execute) {
  return {
    name,
    description,
    parameters,
    async run (args = {}, ctx) {
      try {
        const result = await execute(args, ctx)
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          return { ...result, content: String(result.content ?? '') }
        }
        return { content: String(result) }
      } catch (err) {
        return { content: `${description.split('。')[0]}失败：${err?.message || err}`, isError: true }
      }
    }
  }
}

const TOOLS = [
  define('esocn_version', '查询 ESOCN 数据版本和 ESO 游戏版本。', { type: 'object', properties: {} },
    async () => {
      const [dataVersion, gameVersion] = await Promise.all([
        apiJson('/api/esocn-version'),
        apiJson('/api/version').catch(() => '')
      ])
      return `ESOCN 数据版本：${dataVersion}${gameVersion ? `\n游戏版本：${gameVersion}` : ''}`
    }),
  define('esocn_status', '查询 ESO 各平台服务器在线状态和官方维护公告。', { type: 'object', properties: {} },
    () => getServerStatusText()),
  define('esocn_server_status', '查询 ESO 服务器在线/离线状态、维护时间、影响范围和官方公告。', { type: 'object', properties: {} },
    () => getServerStatusText()),
  define('esocn_official_news', '查询 ESOCN 官方新闻列表，或按 id 读取详情。', {
    type: 'object', properties: { id: { type: 'string', description: '可选新闻 id' } }
  }, args => officialNews(args.id)),
  define('esocn_community_news', '查询 ESOCN 社区新闻列表，或按 id 读取详情。', {
    type: 'object', properties: { id: { type: 'string', description: '可选社区新闻 id' } }
  }, args => communityNews(args.id)),
  define('esocn_search_equip', '搜索 ESO 装备套装，返回类型、护甲、出处和套装效果；神话装备还会返回完整古物线索、图标地址和线索出处。', {
    type: 'object', required: ['query'], properties: { query: { type: 'string', description: '套装中英文名或简称' } }
  }, async args => {
    const query = cleanQuery(args.query)
    if (!query) throw new Error('请给出套装名')
    const items = await loadAtlasItems(`#${query}`, 1, 1, 8)
    if (!items.length) return `没找到套装「${query}」。`
    const leads = items.flatMap(item => item.antiquityLeads || [])
    return {
      content: items.map(item => formatItem(item)).join('\n\n'),
      images: antiquityImageParts(leads)
    }
  }),
  define('esocn_set_place', '查询某个套装在哪里掉落或获取。', {
    type: 'object', required: ['name'], properties: { name: { type: 'string', description: '套装名' } }
  }, async args => {
    const items = await loadAtlasItems(`#${cleanQuery(args.name)}`, 1, 1, 3)
    if (!items.length) return `没找到套装「${args.name}」。`
    const leads = items.flatMap(item => item.antiquityLeads || [])
    return {
      content: items.map(item => {
        const lines = [
          `【${itemName(item)}】`,
          `地点：${item.place || '未知'}`,
          `英文：${stripHtml(item.place_en || '')}`
        ]
        if (item.antiquityLeads?.length) lines.push('', formatAntiquityLeads(item.antiquityLeads))
        return lines.join('\n')
      }).join('\n\n'),
      images: antiquityImageParts(leads)
    }
  }),
  define('esocn_antiquity_leads', '查询神话装备的古物线索，或按古物中英文名称检索。返回每条线索的中英文名、图标直链、出处、获取方式、地区、物品类型和品质；可按需返回完整线索故事。', {
    type: 'object',
    required: ['query'],
    properties: {
      query: { type: 'string', description: '神话装备中英文名、简称，或古物线索中英文名' },
      limit: { type: 'number', description: '按线索名检索时最多返回几条，默认 20，最多 50' },
      includeLore: { type: 'boolean', description: '是否返回线索故事全文，默认 false' }
    }
  }, args => antiquityLeads(args.query, args.limit, args.includeLore === true)),
  define('esocn_search_skill', '搜索技能、职业精通或篆刻技能，返回类型、消耗、参数和效果。', {
    type: 'object', required: ['query'], properties: { query: { type: 'string', description: '技能中英文名或职业精通' } }
  }, async args => {
    const query = cleanQuery(args.query)
    const items = await loadAtlasItems(`*${query}`, 2, 2, 8)
    return items.length ? items.map(item => formatItem(item)).join('\n\n') : `没找到技能「${query}」。`
  }),
  define('esocn_scribing', '查询篆刻魔典技能和脚本效果。', {
    type: 'object', properties: { query: { type: 'string', description: '魔典名或“脚本 英勇”' } }
  }, args => searchScribing(args.query)),
  define('esocn_search_dungeon', '搜索 ESO 4人本、试炼和竞技场。', {
    type: 'object', required: ['query'], properties: {
      query: { type: 'string', description: '副本中英文名' },
      kind: { type: 'string', enum: ['all', 'dungeon', 'trial', 'arena'], description: '默认 all' }
    }
  }, args => searchDungeons(args.query, args.kind)),
  define('esocn_dungeon_detail', '查询副本详情，包括原始 BOSS、成就和掉落数据。', {
    type: 'object', required: ['query'], properties: { query: { type: 'string', description: '副本中英文名' } }
  }, args => dungeonDetail(args.query)),
  define('esocn_daily_undaunted', '查询每日无畏者誓约的三个副本。', {
    type: 'object', properties: {
      day: { type: 'string', enum: ['yesterday', 'today', 'tomorrow', 'all'], description: '默认 today' }
    }
  }, args => dailyUndaunted(args.day || 'today')),
  define('esocn_weekly_trial', '查询本周试炼和竞技场轮换。', { type: 'object', properties: {} },
    async () => {
      const data = await apiJson('/api/week-trial')
      return [
        '本周周常：',
        data?.PCNA && `美服：${data.PCNA}`,
        data?.PCEU && `欧服：${data.PCEU}`,
        data?.ScrapeTime && `更新时间：${data.ScrapeTime}`
      ].filter(Boolean).join('\n')
    }),
  define('esocn_vendor', '查询本周黄金商人、无限商人、奢侈家具商或泰尔瓦商人。', {
    type: 'object', properties: {
      kind: { type: 'string', enum: ['golden', 'infinite', 'luxury', 'telvar', 'all'], description: '默认 golden' }
    }
  }, args => vendor(args.kind || 'golden')),
  define('esocn_builds', '查询玩家分享的 ESO 配装攻略列表。', {
    type: 'object', properties: {
      query: { type: 'string', description: '职业、定位或关键词' },
      version: { type: 'string', description: '默认最新；all 不限' },
      limit: { type: 'number', description: '最多几条，默认 12' }
    }
  }, args => builds(args.query, args.version, args.limit)),
  define('esocn_build_detail', '读取 ESOCN 配装 ID、链接或完整 SuperStar 分享码。', {
    type: 'object', required: ['id'], properties: { id: { type: 'string', description: '配装 ID、链接或完整 |H1:sss:...|h 分享码' } }
  }, args => buildDetail(args.id)),
  define('esocn_user_info_by_name', '按 ESOCN 用户名查询账号公开资料，返回用户 ID、等级 rank、头像、签名、游戏 CID、服务器、定位和玩法标签。', {
    type: 'object',
    required: ['username'],
    properties: {
      username: { type: 'string', description: 'ESOCN 用户名，可带或不带开头的 @' }
    }
  }, args => esocnUserByName(args.username)),
  define('esocn_user_info_by_id', '按 ESOCN 用户 ID 查询账号公开资料，返回用户名、等级 rank、头像、签名、游戏 CID、服务器、定位和玩法标签。用户 ID 会自动补足 7 位。', {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: { type: 'string', description: 'ESOCN 用户 ID，例如 0000010；纯数字会自动补足 7 位' }
    }
  }, args => esocnUserById(args.userId)),
  define('esocn_buff_list', '列出 ESO 增益或减益 Buff。', {
    type: 'object', properties: {
      kind: { type: 'string', enum: ['buff', 'debuff'], description: '默认 buff' },
      limit: { type: 'number', description: '默认 40' }
    }
  }, async args => {
    const kind = args.kind === 'debuff' ? 'debuff' : 'buff'
    const list = await database.listBuffDebuff(kind, args.limit || 40)
    return `${kind === 'debuff' ? '减益' : '增益'} Buff：\n${list.map((item, index) => `${index + 1}. ${item.name}`).join('\n')}`
  }),
  define('esocn_buff_sources', '查询某个增益或减益来自哪些套装和技能。', {
    type: 'object', required: ['name'], properties: { name: { type: 'string', description: 'Buff 名称' } }
  }, args => buffSources(args.name)),
  define('esocn_search_food', '查询食物或饮品的类型、品质、材料和效果。', {
    type: 'object', required: ['name'], properties: { name: { type: 'string', description: '食物中英文名' } }
  }, async args => {
    const items = await loadAtlasItems(`%${cleanQuery(args.name)}`, 3, 6, 8)
    return items.length ? items.map(item => formatItem(item)).join('\n\n') : `没找到食物「${args.name}」。`
  }),
  define('esocn_furniture', '搜索家具列表，返回名称、品质、分类和来源。', {
    type: 'object', required: ['query'], properties: {
      query: { type: 'string', description: '家具关键词' },
      limit: { type: 'number', description: '默认 12' }
    }
  }, async args => {
    const limit = Math.max(1, Math.min(Number(args.limit) || 12, 30))
    const params = new URLSearchParams({
      'params[page]': '1', 'params[limit]': String(limit * 3), 'params[searchQuery]': String(args.query || ''),
      'params[sortBy]': 'id', 'params[sortOrder]': 'asc'
    })
    const data = await apiJson(`/api/furniture/list?${params}`)
    return ['家具：', ...asList(data).slice(0, limit).map((item, index) =>
      `${index + 1}. ${item.name || '?'} <${item.enName || ''}> · ${item.quality || ''} · ${item.category || ''}`
    )].join('\n')
  }),
  define('esocn_search_furniture', '查询单件家具详情。', {
    type: 'object', required: ['name'], properties: { name: { type: 'string', description: '家具中英文名' } }
  }, async args => {
    const items = await loadAtlasItems(`!${cleanQuery(args.name)}`, 4, 8, 8)
    return items.length ? items.map(item => formatItem(item)).join('\n\n') : `没找到家具「${args.name}」。`
  }),
  define('esocn_search_collectible', '查询收藏品家具详情。', {
    type: 'object', required: ['name'], properties: { name: { type: 'string', description: '收藏品家具名' } }
  }, async args => {
    const items = await loadAtlasItems(cleanQuery(args.name), 5, 9, 8)
    return items.length ? items.map(item => formatItem(item)).join('\n\n') : `没找到收藏品家具「${args.name}」。`
  }),
  define('esocn_guides', '搜索 ESOCN 社区攻略。', {
    type: 'object', properties: {
      query: { type: 'string', description: '关键词' },
      category: { type: 'string', description: '分类' },
      limit: { type: 'number', description: '默认 15' }
    }
  }, args => guides(args.query, args.category, args.limit)),
  define('esocn_guide_detail', '读取一篇 ESOCN 攻略的正文。', {
    type: 'object', required: ['id'], properties: {
      id: { type: 'string', description: '攻略 id' },
      maxChars: { type: 'number', description: '默认 4000' }
    }
  }, args => guideDetail(args.id, args.maxChars)),
  define('esocn_data_status', '检查 ESOCN 数据版本与本地图鉴状态。', {
    type: 'object', properties: { refresh: { type: 'boolean', description: '保留参数；当前只检查版本' } }
  }, async () => {
    const [version, gameVersion] = await Promise.all([apiJson('/api/esocn-version'), apiJson('/api/version').catch(() => '')])
    await database.init_database()
    return `ESOCN 数据版本：${version}\n游戏版本：${gameVersion || '未知'}\n本地 ESO 图鉴数据库：已加载`
  }),
  define('esocn_steam_play_history', '查询当前群友过去一年内每一次 Steam 游玩会话的北京时间开始时间、结束时间和时长，并标明游戏名与 AppID。记录保留一年、包含所有 Steam 游戏；支持按群、成员、游戏、AppID、时间范围和分页筛选。', {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['group', 'all'], description: '默认 group；all 仅管理员可用' },
      group: { type: 'string', description: '群号；默认当前群' },
      qq: { type: 'string', description: '可选，只查询指定群友 QQ' },
      steamId: { type: 'string', description: '可选，只查询指定 SteamID' },
      days: { type: 'number', description: '默认 365，最多 365 天' },
      game: { type: 'string', description: '可选，按游戏名关键词筛选' },
      appid: { type: 'string', description: '可选，按 Steam AppID 精确筛选' },
      page: { type: 'number', description: '默认第 1 页' },
      pageSize: { type: 'number', description: '每页条数，默认 30，最多 100' }
    }
  }, (args, ctx) => steamPlayHistory(args, ctx)),
  define('esocn_speech_rank', '查询某群的发言榜，可按日榜、月榜或最近12个月年榜排序，并选择按发言次数或文本字符数排序。一次返回全部成员的发言次数、字符数和平均长度。', {
    type: 'object',
    properties: {
      group: { type: 'string', description: '群号；默认当前群；其他群仅管理员可查' },
      period: { type: 'string', enum: ['day', 'month', 'year'], description: '默认 day；year 表示截至指定月份的最近12个月' },
      date: { type: 'string', description: 'day 用 YYYY-MM-DD；month/year 用 YYYY-MM；默认今天/当前月' },
      metric: { type: 'string', enum: ['number', 'words'], description: '默认 number（发言次数），words 表示文本字符数' }
    }
  }, (args, ctx) => speechRankTool(args, ctx)),
  define('esocn_speech_member_stats', '查询某位群友的发言历史、总发言次数、总字符数、每月累计、全部活跃日期、活跃天数、当前连续和最长连续发言天数。默认统计当前成员最近365天。', {
    type: 'object',
    properties: {
      group: { type: 'string', description: '群号；默认当前群；其他群仅管理员可查' },
      member: { type: 'string', description: 'QQ/平台用户ID或昵称；默认当前发消息的成员' },
      days: { type: 'number', description: '回看天数，默认365，最多3650' }
    }
  }, (args, ctx) => speechMemberTool(args, ctx)),
  define('qq_group_mute', '在当前 QQ 群禁言或解除禁言指定成员。不能禁言群主，最长30天。', {
    type: 'object',
    required: ['durationSeconds'],
    properties: {
      target: { type: 'string', description: '群友 QQ 号、群名片或昵称；省略时使用当前消息 @ 的成员' },
      durationSeconds: { type: 'integer', minimum: 0, maximum: 2592000, description: '禁言秒数；0 表示解除禁言；最长 2592000 秒（30天）' },
      reason: { type: 'string', description: '可选，操作原因，仅用于返回说明' }
    }
  }, (args, ctx) => muteGroupMember(args, ctx)),
  define('qq_group_recall', '撤回当前 QQ 群的一条指定消息。默认使用被回复的消息，也可提供 messageId；不能撤回群主或管理员的消息。', {
    type: 'object',
    properties: {
      messageId: { type: 'string', description: '要撤回的消息 ID；省略时使用当前回复引用的消息' },
      useReply: { type: 'boolean', description: '未提供 messageId 时是否使用被回复消息，默认 true' }
    }
  }, (args, ctx) => recallGroupMessage(args, ctx)),
  define('qq_group_role', '查询群成员身份、群主和管理员。', {
    type: 'object', properties: {
      group: { type: 'string', description: '群号；默认当前群' },
      qq: { type: 'string', description: '可选群友 QQ' }
    }
  }, groupRole)
]

TOOLS.push(...biliApiTools, biliWatchTool)

export default TOOLS
