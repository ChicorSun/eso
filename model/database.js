import { createRequire } from 'module'
import Atlas from './atlas.js'
import Skills from './skills.js'
import Foods from './foods.js'
import Builds from './builds.js'
import Cards from './cards.js'
import RankTable from './rank.js'
import fetch from 'node-fetch'
import getimgs from './getimgs.js'
import fs from 'node:fs'
import md5 from 'md5'

const require = createRequire(import.meta.url);

let dataExtractorENPath = './plugins/eso/resources/data/DataExtractor-en.lua'
let dataExtractorCNPath = './plugins/eso/resources/data/DataExtractor-cn.lua'

// 缓存路径
const cachePath = './plugins/eso/custome_resources/cache/'
const MAX_CACHE_ENTRIES = 1000

// 数据文件的 MD5 值
let currentMD5 = null

// 计算文件的 MD5
function calculateMD5(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath)
    let MD5val = md5(JSON.stringify(fileBuffer))
    return MD5val
  } catch (error) {
    logger.error(`[ESO:图鉴] 计算MD5失败: ${error.message}`)
    return null
  }
}

// 缓存管理类
class CacheManager {
  constructor(cacheFile) {
    this.cacheFile = cachePath + cacheFile
    this.cache = new Map()
    this.accessCount = new Map()
    this.loadCache()
  }

  loadCache() {
    try {
      if (!fs.existsSync(cachePath)) {
        fs.mkdirSync(cachePath, { recursive: true })
      }
      
      if (fs.existsSync(this.cacheFile)) {
        const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'))
        
        // 检查缓存文件中的 MD5 是否与当前数据文件一致
        if (!data.md5 || data.md5 !== currentMD5) {
          logger.info(`[ESO:图鉴] 数据文件已更新，清除缓存: ${this.cacheFile}`)
          fs.unlinkSync(this.cacheFile)
          this.cache.clear()
          this.accessCount.clear()
          return
        }
        
        this.cache = new Map(Object.entries(data.cache))
        this.accessCount = new Map(Object.entries(data.accessCount))
      }
    } catch (error) {
      logger.error(`[ESO:图鉴] 加载缓存文件失败: ${error.message}`)
      this.cache.clear()
      this.accessCount.clear()
    }
  }

  saveCache() {
    try {
      const data = {
        md5: currentMD5,
        cache: Object.fromEntries(this.cache),
        accessCount: Object.fromEntries(this.accessCount)
      }
      fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2))
    } catch (error) {
      logger.error(`[ESO:图鉴] 保存缓存文件失败: ${error.message}`)
    }
  }

  get(key) {
    if (this.cache.has(key)) {
      this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1)
      this.saveCache()
      return this.cache.get(key)
    }
    return null
  }

  set(key, value) {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      // 找到访问次数最少的键
      let minKey = null
      let minCount = Infinity
      for (const [k, count] of this.accessCount) {
        if (count < minCount) {
          minCount = count
          minKey = k
        }
      }
      if (minKey) {
        this.cache.delete(minKey)
        this.accessCount.delete(minKey)
      }
    }
    
    this.cache.set(key, value)
    this.accessCount.set(key, 1)
    this.saveCache()
  }
}

// 缓存管理器实例Map
const cacheManagers = new Map()

// 获取缓存管理器实例
function getCacheManager(type) {
  const cacheFile = `index_table_${String(type).padStart(2, '0')}.json`
  if (!cacheManagers.has(type)) {
    cacheManagers.set(type, new CacheManager(cacheFile))
  }
  return cacheManagers.get(type)
}

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
let foodsData = [{
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
let foodsDataCN = [{
}]
let skillsDataCN = [{
}]

//装备别名数据库
let addrSet = [{
}]

//技能别名数据库
let addrSkill = [{
}]

//食物别名数据库
let addrFood = [{
}]

//技能ID转中文序号对照表
let skillID2IndexCN = {
  init: '-1',
}

//食物图鉴结构体变量


let races =
[
  {
    "race_zh": "高精灵",
    "race_en": "Altmer"
  },
  {
    "race_zh": "木精灵",
    "race_en": "Bosmer"
  },
  {
    "race_zh": "卡吉特",
    "race_en": "Khajiit"
  },
  {
    "race_zh": "布莱顿",
    "race_en": "Breton"
  },
  {
    "race_zh": "兽人",
    "race_en": "Orc"
  },
  {
    "race_zh": "红卫",
    "race_en": "Redguard"
  },
  {
    "race_zh": "亚龙人",
    "race_en": "Argonian"
  },
  {
    "race_zh": "暗精灵",
    "race_en": "Dunmer"
  },
  {
    "race_zh": "诺德人",
    "race_en": "Nord"
  },
  {
    "race_zh": "帝国人",
    "race_en": "Imperial"
  }
]

let stones =
[
  {
    "stone_pic_url": "ON-icon-mundusstone-Apprentice.png",
    "stone_zh": "学徒座",
    "stone_en": "The Apprentice",
    "stone_msg": "增加你的法术伤害238",
  },
  {
    "stone_pic_url": "ON-icon-mundusstone-Atronach.png",
    "stone_zh": "侍灵座",
    "stone_en": "The Atronach",
    "stone_msg": "增加魔法回复310",
  },
  {
    "stone_pic_url": "ON-icon-mundusstone-Lady.png",
    "stone_zh": "女神座",
    "stone_en": "The Lady",
    "stone_msg": "增加物理抗性和魔法抗性2744",
  },
  {
    "stone_pic_url": "ON-icon-mundusstone-Lord.png",
    "stone_zh": "君王座",
    "stone_en": "The Lord",
    "stone_msg": "增加最大生命2225",
  },
  {
    "stone_pic_url": "ON-icon-mundusstone-Lover.png",
    "stone_zh": "恋人座",
    "stone_en": "The Lover",
    "stone_msg": "增加法术和物理穿透2744",
  },
  {
    "stone_pic_url": "ON-icon-mundusstone-Mage.png",
    "stone_zh": "法师座",
    "stone_en": "The Mage",
    "stone_msg": "增加最大魔法2023",
  },
  {
    "stone_pic_url": "ON-icon-mundusstone-Ritual.png",
    "stone_zh": "仪式座",
    "stone_en": "The Ritual",
    "stone_msg": "增加你造成的治疗8%",
  },
  {
    "stone_pic_url": "ON-icon-mundusstone-Serpent.png",
    "stone_zh": "毒蛇座",
    "stone_en": "The Serpent",
    "stone_msg": "增加耐力恢复310",
  },
  {
    "stone_pic_url": "ON-icon-mundusstone-Shadow.png",
    "stone_zh": "暗影座",
    "stone_en": "The Shadow",
    "stone_msg": "增加暴击伤害和暴击治疗11%",
  },
  {
    "stone_pic_url": "ON-icon-mundusstone-Steed.png",
    "stone_zh": "战马座",
    "stone_en": "The Steed",
    "stone_msg": "增加生命恢复238，增加10%移速",
  },
  {
    "stone_pic_url": "ON-icon-mundusstone-Thief.png",
    "stone_zh": "盗贼座",
    "stone_en": "The Thief",
    "stone_msg": "增加武器和法术暴击1333",
  },
  {
    "stone_pic_url": "ON-icon-mundusstone-Tower.png",
    "stone_zh": "高塔座",
    "stone_en": "The Tower",
    "stone_msg": "增加最大耐力2023",
  },
  {
    "stone_pic_url": "ON-icon-mundusstone-Warrior.png",
    "stone_zh": "战士座",
    "stone_en": "The Warrior",
    "stone_msg": "增加你的武器伤害238",
  }
]

var foodBuffs = [
  {"buffid": "61218", "itemid": "68253", "img": "", "quality": "", "name_en": "Longfin Pasty with Melon Sauce", "name_zh": ""},
  {"buffid": "61255", "itemid": "68247", "img": "", "quality": "", "name_en": "Braised Rabbit with Spring Vegetables", "name_zh": ""},
  {"buffid": "61257", "itemid": "68243", "img": "", "quality": "", "name_en": "Melon-Baked Parmesan Pork", "name_zh": ""},
  {"buffid": "61259", "itemid": "43142", "img": "", "quality": "", "name_en": "Argonian Saddle-Cured Rabbit", "name_zh": ""},
  {"buffid": "61260", "itemid": "43154", "img": "", "quality": "", "name_en": "Fresh Apples and Eidar Cheese", "name_zh": ""},
  {"buffid": "61261", "itemid": "68239", "img": "", "quality": "", "name_en": "Hearty Garlic Corn Chowder", "name_zh": ""},
  {"buffid": "61294", "itemid": "68250", "img": "", "quality": "", "name_en": "Late Hearthfire Vegetable Tart", "name_zh": ""},
  {"buffid": "61322", "itemid": "68257", "img": "", "quality": "", "name_en": "Markarth Mead", "name_zh": ""},
  {"buffid": "61325", "itemid": "68260", "img": "", "quality": "", "name_en": "Muthsera's Remorse", "name_zh": ""},
  {"buffid": "61328", "itemid": "68263", "img": "", "quality": "", "name_en": "Hagraven's Tonic", "name_zh": ""},
  {"buffid": "61335", "itemid": "68266", "img": "", "quality": "", "name_en": "Bravil Bitter Barley Beer", "name_zh": ""},
  {"buffid": "61340", "itemid": "68268", "img": "", "quality": "", "name_en": "Camlorn Sweet Brown Ale", "name_zh": ""},
  {"buffid": "61345", "itemid": "68271", "img": "", "quality": "", "name_en": "Rosy Disposition Tonic", "name_zh": ""},
  {"buffid": "61350", "itemid": "68276", "img": "", "quality": "", "name_en": "Lusty Argonian Maid Mazte", "name_zh": ""},
  {"buffid": "68411", "itemid": "64711", "img": "", "quality": "", "name_en": "Crown Fortifying Meal", "name_zh": ""},
  {"buffid": "68416", "itemid": "64712", "img": "", "quality": "", "name_en": "Crown Refreshing Drink", "name_zh": ""},
  {"buffid": "71057", "itemid": "71057", "img": "", "quality": "", "name_en": "Orzorga's Tripe Trifle Pocket", "name_zh": ""},
  {"buffid": "72822", "itemid": "71058", "img": "", "quality": "", "name_en": "Orzorga's Blood Price Pie", "name_zh": ""},
  {"buffid": "72824", "itemid": "71059", "img": "", "quality": "", "name_en": "Orzorga's Smoked Bear Haunch", "name_zh": ""},
  {"buffid": "84720", "itemid": "87695", "img": "", "quality": "", "name_en": "Ghastly Eye Bowl", "name_zh": ""},
  {"buffid": "84731", "itemid": "87697", "img": "", "quality": "", "name_en": "Witchmother's Potent Brew", "name_zh": ""},
  {"buffid": "84709", "itemid": "87691", "img": "", "quality": "", "name_en": "Crunchy Spider Skewer", "name_zh": ""},
  {"buffid": "86673", "itemid": "112425", "img": "", "quality": "", "name_en": "Lava Foot Soup-and-Saltrice", "name_zh": ""},
  {"buffid": "89955", "itemid": "120762", "img": "", "quality": "", "name_en": "Candied Jester's Coins", "name_zh": ""},
  {"buffid": "89957", "itemid": "120763", "img": "", "quality": "", "name_en": "Dubious Camoran Throne", "name_zh": ""},
  {"buffid": "89971", "itemid": "120764", "img": "", "quality": "", "name_en": "Jewels of Misrule", "name_zh": ""},
  {"buffid": "100498", "itemid": "133556", "img": "", "quality": "", "name_en": "Clockwork Citrus Filet", "name_zh": ""},
  {"buffid": "107748", "itemid": "139016", "img": "", "quality": "", "name_en": "Artaeum Pickled Fish Bowl", "name_zh": ""},
  {"buffid": "107789", "itemid": "139018", "img": "", "quality": "", "name_en": "Artaeum Takeaway Broth", "name_zh": ""},
  {"buffid": "127596", "itemid": "153629", "img": "", "quality": "", "name_en": "Bewitched Sugar Skulls", "name_zh": ""},
  {"buffid": "147687", "itemid": "171323", "img": "", "quality": "", "name_en": "Colovian War Torte", "name_zh": ""},
]

var raceBuffs = [
  {"buffid": "35965", "img": "Altmer", "name_en": "Altmer", "name_cn": "高精灵"},
  {"buffid": "36008", "img": "Bosmer", "name_en": "Bosmer", "name_cn": "木精灵"},
  {"buffid": "70390", "img": "Khajiit", "name_en": "Khajiit", "name_cn": "卡吉特"},
  {"buffid": "36247", "img": "Breton", "name_en": "Breton", "name_cn": "布莱顿"},
  {"buffid": "33293", "img": "Orc", "name_en": "Orc", "name_cn": "兽人"},
  {"buffid": "45278", "img": "Redguard", "name_en": "Redguard", "name_cn": "红卫"},
  {"buffid": "117754", "img": "Redguard", "name_en": "Redguard", "name_cn": "红卫"},
  {"buffid": "36582", "img": "Argonian", "name_en": "Argonian", "name_cn": "亚龙人"},
  {"buffid": "36588", "img": "Dunmer", "name_en": "Dunmer", "name_cn": "暗精灵"},
  {"buffid": "45304", "img": "Nord", "name_en": "Nord", "name_cn": "诺德人"},
  {"buffid": "36312", "img": "Imperial", "name_en": "Imperial", "name_cn": "帝国人"},
]

var skillLineBuffs = {
}

var skillLine2class = {
  "黑暗魔法": {"class_img": "ON-icon-class-Sorcerer", "class_name": "巫师"},
  "魔族召唤": {"class_img": "ON-icon-class-Sorcerer", "class_name": "巫师"},
  "风暴呼唤": {"class_img": "ON-icon-class-Sorcerer", "class_name": "巫师"},

  "神族之矛": {"class_img": "ON-icon-class-Templar", "class_name": "圣骑"},
  "黎明之怒": {"class_img": "ON-icon-class-Templar", "class_name": "圣骑"},
  "恢复之光": {"class_img": "ON-icon-class-Templar", "class_name": "圣骑"},

  "烈焰之刃": {"class_img": "ON-icon-class-Dragonknight", "class_name": "龙骑"},
  "巨龙之力": {"class_img": "ON-icon-class-Dragonknight", "class_name": "龙骑"},
  "大地之心": {"class_img": "ON-icon-class-Dragonknight", "class_name": "龙骑"},

  "刺杀": {"class_img": "ON-icon-class-Nightblade", "class_name": "夜刃"},
  "暗影": {"class_img": "ON-icon-class-Nightblade", "class_name": "夜刃"},
  "虹吸": {"class_img": "ON-icon-class-Nightblade", "class_name": "夜刃"},

  "动物伙伴": {"class_img": "ON-icon-class-Warden", "class_name": "守望"},
  "绿色平衡": {"class_img": "ON-icon-class-Warden", "class_name": "守望"},
  "凛冬之拥": {"class_img": "ON-icon-class-Warden", "class_name": "守望"},

  "墓穴领主": {"class_img": "ON-icon-class-Necromancer", "class_name": "死灵"},
  "白骨暴君": {"class_img": "ON-icon-class-Necromancer", "class_name": "死灵"},
  "存世亡者": {"class_img": "ON-icon-class-Necromancer", "class_name": "死灵"},

  "古籍使者": {"class_img": "ON-icon-class-Arcanist", "class_name": "奥术师"},
  "异典士兵": {"class_img": "ON-icon-class-Arcanist", "class_name": "奥术师"},
  "药剂符师": {"class_img": "ON-icon-class-Arcanist", "class_name": "奥术师"},
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
let tagColor = [
  "rgb(236, 240, 241)", // 浅灰色，柔和且舒适
  "rgb(231, 76, 60)",   // 橙红色，活泼且鲜明
  "rgb(46, 204, 113)",  // 青绿色，清新自然
  "rgb(155, 89, 182)",  // 紫罗兰色，优雅且柔和
  "rgb(52, 152, 219)",  // 天蓝色，明亮且柔和
  "rgb(241, 196, 15)",  // 柠檬黄，活泼且温暖
  "rgb(189, 195, 199)", // 深灰色，低调且稳重
  "rgb(26, 188, 156)"   // 浅绿色，清新且舒适
];

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
    // 计算数据文件的 MD5 值
    if (!currentMD5) {
      currentMD5 = calculateMD5(dataExtractorCNPath)
      //logger.info(`[ESO:数据库] 数据文件MD5: ${currentMD5}`)
    }

    await this.init_databaseEN()
    await this.init_databaseCN()

    await this.enhance_database()
    await this.init_databaseDG()
  }

  async enhance_database () {
    await this.enhance_setsData()
    await this.enhance_skillsData()
    //logger.info(skillLineBuffs)
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

    skillLineBuffs = {}

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
          if(skillLine2class[allSkillData[lineKey][classKey].name]!= undefined)
          {
            let icon = await this.splitStr(oneSkill.icon, 'icons/', '.dds')
            skillLineBuffs[icon] = allSkillData[lineKey][classKey].name
            //logger.info('       ' +  classKey + '|---' + allSkillData[lineKey][classKey].name + '[' + skillLine2class[allSkillData[lineKey][classKey].name].class_name + ']' + oneSkill.name + '(' + oneSkill.icon +')')
          }

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
            
            if(skillLine2class[allSkillData[lineKey][classKey].name]!= undefined)
            {
              let icon = await this.splitStr(oneSkill[1].icon, 'icons/', '.dds')
              skillLineBuffs[icon] = allSkillData[lineKey][classKey].name
              //logger.info('       ' +  classKey + '|---' + allSkillData[lineKey][classKey].name + '[' + skillLine2class[allSkillData[lineKey][classKey].name].class_name + ']' + oneSkill[1].name + '(' + oneSkill[1].icon +')')
            }
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

            if(skillLine2class[allSkillData[lineKey][classKey].name]!= undefined)
            {
              let icon = await this.splitStr(oneSkill[2].icon, 'icons/', '.dds')
              skillLineBuffs[icon] = allSkillData[lineKey][classKey].name
              //logger.info('       ' +  classKey + '|---' + allSkillData[lineKey][classKey].name + '[' + skillLine2class[allSkillData[lineKey][classKey].name].class_name + ']' + oneSkill[2].name + '(' + oneSkill[2].icon +')')
            }
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
    try {
      //检查英文数据库是否已加载
      var keysSet = Object.keys(setsData)
      var numSets = keysSet.length
      var keysSkill = Object.keys(skillsData)
      var numSkills = keysSkill.length

      if (numSets > 10 && numSkills > 3) {
        //logger.info("英文数据库已加载，无需更新")
        return
      }

      //logger.info("正在加载英文数据库...")
      const luaToJson = require('lua-to-json')
      const luaSrc = await fs.promises.readFile(dataExtractorENPath, 'utf8')
      const lua_code = luaToJson(luaSrc)
      
      if (!lua_code?.DataExtractorSavedVariables?.Default) {
        logger.error('[ESO:图鉴] 英文数据文件格式错误')
        return
      }

      // 获取第一个账号的数据
      const firstAccount = Object.keys(lua_code.DataExtractorSavedVariables.Default)[0]
      if (!firstAccount) {
        logger.error('[ESO:图鉴] 英文数据文件中未找到账号数据')
        return
      }

      const accountData = lua_code.DataExtractorSavedVariables.Default[firstAccount]['$AccountWide']
      if (!accountData) {
        logger.error('[ESO:图鉴] 英文数据文件中未找到账号全局数据')
        return
      }

      // 加载物品数据
      const itemsData = accountData.dataItems
      if (itemsData) {
        setsData = itemsData['Sets'] || [{}]
        recipesData = itemsData['Recipes'] || [{}]
        furnituresData = itemsData['Furniture'] || [{}]
        collfurnituresData = itemsData['CollectibleFurniture'] || [{}]
        foodsData = itemsData['Foods'] || [{}]
      }

      // 加载技能数据
      skillsData = accountData['dataSkills'] || [{}]

      //logger.info('[ESO:图鉴] 英文数据库加载完成')
    } catch (error) {
      logger.error(`[ESO:图鉴] 加载英文数据库失败: ${error}`)
    }
  }

  async init_databaseCN () {
    try {
      //检查中文数据库是否已加载
      var keysSet = Object.keys(setsDataCN)
      var numSets = keysSet.length
      var keysSkill = Object.keys(skillsDataCN)
      var numSkills = keysSkill.length

      if (numSets > 10 && numSkills > 3) {
        //logger.info("中文数据库已加载，无需更新")
        return
      }

      //logger.info("正在加载中文数据库...")
      const luaToJson = require('lua-to-json')
      const luaSrc = await fs.promises.readFile(dataExtractorCNPath, 'utf8')
      const lua_code = luaToJson(luaSrc)
      
      if (!lua_code?.DataExtractorSavedVariables?.Default) {
        logger.error('[ESO:图鉴] 中文数据文件格式错误')
        return
      }

      // 获取第一个账号的数据
      const firstAccount = Object.keys(lua_code.DataExtractorSavedVariables.Default)[0]
      if (!firstAccount) {
        logger.error('[ESO:图鉴] 中文数据文件中未找到账号数据')
        return
      }

      const accountData = lua_code.DataExtractorSavedVariables.Default[firstAccount]['$AccountWide']
      if (!accountData) {
        logger.error('[ESO:图鉴] 中文数据文件中未找到账号全局数据')
        return
      }

      // 加载物品数据
      const itemsData = accountData.dataItems
      if (itemsData) {
        setsDataCN = itemsData['Sets'] || [{}]
        recipesDataCN = itemsData['Recipes'] || [{}]
        furnituresDataCN = itemsData['Furniture'] || [{}]
        collfurnituresDataCN = itemsData['CollectibleFurniture'] || [{}]
        foodsDataCN = itemsData['Foods'] || [{}]
      }

      // 加载技能数据
      skillsDataCN = accountData['dataSkills'] || [{}]

      //logger.info('[ESO:图鉴] 中文数据库加载完成')
    } catch (error) {
      logger.error(`[ESO:图鉴] 加载中文数据库失败: ${error}`)
    }
  }

  async setsName2Index (keyword) {
    let objSets = [-1]
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
    return objSets
  }

  async skillsName2Index (keyword, mode) {
    let objSkills = [-1]
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
    return objSkills //logger.info(allList)
  }

  async foodsName2Index (keyword, mode) {
    let objFoods = [-1]
    let name = keyword
    let enEsologMode = false
    let enitemIDMode = false
    let enFindByMsg = true
    let enFindByType = false
    let onlyNormal = false
    let notAbbrFood = true
    let index = 0
    let isThisOne = false
    var keysFood = Object.keys(foodsData)
    var numFoods = keysFood.length
    let keyType = 0

    if(name.includes("ITEMID"))
    {
      enitemIDMode = true
      notAbbrFood = true
    }
    if(name.includes("ESOLOG"))
    {
      enEsologMode = true
      notAbbrFood = true
    }
    
    name = name.replace("图鉴", "").replace("#", "").replace("*", "").replace("%", "").replace("ESOLOG", "").replace("ITEMID", "").replace("英文", "").replace("英语", "")
    name = name.toLowerCase()
    if(name.length<4 && /^[A-Za-z]+$/.test(name))
    {
      notAbbrFood = false
    }

    if('done' != addrFood[0].init)
    {
      let data = await Foods.get(this.e, 'foods', 'abbrFood', 'abbrFood')
      addrFood = data.atlasData
      //logger.info('[ESO:图鉴] 初始化食物别名对照表')
    }

    for (let foodKey of keysFood) {
      isThisOne = false
      if(enitemIDMode)
      {
        //logger.info(foodsData[foodKey]["id"])
        if(foodsData[foodKey]["id"] == name)
        {
          isThisOne = true
        }
      }
      else
      {
        if(notAbbrFood && (foodsData[foodKey]["name"]).toLowerCase().includes(name))
        {
          isThisOne = true
        }
        if(notAbbrFood && (foodsDataCN[foodKey]["name"]).toLowerCase().includes(name))
        {
          isThisOne = true
        }
      }

      let srcName = name
      let abbrIndex = -1
      if(!enEsologMode)
      {
        for (let eachAbbr of addrFood) {
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
                //logger.info('------'+foodsData[foodKey]["name"])
                if((foodsData[foodKey]["name"]).toLowerCase().includes(eachAbbr.name.toLowerCase()))
                {
                  isThisOne = true
                  break;
                }
              }
            }
          }
        }
      }

      if(isThisOne)
      {
        objFoods[index] = foodKey
        index++
      }
    }
    let foodNum = index
    
    return objFoods
  }

  async name2index (name, type) {
    await this.init_database()
    let ret = []
    
    // 检查缓存
    const cacheManager = getCacheManager(type)
    const cachedResult = cacheManager.get(name)
    if (cachedResult !== null) {
      return cachedResult
    }
    let result
    if(type == 1) //this is name for sets
    {
      result = await this.setsName2Index(name)
      cacheManager.set(name, result)
      return result
    }
    if(type == 2) //this is name for skills
    {
      result = await this.skillsName2Index(name, 0)
      cacheManager.set(name, result)
      return result
    }
    if(type == 20) //this is name for skills
    {
      result = await this.skillsName2Index(name, 0)
      cacheManager.set(name, result)
      return result
    }
    if(type == 21) //this is name for skills
    {
      result = await this.skillsName2Index(name, 1)
      cacheManager.set(name, result)
      return result
    }
    if(type == 22) //this is name for skills
    {
      result = await this.skillsName2Index(name, 2)
      cacheManager.set(name, result)
      return result
    }
    if(type == 23) //this is name for skills
    {
      result = await this.skillsName2Index(name, 3)
      cacheManager.set(name, result)
      return result
    }
    if(type == 3) //this is name for foods
    {
      result = await this.foodsName2Index(name, 0)
      cacheManager.set(name, result)
      return result
    }

    return ret
  }

  async updateSetData (setKey, showEnglish) {
    let setData = {
      init: 'none',
      atlasData: [{}]
    }
    if('done' != setData.init)
    {
      let data = await Atlas.get(this.e, 'atlas', 'set', 'sets')
      if (!data)
      {
        logger.error('[ESO:图鉴] 初始化结构体失败')
        return
      }
      setData = JSON.parse(JSON.stringify(data))
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
    let imgPath = await getimgs.realpath(setData.atlasData[1].icon, "sets")
    setData.atlasData[1].icon = `../../../../../` + imgPath

    return setData
  }

  async updateSkillData (objects, showEnglish) {
    let skillData = {
      init: 'none',
      atlasData: [{}]
    }
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
      skillData = JSON.parse(JSON.stringify(data))
      //logger.info('[ESO:图鉴] 初始化技能结构体变量')
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

    let imgPath = await getimgs.realpath(skillData.atlasData[1].src_icon, "skills")
    skillData.atlasData[1].src_icon = `../../../../../` + imgPath

    imgPath = await getimgs.realpath(skillData.atlasData[1].new_icon, "skills")
    skillData.atlasData[1].new_icon = `../../../../../` + imgPath

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
    return skillData
  }

  async updateFoodData (objects, showEnglish) {
    let foodData = {
      init: 'none',
      atlasData: [{}, {
        src_icon: '',
        new_icon: '',
        src_cn_name: '',
        src_en_name: '',
        new_cn_name: '',
        new_en_name: '',
        type_cn: '',
        type_en: '',
        place_cn: '',
        place_en: '',
        src_Skills_class: '',
        arrow_class: '',
        new_Skills_class: '',
        parameter_class: '',
        msg: [],
        new_msg: '',
        p_name: [],
        p_value: []
      }]
    }

    //logger.info(foodsDataCN[objects])
    //logger.info(foodsData[objects])

    if('done' != foodData.init)
    {
      let data = await Skills.get(this.e, 'skills', 'skill', 'skills')
      if (!data)
      {
        logger.error('[ESO:图鉴] 初始化食物结构体失败')
        return
      }
      foodData = JSON.parse(JSON.stringify(data))
      //logger.info('[ESO:图鉴] 初始化食物结构体变量')
    }
   
    foodData.atlasData[1].src_icon = await this.splitStr(foodsDataCN[objects]["icon"], 'icons/', '.dds')
    foodData.atlasData[1].new_icon = await this.splitStr(foodsDataCN[objects]["icon"], 'icons/', '.dds')

    let imgPath = await getimgs.realpath(foodData.atlasData[1].src_icon, "foods")
    foodData.atlasData[1].src_icon = `../../../../../` + imgPath

    imgPath = await getimgs.realpath(foodData.atlasData[1].new_icon, "foods")
    foodData.atlasData[1].new_icon = `../../../../../` + imgPath

    foodData.atlasData[1].src_cn_name = foodsDataCN[objects]["name"]
    foodData.atlasData[1].src_en_name = '<' + foodsData[objects]["name"] + '>'

    foodData.atlasData[1].new_cn_name = foodsDataCN[objects]["name"]
    foodData.atlasData[1].new_en_name = '<' + foodsData[objects]["name"] + '>'

    foodData.atlasData[1].type_cn = foodsDataCN[objects]["itemTypeText"]
    
    if(foodsDataCN[objects]["itemTypeText"] != foodsDataCN[objects]["specializedItemTypeText"])
    {
      foodData.atlasData[1].type_en = foodsDataCN[objects]["specializedItemTypeText"]
    }
    else
    {
      foodData.atlasData[1].type_en = '常见' + foodsDataCN[objects]["specializedItemTypeText"]
    }
    
    

    foodData.atlasData[1].place_cn = foodsDataCN[objects]["quality"]

    if(foodsDataCN[objects]["canBeCrafted"])
    {
      foodData.atlasData[1].place_en = "可制造"
    }
    else
    {
      foodData.atlasData[1].place_en = "不可造"
    }

    foodData.atlasData[1].src_Skills_class = 'src_Skills_middle_class'
    foodData.atlasData[1].arrow_class = 'arrow_class_hide'
    foodData.atlasData[1].new_Skills_class = 'new_Skills_class_hide'

    foodData.atlasData[1].parameter_class = 'parameter_class_hide'
    
    if(showEnglish)
    {
      foodData.atlasData[1].msg =  [await this.transColor(foodsData[objects]["description"])]
      foodData.atlasData[1].new_msg = foodsData[objects]["ingredients"]
    }
    else
    {
      foodData.atlasData[1].msg = [await this.transColor(foodsDataCN[objects]["description"])]
      foodData.atlasData[1].new_msg = foodsDataCN[objects]["ingredients"]
    }
    
    foodData.atlasData[1].p_name = []
    foodData.atlasData[1].p_value = []
    
    return foodData
  }

  async updateBuildData (BD, cardMode) {
    let buildData = {
      init: 'none',
      buildsData: [{}, {
        gear: Array(14).fill().map(() => ({})),
        spell: Array(2).fill().map(() => ({
          bar: Array(6).fill().map(() => ({}))
        }))
      }]
    }
    if('done' != buildData.init)
    {
      let data = {}
      if(cardMode == 0)
      {
        data = await Builds.get(this.e, 'builds', 'build', 'builds')
      }
      else
      {
        data = await Cards.get(this.e, 'builds', 'build', 'cards')
      }
      if (!data)
      {
        logger.error('[ESO:图鉴] 初始化结构体失败')
        return
      }
      buildData = JSON.parse(JSON.stringify(data))
    }

    let tags = []
    buildData.buildsData[1].head_title = "Build Info from www.esolog.com created by " + BD.playerName + BD.accountName
    buildData.buildsData[1].accountName = BD.accountName
    buildData.buildsData[1].playerName = BD.playerName
    buildData.buildsData[1].stone = BD.stoneInfo
    buildData.buildsData[1].food = BD.foodInfo

    if(cardMode == 1)
    {
      buildData.buildsData[1].userName = ''
      let imgPath = await getimgs.realpath(BD.userId, "avatar")
      buildData.buildsData[1].userPic = `../../../../../` + imgPath
      buildData.buildsData[1].tags = []
      if(BD.tags !== undefined)
      {
        let index = 0
        for (let tag of BD.tags) {
          tags.push({
            msg: tag,
            color: tagColor[index],
          });
          index++
        }
        buildData.buildsData[1].tags = tags
      }
    }

    if(BD.raceInfo[0] != undefined)
    {
      buildData.buildsData[1].race_name_en = BD.raceInfo[0].name_en
      buildData.buildsData[1].race_name_cn = BD.raceInfo[0].name_cn
      buildData.buildsData[1].race_img = BD.raceInfo[0].img
    }
    else
    {
      buildData.buildsData[1].race_name_en = 'unknown'
      buildData.buildsData[1].race_name_cn = '未知'
      buildData.buildsData[1].race_img = '../../../../.././plugins/eso/resources/img/races/Dunmer'
    }    

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

    buildData.buildsData[1].gear[0].margin = '52px'
    buildData.buildsData[1].gear[1].margin = '78px'
    buildData.buildsData[1].gear[2].margin = '52px'
    buildData.buildsData[1].gear[3].margin = '78px'
    buildData.buildsData[1].gear[4].margin = '108px'
    buildData.buildsData[1].gear[5].margin = '126px'
    buildData.buildsData[1].gear[6].margin = '114px'
    buildData.buildsData[1].gear[7].margin = '108px'
    buildData.buildsData[1].gear[8].margin = '126px'
    buildData.buildsData[1].gear[9].margin = '114px'
    buildData.buildsData[1].gear[10].margin = '100px'
    buildData.buildsData[1].gear[11].margin = '52px'
    buildData.buildsData[1].gear[12].margin = '100px'
    buildData.buildsData[1].gear[13].margin = '52px'

    for (let i = 0; i < 2; i++) {
      for (let m = 0; m < 6; m++) {
        buildData.buildsData[1].spell[i].bar[m].icon = 'empty'
        buildData.buildsData[1].spell[i].bar[m].color = 'rgb(170, 170, 170)'
        buildData.buildsData[1].spell[i].bar[m].name = 'N/A'
        buildData.buildsData[1].spell[i].bar[m].address = ' '
      }
    }

    let left_weapon = "empty"
    let right_weapon = "empty"
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
          let setData = await this.updateData(setKey, 1)
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
            if(setData.atlasData[1].place == '考古')
            {
              buildData.buildsData[1].gear[index].name_cn = setData.atlasData[1].name
            }
            else
            {
              buildData.buildsData[1].gear[index].name_cn = setData.atlasData[1].name + await this.transTypeName(GI.type, index)
            }
            buildData.buildsData[1].gear[index].name_en = setData.atlasData[1].name_en.replace("Perfected ", "")
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

            if(index == 10)
            {
              if(GI.type == 'Fire Staff')
              {
                left_weapon = 'Destruction_Staff_Fire'
              }
              else if(GI.type == 'Frost Staff')
              {
                left_weapon = 'Destruction_Staff_Ice'
              }
              else if(GI.type == 'Lightning Staff')
              {
                left_weapon = 'Destruction_Staff_Lightning'
              }
              else if(GI.type == 'Healing Staff')
              {
                left_weapon = 'Restoration_Staff'
              }
              else if(GI.type == 'Bow')
              {
                left_weapon = 'Bow'
              }
              else
              {
                left_weapon = 'Two_Handed'
              }
            }

            if(index == 11)
            {
              if(GI.type == 'Shield')
              {
                left_weapon = 'One_Hand_and_Shield'
              }
              else if(GI.type == 'Dagger')
              {
                left_weapon = 'Dual_Wield'
              }
              else if(GI.type == 'Hammer')
              {
                left_weapon = 'Dual_Wield'
              }
              else if(GI.type == 'Sword')
              {
                left_weapon = 'Dual_Wield'
              }
              else if(GI.type == 'Axe')
              {
                left_weapon = 'Dual_Wield'
              }
              else if(GI.type == 'Mace')
              {
                left_weapon = 'Dual_Wield'
              }  
            }

            if(index == 12)
            {
              if(GI.type == 'Fire Staff')
              {
                right_weapon = 'Destruction_Staff_Fire'
              }
              else if(GI.type == 'Frost Staff')
              {
                right_weapon = 'Destruction_Staff_Ice'
              }
              else if(GI.type == 'Lightning Staff')
              {
                right_weapon = 'Destruction_Staff_Lightning'
              }
              else if(GI.type == 'Healing Staff')
              {
                right_weapon = 'Restoration_Staff'
              }
              else if(GI.type == 'Bow')
              {
                right_weapon = 'Bow'
              }
              else
              {
                right_weapon = 'Two_Handed'
              }
            }
  
            if(index == 13)
            {
              if(GI.type == 'Shield')
              {
                right_weapon = 'One_Hand_and_Shield'
              }
              else if(GI.type == 'Dagger')
              {
                right_weapon = 'Dual_Wield'
              }
              else if(GI.type == 'Hammer')
              {
                right_weapon = 'Dual_Wield'
              }
              else if(GI.type == 'Sword')
              {
                right_weapon = 'Dual_Wield'
              }
              else if(GI.type == 'Axe')
              {
                right_weapon = 'Dual_Wield'
              }
              else if(GI.type == 'Mace')
              {
                right_weapon = 'Dual_Wield'
              }
            }

            break
          }
        }
      }
      if(error_set)
      {
        buildData.buildsData[1].gear[index].icon = await this.splitStr(GI.name['image'], '/eso/abilities/', '.')
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

      let imgPath = await getimgs.realpath(buildData.buildsData[1].gear[index].icon, "sets")
      buildData.buildsData[1].gear[index].icon = `../../../../../` + imgPath
    }

    var talentIndex = 0
    let classIcon = ''
    let classStr = ''
    let skillLineInfo = []

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

        let objSkills = await this.name2index(oneTalent['text'],22)
        //logger.info('=======' + oneTalent['text'])
        let skillNum = objSkills.length
        let error_skill = 1;
        if(skillNum == 0 || objSkills[0] == -1)
        {
          //logger.info('=======' + oneTalent)
          let icon_name = oneTalent['icon'].split('/eso/abilities/')[1].split('.')[0]
          let icon_trans_name = 'none'
          objSkills = await this.name2index(icon_name,23)
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
              objSkills = await this.name2index(icon_trans_name,23)
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
              //logger.info(skillsDataCN[enID[0]][enID[1]].name)

              if (!skillLineInfo.some(item => item.line_name === skillsDataCN[enID[0]][enID[1]].name)) {
                let imgPath = await getimgs.realpath(skillLine2class[skillsDataCN[enID[0]][enID[1]].name].class_img, "classes")
                let icon = `../../../../../` + imgPath
                // 添加到结果数组中
                skillLineInfo.push({
                  img: icon,
                  class_name: skillLine2class[skillsDataCN[enID[0]][enID[1]].name].class_name,
                  line_name: skillsDataCN[enID[0]][enID[1]].name
                });
              }
            }
            
            skillNum = objSkills.length
            let skillData = await this.updateData(skillKey, 2)
            if(skillNum == 1 || skillData.atlasData[1].new_en_name == ('<'+oneTalent['text']+'>') || skillData.atlasData[1].new_cn_name == oneTalent['text'])
            {
              buildData.buildsData[1].spell[i].bar[talentIndex].icon = skillData.atlasData[1].new_icon
              buildData.buildsData[1].spell[i].bar[talentIndex].color = oneTalent['color']
              if(cardMode == 1)
              {
                if (skillData.atlasData[1].new_cn_name.length > 5) {
                  buildData.buildsData[1].spell[i].bar[talentIndex].name = skillData.atlasData[1].new_cn_name.slice(0, 4) + '...';
                } else {
                  buildData.buildsData[1].spell[i].bar[talentIndex].name = skillData.atlasData[1].new_cn_name;
                }

                if (skillData.atlasData[1].place_cn.replace("单手武器与盾牌", "剑盾").replace("大招", "大").length > 5) {
                  buildData.buildsData[1].spell[i].bar[talentIndex].address = skillData.atlasData[1].place_cn.replace("单手武器与盾牌", "剑盾").replace("大招", "大").slice(0, 4) + '...';  
                } else {
                  buildData.buildsData[1].spell[i].bar[talentIndex].address = skillData.atlasData[1].place_cn.replace("单手武器与盾牌", "剑盾").replace("大招", "大")
                }
              }
              else
              {
                buildData.buildsData[1].spell[i].bar[talentIndex].name = skillData.atlasData[1].new_cn_name
                buildData.buildsData[1].spell[i].bar[talentIndex].address = skillData.atlasData[1].place_cn.replace("大招", "大")
              }
              error_skill = 0;
              break;
            }
          }
        }

        if(error_skill)
        {
          buildData.buildsData[1].spell[i].bar[talentIndex].icon = oneTalent['icon'].split('/eso/abilities/')[1].split('.')[0]
          buildData.buildsData[1].spell[i].bar[talentIndex].color = oneTalent['color']
          if(cardMode == 1)
          {
            if (oneTalent['text'].length > 5) {
              buildData.buildsData[1].spell[i].bar[talentIndex].name = oneTalent['text'].slice(0, 4) + '...';
            } else {
              buildData.buildsData[1].spell[i].bar[talentIndex].name = oneTalent['text'];
            }
          }
          else
          {
            buildData.buildsData[1].spell[i].bar[talentIndex].name = oneTalent['text']
          }
          buildData.buildsData[1].spell[i].bar[talentIndex].address = '篆刻'
          let imgPath = await getimgs.realpath(buildData.buildsData[1].spell[i].bar[talentIndex].icon, "skills")
          buildData.buildsData[1].spell[i].bar[talentIndex].icon = `../../../../../` + imgPath
        }
      }
      talentIndex++
    }

    if(skillLineInfo.length < 3)
    {
      for (let eachLine of BD.skillLineInfo) {
        if (!skillLineInfo.some(item => item.line_name === eachLine.line_name)) {
          // 添加到结果数组中
          skillLineInfo.push({
            img: eachLine.img,
            class_name: eachLine.class_name,
            line_name: eachLine.line_name
          });
        }
      }
    }
    //logger.info(skillLineInfo)
    buildData.buildsData[1].line = skillLineInfo

    if(BD.className != '' && BD.roleName != '')
    {
      classIcon = BD.className + '_' + BD.roleName
      classStr = BD.roleNameCN + BD.classNameCN
    }

    if(BD.className != '')
    {
      buildData.buildsData[1].class_name_en = BD.className
      buildData.buildsData[1].class_name_cn = BD.classNameCN
    }
    else
    {
      buildData.buildsData[1].class_name_en = ''
      buildData.buildsData[1].class_name_cn = ''
    }

    if(BD.roleName != '')
    {
      buildData.buildsData[1].role_name_en = BD.roleName
      buildData.buildsData[1].role_name_cn = BD.roleNameCN
    }
    else
    {
      buildData.buildsData[1].role_name_en = 'supporter'
      buildData.buildsData[1].role_name_cn = ''
    }

    if(BD.className != '' && BD.roleName == '')
    {
      if(BD.className == 'Warden')
      {
        classIcon = "ON-icon-class-Warden"
        classStr = "守望者"
      }
      else if(BD.className == 'Warden')
      {
        classIcon = "ON-icon-class-Templar"
        classStr = "圣骑士"
      }
      else if(BD.className == 'Warden')
      {
        classIcon = "Dragonknight"
        classStr = "龙骑士"
      }
      else if(BD.className == 'Warden')
      {
        classIcon = "Nightblade"
        classStr = "夜刃"
      }
      else if(BD.className == 'Sorcerer')
      {
        classIcon = "ON-icon-class-Sorcerer"
        classStr = "巫师"
      }
      else if(BD.className == 'Necromancer')
      {
        classIcon = "ON-icon-class-Necromancer"
        classStr = "死灵"
      }
      else if(BD.className == 'Arcanist')
      {
        classIcon = "ON-icon-class-Arcanist"
        classStr = "奥术师"
      }
    }
    buildData.buildsData[1].title = classStr
    buildData.buildsData[1].class = classIcon
    //logger.info(buildData.buildsData[1])
    if(BD.title !== undefined)
    {
      buildData.buildsData[1].title = BD.title
    }
    else
    {
      if(cardMode == 1)
      {
        buildData.buildsData[1].title = '请使用 #设置标题 xxxxx'
      }
    }

    if(buildData.buildsData[1].gear[10].name_cn == 'N/A')
    {
      left_weapon = 'empty'
    }
    if(buildData.buildsData[1].gear[12].name_cn == 'N/A')
    {
      right_weapon = 'empty'
    }

    buildData.buildsData[1].spell_weapon_left = left_weapon
    buildData.buildsData[1].spell_weapon_right = right_weapon


    return buildData
  }

  async updateRankData (BuildTable) {
    let rankData = {
      init: 'none',
      rtData: [{}, {
        table: []
      }]
    }
    if('done' != rankData.init)
    {
      let data = await RankTable.get(this.e, 'builds', 'rank', 'rank')
      if (!data)
      {
        logger.error('[ESO:图鉴] 初始化结构体失败')
        return
      }
      rankData = JSON.parse(JSON.stringify(data))
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

    let imgPath = await getimgs.realpath(rankData.rtData[1].zoneIcon, "zones")
    rankData.rtData[1].zoneIcon = `../../../../../` + imgPath
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
        let imgPath = await getimgs.realpath(oneGear.icon, "sets")
        oneGear.icon = `../../../../../` + imgPath


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
            let setData = await this.updateData(objSets[0], 1)
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
        let imgPath = await getimgs.realpath(icon, "skills")
        icon = `../../../../../` + imgPath

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
    return rankData
  }

  async updateBuffsData (BuffsTable) {
    let stoneInfo = [];
    let foodInfo = [];
    let raceInfo = [];
    let skillLineInfo = [];

    await this.init_database()

    for (let oneBuff of BuffsTable.data) {
      let buffID = await this.splitStr(oneBuff.link, 'ability=', '')
      let buffIcon = await this.splitStr(oneBuff.img, 'abilities/', '.png')
      //logger.info(oneBuff.img)
      //logger.info(buffID)
      //logger.info(oneBuff.buffName)

      //寻找并分辨出梦达斯石头
      if(oneBuff.buffName.includes('Boon:'))
      {
        //logger.info(oneBuff.buffName)
        for (let stone of stones) {
          if(oneBuff.buffName.includes(stone["stone_en"]))
          {
            if (!stoneInfo.some(item => item.name_en === stone["stone_en"])) {
              // 添加到结果数组中
              stoneInfo.push({
                name_en: stone["stone_en"],
                name_cn: stone["stone_zh"],
                img: stone["stone_pic_url"]
              });
            }
          }
        }
      }

      //寻找并分辨出食物
      for (let food of foodBuffs) {
        //logger.info('buffID: ' + buffID + ', foodID: ' + food["buffid"])
        if(food["buffid"] == buffID)
        {
          if (!foodInfo.some(item => item.name_en === food["name_en"])) {
            let img = await this.splitStr(foodsDataCN[food["itemid"]].icon, 'icons/', '.dds')
            let imgPath = await getimgs.realpath(img, "foods")
            let icon = `../../../../../` + imgPath
            // 添加到结果数组中
            foodInfo.push({
              name_en: foodsData[food["itemid"]].name,
              name_cn: foodsDataCN[food["itemid"]].name,
              img: icon
            });
          }       
          break
        }
      }

      //寻找并分辨出种族
      for (let race of raceBuffs) {
        if(race["buffid"] == buffID)
        {
          if (!raceInfo.some(item => item.name_en === race["name_en"])) {
            let imgPath = await getimgs.realpath(race["img"], "races")
            let icon = `../../../../../` + imgPath
            // 添加到结果数组中
            raceInfo.push({
              name_en: race["name_en"],
              name_cn: race["name_cn"],
              img: icon
            });
          }       
          break
        }
      }

      //寻找并分辨出技能线
      if(buffIcon.includes('ability_'))
      {
        continue;
      }
      if(
        (buffIcon == 'ability_dragonknight_025')
         || (buffIcon == 'ability_sorcerer_038')
         || (buffIcon == 'ability_sorcerer_044')
         || (buffIcon == 'ability_sorcerer_045')
         || (buffIcon == 'ability_templar_cleansing_ritual')
         || (buffIcon == 'ability_dragonknight_020')
         || (buffIcon == 'ability_templar_032')
         || (buffIcon == 'ability_dragonknight_021')
         || (buffIcon == 'ability_sorcerer_011')
         || (buffIcon == 'ability_warden_007')
         || (buffIcon == 'ability_sorcerer_013')
         || (buffIcon == 'ability_templar_027')
         || (buffIcon == 'ability_dragonknight_028')
         || (buffIcon == 'passive_sorcerer_046')
         || (buffIcon == 'ability_sorcerer_022')
         || (buffIcon == 'passive_sorcerer_036')
         || (buffIcon == 'ability_templar_022')
         || (buffIcon == 'ability_templar_014')
         || (buffIcon == 'ability_templar_012')
         || (buffIcon == 'ability_dragonknight_023')
        )
      {
        continue;
      }

      if(skillLineBuffs[buffIcon]!= undefined)
      {
        //logger.info(buffIcon)
        if (!skillLineInfo.some(item => item.line_name === skillLineBuffs[buffIcon])) {
          let imgPath = await getimgs.realpath(skillLine2class[skillLineBuffs[buffIcon]].class_img, "classes")
          let icon = `../../../../../` + imgPath
          // 添加到结果数组中
          skillLineInfo.push({
            img: icon,
            class_name: skillLine2class[skillLineBuffs[buffIcon]].class_name,
            line_name: skillLineBuffs[buffIcon]
          });
        }
      }
    }

    let buffsData = {
      stoneInfo: stoneInfo,
      foodInfo: foodInfo,
      raceInfo: raceInfo,
      skillLineInfo: skillLineInfo
    }
    //logger.info(buffsData)

    return buffsData
  }

  async updateData (setKey, type) {
    if(type == 1) //this is name for sets
    {
      return await this.updateSetData(setKey, 0)
    }
    if(type == 2) //this is name for skills
    {
      return await this.updateSkillData(setKey, 0)
    }
    if(type == 3) //this is name for builds
    {
      return await this.updateBuildData(setKey, 0)
    }
    if(type == 4) //this is name for rank
    {
      return await this.updateRankData(setKey)
    }
    if(type == 5) //this is name for buffs
    {
      return await this.updateBuffsData(setKey)
    }
    if(type == 6) //this is name for foods
    {
      return await this.updateFoodData(setKey, 0)
    }
    if(type == 7) //this is name for cards
    {
      return await this.updateBuildData(setKey, 1)
    }

    if(type == 11) //this is name for sets-english
    {
      return await this.updateSetData(setKey, 1)
    }
    if(type == 21) //this is name for skills-english
    {
      return await this.updateSkillData(setKey, 1)
    }
    if(type == 61) //this is name for foods
    {
      await this.updateFoodData(setKey, 1)
      return foodData
    }
  }

  async splitStr (inputStr, beforeStr, afterStr) {
    let sourceStr = inputStr
    let outputStr = ''

    if(inputStr.includes(beforeStr)) {
      let tmpStr1 = inputStr.split(beforeStr)
      if(tmpStr1[1]) {
        if(afterStr != '')
        {
          let tmpStr2 = tmpStr1[1].split(afterStr)
          if(tmpStr2[0]) {
            outputStr = tmpStr2[0]
          }
          else
          {
            outputStr = tmpStr1[1]
          }
        }
        else
        {
          outputStr = tmpStr1[1]
        } 

      } else {
        outputStr = ''
      }
    } else {
      outputStr = ''
    }

    return outputStr
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