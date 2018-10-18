'use strict'

const fs = require('fs-extra')

async function parseInputFile(inputFile) {
    const inputCfg = { // Defaults
        "version": 1,
        "use-online-services": true,
        "format": "simplified|traditional|pinyin|english|audio",
        "leave-blank-sequence": "{blank}",
        "separator": "|"
    }

    const inputRaw = await fs.readFile(inputFile,'utf8')
    const inputLines = inputRaw.split(/\r?\n/)

    let input = {}
    for (let [i,line] of inputLines.entries()) {
        line = line.trim()
        if (line.startsWith('#!')) {
            if (line.includes('=')) {
                const strippedLine = line.match(/^#!([^#$]+)(#|$)/)[1]
                const cfgArr = line.split('=')
                if (cfgArr.length >= 2) {
                    let key = cfgArr[0].trim().toLowerCase()
                    let value = cfgArr[1].trim().toLowerCase()
                    value = value === "true" ? true : value
                    value = value === "false" ? false : value
                    value = value === "null" ? null : value
                    value = value === "undefined" ? undefined : value
                    inputCfg[key] = value
                }
            }
            continue
        } else if (!line || !line.trim()) {
            continue
        }
        //const lang = line.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/) !== null ? 'cn' : 'en'
        const version = inputCfg['version']
        const deckName = inputCfg['deck']
        if (!input[deckName])
            input[deckName] = {chars:[],words:[],sentences:[]}
        const format = inputCfg['format']
        let sep = inputCfg['separator']
        const blankSeq = inputCfg['leave-blank-sequence']
        const cols = format.split(sep)
        const colItems = line.split(sep)

        line = line + sep.repeat(cols.length-colItems.length) // Seperator fill
        sep = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape for regex use

        let lineRegex = "^"
        for (const [i,item] of cols.entries()) {
            lineRegex += `(?<${cols[i]}>[^${sep}]*)`
            lineRegex += (i < cols.length-1 ? `${sep}` : '$')
        }
        const inputItem = new RegExp(lineRegex,'u').exec(line).groups
        input[deckName].push(inputItem)
    }
    return input
}

module.exports = parseInputFile
