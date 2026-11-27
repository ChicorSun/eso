<!-- TRSS-ESO-MANAGED: 由 TRSS ESO 自动部署；删除本项目标记后可安全自行维护。 -->
---
name: message-sender
description: 向当前 QQ 群发送文字、一张或多张图片、文字加图片，并控制是否 @ 全体成员或指定成员
requires_tools:
  - qq_group_send_message
---

# 群消息发送

当用户明确要求“发出去”“发到群里”“通知某人/全体”或“带图发送”时，使用 `qq_group_send_message`。

## 内容参数

- 纯文字：只传 `text`。
- 纯图片：只传 `images`，数组支持 1–20 张图片。
- 文字加图片：同时传 `text` 和 `images`。
- 图片可使用公开 `http(s)` URL、`base64://`，或机器人可访问的本地图片路径。

## 通知模式

- 不通知任何人：`notifyMode: "none"`。
- 通知指定成员：`notifyMode: "members"`，同时传 `notifyMembers`；成员可写 QQ、群名片或昵称。
- 通知群体：`notifyMode: "all"`。
- 同时通知群体和指定成员：`notifyMode: "all_and_members"`，并传 `notifyMembers`。

## 规则

1. 只在用户明确要求发送消息时调用，不要把普通聊天内容擅自发到群里。
2. 用户没有要求 @ 时使用 `none`。
3. 用户明确要求 @全体时才使用 `all` 或 `all_and_members`。
4. 昵称匹配到多人时让用户改用 QQ 号确认。
5. 工具成功后不要再生成额外聊天回复，避免重复发送。
