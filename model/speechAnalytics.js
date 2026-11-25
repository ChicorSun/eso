import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.resolve(process.cwd(), 'data')
const DAY_MS = 24 * 3600 * 1000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/

function beijingDateKey (timestamp = Date.now()) {
  return new Date(Number(timestamp) + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

function normalizeDate (value, fallback = beijingDateKey()) {
  const text = String(value || '').trim()
  if (DATE_RE.test(text)) return text
  if (MONTH_RE.test(text)) return `${text}-01`
  return fallback
}

function normalizeMonth (value, fallback = beijingDateKey().slice(0, 7)) {
  const text = String(value || '').trim()
  if (MONTH_RE.test(text)) return text
  if (DATE_RE.test(text)) return text.slice(0, 7)
  return fallback
}

function shiftDate (dateKey, days) {
  const value = new Date(`${dateKey}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function shiftMonth (monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1 + delta, 1))
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`
}

function lastMonths (endMonth, count) {
  return Array.from({ length: count }, (_, index) => shiftMonth(endMonth, index - count + 1))
}

function speechDir (groupId) {
  const id = String(groupId || '').trim()
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('群号格式不正确')
  return path.join(DATA_DIR, `${id}_snots`)
}

function readRows (file) {
  if (!fs.existsSync(file)) return []
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function numberValue (value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function addUserRow (users, row) {
  const id = String(row?.user_id ?? '')
  if (!id) return
  if (!users.has(id)) {
    users.set(id, {
      userId: id,
      nickname: String(row?.nickname || `用户${id}`),
      number: 0,
      words: 0
    })
  }
  const target = users.get(id)
  target.number += numberValue(row?.number)
  target.words += numberValue(row?.words)
  if (row?.nickname) target.nickname = String(row.nickname)
}

function rankFromFiles (files) {
  const users = new Map()
  for (const file of files) {
    for (const row of readRows(file)) addUserRow(users, row)
  }
  return [...users.values()]
}

class SpeechAnalytics {
  rank ({ groupId, period = 'day', date, metric = 'number' } = {}) {
    const normalizedPeriod = ['day', 'month', 'year'].includes(period) ? period : 'day'
    const normalizedMetric = metric === 'words' ? 'words' : 'number'
    const dir = speechDir(groupId)
    let files = []
    let rangeText = ''

    if (normalizedPeriod === 'day') {
      const day = normalizeDate(date)
      files = [path.join(dir, `${day}.json`)]
      rangeText = day
    } else if (normalizedPeriod === 'month') {
      const month = normalizeMonth(date)
      files = [path.join(dir, `${month}.json`)]
      rangeText = month
    } else {
      const endMonth = normalizeMonth(date)
      const months = lastMonths(endMonth, 12)
      files = months.map(month => path.join(dir, `${month}.json`))
      rangeText = `${months[0]} 至 ${months.at(-1)}`
    }

    const users = rankFromFiles(files)
    users.sort((a, b) => {
      const diff = b[normalizedMetric] - a[normalizedMetric]
      if (diff) return diff
      const secondary = normalizedMetric === 'words' ? 'number' : 'words'
      return b[secondary] - a[secondary]
    })
    const total = users.length
    const totalNumber = users.reduce((sum, user) => sum + user.number, 0)
    const totalWords = users.reduce((sum, user) => sum + user.words, 0)
    return {
      period: normalizedPeriod,
      metric: normalizedMetric,
      rangeText,
      total,
      totalNumber,
      totalWords,
      entries: users.map((user, index) => ({
        rank: index + 1,
        ...user,
        averageWords: user.number ? Number((user.words / user.number).toFixed(2)) : 0
      }))
    }
  }

  resolveMember (groupId, query) {
    const dir = speechDir(groupId)
    const needle = String(query || '').trim()
    if (!needle) return { candidates: [] }
    if (!fs.existsSync(dir)) return { candidates: [] }

    const files = fs.readdirSync(dir)
      .filter(file => file.endsWith('.json'))
      .sort()
      .reverse()
    const users = new Map()
    for (const file of files) {
      for (const row of readRows(path.join(dir, file))) {
        const id = String(row?.user_id ?? '')
        if (!id) continue
        users.set(id, String(row?.nickname || users.get(id) || `用户${id}`))
      }
    }

    if (users.has(needle)) return { member: { userId: needle, nickname: users.get(needle) }, candidates: [] }
    const lower = needle.toLowerCase()
    const exactName = [...users].filter(([, nickname]) => nickname.toLowerCase() === lower)
    const partialName = [...users].filter(([, nickname]) => nickname.toLowerCase().includes(lower))
    const matches = exactName.length ? exactName : partialName
    if (matches.length === 1) {
      return { member: { userId: matches[0][0], nickname: matches[0][1] }, candidates: [] }
    }
    return {
      candidates: matches.slice(0, 20).map(([userId, nickname]) => ({ userId, nickname }))
    }
  }

  memberStats ({
    groupId,
    member,
    days = 365
  } = {}) {
    const resolved = this.resolveMember(groupId, member)
    if (!resolved.member) return { notFound: true, candidates: resolved.candidates }

    const userId = resolved.member.userId
    const dir = speechDir(groupId)
    const endDate = beijingDateKey()
    const dayCount = Math.max(1, Math.min(Math.floor(Number(days) || 365), 3650))
    const startDate = shiftDate(endDate, -(dayCount - 1))
    const daily = []
    let nickname = resolved.member.nickname

    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir)) {
        if (!DATE_RE.test(file.replace(/\.json$/, ''))) continue
        const date = file.slice(0, -5)
        if (date < startDate || date > endDate) continue
        const row = readRows(path.join(dir, file)).find(item => String(item?.user_id) === userId)
        if (!row) continue
        nickname = String(row.nickname || nickname)
        daily.push({
          date,
          number: numberValue(row.number),
          words: numberValue(row.words)
        })
      }
    }

    daily.sort((a, b) => a.date.localeCompare(b.date))
    const monthly = new Map()
    let totalNumber = 0
    let totalWords = 0
    for (const item of daily) {
      totalNumber += item.number
      totalWords += item.words
      const month = item.date.slice(0, 7)
      if (!monthly.has(month)) monthly.set(month, { month, number: 0, words: 0, activeDays: 0 })
      const target = monthly.get(month)
      target.number += item.number
      target.words += item.words
      if (item.number > 0 || item.words > 0) target.activeDays++
    }

    let longestStreak = 0
    let runningStreak = 0
    let previousDate = ''
    for (const item of daily) {
      runningStreak = previousDate && shiftDate(previousDate, 1) === item.date ? runningStreak + 1 : 1
      longestStreak = Math.max(longestStreak, runningStreak)
      previousDate = item.date
    }

    const activeDates = new Set(daily.map(item => item.date))
    let currentStreak = 0
    for (let date = endDate; activeDates.has(date); date = shiftDate(date, -1)) currentStreak++

    const newestFirst = [...daily].reverse()
    return {
      member: { userId, nickname },
      startDate,
      endDate,
      totalNumber,
      totalWords,
      averageWords: totalNumber ? Number((totalWords / totalNumber).toFixed(2)) : 0,
      activeDays: daily.length,
      currentStreak,
      longestStreak,
      firstDate: daily[0]?.date || '',
      lastDate: daily.at(-1)?.date || '',
      months: [...monthly.values()].sort((a, b) => b.month.localeCompare(a.month)),
      activityTotal: newestFirst.length,
      activities: newestFirst
    }
  }
}

export default new SpeechAnalytics()
