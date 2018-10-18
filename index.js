#!/usr/bin/env node
'use strict'

const program = require('commander')
const fs = require('fs-extra')
const JSZip = require("jszip")
const mustache = require('mustache')
const OpenCC = require('opencc')
const cliProgress = require('cli-progress')
global.Promise = require('bluebird')
Promise.longStackTraces()

const packageInfo = require('./package.json')
const AnkiPackage = require('./libs/AnkiPackage')
const MakeMeAHanzi = require('./libs/MakeMeAHanzi')
const Forvo = require('./libs/Forvo')
const ArchChinese = require('./libs/ArchChinese')
const Mdbg = require('./libs/Mdbg')


const opencc = new OpenCC('s2t.json')
const forvo = new Forvo()
const mdbg = new Mdbg()
const archChinese = new ArchChinese()
let archChineseCache = {}
let archchineseCacheFile = './cache/archchinese-cache.json'

program
    .command('auto-generate <apkg-output-file>')
    .option('-c, --input-file [file-path]', 'File containing a json-array of Chinese characters, words and/or sentences')
    .option('-n, --deck-name <string>', 'Name of the deck to be created')
    .option('-d, --deck-description <string>', 'Name of the deck to be created')
    .option('-t, --temp-folder [folder-path]', 'Folder to be used/created for temporary files')
    .option('-l, --libs-folder [folder-path]', 'Folder holding libraries for template')
    .option('-a, --audio-recordings-limit [integer]', 'Max amount of audio recordings to download for each character, word and sentence. (-1: all, 0: none, 1: one, 2: two) Default: 1')
    .option('-r, --recursive-dict [boolean]', 'Download media and dict info not only for input file entries, but also for every single word, character and component found in each entry. Default: true')
    .option('-r, --recursive-cards [boolean]', 'Add cards not only for input file entries, but also for every single word, character and component found in each entry. Default: false')
    .option('-p, --dictionary-priority-list [comma-separated-string]', 'List of dictionaries (offline and online) to gather data from. (highest priority first. Default: makemeahanzi,mdbg,forvo,archchinese)')
    .action((apkgFile, cmd) => {
        autoGenerate(apkgFile, cmd).then(console.log).catch(err=>{
            fs.outputJson(archchineseCacheFile,archChineseCache).then(()=>{}).catch(e=>console.error)
            console.error(err)
        })
    })
program.parse(process.argv)

async function autoGenerate(apkgFile, cmd) {
    cmd.tempFolder = cmd.tempFolder || './anki-deck-generator-temp'
    cmd.deckName = cmd.deckName || "NewDeck"
    cmd.deckDescription = cmd.deckDescription || "A new deck"
    cmd.libs = cmd.libs || './template-libs'

    cmd.recursiveDict = cmd.recursiveDict===false ? false : true
    cmd.recursiveCards = cmd.recursiveCards===true ? true : false

    forvo.init()
    mdbg.init()
    const apkg = new AnkiPackage(cmd.deckName, cmd.tempFolder)

    const mmah = new MakeMeAHanzi({sourcePath: './submodules/makemeahanzi'})

    const fields = [
        {
            name: "hanzi",
            displayName: "Hànzì",
            html: `<span class="hanzi" id="base-hanzi">{{hanzi}}</span>`,
            center: true
        }, {
            name: "pinyin",
            displayName: "Pīnyīn",
            html: `<span class="pinyin" id="base-pinyin">{{pinyin}}</span>`,
            center: true
        }, {
            name: "english",
            displayName: "English",
            html: `<span class="english">{{english}}</span>`,
            center: true
        }, {
            name: "chineseAudio",
            displayName: "Chinese Audio",
            html: `<div class="chinese-audio"></div>`, // content will be generated
            center: true,
            skipField: true
        }
    ]

    await fs.emptyDir(cmd.tempFolder)
    await fs.writeFile(`${cmd.tempFolder}/media`, '{}')
    await apkg.addMedia([`${cmd.libs}/_jquery-3.js`,`${cmd.libs}/_bootstrap-3.js`,`${cmd.libs}/_bootstrap-3.css`,`${cmd.libs}/_bootstrap-3-theme.css`])

    if (await fs.pathExists(archchineseCacheFile))
        archChineseCache = await fs.readJson(archchineseCacheFile)

    const inputRaw = await fs.readFile(cmd.inputFile,'utf8')
    const inputLines = inputRaw.split(/\r?\n/)
    const apkgCfg = await apkg.init()
    const baseDeck = await apkg.addDeck({
        name: cmd.deckName,
        desc: cmd.deckDescription
    })

    let sectionCount = -1
    function generateCollapsablePanel(heading,content,center,showByDefault) {
        if (!heading)
            return ''
        sectionCount++
        return `
            <div class="panel panel-primary">
              <div class="panel-heading" onclick="$('#collapse-${sectionCount}').toggle()">
                <h4 class="panel-title">
                  ${heading}
                </h4>
              </div>
              <div id="collapse-${sectionCount}" class="panel-collapse collapse ${showByDefault ? 'in' : ''}">
                <div class="panel-body ${center ? 'text-center' : ''}">
                  ${content}
                </div>
              </div>
            </div>
        `
    }

    async function generateTemplateHtml(fields) {
        let collapsablePanels = ''
        for (let [i,field] of fields.entries()) {
            const content = field.html || `{{${field.name}}}`
            collapsablePanels += generateCollapsablePanel(field.displayName, content, !!field.center, i===0)
        }
        collapsablePanels += generateCollapsablePanel("Debug", `
            <div class="form-group">
                <textarea class="form-control rounded-0" id="debug-input" rows="5" onkeypress="if (event.keyCode == 13 && !event.shiftKey) { try { document.getElementById('debug-output').innerHTML=eval(document.getElementById('debug-input').value); } catch(e) { document.getElementById('debug-output').innerHTML=e; }; return false; }">jQuery.fn.jquery</textarea>
            </div>
            <div class="form-group">
                <button onclick="try { document.getElementById('debug-output').innerHTML=eval(document.getElementById('debug-input').value); } catch(e) { document.getElementById('debug-output').innerHTML=e; }" class="btn btn-danger btn-block">Execute</button>
            </div>
            <div class="form-group">
                <textarea readonly class="form-control rounded-0" id="debug-output" rows="5"></textarea>
            </div>
        `, false, false)
        const afmtTpl = await fs.readFile('./templates/afmt.mustache.html','utf8')
        const afmtTplView = {
            collapsablePanels: collapsablePanels,
            baseDeckId: baseDeck.baseConf.id,
            deckType: fields[0].name,
            panelCount: sectionCount
        }
        return mustache.render(afmtTpl, afmtTplView)
    }

    const questionSkipTemplate = await fs.readFile('./templates/qfmt.mustache.html','utf8')

    const decks = []
    const templates = []
    for (const [i,field] of fields.entries()) {
        const reorderedFields = JSON.parse(JSON.stringify(fields)).sort((x,y) => x.name === field.name ? -1 : y.name === field.name ? 1 : 0)
        const template = {
            name: `${field.name}Template`,
            qfmt: questionSkipTemplate,
            afmt: await generateTemplateHtml(reorderedFields)
        }
        templates.push(template)

        const deckToCreate = {
            name: `${cmd.deckName}::${field.displayName}`,
            desc: `Subdeck for learning by ${field.displayName}`
        }
        const deck = await apkg.addDeck(deckToCreate)
        decks.push(deck)
    }

    const modelToCreate = {
        name: `model`,
        //did: deck.baseConf.id,
        flds: fields.filter(field=>!field.skipField).map(field=>{return {name:field.name}}),
        tmpls: templates,
        css: ''
    }
    const model = await apkg.addModel(modelToCreate)

    const chars = []
    const words = []
    const sentences = []
    const inputCfg = {
        "version": 1,
        "use-online-services": true,
        "format": "simplified|traditional|pinyin|english|audio",
        "leave-blank-sequence": "{blank}",
        "separator": "|"
    }

    let input = {} // TODO: finish impl

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

        let type
        if (/[，？！。；,\?\!\.\;\s]/.test(inputItem.simplified)) {
            type = 'sentence'
        } else if (inputItem.simplified.length > 1) {
            type = 'word'
        } else {
            type = 'char'
        }
        //if (lang === 'cn') {
            if (type === 'word') {
                input[deckName].words.push(inputItem)
                words.push(inputItem.simplified)
            } else if (type === 'sentence') {
                input[deckName].sentences.push(inputItem)
                sentences.push(inputItem.simplified)
            } else {
                input[deckName].chars.push(inputItem)
                chars.push(inputItem.simplified)
            }
        //}
    }

    //////////// Extract words, chars and components from input
    let charDataObj
    let allChars = chars
    let extractedChars = []
    let extractedWords = []
    if (cmd.recursiveDict) {
        console.log('Dissecting input data down to component level...')
        for (const [i,sentence] of sentences.entries()) {
            for (let [j,word] of sentence.split(' ').entries()) {
                word = word.replace(/[，？！。；,\?\!\.\;]/g,'')
                if (!words.includes(word) && !extractedWords.includes(word))
                    extractedWords.push(word)
                for (const [k,char] of word.split('').entries()) {
                    if (!chars.includes(char) && !extractedChars.includes(char))
                        extractedChars.push(char)
                }
            }
        }
        for (let [i,word] of words.entries()) {
            word = word.replace(/[，？！。；,\?\!\.\;]/g,'')
            for (const [j,char] of word.split('').entries()) {
                if (!chars.includes(char) && !extractedChars.includes(char))
                    extractedChars.push(char)
            }
        }

        async function extractCmpsRecursively(char) {
            const charData = (await mmah.getCharData([char]))[char]
            if (charData.decomposition === '？')
                return
            const cmps = charData.decomposition.replace(/[\u2FF0-\u2FFB？]+/g,'').split('')
            for (const [i,cmp] of cmps.entries()) {
                if (!extractedChars.includes(cmp)) {
                    extractedChars.push(cmp)
                    await extractCmpsRecursively(cmp)
                }
            }
        }
        for (const [i,char] of chars.concat(extractedChars).entries()) {
            await extractCmpsRecursively(char)
        }
        allChars = chars.concat(extractedChars)
    }
    //charDataObj = await mmah.getCharData(allChars,'char',true)
    charDataObj = await mmah.getCharData(allChars)

    for (const [char,charData] of Object.entries(charDataObj)) {
        charDataObj[char].traditional = await opencc.convertPromise(char)
    }

    console.log('Getting word data from mdbg...')
    let wordDataObj = await mdbg.getEntryByHanzi(words.concat(extractedWords))

    /////////// Create notes+cards
    const notes = []
    let cardChars = chars
    let cardWords = words
    let cardSentences = sentences
    if (cmd.recursiveCards) {
        cardChars = chars.concat(extractedChars)
        cardWords = words.concat(extractedWords)
    }
    for (const [i,sentence] of sentences.entries()) {
        let results = []
        try {
            if (typeof archChineseCache[sentence] === 'undefined') {
                results = await archChinese.searchSentences(sentence)
            } else {
                results = archChineseCache[sentence]
            }
            if (results.length < 1) {
                console.warn(`Skipping "${sentence}" as no result was found on ArchChinese.`)
                continue
            }
        } catch(e) {
            if (e.error.syscall === 'getaddrinfo' && e.error.code === 'ENOTFOUND')
                console.warn(`DNS request failed. ArchChinese search for sentence "${sentence}" skipped.`)
            else
                throw e
            continue
        }
        const filteredResults = results.filter(r=>r.simplified.replace(/\s/g,'')===sentence.replace(/\s/g,'')||r.traditional.replace(/\s/g,'')===sentence.replace(/\s/g,''))
        if (filteredResults.length < 1) {
            console.warn(`Skipping "${sentence}" as no match was found on ArchChinese.`)
            continue
        }
        archChineseCache[sentence] = filteredResults
        const result = archChineseCache[sentence][0]

        let fieldContentArr = []
        fieldContentArr.push(sentence)
        fieldContentArr.push(result.pinyin)
        fieldContentArr.push(result.english.join('; '))
        fieldContentArr.push('')

        const noteToAdd = {
            mid: model.id,
            flds: fieldContentArr.map(item=>item.replace(/'/g,"&#39;")),
            sfld: fields[0].name
        }
        const note = await apkg.addNote(noteToAdd)
        notes.push(note)
    }

    for (const [i,word] of cardWords.entries()) {
        let result = wordDataObj[word]
        if (!result) {
            let results = []
            try {
                if (typeof archChineseCache[word] === 'undefined') {
                    results = await archChinese.searchWords(word)
                } else {
                    results = archChineseCache[word]
                }
                //if (!results || results.length < 1) {
                //    console.warn(`Skipping word "${word}" as no result was found on ArchChinese.`)
                //    continue
                //}
            } catch(e) {
                if (e.error.syscall === 'getaddrinfo' && e.error.code === 'ENOTFOUND')
                    console.warn(`DNS request failed. ArchChinese search for sentence "${word}" skipped.`)
                else
                    throw e
                continue
            }
            if (!results || results.length < 1) {

            } else {
                const filteredResults = results.filter(r=>r.simplified===word||r.traditional===word)
                if (filteredResults.length < 1) {
                    //console.warn(`Skipping word "${word}" as no match was found on ArchChinese.`)
                    //continue
                } else {
                    archChineseCache[word] = filteredResults
                    result = archChineseCache[word][0]
                }
            }
        }

        if (!result) {
            console.warn(`No entry for word ${word} found on mdbg and ArchChinese.`)
            continue
        }
        let fieldContentArr = []
        fieldContentArr.push(word)
        fieldContentArr.push(result.pinyin)
        fieldContentArr.push(result.english.join('; '))
        fieldContentArr.push('')

        const noteToAdd = {
            mid: model.id,
            flds: fieldContentArr.map(item=>item.replace(/'/g,"&#39;")),
            sfld: fields[0].name
        }
        const note = await apkg.addNote(noteToAdd)
        notes.push(note)
    }
    for (const [i,char] of cardChars.entries()) {
        let itemData = charDataObj[char]
        let fieldContentArr = []
        fieldContentArr.push(char || '')
        fieldContentArr.push(itemData.pinyin ? itemData.pinyin.join(' / ') : '')
        fieldContentArr.push(itemData.definition || '')
        fieldContentArr.push('')

        const noteToAdd = {
            mid: model.id,
            flds: fieldContentArr.map(item=>item.replace(/'/g,"&#39;")),
            sfld: fields[0].name
        }
        const note = await apkg.addNote(noteToAdd)
        notes.push(note)
    }
    const cards = []
    for (const note of notes) {
        for (const [i,deck] of decks.entries()) {
            const cardToCreate = {
                nid: note.id,
                did: deck.baseConf.id,
                odid: deck.baseConf.id,
                ord: i // template index
            }
            const card = await apkg.addCard(cardToCreate)
            cards.push(card)
        }
    }

    //////////// Add media
    let dictChars = chars
    let dictWords = words
    let dictSentences = sentences
    if (cmd.recursiveDict) {
        dictChars = chars.concat(extractedChars)
        dictWords = words.concat(extractedWords)
    }
    let dict = {}

    for (const [i,sentence] of sentences.entries()) {
        try {
            const mediaToAdd = await forvo.downloadAudio('./cache/anki-audio-dl-cache',sentence)
            await apkg.addMedia(mediaToAdd)
            if (!charDataObj[sentence])
                charDataObj[sentence] = {}
            charDataObj[sentence].audio = []
            const filenames = mediaToAdd.map(path=>path.split(/(\\|\/)/g).pop())
            for (const [i,filename] of filenames.entries()) {
                charDataObj[sentence].audio.push(filename)
            }
        } catch(e) {
            if (e.statusCode === 403)
                console.warn(`Forvo blocked download of audio for sentence "${sentence}". Try again later.`)
            else if (e.statusCode === 404)
                console.warn(`Forvo audio download for sentence "${sentence}" returned a 404 Not Found.`)
            else if (e.error.syscall === 'getaddrinfo' && e.error.code === 'ENOTFOUND')
                console.warn(`DNS request failed. Forvo audio download for sentence "${sentence}" skipped.`)
            else
                throw e
        }
    }
    for (const [i,word] of dictWords.entries()) {
        try {
            const mediaToAdd = await forvo.downloadAudio('./cache/anki-audio-dl-cache',word)
            await apkg.addMedia(mediaToAdd)
            if (!charDataObj[word])
                charDataObj[word] = {}
            charDataObj[word].audio = []
            const filenames = mediaToAdd.map(path=>path.split(/(\\|\/)/g).pop())
            for (const [i,filename] of filenames.entries()) {
                charDataObj[word].audio.push(filename)
            }
        } catch(e) {
            if (e.statusCode === 403)
                console.warn(`Forvo blocked download of audio for word "${word}". Try again later.`)
            else if (e.statusCode === 404)
                console.warn(`Forvo audio download for word "${word}" returned a 404 Not Found.`)
            else if (e.error.syscall === 'getaddrinfo' && e.error.code === 'ENOTFOUND')
                console.warn(`DNS request failed. Forvo audio download for word "${word}" skipped.`)
            else
                throw e
        }
    }

    for (const [i,char] of dictChars.entries()) {
        try {
            const mediaToAdd = await forvo.downloadAudio('./cache/anki-audio-dl-cache',char)
            charDataObj[char].audio = []
            const filenames = mediaToAdd.map(path=>path.split(/(\\|\/)/g).pop())
            for (const [i,filename] of filenames.entries()) {
                charDataObj[char].audio.push(filename)
            }
            await apkg.addMedia(mediaToAdd)
        } catch(e) {
            if (e.statusCode === 403)
                console.warn(`Forvo blocked download of audio for char "${char}". Try again later.`)
            else if (e.statusCode === 404)
                console.warn(`Forvo audio download for char "${char}" returned a 404 Not Found.`)
            else if (e.error.syscall === 'getaddrinfo' && e.error.code === 'ENOTFOUND')
                console.warn(`DNS request failed. Forvo audio download for char "${char}" skipped.`)
            else
                throw e
        }
    }

    // Add base dict
    await fs.outputFile(`${cmd.tempFolder}/_dict-${baseDeck.baseConf.id}.jsonp`,`onLoadDict(${JSON.stringify(charDataObj)})`)
    await apkg.addMedia(`${cmd.tempFolder}/_dict-${baseDeck.baseConf.id}.jsonp`)
    await fs.remove(`${cmd.tempFolder}/_dict-${baseDeck.baseConf.id}.jsonp`)

    // Add all stroke order diagrams
    console.log("Generating big char dict...")
    charDataObj = await mmah.getCharData(allChars,'char',true)
    for (const [char,charData] of Object.entries(charDataObj)) {
        charDataObj[char].traditional = await opencc.convertPromise(char)
    }
    const mediaToAdd = []
    let i = 0
    for (const [char,charData] of Object.entries(charDataObj)) {
        mediaToAdd.push(`${mmah.stillSvgsDir}/${char.charCodeAt()}-still.svg`)
        i++
        if (i > 3000) {
            console.warn(`Stroke order diagram files have been cut off at diagram file #${i+1}.`)
            break
        }
    }
    // Add complete dict
    await apkg.addMedia(mediaToAdd)
    await fs.outputFile(`${cmd.tempFolder}/_big-dict-${baseDeck.baseConf.id}.jsonp`,`onLoadBigDict(${JSON.stringify(charDataObj)})`)
    await apkg.addMedia(`${cmd.tempFolder}/_big-dict-${baseDeck.baseConf.id}.jsonp`)

    await fs.remove(`${cmd.tempFolder}/_dict-${baseDeck.baseConf.id}.jsonp`)

    const files = await fs.readdir(cmd.tempFolder)
    const apkgArchive = new JSZip()
    const filepathArr = files.map(filename=>`${cmd.tempFolder}/${filename}`)
    for (const filepath of filepathArr) {
        apkgArchive.file(filepath, fs.createReadStream(filepath))
    }
    console.log("Archiving apkg...")
    const progressBar = new cliProgress.Bar({}, cliProgress.Presets.shades_classic);
    progressBar.start(100,0)
    let lastPercent = -1
    const content = await apkgArchive.folder(cmd.tempFolder).generateAsync({type:"uint8array"},data=>{
        if (data.percent !== lastPercent) {
            lastPercent = data.percent
            progressBar.update(data.percent)
            // data.currentFile
        }
    })
    progressBar.stop()
    await fs.writeFile(apkgFile, content)
    await fs.remove(cmd.tempFolder)
    await fs.outputJson(archchineseCacheFile,archChineseCache)
    return `Successfully generated ${apkgFile}!`
}
