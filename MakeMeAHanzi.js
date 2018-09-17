'use strict'

const fs = require('fs')
const readline = require('readline')

class MakeMeAHanzi {
    constructor(conf={}) {
        this.graphicsDataPath = conf.graphicsDataPath || './submodules/makemeahanzi/graphics.txt'
        this.dictPath = conf.dictPath || './submodules/makemeahanzi/dictionary.txt'
        this.animatedSvgsDir = conf.animatedSvgsDir || './submodules/makemeahanzi/svgs'
        this.stillSvgsDir = conf.stillSvgsDir || './submodules/makemeahanzi/svgs-still'
    }
    getCharData(ids, by='char') { // ids can be a single char or charCode or an array of many; 'by' can be 'char' or 'charCode'
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
                if (ids.includes(charData.character)) {
                    charData.charCode = charData.character.charCodeAt()
                    charData.animatedSvg = `${this.animatedSvgsDir}/${charData.charCode}.svg`
                    charData.stillSvg = `${this.stillSvgsDir}/${charData.charCode}-still.svg`
                    const id = (by==='char') ? charData.character : charData.charCode // index by char or by charCode
                    collectedData[id] = charData
                }
            })
        })
    }
}

module.exports = MakeMeAHanzi
