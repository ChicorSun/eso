/**
 * ESOCN API 常量（独立模块）
 *
 * 独立成模块以避免 apps ↔ model 之间的循环依赖：
 *   apps/esocn.js（绑定/查询） 与 model/patSync.js（成就同步）都从这里取 BASE_URL / TOKEN。
 */
export const ESOCN_API = {
  BASE_URL: 'https://api.esocn.com.cn',
  TOKEN: 'ESOCN_ESOBOT_SECURE_v1_d8f2a4e9b7c10d5e3a6f8b2c4d9e0a1f72b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7',
}
