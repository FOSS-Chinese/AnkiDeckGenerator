'use strict'

const fs = require('fs')
const readline = require('readline')

class MakeMeAHanzi {
    constructor(conf={}) {
        this.sourcePath = conf.sourcePath || './submodules/makemeahanzi'
        this.graphicsDataPath = `${conf.sourcePath}/graphics.txt`
        this.dictPath = `${conf.sourcePath}/dictionary.txt`
        this.animatedSvgsDir = `${conf.sourcePath}/svgs`
        this.stillSvgsDir = `${conf.sourcePath}/svgs-still`
    }
    getCharData(ids, by='char', generateAll=false, fieldMapping={definition:'english',character:'simplified'}) { // ids can be a single char or charCode or an array of many; 'by' can be 'char' or 'charCode'
        return new Promise((resolve,reject) => {
            ids = Array.isArray(ids) ? ids : [ids] // ensure array
            ids = (by==='char') ? ids : ids.map(charCode=>charCode.charCodeAt(0)) // convert ids to chars
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
                const charData = JSON.parse(line)

                if (generateAll || ids.includes(charData.character)) {
                    charData.charCode = charData.character.charCodeAt()
                    charData.pinyin = charData.pinyin ? charData.pinyin : []
                    charData.definition = charData.definition ? charData.definition.split(/\s?[;,]\s?/) : [] //TODO: consider only splitting by ;
                    charData.animatedSvg = `${this.animatedSvgsDir}/${charData.charCode}.svg`
                    charData.stillSvg = `${this.stillSvgsDir}/${charData.charCode}-still.svg`
                    const id = (by==='char') ? charData.character : charData.charCode // index by char or by charCode
                    for (const [oldFieldName,newFieldName] of Object.entries(fieldMapping)) {
                        charData[newFieldName] = charData[oldFieldName]
                        delete charData[oldFieldName]
                    }
                    collectedData[id] = charData // TODO: is that a good idea? (input by charCode causes output by charCode)
                }
            })
        })
    }
}

module.exports = MakeMeAHanzi
