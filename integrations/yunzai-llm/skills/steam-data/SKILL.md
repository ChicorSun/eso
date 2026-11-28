<!-- TRSS-ESO-MANAGED: 由 TRSS ESO 自动部署；删除本项目标记后可安全自行维护。 -->
---
name: steam-data
description: 查询 QQ 的 Steam 绑定，以及 Steam 账号资料、在线状态、游戏库、游玩时长、成就、库存、愿望单和游玩历史
requires_tools:
  - esocn_steam_binding
  - esocn_steam_profile
  - esocn_steam_games
  - esocn_steam_achievements
  - esocn_steam_inventory
  - esocn_steam_wishlist
  - esocn_steam_play_history
---

# Steam 数据查询

## 查询路由

- QQ 是否绑定 Steam、所有绑定与推送开关：`esocn_steam_binding`
- 账号资料和当前在线状态：`esocn_steam_profile`
- 游戏库、总时长、两周时长、单游戏详细时长：`esocn_steam_games`
- 指定 AppID 的成就详情：`esocn_steam_achievements`
- Steam 社区库存：`esocn_steam_inventory`
- Steam 愿望单、价格和折扣：`esocn_steam_wishlist`
- 群友原始游玩会话历史：`esocn_steam_play_history`

## 参数规则

- 查询绑定使用 `qq`；省略时默认当前消息发送者。
- 其他工具可传 `steamId`，支持 17 位 SteamID、好友码、vanity ID 和 Steam 个人资料链接。
- 其他工具也可传 `qq`，使用该 QQ 当前绑定的 Steam 账号。
- `esocn_steam_achievements` 必须提供游戏 `appid`。
- 大型列表支持 `page`、`pageSize`；先读取返回的 `totalPages`，再按需翻页。
- 资料或库存为私密时照实说明，不要猜测缺失数据。
