<!-- TRSS-ESO-MANAGED: 由 TRSS ESO 自动部署；删除本项目标记后可安全自行维护。 -->
---
name: group-admin
description: QQ 群管理操作；仅在群主、管理员或机器人主人明确要求时执行禁言、解除禁言或撤回指定消息
requires_tools:
  - qq_group_mute
  - qq_group_recall
  - qq_group_role
---

# QQ 群管理

只处理当前 QQ 群，不跨群操作。

## 可用操作

- 禁言或解除禁言：`qq_group_mute`
  - `target` 可填 QQ、群名片或昵称；如果用户 @ 了成员，可以省略。
  - `durationSeconds` 必须明确，`0` 表示解除禁言，最长 30 天。
- 撤回指定消息：`qq_group_recall`
  - 用户回复目标消息时可以不传 `messageId`。
  - 只有明确提供消息 ID 时才传入 `messageId`。
- 查询成员身份：`qq_group_role`

## 安全规则

1. 禁言和撤回属于破坏性操作，只在用户明确要求时执行。
2. 昵称匹配到多人时不得猜测，应先让用户改用 QQ 号确认。
3. 不撤回群主或管理员的消息，不禁言群主；管理员不得禁言其他管理员。
4. 如果工具返回权限不足、消息不存在或适配器不支持，照实告知用户，不要声称操作成功。
5. 操作完成后只报告实际结果，不泄露无关成员信息。
