#!/usr/bin/env node
'use strict'

const program = require('commander')
const fs = require('fs-extra')
const JSZip = require("jszip")
const mustache = require('mustache')

const packageInfo = require('./package.json')
const AnkiPackage = require('./AnkiPackage')
const MakeMeAHanzi = require('./MakeMeAHanzi')
const Forvo = require("./Forvo")
const ArchChinese = require("./ArchChinese")

global.Promise = require("bluebird")
Promise.longStackTraces()

const forvo = new Forvo()
const archChinese = new ArchChinese()
let archChineseCache = {}
let archchineseCacheFile = './archchinese-cache.json'

/*
// BASIC IDEA (DOES NOT REPRESENT ACTUAL IMPLEMENTATION)
apkg.addDeck(config)
[modelId, templateIndexNumbers] = apkg.addModel(config, fields, templates)
noteId = apkg.addNote(config, modelId, fields)
cardId = apkg.addCard(config, notesId, deckId, fields, templateIndexNumber, originalDeckId) // originalDeckId is required for filtered decks
*/

program
    .command('auto-generate <apkg-output-file>')
    .option('-c, --input-file-chinese [file-path]', 'File containing a json-array of Chinese characters, words and/or sentences')
    .option('-n, --deck-name <string>', 'Name of the deck to be created')
    .option('-d, --deck-description <string>', 'Name of the deck to be created')
    .option('-t, --temp-folder [folder-path]', 'Folder to be used/created for temporary files')
    .option('-l, --libs-folder [folder-path]', 'Folder holding libraries for template')
    .option('-a, --audio-recordings-limit [integer]', 'Max amount of audio recordings to download for each character, word and sentence. (-1: all, 0: none, 1: one, 2: two) Default: 1')
    .option('-r, --recursive-audio [boolean]', 'Download audio not only for input file entries, but also for every single word and character found in each entry. Default: false')
    .option('-p, --dictionary-priority-list [comma-separated-string]', 'List of dictionaries (offline and online) to gather data from. (highest priority first. Default: makemeahanzi,forvo,archchinese,mdbg)')
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
    cmd.libs = cmd.libs || "./libs"
    const apkg = new AnkiPackage(cmd.deckName, cmd.tempFolder)

    let mmahConfg = {}
    mmahConfg.graphicsDataPath = './submodules/makemeahanzi/graphics.txt'
    mmahConfg.dictPath = './submodules/makemeahanzi/dictionary.txt'
    mmahConfg.animatedSvgsDir = './submodules/makemeahanzi/svgs'
    mmahConfg.stillSvgsDir = './submodules/makemeahanzi/svgs-still'
    const mmah = new MakeMeAHanzi(mmahConfg)

    const fields = [
        {
            name: "hanzi",
            displayName: "Hànzì",
            html: `<span class="hanzi" id="base-hanzi">{{hanzi}}</span>`,
            center: true
        }, {
            name: "pinyin",
            displayName: "Pīnyīn",
            html: `<span class="pinyin">{{pinyin}}</span>`,
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
            center: true
        }
    ]

    /*
    const fields = [
        {
            name: "hanzi",
            displayName: "Hànzì",
            html: `<h1>{{hanzi}}</h1>`,
            center: true
        }, {
            name: "pinyin",
            displayName: "Pīnyīn",
            html: `<h1>{{pinyin}}</h1>`,
            center: true
        }, {
            name: "english",
            displayName: "English",
            center: true
        }, {
            name: "stillSvg",
            displayName: "Stroke Diagram",
            html: `<div id="diagram-container">{{stillSvg}}</div>`,
            center: true
        }, {
            name: "chineseAudio",
            displayName: "Chinese Audio",
            center: true
        }, {
            name: "decomposition",
            displayName: "Decomposition",
            center: true
        }, {
            name: "etymologyType",
            displayName: "Etymology: Type"
        }, {
            name: "etymologyHint",
            displayName: "Etymology: Hint"
        }, {
            name: "etymologyPhonetic",
            displayName: "Etymology: Phonetic"
        }, {
            name: "etymologySemantic",
            displayName: "Etymology: Semantic"
        }, {
            name: "radical",
            displayName: "Radical",
            center: true
        }, {
            name: "charCode",
            displayName: "Char Code",
            center: true
        }
    ]
    */

    await fs.emptyDir(cmd.tempFolder)
    await fs.writeFile(`${cmd.tempFolder}/media`, '{}')
    await apkg.addMedia([`${cmd.libs}/_jquery-3.js`,`${cmd.libs}/_bootstrap-3.js`,`${cmd.libs}/_bootstrap-3.css`,`${cmd.libs}/_bootstrap-3-theme.css`])

    if (await fs.pathExists(archchineseCacheFile))
        archChineseCache = await fs.readJson(archchineseCacheFile)

    const chineseInputFile = await fs.readFile(cmd.inputFileChinese,'utf8')
    const wordList = chineseInputFile.split(/\r?\n/)
    const apkgCfg = await apkg.init()
    //const vocDataObj = await mmah.getCharData(wordList)
    const baseDeck = await apkg.addDeck({
        name: cmd.deckName,
        desc: cmd.deckDescription
    })

    //const jqueryJs = await fs.readFile(`${cmd.libs}/jquery-3.js`,'utf8')
    //const bootstrapJs = await fs.readFile(`${cmd.libs}/bootstrap-3.js`,'utf8')
    //const bootstrapCss = await fs.readFile(`${cmd.libs}/bootstrap-3.css`,'utf8')
    //const bootstrapThemeCss = await fs.readFile(`${cmd.libs}/bootstrap-3-theme.css`,'utf8')

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
        const afmtTpl = await fs.readFile('afmt.mustache.html','utf8')
        const afmtTplView = {
            collapsablePanels: collapsablePanels,
            baseDeckId: baseDeck.baseConf.id,
            deckType: fields[0].name,
            panelCount: sectionCount
        }
        return mustache.render(afmtTpl, afmtTplView)
    }

    const questionSkipTemplate = await fs.readFile('qfmt.mustache.html','utf8')

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
        flds: fields.map(field=>{return {name:field.name}}),
        tmpls: templates,
        css: ''
    }
    const model = await apkg.addModel(modelToCreate)
    //console.log(model.tmpls.map(tpl=>{return {name:tpl.name, q: !!tpl.qfmt, a: !!tpl.afmt}}))

    const addedMedia = {
        audio: {}
    }
    let chars = []
    let words = []
    let sentences = []
    for (const [i,line] of wordList.entries()) {
        const lang = line.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/) !== null ? "cn" : "en"
        let type
        if (line.includes(' '))
            type = 'sentence'
        else if (line.length > 1)
            type = 'word'
        else
            type = "char"

        if (lang === 'cn') { // TODO get audio for components
            if (type === 'word') {
                words.push(line)
                const mediaToAdd = await forvo.downloadAudio('./anki-audio-dl-cache',line)
                await apkg.addMedia(mediaToAdd)
                if (!addedMedia.audio[line]) {
                    addedMedia.audio[line] = []
                    const filenames = mediaToAdd.map(path=>path.split(/(\\|\/)/g).pop())
                    for (const [i,filename] of filenames.entries()) {
                        addedMedia.audio[line].push(filename)
                    }
                }
            } else if (type === 'sentence') {
                sentences.push(line)
                const mediaToAdd = await forvo.downloadAudio('./anki-audio-dl-cache',line)
                await apkg.addMedia(mediaToAdd)
                if (!addedMedia.audio[line]) {
                    addedMedia.audio[line] = []
                    const filenames = mediaToAdd.map(path=>path.split(/(\\|\/)/g).pop())
                    for (const [i,filename] of filenames.entries()) {
                        addedMedia.audio[line].push(filename)
                    }
                }

                const lineWords = line.split(' ')
                for (const word of lineWords) {
                    // words.push(word) // TODO: add cmd option for this
                    const mediaToAdd = await forvo.downloadAudio('./anki-audio-dl-cache',word)
                    await apkg.addMedia(mediaToAdd)
                    if (!addedMedia.audio[word]) {
                        addedMedia.audio[word] = []
                        const filenames = mediaToAdd.map(path=>path.split(/(\\|\/)/g).pop())
                        for (const [i,filename] of filenames.entries()) {
                            addedMedia.audio[word].push(filename)
                        }
                    }
                }
            }

            for (const char of line.split('')) {
                if (char !== ' ') {
                    //chars.push(char) // TODO: add cmd option to enable this

                    const mediaToAdd = await forvo.downloadAudio('./anki-audio-dl-cache',char)
                    if (!addedMedia.audio[char]) {
                        addedMedia.audio[char] = []
                        const filenames = mediaToAdd.map(path=>path.split(/(\\|\/)/g).pop())
                        for (const [i,filename] of filenames.entries()) {
                            addedMedia.audio[char].push(filename)
                        }
                    }
                    mediaToAdd.push(`${mmahConfg.stillSvgsDir}/${char.charCodeAt()}-still.svg`)
                    await apkg.addMedia(mediaToAdd)
                }
            }
        }
    }

    await fs.outputFile(`${cmd.tempFolder}/_audio-${baseDeck.baseConf.id}.jsonp`,`onLoadAudio(${JSON.stringify(addedMedia.audio)})`)
    await apkg.addMedia(`${cmd.tempFolder}/_audio-${baseDeck.baseConf.id}.jsonp`)
    await fs.remove(`${cmd.tempFolder}/_audio-${baseDeck.baseConf.id}.jsonp`)

    const notes = []
    const vocDataObj = await mmah.getCharData(chars)
    for (let key in vocDataObj) {
        let item = vocDataObj[key]
        let itemData = vocDataObj[item.character]
        let fieldContentArr = []
        fieldContentArr.push(item.character || '')
        fieldContentArr.push(itemData.pinyin ? itemData.pinyin.join(' / ') : '')
        fieldContentArr.push(itemData.definition || '')

        //const defaultAudio = `${itemData.character}-0.mp3`
        //const hasDefaultAudio = await apkg.hasMedia(defaultAudio)
        //fieldContentArr.push(hasDefaultAudio ? `[sound:${defaultAudio}]` : '')
        fieldContentArr.push(JSON.stringify(addedMedia.audio[itemData.character]))
        //fieldContentArr.push(`<img src="${itemData.stillSvg.split(/(\\|\/)/g).pop() || ''}" />`)
        //glob.readdirPromise('*.js')

        const noteToAdd = {
            mid: model.id,
            flds: fieldContentArr,
            sfld: fields[0].name
        }
        const note = await apkg.addNote(noteToAdd)
        notes.push(note)
    }
    for (const [i, word] of words.entries()) {
        if (!archChineseCache[word]) {
            const results = await archChinese.searchWords(word)
            if (!results || results.length < 1) {
                console.warn(`Skipping word "${word}" as no result was found on ArchChinese.`)
                continue
            }
            const filteredResults = results.filter(r=>r.simplified===word||r.traditional===word)
            if (filteredResults.length < 1) {
                console.warn(`Skipping word "${word}" as no match was found on ArchChinese.`)
                continue
            }
            archChineseCache[word] = filteredResults[0]
        }
        const result = archChineseCache[word]

        let fieldContentArr = []
        fieldContentArr.push(result.simplified)
        fieldContentArr.push(result.pinyin)
        fieldContentArr.push(result.english[0])

        fieldContentArr.push(JSON.stringify(addedMedia.audio[word]))

        const noteToAdd = {
            mid: model.id,
            flds: fieldContentArr,
            sfld: fields[0].name
        }
        const note = await apkg.addNote(noteToAdd)
        notes.push(note)
    }
    for (const [i, sentence] of sentences.entries()) {
        if (!archChineseCache[sentence]) {
            const results = await archChinese.searchSentences(sentence)
            if (results.length < 1) {
                console.warn(`Skipping "${sentence}" as no result was found on ArchChinese.`)
                continue
            }
            const filteredResults = results.filter(r=>r.simplified.replace(/\s/g,'')===sentence.replace(/\s/g,'')||r.traditional.replace(/\s/g,'')===sentence.replace(/\s/g,''))
            if (filteredResults.length < 1) {
                console.warn(`Skipping "${sentence}" as no match was found on ArchChinese.`)
                continue
            }
            archChineseCache[sentence] = filteredResults[0]
        }
        const result = archChineseCache[sentence]

        let fieldContentArr = []
        fieldContentArr.push(sentence)
        fieldContentArr.push(result.pinyin)
        fieldContentArr.push(result.english[0])

        fieldContentArr.push(JSON.stringify(addedMedia.audio[sentence]))

        const noteToAdd = {
            mid: model.id,
            flds: fieldContentArr,
            sfld: fields[0].name
        }
        const note = await apkg.addNote(noteToAdd)
        notes.push(note)
    }

    /*
    for (let key in vocDataObj) {
        let item = vocDataObj[key]
        let itemData = vocDataObj[item.character]
        let lineArr = []
        lineArr.push(itemData.character || '')
        lineArr.push(itemData.pinyin ? itemData.pinyin.join(' / ') : '')
        lineArr.push(itemData.definition || '')
        lineArr.push(`<img src="${itemData.stillSvg.split(/(\\|\/)/g).pop() || ''}" />`)
        lineArr.push(`[sound:${itemData.character}-0.mp3]`)
        lineArr.push(itemData.decomposition || '')
        lineArr.push(itemData.etymology && itemData.etymology.type ? itemData.etymology.type : '')
        lineArr.push(itemData.etymology && itemData.etymology.hint ? itemData.etymology.hint : '')
        lineArr.push(itemData.etymology && itemData.etymology.phonetic ? itemData.etymology.phonetic : '')
        lineArr.push(itemData.etymology && itemData.etymology.semantic ? itemData.etymology.semantic : '')
        lineArr.push(itemData.radical || '')
        //lineArr.push(itemData.matches || '')
        lineArr.push(itemData.charCode || '')
        //lineArr.push(`<img src="${itemData.animatedSvg.split(/(\\|\/)/g).pop() || ''}" />`)

        const note = {
            mid: model.id,
            flds: lineArr,
            sfld: fields[0].name
        }
        notes.push(note)
    }
    */
    //const notePromiseArr = notes.map(note=>apkg.addNote(note))
    //notes = await Promise.all(notePromiseArr)

    let cards = []
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

    //const cardPromiseArr = cards.map(card=>apkg.addCard(card))
    //cards = await Promise.all(cardPromiseArr)


    const files = await fs.readdir(cmd.tempFolder)
    const apkgArchive = new JSZip()
    const filepathArr = files.map(filename=>`${cmd.tempFolder}/${filename}`)
    for (const filepath of filepathArr) {
        apkgArchive.file(filepath, fs.createReadStream(filepath))
    }
    const content = await apkgArchive.folder(cmd.tempFolder).generateAsync({type:"uint8array"})
    await fs.writeFile(apkgFile, content)
    await fs.remove(cmd.tempFolder)
    return "Done!"
}
