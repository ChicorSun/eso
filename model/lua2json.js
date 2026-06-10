// model/lua2json.js
// 解析 v3 大 lua 文件，拆分为多个小 JSON（按类别），避免单次 JSON.stringify 触发 OOM

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const luaToJson = require('lua-to-json')

// 13 个目标数据类
export const TARGET_CATEGORIES = [
  'dataAchievs',
  'dataOutfitStyles',
  'dataStyles',
  'dataCpSkills',
  'dataAllItems',
  'dataHouses',
  'dataItems',
  'dataRaids',
  'dataAntiquities',
  'dataDyes',
  'dataCollectibles',
  'dataSkills',
  'dataPotions'
]

/**
 * 计算文件 MD5（流式，不 OOM）
 */
export function calculateMD5(filePath) {
  try {
    const hash = crypto.createHash('md5')
    const fileHandle = fs.openSync(filePath, 'r')
    const stats = fs.statSync(filePath)
    const chunkSize = 1024 * 1024
    const buffer = Buffer.allocUnsafe(chunkSize)
    let position = 0
    while (position < stats.size) {
      const bytesRead = fs.readSync(fileHandle, buffer, 0, chunkSize, position)
      if (bytesRead <= 0) break
      hash.update(buffer.slice(0, bytesRead))
      position += bytesRead
    }
    fs.closeSync(fileHandle)
    return hash.digest('hex')
  } catch (error) {
    return null
  }
}

/**
 * 读取 lua 文件（按语言选择编码）
 */
function readLuaFile(luaPath, lang) {
  const buf = fs.readFileSync(luaPath)
  // en 是 cp1252, cn 是 utf-8
  const enc = lang === 'en' ? 'cp1252' : 'utf-8'
  // iconv-lite 在 trss-yunzai 通常有；如果没有，用内置 decoder
  try {
    const iconv = require('iconv-lite')
    return iconv.decode(buf, enc)
  } catch {
    // 退而求其次
    if (enc === 'utf-8') return buf.toString('utf-8')
    return buf.toString('latin1')
  }
}

/**
 * 解析 lua 文件，提取 13 个目标分类的数据
 * @returns {Promise<{categories: object, md5: string, fileSize: number}>}
 */
export async function parseLuaToCategories(luaPath, lang) {
  const stats = fs.statSync(luaPath)
  const fileSize = stats.size
  const md5 = calculateMD5(luaPath)

  // 1. 读取 lua（不同语言不同编码）
  const luaSrc = readLuaFile(luaPath, lang)

  // 2. 解析为完整 JSON
  const json = luaToJson(luaSrc)

  // 3. 提取 AccountWide
  const des = json.DataExtractorSavedVariables
  if (!des?.Default) throw new Error('lua 文件缺少 DataExtractorSavedVariables.Default')
  const accounts = Object.keys(des.Default)
  if (accounts.length === 0) throw new Error('lua 文件无账号数据')
  const firstAccount = accounts[0]
  const acc = des.Default[firstAccount]?.['$AccountWide']
  if (!acc) throw new Error('lua 文件无 $AccountWide 数据')

  // 4. 提取目标分类
  const categories = {}
  for (const cat of TARGET_CATEGORIES) {
    if (acc[cat] !== undefined) {
      categories[cat] = acc[cat]
    }
  }

  return { categories, md5, fileSize }
}

/**
 * 将单个分类数据写入 JSON 文件
 * @param {string} segmentsDir
 * @param {string} lang - 'cn' | 'en'
 * @param {string} category
 * @param {object} data
 */
export async function writeCategoryJson(segmentsDir, lang, category, data) {
  const filename = `${category}${lang.toUpperCase()}.json`
  const filepath = path.join(segmentsDir, filename)
  const jsonStr = JSON.stringify(data)
  await fs.promises.writeFile(filepath, jsonStr, 'utf-8')
  return { filepath, size: Buffer.byteLength(jsonStr, 'utf-8') }
}

/**
 * 主函数：解析 lua 并生成所有分类 JSON 到 segments 目录
 */
export async function generateAllCategoryJsons(luaPath, lang, segmentsDir) {
  // 确保目录存在
  await fs.promises.mkdir(segmentsDir, { recursive: true })

  // 1. 解析 lua（一次性，会 OOM！调用方需保证 lua < 400MB）
  const { categories, md5 } = await parseLuaToCategories(luaPath, lang)

  // 2. 逐个写入（顺序写入以便日志观察）
  const results = []
  for (const cat of TARGET_CATEGORIES) {
    if (categories[cat] !== undefined) {
      const r = await writeCategoryJson(segmentsDir, lang, cat, categories[cat])
      results.push({ category: cat, ...r })
      // 主动释放
      delete categories[cat]
      if (global.gc) global.gc()
    }
  }

  // 3. 写入 segments.md5
  const md5File = path.join(segmentsDir, `segments.${lang}.md5`)
  await fs.promises.writeFile(md5File, md5, 'utf-8')

  return { results, md5, md5File }
}

/**
 * 检查 segments 目录是否有完整的指定语言 JSON
 */
export function checkSegmentsComplete(segmentsDir, lang) {
  for (const cat of TARGET_CATEGORIES) {
    const filename = `${cat}${lang.toUpperCase()}.json`
    const filepath = path.join(segmentsDir, filename)
    if (!fs.existsSync(filepath)) return false
  }
  const md5File = path.join(segmentsDir, `segments.${lang}.md5`)
  if (!fs.existsSync(md5File)) return false
  return true
}

/**
 * 从 segments 目录读取所有分类数据到内存
 */
export function loadSegmentsToMemory(segmentsDir, lang) {
  const result = {}
  for (const cat of TARGET_CATEGORIES) {
    const filename = `${cat}${lang.toUpperCase()}.json`
    const filepath = path.join(segmentsDir, filename)
    if (!fs.existsSync(filepath)) continue
    const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'))
    result[cat] = data
    if (global.gc) global.gc()
  }
  return result
}
