<!-- TRSS-ESO-MANAGED: 由 TRSS ESO 自动部署；删除本项目标记后可安全自行维护。 -->
---
name: eso-data
description: 查询《上古卷轴OL》(ESO)数据时使用；覆盖装备套装、技能与篆刻、Buff 出处、副本、商人、配装、攻略、新闻和服务器状态
requires_tools:
  - esocn_search_equip
  - esocn_antiquity_leads
  - esocn_search_skill
---

# ESO 数据查询

遇到《上古卷轴OL》问题时，可按问题类型从下面的 `esocn_*` 工具中选用；不要猜游戏数据和掉落。

## 查询路由

- 版本或数据新旧：`esocn_version`、`esocn_data_status`
- 服务器在线与维护：优先 `esocn_server_status`
- 装备与套装效果：`esocn_search_equip`；神话装备会附带古物线索
- 神话装备的古物线索、线索图标、获取地点，或按古物名反查：`esocn_antiquity_leads`
- 套装出处：`esocn_set_place`
- 技能、职业精通：`esocn_search_skill`
- 篆刻魔典、脚本和组合合法性：`esocn_scribing`
- 增益/减益列表：`esocn_buff_list`
- 增益/减益出处：`esocn_buff_sources`
- 副本、试炼、竞技场列表：`esocn_search_dungeon`
- 副本 BOSS、成就和掉落详情：`esocn_dungeon_detail`
- 每日无畏者誓约：`esocn_daily_undaunted`
- 本周试炼/竞技场：`esocn_weekly_trial`
- 商人：`esocn_vendor`
- 配装列表、详情或分享码：`esocn_builds`、`esocn_build_detail`
- 攻略：`esocn_guides`，拿到 ID 后再用 `esocn_guide_detail`
- 家具、食物、收藏品家具：`esocn_furniture`、`esocn_search_furniture`、`esocn_search_food`、`esocn_search_collectible`
- 官方新闻、社区新闻：`esocn_official_news`、`esocn_community_news`
- QQ 群主和管理员：`qq_group_role`
- B 站 UP 主、视频列表、单视频、字幕、搜索：`bili_up`、`bili_up_videos`、`bili_video`、`bili_subs`、`bili_search`、`bili_page`
- B 站视频深度阅读、评论、弹幕、本地转写或 OCR：`bili_watch`
- 静态 `web_fetch` 只能拿到空壳、内容依赖 JavaScript 渲染时：`browser_fetch`

## 回答规则

1. 工具已经返回了完整文字时，提炼回答，不要冒充自己知道游戏数据。
2. 有多个候选时，优先选与用户给出的完整名称、职业或版本一致的那一项；仍不确定就列出少量候选让用户确认。
3. 不编造掉落地点、数值、脚本合法性或配装内容。
4. 这些是只读查询工具。用户只要资料时直接回答文字；用户明确要图片时，再走 TRSS 现有命令或图片能力。
