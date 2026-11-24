import plugin from '../../../lib/plugins/plugin.js'
import common from '../../../lib/common/common.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import database, { detectBuffDebuffInText, isSetIndexResultEmpty, setAtlasSrcMode, getScriptList } from '../model/database.js'
import apiDataSource from '../model/apiDataSource.js'
import gearConfig from '../model/gearConfig.js'
import esoCfg from '../model/esoCfg.js'
import sssDecoder from '../model/sssDecoder.js'
import moment from 'moment'
import md5 from 'md5'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 图鉴数据源：'local' 本地数据库（默认）| 'api' ESOCN API（失败请先检查网络，可用 local 兜底） */
let srcMode = 'local'

/**
 * 装备品质颜色（与 esologPuzzle.js / esocn.js 的五档色板一致）
 * quality: 1=普通 2=优秀 3=精良 4=史诗 5=传说
 */
function esoQualityColor (quality) {
  switch (Number(quality)) {
    case 5: return 'rgb(255, 230, 45)'   // 传说
    case 4: return 'rgb(163, 53, 238)'   // 史诗
    case 3: return 'rgb(58, 146, 254)'   // 精良
    case 2: return 'rgb(47, 213, 14)'    // 优秀
    default: return 'rgb(170, 170, 170)' // 普通
  }
}

/** item 链接 subtype 表（LibItemLink 提取，401 条：subtype → {level, quality}） */
let itemSubtypesCache = null
function loadItemSubtypes () {
  if (itemSubtypesCache) return itemSubtypesCache
  try {
    const p = path.join(__dirname, '../resources/data/item_link_subtypes.json')
    itemSubtypesCache = JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (err) {
    logger?.error?.(`[ESO:图鉴] 加载 item_link_subtypes.json 失败: ${err?.message || err}`)
    itemSubtypesCache = {}
  }
  return itemSubtypesCache
}

/**
 * 根据 item 链接的 SubType 与 InternalLevel 解析品质/等级信息
 * @param {number|string} subtype 链接第 2 字段（SubType）
 * @param {number|string} internalLevel 链接第 3 字段（InternalLevel，0-50）
 * @returns {object|null} { quality, color, level, cp, isCp }；未知 subtype 返回 null
 */
function itemSubtypeInfo (subtype, internalLevel) {
  const table = loadItemSubtypes()
  const entry = table[String(subtype)]
  if (!entry) return null
  const quality = Number(entry.quality) || 1
  const cpLevel = Number(entry.level) || 1
  const isCp = cpLevel >= 51 // 51~68 = CP10~CP180
  return {
    quality,
    color: esoQualityColor(quality),
    level: String(internalLevel ?? 0),     // InternalLevel（CP 装备通常为 50）
    cp: isCp ? (cpLevel - 50) * 10 : 0,    // CP 点数
    isCp,
  }
}

/** 全物品名表（dataAllItemsCN.json，id → {name, itemTypeName}；懒加载缓存） */
let allItemsCNCache = null
function loadAllItemsCN () {
  if (allItemsCNCache) return allItemsCNCache
  try {
    const p = path.join(__dirname, '../resources/data/segments/dataAllItemsCN.json')
    allItemsCNCache = JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (err) {
    logger?.error?.(`[ESO:图鉴] 加载 dataAllItemsCN.json 失败: ${err?.message || err}`)
    allItemsCNCache = {}
  }
  return allItemsCNCache
}

/** 按 id 查物品中文名（dataAllItemsCN；查不到返回 null） */
function getItemNameById (id) {
  if (id == null || id === 0) return null
  const entry = loadAllItemsCN()[String(id)]
  return entry?.name || null
}

//装备图鉴结构体变量
let setData = {
}

//cacheData to save img
let setImg = {
  md5: '',
  img: ''
}

//技能图鉴结构体变量
let skillData = {
}

//cacheData to save img
let skillImg = {
  md5: '',
  img: ''
}

//食物图鉴结构体变量
let foodData = {
}

//cacheData to save img
let foodImg = {
  md5: '',
  img: ''
}

//家具图鉴结构体变量
let furnitureData = {
}

//cacheData to save img
let furnitureImg = {
  md5: '',
  img: ''
}

//收藏品家具图鉴结构体变量
let collFurnitureData = {
}

//cacheData to save img
let collFurnitureImg = {
  md5: '',
  img: ''
}

// =====================================================================
// 职业精通映射表: skillId -> 职业中文名 (硬编码, 内置功能)
// =====================================================================
const CLASS_MASTERY_MAP = {
  238232: '龙骑士',
  240268: '龙骑士',
  259224: '龙骑士',
  263220: '龙骑士',
  263247: '龙骑士',

  263316: '奥术师',
  263398: '奥术师',
  263410: '奥术师',
  263412: '奥术师',
  263416: '奥术师',

  263448: '死灵法师',
  263465: '死灵法师',
  263509: '死灵法师',
  263549: '死灵法师',
  263554: '死灵法师',

  263519: '守望者',
  263520: '守望者',
  263521: '守望者',
  263522: '守望者',
  263523: '守望者',

  263585: '圣殿骑士',
  263586: '圣殿骑士',
  263587: '圣殿骑士',
  263588: '圣殿骑士',
  263589: '圣殿骑士',

  263603: '夜刃',
  263604: '夜刃',
  263605: '夜刃',
  263606: '夜刃',
  263607: '夜刃',

  263870: '巫师',
  263871: '巫师',
  263872: '巫师',
  263873: '巫师',
  263874: '巫师'
}

// 职业中文名 / 别名 -> 标准职业中文名
// 老玩家常用别名: 法师=巫师 (奥术师是新职业, 之前巫师叫"法师")
//                盗贼=夜刃, 甜不辣=圣殿骑士, 窝登=守望者 (音译/常用别名)
const CLASS_NAME_ALIAS = {
  '龙骑士': '龙骑士',
  '龙骑': '龙骑士',

  '奥术师': '奥术师',
  '奥术': '奥术师',

  '死灵法师': '死灵法师',
  '死灵': '死灵法师',

  '守望者': '守望者',
  '守望': '守望者',
  '窝登': '守望者',

  '圣殿骑士': '圣殿骑士',
  '圣殿': '圣殿骑士',
  '圣骑': '圣殿骑士',
  '圣骑士': '圣殿骑士',
  '甜不辣': '圣殿骑士',

  '夜刃': '夜刃',
  '盗贼': '夜刃',

  '巫师': '巫师',
  '法师': '巫师',
  '法法': '巫师',
  '术士': '巫师'
}

// =====================================================================

export class atlas extends plugin {
  constructor (e) {
    super({
      /** 功能名称 */
      name: 'ESO:图鉴',
      /** 功能描述 */
      dsc: '装备图鉴查询',
      event: 'message',
      /** 优先级，数字越小等级越高 */
      priority: 5001,
      /** 匹配不同的关键词 */
      rule: [
        {
          /** SuperStar 分享码：|H1:sss:...|h → 配装卡片（含篆刻技能区域） */
          reg: /\|H1:sss:/i,
          fnc: 'showSuperstarBuild'
        },
        {
          /** 篆刻技能链接：crafted_ability:基础ID:焦点:签名:词缀 */
          reg: /crafted_ability:\d+:\d+:\d+:\d+/i,
          fnc: 'showAtlasByLink'
        },
        {
          /** 游戏内物品链接等：任意文本中含 item:205008: 即查 #ITEMID205008 */
          reg: /item:\d+:/i,
          fnc: 'showAtlasByLink'
        },
        {
          /** 命令正则匹配 */
          reg: '^#.*$',
          /** 执行方法 */
          fnc: 'showAtlas'
        },
        {
          /** 技能图鉴：* 开头（含全角＊） */
          reg: '^[*＊].*$',
          /** 执行方法 */
          fnc: 'showAtlas'
        },
        {
          /** 食物图鉴：% 开头（含全角％） */
          reg: '^[%％].*$',
          /** 执行方法 */
          fnc: 'showAtlas'
        },
        {
          /** 命令正则匹配 */
          reg: '^[!！].*$',
          /** 执行方法 */
          fnc: 'showAtlas'
        }
      ]
    })
  }

  async skipBipu (e) {
    //await this.reply(`*哔噗！*`)
    return 0
  }

  async showSetTips (e) {
    await this.reply(`查看装备图鉴请使用\n`
                      +`#装备名+图鉴 的格式，如: \n`
                      +`#法力治愈图鉴(正常查询)\n`
                      +`#法力治愈(可省略"图鉴")\n`
                      +`#技能治愈(曾用名)\n`
                      +`#spc(常用简称)\n`
                      +`#治愈(模糊匹配)\n`
                      +`#太阳尖顶套装\n`
                      +`#太阳尖顶图鉴\n`
                      +`\n按增益/减益名精确查询（合并转发全部关联图鉴）:\n`
                      +`#高级勇气\n`
                      +`#次级破甲`)
  }

  async showSkillTips (e) {
    await this.reply(`查看技能图鉴请使用\n`
                      +`*技能名+图鉴 的格式，如: \n`
                      +`*法师之光图鉴(正常查询)\n`
                      +`*法师之光(可省略"图鉴")\n`
                      +`*法师(模糊匹配)\n`
                      +`*法会一(所在技能线位置)`)
  }

  async showFoodTips (e) {
    await this.reply(`查看食物图鉴请使用\n`
                      +`%食物名+图鉴 的格式，如: \n`
                      +`%强效巫母之酿图鉴(正常查询)\n`
                      +`%强效巫母之酿(可省略"图鉴")\n`
                      +`%巫母汤(常用简称)\n`
                      +`%巫母(模糊匹配)`)
  }

  async showFurnitureTips (e) {
    await this.reply(`查看家具图鉴请使用\n`
                      +`!家具名+图鉴 的格式，如: \n`
                      +`!棱镜太阳鸟羽毛图鉴(正常查询)\n`
                      +`!棱镜太阳鸟羽毛(可省略"图鉴")\n`
                      +`!音乐盒(模糊匹配)`)
  }

  async showCollFurnitureTips (e) {
    await this.reply(`查看收藏品家具图鉴请使用\n`
                      +`!!收藏品家具名+图鉴 的格式，如: \n`
                      +`!!小瓜尔兽图鉴(正常查询)\n`
                      +`!!小瓜尔兽(可省略"图鉴")`)
  }


  /** 从消息中解析全部 item:数字:（每个与 #ITEMID数字 等价），按出现顺序返回 ID 数组 */
  extractItemIdsFromLink (text) {
    const ids = []
    const matches = String(text || '').matchAll(/item:(\d+):/gi)
    for (const m of matches) ids.push(m[1])
    return ids
  }

  /** 解析 crafted_ability 链接参数：{ abilityId, focusId, signatureId, affixId } */
  extractCraftedAbility (text) {
    const m = String(text || '').match(/crafted_ability:(\d+):(\d+):(\d+):(\d+)/i)
    if (!m) return null
    return { abilityId: m[1], focusId: m[2], signatureId: m[3], affixId: m[4] }
  }

  /** 输出单个篆刻技能卡片：按「基础效果 + 三个脚本效果」合成展示，只输出图片 */
  async showCraftedAbilityCard (e, ca) {
    const scriptList = getScriptList()
    const scriptName = id => (scriptList[id] && scriptList[id].name) ? scriptList[id].name : `脚本#${id}`
    const scriptDesc = id => (scriptList[id] && scriptList[id].description) ? scriptList[id].description : ''

    // 基础技能按 ID 查 skillKey（*技能图鉴 SKILLID 分支同款 mode=21）
    const objSkills = await database.name2index(ca.abilityId, 21)
    if (!Array.isArray(objSkills) || objSkills.length === 0 || String(objSkills[0]).startsWith('-')) {
      await e.reply(`❌ 未找到篆刻基础技能 ID=${ca.abilityId}。`)
      return
    }
    const baseSkillKey = String(objSkills[0]) // 形如 '2_3_2_0'

    // 合成「基础效果 + 三个脚本效果」作为卡片内容
    const skillData = await database.updateData(baseSkillKey, 2)
    const item = skillData?.atlasData?.[1]
    if (!item) {
      await this.showSkillsInfo([baseSkillKey], false)
      return
    }
    const segs = []
    const baseMsg = Array.isArray(item.msg) ? item.msg[0] : null
    if (baseMsg) {
      // 去掉基础段的「X阶：」前缀（三个脚本组合场景下无意义）
      segs.push(String(baseMsg).replace(/^[一二三四五六七八九十]+阶\s*[:：]\s*/, ''))
    }
    // 焦点/签名/词缀：采用 #spc「近期无畏出现日期」模块同款低调背景（rgba(255,255,255,0.04)，
    // 深色卡片上柔和不喧宾夺主），文字用同模块标题色 #9aa8b4，脚本名保持金色
    const scriptMeta = [
      [ca.focusId, '焦点'],
      [ca.signatureId, '签名'],
      [ca.affixId, '词缀'],
    ]
    for (const [sid, role] of scriptMeta) {
      const name = scriptName(sid)
      const desc = scriptDesc(sid)
      const tag = `<span style="display:inline-block;background:rgba(255,255,255,0.04);color:#9aa8b4;border-radius:4px;padding:0 8px;margin-right:6px;font-size:12px;line-height:1.6;vertical-align:baseline;">${role}</span>`
      const goldName = `<span style="color:#C9A227;font-weight:bold;">${name}</span>`
      segs.push(`${tag}${goldName}${desc ? '：' + desc : ''}`)
    }
    item.msg = segs
    // 直接渲染修改后的数据（showSkillsInfo 会重新 updateData 覆盖 msg，不能复用）
    const img = await this.cache(skillData, skillImg)
    if (img) await this.reply(img)
  }

  // ==================== SuperStar 分享码 → 配装卡片 ====================

  /** 技能全表索引缓存：id → {name, icon, tree, ultimate}
   *  dataSkillsCN 结构：职业 → 技能树 → skills[槽]（槽含 id/name 与各形态变体 children）
   *  SuperStar 技能栏 id = 变体 id（如 20668 灼热锐爪）；crafted abilityId = 槽 id（如 7 游刃），两者都要索引
   */
  getSssSkillIndex () {
    if (this._sssSkillIndex) return this._sssSkillIndex
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../resources/data/segments/dataSkillsCN.json'), 'utf8'))
    const idx = {}
    const walk = (obj, treeName) => {
      if (!obj || typeof obj !== 'object') return
      if (obj.id !== undefined && typeof obj.name === 'string' && !(obj.id in idx)) {
        idx[obj.id] = { name: obj.name, icon: obj.icon, tree: treeName, ultimate: !!obj.ultimate }
      }
      // 继续深入（槽的变体 children；无 id/name 的数值/样式对象不会误索引）
      for (const v of Object.values(obj)) walk(v, treeName)
    }
    for (const [cls, trees] of Object.entries(data)) {
      if (cls === 'scriptList' || !trees || typeof trees !== 'object') continue
      for (const tree of Object.values(trees)) {
        if (!tree || typeof tree !== 'object' || !tree.skills) continue
        walk(tree.skills, tree.name)
      }
    }
    this._sssSkillIndex = idx
    return idx
  }

  /** 全量技能索引缓存：id → {name, icon, ultimate}
   *  数据源 dataAbilitiesIndexCN.json（从 DataExtractor-cn.lua dataAbilities 段提取，见 tools/extractAbilitiesIndex.py）
   *  ⚠️ id 体系差异：分享码/GetSlotBoundId 返回 dataAbilities 对象内部 ["id"]（inner，如 193398=实用命运雕刻者、
   *  39073=不稳定风暴之墙、85130=雷霆之怒），dataSkillsCN.json 的技能树编号是另一套（如 186366=实用命运雕刻者）。
   *  合并规则：inner 优先、outer（外层数组下标）兜底——外层 key 1..151867 与部分小数值 inner id 大面积重叠
   *  （73845 个同 key 不同对象），若 outer 优先会把冲突 id 解析成错误技能（曾误判 39073=召唤獸群、85130=娜扎莱）。
   */
  getSssAbilityIndex () {
    if (this._sssAbilityIndex) return this._sssAbilityIndex
    // 优先读运行时缓存（dataAbilitiesIndexCN.json 随 lua 自动更新，见 lua2json.js/database.js）；
    // 缓存缺失或损坏时回退 git 仓库内备份
    const cachePath = path.resolve(process.cwd(), 'data/eso/custome_resources/cache/segments/dataAbilitiesIndexCN.json')
    const backupPath = path.join(__dirname, '../resources/data/segments/dataAbilitiesIndexCN.json')
    let data = null
    try {
      data = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
    } catch {
      data = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
    }
    const idx = {}
    for (const [id, info] of Object.entries(data.byInnerId)) idx[Number(id)] = info
    for (const [id, info] of Object.entries(data.byOuterKey)) {
      const n = Number(id)
      if (!(n in idx)) idx[n] = info
    }
    this._sssAbilityIndex = idx
    return idx
  }

  /** CP 全表索引缓存：id → {dis, name}（读 dataCpSkillsCN.json，dis: crafted/warfare/fitness） */
  getSssCpIndex () {
    if (this._sssCpIndex) return this._sssCpIndex
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../resources/data/segments/dataCpSkillsCN.json'), 'utf8'))
    const disKeyMap = { '1': 'crafted', '2': 'warfare', '3': 'fitness' }
    const idx = {}
    for (const [disKey, v] of Object.entries(data)) {
      const dis = disKeyMap[disKey] || `dis${disKey}`
      for (const skill of Object.values(v.skills || {})) {
        if (skill && skill.id !== undefined) idx[skill.id] = { dis, name: skill.name }
      }
    }
    this._sssCpIndex = idx
    return idx
  }

  /** 技能树索引缓存：skillLineId → {name}（读 dataSkillsCN.json，tree.id 即 ESO skillLineId） */
  getSssTreeIndex () {
    if (this._sssTreeIndex) return this._sssTreeIndex
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../resources/data/segments/dataSkillsCN.json'), 'utf8'))
    const idx = {}
    for (const [cls, trees] of Object.entries(data)) {
      if (cls === 'scriptList' || !trees || typeof trees !== 'object') continue
      for (const tree of Object.values(trees)) {
        if (tree && typeof tree === 'object' && tree.id !== undefined && tree.name) {
          idx[tree.id] = { name: tree.name }
        }
      }
    }
    this._sssTreeIndex = idx
    return idx
  }

  /** 提取 dds/图标路径的文件名（去目录去扩展名） */
  ddsIconName (iconPath) {
    if (!iconPath) return ''
    const name = String(iconPath).split('/').pop()
    return name.includes('.') ? name.split('.')[0] : name
  }

  /** 从图鉴数据判断武器类型（esolog 分支 GI.type 用） */
  weaponTypeOf (atlas) {
    const n = String(atlas?.name || '') + String(atlas?.place || '')
    if (n.includes('火焰')) return 'Fire Staff'
    if (n.includes('寒冰')) return 'Frost Staff'
    if (n.includes('闪电')) return 'Lightning Staff'
    if (n.includes('恢复')) return 'Healing Staff'
    if (n.includes('弓')) return 'Bow'
    if (n.includes('盾')) return 'Shield'
    if (n.includes('匕首')) return 'Dagger'
    if (n.includes('锤')) return 'Hammer'
    if (n.includes('剑')) return 'Sword'
    if (n.includes('斧')) return 'Axe'
    return ''
  }

  /** 食物 buff bitmask → 本地食物图标名（SuperStar 只存类型，选代表性图标） */
  foodBuffIcon (type) {
    const MAX_H = 1, MAX_M = 2, MAX_S = 4, REG_H = 8, REG_M = 16, REG_S = 32
    if (type & MAX_H && type & MAX_M) return 'crowncrate_magickahealth_food'
    if (type & MAX_H && type & MAX_S) return 'crowncrate_staminahealth_food'
    if (type & MAX_M && type & MAX_S) return 'store_magickafood'
    if (type & MAX_H) return 'store_healthfood'
    if (type & MAX_M) return 'store_magickafood'
    if (type & MAX_S) return 'store_staminafood'
    if (type & REG_H) return 'store_healthdrink'
    if (type & REG_M) return 'store_magickadrink'
    if (type & REG_S) return 'store_staminadrink'
    return ''
  }

  /** SuperStar 分享码 → 配装卡片（复用 updateBuildData type=10，篆刻技能融入技能栏下方区域） */
  async showSuperstarBuild (e) {
    const text = String((await this.trimText(e)) || '')
    const decoded = sssDecoder.decodeShareLink(text)
    if (!decoded) {
      await e.reply('❌ 无法解析 SuperStar 分享码。')
      return 0
    }
    await e.reply('开始解析 SuperStar 配装，请稍候...')

    // 分享码尾部可能附带多条 crafted_ability 链接（主/备栏的篆刻技能）
    const craftedList = []
    for (const m of text.matchAll(/crafted_ability:(\d+):(\d+):(\d+):(\d+)/gi)) {
      craftedList.push({ abilityId: m[1], focusId: m[2], signatureId: m[3], affixId: m[4] })
    }

    const BD = await this.buildSuperstarBD(decoded, craftedList)
    const processedData = await database.updateData(BD, 10)
    const img = await puppeteer.screenshot('eso', processedData)
    if (img) await this.reply(img)
    return true
  }

  /** 解码结果 + 篆刻链接 → updateBuildData(BD,10) 需要的 BD 结构 */
  async buildSuperstarBD (d, craftedList) {
    const clsKey = d.class === 117 ? 7 : d.class
    const classInfo = sssDecoder.CLASSES[clsKey] || { en: '', cn: '' }

    // 种族（图片名与 esocn convertRace 一致）
    const raceImgMap = {
      '高精灵': 'Altmer', '木精灵': 'Bosmer', '虎人': 'Khajiit', '红卫人': 'Redguard',
      '兽人': 'Orc', '亚龙人': 'Argonian', '布莱顿人': 'Breton', '暗精灵': 'Dunmer',
      '诺德人': 'Nord', '帝国': 'Imperial'
    }
    const raceInfo = [{
      name_en: raceImgMap[d.raceName] || d.raceName,
      name_cn: d.raceName,
      img: raceImgMap[d.raceName] || 'Dunmer'
    }]

    // 装备（走 updateBuildData esolog itemIDMode 分支：GI.name.image 留空 + link='?pcs=itemId'）
    const slotNames = ['Head', 'Neck', 'Chest', 'Shoulders', 'Main Hand', 'Off Hand', 'Waist', 'Legs', 'Feet', 'Ring 1', 'Ring 2', 'Hands', 'Main Hand Backup', 'Off Hand Backup']
    const gearData = []
    for (let i = 0; i < d.equipment.length; i++) {
      const eq = d.equipment[i]
      if (!eq.occupied) continue
      let atlas = null
      try {
        const objSets = await database.name2index(`ITEMID${eq.itemId}`, 1)
        if (objSets && objSets.length > 0 && !String(objSets[0]).startsWith('-')) {
          const setData = await database.updateData(objSets[0], 1)
          atlas = setData?.atlasData?.[1] || null
        }
      } catch (err) {
        logger.warn(`[ESO:SuperStar] 装备 ${eq.itemId} 查名失败: ${err.message}`)
      }
      // 武器类型 / 护甲类型（GI.type 用于 esolog 分支的类型色与武器图标）
      let type = ''
      const weightText = String(atlas?.weight || '')
      if (i === 4 || i === 5 || i === 12 || i === 13) {
        type = this.weaponTypeOf(atlas)
      } else if (weightText.includes('轻甲')) {
        type = 'Light'
      } else if (weightText.includes('中甲')) {
        type = 'Medium'
      } else if (weightText.includes('重甲')) {
        type = 'Heavy'
      }
      const trait = sssDecoder.traitInfo(eq.trait)
      const enchantName = getItemNameById(eq.enchantId) || ''
      gearData.push({
        slot: slotNames[i],
        type,
        gearType: '',
        name: {
          text: atlas?.name || '',
          enName: atlas?.name_en || '',
          color: sssDecoder.qualityColor(eq.quality),
          image: '',
          link: '?pcs=' + eq.itemId
        },
        set: '',
        setEn: '',
        trait: trait ? trait.en : '',
        enchant: { text: enchantName, color: 'rgb(229, 204, 128)' },
        level: '160'
      })
    }

    // 技能（主/备栏各 6；address=技能树名，ultimate 金色）
    // 三查：dataSkillsCN（带技能线名）→ dataAbilities 全量技能表（分享码 abilityId 体系）→ 兜底 技能#id
    const skillIdx = this.getSssSkillIndex()
    const abilityIdx = this.getSssAbilityIndex()
    const talentData = []
    for (let i = 0; i < 6; i++) {
      const mk = (id) => {
        // 1. 职业技能树索引（含武器/公会/世界线，带技能线名）
        const info = skillIdx[Number(id)]
        if (info) {
          return {
            icon: info.icon,
            text: info.name,
            address: info.tree || ' ',
            color: info.ultimate ? 'rgb(255, 204, 0)' : 'rgb(170, 170, 170)'
          }
        }
        // 2. 全量技能表（dataAbilities：套装被动/U50 新技能等，id 体系与分享码一致；无技能线名）
        const ab = abilityIdx[Number(id)]
        if (ab) {
          return {
            icon: ab.icon,
            text: ab.name,
            address: ' ',
            color: ab.ultimate ? 'rgb(255, 204, 0)' : 'rgb(170, 170, 170)'
          }
        }
        // 3. 兜底：本地库均未收录（占位图 + id，不空缺）
        return {
          icon: 'empty',
          text: `技能#${id}`,
          address: ' ',
          color: 'rgb(170, 170, 170)'
        }
      }
      talentData.push({ mainSkill: mk(d.primarySkills[i]), offSkill: mk(d.backupSkills[i]) })
    }

    // 世界恩赐 / 食物 / 吸血鬼 / 狼人
    const stoneInfo = d.boonInfo ? [{
      name: d.boonInfo.cn,
      name_cn: d.boonInfo.cn,
      name_en: d.boonInfo.en,
      img: d.boonInfo.img
    }] : []

    // 食物：SuperStar 分享码只含 buff 类型 bitmask（如 3=生命+魔力上限），无具体食物名；
    // 文字显示类型描述（同游戏内 "+ 生命上限"），图标选本地代表性食物图
    const foodInfo = []
    if (d.foodBuff && d.foodBuffList.length > 0) {
      const iconName = this.foodBuffIcon(d.foodBuff)
      let img = ''
      if (iconName) {
        try {
          const getimgsTmp = (await import('../model/getimgs.js')).default
          img = await getimgsTmp.realpath(iconName, 'foods')
        } catch (err) {
          logger.warn(`[ESO:SuperStar] 食物图标获取失败: ${err.message}`)
        }
      }
      foodInfo.push({
        name: d.foodBuffList.join('、'),
        name_cn: '+ ' + d.foodBuffList.join('、'),
        name_en: '',
        img
      })
    }

    const getimgs = (await import('../model/getimgs.js')).default
    let vampireInfo = []
    let wolfInfo = []
    if (d.vampWWInfo) {
      const imgName = d.vampWWInfo.type === 'vampire'
        ? `ability_u26_vampire_infection_stage${d.vampWWInfo.stage}`
        : 'ability_werewolf_010'
      try {
        const imgPath = await getimgs.realpath(imgName, 'skills')
        if (d.vampWWInfo.type === 'vampire') vampireInfo = [{ name: d.vampWWInfo.name, img: imgPath }]
        else wolfInfo = [{ name: '狼人病', img: imgPath }]
      } catch (err) {
        logger.warn(`[ESO:SuperStar] ${imgName} 图标获取失败: ${err.message}`)
        if (d.vampWWInfo.type === 'vampire') vampireInfo = [{ name: d.vampWWInfo.name, img: '' }]
        else wolfInfo = [{ name: '狼人病', img: '' }]
      }
    }

    // 篆刻技能（融入技能栏下方区域：bookIcon=基础技能图标，slots1-3=焦点/签名/词缀脚本）
    const scriptList = getScriptList()
    const craftedSkills = []
    for (const ca of craftedList) {
      const base = skillIdx[Number(ca.abilityId)]
      const slots = [ca.focusId, ca.signatureId, ca.affixId]
      const slotData = []
      for (const sid of slots) {
        const script = scriptList[Number(sid)]
        let iconPath = ''
        if (script?.icon) {
          try {
            iconPath = await getimgs.realpath(this.ddsIconName(script.icon), 'craftedScripts')
          } catch (err) {
            logger.warn(`[ESO:SuperStar] 脚本 ${sid} 图标失败: ${err.message}`)
          }
        }
        slotData.push({ name: script?.name || `脚本#${sid}`, icon: iconPath })
      }
      let bookIcon = ''
      if (base?.icon) {
        try {
          // uesp 缺部分篆刻魔典图标（403），改用 storage.esocn.com.cn 源（craftedScripts 同源）
          bookIcon = await getimgs.realpath(this.ddsIconName(base.icon), 'craftedScripts')
        } catch (err) {
          logger.warn(`[ESO:SuperStar] 篆刻基础技能图标失败: ${err.message}`)
        }
      }
      craftedSkills.push({
        name: base?.name || `篆刻#${ca.abilityId}`,
        bookIcon,
        slots1: slotData[0],
        slots2: slotData[1],
        slots3: slotData[2]
      })
    }

    // CP 点（按真实所属 discipline 分组）
    const cpIndex = this.getSssCpIndex()
    const cpPoints = { crafted: [], warfare: [], fitness: [] }
    for (const slots of d.cp) {
      for (const id of slots) {
        if (!id) continue
        const info = cpIndex[Number(id)]
        if (info) cpPoints[info.dis].push({ name: info.name })
      }
    }

    // 职业技能线：skLine3==0 → class mastery（2 个被动索引）；否则 subclassing（3 个 LSF 索引）
    // 展示统一用 imgSkill=false + 职业图（本地 classes 图一定存在，避免技能图标裂图）
    const skillLineInfo = []
    const treeIdx = this.getSssTreeIndex()
    const sl = d.skillLines || []
    if (sl[2] !== 0) {
      // subclassing：3 个 LSF 索引 → 技能线（0 为占位跳过）
      for (const lsf of sl) {
        if (!lsf) continue
        const line = sssDecoder.LSF_CLASS_LINES[lsf]
        if (!line) continue
        const tree = treeIdx[line.skillLineId]
        skillLineInfo.push({
          img: 'ON-icon-class-' + line.className,
          line_name: tree?.name || `技能线#${lsf}`,
          class_name: '',
          imgSkill: false
        })
      }
    } else {
      // class mastery：前两个值为被动索引（1-5），查精通被动技能名+图标
      const mastery = sssDecoder.CLASS_MASTERY[d.class === 117 ? 117 : d.class]
      if (mastery) {
        for (const pidx of [sl[0], sl[1]]) {
          if (!pidx || pidx > 5) continue
          const skillId = sssDecoder.MASTERY_PASSIVES[mastery.lsf]?.[pidx - 1]
          const skill = skillId ? skillIdx[skillId] : null
          // 图标：被动技能图标（同 *技能图鉴）；下载失败回退职业图
          let img = ''
          if (skill?.icon) {
            try {
              const p = await getimgs.realpath(this.ddsIconName(skill.icon), 'skills')
              if (p) img = '../../../../../' + p
            } catch (err) {
              logger.warn(`[ESO:SuperStar] 精通被动图标失败: ${err.message}`)
            }
          }
          skillLineInfo.push({
            img: img || 'ON-icon-class-' + mastery.className,
            line_name: skill?.name || `职业精通#${pidx}`,
            class_name: '',
            imgSkill: !!img
          })
        }
      }
    }

    return {
      virtual: 0,
      isESOCN: true,
      username: 'SuperStar',
      playerName: 'SuperStar 分享码',
      accountName: '',
      title: 'SuperStar 配装',
      buildName: 'SuperStar 配装',
      className: classInfo.en,
      classNameCN: classInfo.cn,
      roleName: '',
      roleNameCN: '',
      attributes: d.attributes,
      race: d.raceName,
      raceInfo,
      gearData,
      talentData,
      stoneInfo,
      foodInfo,
      skillLineInfo,
      vampireInfo,
      wolfInfo,
      craftedSkills,
      cpPoints
    }
  }

  /** 按消息中出现顺序，依次输出全部 item 图鉴与 crafted_ability 技能卡片 */
  async showAtlasByLink (e) {
    await e.reply('开始解析，请稍候...')
    srcMode = gearConfig.resolveModuleMode(srcMode)
    setAtlasSrcMode(srcMode)
    const text = await this.trimText(e)
    const str = String(text || '')

    // 收集所有链接 token（item / crafted_ability），按出现位置排序
    const tokens = []
    for (const m of str.matchAll(/item:(\d+):(\d+):(\d+):(\d+):/gi)) {
      tokens.push({ pos: m.index, type: 'item', id: m[1], subtype: m[2], level: m[3], enchantId: m[4] })
    }
    for (const m of str.matchAll(/crafted_ability:(\d+):(\d+):(\d+):(\d+)/gi)) {
      tokens.push({ pos: m.index, type: 'crafted', abilityId: m[1], focusId: m[2], signatureId: m[3], affixId: m[4] })
    }
    tokens.sort((a, b) => a.pos - b.pos)
    if (tokens.length === 0) return 0

    // 依次输出对应图片
    for (const t of tokens) {
      if (t.type === 'item') {
        await this.showSetsByItemLink(e, t)
      } else {
        await this.showCraftedAbilityCard(e, t)
      }
    }
    return true
  }

  /** 按物品名匹配 defSet/eso/atlasEmoji.yaml，为图鉴注入 emojiIcon（物品名右侧图标） */
  applyEmojiIcon (setData) {
    const emojiMap = esoCfg.getdefSet('eso', 'atlasEmoji') || {}
    const itemName = setData?.atlasData?.[1]?.name || ''
    for (const [keyword, icon] of Object.entries(emojiMap)) {
      if (itemName.includes(keyword)) {
        setData.atlasData[1].emojiIcon = icon
        break
      }
    }
  }

  /** 按 item 链接输出装备图鉴（注入品质颜色与等级信息） */
  async showSetsByItemLink (e, t) {
    srcMode = gearConfig.resolveModuleMode(srcMode)
    setAtlasSrcMode(srcMode)
    const objSets = await database.name2index(`#ITEMID${t.id}`, 1)
    if (isSetIndexResultEmpty(objSets) || objSets.length === 0) {
      await this.showSets(e, `#ITEMID${t.id}`)
      return
    }
    const setData = await database.updateData(objSets[0], 1)
    if (setData?.atlasData?.[1]) {
      // 护甲类型标记（与 esolog/builds 一致：轻甲蓝/中甲绿/重甲红；weight 可能为「重甲 · 脚部」格式）
      const weightText = setData.atlasData[1].weight || ''
      const armorColors = { '轻甲': 'rgb(58, 146, 254)', '中甲': 'rgb(47, 213, 14)', '重甲': 'rgb(227, 36, 33)' }
      for (const [armor, color] of Object.entries(armorColors)) {
        if (weightText.includes(armor)) {
          setData.atlasData[1].armorMark = color
          break
        }
      }
      // 品质颜色 + 等级行（subtype 解析；未知 subtype 时保持原样）
      const info = itemSubtypeInfo(t.subtype, t.level)
      if (info) {
        setData.atlasData[1].name_color = info.color
        setData.atlasData[1].itemLevel = info.level
        setData.atlasData[1].itemCp = info.isCp ? info.cp : 0
      }
      // 附魔（链接第 4 字段 EnchantId；查本地全物品表拿中文名）
      let enchantName = getItemNameById(t.enchantId)
      if (!enchantName) {
        // 非制作套（掉落套）护甲掉落自带对应附魔：轻甲=魔力/中甲=耐力/重甲=生命（制作套 type=3 无附魔属正常，不显示）
        const isCrafted = Number(setData.atlasData[1].item_class) === 3
        if (!isCrafted) {
          const defaultEnchants = { '轻甲': '真正超凡魔力雕文', '中甲': '真正超凡耐力雕文', '重甲': '真正超凡生命雕文' }
          for (const [armor, name] of Object.entries(defaultEnchants)) {
            if (weightText.includes(armor)) {
              enchantName = name
              break
            }
          }
        }
      }
      if (enchantName) {
        setData.atlasData[1].enchantName = enchantName
      }
      // 物品名右侧 emoji 图标（defSet/eso/atlasEmoji.yaml 映射）
      this.applyEmojiIcon(setData)
    }
    const img = await this.cache(setData, setImg)
    if (img) await this.reply(img)
  }

  async showAtlas (e) {
    srcMode = gearConfig.resolveModuleMode(srcMode)
    setAtlasSrcMode(srcMode)
    let name = await this.trimText(e)
    // 先将全部全角感叹号换成半角感叹号（/g 会替换所有出现的 ！），便于后续统一判断
    name = name.replace(/！/g, '!')
    //logger.info(name)

    if(name.includes("/"))
    {
        return 0
    }

    if((name == "*哔噗！*"))
    {
      return this.skipBipu(e)
    }
    if((name == "#图鉴") || (name == "#套装") || (name == "*套装") || (name == "%套装"))
    {
      return this.showSetTips(e)
    }
    if((name == "*图鉴") || (name == "*技能") || (name == "#技能") || (name == "%技能"))
    {
      return this.showSkillTips(e)
    }
    if((name == "%图鉴") || (name == "%食物") || (name == "#食物") || (name == "*食物"))
    {
      return this.showFoodTips(e)
    }
    if((name == "!图鉴") || (name == "!家具") || (name == "#家具") || (name == "*家具") || (name == "%家具"))
    {
      return this.showFurnitureTips(e)
    }
    if((name == "!!图鉴") || (name == "!!家具"))
    {
      return this.showCollFurnitureTips(e)
    }

    if(name.includes("#"))
    {
      name = this.normalizeSetQueryText(name)
      const buffHandled = await this.tryShowBuffDebuffAtlas(e, name)
      if (buffHandled) return buffHandled
      await this.showSets(e, name)
    }
    else if(name.includes("*"))
    {
      await this.showSkills(e)
    }
    else if(name.includes("%"))
    {
      await this.showFoods(e)
    }
    else if(name.includes("!"))
    {
      if(name.startsWith("!!"))
      {
        await this.showCollFurnitures(e)
      }
      else
      {
        await this.showFurnitures(e)
      }
    }
  }

  /** 清理套装查询中的通用占位词，例如“#装备名 SPC”“#套装名 法力治愈”。 */
  normalizeSetQueryText (name) {
    return name
      .replace(/装备名|套装名|装备|套装/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^#\s+/, '#')
      .trim()
  }

  /** 从 # 指令中解析 buff/debuff 查询词（精确匹配用） */
  extractBuffDebuffQuery (name) {
    return name
      .replace(/^[#＃]/, '')
      .replace(/图鉴$/, '')
      .replace(/套装$/, '')
      .replace(/套$/, '')
      .trim()
  }

  /** 把已被 transColor 注入 HTML 标签的 msg 段还原成纯文本，用于 buff/debuff 检测 */
  stripHtmlForBuffDetect (html) {
    if (!html || typeof html !== 'string') return ''
    // 去掉所有 HTML 标签（保留标签内文本），把 <br> 换成换行
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim()
  }

  /** 判断一个 msg 段是否提及给定 buff/debuff canonical name */
  msgSegmentMentionsBuff (msgSegment, buffName) {
    if (!msgSegment || !buffName) return false
    const plain = this.stripHtmlForBuffDetect(msgSegment)
    if (!plain) return false
    const found = detectBuffDebuffInText(plain)
    return found.has(buffName)
  }

  /**
   * 对篆刻技能（msg 数组以 "X 阶: ..." 为前缀）的 atlasData.msg 数组做过滤：
   * 只保留提及查询词 buff/debuff 的阶段描述。非篆刻技能只有一段，不做删减。
   * 直接修改传入的 atlasData.msg。
   */
  filterSkillMsgByBuff (atlasDataItem, buffName) {
    if (!atlasDataItem?.msg || !Array.isArray(atlasDataItem.msg)) return
    if (!buffName) return
    // 非篆刻技能：msg 通常只有 1 段；如果它未提及查询词，**仍然保留**（用户要求不删）
    // 通过检查 msg[0] 是否以 "X 阶" 开头判断是否为篆刻技能
    if (!/^[一二三四五六七八九十]+阶\s*[:：]/.test(atlasDataItem.msg[0] || '')) {
      return
    }
    // 篆刻技能：过滤掉不包含 buffName 的阶段
    atlasDataItem.msg = atlasDataItem.msg.filter(seg => this.msgSegmentMentionsBuff(seg, buffName))
  }

  /**
   * 若关键词精确等于 buff_debuff.json 中的 name，则生成全部关联套装/技能图鉴并合并转发
   * @returns {false|number} false 表示非 buff 查询，交由 showSets；否则已处理
   */
  async tryShowBuffDebuffAtlas (e, name) {
    const query = this.extractBuffDebuffQuery(name)
    if (!query) return false

    let entry = null
    let setKeys = []
    let skillKeys = []

    if (srcMode === 'api') {
      // API 模式：在线查询 buff 列表 + enName 反查关联套装/技能
      const found = await apiDataSource.findBuffDebuff(query)
      if (!found) return false
      entry = { name: found.entry.name, displayName: found.entry.name, isBuff: found.entry.isBuff }
      setKeys = found.sets.map(s => String(s.id)).filter(k => k && k !== 'undefined' && k !== 'null')
      const skillIds = found.skills.map(s => Number(s.sid ?? s.id)).filter(n => Number.isFinite(n) && n > 0)
      skillKeys = await database.skillIdsToSkillIndices(skillIds)
    } else {
      entry = await database.findBuffDebuffByExactName(query)
      if (!entry) return false
      setKeys = await database.setIdsToSetKeys(entry.setsList || [])
      skillKeys = await database.skillIdsToSkillIndices(entry.skillsList || [])
    }

    const displayName = entry.displayName || entry.name
    const total = setKeys.length + skillKeys.length

    // 任何来源，只要总图鉴数 > 8 就进入合并模式：
    //   - 全部装备图鉴合并成 1 张（每行 3 个）
    //   - 全部技能图鉴合并成 1 张（每行 3 个）
    const useMergeMode = total > 8

    if (total === 0) {
      await this.reply(`已匹配${entry.isBuff ? '增益' : '减益'}「${displayName}」，但未找到关联套装或技能。`)
      return 1
    }

    await this.reply(
      `已匹配${entry.isBuff ? '增益' : '减益'}「${displayName}」，正在生成图鉴（套装 ${setKeys.length} / 技能 ${skillKeys.length}${useMergeMode ? '，合并模式' : ''}）...`,
      true
    )

    // 收集每个图鉴的 atlasData（合并模式用），并分别尝试单张生成（非合并模式用）
    const setAtlasDataList = []   // 合并模式：存 setData.atlasData（去 index=0 占位）
    let setHeader = null          // 合并模式：取首个 setData 的 atlasData[0] 作为页头
    const setImgs = []            // 非合并模式：存截图
    let setSkipped = 0
    for (const setKey of setKeys) {
      try {
        setData = await database.updateData(setKey, 1)
        if (!setData?.atlasData?.[1]) {
          setSkipped++
          continue
        }
        if (setData.atlasData[1].type === '副本' || setData.atlasData[1].type === '怪物') {
          const undauntedSetName = setData.atlasData[1].set_name || setData.atlasData[1].name
          const undauntedDates = await this.getUndauntedDates(undauntedSetName)
          if (undauntedDates.length > 0) {
            setData.atlasData[1].undauntedDates = undauntedDates
          }
        }
        if (useMergeMode) {
          if (!setHeader) setHeader = JSON.parse(JSON.stringify(setData.atlasData[0]))
          // 合并：取 index>=1 的图鉴数据
          for (let i = 1; i < setData.atlasData.length; i++) {
            setAtlasDataList.push(setData.atlasData[i])
          }
        } else {
          setImgs.push(await this.cache(setData, setImg))
        }
      } catch (err) {
        setSkipped++
        logger.warn(`[ESO:图鉴] 套装图鉴生成跳过 ${setKey}: ${err.message}`)
      }
    }

    const skillAtlasDataList = []
    let skillHeader = null
    const skillImgs = []
    let skillSkipped = 0
    let skillMsgFiltered = 0
    for (const skillKey of skillKeys) {
      try {
        skillData = await database.updateData(skillKey, 2)
        if (!skillData?.atlasData?.[1]) {
          skillSkipped++
          continue
        }
        // buff/debuff 阶段过滤：篆刻技能只保留涉及查询词 buff/debuff 的阶段描述
        const beforeLen = (skillData.atlasData[1].msg || []).length
        this.filterSkillMsgByBuff(skillData.atlasData[1], entry.name)
        const afterLen = (skillData.atlasData[1].msg || []).length
        if (beforeLen !== afterLen) skillMsgFiltered += (beforeLen - afterLen)
        if (useMergeMode) {
          if (!skillHeader) skillHeader = JSON.parse(JSON.stringify(skillData.atlasData[0]))
          for (let i = 1; i < skillData.atlasData.length; i++) {
            skillAtlasDataList.push(skillData.atlasData[i])
          }
        } else {
          skillImgs.push(await this.cache(skillData, skillImg))
        }
      } catch (err) {
        skillSkipped++
        logger.warn(`[ESO:图鉴] 技能图鉴生成跳过 ${skillKey}: ${err.message}`)
      }
    }
    if (setSkipped > 0) {
      logger.info(`[ESO:图鉴] buff/debuff 查询有 ${setSkipped} 个套装条目无法生成图鉴，已跳过`)
    }
    if (skillSkipped > 0) {
      logger.info(`[ESO:图鉴] buff/debuff 查询有 ${skillSkipped} 个技能条目无法生成图鉴，已跳过`)
    }
    if (skillMsgFiltered > 0) {
      logger.info(`[ESO:图鉴] buff/debuff「${entry.name}」阶段过滤：共移除 ${skillMsgFiltered} 个不相关阶段描述`)
    }

    const fakeMsg = []

    if (useMergeMode) {
      // 合并模式：装备/技能各合并 1 张；仅 1 条时改单卡输出
      if (setAtlasDataList.length === 1) {
        const singleSetData = this.buildSingleCardData(e, 'atlas', setHeader, setAtlasDataList[0])
        const img = await this.cache(singleSetData, setImg)
        if (img) fakeMsg.push(img)
      } else if (setAtlasDataList.length > 1) {
        const mergedSetData = await this.buildMergedAtlasData(e, 'atlas', setHeader, setAtlasDataList)
        const img = await puppeteer.screenshot('eso', mergedSetData)
        if (img) fakeMsg.push(img)
      }
      if (skillAtlasDataList.length === 1) {
        const singleSkillData = this.buildSingleCardData(e, 'skills', skillHeader, skillAtlasDataList[0])
        const img = await this.cache(singleSkillData, skillImg)
        if (img) fakeMsg.push(img)
      } else if (skillAtlasDataList.length > 1) {
        const mergedSkillData = await this.buildMergedAtlasData(e, 'skills', skillHeader, skillAtlasDataList)
        const img = await puppeteer.screenshot('eso', mergedSkillData)
        if (img) fakeMsg.push(img)
      }
    } else {
      // 非合并模式：单张 + 合并转发
      for (const img of setImgs) fakeMsg.push(img)
      for (const img of skillImgs) fakeMsg.push(img)
    }

    if (fakeMsg.length === 0) {
      await this.reply(`已匹配「${displayName}」，但所有关联图鉴均无法生成。`)
      return 1
    }

    const forwardTitle = `${entry.isBuff ? '增益' : '减益'}·${displayName}${useMergeMode ? '（合并）' : ''}`
    await e.reply(await common.makeForwardMsg(e, fakeMsg, forwardTitle, true))
    return 1
  }

  /** buff/debuff 合并模式下仅 1 条时，拼装单卡截图数据（atlas.html / skills.html） */
  buildSingleCardData (e, templateKey, pageHeader, item) {
    const _path = process.cwd().replace(/\\/g, '/')
    return {
      init: 'done',
      saveId: e?.user_id ? `buff_single_${templateKey}_${e.user_id}` : `buff_single_${templateKey}`,
      cwd: _path,
      tplFile: `./plugins/eso/resources/html/${templateKey}/${templateKey}.html`,
      pluResPath: `${_path}/plugins/eso/resources/`,
      headStyle: ``,
      atlasData: [pageHeader || {}, item]
    }
  }

  /** 合并页宽度：2 条时 2 列，否则 3 列（每卡 280px + 左间距 10px） */
  getMergedPageWidth (itemCount, templateKey) {
    const cols = itemCount === 2 ? 2 : 3
    const leftPad = templateKey === 'skills' ? 8 : 0
    const rightPad = 12
    const slack = templateKey === 'skills' ? 10 : 18
    return leftPad + cols * 290 + rightPad + slack
  }

  /**
   * 构建合并模式的 atlasData：第一个元素是 pageHeader（背景/日期/标题），
   * 后续元素是拼接的所有图鉴数据。模板用 atlas_merged.html / skills_merged.html。
   */
  async buildMergedAtlasData (e, templateKey, pageHeader, itemList) {
    const _path = process.cwd().replace(/\\/g, '/')
    const tplFile = `./plugins/eso/resources/html/${templateKey}/${templateKey}_merged.html`
    const pageWidth = this.getMergedPageWidth(itemList.length, templateKey)
    return {
      init: 'done',
      saveId: e?.user_id ? `merged_${e.user_id}` : 'merged_buff',
      cwd: _path,
      tplFile,
      pluResPath: `${_path}/plugins/eso/resources/`,
      headStyle: ``,
      // 独立传入 pageHeader：art-template 不支持 {{arr.0.key}} 的点号数组下标语法
      pageHeader: pageHeader || null,
      pageWidth,
      // atlasData: [pageHeader, ...items]（数组下标在 {{each}} 遍历里才用，这里仅作数据载体）
      atlasData: [pageHeader, ...itemList]
    }
  }

  async showSets (e, nameOverride) {
    let name = nameOverride ?? await this.trimText(e)
    let noMaxLimit = false
    let showEnglish = false
    let objSets = await database.name2index(name,1)
    let setNum = objSets.length
    if((name == "#神器") || (name == "#神器图鉴") || (name == "#怪物") || (name == "#怪物套") || (name == "#怪物图鉴") || (name == "#怪物套图鉴") || (name == "#爬塔") || (name == "#爬塔套") || (name == "#爬塔套图鉴"))
    {
      noMaxLimit = true
    }
    if(name.includes("英文") || name.includes("英语"))
    {
      showEnglish = true
    }

    //logger.info('setNum:' + setNum)
    //logger.info('objSets:' + objSets)
    if(isSetIndexResultEmpty(objSets) || (setNum <= 0))
    {
      return await this.reply(`抱歉,无法理解您的意思\n您或许需要以*开头查询技能，以%开头查询食物，以!开头查询家具，或以!!开头查询收藏品家具`)
    }

    if((setNum >= 5 && setNum <= 20) || noMaxLimit)
    {
      let msgList = '我猜您想问的是以下装备之一？'
      for (let setKey of objSets) {
        setData = await database.updateData(setKey, 1)
        msgList += `\n#`+setData.atlasData[1].name+'图鉴'
      }
      msgList += `\n`+'图片太多，不再一一列出'
      await this.reply(msgList)
      //logger.info(name)
      for (let setKey of objSets) {
        setData = await database.updateData(setKey, 1)
      	if(('#' + setData.atlasData[1].name) == name)
      	{
      		await this.showSetsInfo([setKey], showEnglish)
      		break
      	}
      }

      return 1
    }

    if(setNum > 1 && setNum < 5)
    {
      let msgList = '我猜您想问的是以下装备之一？'
      for (let setKey of objSets) {
        setData = await database.updateData(setKey, 1)
        msgList += `\n#`+setData.atlasData[1].name+'图鉴'
      }
      await this.reply(msgList)
    }

    if(setNum == 1)
    {
      for (let setKey of objSets) {
        setData = await database.updateData(setKey, 1)
        logger.info(setData.atlasData[1].name)
      }
    }

    if(setNum >= 21 && noMaxLimit==0)
    {
      return await this.reply(`对不起，请描述的再详细一点`)
    }

    if(setNum <= 0 || setNum > 5)
    {
      return 1
    }

    await this.showSetsInfo(objSets, showEnglish)
  }

  async showSetsInfo (objSets, showEnglish) {
    for (let setKey of objSets) {
      //更新装备图鉴变量
      if(showEnglish)
      {
        setData = await database.updateData(setKey, 11)
      }
      else
      {
        setData = await database.updateData(setKey, 1)
      }
      
      // 如果装备类型为"副本"（type=6），添加无畏者副本日期信息
      //logger.info(setData.atlasData[1].type)
      if (setData.atlasData[1].type == "副本" || setData.atlasData[1].type == "怪物") {
        const undauntedSetName = setData.atlasData[1].set_name || setData.atlasData[1].name
        const undauntedDates = await this.getUndauntedDates(undauntedSetName)
        //logger.info(undauntedDates)
        if (undauntedDates.length > 0) {
          // 将无畏者日期数据添加到atlasData中
          setData.atlasData[1].undauntedDates = undauntedDates
        }
      }

      // 护甲类型标记（与 esolog/builds 一致：轻甲蓝/中甲绿/重甲红）
      const armorColors = { '轻甲': 'rgb(58, 146, 254)', '中甲': 'rgb(47, 213, 14)', '重甲': 'rgb(227, 36, 33)' }
      for (const [armor, color] of Object.entries(armorColors)) {
        if ((setData.atlasData[1].weight || '').includes(armor)) {
          setData.atlasData[1].armorMark = color
          break
        }
      }

      // 物品名右侧 emoji 图标（defSet/eso/atlasEmoji.yaml 映射）
      this.applyEmojiIcon(setData)
      
      let img = await this.cache(setData, setImg)
      await this.reply(img)
    }
  }

  /**
   * 按套装中文名反查它所属副本在 dgList 里的序号（兜底用）
   * 逻辑：套装 CN 名 → 套装 key → EN place 的最后一项（副本英文名）→ dgList.indexOf
   * @returns {Promise<number>} 副本序号；找不到返回 -1
   */
  async findDungeonIndexBySetName (setName, setsData, setsDataCN, dgList) {
    for (const setKey of Object.keys(setsData)) {
      const set = setsData[setKey]
      const cn = setsDataCN?.[set?.id]
      if (!cn || cn.name !== setName) continue
      const place = set.place || {}
      const keys = Object.keys(place)
      if (keys.length < 2) return -1          // 第 1 项是大区，最后一项才是副本
      const dungeonEn = place[keys[keys.length - 1]]
      const idx = Array.isArray(dgList) ? dgList.indexOf(dungeonEn) : -1
      if (idx > -1) return idx
    }
    return -1
  }

  // 计算未来两次无畏者副本出现特定装备的日期
  async getUndauntedDates(setName) {
    try {
      // 获取无畏者数据库
      const setsData = await database.getSetsEN()
      const setsDataCN = await database.getSetsCN()
      const dgSetsTable = await database.getdgSets()
      const numDungeons = await database.getDgNum()
      const dgList = await database.getdgList()

      // 无畏者副本序号校准码（API 模式用今日无畏反推，本地模式用硬编码）
      const adjust = (srcMode === 'api')
        ? await apiDataSource.getUndauntedAdjust(dgList, numDungeons)
        : [4, 4, 1]
      const num0 = 12
      const num1 = 12
      const num2 = numDungeons-24

      // 找到目标装备在dgSetsTable中的所有索引
      // 同一个装备可能出现在多个副本中
      const targetIndices = []
      
      // 遍历dgSetsTable找到目标装备的所有位置
      for (let i = 0; i < dgSetsTable.length; i++) {
        for (let j = 0; j < 4; j++) { // 每个副本有4个装备位置
          if (dgSetsTable[i][j] > 0) {
            const setId = dgSetsTable[i][j]
            const setNameFromId = setsDataCN[setId].name
            //logger.info(`检查装备 ${i}-${j}: ${setNameFromId} | 目标: ${setName}`)
            if (setNameFromId === setName) {
              //logger.info(`找到装备ID: ${setId} 在副本索引: ${i}`)
              if (!targetIndices.includes(i)) {
                targetIndices.push(i)
              }
            }
          }
        }
      }

      if (targetIndices.length === 0) {
        // 兜底：该套装被排除在无畏者表外（例：U51 单人地下城套 876/877，见 database.js
        // UNDAUNTED_EXCLUDED_MONSTER_SET_IDS），但它们本质上仍属既有副本，
        // 所以按其 place 的最后一项（副本英文名）定位副本序号，与同副本原有怪物套共享日期。
        const dungeonIndex = await this.findDungeonIndexBySetName(setName, setsData, setsDataCN, dgList)
        if (dungeonIndex > -1) targetIndices.push(dungeonIndex)
      }

      if (targetIndices.length === 0) {
        return []
      }

      // 计算当前日期
      const now = moment(new Date().getTime()).format('YYYY-MM-DD')
      const passSeconds = new Date().getTime() - 57600000
      const passDays = Math.floor((passSeconds - (passSeconds % 86400000)) / 86400000)

      // 收集所有可能的日期
      const allDates = []
      let checkDays = -2 // 从当前日期的前一天开始

      // 检查从昨天开始的365天内的无畏者副本
      while (checkDays < 365) {
        checkDays++
        
        // 计算第checkDays天的无畏者序号（checkDays=0是昨天，checkDays=1是今天）
        const targetDay = passDays + checkDays
        const t0 = (targetDay + adjust[0]) % num0
        const t1 = (targetDay + adjust[1]) % num1 + 12
        const t2 = (targetDay + adjust[2]) % num2 + 24

        // 检查是否匹配任何目标副本
        if (targetIndices.includes(t0) || targetIndices.includes(t1) || targetIndices.includes(t2)) {
          const targetDate = moment().add(checkDays, 'days').format('YYYY-MM-DD')
          const dayOfWeek = moment().add(checkDays, 'days').format('dddd')
          const dayOfWeekCN = this.getDayOfWeekCN(dayOfWeek)
          
          allDates.push(`${targetDate} (${dayOfWeekCN})`)
        }
      }

      // 去重并排序，取最早的两个不同日期
      const uniqueDates = [...new Set(allDates)]
      const sortedDates = uniqueDates.sort((a, b) => {
        const dateA = moment(a.split(' ')[0], 'YYYY-MM-DD')
        const dateB = moment(b.split(' ')[0], 'YYYY-MM-DD')
        return dateA.diff(dateB)
      })

      return sortedDates.slice(0, 2)
    } catch (error) {
      //logger.error(`[ESO:图鉴] 计算无畏者副本日期失败: ${error.message}`)
      return []
    }
  }

  // 获取中文星期名称
  getDayOfWeekCN(dayOfWeek) {
    const dayMap = {
      'Monday': '周一',
      'Tuesday': '周二', 
      'Wednesday': '周三',
      'Thursday': '周四',
      'Friday': '周五',
      'Saturday': '周六',
      'Sunday': '周日'
    }
    return dayMap[dayOfWeek] || dayOfWeek
  }

  async showSkills (e) {
    //return await this.reply(`该功能暂不可用，作者@Chicor正在施工中...`)

    let name = await this.trimText(e)
    let noMaxLimit = false
    let showEnglish = false

    // ========== 新增: 职业精通 (按职业名查指定技能列表, 合并消息) ==========
    // 支持: *龙骑士精通, *龙骑精通, *奥术师职业精通, *法师精通 (老玩家称呼) 等
    // 必须在 SKILLID 分支之前识别, 因为法师/盗贼等别名不能误进 SKILLID 路径
    if (this.isClassMasteryCommand(name))
    {
      const className = this.parseClassMasteryName(name)
      if (className)
      {
        // 立即回复用户,告知预计耗时,避免等待焦虑
        await this.reply(`正在查询 ${className}职业精通，请等待15秒左右...`, true)
        return await this.showClassMastery(e, className)
      }
      // 命令模式命中但职业名未识别: 落回原 showSkills 逻辑兜底
    }

    // ========== 新增: *SKILLIDxxx 按 ID 匹配 (走 type=21 / mode=1) ==========
    // 不区分大小写, 仅识别紧跟 * 后的 SKILLID 前缀
    if (/SKILLID/i.test(name))
    {
      let idMatch = name.match(/SKILLID\s*(\d+)/i)
      if (idMatch)
      {
        let skillId = idMatch[1]
        let objSkills = await database.name2index(skillId, 21)
        let skillNum = objSkills.length

        if((objSkills[0] < 0) || (skillNum <= 0))
        {
          return await this.reply(`抱歉,无法理解您的意思\n您或许需要以#开头查询装备，以%开头查询食物，以!开头查询家具，或以!!开头查询收藏品家具`)
        }

        // 复制主分支的多候选处理逻辑
        if((skillNum >= 4 && skillNum <= 25) || noMaxLimit)
        {
          let msgList = '我猜您想问的是以下技能之一？'
          for (let skillKey of objSkills) {
            skillData = await database.updateData(skillKey, 2)
            if (skillData.atlasData[1].place_cn?.includes('职业精通'))
            {
                let class_str = '(' + skillData.atlasData[1].type_en + ')'
                msgList += `\n*`+skillData.atlasData[1].new_cn_name+'图鉴'+class_str
            }
            else
            {
                msgList += `\n*`+skillData.atlasData[1].new_cn_name+'图鉴'
            }
          }
          msgList += `\n`+'图片太多，不再一一列出'
          await this.reply(msgList)
          // 多个候选时不再额外渲染单个图鉴 (SKILLID 模式无法按 name 精确匹配)
          return 1
        }

        if(skillNum > 1 && skillNum < 4)
        {
          let msgList = '我猜您想问的是以下技能之一？'
          for (let skillKey of objSkills) {
            skillData = await database.updateData(skillKey, 2)
            msgList += `\n*`+skillData.atlasData[1].new_cn_name+'图鉴'
          }
          await this.reply(msgList)
        }

        if(skillNum >= 26 && noMaxLimit==0)
        {
          return await this.reply(`对不起，请描述的再详细一点`)
        }

        if(skillNum <= 0 || skillNum > 4)
        {
          return 1
        }

        await this.showSkillsInfo(objSkills, showEnglish)
        return 1
      }
    }
    // =================== SKILLID 分支结束 ===================

    let objSkills = await database.name2index(name,2)
    let skillNum = objSkills.length

    if((name == "*职业精通") || (name == "*精通"))
    {
      noMaxLimit = true
    }
    //logger.info('skillNum:' + skillNum)
    //logger.info('objSkills:' + objSkills)

    if((objSkills[0] < 0) || (skillNum <= 0))
    {
      return await this.reply(`抱歉,无法理解您的意思\n您或许需要以#开头查询装备，以%开头查询食物，以!开头查询家具，或以!!开头查询收藏品家具`)
    }

    if(name.includes("英文") || name.includes("英语"))
    {
      if (srcMode === 'api')
      {
        return await this.reply('API 查询模式暂不支持技能英文图鉴，请将 srcMode 切回 local 后重试')
      }
      showEnglish = true
    }


    if((skillNum >= 4 && skillNum <= 25) || noMaxLimit)
    {
      let msgList = '我猜您想问的是以下技能之一？'
      for (let skillKey of objSkills) {
        skillData = await database.updateData(skillKey, 2)
        if (skillData.atlasData[1].place_cn?.includes('职业精通'))
        {
            let class_str = '(' + skillData.atlasData[1].type_en + ')'
            msgList += `\n*`+skillData.atlasData[1].new_cn_name+'图鉴'+class_str
        }
        else
        {
            msgList += `\n*`+skillData.atlasData[1].new_cn_name+'图鉴'
        }
      }
      msgList += `\n`+'图片太多，不再一一列出'
      await this.reply(msgList)
      for (let skillKey of objSkills) {
        skillData = await database.updateData(skillKey, 2)
        if(('*' + skillData.atlasData[1].new_cn_name) == name)
        {
          await this.showSkillsInfo([skillKey], showEnglish)
          break
        }
      }

      return 1
    }

    if(skillNum > 1 && skillNum < 4)
    {
      let msgList = '我猜您想问的是以下技能之一？'
      for (let skillKey of objSkills) {
        skillData = await database.updateData(skillKey, 2)
        msgList += `\n*`+skillData.atlasData[1].new_cn_name+'图鉴'
      }
      await this.reply(msgList)
    }

    if(skillNum >= 26 && noMaxLimit==0)
    {
      return await this.reply(`对不起，请描述的再详细一点`)
    }

    if(skillNum <= 0 || skillNum > 4)
    {
      return 1
    }

    await this.showSkillsInfo(objSkills, showEnglish)
  }

  async showSkillsInfo (objSets, showEnglish) {
    for (let skillKey of objSets) {
      //更新技能图鉴变量
      if(showEnglish)
      {
        skillData = await database.updateData(skillKey, 21)
      }
      else
      {
        skillData = await database.updateData(skillKey, 2)
      }

      let img = await this.cache(skillData, skillImg)
      await this.reply(img)
    }
  }

  // ================================================================
  // 职业精通识别与处理 (新增功能)
  // 支持: *龙骑士精通, *龙骑士职业精通, *龙骑精通 等
  // 多个职业都支持, 通过别名映射兼容老玩家称呼
  // ================================================================

  /** 判断命令是否是职业精通格式 (例如 *龙骑精通 / *奥术师职业精通) */
  isClassMasteryCommand (name) {
    // 匹配: 可选 *, (后跟 1-N 个中文字符 (非贪婪), 后跟 精通 或 职业精通
    return /^[*(（]?\s*[\u4e00-\u9fa5]+?\s*(?:职业精通|精通)\s*$/.test(name)
  }

  /** 从职业精通命令中解析出标准职业名 (例如 龙骑 -> 龙骑士, 法师 -> 巫师) */
  parseClassMasteryName (name) {
    const m = name.match(/^[*(（]?\s*([\u4e00-\u9fa5]+?)\s*(?:职业精通|精通)\s*$/)
    if (!m) return null
    const alias = m[1]
    return CLASS_NAME_ALIAS[alias] || null
  }

  /** 处理职业精通命令: 生成该职业 5 个精通技能的图鉴, 合并消息发出 */
  async showClassMastery (e, className) {
    // 1. 从映射表提取该职业的所有 skillId
    const skillIds = Object.entries(CLASS_MASTERY_MAP)
      .filter(([, cls]) => cls === className)
      .map(([id]) => id)

    if (skillIds.length === 0) {
      return await this.reply(`未找到「${className}」的职业精通数据。`)
    }

    // 2. 逐个 ID 查询 -> 渲染图片 -> push 到 fakeMsg
    const fakeMsg = []
    let successCount = 0
    for (const skillId of skillIds) {
      try {
        const objSkills = await database.name2index(String(skillId), 21)
        if (!objSkills || objSkills[0] < 0 || objSkills.length === 0) {
          continue // ID 在数据库中查不到, 容错跳过
        }
        for (const skillKey of objSkills) {
          const skillData = await database.updateData(skillKey, 2)
          const img = await this.cache(skillData, skillImg)
          if (img) {
            fakeMsg.push(img)
            successCount++
          }
        }
      } catch (err) {
        // 单个技能失败不影响其它技能, 仅记录日志
        logger.warn(`[ESO:职业精通] 渲染 skillId=${skillId} 失败: ${err?.message || err}`)
      }
    }

    if (fakeMsg.length === 0) {
      return await this.reply(`「${className}」职业精通数据查询失败，请联系作者。`)
    }

    // 3. 合并消息发出 (forward msg, 每张图独立, 不合并图片)
    const forwardTitle = `「${className}·职业精通」（共${successCount}个技能）`
    await e.reply(await common.makeForwardMsg(e, fakeMsg, forwardTitle, true))
    return 1
  }
  // ================================================================

  async showFoods (e) {
    //return await this.reply(`该功能暂不可用，作者@Chicor正在施工中...`)

    let name = await this.trimText(e)
    let noMaxLimit = false
    let showEnglish = false
    let objFoods = await database.name2index(name,3)
    let foodNum = objFoods.length

    //logger.info('foodNum:' + foodNum)
    //logger.info('objFoods:' + objFoods)

    if((objFoods[0] < 0) || (foodNum <= 0))
    {
      return await this.reply(`抱歉,无法理解您的意思\n您或许需要以#开头查询装备，以*开头查询技能，以!开头查询家具，或以!!开头查询收藏品家具`)
    }

    if(name.includes("英文") || name.includes("英语"))
    {
      if (srcMode === 'api')
      {
        return await this.reply('API 查询模式暂不支持食物英文图鉴，请将 srcMode 切回 local 后重试')
      }
      showEnglish = true
    }

    
    if((foodNum >= 4 && foodNum <= 25) || noMaxLimit)
    {
      let msgList = '我猜您想问的是以下食物之一？'
      for (let foodKey of objFoods) {
        foodData = await database.updateData(foodKey, 6)
        msgList += `\n%`+foodData.atlasData[1].new_cn_name+'图鉴'
      }
      msgList += `\n`+'图片太多，不再一一列出'
      await this.reply(msgList)
      for (let foodKey of objFoods) {
        foodData = await database.updateData(foodKey, 6)
        if(('%' + foodData.atlasData[1].new_cn_name) == name)
        {
          await this.showFoodsInfo([foodKey], showEnglish)
          break
        }
      }

      return 1
    }

    if(foodNum > 1 && foodNum < 4)
    {
      let msgList = '我猜您想问的是以下食物之一？'
      for (let foodKey of objFoods) {
        foodData = await database.updateData(foodKey, 6)
        msgList += `\n%`+foodData.atlasData[1].new_cn_name+'图鉴'
      }
      await this.reply(msgList)
    }

    if(foodNum >= 26 && noMaxLimit==0)
    {
      return await this.reply(`对不起，请描述的再详细一点`)
    }

    if(foodNum <= 0 || foodNum > 4)
    {
      return 1
    }

    await this.showFoodsInfo(objFoods, showEnglish)
  }
  
  async showFoodsInfo (objFoods, showEnglish) {
    for (let foodKey of objFoods) {
      //更新食物图鉴变量
      if(showEnglish)
      {
        foodData = await database.updateData(foodKey, 61)
      }
      else
      {
        foodData = await database.updateData(foodKey, 6)
      }
      
      let img = await this.cache(foodData, foodImg)
      await this.reply(img)
    }
  }

  async showFurnitures (e) {
    let name = await this.trimText(e)
    let noMaxLimit = false
    let showEnglish = false
    let objFurnitures = await database.name2index(name, 4)
    let furnitureNum = objFurnitures.length

    //logger.info('furnitureNum:' + furnitureNum)
    //logger.info('objFurnitures:' + objFurnitures)

    if((objFurnitures[0] < 0) || (furnitureNum <= 0))
    {
      return await this.reply(`抱歉,无法理解您的意思\n您或许需要以#开头查询装备，以*开头查询技能，以%开头查询食物，或以!!开头查询收藏品家具`)
    }

    if(name.includes("英文") || name.includes("英语"))
    {
      if (srcMode === 'api')
      {
        return await this.reply('API 查询模式暂不支持家具英文图鉴，请将 srcMode 切回 local 后重试')
      }
      showEnglish = true
    }

    
    if((furnitureNum >= 4 && furnitureNum <= 25) || noMaxLimit)
    {
      let msgList = '我猜您想问的是以下家具之一？'
      for (let furnitureKey of objFurnitures) {
        furnitureData = await database.updateData(furnitureKey, 8)
        msgList += `\n!`+furnitureData.atlasData[1].new_cn_name+'图鉴'
      }
      msgList += `\n`+'图片太多，不再一一列出'
      await this.reply(msgList)
      for (let furnitureKey of objFurnitures) {
        furnitureData = await database.updateData(furnitureKey, 8)
        if(('!' + furnitureData.atlasData[1].new_cn_name) == name)
        {
          await this.showFurnituresInfo([furnitureKey], showEnglish)
          break
        }
      }

      return 1
    }

    if(furnitureNum > 1 && furnitureNum < 4)
    {
      let msgList = '我猜您想问的是以下家具之一？'
      for (let furnitureKey of objFurnitures) {
        furnitureData = await database.updateData(furnitureKey, 8)
        msgList += `\n!`+furnitureData.atlasData[1].new_cn_name+'图鉴'
      }
      await this.reply(msgList)
    }

    if(furnitureNum >= 32 && noMaxLimit==0)
    {
      //logger.info('共找到匹配项：' + furnitureNum)
      return await this.reply(`总共找到${furnitureNum}个匹配项，请描述的再详细一点`)
    }

    if(furnitureNum <= 0 || furnitureNum > 4)
    {
      return 1
    }

    await this.showFurnituresInfo(objFurnitures, showEnglish)
  }
  
  async showFurnituresInfo (objFurnitures, showEnglish) {
    for (let furnitureKey of objFurnitures) {
      //更新家具图鉴变量
      if(showEnglish)
      {
        furnitureData = await database.updateData(furnitureKey, 81)
      }
      else
      {
        furnitureData = await database.updateData(furnitureKey, 8)
      }
      
      let img = await this.cache(furnitureData, furnitureImg)
      await this.reply(img)
    }
  }

  async showCollFurnitures (e) {
    let rawName = await this.trimText(e)
    let nameForSearch = rawName.startsWith("!!") ? rawName.slice(2) : rawName
    let noMaxLimit = false
    let showEnglish = false
    let objCollFurnitures = await database.name2index(nameForSearch, 5)
    let collFurnitureNum = objCollFurnitures.length

    if((objCollFurnitures[0] < 0) || (collFurnitureNum <= 0))
    {
      return await this.reply(`抱歉,无法理解您的意思\n您或许需要以#开头查询装备，以*开头查询技能，以%开头查询食物，或以!开头查询家具`)
    }

    if(nameForSearch.includes("英文") || nameForSearch.includes("英语"))
    {
      if (srcMode === 'api')
      {
        return await this.reply('API 查询模式暂不支持收藏品家具英文图鉴，请将 srcMode 切回 local 后重试')
      }
      showEnglish = true
    }

    if((collFurnitureNum >= 4 && collFurnitureNum <= 25) || noMaxLimit)
    {
      let msgList = '我猜您想问的是以下收藏品家具之一？'
      for (let collFurnitureKey of objCollFurnitures) {
        collFurnitureData = await database.updateData(collFurnitureKey, 9)
        msgList += `\n!!`+collFurnitureData.atlasData[1].new_cn_name+'图鉴'
      }
      msgList += `\n`+'图片太多，不再一一列出'
      await this.reply(msgList)
      for (let collFurnitureKey of objCollFurnitures) {
        collFurnitureData = await database.updateData(collFurnitureKey, 9)
        if(('!!' + collFurnitureData.atlasData[1].new_cn_name == rawName) || ('!!' + collFurnitureData.atlasData[1].new_cn_name + '图鉴' == rawName))
        {
          await this.showCollFurnituresInfo([collFurnitureKey], showEnglish)
          break
        }
      }

      return 1
    }

    if(collFurnitureNum > 1 && collFurnitureNum < 4)
    {
      let msgList = '我猜您想问的是以下收藏品家具之一？'
      for (let collFurnitureKey of objCollFurnitures) {
        collFurnitureData = await database.updateData(collFurnitureKey, 9)
        msgList += `\n!!`+collFurnitureData.atlasData[1].new_cn_name+'图鉴'
      }
      await this.reply(msgList)
    }

    if(collFurnitureNum >= 26 && noMaxLimit==0)
    {
      return await this.reply(`对不起，请描述的再详细一点`)
    }

    if(collFurnitureNum <= 0 || collFurnitureNum > 4)
    {
      return 1
    }

    await this.showCollFurnituresInfo(objCollFurnitures, showEnglish)
  }


  async showCollFurnituresInfo (objCollFurnitures, showEnglish) {
    for (let collFurnitureKey of objCollFurnitures) {
      if(showEnglish)
      {
        collFurnitureData = await database.updateData(collFurnitureKey, 91)
      }
      else
      {
        collFurnitureData = await database.updateData(collFurnitureKey, 9)
      }

      let img = await this.cache(collFurnitureData, collFurnitureImg)
      await this.reply(img)
    }
  }


  async trimText(e) {
    let text = '';
    for (let eachArry of e.message) {
        if ((typeof eachArry.type !== "undefined") && (eachArry.type === 'text')) {
            if (typeof eachArry.text !== "undefined") {
                text = eachArry.text;

                // 手动去掉开头的空格
                let firstNonSpacePos = 0;
                while (firstNonSpacePos < text.length && /\s/.test(text[firstNonSpacePos])) {
                    firstNonSpacePos++;
                }
                text = text.substring(firstNonSpacePos);
                
                // 将中文全角感叹号"！"转换为英文半角感叹号"!"
                text = text.replace(/！/g, '!');
                
                break;
            }
        }
    }

    return text;
  }

  async cache (data, cachedata) {
    const layoutVer = 'atlasCardV12'
    let tmp = md5(JSON.stringify(data) + layoutVer)
    if (cachedata.md5 == tmp) return cachedata.img

    const isSingleCard = data.tplFile && !/_merged\.html$/i.test(data.tplFile)
    //cachedata.img = 0
    cachedata.img = await puppeteer.screenshot('eso', {
      ...data,
      imgType: 'png',
      omitBackground: isSingleCard
    }) /*html file saved in folder data/html/eso/ */
    cachedata.md5 = tmp

    return cachedata.img
  }
}
