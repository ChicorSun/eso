import fs from 'node:fs'

class getimgs {
  async realpath (name, type) {
    let findSet = false
    let imgPath = `./plugins/eso/resources/img/${type}/${name}.png`
    let customImg = `./plugins/eso/custome_resources/img/${type}/${name}.png`
    let icon_name = ''

    if (fs.existsSync(imgPath)) {
      //logger.info(imgPath + ` is exist.`)
      icon_name = `./plugins/eso/resources/img/${type}/${name}`
    } else {
      icon_name = `./plugins/eso/custome_resources/img/${type}/${name}`
      if (fs.existsSync(customImg)) {
        //logger.info(customImg + ` is exist.`)
      } else {
        logger.info(customImg + ` is not exist, now download it.`)
        let url = ``
        if(type == `zones`)
        {
          url = `https://assets.rpglogs.com/img/eso/zones/${name}.png`
        } else if (type == `avatar`) {
          url = `https://q1.qlogo.cn/g?b=qq&nk=${name}&s=160`
        } else {
          url = `https://eso-hub.com/storage/icons/${name}.png`
        }
        let ret = await Bot.download(url, customImg)
      }
    }
    return icon_name
  }
}

export default new getimgs()