#!/usr/bin/env node
'use strict'

// External libs
const program = require('commander')
const fs = require('fs-extra')
const JSZip = require("jszip")
const OpenCC = require('opencc')
const cliProgress = require('cli-progress')
global.Promise = require('bluebird')
Promise.longStackTraces()

// Local libs
const packageInfo = require('./package.json')
const AnkiPackage = require('./libs/AnkiPackage')
const MakeMeAHanzi = require('./libs/MakeMeAHanzi')
const Forvo = require('./libs/Forvo')
const ArchChinese = require('./libs/ArchChinese')
const Mdbg = require('./libs/Mdbg')

// Main code libs
const createSubdeckObjects = require('./main/createSubdeckObjects')
const HanziDissector = require('./main/HanziDissector')

// Lib initialization
const s2t = new OpenCC('s2t.json') // To convert simplified to traditional
const t2s = new OpenCC('t2s.json') // To convert traditional to simplified

const forvo = new Forvo()
const mdbg = new Mdbg()
const archChinese = new ArchChinese()
let archChineseCache = {} // TODO: consider making this a class-internal feature
let archchineseCacheFile = './cache/archchinese-cache.json' // TODO: consider passing that to init

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
            fs.outputJson(archchineseCacheFile,archChineseCache).then(()=>{}).catch(e=>console.error) //TODO: Find a better way to prevent cache loss
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

    await fs.remove(apkgFile)

    forvo.init()
    mdbg.init()

    const apkg = new AnkiPackage(cmd.deckName, cmd.tempFolder)
    const mmah = new MakeMeAHanzi({sourcePath: './submodules/makemeahanzi'})
    const hanziDissector = new HanziDissector(mmah)

    const fields = require('./main/fields.json')

    await fs.emptyDir(cmd.tempFolder)
    await fs.writeFile(`${cmd.tempFolder}/media`, '{}')
    await apkg.addMedia([`${cmd.libs}/_jquery-3.js`,`${cmd.libs}/_bootstrap-3.js`,`${cmd.libs}/_bootstrap-3.css`,`${cmd.libs}/_bootstrap-3-theme.css`])

    if (await fs.pathExists(archchineseCacheFile))
        archChineseCache = await fs.readJson(archchineseCacheFile)

    const apkgCfg = await apkg.init()
    const baseDeck = await apkg.addDeck({
        name: cmd.deckName,
        desc: cmd.deckDescription
    })

    const input = await parseInputFile(cmd.inputFile)

    // Create sub decks, models and templates. One model per sub deck. One template per model.
    const subDeckObjs = createSubdeckObjects(fields,baseDeck.name,Object.keys(input))
    const decks = subDeckObjs.decks
    const models = subDeckObjs.models
    const templates = subDeckObjs.templates

    for (const [deckName,inputForDeck] of Object.entries(input)) {
        const simplified = input[deckName].simplified
        const traditional = input[deckName].traditional
        if (!input[deckName].simplified && input[deckName].traditional) { // generate traditional hanzi if missing
            input[deckName].simplified = await s2t.convertPromise(simplified)
        }
        if (!input[deckName].traditional && input[deckName].simplified) { // generate simplified hanzi if missing
            input[deckName].traditional = await t2s.convertPromise(traditional)
        }
    }

    console.log(`Dissecting input data${cmd.recursiveDict ? ' down to component level' : ''}...`)
    const dissectedInput = hanziDissector.dissect(input,cmd.recursiveDict)

    console.log(`Looking up ${cmd.recursiveDict ? 'all' : 'input'} chars...`)
    const charDataObj = await mmah.getCharData(allChars,'char',cmd.recursiveDict)
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
