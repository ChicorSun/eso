import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const LOOK = path.join(HERE, 'bili-watch', 'tools', 'look.mjs')

function runtimePaths() {
  const home = path.join(process.cwd(), 'data', 'eso', 'bili-watch')
  return {
    home,
    deps: path.join(home, 'deps'),
    cache: path.join(home, 'cache'),
    credential: path.join(home, 'credential.json'),
  }
}

function copyDirectory(source, target) {
  if (!fs.existsSync(source) || fs.existsSync(target)) return false
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.cpSync(source, target, { recursive: true })
  return true
}

/** One-time migration from the former dsh profile. Runtime does not depend on dsh after this. */
export function prepareBiliWatch() {
  const paths = runtimePaths()
  fs.mkdirSync(paths.home, { recursive: true })
  fs.mkdirSync(paths.deps, { recursive: true })
  fs.mkdirSync(paths.cache, { recursive: true })

  const legacyHome = path.join(homedir(), '.dsh', 'bili-watch')
  if (!fs.existsSync(paths.credential)) {
    const legacyCredential = path.join(legacyHome, 'credential.json')
    if (fs.existsSync(legacyCredential)) fs.copyFileSync(legacyCredential, paths.credential)
  }
  copyDirectory(path.join(legacyHome, 'deps'), paths.deps)
  return paths
}

function runLook(args, signal) {
  const paths = prepareBiliWatch()
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [LOOK, ...args, '--quiet'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DSH_HOME: path.join(process.cwd(), 'data', 'eso'),
        BILI_WATCH_DEPS: paths.deps,
        BILI_WATCH_CACHE: paths.cache,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, 14 * 60 * 1000)
    const onAbort = () => child.kill('SIGTERM')
    signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout.on('data', chunk => {
      stdout += chunk
      if (stdout.length > 2_000_000) child.kill('SIGKILL')
    })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      if (timedOut) return reject(new Error('B 站内容读取超时（14 分钟）'))
      const text = (stdout || stderr).trim()
      if (code === 0) return resolve(text || '（没有返回内容）')
      reject(new Error(text || `bili-watch 退出码 ${code}`))
    })
  })
}

export default {
  name: 'bili_watch',
  description: '读取 B 站视频内容：搜索、热门、元数据、字幕、评论、弹幕、本地 ASR 转写和 OCR。用户给出 BV/视频链接并询问视频讲了什么、值不值得看、评论/弹幕反应时使用。',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        enum: ['search', 'hot', 'view', 'sub', 'comments', 'danmaku', 'asr', 'text', 'ocr'],
        description: 'text=字幕→转写→OCR 自动降级；view=元数据；search/hot 不需要 bv',
      },
      keyword: { type: 'string', description: 'command=search 时的搜索词' },
      bv: { type: 'string', description: 'BV 号、b23.tv 短链或 B 站视频链接' },
      days: { type: 'number', description: 'search 只保留最近 N 天' },
      limit: { type: 'number', description: 'search/hot 返回条数，默认 10' },
      p: { type: 'number', description: '多 P 视频的分 P 序号' },
      step: { type: 'number', description: 'OCR/抽帧间隔秒数' },
      fast: { type: 'boolean', description: 'text 跳过 ASR，字幕失败直接 OCR' },
      head: { type: 'number', description: '正文返回前 N 字' },
      format: { type: 'string', enum: ['txt', 'md', 'json', 'srt'], description: '可选输出格式' },
    },
    required: ['command'],
    additionalProperties: false,
  },
  timeoutMs: 900000,
  async run(args, ctx) {
    const command = String(args.command || '').trim()
    const extra = []
    if (Number(args.p) > 0) extra.push('--p', String(Math.floor(Number(args.p))))
    if (Number(args.step) > 0) extra.push('--step', String(Math.floor(Number(args.step))))
    if (Number(args.days) > 0) extra.push('--days', String(Math.floor(Number(args.days))))
    if (Number(args.limit) > 0) extra.push('--limit', String(Math.floor(Number(args.limit))))
    if (Number(args.head) > 0) extra.push('--head', String(Math.floor(Number(args.head))))
    if (args.fast) extra.push('--fast')
    if (args.format) extra.push('--format', String(args.format))

    if (command === 'hot') return runLook(['hot', ...extra], ctx?.signal)
    const target = command === 'search' ? String(args.keyword || '').trim() : String(args.bv || '').trim()
    if (!target) throw new Error(command === 'search' ? 'search 需要 keyword' : '缺少 BV 号或视频链接')
    return runLook([command, target, ...extra], ctx?.signal)
  },
}
