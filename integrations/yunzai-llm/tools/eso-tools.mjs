// TRSS-ESO-MANAGED: 由 TRSS ESO 自动部署；删除本项目标记后可安全自行维护。
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const candidates = [
  process.env.ESO_AGENT_TOOL_DEFS,
  path.join(process.cwd(), 'plugins', 'eso', 'agent-tool-defs.js'),
].filter(Boolean)

const entry = candidates.find(file => fs.existsSync(file))
if (!entry) throw new Error('找不到 TRSS ESO 工具定义；可用 ESO_AGENT_TOOL_DEFS 指定 agent-tool-defs.js')

const mod = await import(`${pathToFileURL(entry).href}?tools=${Date.now()}`)
const tools = mod.default ?? mod.tools
if (!Array.isArray(tools) || tools.length === 0) {
  throw new Error('TRSS ESO 工具定义为空')
}

export default tools
