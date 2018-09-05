'use strict'

const cheerio = require('cheerio')
const rp = require('request-promise')
const download = require('download')
const fs = require('fs-extra')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class Forvo {
    constructor() {
        this.searchBaseUrl = "https://forvo.com/word"
        this.audioBaseUrl = "https://audio00.forvo.com/audios/mp3"
    }
    async getAudioUrls(hanzi, dialect='zh', type='mp3') {
        const html = await rp(`${this.searchBaseUrl}/${encodeURIComponent(hanzi)}/`)
        const $ = cheerio.load(html)
        const em = $(`#${dialect}`)
        const article = $(em).closest('article')
        const play = $(article).find('.play')

        const urls = []
        $(play).each((i,el)=>{
             const onclickCode = $(el).attr('onclick')
             const encodedUrlCmp = onclickCode.match(/,'([^']+)'/g)[2]
             const decodedUrlCmp = new Buffer(encodedUrlCmp, 'base64').toString('utf8')
             const url = `${this.audioBaseUrl}/${decodedUrlCmp}`
             urls.push(url)
        })
        return urls
    }
    async downloadAudio(targetDir, hanzi, dialect='zh', type='mp3', overwrite=false, maxDls=0, sleepBetweenDls=100) {
        const urls = await this.getAudioUrls(hanzi,dialect,type)
        const filenames = []
        for (const [i,url] of urls.entries()) {
            if (i!==0 && i>maxDls)
                break
            const filename = `${hanzi}-${i}.mp3`
            const targetFile = `${targetDir}/${filename}`
            if (!overwrite && await fs.pathExists(targetFile)) {
                filenames.push(targetFile)
                continue
            }

            await download(url, targetDir, {filename})
            sleep(sleepBetweenDls)
            filenames.push(targetFile)
        }
        return filenames
    }
}
module.exports = Forvo
