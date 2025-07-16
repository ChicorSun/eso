import base from './base.js'
import esoCfg from './esoCfg.js'
import cfg from '../../../lib/config/config.js'

export default class TTC extends base {
  constructor (e, modelType = 'ttc') {
    super(e)
    this.modelType = modelType
    // 保持原有的model设置
    this.model = 'ttc'
    // 添加_path属性用于screenData
    this._path = process.cwd().replace(/\\/g, '/')
  }

  static async get (e, app, name, file) {
    // 如果file参数是'trade'，则使用交易模板
    let modelType = file === 'trade' ? 'trade' : 'ttc'
    let html = new TTC(e, modelType)
    return await html.getData(app, name, file)
  }

  get screenData () {
    // 根据模型类型选择不同的模板文件
    const templateFile = this.modelType === 'trade' ? 'trade.html' : 'ttc.html'
    
    return {
      saveId: this.userId,
      cwd: this._path,
      tplFile: `./plugins/eso/resources/html/ttc/${templateFile}`,
      /** 绝对路径 */
      pluResPath: `${this._path}/plugins/eso/resources/`,
      headStyle: ``
    }
  }

  async getData (app, name, file) {
    let ttcData = esoCfg.getdefSet(app, name)

    return {
      init: 'done',
      ...this.screenData,
      saveId: file, /*data/html/xxx/file.html*/
      version: cfg.package.version,
      ttcData
    }
  }
} 