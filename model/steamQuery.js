import Steam from './steam.js'
import SteamAchievements from './steamAchievements.js'
import SteamUser from './steamUser.js'

const PERSONA_STATES = {
  0: '离线',
  1: '在线',
  2: '忙碌',
  3: '离开',
  4: '打盹',
  5: '想交易',
  6: '想玩游戏'
}

function formatTime (seconds) {
  const value = Number(seconds)
  return Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString() : ''
}

function playtime (minutes) {
  const total = Math.max(0, Number(minutes) || 0)
  return {
    minutes: total,
    hours: Number((total / 60).toFixed(2)),
    text: Steam.formatPlaytime(total)
  }
}

async function resolveAccount ({ steamId = '', qq = '' } = {}, ctx) {
  const qqId = String(qq || ctx?.e?.user_id || '').trim()
  const input = String(steamId || '').trim()
  const resolved = input
    ? await Steam.resolveSteamId(input)
    : SteamUser.getUserSteamId(qqId)
  if (!resolved) throw new Error(input ? `无法解析 Steam ID「${input}」` : `QQ ${qqId || '当前用户'} 没有绑定 Steam 账号`)
  return { steamId: String(resolved), qqId }
}

async function fetchJson (url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'
    },
    signal: AbortSignal.timeout(20000)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

class SteamQuery {
  async binding (qq, ctx) {
    const qqId = String(qq || ctx?.e?.user_id || '').trim()
    if (!qqId) throw new Error('请提供 QQ 或平台用户 ID')
    const bindings = SteamUser.getAllBindings(qqId)
    return {
      qq: qqId,
      bound: bindings.length > 0,
      current: bindings.find(item => item.isBind) || bindings[0] || null,
      bindings: bindings.map(item => ({
        steamId: String(item.steamId || ''),
        steamName: String(item.steamName || ''),
        avatar: String(item.avatarfull || ''),
        current: item.isBind === true,
        bindTime: item.bindTime || '',
        lastUpdate: item.lastUpdate || '',
        gamePush: item.lastGameCheck !== 0,
        onlinePush: item.lastOnlineCheck !== 0,
        achievementPush: item.lastAchCheck !== 0
      })).filter(item => item.steamId)
    }
  }

  async profile (options, ctx) {
    const account = await resolveAccount(options, ctx)
    const player = await Steam.getUserInfo(account.steamId)
    if (!player) throw new Error('无法获取 Steam 账号资料，账号可能不存在或资料不可见')
    return {
      qq: account.qqId,
      steamId: account.steamId,
      friendCode: Steam.getFriendCode(account.steamId),
      username: player.personaname || '',
      realName: player.realname || '',
      profileUrl: player.profileurl || '',
      avatar: player.avatarfull || player.avatarmedium || '',
      state: Number(player.personastate || 0),
      stateText: PERSONA_STATES[Number(player.personastate || 0)] || '未知',
      visibility: Number(player.communityvisibilitystate || 0),
      createdAt: formatTime(player.timecreated),
      lastLogoff: formatTime(player.lastlogoff),
      countryCode: player.loccountrycode || '',
      currentGame: player.gameextrainfo ? {
        appid: String(player.gameid || ''),
        name: player.gameextrainfo,
        serverIp: player.gameserverip || ''
      } : null
    }
  }

  async games (options = {}, ctx) {
    const account = await resolveAccount(options, ctx)
    const all = await Steam.getOwnedGames(account.steamId)
    const needle = String(options.query || '').trim().toLowerCase()
    const appid = String(options.appid || '').trim()
    const filtered = all.filter(game =>
      (!needle || String(game.name || '').toLowerCase().includes(needle)) &&
      (!appid || String(game.appid) === appid)
    )
    const sort = ['recent', 'total', 'name'].includes(options.sort) ? options.sort : 'recent'
    filtered.sort((a, b) => {
      if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
      if (sort === 'total') return (b.playtime_forever || 0) - (a.playtime_forever || 0)
      if ((b.playtime_2weeks || 0) !== (a.playtime_2weeks || 0)) return (b.playtime_2weeks || 0) - (a.playtime_2weeks || 0)
      return (b.playtime_forever || 0) - (a.playtime_forever || 0)
    })
    const page = Math.max(1, Math.floor(Number(options.page) || 1))
    const pageSize = Math.max(1, Math.min(Math.floor(Number(options.pageSize) || 30), 200))
    const offset = (page - 1) * pageSize
    return {
      qq: account.qqId,
      steamId: account.steamId,
      totalGames: all.length,
      matchedGames: filtered.length,
      totalPlaytime: playtime(all.reduce((sum, game) => sum + (game.playtime_forever || 0), 0)),
      recentTwoWeeks: playtime(all.reduce((sum, game) => sum + (game.playtime_2weeks || 0), 0)),
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      games: filtered.slice(offset, offset + pageSize).map(game => ({
        appid: String(game.appid),
        name: game.name || `App ${game.appid}`,
        icon: Steam.getIconImgUrlByAppid(game.appid),
        cover: Steam.getHeaderImgUrlByAppid(game.appid),
        playtimeForever: playtime(game.playtime_forever),
        playtimeTwoWeeks: playtime(game.playtime_2weeks),
        hasCommunityStats: game.has_community_visible_stats === true
      }))
    }
  }

  async achievements (options = {}, ctx) {
    const account = await resolveAccount(options, ctx)
    const appid = String(options.appid || '').trim()
    if (!/^\d+$/.test(appid)) throw new Error('请提供 Steam 游戏 AppID')
    const stats = await Steam.getPlayerAchievements(account.steamId, appid)
    if (!stats?.achievements?.length) throw new Error('无法获取成就，可能是游戏无成就、未游玩或资料为私密')
    const [schema, percents] = await Promise.all([
      SteamAchievements.getSchema(appid),
      SteamAchievements.getPercents(appid)
    ])
    const status = ['all', 'unlocked', 'locked'].includes(options.status) ? options.status : 'all'
    const all = stats.achievements
      .map(item => {
        const meta = schema.get(item.apiname) || {}
        return {
          apiName: item.apiname,
          name: meta.displayName || item.apiname,
          description: meta.description || '',
          icon: meta.icon || '',
          unlocked: item.achieved === 1,
          unlockTime: formatTime(item.unlocktime),
          globalPercent: typeof percents.get(item.apiname) === 'number' ? percents.get(item.apiname) : null
        }
      })
      .filter(item => status === 'all' || (status === 'unlocked' ? item.unlocked : !item.unlocked))
      .sort((a, b) => (Number(b.unlocked) - Number(a.unlocked)) || String(a.name).localeCompare(String(b.name), 'zh-CN'))
    const page = Math.max(1, Math.floor(Number(options.page) || 1))
    const pageSize = Math.max(1, Math.min(Math.floor(Number(options.pageSize) || 30), 200))
    const offset = (page - 1) * pageSize
    const unlocked = stats.achievements.filter(item => item.achieved === 1).length
    return {
      qq: account.qqId,
      steamId: account.steamId,
      appid,
      gameName: stats.gameName || `App ${appid}`,
      total: stats.achievements.length,
      unlocked,
      locked: stats.achievements.length - unlocked,
      completionPercent: Number((unlocked / stats.achievements.length * 100).toFixed(2)),
      matched: all.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(all.length / pageSize)),
      achievements: all.slice(offset, offset + pageSize)
    }
  }

  async inventory (options = {}, ctx) {
    const account = await resolveAccount(options, ctx)
    const page = Math.max(1, Math.floor(Number(options.page) || 1))
    const pageSize = Math.max(1, Math.min(Math.floor(Number(options.pageSize) || 30), 200))
    const wanted = (page - 1) * pageSize + pageSize
    const assets = []
    const descriptions = new Map()
    let startAssetid = ''
    let total = 0
    let more = true

    try {
      for (let round = 0; more && assets.length < wanted && round < 20; round++) {
        const params = new URLSearchParams({ l: 'schinese', count: '500' })
        if (startAssetid) params.set('start_assetid', startAssetid)
        const data = await fetchJson(`https://steamcommunity.com/inventory/${account.steamId}/753/6?${params}`)
        if (!Array.isArray(data.assets)) throw new Error('库存为空、私密或无法访问')
        total = Number(data.total_inventory_count || total || data.assets.length)
        for (const desc of data.descriptions || []) descriptions.set(`${desc.classid}_${desc.instanceid || 0}`, desc)
        assets.push(...data.assets)
        more = data.more_items === true
        startAssetid = data.last_assetid || ''
        if (!startAssetid) break
      }
    } catch (err) {
      throw new Error(`Steam 社区库存无法访问，可能是库存私密、Steam 限流或网络不可达：${err?.message || err}`)
    }

    const items = assets.map(asset => {
      const desc = descriptions.get(`${asset.classid}_${asset.instanceid || 0}`) || {}
      const rarity = (desc.tags || []).find(tag => tag.category === 'Rarity')
      return {
        assetId: String(asset.assetid || ''),
        classId: String(asset.classid || ''),
        instanceId: String(asset.instanceid || ''),
        amount: Number(asset.amount || 1),
        name: desc.market_name || desc.name || '未知物品',
        type: desc.type || '',
        description: desc.type || '',
        icon: desc.icon_url ? `https://community.akamai.steamstatic.com/economy/image/${desc.icon_url}` : '',
        rarity: rarity?.localized_tag_name || '',
        marketable: desc.marketable === 1,
        tradable: desc.tradable === 1,
        commodity: desc.commodity === 1
      }
    })
    const offset = (page - 1) * pageSize
    return {
      qq: account.qqId,
      steamId: account.steamId,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      marketable: items.filter(item => item.marketable).length,
      tradable: items.filter(item => item.tradable).length,
      items: items.slice(offset, offset + pageSize)
    }
  }

  async wishlist (options = {}, ctx) {
    const account = await resolveAccount(options, ctx)
    const wishlist = await fetchJson(`https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${account.steamId}`)
    const sourceItems = wishlist?.response?.items || []
    const page = Math.max(1, Math.floor(Number(options.page) || 1))
    const pageSize = Math.max(1, Math.min(Math.floor(Number(options.pageSize) || 30), 200))
    const offset = (page - 1) * pageSize
    const pageItems = sourceItems.slice(offset, offset + pageSize)
    let details = {}
    if (pageItems.length) {
      const appids = pageItems.map(item => String(item.appid)).filter(Boolean)
      const response = await fetchJson(`https://store.steampowered.com/api/appdetails?appids=${appids.join(',')}&l=schinese&filters=basic,price_overview,release_date`)
      details = response || {}
    }
    const items = pageItems.map(item => {
      const appid = String(item.appid)
      const detail = details[appid]?.success ? details[appid].data : {}
      const price = detail.price_overview || {}
      return {
        appid,
        name: detail.name || item.name || `App ${appid}`,
        cover: Steam.getHeaderImgUrlByAppid(appid),
        priority: item.priority ?? null,
        addedAt: formatTime(item.date_added),
        discountPercent: Number(price.discount_percent || 0),
        priceCents: price.final != null ? Number(price.final) : null,
        originalCents: price.initial != null ? Number(price.initial) : null,
        currency: price.currency || '',
        releaseString: detail.release_date?.date || ''
      }
    })
    return {
      qq: account.qqId,
      steamId: account.steamId,
      total: sourceItems.length,
      discounted: items.filter(item => item.discountPercent > 0).length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(sourceItems.length / pageSize)),
      items
    }
  }
}

export default new SteamQuery()
