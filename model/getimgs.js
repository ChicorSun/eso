import fs from 'node:fs'
import path from 'node:path'

class getimgs {
  async realpath (name, type) {
    let imgPath = `./plugins/eso/resources/img/${type}/${name}.png`
    let customImg = `./data/eso/custome_resources/img/${type}/${name}.png`
    let icon_name = ''

    if (type === 'news' && (typeof name === 'string' && (name.startsWith('http://') || name.startsWith('https://')))) {
      const url = name
      const filename = path.basename(url) || 'news_' + Date.now() + '.jpg'
      const ext = path.extname(filename) || '.jpg'
      const baseName = path.basename(filename, ext) || 'news_' + Date.now()
      const saveName = baseName + ext
      customImg = `./data/eso/custome_resources/img/${type}/${saveName}`

      const dir = path.dirname(customImg)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      if (!fs.existsSync(customImg)) {
        logger.info('[getimgs] 下载新闻封面: ' + url + ' -> ' + customImg)
        try {
          await Bot.download(url, customImg)
        } catch (err) {
          logger.error('[getimgs] 下载新闻封面失败: ' + (err?.message || err))
        }
      }
      return `../../../data/eso/custome_resources/img/${type}/${saveName}`
    }

    if (fs.existsSync(imgPath)) {
      icon_name = `./plugins/eso/resources/img/${type}/${name}`
    } else {
      icon_name = `./data/eso/custome_resources/img/${type}/${name}`
      if (fs.existsSync(customImg)) {
      } else {
        let url = ``
        if (type == `zones`) {
          url = `https://assets.rpglogs.com/img/eso/zones/${name}.png`
        } else if (type == `avatar`) {
          url = `https://q1.qlogo.cn/g?b=qq&nk=${name}&s=160`
        } else if (type == `craftedScripts`) {
          url = `https://storage.esocn.com.cn/esoui/art/icons/${name}.png`
        } else if (type == 'esocn_avatar' && (typeof name === 'string' && (name.startsWith('http://') || name.startsWith('https://')))) {          // ESOCN 头像直接下载
          const url = name
          const filename = path.basename(url) || 'esocn_' + Date.now() + '.jpg'
          const ext = path.extname(filename) || '.jpg'
          const baseName = path.basename(filename, ext) || 'esocn_' + Date.now()
          const saveName = baseName + ext
          customImg = `./data/eso/custome_resources/img/${type}/${saveName}`

          const dir = path.dirname(customImg)
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
          if (!fs.existsSync(customImg)) {
            logger.info('[getimgs] 下载ESOCN头像: ' + url + ' -> ' + customImg)
            try {
              await Bot.download(url, customImg)
            } catch (err) {
              logger.error('[getimgs] 下载ESOCN头像失败: ' + (err?.message || err))
            }
          }
          return `../../../data/eso/custome_resources/img/${type}/${saveName}`
        } else {
          url = `https://esoicons.uesp.net/esoui/art/icons/${name}.png`
        }
        // 确保下载目录存在（craftedScripts 等子目录可能尚未创建）
        const dir = path.dirname(customImg)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        logger.info(url + ' is downloading to ' + customImg + '...')
        let ret = await Bot.download(url, customImg)
      }
    }
    return icon_name
  }
}

export default new getimgs()