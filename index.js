#!/usr/bin/env node
'use strict'

const packageInfo = require('./package.json')
const program = require('commander')
const fs = require('fs-extra')
const AnkiDeckGenerator = require('./AnkiDeckGenerator')
const ankiDeckGen = new AnkiDeckGenerator()

program
  .version(packageInfo.version)
  .option('-c, --input-file-chinese <file-path>', 'File containing a json-array of Chinese characters, words and/or sentences')
  .option('-o, --output-folder <folder-path>', 'Folder in which the deck files will be written')
  .parse(process.argv)

if (!program.outputFolder || !program.inputFileChinese) {
    throw new Error("Error, missing required parameter(s)!")
}

let tsvOutput = ''
fs.ensureDir(program.outputFolder).then(() => {
    return fs.readFile(program.inputFileChinese,'utf8')
}).then(fileContents => {
    const chineseInputArr = fileContents.split(/\r?\n/)
    return ankiDeckGen.mmah.getCharData(chineseInputArr).then(dataObj => {
        for (let key in dataObj) {
            let item = dataObj[key]
            let itemData = dataObj[item.character]
            let lineArr = []
            lineArr.push(itemData.character || '')
            lineArr.push(itemData.definition || '')
            lineArr.push(itemData.pinyin ? itemData.pinyin.join(' / ') : '')
            lineArr.push(itemData.decomposition || '')
            lineArr.push(itemData.etymology && itemData.etymology.type ? itemData.etymology.type : '')
            lineArr.push(itemData.etymology && itemData.etymology.hint ? itemData.etymology.hint : '')
            lineArr.push(itemData.etymology && itemData.etymology.phonetic ? itemData.etymology.phonetic : '')
            lineArr.push(itemData.etymology && itemData.etymology.semantic ? itemData.etymology.semantic : '')
            lineArr.push(itemData.radical || '')
            //lineArr.push(itemData.matches || '')
            lineArr.push(itemData.charCode || '')
            lineArr.push(itemData.animatedSvg || '')
            lineArr.push(itemData.stillSvg || '')

            tsvOutput += `${lineArr.join('\t')}\n`
        }
        return tsvOutput
    })
}).then(tsvOutput => {
    return fs.writeFile(`${program.outputFolder}/data.txt`, tsvOutput)
}).then(() => {
    console.log('Done!')
}).catch(console.error)
