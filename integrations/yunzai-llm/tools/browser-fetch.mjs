// TRSS-ESO-MANAGED: 由 TRSS ESO 自动部署；删除本项目标记后可安全自行维护。
import dns from 'node:dns/promises'
import net from 'node:net'

function v4ToInt(ip) {
  return ip.split('.').reduce((value, part) => (value << 8) + Number(part), 0) >>> 0
}

const V4_BLOCKS = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const value = v4ToInt(ip)
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
      return (value & mask) === (v4ToInt(base) & mask)
    })
  }
  if (net.isIPv6(ip)) {
    const value = ip.toLowerCase()
    if (value === '::' || value === '::1') return true
    const mapped = /^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(value)
    if (mapped) return isPrivateIp(mapped[1])
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(value)) return true
    if (/^f[cd]/.test(value) || /^fe[89ab]/.test(value) || /^ff/.test(value)) return true
    return false
  }
  return true
}

async function assertPublicUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('URL 不合法')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持 http/https')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!host || /^localhost$/i.test(host) || /\.(localhost|local|internal)$/i.test(host)) {
    throw new Error('禁止访问内网地址')
  }
  const addresses = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) }]
    : await dns.lookup(host, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(item => isPrivateIp(item.address))) {
    throw new Error('禁止访问内网地址')
  }
  return url
}

let browserPromise
let idleTimer
const mirrorCache = new Map()

function scriptMirror(url) {
  if (/^https:\/\/ajax\.googleapis\.com\/ajax\/libs\/jquery\/1\.11\.3\/jquery(?:\.min)?\.js(?:\?|$)/i.test(url)) {
    return 'https://cdn.jsdelivr.net/npm/jquery@1.11.3/dist/jquery.min.js'
  }
  return ''
}

async function loadMirror(url) {
  if (!mirrorCache.has(url)) {
    mirrorCache.set(url, fetch(url, { signal: AbortSignal.timeout(15000) }).then(async response => {
      if (!response.ok) throw new Error(`镜像 HTTP ${response.status}`)
      return response.text()
    }).catch(error => {
      mirrorCache.delete(url)
      throw error
    }))
  }
  return mirrorCache.get(url)
}

function scheduleBrowserClose() {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(async () => {
    const current = browserPromise
    browserPromise = undefined
    const browser = await current?.catch(() => undefined)
    await browser?.close?.().catch(() => {})
  }, 5 * 60 * 1000)
  idleTimer.unref?.()
}

async function getBrowser() {
  browserPromise ??= (async () => {
    const puppeteer = (await import('puppeteer')).default
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    })
    browser.once('disconnected', () => {
      browserPromise = undefined
    })
    return browser
  })().catch(error => {
    browserPromise = undefined
    throw error
  })
  return browserPromise
}

function normalizeText(value, maxChars) {
  const text = String(value ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const truncated = text.length > maxChars
  return {
    text: truncated ? text.slice(0, maxChars) : text,
    truncated,
  }
}

export default {
  name: 'browser_fetch',
  description: '用无头 Chromium 打开网页并执行 JavaScript，等待页面脚本和网络请求完成后提取正文与链接。用于静态 web_fetch 只能拿到空壳、SPA、懒加载或被 JS 渲染的网页。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '完整的 http(s) 网页地址' },
      waitUntil: {
        type: 'string',
        enum: ['domcontentloaded', 'networkidle2', 'networkidle0'],
        description: '等待条件，默认 networkidle2',
      },
      waitMs: {
        type: 'integer',
        description: '页面加载后再等待的毫秒数，默认 1000，最多 15000',
      },
      maxChars: {
        type: 'integer',
        description: '最多返回正文字符数，默认 12000，最多 30000',
      },
    },
    required: ['url'],
    additionalProperties: false,
  },
  timeoutMs: 60000,
  async run(args) {
    const url = await assertPublicUrl(String(args.url || '').trim())
    const waitUntil = ['domcontentloaded', 'networkidle2', 'networkidle0'].includes(args.waitUntil)
      ? args.waitUntil
      : 'networkidle2'
    const waitMs = Math.max(0, Math.min(Number(args.waitMs) || 1000, 15000))
    const maxChars = Math.max(1000, Math.min(Number(args.maxChars) || 12000, 30000))
    const browser = await getBrowser()
    const page = await browser.newPage()
    let requestCount = 0

    try {
      await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 })
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36')
      await page.setRequestInterception(true)
      page.on('request', async request => {
        const requestUrl = request.url()
        if (requestUrl.startsWith('data:') || requestUrl.startsWith('blob:') || requestUrl === 'about:blank') {
          return request.continue().catch(() => {})
        }
        if (!/^https?:/i.test(requestUrl) || ++requestCount > 300) {
          return request.abort().catch(() => {})
        }
        const mirror = scriptMirror(requestUrl)
        if (mirror) {
          try {
            const body = await loadMirror(mirror)
            return request.respond({
              status: 200,
              contentType: 'application/javascript; charset=utf-8',
              headers: { 'access-control-allow-origin': '*' },
              body,
            })
          } catch {
            // 镜像失败时继续尝试原地址。
          }
        }
        try {
          await Promise.race([
            assertPublicUrl(requestUrl),
            new Promise((_, reject) => setTimeout(() => reject(new Error('请求地址校验超时')), 5000)),
          ])
          await request.continue()
        } catch {
          await request.abort().catch(() => {})
        }
      })

      try {
        await page.goto(url.href, { waitUntil, timeout: 35000 })
      } catch (error) {
        if (!/timeout/i.test(String(error?.message || error))) throw error
      }

      if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs))
      const finalUrl = await assertPublicUrl(page.url())
      const data = await page.evaluate(() => {
        const text = document.body?.innerText || document.documentElement?.innerText || ''
        const links = [...document.querySelectorAll('a[href]')]
          .map(anchor => {
            const label = (anchor.textContent || '').replace(/\s+/g, ' ').trim()
            const href = anchor.href
            return label && href ? { label, href } : null
          })
          .filter(Boolean)
        return { title: document.title || '', text, links }
      })
      const body = normalizeText(data.text, maxChars)
      const seen = new Set()
      const links = []
      for (const link of data.links) {
        if (seen.has(link.href)) continue
        seen.add(link.href)
        links.push(`- ${link.label.slice(0, 120)}: ${link.href}`)
        if (links.length >= 40) break
      }
      return [
        `标题：${data.title || '（无）'}`,
        `最终地址：${finalUrl.href}`,
        `请求数：${requestCount}`,
        body.truncated ? `正文已截断为 ${maxChars} 字符` : `正文字符数：${body.text.length}`,
        '',
        body.text || '（页面没有可提取正文）',
        links.length ? `\n链接：\n${links.join('\n')}` : '',
      ].filter(Boolean).join('\n')
    } finally {
      await page.close().catch(() => {})
      scheduleBrowserClose()
    }
  },
}
