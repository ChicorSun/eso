import fs from 'node:fs'
import path from 'node:path'
import { ensureYunzaiLlmIntegration } from './agent-integration.js'

const llmIntegration = ensureYunzaiLlmIntegration()
if (llmIntegration.installed.length) {
  logger.mark(`[ESO:LLM] 已部署: ${llmIntegration.installed.join(', ')}`)
}
if (llmIntegration.updated.length) {
  logger.mark(`[ESO:LLM] 已更新: ${llmIntegration.updated.join(', ')}`)
}
if (llmIntegration.kept.length) {
  logger.warn(`[ESO:LLM] 检测到用户维护文件，未覆盖: ${llmIntegration.kept.join(', ')}`)
}

const dataCustomeDir = path.join(process.cwd(), 'data', 'eso', 'custome_resources')
const pluginCustomeDir = path.join(process.cwd(), 'plugins', 'eso', 'custome_resources')

if (!fs.existsSync(dataCustomeDir)) {
  if (fs.existsSync(pluginCustomeDir)) {
    fs.mkdirSync(path.dirname(dataCustomeDir), { recursive: true })
    fs.cpSync(pluginCustomeDir, dataCustomeDir, { recursive: true })
    fs.rmSync(pluginCustomeDir, { recursive: true, force: true })
  } else {
    fs.mkdirSync(dataCustomeDir, { recursive: true })
  }
}

if (!global.segment) {
  global.segment = (await import("oicq")).segment
}

const files = fs.readdirSync('./plugins/eso/apps').filter(file => file.endsWith('.js'))

let ret = []

files.forEach((file) => {
  ret.push(import(`./apps/${file}`))
})

ret = await Promise.allSettled(ret)

let apps = {}
for (let i in files) {
  let name = files[i].replace('.js', '')

  if (ret[i].status != 'fulfilled') {
    logger.error(`载入插件错误： ${logger.red(name)}`)
    logger.error(ret[i].reason)
    continue
  }
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}
export { apps }
