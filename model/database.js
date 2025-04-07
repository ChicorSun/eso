import { createRequire } from 'module'
import Atlas from './atlas.js'
import Skills from './skills.js'
import Builds from './builds.js'
import RankTable from './rank.js'
import fetch from 'node-fetch'
import fs from 'node:fs'

const require = createRequire(import.meta.url);

let dataExtractorItemsENPath = './plugins/eso/resources/data/DataExtractor-Items-en.lua'
let dataExtractorItemsCNPath = './plugins/eso/resources/data/DataExtractor-Items-cn.lua'
let dataExtractorSkillsENPath = './plugins/eso/resources/data/DataExtractor-Skills-en.lua'
let dataExtractorSkillsCNPath = './plugins/eso/resources/data/DataExtractor-Skills-cn.lua'

//数据库
let allSets = []

let setsData = [{
}]
let recipesData = [{
}]
let furnituresData = [{
}]
let collfurnituresData = [{
}]
let skillsData = [{
}]

let setsDataCN = [{
}]
let recipesDataCN = [{
}]
let furnituresDataCN = [{
}]
let collfurnituresDataCN = [{
}]
let skillsDataCN = [{
}]

//装备别名数据库
let addrSet = [{
}]

//技能别名数据库
let addrSkill = [{
}]

//匹配到的项目序号的集合数组
let objSets = [-1]
let objSkills = [-1]

//技能ID转中文序号对照表
let skillID2IndexCN = {
  init: '-1',
}

//装备图鉴结构体变量
let setData = {
}
//技能图鉴结构体变量
let skillData = {
}
//Build结构体变量
let buildData = {
}
//Rank结构体变量
let rankData = {
}

let gearColor = [
  "rgb(255, 255, 255)",
  "rgb(255, 99, 132)",
  "rgb(54, 162, 235)",
  "rgb(255, 206, 86)",
  "rgb(75, 192, 192)",
  "rgb(153, 102, 255)",
  "rgb(255, 159, 64)",
  "rgb(231, 76, 60)",
  "rgb(46, 204, 113)",
  "rgb(155, 89, 182)",
  "rgb(52, 152, 219)",
  "rgb(241, 196, 15)",
  "rgb(189, 195, 199)",
  "rgb(26, 188, 156)",
  "rgb(243, 156, 18))"
]

let setType = [
  "竞技场",
  "PvP",
  "制造",
  "PvP",
  "PvP",

  "副本",
  "PvP",
  "怪物",
  "区域",
  "废弃",

  "试炼",
  "神话",
  "怪物",
  "怪物",
  "职业专属"
  ]

let setsBlackList = [
  "Armor of the Code",
  "Arms of the Ancestors",
  "Arms of Infernace",
  "The Destruction Suite",
  "Giant Spider",
  "Relics of the Physician, Ansur",
  "Relics of the Rebellion",
  "Treasures of the Earthforge",
  "Prophet's",
  "Broken Soul"
]

let numDungeons = 0
let dgList = [
  "Spindleclutch II",
  "The Banished Cells I",
  "Fungal Grotto II",
  "Spindleclutch I",
  "Darkshade Caverns II",
  "Elden Hollow I",
  "Wayrest Sewers II",
  "Fungal Grotto I",
  "The Banished Cells II",
  "Darkshade Caverns I",
  "Elden Hollow II",
  "Wayrest Sewers I",
  "Direfrost Keep",
  "Vaults of Madness",
  "Crypt of Hearts II",
  "City of Ash I",
  "Tempest Island",
  "Blackheart Haven",
  "Arx Corinium",
  "Selene's Web",
  "City of Ash II",
  "Crypt of Hearts I",
  "Volenfell",
  "Blessed Crucible",
  "Imperial City Prison",
  "Ruins of Mazzatun",
  "White-Gold Tower",
  "Cradle of Shadows",
  "Bloodroot Forge",
  "Falkreath Hold",
  "Fang Lair",
  "Scalecaller Peak",
  "Moon Hunter Keep",
  "March of Sacrifices",
  "Depths of Malatar",
  "Frostvault",
  "Moongrave Fane",
  "Lair of Maarselok",
  "Icereach",
  "Unhallowed Grave",
  "Stone Garden",
  "Castle Thorn",
  "Black Drake Villa",
  "The Cauldron",
  "Red Petal Bastion",
  "The Dread Cellar",
  "Coral Aerie",
  "Shipwright's Regret",
  "Earthen Root Enclave",
  "Graven Deep",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA",
  "NA"
]

let dgSetsTable = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],
                  [0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]

let skillMsgIndex = [
  "一阶",
  "二阶",
  "三阶",
  "四阶",
  "五阶",
  "六阶",
  "七阶",
  "八阶",
  "九阶",
  "十阶",
  "十一阶",
  "十二阶",
  "十三阶",
  "十四阶",
  "十五阶",
  "十六阶",
  "十七阶",
  "十八阶",
  "十九阶",
  "二十阶"
]

var traits_armor = [
  {"name": "加固", "en_name": "Reinforced", "log_name": "坚固甲冑", "img": "https://images.uesp.net/a/af/ON-icon-trait_material-Sardonyx.png", "cn_des": "物品护甲数值增加16%"}, 
  {"name": "强韧", "en_name": "Sturdy", "log_name": "坚固", "img": "https://images.uesp.net/c/c6/ON-icon-trait_material-Quartz.png", "cn_des": "降低格挡消耗4%"}, 
  {"name": "牢不可破", "en_name": "Impenetrable", "log_name": "坚不可摧", "img": "https://images.uesp.net/6/6a/ON-icon-trait_material-Diamond.png", "cn_des": "增加暴击抗性127并且物品耐久度消耗减少50%"}, 
  {"name": "合身", "en_name": "Well-fitted", "log_name": "合身", "img": "https://images.uesp.net/0/03/ON-icon-trait_material-Almandine.png", "cn_des": "降低冲刺和翻滚的消耗6%"}, 
  {"name": "训练", "en_name": "Training", "log_name": "强化训练", "img": "https://images.uesp.net/2/28/ON-icon-trait_material-Emerald.png", "cn_des": "增加击杀获取经验11%"}, 
  {"name": "注魔", "en_name": "Infused", "log_name": "魔力充沛", "img": "https://images.uesp.net/9/97/ON-icon-trait_material-Bloodstone.png", "cn_des": "增加护甲附魔效果25%"}, 
  {"name": "振奋", "en_name": "Invigorating", "log_name": "富饶", "img": "https://images.uesp.net/9/9a/ON-icon-trait_material-Garnet.png", "cn_des": "增加生命、魔法和耐力恢复16"}, 
  {"name": "神性", "en_name": "Divines", "log_name": "神圣之力", "img": "https://images.uesp.net/8/82/ON-icon-trait_material-Sapphire.png", "cn_des": "增加梦达斯之石效果9.1%"}, 
  {"name": "奈恩磨砺", "en_name": "Nirnhorned", "log_name": "奈恩之心", "img": "https://images.uesp.net/9/99/ON-icon-trait_material-Fortified_Nirncrux.png", "cn_des": "增加物理抗性和法术抗性253"}
];
var traits_jewelry = [
  {"name": "奥术", "en_name": "Arcane", "log_name": "奥术", "img": "https://images.uesp.net/thumb/2/2a/ON-icon-trait_material-Cobalt.png", "cn_des": "增加最大魔法877"}, 
  {"name": "健康", "en_name": "Healthy", "log_name": "生命力", "img": "https://images.uesp.net/thumb/3/36/ON-icon-trait_material-Antimony.png", "cn_des": "增加最大生命965"}, 
  {"name": "强壮", "en_name": "Robust", "log_name": "强壮", "img": "https://images.uesp.net/thumb/c/c7/ON-icon-trait_material-Zinc.png", "cn_des": "增加最大耐力877"}, 
  {"name": "三体", "en_name": "Triune", "log_name": "三元", "img": "https://images.uesp.net/thumb/3/36/ON-icon-trait_material-Dawn-Prism.png", "cn_des": "增加最大生命482、魔法439和耐力439"}, 
  {"name": "注魔", "en_name": "Infused", "log_name": "魔力充沛", "img": "https://images.uesp.net/thumb/8/85/ON-icon-trait_material-Aurbic_Amber.png", "cn_des": "增加附魔效果60%"}, 
  {"name": "保护", "en_name": "Protective", "log_name": "防护", "img": "https://images.uesp.net/thumb/6/60/ON-icon-trait_material-Titanium.png", "cn_des": "增加法术抗性和物理抗性1190"}, 
  {"name": "轻灵", "en_name": "Swift", "log_name": "迅捷", "img": "https://images.uesp.net/thumb/c/c0/ON-icon-trait_material-Gilding_Wax.png", "cn_des": "增加移动速度7%"}, 
  {"name": "和谐", "en_name": "Harmony", "log_name": "共鸣", "img": "https://images.uesp.net/thumb/3/30/ON-icon-trait_material-Dibellium.png", "cn_des": "增加激活协同技能获得伤害、治疗、资源恢复和护盾强度20%"}, 
  {"name": "嗜血", "en_name": "Bloodthirsty", "log_name": "嗜血", "img": "https://images.uesp.net/9/9b/ON-icon-trait_material-Slaughterstone.png", "cn_des": "对于90%以下生命值的敌人，随着敌人血量降低，逐步增加你的武器和法术伤害，最高350"}
];
var traits_weapon = [
  {"name": "动力", "en_name": "Powered", "log_name": "魔力供给", "img": "https://images.uesp.net/4/49/ON-icon-trait_material-Chysolite.png", "cn_des": "增加治疗量9%"}, 
  {"name": "充能", "en_name": "Charged", "log_name": "充能", "img": "https://images.uesp.net/2/2c/ON-icon-trait_material-Amethyst.png", "cn_des": "增加应用状态效果几率480%"}, 
  {"name": "精准", "en_name": "Precise", "log_name": "精准之击", "img": "https://images.uesp.net/1/18/ON-icon-trait_material-Ruby.png", "cn_des": "增加武器和法术暴击7.2%"}, 
  {"name": "注魔", "en_name": "Infused", "log_name": "魔力充沛", "img": "https://images.uesp.net/0/07/ON-icon-trait_material-Jade.png", "cn_des": "增加武器附魔效果30%并降低附魔冷却50%"}, 
  {"name": "防御", "en_name": "Defending", "log_name": "防御", "img": "https://images.uesp.net/2/2d/ON-icon-trait_material-Turquoise.png", "cn_des": "增加物理抗性和法术抗性3276"}, 
  {"name": "训练", "en_name": "Training", "log_name": "强化训练", "img": "https://images.uesp.net/4/41/ON-icon-trait_material-Carnelian.png", "cn_des": "增加击杀经验获取9%"}, 
  {"name": "锋锐", "en_name": "Sharpened", "log_name": "锐利之击", "img": "https://images.uesp.net/7/7a/ON-icon-trait_material-Fire_Opal.png", "cn_des": "增加物理和法术穿透3276"}, 
  {"name": "决意", "en_name": "Decisive", "log_name": "毅重意志", "img": "https://images.uesp.net/5/52/ON-icon-trait_material-Citrine.png", "cn_des": "获得终极点时有55%几率获得额外1点终极点"}, 
  {"name": "奈恩磨砺", "en_name": "Nirnhorned", "log_name": "奈恩之心", "img": "https://images.uesp.net/b/bb/ON-icon-trait_material-Potent_Nirncrux.png", "cn_des": "增加武器面板的攻击力15%"}
];

var enchants_armor = [
  {"name": "生命上限雕文", "en_name": "Health", "log_name_en": "Health", "log_name": "生命力", "img": "https://images.uesp.net/c/c7/ON-icon-glyph-armor-Glyph_of_Health.png", "cn_des": "最多增加954最大生命"}, 
  {"name": "魔力上限雕文", "en_name": "Magicka", "log_name_en": "Magicka", "log_name": "法力", "img": "https://images.uesp.net/8/86/ON-icon-glyph-armor-Glyph_of_Magicka.png", "cn_des": "最多增加868最大魔法"}, 
  {"name": "耐力上限雕文", "en_name": "Stamina", "log_name_en": "Stamina", "log_name": "耐力", "img": "https://images.uesp.net/1/1a/ON-icon-glyph-armor-Glyph_of_Stamina.png", "cn_des": "最多增加868最大耐力"}, 
  {"name": "棱镜防御雕文", "en_name": "Prismatic Defense", "log_name_en": "Prismatic Defense", "log_name": "神光守御", "img": "https://images.uesp.net/a/aa/ON-icon-glyph-armor-Glyph_of_Prismatic_Defense.png", "cn_des": "最多增加477最大生命，最多增加434最大魔法，最多增加434最大耐力"}
];

var enchants_jewelry = [
  {"name": "生命回复雕文", "en_name": "Health Regen", "log_name_en": "Health Rege", "log_name": "生命回复", "img": "https://images.uesp.net/9/94/ON-icon-glyph-jewelry-Glyph_of_Health_Recovery.png", "cn_des": "增加169生命恢复"}, 
  {"name": "魔力回复雕文", "en_name": "Magicka Regen", "log_name_en": "Magicka Regen", "log_name": "法力回复", "img": "https://images.uesp.net/d/d6/ON-icon-glyph-jewelry-Glyph_of_Magicka_Recovery.png", "cn_des": "增加169魔法恢复"}, 
  {"name": "耐力回复雕文", "en_name": "Stamina Regen", "log_name_en": "Stamina Regen", "log_name": "耐力回复", "img": "https://images.uesp.net/c/c3/ON-icon-glyph-jewelry-Glyph_of_Stamina_Recovery.png", "cn_des": "增加169耐力恢复"}, 

  {"name": "棱镜回复雕文", "en_name": "Prismatic Recovery", "log_name_en": "Prismatic Recovery", "log_name": "神光恢复", "img": "https://images.uesp.net/d/d2/ON-icon-glyph-jewelry-Glyph_of_Prismatic_Recovery.png", "cn_des": "增加84生命恢复、增加84魔法恢复、增加84耐力恢复"},
  {"name": "降低法术消耗雕文", "en_name": "Reduce Spell Cost", "log_name_en": "Reduce Spell Cost", "log_name": "降低法术消耗", "img": "https://images.uesp.net/1/16/ON-icon-glyph-jewelry-Glyph_of_Reduce_Spell_Cost.png", "cn_des": "技能的魔法消耗降低203"}, 
  {"name": "降低武艺消耗雕文", "en_name": "Reduce Feat Cost", "log_name_en": "Reduce Feat Cost", "log_name": "降低物理消耗", "img": "https://images.uesp.net/7/74/ON-icon-glyph-jewelry-Glyph_of_Reduce_Feat_Cost.png", "cn_des": "技能的耐力消耗降低203"}, 

  {"name": "降低技能消耗雕文", "en_name": "Reduce Skill Cost", "log_name_en": "Reduce Skill Cost", "log_name": "减少解控消耗", "img": "https://images.uesp.net/3/34/ON-icon-glyph-jewelry-Glyph_of_Reduce_Skill_Cost.png", "cn_des": "减少技能的生命、魔法以及耐力消耗133"},
  {"name": "提高魔法损害雕文", "en_name": "Increase Magical Harm", "log_name_en": "Increase Spell Damage", "log_name": "增加法术伤害", "img": "https://images.uesp.net/3/36/ON-icon-glyph-jewelry-Glyph_of_Increase_Magical_Harm.png", "cn_des": "增加174法术伤害"}, 
  {"name": "提高物理损害雕文", "en_name": "Increase Physical Harm", "log_name_en": "Increase Physical Damage", "log_name": "增加物理伤害", "img": "https://images.uesp.net/9/9a/ON-icon-glyph-jewelry-Glyph_of_Increase_Physical_Harm.png", "cn_des": "增加174物理伤害"}, 

  {"name": "减少法术损害雕文", "en_name": "Decrease Spell Harm", "log_name_en": "Decrease Spell Harm", "log_name": "减少法术伤害", "img": "https://images.uesp.net/6/62/ON-icon-glyph-jewelry-Glyph_of_Decrease_Spell_Harm.png", "cn_des": "增加927法术抗性"}, 
  {"name": "减少物理损害雕文", "en_name": "Decrease Physical Harm", "log_name_en": "Decrease Physical Har", "log_name": "减少物理伤害", "img": "https://images.uesp.net/4/46/ON-icon-glyph-jewelry-Glyph_of_Decrease_Physical_Harm.png", "cn_des": "增加927物理抗性"}, 

  {"name": "火焰抗性雕文", "en_name": "Flame Resist", "log_name_en": "Flame Resist", "log_name": "火焰抗性", "img": "https://images.uesp.net/6/6e/ON-icon-glyph-jewelry-Glyph_of_Flame_Resist.png", "cn_des": "增加3520火焰抗性"}, 
  {"name": "寒霜抗性雕文", "en_name": "Frost Resist", "log_name_en": "Frost Resist", "log_name": "冰冻抗性", "img": "https://images.uesp.net/2/23/ON-icon-glyph-jewelry-Glyph_of_Frost_Resist.png", "cn_des": "增加3520寒冰抗性"}, 
  {"name": "电击抗性雕文", "en_name": "Shock Resist", "log_name_en": "Shock Resist", "log_name": "闪电抗性", "img": "https://images.uesp.net/2/2a/ON-icon-glyph-jewelry-Glyph_of_Shock_Resist.png", "cn_des": "增加3520闪电抗性"}, 
  {"name": "毒素抗性雕文", "en_name": "Poison Resist", "log_name_en": "Poison Resist", "log_name": "毒抗性", "img": "https://images.uesp.net/2/23/ON-icon-glyph-jewelry-Glyph_of_Poison_Resist.png", "cn_des": "增加3520毒素抗性"}, 

  {"name": "疾病抗性雕文", "en_name": "Disease Resist", "log_name_en": "Disease Resist", "log_name": "疾病抗性", "img": "https://images.uesp.net/d/d2/ON-icon-glyph-jewelry-Glyph_of_Disease_Resist.png", "cn_des": "增加3520疾病抗性"}, 
  {"name": "猛击雕文", "en_name": "Bashing", "log_name_en": "Bashing", "log_name": "增加猛击伤害", "img": "https://images.uesp.net/9/99/ON-icon-glyph-jewelry-Glyph_of_Bashing.png", "cn_des": "猛击增加500伤害"}, 
  {"name": "招架雕文", "en_name": "Bracing", "log_name_en": "Bracing", "log_name": "减少格挡和猛击", "img": "https://images.uesp.net/1/1d/ON-icon-glyph-jewelry-Glyph_of_Bracing.png", "cn_des": "减少你的格挡消耗203"},

  {"name": "药水提升雕文", "en_name": "Potion Boost", "log_name_en": "Potion Boost", "log_name": "提高药水效果", "img": "https://images.uesp.net/1/1e/ON-icon-glyph-jewelry-Glyph_of_Potion_Boost.png", "cn_des": "使你的药水效果持续时间增加3.6秒"}, 
  {"name": "药水速度雕文", "en_name": "Potion Speed", "log_name_en": "Potion Speed", "log_name": "减少药水冷却", "img": "https://images.uesp.net/f/f2/ON-icon-glyph-jewelry-Glyph_of_Potion_Speed.png", "cn_des": "使你的药水冷却减少5秒"},  
];

var enchants_weapon = [
  {"name": "棱镜猛攻雕文", "en_name": "Prismatic Onslaught", "log_name_en": "Prismatic Onslaught", "log_name": "神光屠戮", "img": "https://images.uesp.net/4/4b/ON-icon-glyph-weapon-Glyph_of_Prismatic_Onslaught.png", "cn_des": "造成2090魔法伤害并恢复430生命和177魔法以及177耐力"}, 
  {"name": "武器伤害雕文", "en_name": "Weapon Damage", "log_name_en": "Berserker", "log_name": "狂暴", "img": "https://images.uesp.net/d/d4/ON-icon-glyph-weapon-Glyph_of_Weapon_Damage.png", "cn_des": "增加武器和法术伤害348，持续5秒"}, 
  {"name": "减少护甲雕文", "en_name": "Reduce Armor", "log_name_en": "Reduce Armor", "log_name": "减少护甲", "img": "https://images.uesp.net/2/2c/ON-icon-glyph-weapon-Glyph_of_Crushing.png", "cn_des": "减少目标1622法术抗性和物理抗性，持续5秒"}, 
  {"name": "吸取生命雕文", "en_name": "Absorb Health", "log_name_en": "Absorb Health", "log_name": "生命吸取", "img": "https://images.uesp.net/6/66/ON-icon-glyph-weapon-Glyph_of_Absorb_Health.png", "cn_des": "造成2090魔法伤害，同时恢复861生命"}, 

  {"name": "吸取魔法雕文", "en_name": "Absorb Magicka", "log_name_en": "Absorb Magicka", "log_name": "魔力汲取", "img": "https://images.uesp.net/3/3e/ON-icon-glyph-weapon-Glyph_of_Absorb_Magicka.png", "cn_des": "造成2090魔法伤害，同时恢复354魔法"}, 
  {"name": "吸取耐力雕文", "en_name": "Absorb Stamina", "log_name_en": "Absorb Stamina", "log_name": "耐力偷取", "img": "https://images.uesp.net/6/6e/ON-icon-glyph-weapon-Glyph_of_Absorb_Stamina.png", "cn_des": "造成2090物理伤害，同时恢复254耐力"}, 
  {"name": "削减生命雕文", "en_name": "Decrease Health", "log_name_en": "Decrease Health", "log_name": "减损生命", "img": "https://images.uesp.net/b/bb/ON-icon-glyph-weapon-Glyph_of_Decrease_Health.png", "cn_des": "根据敌人最大生命值的一部分造成湮灭伤害，最大造成4875湮灭伤害"}, 

  {"name": "火焰雕文", "en_name": "Flame", "log_name_en": "Fiery Weapon", "log_name": "爆炎武器", "img": "https://images.uesp.net/4/41/ON-icon-glyph-weapon-Glyph_of_Flame.png", "cn_des": "造成2787火焰伤害"}, 
  {"name": "寒霜雕文", "en_name": "Frost", "log_name_en": "Frost", "log_name": "冰霜武器", "img": "https://images.uesp.net/b/b3/ON-icon-glyph-weapon-Glyph_of_Frost.png", "cn_des": "造成2787寒冰伤害"}, 
  {"name": "电击雕文", "en_name": "Shock", "log_name_en": "Shock", "log_name": "闪电武器", "img": "https://images.uesp.net/7/72/ON-icon-glyph-weapon-Glyph_of_Shock.png", "cn_des": "造成2787闪电伤害"}, 
  {"name": "毒素雕文", "en_name": "Poisoned Weapon", "log_name_en": "Poisoned Weapon", "log_name": "淬毒武器", "img": "https://images.uesp.net/9/90/ON-icon-glyph-weapon-Glyph_of_Poison.png", "cn_des": "造成2787毒素伤害"}, 
  {"name": "肮脏雕文", "en_name": "Foulness", "log_name_en": "Foulness", "log_name": "疾病武器", "img": "https://images.uesp.net/5/56/ON-icon-glyph-weapon-Glyph_of_Foulness.png", "cn_des": "造成2787疾病伤害"}, 
  
  {"name": "硬化雕文", "en_name": "Damage Shield", "log_name_en": "Damage Shield", "log_name": "伤害护盾", "img": "https://images.uesp.net/f/f0/ON-icon-glyph-weapon-Glyph_of_Hardening.png", "cn_des": "获得一个可吸收3290伤害的护盾，持续5秒"}, 
  {"name": "削弱雕文", "en_name": "Weakening", "log_name_en": "Weakening", "log_name": "削弱力量", "img": "https://images.uesp.net/9/90/ON-icon-glyph-weapon-Glyph_of_Weakening.png", "cn_des": "减少目标348武器和法术伤害，持续5秒"}
];

var translate_skills = [
  {"en_name": "ability_destructionstaff_002", "log_name": "ability_destructionstaff_003"}, 
  {"en_name": "ability_destructionstaff_002", "log_name": "ability_destructionstaff_004"},  
  {"en_name": "ability_destructionstaff_005", "log_name": "ability_destructionstaff_006"}, 
  {"en_name": "ability_destructionstaff_005", "log_name": "ability_destructionstaff_007"}, 
  {"en_name": "ability_destructionstaff_008", "log_name": "ability_destructionstaff_009"}, 
  {"en_name": "ability_destructionstaff_008", "log_name": "ability_destructionstaff_010"}, 
  {"en_name": "ability_destructionstaff_012", "log_name": "ability_destructionstaff_013"}, 
  {"en_name": "ability_destructionstaff_012", "log_name": "ability_destructionstaff_014"}, 
  {"en_name": "ability_destructionstaff_012", "log_name": "ability_destructionstaff_015"}, 
  {"en_name": "ability_destructionstaff_002b", "log_name": "Unstable Wall of Frost"}, 
  {"en_name": "ability_destructionstaff_002b", "log_name": "Unstable Wall of Elements"}, 
  {"en_name": "ability_destructionstaff_002b", "log_name": "ability_destructionstaff_003_a"}, 
  {"en_name": "ability_destructionstaff_002b", "log_name": "ability_destructionstaff_004_a"}, 
  {"en_name": "ability_destructionstaff_005_a", "log_name": "ability_destructionstaff_006_a"}, 
  {"en_name": "ability_destructionstaff_005_a", "log_name": "ability_destructionstaff_007_a"}, 
  {"en_name": "ability_destructionstaff_008_a", "log_name": "ability_destructionstaff_009_a"}, 
  {"en_name": "ability_destructionstaff_008_a", "log_name": "ability_destructionstaff_010_a"}, 
  {"en_name": "ability_destructionstaff_012_a", "log_name": "ability_destructionstaff_013_a"}, 
  {"en_name": "ability_destructionstaff_012_a", "log_name": "ability_destructionstaff_014_a"}, 
  {"en_name": "ability_destructionstaff_012_a", "log_name": "ability_destructionstaff_015_a"},
  {"en_name": "ability_destructionstaff_002a", "log_name": "Blockade of Frost"},
  {"en_name": "ability_destructionstaff_002a", "log_name": "Elemental Blockade"},
  {"en_name": "ability_destructionstaff_002a", "log_name": "ability_destructionstaff_003_b"}, 
  {"en_name": "ability_destructionstaff_002a", "log_name": "ability_destructionstaff_004_b"}, 
  {"en_name": "ability_destructionstaff_005_b", "log_name": "ability_destructionstaff_006_b"}, 
  {"en_name": "ability_destructionstaff_005_b", "log_name": "ability_destructionstaff_007_b"}, 
  {"en_name": "ability_destructionstaff_008_b", "log_name": "ability_destructionstaff_009_b"}, 
  {"en_name": "ability_destructionstaff_008_b", "log_name": "ability_destructionstaff_010_b"}, 
  {"en_name": "ability_destructionstaff_012_b", "log_name": "ability_destructionstaff_013_b"}, 
  {"en_name": "ability_destructionstaff_012_b", "log_name": "ability_destructionstaff_014_b"}, 
  {"en_name": "ability_destructionstaff_012_b", "log_name": "ability_destructionstaff_015_b"},
  {"en_name": "ability_sorcerer_unstable_fimiliar", "log_name": "Summon Unstable Familiar"}, 
  {"en_name": "ability_sorcerer_lightning_prey", "log_name": "Winged Twilight Restore"}, 
  {"en_name": "ability_sorcerer_lightning_prey", "log_name": "Summon Winged Twilight"}, 
  {"en_name": "ability_sorcerer_unstable_clannfear", "log_name": "Summon Unstable Clannfear"}, 
  {"en_name": "ability_sorcerer_lightning_matriarch", "log_name": "Twilight Tormentor Enrage"}, 
  {"en_name": "ability_sorcerer_lightning_matriarch", "log_name": "Summon Twilight Tormentor"}, 
  {"en_name": "ability_sorcerer_speedy_familiar", "log_name": "Summon Volatile Familiar"}, 
  {"en_name": "ability_sorcerer_storm_prey", "log_name": "Twilight Matriarch Restore"}, 
  {"en_name": "ability_sorcerer_storm_prey", "log_name": "Summon Twilight Matriarch"}, 
  {"en_name": "ability_warden_018_b", "log_name": "Guardian's Wrath"}, 
  {"en_name": "ability_warden_018_b", "log_name": "Eternal Guardian"}, 
  {"en_name": "ability_warden_018_c", "log_name": "Guardian's Savagery"}, 
  {"en_name": "ability_warden_018_c", "log_name": "Wild Guardian"}, 
  {"en_name": "xxxx", "log_name": "xxx"}, 
  {"en_name": "xxxx", "log_name": "xxx"}, 
  {"en_name": "xxxx", "log_name": "xxx"}
];

class database {
  async isInList (keyword, objectList) {
    var index = 0
    for (let sgOBJ of objectList) {
      if (keyword == sgOBJ)
      {
        return index
      }
      index = index + 1
    }
    return -1
  }

  async getSetsEN () {
    await this.init_database()
    return setsData
  }

  async getSetsCN () {
    await this.init_database()
    return setsDataCN
  }

  async getDgNum () {
    await this.init_database()
    return numDungeons
  }

  async getdgList () {
    await this.init_database()
    return dgList
  }

  async getdgSets () {
    await this.init_database()
    return dgSetsTable
  }

  async init_database () {
    await this.init_databaseEN()
    await this.init_databaseCN()

    await this.enhance_database()
    await this.init_databaseDG()
  }

  async enhance_database () {
    await this.enhance_setsData()
    await this.enhance_skillsData()
  }

  async enhance_setsData () {
    var keysSet = Object.keys(setsData)
    var numSets = keysSet.length

    for (let setKey of keysSet) {
      if(setsData[setKey].type == 15)
      {
        setsDataCN[setsData[setKey].id].place = "无尽档案塔"
      }

      if(setsData[setKey].name == "Undaunted Bastion")
      {
        if (setsData[setKey].styles.Apparel.Head.Light)
        {
          delete setsData[setKey].styles.Apparel.Head.Light
        }
        if (setsData[setKey].styles.Apparel.Head.Medium)
        {
          delete setsData[setKey].styles.Apparel.Head.Medium
        }
      }

      if(setsData[setKey].name == "Pillager's Profit")
      {
        if(setsDataCN[setsData[setKey].id].bonuses['5'].includes('高级力量'))
        {
          setsDataCN[setsData[setKey].id].bonuses['5'] = "（5件套）[ESOBOT改]在战斗中施放终极技能时，根据你消耗的终极点数量每2秒为12米范围内最多11名其他小队成员提供持续10秒的终极点恢复，每2秒恢复一次，恢复量为施放者消耗终极点的5%，单次恢复值最大为20终极点。"
        }
        //logger.info(setsDataCN[setsData[setKey].id])
      }
      if(setsData[setKey].name == "Perfected Pillager's Profit")
      {
        if(setsDataCN[setsData[setKey].id].bonuses['6'].includes('高级力量'))
        {
          setsDataCN[setsData[setKey].id].bonuses['6'] = "（5件套）[ESOBOT改]在战斗中施放终极技能时，根据你消耗的终极点数量每2秒为12米范围内最多11名其他小队成员提供持续10秒的终极点恢复，每2秒恢复一次，恢复量为施放者消耗终极点的5%，单次恢复值最大为20终极点。"
        }
        //logger.info(setsDataCN[setsData[setKey].id])
      }

      if(setsData[setKey].name == "Hollowfang Thirst")
      {
        if(setsDataCN[setsData[setKey].id].bonuses['5'].includes('|cffffff1750|r6'))
        {
          setsDataCN[setsData[setKey].id].bonuses['5'] = "（5件套）对目标造成暴击治疗或暴击伤害时，在目标位置生成一个血球。2秒后血球爆炸，为你和血球6米范围内的队伍成员恢复1750魔力，并附加次级活力，持续9秒，其受到的治疗和伤害护盾强度提高6%。该效果每9秒可触发一次。"
        }
        //logger.info(setsData[setKey])
        //logger.info(setsDataCN[setsData[setKey].id])
      }
      
      var indexInList = await this.isInList(setsData[setKey].name, setsBlackList)
      if(indexInList > -1)
      {
        //logger.info("||SetID:" + setKey + " name:" + setsDataCN[setsData[setKey].id].name + " " + " <"+setsData[setKey].name + ">")  
        delete setsData[setKey]
      }
    }
  }


  async enhance_skillsData () {
    if('done' == skillID2IndexCN.init)
    {
      //logger.info("skillID2IndexCN table is ready, no need to update.")
      return
    }

    //logger.info("Update skillID2IndexCN table.")
    let allSkillData = skillsDataCN
    var keysLine = Object.keys(allSkillData)
    var numLines = keysLine.length
    let baseIndex = 1
    let indexStr = ''

    for (let lineKey of keysLine) {
      if(lineKey == 9)
      {
        continue
      }
      //logger.info('---' + allSkillData[lineKey].name)
      var keysClass = Object.keys(allSkillData[lineKey])
      var numClass = keysClass.length
      for (let classKey of keysClass) {
        if(classKey == "name")
        {
          continue
        }
        //logger.info('       ' +  classKey + '|---' + allSkillData[lineKey][classKey].name)
        var keysSkill = Object.keys(allSkillData[lineKey][classKey].skills)
        var numSkill = keysSkill.length
        for (let skillKey of keysSkill) {
          if(skillKey == "name" || skillKey == "id" || allSkillData[lineKey][classKey].skills[skillKey].id == 0)
          {
            continue
          }
          var oneSkill = allSkillData[lineKey][classKey].skills[skillKey]
          if(oneSkill.passive == false && oneSkill['1'])
          {
            baseIndex = 1
            if(allSkillData[lineKey][classKey].skills['1'].ultimate)
            {
              if(allSkillData[lineKey][classKey].skills['2'].id)
              {
                baseIndex = 1
              }
              else if(allSkillData[lineKey][classKey].skills['3'].id)
              {
                baseIndex = 2
              }
              else if(allSkillData[lineKey][classKey].skills['4'].id)
              {
                baseIndex = 3
              }
              else if(allSkillData[lineKey][classKey].skills['5'].id)
              {
                baseIndex = 4
              }
            }
            else
            {
              if(allSkillData[lineKey][classKey].skills['1'].id)
              {
                baseIndex = 0
              }
              else if(allSkillData[lineKey][classKey].skills['2'].id)
              {
                baseIndex = 1
              }
              else if(allSkillData[lineKey][classKey].skills['3'].id)
              {
                baseIndex = 2
              }
              else if(allSkillData[lineKey][classKey].skills['4'].id)
              {
                baseIndex = 3
              }
              else if(allSkillData[lineKey][classKey].skills['5'].id)
              {
                baseIndex = 4
              }
            }
          }
          else
          {
            if(allSkillData[lineKey][classKey].skills['1'] && allSkillData[lineKey][classKey].skills['1'].passive == true)
            {
              baseIndex = 0
            }
            else if(allSkillData[lineKey][classKey].skills['2'] && allSkillData[lineKey][classKey].skills['2'].passive == true)
            {
              baseIndex = 1
            }
            else if(allSkillData[lineKey][classKey].skills['3'] && allSkillData[lineKey][classKey].skills['3'].passive == true)
            {
              baseIndex = 2
            }
            else if(allSkillData[lineKey][classKey].skills['4'] && allSkillData[lineKey][classKey].skills['4'].passive == true)
            {
              baseIndex = 3
            }
            else if(allSkillData[lineKey][classKey].skills['5'] && allSkillData[lineKey][classKey].skills['5'].passive == true)
            {
              baseIndex = 4
            }
            else if(allSkillData[lineKey][classKey].skills['6'] && allSkillData[lineKey][classKey].skills['6'].passive == true)
            {
              baseIndex = 5
            }
            else if(allSkillData[lineKey][classKey].skills['7'] && allSkillData[lineKey][classKey].skills['7'].passive == true)
            {
              baseIndex = 6
            }
            else if(allSkillData[lineKey][classKey].skills['8'] && allSkillData[lineKey][classKey].skills['8'].passive == true)
            {
              baseIndex = 7
            }
            else if(allSkillData[lineKey][classKey].skills['9'] && allSkillData[lineKey][classKey].skills['9'].passive == true)
            {
              baseIndex = 8
            }
            else if(allSkillData[lineKey][classKey].skills['10'] && allSkillData[lineKey][classKey].skills['10'].passive == true)
            {
              baseIndex = 9
            }
          }
          skillID2IndexCN[oneSkill.id] = []
          skillID2IndexCN[oneSkill.id][0] = lineKey
          skillID2IndexCN[oneSkill.id][1] = classKey
          skillID2IndexCN[oneSkill.id][2] = skillKey
          skillID2IndexCN[oneSkill.id][3] = '0'
          if(oneSkill.ultimate)
          {
            indexStr = '大招'
          }
          else
          {
            if(oneSkill.passive == false && oneSkill['1'])
            {
              let thisIndex = skillKey - baseIndex
              if(thisIndex == 0 || thisIndex == 1)
              {
                indexStr = '一'
              }
              else if(thisIndex == 2)
              {
                indexStr = '二'
              }
              else if(thisIndex == 3)
              {
                indexStr = '三'
              }
              else if(thisIndex == 4)
              {
                indexStr = '四'
              }
              else if(thisIndex == 5)
              {
                indexStr = '五'
              }
              else if(thisIndex == 6)
              {
                indexStr = '六'
              }
            }
            else
            {
              let thisIndex = skillKey - baseIndex
              if(thisIndex == 0 || thisIndex == 1)
              {
                indexStr = '被动一'
              }
              else if(thisIndex == 2)
              {
                indexStr = '被动二'
              }
              else if(thisIndex == 3)
              {
                indexStr = '被动三'
              }
              else if(thisIndex == 4)
              {
                indexStr = '被动四'
              }
              else if(thisIndex == 5)
              {
                indexStr = '被动五'
              }
              else if(thisIndex == 6)
              {
                indexStr = '被动六'
              }
              else if(thisIndex == 7)
              {
                indexStr = '被动七'
              }
              else if(thisIndex == 8)
              {
                indexStr = '被动八'
              }
              else if(thisIndex == 9)
              {
                indexStr = '被动九'
              }
            }
          }

          skillID2IndexCN[oneSkill.id]["address"] = allSkillData[lineKey][classKey].name + indexStr
          //logger.info(skillID2IndexCN[oneSkill.id]["address"])

          if(oneSkill.passive == false && oneSkill['1'])
          {
            skillID2IndexCN[oneSkill[1].id] = []
            skillID2IndexCN[oneSkill[1].id][0] = lineKey
            skillID2IndexCN[oneSkill[1].id][1] = classKey
            skillID2IndexCN[oneSkill[1].id][2] = skillKey
            skillID2IndexCN[oneSkill[1].id][3] = '1'
            skillID2IndexCN[oneSkill[1].id]["address"] = allSkillData[lineKey][classKey].name + indexStr
            //logger.info(skillID2IndexCN[oneSkill[1].id]["address"])
            /*
            if(!oneSkill[1].ultimate) {
              if(oneSkill[1].powerTypes['1'] > -1) {
                logger.info(oneSkill[1].name + '|type:1, cost:' + oneSkill[1].powerTypes['1'])
              } else if(oneSkill[1].powerTypes['4'] > -1) {
                logger.info(oneSkill[1].name + '|type:4, cost:' + oneSkill[1].powerTypes['4'])
              } else if(oneSkill[1].powerTypes['32'] > -1) {
                logger.info(oneSkill[1].name + '|type:32, cost:' + oneSkill[1].powerTypes['32'])
              } else {
                logger.info(oneSkill[1].name + '| type:')
                logger.info(oneSkill[1].powerTypes)
              }
            }
            */

            skillID2IndexCN[oneSkill[2].id] = []
            skillID2IndexCN[oneSkill[2].id][0] = lineKey
            skillID2IndexCN[oneSkill[2].id][1] = classKey
            skillID2IndexCN[oneSkill[2].id][2] = skillKey
            skillID2IndexCN[oneSkill[2].id][3] = '2'
            skillID2IndexCN[oneSkill[2].id]["address"] = allSkillData[lineKey][classKey].name + indexStr
            //logger.info(skillID2IndexCN[oneSkill[2].id]["address"])
            /*
            if(!oneSkill[2].ultimate) {
              if(oneSkill[2].powerTypes['1'] > -1) {
                logger.info(oneSkill[2].name + '|type:1, cost:' + oneSkill[2].powerTypes['1'])
              } else if(oneSkill[2].powerTypes['4'] > -1) {
                logger.info(oneSkill[2].name + '|type:4, cost:' + oneSkill[2].powerTypes['4'])
              } else if(oneSkill[2].powerTypes['32'] > -1) {
                logger.info(oneSkill[2].name + '|type:32, cost:' + oneSkill[2].powerTypes['32'])
              } else {
                logger.info(oneSkill[2].name + '| type:')
                logger.info(oneSkill[2].powerTypes)
              }
            }
            */
          }
        }
      }
    }
    skillID2IndexCN.init = 'done'
  }

  async init_databaseDG () {
    if (numDungeons > 0)
    {
      //logger.info("DataBaseDG is ready, no need to update.")
      return
    }
    //logger.info("Init ESOdataBaseDG")

    var dgIndex = 0
    var keysSet = Object.keys(setsData)
    var numSets = keysSet.length

    for (let setKey of keysSet) {
      if(setsData[setKey].type == 8)
      {
        var indexInList = await this.isInList(setsData[setKey].place.split(',')[0], dgList)
        if(indexInList > -1)
        {
          dgSetsTable[indexInList][0] = setsData[setKey].id
          //logger.info("[Y][No." + dgIndex + "]" + setsData[setKey].place.split(',')[0] + "|" + setsDataCN[setsData[setKey].id].place.split(',')[0] + "|")
        }
        else
        {
          dgSetsTable[dgIndex][0] = setsData[setKey].id
          //logger.info("[N][No." + dgIndex + "]" + setsData[setKey].place.split(',')[0] + "|" + setsDataCN[setsData[setKey].id].place.split(',')[0] + "|")
          dgList[dgIndex] = setsData[setKey].place.split(',')[0]
        }
        dgIndex = dgIndex+1
        //logger.info("[No." + dgIndex + "]SetID:" + setKey + " " + setsData[setKey].name + " [" + setsData[setKey].place + "]")
        //logger.info("[No." + dgIndex + "]" + setsData[setKey].place.split(',')[0] + "|" + setsDataCN[setsData[setKey].id].place.split(',')[0] + "|")
        //logger.info(setsDataCN[setsData[setKey].id].bonuses)
      }
    }
    numDungeons = dgIndex
    //logger.info("[EN]Num of dungeons is " + numDungeons)
    
    for (let setKey of keysSet) {
      if(setsData[setKey].type == 6)
      {
        for (let setPlace of setsData[setKey].place.split(',')) {
          var indexInList = await this.isInList(setPlace, dgList)
          if(indexInList > -1)
          {
            if (setsData[setKey].styles.Apparel.Head.Light)
            {
              dgSetsTable[indexInList][1] = setsData[setKey].id
              //logger.info("[L]" + setsDataCN[setsData[setKey].id].name + "|" + setPlace)
            }
            if (setsData[setKey].styles.Apparel.Head.Medium)
            {
              dgSetsTable[indexInList][2] = setsData[setKey].id
              //logger.info("[M]" + setsDataCN[setsData[setKey].id].name + "|" + setPlace)
            }
            if (setsData[setKey].styles.Apparel.Head.Heavy)
            {
              dgSetsTable[indexInList][3] = setsData[setKey].id
              //logger.info("[H]" + setsDataCN[setsData[setKey].id].name + "|" + setPlace)
            }
          }
        }
      }
    }
  }

  async init_databaseEN () {
    //Update english sets database
    var keysSet = Object.keys(setsData)
    var numSets = keysSet.length
    if (numSets > 10)
    {
      //logger.info("DataBaseEN is ready, no need to update.")
    }
    else
    {    
      //logger.info("Init ESOdataBaseEN")
      var luaToJson = require('lua-to-json')
      var luaSrc = fs.readFileSync(dataExtractorItemsENPath, 'utf8')
      var lua_code = luaToJson(luaSrc)
      var allAccounts = lua_code.DataExtractorSavedVariables.Default
      var accounts = Object.keys(allAccounts)
      var account_index = 0

      for (let account of accounts) {
        account_index = account_index+1
        if (account_index > 1)
          break

        //logger.info(account)
        var aData = allAccounts[account]['$AccountWide']
        var itemsData = aData.dataItems
        setsData = itemsData['Sets']
        recipesData = itemsData['Recipes']
        furnituresData = itemsData['Furniture']
        collfurnituresData = itemsData['CollectibleFurniture']
      }
    }

    //Update english skills database
    var keysSkill = Object.keys(skillsData)
    var numSkills = keysSkill.length
    //logger.info(numSkills)
    if (numSkills > 3)
    {
      //logger.info("SkillsDataEN is ready, no need to update.")
    }
    else
    {
      //logger.info("Init ESOskillsDataEN")
      var luaToJson = require('lua-to-json')
      var luaSrc = fs.readFileSync(dataExtractorSkillsENPath, 'utf8')
      var lua_code = luaToJson(luaSrc)
      var allAccounts = lua_code.DataExtractorSavedVariables.Default
      var accounts = Object.keys(allAccounts)
      var account_index = 0

      for (let account of accounts) {
        account_index = account_index+1
        if (account_index > 1)
          break

        //logger.info(account)
        var aData = allAccounts[account]['$AccountWide']
        skillsData = aData['dataSkills']
        //logger.info(skillsData)
      }
    }
  }

  async init_databaseCN () {
    //Update chinses sets database
    var keysSet = Object.keys(setsDataCN)
    var numSets = keysSet.length

    if (numSets > 10)
    {
      //logger.info("DataBaseCN is ready, no need to update.")
    }
    else
    {
      //logger.info("Init ESOdataBaseCN")
      var luaToJson = require('lua-to-json')
      var luaSrc = fs.readFileSync(dataExtractorItemsCNPath, 'utf8')
      var lua_code = luaToJson(luaSrc)
      var allAccounts = lua_code.DataExtractorSavedVariables.Default
      var accounts = Object.keys(allAccounts)
      var account_index = 0

      for (let account of accounts) {
        account_index = account_index+1
        if (account_index > 1)
          break

        //logger.info(account)
        var aData = allAccounts[account]['$AccountWide']
        var itemsData = aData.dataItems
        setsDataCN = itemsData['Sets']
        recipesDataCN = itemsData['Recipes']
        furnituresDataCN = itemsData['Furniture']
        collfurnituresDataCN = itemsData['CollectibleFurniture']
      }
    }

    //Update chinses skills database
    var keysSkill = Object.keys(skillsDataCN)
    var numSkills = keysSkill.length
    //logger.info(numSkills)
    if (numSkills > 3)
    {
      //logger.info("SkillsDataCN is ready, no need to update.")
    }
    else
    {
      //logger.info("Init ESOskillsDataCN")
      var luaToJson = require('lua-to-json')
      var luaSrc = fs.readFileSync(dataExtractorSkillsCNPath, 'utf8')
      var lua_code = luaToJson(luaSrc)
      var allAccounts = lua_code.DataExtractorSavedVariables.Default
      var accounts = Object.keys(allAccounts)
      var account_index = 0

      for (let account of accounts) {
        account_index = account_index+1
        if (account_index > 1)
          break

        //logger.info(account)
        var aData = allAccounts[account]['$AccountWide']
        skillsDataCN = aData['dataSkills']
        //logger.info(skillsDataCN)
      }
    }
  }

  async setsName2Index (keyword) {
    objSets = [-1]
    let name = keyword
    let enEsologMode = false
    let enitemIDMode = false
    let enFindByPlace = true
    let enFindByMsg = true
    let enFindByType = false
    let onlyNormal = false
    let notAbbrSet = true
    let index = 0
    let isThisOne = false
    var keysSet = Object.keys(setsData)
    var numSets = keysSet.length
    let keyType = 0

    if(name.includes("ITEMID"))
    {
      enitemIDMode = true
      notAbbrSet = true
    }
    if(name.includes("ESOLOG"))
    {
      enEsologMode = true
      notAbbrSet = true
    }
    if(name.includes("图鉴") || name.includes("套装"))
    {
      enFindByPlace = true
      enFindByMsg = true
    }
    if(name.includes("熊头"))
    {
      enFindByPlace = false
      enFindByMsg = false
    }
    if(name.includes("普通"))
    {
      onlyNormal = true
    }
    if((name == "#神器") || (name == "#神器图鉴"))
    {
      enFindByType = true
      keyType = 12
    }
    if((name == "#怪物") || (name == "#怪物套") || (name == "#怪物图鉴") || (name == "#怪物套图鉴"))
    {
      enFindByType = true
      keyType = 8
    }
    name = name.replace("图鉴", "").replace("#", "").replace("套装", "").replace("套", "").replace("完美", "").replace("普通", "").replace("ESOLOG", "").replace("ITEMID", "").replace("英文", "").replace("英语", "")
    name = name.toLowerCase()
    if(name.length<4 && /^[A-Za-z]+$/.test(name))
    {
      notAbbrSet = false
    }

    if(name == "爬塔")
    {
      name = "无尽档案塔"
    }
    if('done' != addrSet[0].init)
    {
      let data = await Atlas.get(this.e, 'atlas', 'abbrSet', 'abbrSet')
      addrSet = data.atlasData
      //logger.info('[ESO:图鉴] 初始化装备别名对照表')
    }

    for (let setKey of keysSet) {
      isThisOne = false
      if(enitemIDMode)
      {
        //logger.info(setsData[setKey].itemIDs)
        if(setsData[setKey].itemIDs[name])
        {
          isThisOne = true
        }
      }
      else if(enEsologMode)
      {
        if((setsData[setKey].name).toLowerCase() == name)
        {
          isThisOne = true
        }
      }
      else
      {
        if(notAbbrSet && (setsDataCN[setsData[setKey].id].name).toLowerCase().includes(name))
        {
          isThisOne = true
        }
        if(notAbbrSet && (setsData[setKey].name).toLowerCase().includes(name))
        {
          isThisOne = true
        }
        if(enFindByPlace)
        {
          if(notAbbrSet && (setsDataCN[setsData[setKey].id].place.split(',')[0]).toLowerCase().includes(name))
          {
            isThisOne = true
          }
          if(notAbbrSet && (setsData[setKey].place.split(',')[0]).toLowerCase().includes(name))
          {
            isThisOne = true
          }
        }
        if(enFindByType)
        {
          if(keyType == 8)
          {
            if((setsData[setKey].type == 8) || (setsData[setKey].type == 13) ||(setsData[setKey].type == 14))
            {
              isThisOne = true
            }
          }
          else
          {
            if(setsData[setKey].type == keyType)
            {
              isThisOne = true
            }
          }
        }
      }

      let srcName = name
      let abbrIndex = -1
      if(!enEsologMode)
      {
        for (let eachAbbr of addrSet) {
          if(isThisOne)
          {
            break;
          }
          abbrIndex += 1
          if(abbrIndex > 0)
          {
            //logger.info(eachAbbr.name)
            for (let eachAbbrName of eachAbbr.abbr) {
              //logger.info('---'+eachAbbrName)
              if(eachAbbrName.toLowerCase().includes(name))
              {
                if((setsDataCN[setsData[setKey].id].name).toLowerCase().includes(eachAbbr.name))
                {
                  isThisOne = true
                  break;
                }
                if(enFindByPlace)
                {
                  if((setsDataCN[setsData[setKey].id].place.split(',')[0]).toLowerCase().includes(eachAbbr.name))
                  {
                    isThisOne = true
                    break;
                  }
                }
              }
            }
          }
        }
      }

      if(isThisOne)
      {
        objSets[index] = setKey
        index++
      }
    }
    let setNum = index

    //如果要求显示普通版本的装备，去除结果中的完美版本
    if(setNum > 1 && onlyNormal)
    {
      for (let i = 0; i < setNum; i++) {
        //logger.info('[' + i + '|' + objSets[i] + ']' + setsDataCN[objSets[i]].name)
        if(setsDataCN[objSets[i]].name.includes("完美"))
        {
          //logger.info('Delete [' + i + '|' + objSets[i] + ']' + setsDataCN[objSets[i]].name)
          objSets.splice(i, 1)
          i--
          setNum--
        }
      }
    }
    else if(setNum > 1)//对于有完美版本的装备，只保留完美版本
    {
      for (let i = 0; i < setNum; i++) {
        //logger.info('[' + i + '|' + objSets[i] + ']' + setsDataCN[objSets[i]].name)
        if(!setsDataCN[objSets[i]].name.includes("完美"))
        {
          let isNormal = false
          let tmpObjName = setsDataCN[objSets[i]].name
          tmpObjName = tmpObjName.replace("的", "").replace("的", "").replace("的", "")
          let tmpName = '完美' + tmpObjName
          for (let n = 0; n < setNum; n++) {
            if(tmpName == setsDataCN[objSets[n]].name.replace("的", "").replace("的", "").replace("的", "")){
              isNormal = true
              break
            }
          }
          if(isNormal)
          {
            //logger.info('Delete [' + i + '|' + objSets[i] + ']' + setsDataCN[objSets[i]].name)
            objSets.splice(i, 1)
            i--
            setNum--
          }
        }
      }
    }
  }

  async skillsName2Index (keyword, mode) {
    objSkills = [-1]
    let name = keyword
    let cnName = ''
    let cnWayOneName = ''
    let cnWayTwoName = ''
    /*
    let enFindByPlace = true
    let enFindByMsg = true
    let enFindByType = false
    */
    let enSkipVengeance = true
    let notAbbrSkill = true
    let index = 0
    let isThisOne = false    
    let allSkillData = []
    let allList = ""
    let baseIndex = 1
    let upgradeNUM = 0

    if(mode == 0 || mode == 2 || mode == 3)
    {
      //logger.info(name)
      name = name.replace("图鉴", "").replace("#", "").replace("*", "").replace("技能线", "").replace("技能", "").replace("英文", "").replace("英语", "")
      name = name.toLowerCase()
      name = name.replace("工会", "公会").replace("斗会", "斗士公会").replace("法会", "法师公会").replace("战会", "斗士公会").replace("战士公会", "斗士公会")
      name = name.replace("奶杖", "恢复法杖").replace("奶棒", "恢复法杖").replace("治疗杖", "恢复法杖").replace("剑盾", "单手武器与盾牌").replace("单手配盾", "单手武器与盾牌")
      if(mode!=3)
      {
        name = name.replace("10", "十").replace("1", "一").replace("2", "二").replace("3", "三").replace("4", "四").replace("5", "五").replace("6", "六").replace("7", "七").replace("8", "八").replace("9", "九")
      }
      name = name.replace("猫猫", "虎人").replace("猫人", "虎人").replace("帝国", "帝都").replace("帝国", "帝都").replace("帝国人", "帝都").replace("帝都人", "帝都")
      if(name.includes('杖') || name.includes('大') || name.includes('一') || name.includes('二') || name.includes('三') || name.includes('四') || name.includes('五') || name.includes('六'))
      {
        name = name.replace("毁灭杖", "毁灭法杖")
        if(!name.includes('杖'))
        {
          name = name.replace("毁灭", "毁灭法杖")
        }
      }
      if(name.includes('炼金'))
      {
        if(!name.includes('术'))
        {
          name = name.replace("炼金", "炼金术")
        }
      }
      name = name.replace("赛伊克", "塞伊克").replace("赛一克", "塞伊克").replace("赛一刻", "塞伊克").replace("塞一刻", "塞伊克").replace("塞一克", "塞伊克").replace("伊拉克", "塞伊克")
      if(name.includes('塞伊克'))
      {
        if(!name.includes('教团'))
        {
          name = name.replace("塞伊克", "塞伊克教团")
        }
      }
      if(name.length<4 && /^[A-Za-z]+$/.test(name))
      {
        notAbbrSkill = false
      }
      if(name.includes('复仇') || name.includes('vengeance'))
      {
        enSkipVengeance = false
      }
      if('done' != addrSkill[0].init)
      {
        let data = await Skills.get(this.e, 'skills', 'abbrSkill', 'abbrSkill')
        addrSkill = data.atlasData
        //logger.info('[ESO:图鉴] 初始化技能别名对照表')
      }
    }

    if(mode == 1)//根据ID寻找中文索引
    {
      allSkillData = skillsDataCN

    }else
    {
      allSkillData = skillsData
    }
    var keysLine = Object.keys(allSkillData)
    var numLines = keysLine.length

    isThisOne = false
    allList = ''
    for (let lineKey of keysLine) {
      if(lineKey == 9)
      {
        continue
      }

      //logger.info('---' + allSkillData[lineKey].name)
      var keysClass = Object.keys(allSkillData[lineKey])
      var numClass = keysClass.length
      for (let classKey of keysClass) {
        if(classKey == "name")
        {
          continue
        }
        //logger.info('       |---' + allSkillData[lineKey][classKey].name)
        if(enSkipVengeance && (allSkillData[lineKey][classKey].name.includes("Vengeance") || allSkillData[lineKey][classKey].name.includes("复仇")))
        {
          continue
        }
        var keysSkill = Object.keys(allSkillData[lineKey][classKey].skills)
        var numSkill = keysSkill.length
        for (let skillKey of keysSkill) {
          if(skillKey == "name" || skillKey == "id" || allSkillData[lineKey][classKey].skills[skillKey].id == 0)
          {
            continue
          }
          var oneSkill = allSkillData[lineKey][classKey].skills[skillKey]
          if(mode == 1) //根据ID匹配
          {
            if(oneSkill.id == name)
            {
              isThisOne = true
              objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_0'
              index++
              //logger.info('              |---[' + lineKey + '_' + classKey + '_' + skillKey + '_0|' + oneSkill.id + ']' + oneSkill.name)
            }
            if(oneSkill.passive == false && oneSkill['1'])
            {
              if(oneSkill[1].id == name)
              {
                isThisOne = true
                objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_1'
                index++
                //logger.info('                     |---[' + lineKey + '_' + classKey + '_' + skillKey + '_1|' + oneSkill[1].id + ']' + oneSkill[1].name)
              }
              if(oneSkill[2].id == name)
              {
                isThisOne = true
                objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_2'
                index++
                //logger.info('                     |---[' + lineKey + '_' + classKey + '_' + skillKey + '_2|' + oneSkill[2].id + ']' + oneSkill[2].name)
              }
            }
          }
          else if(mode == 0) //根据名称匹配
          {
            upgradeNUM = 0
            let cnID = skillID2IndexCN[oneSkill.id]
            let cnWayOneID = 0
            let cnWayTwoID = 0
            if(cnID[3] == '0')
            {
              cnName = skillsDataCN[cnID[0]][cnID[1]].skills[cnID[2]].name
            }
            else
            {
              cnName = skillsDataCN[cnID[0]][cnID[1]].skills[cnID[2]][cnID[3]].name
            }
            if(oneSkill.passive == false && oneSkill['1'])
            {
              cnWayOneID = skillID2IndexCN[oneSkill[1].id]
              if(cnWayOneID[3] == '0')
              {
                cnWayOneName = skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].skills[cnWayOneID[2]].name
              }
              else
              {
                cnWayOneName = skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].skills[cnWayOneID[2]][cnWayOneID[3]].name
              }
              //--------------------------------------------------
              cnWayTwoID = skillID2IndexCN[oneSkill[2].id]
              if(cnWayTwoID[3] == '0')
              {
                cnWayTwoName = skillsDataCN[cnWayTwoID[0]][cnWayTwoID[1]].skills[cnWayTwoID[2]].name
              }
              else
              {
                cnWayTwoName = skillsDataCN[cnWayTwoID[0]][cnWayTwoID[1]].skills[cnWayTwoID[2]][cnWayTwoID[3]].name
              }
            }

            /*
            if(oneSkill.passive == false && oneSkill['1'])
            {
              baseIndex = 1
              if(skillsDataCN[cnWayTwoID[0]][cnWayTwoID[1]].skills['1'].ultimate)
              {
                if(skillsDataCN[cnWayTwoID[0]][cnWayTwoID[1]].skills['2'].id)
                {
                  baseIndex = 1
                }
                else if(skillsDataCN[cnWayTwoID[0]][cnWayTwoID[1]].skills['3'].id)
                {
                  baseIndex = 2
                }
                else if(skillsDataCN[cnWayTwoID[0]][cnWayTwoID[1]].skills['4'].id)
                {
                  baseIndex = 3
                }
                else if(skillsDataCN[cnWayTwoID[0]][cnWayTwoID[1]].skills['5'].id)
                {
                  baseIndex = 4
                }
              }
              //--------------------------------------------------------
              allList += '- name: "' + oneSkill.name + '"\n'
              allList += '  cnName: "' + cnName + '"\n'
              allList += '  abbr:\n'
              if(oneSkill.ultimate)
              {
                allList += '    - "' + skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].name + '大招"\n'
              }
              else
              {
                let thisIndex = cnWayOneID[2] - baseIndex
                allList += '    - "' + skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].name + thisIndex + '"\n'
              }
              //--------------------------------------------------------
              allList += '- name: "' + oneSkill[1].name + '"\n'
              allList += '  cnName: "' + cnWayOneName + '"\n'
              allList += '  abbr:\n'
              if(oneSkill.ultimate)
              {
                allList += '    - "' + skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].name + '大招"\n'
              }
              else
              {
                let thisIndex = cnWayOneID[2] - baseIndex
                allList += '    - "' + skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].name + thisIndex + '"\n'
              }
              //--------------------------------------------------------
              allList += '- name: "' + oneSkill[2].name + '"\n'
              allList += '  cnName: "' + cnWayTwoName + '"\n'
              allList += '  abbr:\n'
              if(oneSkill.ultimate)
              {
                allList += '    - "' + skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].name + '大招"\n'
              }
              else
              {
                let thisIndex = cnWayOneID[2] - baseIndex
                allList += '    - "' + skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].name + thisIndex + '"\n'
              }
              //--------------------------------------------------------
            }
            */
            /*
            if(notAbbrSkill && (oneSkill.name.toLowerCase().includes(name) || cnName.includes(name) || skillsData[lineKey][classKey].name.toLowerCase().includes(name) || skillsDataCN[cnID[0]][cnID[1]].name.toLowerCase().includes(name) || cnID["address"].includes(name)))
            {
              isThisOne = true
              objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_0'
              index++
              //logger.info('              |---[' + lineKey + '_' + classKey + '_' + skillKey + '_0|' + oneSkill.id + ']' + oneSkill.name + '|' + cnName)
            }
            else
            {
              isThisOne = false
              let srcName = name
              let abbrIndex = -1
              for (let eachAbbr of addrSkill) {
                if(isThisOne)
                {
                  break;
                }
                abbrIndex += 1
                if(abbrIndex > 0)
                {
                  //logger.info(eachAbbr.name)
                  for (let eachAbbrName of eachAbbr.abbr) {
                    //logger.info('---'+eachAbbrName)
                    if(eachAbbrName.toLowerCase().includes(name))
                    {
                      if(oneSkill.name.toLowerCase() == eachAbbr.name.toLowerCase())
                      {
                        isThisOne = true
                        objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_0'
                        index++
                        break;
                      }
                    }
                  }
                }
              }
            }
            */
            if(oneSkill.passive == false && oneSkill['1'])
            {
              if(notAbbrSkill && (oneSkill[1].name.toLowerCase().includes(name) || cnWayOneName.includes(name) || skillsData[lineKey][classKey].name.toLowerCase().includes(name) || skillsDataCN[cnWayOneID[0]][cnWayOneID[1]].name.toLowerCase().includes(name) || cnWayOneID["address"].includes(name)))
              {
                isThisOne = true
                objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_1'
                upgradeNUM++
                index++
                //logger.info('                     |---[' + lineKey + '_' + classKey + '_' + skillKey + '_1|' + oneSkill[1].id + ']' + oneSkill[1].name + '|' + cnWayOneName)
              }
              else
              {
                isThisOne = false
                let srcName = name
                let abbrIndex = -1
                for (let eachAbbr of addrSkill) {
                  if(isThisOne)
                  {
                    break;
                  }
                  abbrIndex += 1
                  if(abbrIndex > 0)
                  {
                    //logger.info(eachAbbr.name)
                    for (let eachAbbrName of eachAbbr.abbr) {
                      //logger.info('---'+eachAbbrName)
                      if(eachAbbrName.toLowerCase().includes(name))
                      {
                        if(oneSkill[1].name.toLowerCase() == eachAbbr.name.toLowerCase())
                        {
                          isThisOne = true
                          objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_1'
                          upgradeNUM++
                          index++
                          break;
                        }
                      }
                    }
                  }
                }
              }

              if(notAbbrSkill && (oneSkill[2].name.toLowerCase().includes(name) || cnWayTwoName.includes(name) || skillsData[lineKey][classKey].name.toLowerCase().includes(name) || skillsDataCN[cnWayTwoID[0]][cnWayTwoID[1]].name.toLowerCase().includes(name) || cnWayTwoID["address"].includes(name)))
              {
                isThisOne = true
                objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_2'
                upgradeNUM++
                index++
                //logger.info('                     |---[' + lineKey + '_' + classKey + '_' + skillKey + '_2|' + oneSkill[2].id + ']' + oneSkill[2].name + '|' + cnWayTwoName)
              }
              else
              {
                isThisOne = false
                let srcName = name
                let abbrIndex = -1
                for (let eachAbbr of addrSkill) {
                  if(isThisOne)
                  {
                    break;
                  }
                  abbrIndex += 1
                  if(abbrIndex > 0)
                  {
                    //logger.info(eachAbbr.name)
                    for (let eachAbbrName of eachAbbr.abbr) {
                      //logger.info('---'+eachAbbrName)
                      if(eachAbbrName.toLowerCase().includes(name))
                      {
                        if(oneSkill[2].name.toLowerCase() == eachAbbr.name.toLowerCase())
                        {
                          isThisOne = true
                          objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_2'
                          upgradeNUM++
                          index++
                          break;
                        }
                      }
                    }
                  }
                }
              }
            }
            if(upgradeNUM != 2)
            {
              if(notAbbrSkill && (oneSkill.name.toLowerCase().includes(name) || cnName.includes(name) || skillsData[lineKey][classKey].name.toLowerCase().includes(name) || skillsDataCN[cnID[0]][cnID[1]].name.toLowerCase().includes(name) || cnID["address"].includes(name)))
              {
                isThisOne = true
                objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_0'
                index++
                //logger.info('              |---[' + lineKey + '_' + classKey + '_' + skillKey + '_0|' + oneSkill.id + ']' + oneSkill.name + '|' + cnName)
              }
              else
              {
                isThisOne = false
                let srcName = name
                let abbrIndex = -1
                for (let eachAbbr of addrSkill) {
                  if(isThisOne)
                  {
                    break;
                  }
                  abbrIndex += 1
                  if(abbrIndex > 0)
                  {
                    //logger.info(eachAbbr.name)
                    for (let eachAbbrName of eachAbbr.abbr) {
                      //logger.info('---'+eachAbbrName)
                      if(eachAbbrName.toLowerCase().includes(name))
                      {
                        if(oneSkill.name.toLowerCase() == eachAbbr.name.toLowerCase())
                        {
                          isThisOne = true
                          objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_0'
                          index++
                          break;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          else if(mode == 2) //根据ESOLOG匹配英文名称
          {
            if(oneSkill.name.toLowerCase() == name)
            {
              isThisOne = true
              objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_0'
              index++
              //logger.info('              |---[' + lineKey + '_' + classKey + '_' + skillKey + '_0|' + oneSkill.id + ']' + oneSkill.name)
            }
            if(oneSkill.passive == false && oneSkill['1'])
            {
              if(oneSkill[1].name.toLowerCase() == name)
              {
                isThisOne = true
                objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_1'
                index++
                //logger.info('                     |---[' + lineKey + '_' + classKey + '_' + skillKey + '_1|' + oneSkill[1].id + ']' + oneSkill[1].name)
              }
              if(oneSkill[2].name.toLowerCase() == name)
              {
                isThisOne = true
                objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_2'
                index++
                //logger.info('                     |---[' + lineKey + '_' + classKey + '_' + skillKey + '_2|' + oneSkill[2].id + ']' + oneSkill[2].name)
              }
            }
          }
          else if(mode == 3) //根据ESOLOG匹配图标
          {
            if(oneSkill.icon.split('icons/')[1].split('.')[0] == name)
            {
              isThisOne = true
              objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_0'
              index++
              //logger.info('              |---[' + lineKey + '_' + classKey + '_' + skillKey + '_0|' + oneSkill.id + ']' + oneSkill.name)
            }
            if(oneSkill.passive == false && oneSkill['1'])
            {
              if(oneSkill[1].icon.split('icons/')[1].split('.')[0] == name)
              {
                isThisOne = true
                objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_1'
                index++
                //logger.info('                     |---[' + lineKey + '_' + classKey + '_' + skillKey + '_1|' + oneSkill[1].id + ']' + oneSkill[1].name)
              }
              if(oneSkill[2].icon.split('icons/')[1].split('.')[0] == name)
              {
                isThisOne = true
                objSkills[index] = lineKey + '_' + classKey + '_' + skillKey + '_2'
                index++
                //logger.info('                     |---[' + lineKey + '_' + classKey + '_' + skillKey + '_2|' + oneSkill[2].id + ']' + oneSkill[2].name)
              }
            }
          }
        }
      }
    }
    //logger.info(allList)
  }

  async name2index (name, type) {
    await this.init_database()
    let ret = []
    if(type == 1) //this is name for sets
    {
      await this.setsName2Index(name)
      return objSets
    }
    if(type == 2) //this is name for skills
    {
      await this.skillsName2Index(name, 0)
      return objSkills
    }

    return ret
  }

  async updateSetData (setKey, showEnglish) {
    if('done' != setData.init)
    {
      let data = await Atlas.get(this.e, 'atlas', 'set', 'sets')
      if (!data)
      {
        logger.error('[ESO:图鉴] 初始化结构体失败')
        return
      }
      setData = data
      //logger.info('[ESO:图鉴] 初始化结构体变量')
    }

    setData.atlasData[1].name = setsDataCN[setsData[setKey].id].name
    setData.atlasData[1].name_en = '<'+setsData[setKey].name+'>'
    setData.atlasData[1].item_class = setsData[setKey].type
    setData.atlasData[1].type = setType[setsData[setKey].type - 1]

    if(setsData[setKey].type == 3)
    {
      setData.atlasData[1].weight = '自选护甲类型'
      setData.atlasData[1].icon = setsData[setKey].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
    }
    else if((setsData[setKey].type == 8) || (setsData[setKey].type == 13) || (setsData[setKey].type == 14))
    {
      setData.atlasData[1].weight = '随机护甲类型'
      setData.atlasData[1].icon = setsData[setKey].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
    }
    else
    {
      let tag = 0
      if (setsData[setKey].styles.Apparel)
      {
        if (setsData[setKey].styles.Apparel.Head)
        {
          if (setsData[setKey].styles.Apparel.Head.Heavy)
          {
            tag += 1
          }
          if (setsData[setKey].styles.Apparel.Head.Medium)
          {
            tag += 2
          }
          if (setsData[setKey].styles.Apparel.Head.Light)
          {
            tag += 4
          }
        }
        else
        {
          tag += 32
        }
      }
      else if (setsData[setKey].styles.Weapon)
      {
        tag += 8
      }
      else
      {
        tag += 16
      }

      if(tag == 1)
      {
        setData.atlasData[1].weight = '重甲'
        setData.atlasData[1].icon = setsData[setKey].styles.Apparel.Head.Heavy.icon.split('.')[0].split('icons/')[1]
      }
      else if(tag == 2)
      {
        setData.atlasData[1].weight = '中甲'
        setData.atlasData[1].icon = setsData[setKey].styles.Apparel.Head.Medium.icon.split('.')[0].split('icons/')[1]
      }
      else if(tag == 4)
      {
        setData.atlasData[1].weight = '轻甲'
        setData.atlasData[1].icon = setsData[setKey].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      }
      else if(tag == 7)
      {
        setData.atlasData[1].weight = '随机护甲类型'
        setData.atlasData[1].icon = setsData[setKey].styles.Apparel.Head.Light.icon.split('.')[0].split('icons/')[1]
      }
      else if(tag == 32)
      {
        tag = 0
        setData.atlasData[1].weight = ''
        let apparelInfo = setsData[setKey].styles.Apparel
        var keysApparelInfo = Object.keys(apparelInfo)
        for (let apparelWeight of keysApparelInfo) {
          //logger.info(apparelInfo[apparelWeight])
          let apparelMsg = apparelInfo[apparelWeight]
          var keysApparelMsg = Object.keys(apparelMsg)
          for (let apparelType of keysApparelMsg) {
            if(apparelType == 'Heavy')
            {
              tag += 1
            }
            if(apparelType == 'Medium')
            {
              tag += 2
            }
            if(apparelType == 'Light')
            {
              tag += 4
            }
            //logger.info(apparelMsg[apparelType])
            setData.atlasData[1].icon = apparelMsg[apparelType].icon.split('.')[0].split('icons/')[1]
          }
        }
        if(tag == 1)
        {
          setData.atlasData[1].weight = '重甲'
        }
        else if (tag == 2)
        {
          setData.atlasData[1].weight = '中甲'
        }
        else if(tag == 4)
        {
          setData.atlasData[1].weight = '轻甲'
        }
        else if(tag == 7)
        {
          setData.atlasData[1].weight = '随机护甲类型'
        }
        else
        {
          if (setsData[setKey].styles.Weapon)
          {
            setData.atlasData[1].weight = '护符,武器'
          }
          else
          {
            setData.atlasData[1].weight = '护符'
          }
        }
      }
      else if(tag == 8)
      {
        setData.atlasData[1].weight = '武器'
        let weaponInfo = setsData[setKey].styles.Weapon
        var keysWeaponInfo = Object.keys(weaponInfo)
        for (let weaponWeight of keysWeaponInfo) {
          //logger.info(weaponInfo[weaponWeight])
          let weaponMsg = weaponInfo[weaponWeight]
          var keysWeaponMsg = Object.keys(weaponMsg)
          for (let weaponType of keysWeaponMsg) {
            //logger.info(weaponMsg[weaponType])
            setData.atlasData[1].icon = weaponMsg[weaponType].icon.split('.')[0].split('icons/')[1]
          }
        }
      }
      else
      {
        setData.atlasData[1].weight = ''
      }
    }     

    if(setsData[setKey].type == 12)
    {
      setData.atlasData[1].place = '考古'
      setData.atlasData[1].place_en = ''
    }
    else if(setsData[setKey].type == 2)
    {
      setData.atlasData[1].place = '角斗场'
      setData.atlasData[1].place_en = ''
    }
    else if(setsData[setKey].type == 6)
    {
      setData.atlasData[1].place = (setsDataCN[setsData[setKey].id].place.split(',')[0]).replace(" II", "").replace(" I", "")
      setData.atlasData[1].place_en = (setsData[setKey].place.split(',')[0]).replace(" II", "").replace(" I", "")
    }
    else
    {
      setData.atlasData[1].place = setsDataCN[setsData[setKey].id].place.split(',')[0]
      setData.atlasData[1].place_en = setsData[setKey].place.split(',')[0]
    }

    if(showEnglish)
    {
      setData.atlasData[1].msg = await this.bonuses2msg(setsData[setKey].bonuses)
    }
    else
    {
      setData.atlasData[1].msg = await this.bonuses2msg(setsDataCN[setsData[setKey].id].bonuses)
    }
    
    /*
      icon: gear_dunmer_heavy_head_d
      name: "中士的锁甲"
      name_en: "<Sergeant's Mail>"
      item_class: item_dungeon
      weight: "重甲"
      type: "副本"
      type_en: "<dungeon>"
      place: "途歇城下水道"
      place_en: "<Wayrest Sewers>"
      msg:
    */

    let isExist = "不存在"
    let imgPath = `./plugins/eso/resources/img/sets/${setData.atlasData[1].icon}.png`
    if (fs.existsSync(imgPath)) {
      isExist = "存在"
      //logger.info("["+setData.atlasData[1].item_class+" " + setData.atlasData[1].type +  "]<" + setData.atlasData[1].weight + ">" + setData.atlasData[1].name+setData.atlasData[1].name_en+" | " + setData.atlasData[1].icon + " | " + isExist)
    }
    else
    {
      let url = `https://eso-hub.com/storage/icons/${setData.atlasData[1].icon}.png`
      let dstpath = `./plugins/eso/resources/img/sets/${setData.atlasData[1].icon}.png`
      let ret = await Bot.download(url, dstpath)
      //logger.info("["+setData.atlasData[1].item_class+" " + setData.atlasData[1].type +  "]<" + setData.atlasData[1].weight + ">" + setData.atlasData[1].name+setData.atlasData[1].name_en+" | " + setData.atlasData[1].icon + " | " + isExist)
    }
    //logger.info("["+setData.atlasData[1].item_class+" " + setData.atlasData[1].type +  "]<" + setData.atlasData[1].weight + ">" + setData.atlasData[1].name+setData.atlasData[1].name_en+" | " + setData.atlasData[1].place + "<"+setData.atlasData[1].place_en+"> | " + setData.atlasData[1].icon)
  }

  async updateSkillData (objects, showEnglish) {
    let enID = []
    let cnID = []
    let newENSkillData = []
    let newCNSkillData = []
    let srcENSkillData = []
    let srcCNSkillData = []

    //logger.info(objects)

    if('done' != skillData.init)
    {
      let data = await Skills.get(this.e, 'skills', 'skill', 'skills')
      if (!data)
      {
        logger.error('[ESO:图鉴] 初始化技能结构体失败')
        return
      }
      skillData = data
      logger.info('[ESO:图鉴] 初始化技能结构体变量')
    }

    enID = objects.split('_')

    if(enID[3] == '0')
    {
      newENSkillData = skillsData[enID[0]][enID[1]].skills[enID[2]]
      cnID = skillID2IndexCN[newENSkillData.id]
      newCNSkillData = skillsDataCN[cnID[0]][cnID[1]].skills[cnID[2]]
    }
    else
    {
      newENSkillData = skillsData[enID[0]][enID[1]].skills[enID[2]][enID[3]]
      cnID = skillID2IndexCN[newENSkillData.id]
      newCNSkillData = skillsDataCN[cnID[0]][cnID[1]].skills[cnID[2]][cnID[3]]
    }
    srcENSkillData = skillsData[enID[0]][enID[1]].skills[enID[2]]
    srcCNSkillData = skillsDataCN[cnID[0]][cnID[1]].skills[cnID[2]]

    /*
    logger.info(srcENSkillData.name)
    logger.info(srcCNSkillData.name)
    logger.info(newENSkillData.name)
    logger.info(newCNSkillData.name)
    */
    
    skillData.atlasData[1].src_icon = srcENSkillData.icon.split('.')[0].split('icons/')[1]
    skillData.atlasData[1].new_icon = newENSkillData.icon.split('.')[0].split('icons/')[1]
    let isExist = "不存在"
    let imgPath = `./plugins/eso/resources/img/skills/${skillData.atlasData[1].src_icon}.png`
    if (fs.existsSync(imgPath)) {
      isExist = "存在"
    }
    else
    {
      let url = `https://eso-hub.com/storage/icons/${skillData.atlasData[1].src_icon}.png`
      let dstpath = `./plugins/eso/resources/img/skills/${skillData.atlasData[1].src_icon}.png`
      let ret = await Bot.download(url, dstpath)
    }

    imgPath = `./plugins/eso/resources/img/skills/${skillData.atlasData[1].new_icon}.png`
    if (fs.existsSync(imgPath)) {
      isExist = "存在"
    }
    else
    {
      let url = `https://eso-hub.com/storage/icons/${skillData.atlasData[1].new_icon}.png`
      let dstpath = `./plugins/eso/resources/img/skills/${skillData.atlasData[1].new_icon}.png`
      let ret = await Bot.download(url, dstpath)
    }

    skillData.atlasData[1].src_cn_name = srcCNSkillData.name
    skillData.atlasData[1].src_en_name = '<' + srcENSkillData.name + '>'

    skillData.atlasData[1].new_cn_name = newCNSkillData.name
    skillData.atlasData[1].new_en_name = '<' + newENSkillData.name + '>'

    skillData.atlasData[1].type_cn = skillsDataCN[cnID[0]].name
    
    if(cnID['address'].includes("复仇"))
    {
      skillData.atlasData[1].type_en = "限时白板PVP区域专用技能"
    }
    else
    {
      skillData.atlasData[1].type_en = skillsData[enID[0]].name
    }

    skillData.atlasData[1].place_cn = cnID['address']
    skillData.atlasData[1].place_en = skillsData[enID[0]][enID[1]].name

    if(enID[3] == '0')
    {
      skillData.atlasData[1].src_Skills_class = 'src_Skills_middle_class'
      skillData.atlasData[1].arrow_class = 'arrow_class_hide'
      skillData.atlasData[1].new_Skills_class = 'new_Skills_class_hide'
    }
    else
    {
      skillData.atlasData[1].src_Skills_class = 'src_Skills_left_class'
      skillData.atlasData[1].arrow_class = 'arrow_class_show'
      skillData.atlasData[1].new_Skills_class = 'new_Skills_class_show'
    }

    if(newENSkillData.passive == false)
    {
      skillData.atlasData[1].parameter_class = 'parameter_class_show'
    }
    else
    {
      skillData.atlasData[1].parameter_class = 'parameter_class_hide'
    }

    //logger.info(newCNSkillData)
    let msgData = newCNSkillData
    if(showEnglish)
    {
      msgData = newENSkillData
    }
    if(enID[3] != '0' && (newENSkillData.passive == false))
    {
      skillData.atlasData[1].new_msg = await this.transColor(msgData.newEffect)
    }
    else
    {
      skillData.atlasData[1].new_msg = ''
    }
    
    let is_repeat = true
    skillData.atlasData[1].msg = []
    if((newENSkillData.passive == false) || msgData['2'] == undefined)
    {
      skillData.atlasData[1].msg[0] = await this.transColor(msgData.description)
    }
    else
    {
      var baseMsg = await this.transColor(msgData.description)
      let mIndex = 0
      let mIn = 0
      is_repeat = false
      for (mIndex = 2; mIndex < 20; mIndex++) {
        if(msgData[mIndex]!= undefined)
        {
          if(baseMsg == msgData[mIndex].description)
          {
            is_repeat = true
          }
        }
      }
      mIn = 0
      if(!is_repeat)
      {
        skillData.atlasData[1].msg[mIn] = skillMsgIndex[mIn] + ': ' + await this.transColor(msgData.description)
        mIn++
      }
      for (mIndex = 2; mIndex < 20; mIndex++) {
        if(msgData[mIndex]!= undefined)
        {
          skillData.atlasData[1].msg[mIn] = skillMsgIndex[mIn] + ': ' + await this.transColor(msgData[mIndex].description)
          mIn++
        }
      }
    }
    
    skillData.atlasData[1].p_name = []
    skillData.atlasData[1].p_value = []

    let index = 0
    /*---------------------------------------------------------------*/
    skillData.atlasData[1].p_name[index] = '消耗'
    skillData.atlasData[1].cost_color = "rgb(204, 204, 204)"
    if(newCNSkillData.ultimate)
    {
      skillData.atlasData[1].p_value[index] = newCNSkillData.cost + ' 终极点'
      skillData.atlasData[1].cost_color = "rgb(240, 240, 240)"
    }
    else
    {
      if(newCNSkillData.powerTypes)
      {
        //logger.info(newCNSkillData.powerTypes)
        if(newCNSkillData.powerTypes['1'] > -1) {
          skillData.atlasData[1].p_value[index] = newCNSkillData.cost + ' 魔力'
          skillData.atlasData[1].cost_color = "rgb(58, 146, 254)"
        } else if(newCNSkillData.powerTypes['4'] > -1) {
          skillData.atlasData[1].p_value[index] = newCNSkillData.cost + ' 耐力'
          skillData.atlasData[1].cost_color = "rgb(47, 213, 14)"
        } else if(newCNSkillData.powerTypes['32'] > -1) {
          skillData.atlasData[1].p_value[index] = newCNSkillData.cost + ' 生命'
          skillData.atlasData[1].cost_color = "rgb(227, 36, 33)"
        } else {
          skillData.atlasData[1].p_value[index] = newCNSkillData.cost
        }
      }
      else
      {
        skillData.atlasData[1].p_value[index] = newCNSkillData.cost
      }
    }
    index++
    /*---------------------------------------------------------------*/
    skillData.atlasData[1].p_name[index] = '施法时间'
    if(newCNSkillData.castTime > 0)
    {
      skillData.atlasData[1].p_value[index] = newCNSkillData.castTime/1000 + '秒'
    }
    else
    {
      skillData.atlasData[1].p_value[index] = '瞬发'
    }
    
    index++
    /*---------------------------------------------------------------*/
    skillData.atlasData[1].p_name[index] = '目标'
    skillData.atlasData[1].p_value[index] = newCNSkillData.target
    index++
    /*---------------------------------------------------------------*/
    if(newCNSkillData.duration > 0)
    {
      skillData.atlasData[1].p_name[index] = '持续时间'
      skillData.atlasData[1].p_value[index] = newCNSkillData.duration/1000 + '秒'
      index++
    }
    /*---------------------------------------------------------------*/
    if(newCNSkillData.radius > 0)
    {
      skillData.atlasData[1].p_name[index] = '技能范围'
      skillData.atlasData[1].p_value[index] = newCNSkillData.radius/100 + '米'
      index++
    }
    /*---------------------------------------------------------------*/
    if(newCNSkillData.maxRange > 0)
    {
      skillData.atlasData[1].p_name[index] = '施法距离'
      skillData.atlasData[1].p_value[index] = newCNSkillData.maxRange/100 + '米'
      index++
    }
    /*---------------------------------------------------------------*/
  }

  async updateBuildData (BD) {
    if('done' != buildData.init)
    {
      let data = await Builds.get(this.e, 'builds', 'build', 'builds')
      if (!data)
      {
        logger.error('[ESO:图鉴] 初始化结构体失败')
        return
      }
      buildData = data
    }

    buildData.buildsData[1].head_title = "Build Info from www.esolog.com created by " + BD.playerName + BD.accountName
    buildData.buildsData[1].title = BD.playerName + BD.accountName

    for (let i = 0; i < 14; i++) {
      buildData.buildsData[1].gear[i].name_cn = 'N/A'
      buildData.buildsData[1].gear[i].name_en = ''
      buildData.buildsData[1].gear[i].trait = 'N/A'
      buildData.buildsData[1].gear[i].enchant = 'N/A'
      buildData.buildsData[1].gear[i].level_class = 'none'
      buildData.buildsData[1].gear[i].enchantColor = 'rgb(170, 170, 170)'
      buildData.buildsData[1].gear[i].type_color = 'rgb(221, 221, 221)'
      buildData.buildsData[1].gear[i].color = 'rgb(170, 170, 170)'
      buildData.buildsData[1].gear[i].icon = 'transparent'
    }

    buildData.buildsData[1].gear[0].slot = '头部'
    buildData.buildsData[1].gear[1].slot = '肩部'
    buildData.buildsData[1].gear[2].slot = '胸部'
    buildData.buildsData[1].gear[3].slot = '手部'
    buildData.buildsData[1].gear[4].slot = '腰部'
    buildData.buildsData[1].gear[5].slot = '腿部'
    buildData.buildsData[1].gear[6].slot = '脚部'
    buildData.buildsData[1].gear[7].slot = '项链'
    buildData.buildsData[1].gear[8].slot = '戒指1'
    buildData.buildsData[1].gear[9].slot = '戒指2'
    buildData.buildsData[1].gear[10].slot = '主手'
    buildData.buildsData[1].gear[11].slot = '副手'
    buildData.buildsData[1].gear[12].slot = '备用主手'
    buildData.buildsData[1].gear[13].slot = '备用副手'

    for (let i = 0; i < 2; i++) {
      for (let m = 0; m < 6; m++) {
        buildData.buildsData[1].spell[i].bar[m].icon = 'empty'
        buildData.buildsData[1].spell[i].bar[m].color = 'rgb(170, 170, 170)'
        buildData.buildsData[1].spell[i].bar[m].name = 'N/A'
        buildData.buildsData[1].spell[i].bar[m].address = ' '
      }
    }

    for (let GI of BD.gearData) {
      let index = -1;
      let error_set = 0;
      let slot = ''
      let set_type = 0;
      //logger.info(GI)

      if(GI.slot == 'Head'){index = 0; set_type = 0}
      if(GI.slot == 'Shoulders'){index = 1; set_type = 0}
      if(GI.slot == 'Chest'){index = 2; set_type = 0}
      if(GI.slot == 'Hands'){index = 3; set_type = 0}
      if(GI.slot == 'Waist'){index = 4; set_type = 0}
      if(GI.slot == 'Legs'){index = 5; set_type = 0}
      if(GI.slot == 'Feet'){index = 6; set_type = 0}
      if(GI.slot == 'Neck'){index = 7; set_type = 1}
      if(GI.slot == 'Ring 1'){index = 8; set_type = 1}
      if(GI.slot == 'Ring 2'){index = 9; set_type = 1}
      if(GI.slot == 'Main Hand'){index = 10; set_type = 2}
      if(GI.slot == 'Off Hand'){index = 11; set_type = 2}
      if(GI.slot == 'Main Hand Backup'){index = 12; set_type = 2}
      if(GI.slot == 'Off Hand Backup'){index = 13; set_type = 2}
      if(GI.type == 'Shield'){set_type = 0}

      if(index == -1)
      {
        continue;
      }

      let objSets = await this.name2index('ESOLOG'+GI.set,1)
      let setNum = objSets.length
      let itemIDMode = false
      if(setNum == 0 || objSets[0] == -1)
      {
        if(GI.name['link'].includes('?pcs='))
        {
          //logger.info(GI.name['link'])
          let setID = GI.name['link'].match(/\d+/);
          //logger.info(setID[0])
          itemIDMode = true
          objSets =await this.name2index('ITEMID'+setID[0],1)
          setNum = objSets.length
          //logger.info(objSets)
        }
      }
      
      //logger.info(objSets)
      //logger.info(setNum)
      if(setNum == 0 || objSets[0] == -1)
      {
        error_set = 1;
      }
      else
      {
        error_set = 1;
        for (let setKey of objSets) {
          setData = await this.updateData(setKey, 1)
          if(setData.atlasData[1].name_en == ('<'+GI.set+'>') || setData.atlasData[1].name == GI.set || itemIDMode)
          {
            buildData.buildsData[1].gear[index].icon = GI.name['image'].split('/eso/abilities/')[1].split('.')[0]
            buildData.buildsData[1].gear[index].type = GI.type
            if(GI.type == 'Light')
            {
              buildData.buildsData[1].gear[index].type_color = 'rgb(58, 146, 254)'
            }
            else if(GI.type == 'Medium')
            {
              buildData.buildsData[1].gear[index].type_color = 'rgb(47, 213, 14)'
            }
            else if(GI.type == 'Heavy')
            {
              buildData.buildsData[1].gear[index].type_color = 'rgb(227, 36, 33)'
            }
            else
            {
              buildData.buildsData[1].gear[index].type_color = 'rgb(221, 221, 221)'
            }
            buildData.buildsData[1].gear[index].name_cn = setData.atlasData[1].name + await this.transTypeName(GI.type, index)
            buildData.buildsData[1].gear[index].name_en = setData.atlasData[1].name_en
            buildData.buildsData[1].gear[index].level = GI.level
            buildData.buildsData[1].gear[index].color = GI.name['color']
            if(buildData.buildsData[1].gear[index].color == 'rgb(229, 204, 128)')
            {
              buildData.buildsData[1].gear[index].color = 'rgb(255, 230, 45)'
            }
            if(setData.atlasData[1].place == '考古')
            {
              buildData.buildsData[1].gear[index].color = 'rgb(255, 110, 0)'
            }
            buildData.buildsData[1].gear[index].level_class = 'inline-block'
            buildData.buildsData[1].gear[index].set_cn = setData.atlasData[1].name
            buildData.buildsData[1].gear[index].set_en = setData.atlasData[1].name_en
            buildData.buildsData[1].gear[index].trait = await this.trait2str(GI.trait, set_type)
            buildData.buildsData[1].gear[index].enchant = await this.enchant2str(GI.enchant['text'], set_type)
            buildData.buildsData[1].gear[index].enchantColor = GI.enchant['color']
            error_set = 0;
            break
          }
        }
      }
      if(error_set)
      {
        buildData.buildsData[1].gear[index].icon = GI.name['image'].split('/eso/abilities/')[1].split('.')[0]
        buildData.buildsData[1].gear[index].type = GI.type
        if(GI.type == 'Light')
        {
          buildData.buildsData[1].gear[index].type_color = 'rgb(58, 146, 254)'
        }
        else if(GI.type == 'Medium')
        {
          buildData.buildsData[1].gear[index].type_color = 'rgb(47, 213, 14)'
        }
        else if(GI.type == 'Heavy')
        {
          buildData.buildsData[1].gear[index].type_color = 'rgb(227, 36, 33)'
        }
        else
        {
          buildData.buildsData[1].gear[index].type_color = 'rgb(221, 221, 221)'
        }
        buildData.buildsData[1].gear[index].name_cn = GI.name['text'] + await this.transTypeName(GI.type, index)
        buildData.buildsData[1].gear[index].name_en = ''
        buildData.buildsData[1].gear[index].level = GI.level
        buildData.buildsData[1].gear[index].color = GI.name['color']
        if(buildData.buildsData[1].gear[index].color == 'rgb(229, 204, 128)')
        {
          buildData.buildsData[1].gear[index].color = 'rgb(255, 230, 45)'
        }
        buildData.buildsData[1].gear[index].level_class = 'inline-block'
        buildData.buildsData[1].gear[index].set_cn = ''
        buildData.buildsData[1].gear[index].set_en = ''
        buildData.buildsData[1].gear[index].trait = await this.trait2str(GI.trait, set_type)
        buildData.buildsData[1].gear[index].enchant = await this.enchant2str(GI.enchant['text'], set_type)
        buildData.buildsData[1].gear[index].enchantColor = GI.enchant['color']
      }
      let isExist = "不存在"
      let imgPath = `./plugins/eso/resources/img/sets/${buildData.buildsData[1].gear[index].icon}.png`
      if (fs.existsSync(imgPath)) {
        isExist = "存在"
      }
      else
      {
        let url = `https://eso-hub.com/storage/icons/${buildData.buildsData[1].gear[index].icon}.png`
        let dstpath = `./plugins/eso/resources/img/sets/${buildData.buildsData[1].gear[index].icon}.png`
        let ret = await Bot.download(url, dstpath)
      }
    }

    var talentIndex = 0
    let classIcon = ''
    let classStr = ''
    for (let TI of BD.talentData) {
      let oneTalent = ''
      for (let i = 0; i < 2; i++) {
        if(i == 0) {
          oneTalent = TI.mainSkill
        }
        else {
          oneTalent = TI.offSkill
        }

        if((oneTalent['icon'].length == 0) && (oneTalent['text'].length == 0))
        {
          buildData.buildsData[1].spell[i].bar[talentIndex].icon = 'empty'
          buildData.buildsData[1].spell[i].bar[talentIndex].color = 'rgb(170, 170, 170)'
          buildData.buildsData[1].spell[i].bar[talentIndex].name = 'N/A'
          buildData.buildsData[1].spell[i].bar[talentIndex].address = ' '
          continue;
        }

        await this.skillsName2Index(oneTalent['text'],2)
        //logger.info('=======' + oneTalent['text'])
        let skillNum = objSkills.length
        let error_skill = 1;
        if(skillNum == 0 || objSkills[0] == -1)
        {
          //logger.info('=======' + oneTalent)
          let icon_name = oneTalent['icon'].split('/eso/abilities/')[1].split('.')[0]
          let icon_trans_name = 'none'
          await this.skillsName2Index(icon_name,3)
          //logger.info('=======' + icon_name)
          skillNum = objSkills.length
          if(skillNum == 0 || objSkills[0] == -1)
          {
            for (let oneTransSkill of translate_skills) {
              if(oneTransSkill.log_name == icon_name)
              {
                icon_trans_name = oneTransSkill.en_name
                //logger.info('=======' + icon_trans_name)
                break;
              }
            }
            if(icon_trans_name != 'none')
            {
              await this.skillsName2Index(icon_trans_name,3)
              skillNum = objSkills.length
              //logger.info(objSkills)
              if(skillNum > 0 && objSkills[0] != -1)
              {
                error_skill = 0;
              }
            }
          }
          else
          {
            error_skill = 0;
          }
        }
        else
        {
          error_skill = 0
        }

        if(error_skill == 0)
        {
          //logger.info(objSkills)
          error_skill = 1;
          for (let skillKey of objSkills) {
            //logger.info(skillKey)
            let enID = skillKey.split('_')
            if(enID[0]==1)
            {
              if(enID[1]>=1 && enID[1]<=3)
              {
                classIcon = "ON-icon-class-Warden"
                classStr = "守望者"
              }
              else if(enID[1]>=4 && enID[1]<=6)
              {
                classIcon = "ON-icon-class-Templar"
                classStr = "圣骑士"
              }
              else if(enID[1]>=7 && enID[1]<=9)
              {
                classIcon = "ON-icon-class-Dragonknight"
                classStr = "龙骑士"
              }
              else if(enID[1]>=10 && enID[1]<=12)
              {
                classIcon = "ON-icon-class-Nightblade"
                classStr = "夜刃"
              }
              else if(enID[1]>=13 && enID[1]<=15)
              {
                classIcon = "ON-icon-class-Sorcerer"
                classStr = "巫师"
              }
              else if(enID[1]>=16 && enID[1]<=18)
              {
                classIcon = "ON-icon-class-Necromancer"
                classStr = "死灵"
              }
              else if(enID[1]>=19 && enID[1]<=21)
              {
                classIcon = "ON-icon-class-Arcanist"
                classStr = "奥术师"
              }
            }
            
            skillNum = objSkills.length
            await this.updateData(skillKey, 2)
            if(skillNum == 1 || skillData.atlasData[1].new_en_name == ('<'+oneTalent['text']+'>') || skillData.atlasData[1].new_cn_name == oneTalent['text'])
            {
              buildData.buildsData[1].spell[i].bar[talentIndex].icon = skillData.atlasData[1].new_icon
              buildData.buildsData[1].spell[i].bar[talentIndex].color = oneTalent['color']
              buildData.buildsData[1].spell[i].bar[talentIndex].name = skillData.atlasData[1].new_cn_name
              buildData.buildsData[1].spell[i].bar[talentIndex].address = skillData.atlasData[1].place_cn.replace("大招", "大")
              error_skill = 0;
              break;
            }
          }
        }

        if(error_skill)
        {
          buildData.buildsData[1].spell[i].bar[talentIndex].icon = oneTalent['icon'].split('/eso/abilities/')[1].split('.')[0]
          buildData.buildsData[1].spell[i].bar[talentIndex].color = oneTalent['color']
          buildData.buildsData[1].spell[i].bar[talentIndex].name = oneTalent['text']
          buildData.buildsData[1].spell[i].bar[talentIndex].address = '变种技能'
          let isExist = "不存在"
          let imgPath = `./plugins/eso/resources/img/skills/${buildData.buildsData[1].spell[i].bar[talentIndex].icon}.png`
          if (fs.existsSync(imgPath)) {
            isExist = "存在"
          }
          else
          {
            let url = `https://eso-hub.com/storage/icons/${buildData.buildsData[1].spell[i].bar[talentIndex].icon}.png`
            let dstpath = `./plugins/eso/resources/img/skills/${buildData.buildsData[1].spell[i].bar[talentIndex].icon}.png`
            let ret = await Bot.download(url, dstpath)
          }
        }
      }
      talentIndex++
    }

    buildData.buildsData[1].race = classStr
    buildData.buildsData[1].class = classIcon
    //logger.info(buildData.buildsData[1])

    return buildData
  }

  async updateRankData (BuildTable) {
    if('done' != rankData.init)
    {
      let data = await RankTable.get(this.e, 'builds', 'rank', 'rank')
      if (!data)
      {
        logger.error('[ESO:图鉴] 初始化结构体失败')
        return
      }
      rankData = data
    }

    rankData.rtData[1].title = '排行榜'
    rankData.rtData[1].head_title = 'Build Info from www.esolog.com'
    rankData.rtData[1].table = []
    let index = 0;
    let indexAllSet = 0
    let needAdd = true
    let classColor = ''
    let RT = BuildTable.ranks

    if(BuildTable.zone.zoneImage.includes("png"))
    {
      rankData.rtData[1].zoneIcon = BuildTable.zone.zoneImage.split('.png')[0].split('zones/')[1]
    }
    else
    {
      rankData.rtData[1].zoneIcon = "empty"
    }
    rankData.rtData[1].zoneName = BuildTable.zone.zoneName
    rankData.rtData[1].zoneType = BuildTable.zone.zoneType

    rankData.rtData[1].filterMetric = BuildTable.filterInfo.metric
    rankData.rtData[1].filterBoss = BuildTable.filterInfo.boss
    rankData.rtData[1].filterDifficulty = BuildTable.filterInfo.difficulty
    rankData.rtData[1].filterClass = BuildTable.filterInfo.class

    let findSet = false
    let zoneImgPath = `./plugins/eso/resources/img/zones/${rankData.rtData[1].zoneIcon}.png`
    if (!fs.existsSync(zoneImgPath)) {
      let url = `https://assets.rpglogs.com/img/eso/zones/${rankData.rtData[1].zoneIcon}.png`
      let dstpath = `./plugins/eso/resources/img/zones/${rankData.rtData[1].zoneIcon}.png`
      logger.info(url)
      let ret = await Bot.download(url, dstpath)
    }
    //logger.info(rankData.rtData[1])

    for (let oneInfo of RT) {
      index++;
      let typeName = ''
      if(oneInfo.classType.includes('StaminaDPS')){typeName += '耐系'; classColor = "rgb(47, 213, 14)";}
      if(oneInfo.classType.includes('MagickaDPS')){typeName += '法系'; classColor = "rgb(58, 146, 254)";}
      if(oneInfo.classType.includes('WerewolfDPS')){typeName += '狼人'; classColor = "rgb(137, 125, 23)";}
      if(oneInfo.classType.includes('Tank')){typeName += '坦克'; classColor = "rgb(227, 36, 33)";}
      if(oneInfo.classType.includes('Healer')){typeName += '治疗'; classColor = "rgb(221, 221, 221)";}
      if(oneInfo.classType.includes('Templar')){typeName += '圣骑'}
      if(oneInfo.classType.includes('DragonKnight')){typeName += '龙骑'}
      if(oneInfo.classType.includes('Sorcerer')){typeName += '巫师'}
      if(oneInfo.classType.includes('Nightblade')){typeName += '夜刃'}
      if(oneInfo.classType.includes('Warden')){typeName += '窝登'}
      if(oneInfo.classType.includes('Necromancer')){typeName += '死灵'}
      if(oneInfo.classType.includes('Arcanist')){typeName += '奥术'}

      let sets = []
      let gears = []
      let talents =[]
      for (let oneGear of oneInfo.gears) {
        let setIndex = 0
        let setName = ''
        let findSet = false
        let imgPath = `./plugins/eso/resources/img/sets/${oneGear.icon}.png`
        if (!fs.existsSync(imgPath)) {
          let url = `https://eso-hub.com/storage/icons/${oneGear.icon}.png`
          let dstpath = `./plugins/eso/resources/img/sets/${oneGear.icon}.png`
          logger.info(url)
          let ret = await Bot.download(url, dstpath)
        }

        let itemID = 'ITEMID'+oneGear.id
        //logger.info(itemID)
        
        needAdd = true
        if(allSets.length)
        {
          for (let singleSet of allSets) {
            if(singleSet.id == oneGear.id)
            {
              needAdd = false
              findSet = true
              setName = singleSet.name
              break;
            }
            indexAllSet++
          }
        }

        if(needAdd)
        {
          let objSets =await this.name2index(itemID,1)
          let setNum = objSets.length
          if(setNum == 0 || objSets[0] == -1)
          {
            setIndex = 0
            findSet = false
          }
          else
          {
            //logger.info(objSets)
            setData = await this.updateData(objSets[0], 1)
            //logger.info(setData.atlasData[1].name)
            setName = setData.atlasData[1].name
            findSet = true
          }
          if(findSet)
          {
            let allSetItem = {
              name: setName,
              id: oneGear.id,
            };
            allSets.push(allSetItem);
          }
        }

        if(findSet)
        {
          needAdd = true
          if(sets.length)
          {
            setIndex = 0
            for (let oneSet of sets) {
              setIndex++
              if(oneSet.name == setName)
              {
                needAdd = false
                break;
              }
            }
          }

          if(needAdd)
          {
            setIndex++
            let setItem = {
              name: setName,
              color: gearColor[setIndex],
            };
            sets.push(setItem);
          }
        }

        let gear = {
          icon: oneGear.icon,
          color: gearColor[setIndex],
        };
        gears.push(gear);
      }

      for (let oneTalent of oneInfo.talents) {
        let icon = ''
        icon = oneTalent.split('.png')[0].split('abilities/')[1]
        if(icon == '???')
        {
          icon = 'empty'
        }

        let isExist = "不存在"
        let imgPath = `./plugins/eso/resources/img/skills/${icon}.png`
        if (fs.existsSync(imgPath)) {
          isExist = "存在"
        }
        else
        {
          let url = `https://eso-hub.com/storage/icons/${icon}.png`
          let dstpath = `./plugins/eso/resources/img/skills/${icon}.png`
          let ret = await Bot.download(url, dstpath)
        }

        let singleTalent = {
          icon: icon,
          name: icon,
        };
        //logger.info(singleTalent)
        talents.push(singleTalent);
      }

      let onePerson = {
        index: index,
        type: typeName,
        typeColor: classColor,
        accountName: oneInfo.accountName,
        roleName: oneInfo.roleName,
        sets: sets,
        gears: gears,
        talents: talents,
      };
      rankData.rtData[1].table.push(onePerson);
    }

    //logger.info(rankData.rtData[1])

    rankData.rtData[1].head_title = "Build Info from www.esolog.com"
  }

  async updateData (setKey, type) {
    if(type == 1) //this is name for sets
    {
      await this.updateSetData(setKey, 0)
      return setData
    }
    if(type == 2) //this is name for skills
    {
      await this.updateSkillData(setKey, 0)
      return skillData
    }
    if(type == 3) //this is name for builds
    {
      await this.updateBuildData(setKey)
      return buildData
    }
    if(type == 4) //this is name for rank
    {
      await this.updateRankData(setKey)
      return rankData
    }

    if(type == 11) //this is name for sets-english
    {
      await this.updateSetData(setKey, 1)
      return setData
    }
    if(type == 21) //this is name for skills-english
    {
      await this.updateSkillData(setKey, 1)
      return skillData
    }
  }

  async bonuses2msg (bonuses) {
    let msg = []
    var msgIndex = 0
    var keysBonuses = Object.keys(bonuses)
    var numBonuses = keysBonuses.length

    for (let bonuseKey of keysBonuses) {
      msg[msgIndex] = await this.transColor(bonuses[bonuseKey])
      msgIndex = msgIndex + 1
    }

    //logger.info(msg)
    return msg
  }

  async transColor (source) {
    let msg = []
    var msgIndex = 0
    let colorMsgs = source.split('|c')

    for (let oneColor of colorMsgs) {
      if (msgIndex == 0)
      {
        msg = msg + oneColor
      }
      else
      {
        //msg = msg + "<div style=\"color:#" + oneColor.split('|r')[0].substring(0,6) + ";\">" + oneColor.split('|r')[0].slice(6) + "</div>" + oneColor.split('|r')[1]
        msg = msg + oneColor.split('|r')[0].slice(6) + oneColor.split('|r')[1]
      }
      //logger.info(oneColor)
      msgIndex = msgIndex + 1
    }

    //logger.info(msg)
    return msg
  }

  async trait2str (trait, set_type) {
    let traitStr = trait
    let allTraits = ''

    if(set_type == 0)
    {
      allTraits = traits_armor
    }
    else if(set_type == 1)
    {
      allTraits = traits_jewelry
    }
    else if(set_type == 2)
    {
      allTraits = traits_weapon
    }
    else
    {
      allTraits = traits_armor
    }
          
    for (let oneTrait of allTraits) {
      if(oneTrait.en_name == trait)
      {
        traitStr = oneTrait.name + '<' + oneTrait.en_name + '>'
        break;
      }
    }

    return traitStr
  }

  async enchant2str (enchant, set_type) {
    let enchantStr = enchant
    let allEnchants = ''

    if(set_type == 0)
    {
      allEnchants = enchants_armor
    }
    else if(set_type == 1)
    {
      allEnchants = enchants_jewelry
    }
    else if(set_type == 2)
    {
      allEnchants = enchants_weapon
    }
    else
    {
      allEnchants = traits_armor
    }
          
    for (let oneEnchant of allEnchants) {
      if(oneEnchant.log_name_en == enchant)
      {
        enchantStr = oneEnchant.name + '<' + oneEnchant.en_name + '>'
        break;
      }
    }

    return enchantStr
  }

  async transTypeName (type, index) {
    let typeName = ""

    if(type == 'Fire Staff')
    {
      typeName = '火杖'
    }
    else if(type == 'Lightning Staff')
    {
      typeName = '电杖'
    }
    else if(type == 'Frost Staff')
    {
      typeName = '冰杖'
    }
    else if(type == 'Healing Staff')
    {
      typeName = '奶杖'
    }
    else if(type == 'Shield')
    {
      typeName = '盾牌'
    }
    else if(type == 'Dagger')
    {
      typeName = '匕首'
    }
    else if(type == 'Hammer')
    {
      typeName = '锤子'
    }
    else if(type == '2H Sword')
    {
      typeName = '巨剑'
    }
    else if(type == 'Bow')
    {
      typeName = '弓'
    }
    else if(type == 'Jewelry')
    {
      if(index == 7)
      {
        typeName = '项链'
      }
      else if(index == 8)
      {
        typeName = '戒指'
      }
      else if(index == 9)
      {
        typeName = '戒指'
      }
    }

    return typeName
  }
}

export default new database()