import fs from 'fs'
import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import Speech from '../model/speech.js'
import getimgs from '../model/getimgs.js'
import md5 from 'md5'

//发言榜榜单上限人数
let lul = 20

//speech结构体变量
let speechData = {
}

//cacheData to save img
let speechImg = {
  md5: '',
  img: ''
}

export class speechStatic extends plugin {
    constructor () {
      super({
        name: 'ESO:发言次数统计',
        dsc: '发言次数统计',
        event: 'message',
        priority: -1,
        rule: [
          {
            reg: '',
            fnc: 'snots',
            log: false
          }, {
            reg: '^#发言榜(日榜|月榜)?$',
            fnc: 'speechTally'
          }
        ]
      })
    }
    async speechTally(e) {
        let user_msg = e.msg.match(/^#发言榜(日榜|月榜)?$/)
        let data
        try {
            if(!user_msg[1] || user_msg[1] == `日榜`) {
                let date = await gettoday()
                data = fs.readFileSync(`./data/${e.group_id}_snots/${date}.json`, `utf-8`)
            } else {
                let month = await getmonth()
                data = fs.readFileSync(`./data/${e.group_id}_snots/${month}.json`, `utf-8`)
            }
            data = JSON.parse(data)
        } catch {
            e.reply(`本群好像还没人说过话呢~`)
            return true
        }
        data.sort((a, b) => b.number - a.number)
        data = data.slice(0, lul)
        
        if('done' != speechData.init)
        {
            let spData = await Speech.get(this.e, 'speech', 'speech', 'speechStatic')
            if (!spData)
            {
                logger.error('[ESO:发言次数统计] 初始化结构体失败')
                return
            }
            speechData = spData
            //logger.info('[ESO:图鉴] 初始化结构体变量')
        }
        if(!user_msg[1] || user_msg[1] == `日榜`)
        {
            speechData.speechData[1].type = '(Today)'
        }
        else
        {
            speechData.speechData[1].type = '(This Month)'
        }
        
        //logger.info(data)
        speechData.speechData[1].person = []

        let msg = [`本群发言榜${user_msg[1] || `日榜`}如下:\n--------`]
        let paiming = 0
        let maxValue = 1
        for (let item of data) {
            let onePerson = {
                id: `id`,
                value: `100`,
                width: `390`,
                bar_color: 'rgb(58, 146, 254)',
                index: '',
                name: `name`
            };

            let imgPath = await getimgs.realpath(item.user_id, "avatar")
            onePerson.id = `../../../../../` + imgPath

            if(paiming == 0)
            {
                onePerson.width = 391
                maxValue = item.number
            }
            else
            {
                onePerson.width = 391*item.number/maxValue
            }

            onePerson.value = item.number
            
            if(paiming<9)
            {
                onePerson.index = `0${paiming+1}.`
            }
            else
            {
                onePerson.index = `${paiming+1}.`
            }

            onePerson.name = item.nickname
            if(item.nickname)
            {
                onePerson.name = item.nickname
            }
            else
            {
                onePerson.name = `qq${item.user_id}`
            }

            if (onePerson.name.length > 18) {
                onePerson.name = onePerson.name.substring(0, 18) + '...';
            }
            
            speechData.speechData[1].person.push(onePerson);
            paiming++
            msg.push(`\n第${paiming}名：${item.nickname}·${item.number}次`)
        }
        //await e.reply(msg)

        //logger.info(speechData.speechData[1])
        let img = await this.cache(speechData, speechImg)
        await this.reply(img)
        return true
    }
    async snots(e){
        if(!fs.existsSync(`./data/${e.group_id}_snots`)) {
            fs.mkdirSync(`./data/${e.group_id}_snots`)
        }
        let data;
        let date = await gettoday()
        try {
            data = fs.readFileSync(`./data/${e.group_id}_snots/${date}.json`, `utf-8`)
            data = JSON.parse(data)
        } catch {
            data = []
        }
        let temp_data = []
        for (let item of data) {
            if(item.user_id == e.user_id) temp_data.push(item)
        }
        if (temp_data.length > 0) {
            await deljson(temp_data[0], `./data/${e.group_id}_snots/${date}.json`)
            await autochuli(temp_data, `./data/${e.group_id}_snots/${date}.json`)
        } else {
            let user_data = {
                user_id: e.user_id,
                nickname: e.sender.card || e.sender.nickname || `用户${e.user_id}`,
                number: 1
            }
            data.push(user_data)
            data = JSON.stringify(data, null, 3)
            fs.writeFileSync(`./data/${e.group_id}_snots/${date}.json`, data, `utf-8`)
        }
        let month = await getmonth()
        try {
            data = fs.readFileSync(`./data/${e.group_id}_snots/${month}.json`, `utf-8`)
            data = JSON.parse(data)
        } catch {
            data = []
        }
        temp_data = []
        for (let item of data) {
            if(item.user_id == e.user_id) temp_data.push(item)
        }
        if(temp_data.length > 0) { 
            await deljson(temp_data[0], `./data/${e.group_id}_snots/${month}.json`)
            await autochuli(temp_data, `./data/${e.group_id}_snots/${month}.json`)
        } else {
            let user_data = {
                user_id: e.user_id,
                nickname: e.sender.card || e.sender.nickname || `用户${e.user_id}`,
                number: 1
            }
            data.push(user_data)
            data = JSON.stringify(data, null, 3)
            fs.writeFileSync(`./data/${e.group_id}_snots/${month}.json`, data, `utf-8`)
        }
        return false
    }

    async cache (data, cachedata) {
        let tmp = md5(JSON.stringify(data))
        if (cachedata.md5 == tmp) return cachedata.img

        //cachedata.img = 0
        cachedata.img = await puppeteer.screenshot('eso', data) /*html file saved in folder data/html/eso/ */
        cachedata.md5 = tmp

        return cachedata.img
    }
}

async function autochuli(data, filePath) {
    data[0].number++
    let new_data = fs.readFileSync(filePath, `utf-8`)
    new_data = JSON.parse(new_data)
    new_data.push(data[0])
    new_data = JSON.stringify(new_data, null, 3)
    fs.writeFileSync(filePath, new_data)
}
/**
 * 删除JSON数组内容
 * @param {*} deldata 要删除的数据
 * @param {string} filePath 路径
 */
async function deljson(deldata, filePath) {
    try {
        let data = fs.readFileSync(filePath, 'utf-8');
        data = JSON.parse(data);
        if (!Array.isArray(data)) return false;
        let filteredData = []
        for (let item of data) {
            item = JSON.stringify(item)
            deldata = JSON.stringify(deldata)
            if(item != deldata) {
                item = JSON.parse(item)
                filteredData.push(item)
                deldata = JSON.parse(deldata)
            }
        }

        const tempData = JSON.stringify(filteredData, null, 3);
        fs.writeFileSync(filePath, tempData, 'utf-8');
        return true;
    } catch (error) {
        console.error('Error processing the file', error);
        return false;
    }
}

async function gettoday(){
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const day = currentDate.getDate().toString().padStart(2, '0');
    const date_time = `${year}-${month}-${day}`;
    return date_time;
}

async function getmonth() {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const date_time = `${year}-${month}`;
    return date_time;
}
