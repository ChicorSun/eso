/**
 * SuperStar 分享码解码器
 * 移植自 live/AddOns/SuperStar/SuperStar.lua（generateShareLink / bitBufDecode）
 * 分享码格式：|H1:sss:<75进制串>|h，每 8 字符 = 49 bit，位流按固定字段顺序排布
 * 仅做位流解码 + 基础映射，不依赖游戏 API；查名/图标由调用方用本地数据完成
 */

const BASE = "0123456789BCDFGHJKLMNPQRSTVWXYZbcdfghjklmnpqrstvwxyz(){}[]<>.!?+-/;~@&$^_=`"

/** 字段位宽（与 SuperStar.lua BIT_WIDTH 一致） */
const BW = {
  RACE: 4,
  CLASS: 3,
  SKILL_ID: 19,
  ACTIVE_BOONS: 4,
  VAMPWW_ID: 3,
  ATTRIBUTE: 16,
  MAX_STAT: 17,
  REGEN: 12,
  POWER: 14,
  CRIT: 15,
  RESIST: 16,
  ITEM_ID: 19,
  QUALITY: 3,
  TRAIT: 7,
  ENCHANT_ID: 17,
  ENCHANT_QUALITY: 3,
  CP_SLOT: 9,
  SKILL_LINE: 5,
  FOOD_BUFF: 6
}

/** 种族（ESO GetUnitRaceId；生成时 race==10(帝国) 被写成 0，解码还原） */
const RACES = {
  1: '高精灵',
  2: '木精灵',
  3: '卡吉特',
  4: '红卫人',
  5: '兽人',
  6: '亚龙人',
  7: '布莱顿人',
  8: '暗精灵',
  9: '诺德人',
  10: '帝国'
}

/** 世界恩赐（mundusBoons：abilityId→索引；这里是索引→名称） */
const BOONS = {
  1: { en: 'The Warrior', cn: '战士', img: 'ON-icon-mundusstone-Warrior.png' },
  2: { en: 'The Mage', cn: '法师', img: 'ON-icon-mundusstone-Mage.png' },
  3: { en: 'The Serpent', cn: '毒蛇', img: 'ON-icon-mundusstone-Serpent.png' },
  4: { en: 'The Thief', cn: '盗贼', img: 'ON-icon-mundusstone-Thief.png' },
  5: { en: 'The Lady', cn: '女神', img: 'ON-icon-mundusstone-Lady.png' },
  6: { en: 'The Steed', cn: '战马', img: 'ON-icon-mundusstone-Steed.png' },
  7: { en: 'The Lord', cn: '君王', img: 'ON-icon-mundusstone-Lord.png' },
  8: { en: 'The Apprentice', cn: '学徒', img: 'ON-icon-mundusstone-Apprentice.png' },
  9: { en: 'The Ritual', cn: '仪式', img: 'ON-icon-mundusstone-Ritual.png' },
  10: { en: 'The Lover', cn: '恋人', img: 'ON-icon-mundusstone-Lover.png' },
  11: { en: 'The Atronach', cn: '侍灵', img: 'ON-icon-mundusstone-Atronach.png' },
  12: { en: 'The Shadow', cn: '暗影', img: 'ON-icon-mundusstone-Shadow.png' },
  13: { en: 'The Tower', cn: '高塔', img: 'ON-icon-mundusstone-Tower.png' }
}

/** 吸血鬼/狼人（VampWW：abilityId→值；这里是值→名称） */
const VAMPWW = {
  1: { name: '吸血鬼1阶', en: 'Vampirism: Stage 1', type: 'vampire', stage: 1 },
  2: { name: '吸血鬼2阶', en: 'Vampirism: Stage 2', type: 'vampire', stage: 2 },
  3: { name: '吸血鬼3阶', en: 'Vampirism: Stage 3', type: 'vampire', stage: 3 },
  4: { name: '吸血鬼4阶', en: 'Vampirism: Stage 4', type: 'vampire', stage: 4 },
  5: { name: '狼人', en: 'Lycantropy', type: 'wolf', stage: 1 }
}

/** 食物 buff 类型 bitmask（FOOD_BUFF_* 常量） */
const FOOD_BUFF = {
  1: '生命上限', 2: '魔力上限', 4: '耐力上限',
  8: '生命恢复', 16: '魔力恢复', 32: '耐力恢复'
}

/** trait id → 名称（SI_ITEMTRAITTYPE；来自 EsoZH/data/itemtrait.lua + 项目 traits_* 表） */
const TRAITS = {
  1: { en: 'Powered', cn: '动力' },
  2: { en: 'Charged', cn: '充能' },
  3: { en: 'Precise', cn: '精准' },
  4: { en: 'Infused', cn: '注魔' },
  5: { en: 'Defending', cn: '防御' },
  6: { en: 'Training', cn: '训练' },
  7: { en: 'Sharpened', cn: '锐利' },
  8: { en: 'Decisive', cn: '果断' },
  9: { en: 'Intricate', cn: '精细' },
  10: { en: 'Ornate', cn: '华丽' },
  11: { en: 'Sturdy', cn: '强韧' },
  12: { en: 'Impenetrable', cn: '牢不可破' },
  13: { en: 'Reinforced', cn: '加固' },
  14: { en: 'Well-fitted', cn: '合身' },
  15: { en: 'Training', cn: '训练' },
  16: { en: 'Infused', cn: '注魔' },
  17: { en: 'Invigorating', cn: '振奋' },
  18: { en: 'Divines', cn: '神性' },
  19: { en: 'Ornate', cn: '华丽' },
  20: { en: 'Intricate', cn: '精细' },
  21: { en: 'Healthy', cn: '健康' },
  22: { en: 'Arcane', cn: '奥术' },
  23: { en: 'Robust', cn: '强壮' },
  24: { en: 'Ornate', cn: '华丽' },
  25: { en: 'Nirnhoned', cn: '奈恩磨砺' },
  26: { en: 'Nirnhoned', cn: '奈恩磨砺' },
  27: { en: 'Intricate', cn: '精细' },
  28: { en: 'Swift', cn: '轻灵' },
  29: { en: 'Harmony', cn: '和谐' },
  30: { en: 'Triune', cn: '三体' },
  31: { en: 'Bloodthirsty', cn: '嗜血' },
  32: { en: 'Protective', cn: '保护' },
  33: { en: 'Infused', cn: '注魔' }
}

/** 装备槽（EQUIP_SLOT_ORDER 顺序） */
const EQUIP_SLOTS = ['头', '项链', '胸', '肩', '主手', '副手', '腰', '腿', '脚', '戒指1', '戒指2', '手', '备份主手', '备份副手']

/** 品质 id → 颜色（ESO ITEM_QUALITY；legendary=5 等） */
const QUALITY_COLORS = {
  1: 'rgb(170, 170, 170)', // 普通
  2: 'rgb(47, 213, 14)',   // 优秀
  3: 'rgb(58, 146, 254)',  // 精良
  4: 'rgb(163, 53, 238)',  // 史诗
  5: 'rgb(255, 230, 45)'   // 传说
}

class Reader {
  constructor (bits) {
    this.bits = bits
    this.pos = 0
  }

  read (width) {
    if (this.pos + width > this.bits.length) {
      // 超出位流按 0 处理（尾部 padding）
      const v = parseInt((this.bits.slice(this.pos) + '0'.repeat(width)).slice(0, width), 2) || 0
      this.pos += width
      return v
    }
    const v = parseInt(this.bits.slice(this.pos, this.pos + width), 2)
    this.pos += width
    return v
  }
}

/**
 * 从分享码文本提取纯 75 进制串（兼容带 |H1:sss: 前缀 / |h 后缀 / 聊天内嵌）
 */
export function extractCode (text) {
  const str = String(text || '')
  const m = str.match(/\|H1:sss:([^|]+)\|h/i)
  if (m) return m[1].trim()
  // 无链接标记时，取形如 [75进制字符]{100,} 的连续串
  const raw = str.match(/[0-9BCDFGHJKLMNPQRSTVWXYZbcdfghjklmnpqrstvwxyz(){}\[\]<>.!?+\-/;~@&$^_=`]{100,}/)
  return raw ? raw[0] : ''
}

/**
 * 解码 75 进制串为位流
 */
export function decodeBits (code) {
  let bits = ''
  for (let i = 0; i < code.length; i += 8) {
    const chunk = code.slice(i, i + 8)
    let num = 0
    for (const ch of chunk) {
      const v = BASE.indexOf(ch)
      if (v < 0) return null // 非法字符
      num = num * BASE.length + v
    }
    bits += num.toString(2).padStart(49, '0')
  }
  return bits
}

/**
 * 解码完整分享码
 * @param {string} text 分享码文本（可含 |H1:sss: 等包裹）
 * @returns {object|null} 解码结果；解析失败返回 null
 */
export function decodeShareLink (text) {
  const code = extractCode(text)
  if (!code) return null
  const bits = decodeBits(code)
  if (!bits) return null
  const r = new Reader(bits)

  // 种族/职业（生成时 race==10→0、class==117→7，解码还原）
  let race = r.read(BW.RACE)
  if (race === 0) race = 10
  let cls = r.read(BW.CLASS)
  if (cls === 7) cls = 117

  // 技能：主栏 slot3-8、备栏 slot3-8
  const skills = []
  for (let i = 0; i < 12; i++) skills.push(r.read(BW.SKILL_ID))
  const primarySkills = skills.slice(0, 6)
  const backupSkills = skills.slice(6, 12)

  const boon = r.read(BW.ACTIVE_BOONS)
  const vampWWId = r.read(BW.VAMPWW_ID)

  // 属性点 rank 编码 → magicka/health/stamina（官方解码算法）
  const attributeRank = r.read(BW.ATTRIBUTE)
  let rank = attributeRank
  let magicka = 0
  let prefix = 0
  while (magicka < 64) {
    const next = (66 - magicka) * (65 - magicka) / 2
    if (prefix + next <= rank) {
      prefix += next
      magicka++
    } else break
  }
  rank -= prefix
  let health = 0
  let healthPrefix = 0
  while (health < 64 - magicka) {
    const next = 65 - magicka - health
    if (healthPrefix + next <= rank) {
      healthPrefix += next
      health++
    } else break
  }
  const stamina = rank - healthPrefix

  // 属性快照
  const stats = {
    magickaMax: r.read(BW.MAX_STAT),
    healthMax: r.read(BW.MAX_STAT),
    staminaMax: r.read(BW.MAX_STAT),
    magickaRegen: r.read(BW.REGEN),
    healthRegen: r.read(BW.REGEN),
    staminaRegen: r.read(BW.REGEN),
    spellPower: r.read(BW.POWER),
    weaponPower: r.read(BW.POWER),
    spellCrit: r.read(BW.CRIT),
    weaponCrit: r.read(BW.CRIT),
    spellPen: r.read(BW.CRIT),
    weaponPen: r.read(BW.CRIT),
    spellResist: r.read(BW.RESIST),
    weaponResist: r.read(BW.RESIST)
  }

  // 食物 buff（>64 时减去特殊值）
  let foodBuff = r.read(BW.FOOD_BUFF)
  if (foodBuff > 64) foodBuff -= 64

  // 装备 14 槽
  const equipment = []
  for (const slotName of EQUIP_SLOTS) {
    const occupied = r.read(1)
    if (!occupied) {
      equipment.push({ slot: slotName, occupied: false })
      continue
    }
    equipment.push({
      slot: slotName,
      occupied: true,
      itemId: r.read(BW.ITEM_ID),
      quality: r.read(BW.QUALITY),
      trait: r.read(BW.TRAIT),
      enchantId: r.read(BW.ENCHANT_ID),
      enchantQuality: r.read(BW.ENCHANT_QUALITY)
    })
  }

  // CP 槽：3 个 discipline（crafted/warfare/fitness）× 4 个星位（skillDisplayNumCap=4）
  const cp = []
  for (let d = 0; d < 3; d++) {
    const slots = []
    for (let s = 0; s < 4; s++) slots.push(r.read(BW.CP_SLOT))
    cp.push(slots)
  }

  // 技能线 / 职业精通（skLine3==0 → class mastery passive 索引；否则 LSF 技能线索引）
  const skillLines = [r.read(BW.SKILL_LINE), r.read(BW.SKILL_LINE), r.read(BW.SKILL_LINE)]

  return {
    race,
    raceName: RACES[race] || `种族${race}`,
    class: cls,
    className: CLASSES[cls === 117 ? 7 : cls]?.en || `class${cls}`,
    classNameCN: CLASSES[cls === 117 ? 7 : cls]?.cn || '',
    skills,
    primarySkills,
    backupSkills,
    boon,
    boonInfo: BOONS[boon] || null,
    vampWWId,
    vampWWInfo: VAMPWW[vampWWId] || null,
    attributeRank,
    attributes: { magicka, health, stamina },
    stats,
    foodBuff,
    foodBuffList: (() => {
      const list = []
      let fb = foodBuff
      for (const [bit, label] of Object.entries(FOOD_BUFF)) {
        if (fb & Number(bit)) list.push(label)
      }
      return list
    })(),
    equipment,
    cp,
    skillLines,
    // 位流消费信息（调试用）
    _consumed: r.pos,
    _total: bits.length
  }
}

/** 品质 id → 颜色 */
export function qualityColor (quality) {
  return QUALITY_COLORS[quality] || 'rgb(170, 170, 170)'
}

/** trait id → {en, cn} */
export function traitInfo (traitId) {
  return TRAITS[traitId] || null
}

/** ESO 职业 id → {en, cn}（1-7；117 由解码层还原为 7） */
export const CLASSES = Object.fromEntries(
  Object.entries({
    1: { en: 'Dragonknight', cn: '龙骑士' },
    2: { en: 'Templar', cn: '圣殿骑士' },
    3: { en: 'Sorcerer', cn: '巫师' },
    4: { en: 'Necromancer', cn: '死灵法师' },
    5: { en: 'Nightblade', cn: '夜刃' },
    6: { en: 'Warden', cn: '守望者' },
    7: { en: 'Arcanist', cn: '奥术师' }
  })
)

/**
 * 职业技能线：LSF index → {skillLineId, className}
 * 来源：LibSkillsFactory.staticSkillFactory[SKILL_TYPE_CLASS]（1-21）
 * 分享码 subclassing 模式的 3 个 SKILL_LINE 值即 LSF 索引
 */
export const LSF_CLASS_LINES = {
  1: { skillLineId: 35, className: 'Dragonknight' },
  2: { skillLineId: 36, className: 'Dragonknight' },
  3: { skillLineId: 37, className: 'Dragonknight' },
  4: { skillLineId: 41, className: 'Sorcerer' },
  5: { skillLineId: 42, className: 'Sorcerer' },
  6: { skillLineId: 43, className: 'Sorcerer' },
  7: { skillLineId: 38, className: 'Nightblade' },
  8: { skillLineId: 39, className: 'Nightblade' },
  9: { skillLineId: 40, className: 'Nightblade' },
  10: { skillLineId: 22, className: 'Templar' },
  11: { skillLineId: 27, className: 'Templar' },
  12: { skillLineId: 28, className: 'Templar' },
  13: { skillLineId: 127, className: 'Warden' },
  14: { skillLineId: 128, className: 'Warden' },
  15: { skillLineId: 129, className: 'Warden' },
  16: { skillLineId: 131, className: 'Necromancer' },
  17: { skillLineId: 132, className: 'Necromancer' },
  18: { skillLineId: 133, className: 'Necromancer' },
  19: { skillLineId: 218, className: 'Arcanist' },
  20: { skillLineId: 219, className: 'Arcanist' },
  21: { skillLineId: 220, className: 'Arcanist' }
}

/**
 * 职业精通：classId(ESO) → {lsf, className}
 * 来源：LibSkillsFactory.CLASS_MASTERY_LSF_INDEX（key 为分享码解码的 ESO class id，117=奥术师）
 */
export const CLASS_MASTERY = {
  1: { lsf: 43, className: 'Dragonknight' },
  2: { lsf: 49, className: 'Sorcerer' },
  3: { lsf: 48, className: 'Nightblade' },
  4: { lsf: 46, className: 'Warden' },
  5: { lsf: 45, className: 'Necromancer' },
  6: { lsf: 47, className: 'Templar' },
  117: { lsf: 44, className: 'Arcanist' }
}

/** 职业精通被动：LSF index → 5 个被动技能 id（staticSkillFactory[43-49][k].skillPool[1].id） */
export const MASTERY_PASSIVES = {
  43: [238232, 240268, 259224, 263220, 263247],
  44: [263316, 263398, 263410, 263412, 263416],
  45: [263448, 263465, 263509, 263549, 263554],
  46: [263519, 263520, 263521, 263522, 263523],
  47: [263585, 263586, 263587, 263588, 263589],
  48: [263603, 263604, 263605, 263606, 263607],
  49: [263870, 263871, 263872, 263873, 263874]
}

export default { decodeShareLink, extractCode, decodeBits, qualityColor, traitInfo, CLASSES, LSF_CLASS_LINES, CLASS_MASTERY, MASTERY_PASSIVES }
