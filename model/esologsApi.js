/**
 * ESOLogs v2 GraphQL API 客户端（OAuth 2.0 Client Credentials 流）
 *
 * 数据源：https://www.esologs.com/api/v2/client（仅公开数据）
 * 凭证：data/eso/custome_resources/config/esologcfg.json 中的
 *       esologsClientId / esologsClientSecret（由 #esolog设置apikey 命令写入）
 *
 * 该模块完全替代旧的无头浏览器 DOM 抓取方案。
 */
import fs from 'node:fs'
import fetch from 'node-fetch'

const CONFIG_PATH = './data/eso/custome_resources/config/esologcfg.json'
const TOKEN_URI = 'https://www.esologs.com/oauth/token'
const API_URL = 'https://www.esologs.com/api/v2/client'
const LOG = '[ESO:ESOLogs-API]'

// token 内存缓存（Client Credentials token 有效期约 360 天）
let cachedToken = null
let tokenExpireAt = 0

/** 读取凭证配置（不存在返回 null） */
export function getCredentials () {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    if (cfg.esologsClientId && cfg.esologsClientSecret) {
      return { clientId: cfg.esologsClientId, clientSecret: cfg.esologsClientSecret }
    }
    return null
  } catch (err) {
    logger.error(`${LOG} 读取凭证配置失败: ${err.message}`)
    return null
  }
}

/** 是否已配置凭证 */
export function hasCredentials () {
  return getCredentials() !== null
}

/** 写入凭证并返回是否成功 */
export function setCredentials (clientId, clientSecret) {
  try {
    const cfg = fs.existsSync(CONFIG_PATH)
      ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
      : {}
    cfg.esologsClientId = clientId
    cfg.esologsClientSecret = clientSecret
    fs.mkdirSync('./data/eso/custome_resources/config', { recursive: true })
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
    // 凭证变更后作废旧 token
    cachedToken = null
    tokenExpireAt = 0
    return true
  } catch (err) {
    logger.error(`${LOG} 保存凭证失败: ${err.message}`)
    return false
  }
}

/**
 * 获取 access token（Client Credentials 流）
 * @param {boolean} force 强制重新获取
 * @returns {Promise<string>}
 */
export async function getAccessToken (force = false) {
  if (!force && cachedToken && Date.now() < tokenExpireAt) {
    return cachedToken
  }

  const cred = getCredentials()
  if (!cred) {
    throw new Error('未配置 ESOLogs API 凭证，请使用 #esolog设置apikey{clientId}:{clientSecret} 配置')
  }

  const body = new URLSearchParams()
  body.append('grant_type', 'client_credentials')

  const resp = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${cred.clientId}:${cred.clientSecret}`).toString('base64')
    },
    body: body.toString()
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`获取 ESOLogs token 失败 (HTTP ${resp.status}): ${text.slice(0, 300)}`)
  }

  const data = await resp.json()
  if (!data.access_token) {
    throw new Error(`获取 ESOLogs token 失败: 响应缺少 access_token (${JSON.stringify(data).slice(0, 200)})`)
  }

  cachedToken = data.access_token
  // expires_in 单位秒，留 300s 余量
  const expiresIn = Number(data.expires_in) || 3600
  tokenExpireAt = Date.now() + (expiresIn - 300) * 1000
  logger.info(`${LOG} 已获取 access token，有效期 ${expiresIn}s`)
  return cachedToken
}

/**
 * 调用 GraphQL 公开 API
 * @param {string} query GraphQL 查询字符串
 * @returns {Promise<any>} 返回 data 部分
 */
export async function graphql (query) {
  const doQuery = async (token) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60000)
    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ query }),
        signal: controller.signal
      })
      if (resp.status === 401) {
        const err = new Error('ESOLogs token 已失效')
        err.status = 401
        throw err
      }
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(`ESOLogs GraphQL 请求失败 (HTTP ${resp.status}): ${text.slice(0, 300)}`)
      }
      return resp.json()
    } finally {
      clearTimeout(timer)
    }
  }

  let result
  try {
    result = await doQuery(await getAccessToken())
  } catch (err) {
    // token 失效时强制刷新重试一次（凭证可能被更换/撤销）
    if (err && err.status === 401) {
      result = await doQuery(await getAccessToken(true))
    } else {
      throw err
    }
  }
  if (result.errors) {
    throw new Error(`ESOLogs GraphQL 错误: ${JSON.stringify(result.errors).slice(0, 500)}`)
  }
  return result.data
}

/** 查询限流用量（每小时积分） */
export async function getRateLimit () {
  const data = await graphql('{ rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn } }')
  return data.rateLimitData
}

export default {
  getCredentials,
  hasCredentials,
  setCredentials,
  getAccessToken,
  graphql,
  getRateLimit
}
