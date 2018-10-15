'use strict'

const readline = require('readline')
const download = require('download')
const fs = require('fs-extra')
const pinyinUtils = require('pinyin-utils')
const JSZip = require("jszip")
const jszip = new JSZip()

class Mdbg {
    constructor(dictPath='./cedict_ts.u8') {
        this.dictPath = dictPath
        this.zipName = 'cedict_1_0_ts_utf-8_mdbg.zip'
        this.downloadUrl = `https://www.mdbg.net/chinese/export/cedict/${this.zipName}`
        this.dictName = 'cedict_ts.u8'
        //this.daysBetweenUpdates = daysBetweenUpdates
        this.lineRegex = /(?<traditional>[^\s]+)\s(?<simplified>[^\s]+)\s\[(?<pinyin>[^\]]+)\]\s\/(?<english>.+)\//u
    }
    async init() {
        if (await fs.pathExists(this.dictPath)) {
            console.log(`Using cached cedict.`)
        } else {
            console.log(`Downloading cedict...`)
            await download(this.downloadUrl, './', {filename:this.zipName})
            const zipContent = await fs.readFile(`./${this.zipName}`)
            const zip = await jszip.loadAsync(zipContent)
            const dictFileContent = await jszip.file(this.dictName).async('string')
            await fs.outputFile(this.dictPath, dictFileContent)
            await fs.remove(`./${this.zipName}`)
        }
    }
    _lineToObj(line) {
        const result = this.lineRegex.exec(line).groups
        result.english = result.english.split('/')
        result.pinyin = result.pinyin.split(' ').map(pinyin=>pinyinUtils.numberToMark(pinyin.replace(/u:/g,'ü'))).join(' ')
        return result
    }
    async getEntryByHanzi(hanziArr,simplified=true,generateAll=false) {
        return new Promise((resolve,reject) => {
            hanziArr = Array.isArray(hanziArr) ? hanziArr : [hanziArr]
            hanziArr = hanziArr.map(hanzi=>hanzi.replace(/[，？！。；,\?\!\.\;\s]/g,''))
            let collectedData = {}

            const fileStream = fs.createReadStream(this.dictPath)
            fileStream.on('end', () => {
                resolve(collectedData)
            })
            fileStream.on('error',reject)

            const lineReader = readline.createInterface({
                input: fileStream
            })
            lineReader.on('line', line => {
                if (line.startsWith('#'))
                    return
                const result = this._lineToObj(line)

                if (generateAll || (simplified && hanziArr.includes(result.simplified)) || (!simplified && hanziArr.includes(result.traditional))) {
                    if (!simplified && hanziArr.includes(result.traditional))
                        collectedData[result.traditional] = result
                    else
                        collectedData[result.simplified] = result
                }
            })
        })
    }
}

module.exports = Mdbg
