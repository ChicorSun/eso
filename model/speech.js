import base from './base.js'
import esoCfg from './esoCfg.js'
import cfg from '../../../lib/config/config.js'

export default class Speech extends base {
  constructor (e) {
    super(e)
    this.model = 'speech' /*{{pluResPath}}html/speech/speech.html*/
  }

  static async get (e, app, name, file) {
    let html = new Speech(e)
    return await html.getData(app, name, file)
  }

  async getData (app, name, file) {
    let speechData = esoCfg.getdefSet(app, name)

    return {
      init: 'done',
      ...this.screenData,
      saveId: file, /*data/html/xxx/file.tml*/
      version: cfg.package.version,
      speechData
    }
  }
}
