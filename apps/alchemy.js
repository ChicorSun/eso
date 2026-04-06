import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import database, { ALCHEMY_DATA, parseColorTags } from '../model/database.js'
import fs from 'fs'
import path from 'path'

/**
 * 解析炼金配方描述中的颜色标签
 * 将 |Cffffff8536|R 格式转换为带颜色样式的HTML
 * @param {string} text - 原始文本
 * @returns {string} - 处理后的HTML
 */
function parseAlchemyDescription(text) {
  if (text === null || text === undefined) return ''

  // 将换行符转换为 <br>
  text = text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n')
  text = text.replace(/\r\n/g, '<br>').replace(/\n/g, '<br>')

  // 处理 |Cffffff8536|R 或 |cffffff8536|r 格式的颜色标签
  // 转换为 <span style="color: #ffffff;">8536</span>
  text = text.replace(/\|([cC])([0-9a-fA-F]{6})(.*?)\|([rR])/g, (match, c1, color, content, r1) => {
    return `<span style="color: #${color.toLowerCase()};">${content}</span>`
  })

  // 最后使用 parseColorTags 再处理一次（处理BUFF/DEBUFF高亮等）
  text = parseColorTags(text)

  return text
}

// 价格表文件路径
const TTC_DATA_PATH = './plugins/eso/custome_resources/ttc/data/'
const PRICE_TABLE_NA = path.join(TTC_DATA_PATH, 'PriceTableNA.json')
const PRICE_TABLE_EU = path.join(TTC_DATA_PATH, 'PriceTableEU.json')

export class alchemy extends plugin {
  constructor (e) {
    super({
      name: 'ESO:炼金配方',
      dsc: '查询炼金配方',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^#*(炼金配方)$',
          fnc: 'alchemyRecipe'
        },
        {
          reg: '^#*(.+?)配方$',
          fnc: 'alchemyRecipe'
        }
      ]
    })

    // 缓存价格表数据
    this.priceCache = {
      NA: null,
      EU: null,
      loaded: false
    }
  }

  /**
   * 加载价格表数据
   */
  async loadPriceTable() {
    if (this.priceCache.loaded) {
      return this.priceCache
    }

    // 尝试加载美服价格表
    if (fs.existsSync(PRICE_TABLE_NA)) {
      try {
        const data = JSON.parse(fs.readFileSync(PRICE_TABLE_NA, 'utf8'))
        this.priceCache.NA = data.priceTable || data
        logger.info('[炼金配方] 成功加载美服价格表')
      } catch (error) {
        logger.error(`[炼金配方] 加载美服价格表失败: ${error.message}`)
      }
    }

    // 尝试加载欧服价格表
    if (fs.existsSync(PRICE_TABLE_EU)) {
      try {
        const data = JSON.parse(fs.readFileSync(PRICE_TABLE_EU, 'utf8'))
        this.priceCache.EU = data.priceTable || data
        logger.info('[炼金配方] 成功加载欧服价格表')
      } catch (error) {
        logger.error(`[炼金配方] 加载欧服价格表失败: ${error.message}`)
      }
    }

    this.priceCache.loaded = true
    return this.priceCache
  }

  /**
   * 根据物品ID查询销售均价(SA)
   * 价格表结构: 物品ID -> 品质 -> 等级 -> 特质 -> 价格信息(SA等)
   * @param {string} itemId - 物品ID
   * @returns {number|null} - 销售均价，如果没有则返回null
   */
  getSalesAveragePrice(itemId) {
    // 优先使用美服数据
    const servers = ['NA', 'EU']

    for (const server of servers) {
      const priceData = this.priceCache[server]
      if (!priceData) continue

      // 在Data字段中查找（标准TTC结构）
      const dataObj = priceData.Data || priceData
      if (!dataObj) continue

      const itemData = dataObj[String(itemId)]
      if (!itemData) continue

      // 递归遍历所有层级查找SA字段
      const sa = this.findSAInNestedData(itemData)
      if (sa !== null) {
        return sa
      }
    }

    return null
  }

  /**
   * 递归在嵌套数据中查找SA字段
   * @param {object} data - 嵌套数据对象
   * @returns {number|null} - SA值或null
   */
  findSAInNestedData(data) {
    if (typeof data !== 'object' || data === null) {
      return null
    }

    // 如果当前层有SA字段，直接返回
    if (data.SA !== undefined && data.SA !== null) {
      return data.SA
    }

    // 否则递归遍历子对象
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null) {
        const result = this.findSAInNestedData(value)
        if (result !== null) {
          return result
        }
      }
    }

    return null
  }

  async alchemyRecipe (e) {
    // 提取药水名称，如果是 #三回药配方 格式，则提取"三回药"
    const match = e.msg.match(/^#*(.+?)配方$/)
    const medicineName = match && match[1] !== '炼金' ? match[1] : null

    const data = await this.getAlchemyData(medicineName)
    if (!data) {
      if (medicineName) {
        await this.reply(`未找到"${medicineName}"的配方数据，请检查药水名称是否正确。`)
      } else {
        await this.reply('获取炼金配方数据失败，请稍后重试。')
      }
      return false
    }

    const img = await this.renderScreenshot(data)
    if (!img) {
      await this.reply('生成图片失败，请稍后重试。')
      return false
    }

    await this.reply(img)
    return true
  }

  /**
   * 获取炼金配方数据并组装为模板所需结构
   * @param {string} targetMedicine - 指定药水名称，如果为null则返回所有药水
   */
  async getAlchemyData (targetMedicine = null) {
    if (!ALCHEMY_DATA || !ALCHEMY_DATA.medicines || !ALCHEMY_DATA.materials) {
      logger.error('[炼金配方] ALCHEMY_DATA 数据缺失')
      return null
    }

    // 加载价格表
    await this.loadPriceTable()
    const hasPriceData = this.priceCache.NA || this.priceCache.EU

    const { medicines, materials } = ALCHEMY_DATA
    const _path = process.cwd().replace(/\\/g, '/')

    const alchemyData = []

    // 如果指定了药水名称，检查是否存在
    if (targetMedicine && !medicines[targetMedicine]) {
      logger.error(`[炼金配方] 未找到药水: ${targetMedicine}`)
      return null
    }

    // 遍历每种药水
    for (const [medicineName, medicineInfo] of Object.entries(medicines)) {
      // 如果指定了特定药水，跳过其他药水
      if (targetMedicine && medicineName !== targetMedicine) {
        continue
      }
      const recipes = []

      // 处理每个配方
      if (Array.isArray(medicineInfo.Recipes)) {
        for (const recipe of medicineInfo.Recipes) {
          const recipeMaterials = []
          let recipeTotalPrice = 0
          let hasAllPrices = true

          // 处理配方中的每种材料
          for (const materialId of recipe) {
            const material = materials[materialId]
            if (material) {
              // 移除 .png 后缀，模板会自动添加
              const iconName = material.icon.replace(/\.png$/i, '')

              // 查询材料价格
              let price = null
              if (hasPriceData) {
                price = this.getSalesAveragePrice(materialId)
              }

              if (price !== null) {
                recipeTotalPrice += price
              } else {
                hasAllPrices = false
              }

              recipeMaterials.push({
                name: material.Name,
                icon: iconName,
                price: price,
                itemId: materialId
              })
            }
          }

          if (recipeMaterials.length > 0) {
            recipes.push({
              materials: recipeMaterials,
              totalPrice: hasAllPrices ? recipeTotalPrice : null,
              hasAllPrices: hasAllPrices
            })
          }
        }
      }

      // 按总价升序排列配方（有价格的排在前面，按价格从低到高）
      recipes.sort((a, b) => {
        // 如果都有价格，按价格升序
        if (a.totalPrice !== null && b.totalPrice !== null) {
          return a.totalPrice - b.totalPrice
        }
        // 有价格的排在前面
        if (a.totalPrice !== null) return -1
        if (b.totalPrice !== null) return 1
        return 0
      })

      // 格式化描述文本，使用parseAlchemyDescription处理颜色标签
      let description = ''
      if (medicineInfo.Description) {
        const desc = medicineInfo.Description
        description = desc.description || ''
        // 使用parseAlchemyDescription处理颜色标签，将|Cffffff8536|R转换为带颜色样式的HTML
        description = parseAlchemyDescription(description)
      }

      alchemyData.push({
        name: medicineName,
        effects: medicineInfo.Effects || '',
        recipes: recipes,
        description: description,
        hasPriceData: hasPriceData
      })
    }

    return {
      init: 'done',
      saveId: 'alchemy',
      tplFile: './plugins/eso/resources/html/alchemy/alchemy.html',
      pluResPath: `${_path}/plugins/eso/resources/`,
      headStyle: '',
      alchemyData: alchemyData,
      isSingleMedicine: targetMedicine !== null
    }
  }

  /**
   * 使用 puppeteer 渲染截图
   */
  async renderScreenshot (data) {
    try {
      const img = await puppeteer.screenshot('alchemy', data)
      return img
    } catch (error) {
      logger.error(`[炼金配方] 截图生成失败: ${error.message}`)
      return null
    }
  }
}
