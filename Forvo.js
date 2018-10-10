'use strict'

const cheerio = require('cheerio')
const rp = require('request-promise')
const download = require('download')
const fs = require('fs-extra')

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class Forvo {
    constructor(cacheDir="./anki-audio-dl-cache") {
        this.mainBaseUrl = "https://forvo.com"
        this.searchRoute = "search"
        this.wordRoute = "word"
        this.audioBaseUrl = "https://audio00.forvo.com/mp3"
        this.cacheDir = cacheDir
        this.cacheIndex = `${cacheDir}/index.json`
    }
    async init() {
        this.cache = {}
        if (await fs.pathExists(this.cacheIndex))
            this.cache = await fs.readJson(this.cacheIndex)
    }
    async getAudioUrlsByWord(hanzi, dialect='zh', type='mp3') {
        const cleanHanzi = hanzi.replace(/[，？！。；,\?\!\.\;\s]/g,'')
        const html = await rp(`${this.mainBaseUrl}/${this.wordRoute}/${encodeURIComponent(cleanHanzi)}/`)
        const $ = cheerio.load(html)
        const em = $(`#${dialect}`)
        const article = $(em).closest('article')
        const play = $(article).find('.play')
        const urls = []
        $(play).each((i,el)=>{
            const ls = $(el).closest('li')
            const ofLinkTxt = $(ls).find('.ofLink').contents().first().text()
            const fromTxt = $(ls).find('.from').contents().first().text()
            const name = `_${hanzi} - by ${ofLinkTxt} ${fromTxt}.${type}` //.replace(/ /g, '_')
            const onclickCode = $(el).attr('onclick')
            const encodedUrlCmp = onclickCode.match(/,'([^']+)'/g)[0]
            const decodedUrlCmp = Buffer.from(encodedUrlCmp, 'base64').toString('utf8')
            const url = `${this.audioBaseUrl}/${decodedUrlCmp}`
            urls.push({url,name})
        })
        return urls
    }
    async getAudioUrlsByPhrase(hanzi, dialect='zh', type='mp3') {
        const cleanHanzi = hanzi.replace(/[，？！。；,\?\!\.\;\s]/g,'')
        const html = await rp(`${this.mainBaseUrl}/${this.searchRoute}/${encodeURIComponent(cleanHanzi)}/`)
        const $ = cheerio.load(html)
        const playEls = []
        $('.play').each((i,el)=>{
            playEls.push($(el))
        })
        const filteredPlayEls = playEls.filter((el,i)=>{
            const cleanTitle = el.attr('title').replace(/[，？！。；,\?\!\.\;\s]/g,'')
            return cleanTitle === `Listen${cleanHanzi}pronunciation`
        })
        const urls = []
        filteredPlayEls.forEach((el,i)=>{
            const name = `_${hanzi} - by Forvo (${i}).${type}`
            const onclickCode = el.attr('onclick')
            const encodedUrlCmp = onclickCode.match(/,'([^']+)'/g)[0]
            const decodedUrlCmp = Buffer.from(encodedUrlCmp, 'base64').toString('utf8')
            const url = `${this.audioBaseUrl}/${decodedUrlCmp}`
            urls.push({url,name})
        })
        return urls
    }
    async getAudioUrls(hanzi, dialect='zh', type='mp3') {
        if (hanzi.includes(' '))
            return this.getAudioUrlsByPhrase(hanzi, dialect, type)
        else
            return this.getAudioUrlsByWord(hanzi, dialect, type)
    }
    async downloadAudio(targetDir, hanzi, dialect='zh', type='mp3', overwrite=false, maxDls=2, sleepBetweenDls=5000) {
        if (this.cache[hanzi]) {
            return this.cache[hanzi].map(item=>`${targetDir}/${item}`)
        }
        /*
        let existingFiles = await fs.readdir(`${targetDir}`)
        existingFiles = existingFiles.map(file=>file.split(/(\\|\/)/g).pop())
        const regex = new RegExp(`^_${hanzi} - .+\.mp3$`, 'g');
        existingFiles = existingFiles.filter(file=>file.match(regex))
        existingFiles = existingFiles.map(file=>`${targetDir}/${file}`)
        if (existingFiles.length > 0)
            return existingFiles //.map(file=>file.split(/(\\|\/)/g).pop())
        */
        const urls = await this.getAudioUrls(hanzi,dialect,type)
        const fullFilenames = []
        const filenames = []
        for (const [i,urlObj] of urls.entries()) {
            if (i!==0 && i>maxDls && maxDls!==0)
                break
            const filename = urlObj.name //`${hanzi}-${i}.mp3`
            const targetFile = `${targetDir}/${filename}`
            if (!overwrite && await fs.pathExists(targetFile)) {
                filenames.push(filename)
                fullFilenames.push(targetFile)
                continue
            }
            await download(urlObj.url, targetDir, {filename})
            sleep(sleepBetweenDls)
            filenames.push(filename)
            fullFilenames.push(targetFile)
        }
        this.cache[hanzi] = filenames

        return fullFilenames
    }
}
module.exports = Forvo
