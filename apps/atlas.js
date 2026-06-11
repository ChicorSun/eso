import plugin from '../../../lib/plugins/plugin.js'
import common from '../../../lib/common/common.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import database, { detectBuffDebuffInText, isSetIndexResultEmpty } from '../model/database.js'
import moment from 'moment'
import md5 from 'md5'

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
          /** 游戏内物品链接等：任意文本中含 item:205008: 即查 #ITEMID205008 */
          reg: /item:\d+:/i,
          fnc: 'showAtlasByItemLink'
        },
        {
          /** 命令正则匹配 */
          reg: '^#.*$',
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


  /** 从消息中解析 item:数字:（与 #ITEMID数字 等价） */
  extractItemIdFromLink (text) {
    const match = String(text || '').match(/item:(\d+):/i)
    return match ? match[1] : null
  }

  async showAtlasByItemLink (e) {
    const text = await this.trimText(e)
    const itemId = this.extractItemIdFromLink(text)
    if (!itemId) return 0
    return await this.showSets(e, `#ITEMID${itemId}`)
  }

  async showAtlas (e) {
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
      const buffHandled = await this.tryShowBuffDebuffAtlas(e, name)
      if (buffHandled) return buffHandled
      await this.showSets(e)
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

    const entry = await database.findBuffDebuffByExactName(query)
    if (!entry) return false

    const displayName = entry.displayName || entry.name

    const setKeys = await database.setIdsToSetKeys(entry.setsList || [])
    const skillKeys = await database.skillIdsToSkillIndices(entry.skillsList || [])
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
      
      let img = await this.cache(setData, setImg)
      await this.reply(img)
    }
  }

  // 计算未来两次无畏者副本出现特定装备的日期
  async getUndauntedDates(setName) {
    try {
      // 获取无畏者数据库
      const setsData = await database.getSetsEN()
      const setsDataCN = await database.getSetsCN()
      const dgSetsTable = await database.getdgSets()
      const numDungeons = await database.getDgNum()

      // 无畏者副本序号校准码
      const adjust = [4, 4, 1]
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
            let class_str = '(' + skillData.atlasData[1].type_en + ')'
            msgList += `\n*`+skillData.atlasData[1].new_cn_name+'图鉴'+class_str
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
      showEnglish = true
    }


    if((skillNum >= 4 && skillNum <= 25) || noMaxLimit)
    {
      let msgList = '我猜您想问的是以下技能之一？'
      for (let skillKey of objSkills) {
        skillData = await database.updateData(skillKey, 2)
        let class_str = '(' + skillData.atlasData[1].type_en + ')'
        msgList += `\n*`+skillData.atlasData[1].new_cn_name+'图鉴'+class_str
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
    const layoutVer = 'atlasCardV11'
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
