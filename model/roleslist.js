import base from './base.js'
import esoCfg from './esoCfg.js'
import cfg from '../../../lib/config/config.js'

export default class RolesList extends base {
  constructor (e) {
    super(e)
    this.model = 'roles' /*{{pluResPath}}html/roles/roles.html*/
  }

  static async get (e, app, name, file) {
    let html = new RolesList(e)
    return await html.getData(app, name, file)
  }

  async getData (app, name, file) {
    let rolesListData = esoCfg.getdefSet(app, name)

    return {
      init: 'done',
      ...this.screenData,
      saveId: file, /*data/html/xxx/file.tml*/
      version: cfg.package.version,
      rolesListData
    }
  }
}
