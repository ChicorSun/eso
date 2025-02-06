# ESO-BOT

## 📋介绍

Yunzai系列Bot插件,本插件基于TRSS-Yunzai作为开发环境,其他框架可能有不支持的地方

本插件主要功能是提供QQ群聊查询上古卷轴OL的相关信息

次要功能是提供轻松的娱乐功能活跃群聊气氛

#### TRSS指路

| 名称 | 作者 | GitHub | Gitee | 备注  |
|------| ---- | ------ | ----- | ----- |
| TRSS-Yunzai | [@时雨🌌星空](../../../../TimeRainStarSky) | [☞GitHub](https://github.com/TimeRainStarSky/Yunzai) | [☞Gitee](https://gitee.com/TimeRainStarSky/Yunzai) | Yunzai 应用端，支持多账号，支持协议端：go-cqhttp、ComWeChat、GSUIDCore、ICQQ、QQBot、QQ频道、微信、KOOK、Telegram、Discord、OPQBot |
| 插件集合索引库 | [@渔火Arcadia](https://gitee.com/yhArcadia) | [☞GitHub](https://github.com/yhArcadia/Yunzai-Bot-plugins-index) | [☞Gitee](https://gitee.com/yhArcadia/Yunzai-Bot-plugins-index) | 云崽相关内容索引库 |

## 安装插件

### 安装

#### 使用GitHub安装

考虑到github访问困难，不便于更新维护，目前暂时停止更新

#### 使用Gitee安装

```bash
git clone --depth=1 https://gitee.com/Chicor/eso.git ./plugins/eso/
```

### 安装依赖

```bash
pnpm install --filter=eso
```

## 使用

发送 `#ESO帮助`查看插件部分功能

如果需要使用命令`#帮助`直接查看,请确保已经安装锅巴插件，并正确给每个群配置了合适的插件黑名单或者白名单

#### 锅巴指路

| 名称  |  作者  | 备注  |
|-------| ----- |------ |
| [锅巴插件 (guoba-plugin)](https://gitee.com/guoba-yunzai/guoba-plugin) | [@zolay-poi](https://github.com/zolay-poi) | V3主要提供云崽的网页端后台管理界面功能；V2提供丝滑迁移V3功能。 |


### 基础功能

| 功能 | 命令 | 权限 | 需要@ | 说明 |
|------|------|------|-------|------|
| 帮助 | #ESO帮助 | 所有人 | 否 | 获取插件帮助图 |
| 通知全体 | #全体成员 | 入群满30天 | 否 | 后面接上想要通知全体成员的话语 |
| 无畏 | #无畏 | 所有人 | 否 | 获取最近的无畏者副本信息 |
| 无畏详情 | #(昨日、今日、明日)无畏 | 所有人 | 否 | 获取无畏套装效果 |
| 图鉴 | #装备名|*技能名 | 所有人 | 否 | #开头用于查询套装图鉴，*开头用于查询技能图鉴，支持常用别名 |
| esolog解析 | 网址 | 所有人 | 否 | 直接发送esolog网页具体数据的网址，生成图表 |
| 黄金商人 | #黄金商人 | 所有人 | 否 | 查询黄金商人的商品，可能会因为网络被墙无法使用 |
| 禁言转盘 | #禁言转盘 | 所有人 | 否 | 娱乐功能，禁言发出请求的群友随机时间 |
| 服务器状态 | #服务器状态 | 所有人 | 否 | 查询服务器状态 |
| 服务器公告 | #服务器公告 | 所有人 | 否 | 查询服务器维护公告 |
| 时间查询 | #几点了 | 所有人 | 否 | 查询UTC时间，方便理解服务器公告 |
| 发言统计 | #发言榜(日榜、月榜)? | 所有人 | 否 | 统计群友水群次数 |
| 群昵称格式 | 群昵称格式 | 所有人 | 否 | 查询规范的群昵称格式，方便加好友以及交流 |
| 更新插件 | #更新eso | 主人 | 否 | 更新本插件 |

注意：

1. "主人"权限指在 Yunzai-Bot 配置文件中设置的主人账号
2. "主人/开放"表示该功能默认主人可用，可通过配置开放给其他用户
3. 部分功能可能需要额外配置，请查看具体说明

## 交流与反馈

你可以提issue或者PR

如需联系我，可以QQ群452116107内寻找 @Chicor和人

## 免责声明

1. 功能仅限内部交流与小范围使用，严禁将 `eso-bot` 用于任何商业用途或盈利
2. 图片与其他素材均来自于网络，仅供交流学习使用，如有侵权请联系 `2268233763@qq.com`删除
3. 本插件仅用于学习交流，开发者不对因使用本插件而造成的任何损失负责

## 鸣谢

- [ESOLOG](https://www.esologs.com/)
- [TRSS-Yunzai](../../TimeRainStarSky/Yunzai)
- [Yunzai-Bot](https://gitee.com/Le-niao/Yunzai-Bot)