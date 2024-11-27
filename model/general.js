import base from './base.js'
import esoCfg from './esoCfg.js'
import cfg from '../../../lib/config/config.js'

export default class General extends base {
  constructor (e) {
    super(e)
    this.model = 'general' /*{{pluResPath}}html/general/general.html*/
  }

  static async get (e, app, name, file) {
    let html = new General(e)
    return await html.getData(app, name, file)
  }

  async getData (app, name, file) {
    let generalData = esoCfg.getdefSet(app, name)

    return {
      init: 'done',
      ...this.screenData,
      saveId: file, /*data/html/xxx/file.tml*/
      version: cfg.package.version,
      generalData
    }
  }
}
