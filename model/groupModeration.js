const MAX_MUTE_SECONDS = 30 * 24 * 3600

function groupOf (ctx) {
  const e = ctx?.e
  const groupId = String(e?.group_id || '').trim()
  if (!groupId || !e?.group) throw new Error('该操作只能在当前 QQ 群聊中使用')
  if (!/^\d+$/.test(groupId)) throw new Error('当前适配器不是 QQ 群，暂不支持群禁言或消息撤回')
  return { e, group: e.group, groupId }
}

function memberId (member) {
  return String(member?.user_id ?? member?.qq ?? member?.id ?? '')
}

function memberName (member) {
  return String(member?.card || member?.nickname || memberId(member) || '未知成员')
}

async function resolveMember (group, target, e) {
  const raw = String(target || e?.at || '').trim().replace(/^@+/, '')
  if (!raw || raw === 'all') throw new Error('请指定要禁言的群成员')

  const members = [...(await group.getMemberMap()).values()]
  if (/^\d+$/.test(raw)) {
    const exact = members.find(member => memberId(member) === raw)
    if (exact) return exact
    const member = await group.pickMember(Number(raw)).getInfo(true, true).catch(() => null)
    if (member) return { ...member, user_id: raw }
    throw new Error(`群内没有找到 QQ ${raw}`)
  }

  const needle = raw.toLowerCase()
  const exact = members.filter(member =>
    String(member?.card || '').toLowerCase() === needle ||
    String(member?.nickname || '').toLowerCase() === needle
  )
  const matches = exact.length
    ? exact
    : members.filter(member =>
        String(member?.card || '').toLowerCase().includes(needle) ||
        String(member?.nickname || '').toLowerCase().includes(needle)
      )
  if (matches.length === 1) return matches[0]
  if (!matches.length) throw new Error(`群内没有找到成员「${raw}」`)
  throw new Error(`成员「${raw}」匹配到多人，请改用 QQ 号：${matches.slice(0, 8).map(member => `${memberName(member)}(${memberId(member)})`).join('、')}`)
}

function replyMessageId (e) {
  return String(
    e?.reply_id ||
    e?.source?.message_id ||
    e?.source?.id ||
    e?.quote?.id ||
    e?.raw?.targetMsgId ||
    ''
  )
}

async function fetchMessage (group, messageId, sourceSeq) {
  if (messageId && group.getMsg) {
    try {
      const message = await group.getMsg(messageId)
      if (message) return message
    } catch {}
  }
  if (group.getChatHistory) {
    try {
      const history = messageId
        ? await group.getChatHistory(1, 50)
        : await group.getChatHistory(sourceSeq, 1)
      if (Array.isArray(history)) {
        return messageId
          ? history.find(message => String(message?.message_id) === String(messageId))
          : history[0]
      }
    } catch {}
  }
  return null
}

async function sourceMember (group, userId) {
  if (!userId) return null
  return group.pickMember(Number(userId)).getInfo(true, true).catch(() => null)
}

export async function muteGroupMember ({ target, durationSeconds, reason = '' } = {}, ctx) {
  const { e, group, groupId } = groupOf(ctx)
  const member = await resolveMember(group, target, e)
  const userId = memberId(member)
  if (!userId) throw new Error('无法确定要禁言的群成员')
  if (userId === String(e.self_id)) throw new Error('不能禁言机器人自己')

  const role = String(member?.role || '').toLowerCase()
  if (role === 'owner') throw new Error('不能禁言群主')

  const seconds = Number(durationSeconds)
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > MAX_MUTE_SECONDS) {
    throw new Error(`禁言时长必须是 0 到 ${MAX_MUTE_SECONDS} 之间的整数秒`)
  }
  if (!group.muteMember) throw new Error('当前适配器不支持群禁言')
  await group.muteMember(userId, seconds)

  const durationText = seconds === 0
    ? '已解除禁言'
    : seconds >= 3600
      ? `${(seconds / 3600).toFixed(seconds % 3600 ? 1 : 0)} 小时`
      : `${Math.ceil(seconds / 60)} 分钟`
  return `群 ${groupId}：${memberName(member)}（${userId}）${durationText}${reason ? `。原因：${reason}` : ''}`
}

export async function recallGroupMessage ({ messageId = '', useReply = true } = {}, ctx) {
  const { e, group, groupId } = groupOf(ctx)
  const explicitId = String(messageId || '').trim()
  const sourceId = explicitId || (useReply === false ? '' : replyMessageId(e))
  const sourceSeq = e?.source?.seq || e?.source?.id || ''
  if (!sourceId && !sourceSeq) throw new Error('请回复要撤回的消息，或提供 messageId')

  const message = await fetchMessage(group, sourceId, sourceSeq)
  if (!message) throw new Error('无法获取目标消息，请确认它是最近可查询的消息，或直接提供 messageId')
  const targetId = String(message.message_id || sourceId || '')
  if (!targetId) throw new Error('无法确定目标消息 ID')

  const senderId = String(message.sender?.user_id || message.user_id || '')
  if (senderId && senderId !== String(e.self_id)) {
    const member = await sourceMember(group, senderId)
    const role = String(member?.role || '').toLowerCase()
    if (role === 'owner') throw new Error('不能撤回群主的消息')
    if (role === 'admin') throw new Error('不能撤回管理员的消息')
  }
  if (!group.recallMsg) throw new Error('当前适配器不支持群消息撤回')
  await group.recallMsg(targetId)
  return `群 ${groupId}：已撤回消息 ${targetId}`
}
