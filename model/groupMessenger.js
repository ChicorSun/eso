import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { segment } from '../../../lib/modules/oicq/index.js'
import { resolveGroupMember } from './groupModeration.js'

const MAX_IMAGES = 20
const MAX_LOCAL_IMAGE_BYTES = 10 * 1024 * 1024
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])

function imageSource (value) {
  const source = String(value || '').trim()
  if (!source) throw new Error('图片地址不能为空')
  if (/^https?:\/\//i.test(source) || /^base64:\/\//i.test(source)) return source
  const local = source.startsWith('file://') ? new URL(source) : null
  const file = local ? decodeURIComponent(local.pathname) : path.resolve(source)
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`图片不存在：${source}`)
  if (fs.statSync(file).size > MAX_LOCAL_IMAGE_BYTES) throw new Error(`图片超过 10 MiB：${source}`)
  if (!IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())) throw new Error(`不支持的图片格式：${source}`)
  return pathToFileURL(file).href
}

async function notificationSegments (mode, members, group, e) {
  const normalized = ['none', 'members', 'all', 'all_and_members'].includes(mode) ? mode : 'none'
  if (normalized === 'none') return []

  const segments = []
  if (normalized === 'all' || normalized === 'all_and_members') segments.push(segment.at('all'), ' ')
  if (normalized === 'members' || normalized === 'all_and_members') {
    const targets = members.length ? members : (e?.at && e.at !== 'all' ? [String(e.at)] : [])
    if (!targets.length) throw new Error('通知某些人时必须提供 notifyMembers，或在当前消息中 @ 目标成员')
    const seen = new Set()
    for (const target of targets) {
      const member = await resolveGroupMember(group, target, e)
      const userId = String(member?.user_id ?? member?.qq ?? member?.id ?? '')
      if (!userId || seen.has(userId)) continue
      seen.add(userId)
      segments.push(segment.at(userId), ' ')
    }
  }
  return segments
}

export async function sendGroupMessage ({
  text = '',
  images = [],
  notifyMode = 'none',
  notifyMembers = [],
  quote = false
} = {}, ctx) {
  const e = ctx?.e
  const group = e?.group
  const groupId = String(e?.group_id || '').trim()
  if (!groupId || !group?.sendMsg) throw new Error('该工具只能在当前群聊中使用')

  const body = String(text || '').trim()
  const imageList = (Array.isArray(images) ? images : images ? [images] : [])
    .map(value => String(value || '').trim())
    .filter(Boolean)
  if (imageList.length > MAX_IMAGES) throw new Error(`一次最多发送 ${MAX_IMAGES} 张图片`)
  if (!body && !imageList.length) throw new Error('至少提供文字或一张图片')

  const mentions = (Array.isArray(notifyMembers) ? notifyMembers : notifyMembers ? [notifyMembers] : [])
    .map(value => String(value || '').trim())
    .filter(Boolean)
  const message = await notificationSegments(notifyMode, mentions, group, e)
  if (quote && e?.message_id) message.unshift(segment.reply(e.message_id))
  if (body) message.push({ type: 'text', text: body })
  for (const image of imageList) message.push(segment.image(imageSource(image)))

  const result = await group.sendMsg(message)
  const response = Array.isArray(result) ? result[0] : result
  const messageId = response?.message_id || response?.data?.message_id || ''
  return {
    content: `消息已发送到群 ${groupId}${messageId ? `，消息 ID：${messageId}` : ''}`,
    terminal: true
  }
}
