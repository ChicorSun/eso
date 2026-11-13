import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE_ROOT = path.join(HERE, 'integrations', 'yunzai-llm')
const OWNED_MARKER = 'TRSS-ESO-MANAGED'

const FILES = [
  ['tools/eso-tools.mjs', 'tools/eso-tools.mjs'],
  ['skills/eso-data/SKILL.md', 'skills/eso-data/SKILL.md'],
]

function isManaged(file) {
  try {
    return fs.readFileSync(file, 'utf8').includes(OWNED_MARKER)
  } catch {
    return false
  }
}

/**
 * Deploy the Yunzai-LLM-Plugin integration files bundled with TRSS ESO.
 * Existing user-owned files are never overwritten unless they contain our marker.
 */
export function ensureYunzaiLlmIntegration ({ root = process.cwd() } = {}) {
  const llmPlugin = path.join(root, 'plugins', 'Yunzai-LLM-Plugin')
  if (!fs.existsSync(llmPlugin)) {
    return { skipped: true, installed: [], updated: [], kept: [], reason: 'Yunzai-LLM-Plugin 未安装' }
  }

  const configRoot = path.join(root, 'config', 'Yunzai-LLM-Plugin')
  const installed = []
  const updated = []
  const kept = []

  for (const [relative, templateRelative] of FILES) {
    const source = path.join(TEMPLATE_ROOT, templateRelative)
    const target = path.join(configRoot, relative)
    if (!fs.existsSync(source)) continue
    fs.mkdirSync(path.dirname(target), { recursive: true })

    const content = fs.readFileSync(source, 'utf8')
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, content)
      installed.push(relative)
      continue
    }

    const current = fs.readFileSync(target, 'utf8')
    if (current === content) continue
    if (!isManaged(target)) {
      kept.push(relative)
      continue
    }
    fs.writeFileSync(target, content)
    updated.push(relative)
  }

  return { skipped: false, installed, updated, kept, configRoot }
}
