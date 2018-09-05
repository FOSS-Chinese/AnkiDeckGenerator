#!/usr/bin/env node
'use strict'

const packageInfo = require('./package.json')
const program = require('commander')
const fs = require('fs-extra')
const AnkiDeckGenerator = require('./AnkiDeckGenerator')
const JSZip = require("jszip")


const Forvo = require("./Forvo")
const forvo = new Forvo()

/*
// BASIC IDEA (DOES NOT REPRESENT ACTUAL IMPLEMENTATION)
AnkiDeckGenerator.addDeck(config)
[modelId, templateIndexNumbers] = AnkiDeckGenerator.addModel(config, defaultDeckId, fields, templates)
noteId = AnkiDeckGenerator.addNote(config, modelId, fields)
cardId = AnkiDeckGenerator.addCard(config, notesId, deckId, fields, templateIndexNumber, originalDeckId) // originalDeckId is required for filtered decks
*/

program
    .command('auto-generate <apkg-output-file>')
    .option('-c, --input-file-chinese [file-path]', 'File containing a json-array of Chinese characters, words and/or sentences')
    .option('-n, --deck-name <string>', 'Name of the deck to be created')
    .option('-d, --deck-description <string>', 'Name of the deck to be created')
    .option('-t, --temp-folder [folder-path]', 'Folder to be used/created for temporary files')
    .option('-l, --libs-folder [folder-path]', 'Folder holding libraries for template')
    .action((apkgFile, cmd) => {
        autoGenerate(apkgFile, cmd).then(console.log).catch(err=>console.error(new Error(err)))
    })
program.parse(process.argv)

async function autoGenerate(apkgFile, cmd) {
    cmd.tempFolder = cmd.tempFolder || './anki-deck-generator-temp'
    cmd.deckName = cmd.deckName || "NewDeck"
    cmd.deckDescription = cmd.deckDescription || "A new deck"
    cmd.libs = cmd.libs || "./libs"
    let apkg
    apkg = new AnkiDeckGenerator(cmd.deckName, cmd.tempFolder)

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

    await fs.emptyDir(cmd.tempFolder)

    const chineseInputFile = await fs.readFile(cmd.inputFileChinese,'utf8')
    const wordList = chineseInputFile.split(/\r?\n/)
    const apkgCfg = await apkg.init()
    const vocDataObj = await apkg.mmah.getCharData(wordList)
    const deck = await apkg.addDeck({
        name: cmd.deckName,
        desc: cmd.deckDescription
    })

    const jqueryJs = await fs.readFile(`${cmd.libs}/jquery-3.js`,'utf8')
    const bootstrapJs = await fs.readFile(`${cmd.libs}/bootstrap-3.js`,'utf8')
    const bootstrapCss = await fs.readFile(`${cmd.libs}/bootstrap-3.css`,'utf8')
    const bootstrapThemeCss = await fs.readFile(`${cmd.libs}/bootstrap-3-theme.css`,'utf8')

    let sectionCount = -1
    function generateCollapsablePanel(heading,content,center,showByDefault=false) {
        sectionCount++
        return `
            <div class="panel panel-primary">
              <div class="panel-heading">
                <h4 class="panel-title">
                  <a data-toggle="collapse" href="#collapse-${sectionCount}">${heading}</a>
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

    let collapsablePanels = ''
    for (let [i,field] of fields.entries()) {
        const content = field.html || `{{${field.name}}}`
        collapsablePanels += generateCollapsablePanel(field.displayName, content, !!field.center, i===0)
    }

    const answerTemplateHtml = `
        <div id="container" class="container">
          <div class="panel-group">
            ${collapsablePanels}
          </div>
        </div>

        <script>${jqueryJs}</script>
        <script>${bootstrapJs}</script>
        <style>${bootstrapCss}</style>
        <style>${bootstrapThemeCss}</style>
        <style>
            #diagram-container {
                height: 150px;
                width: 100%;
                text-align: left;
                overflow-y: scroll
            }
            #diagram-container > img {
                width: 50%;
            }
        </style>
        <script>
        $(function(){
            $(".panel-body").each(function(){
                if($.trim($(this).html())=='')
                    $(this).parent().parent().hide()
            })
        });
        </script>
    `
    const questionTemplate = `
        <script>
            setInterval(function(){
                if (typeof (py) !== "undefined") py.link('ans');
                if (typeof (pycmd) !== "undefined") pycmd('ans');
            },100)
        </script>
    `

    const templates = [{
        name: "fossChineseTemplate",
        qfmt: questionTemplate,
        afmt: answerTemplateHtml
    }]

    const model = await apkg.addModel({
        name: "fossChineseModel",
        did: deck.baseConf.id,
        flds: fields,
        tmpls: templates
    })

    let notes = []
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
    const notePromiseArr = notes.map(note=>apkg.addNote(note))
    notes = await Promise.all(notePromiseArr)

    let cards = []
    for (const note of notes) {
        const card = {
            nid: note.id,
            did: deck.baseConf.id,
            odid: deck.baseConf.id
        }
        cards.push(card)
    }

    const cardPromiseArr = cards.map(card=>apkg.addCard(card))
    cards = await Promise.all(cardPromiseArr)

    await fs.writeFile(`${cmd.tempFolder}/media`, '{}')

    for (let key in vocDataObj) {
        let item = vocDataObj[key]
        let itemData = vocDataObj[item.character]
        let mediaToAdd = await forvo.downloadAudio('./anki-audio-dl-cache',item.character)

        mediaToAdd.push(itemData.stillSvg)
        await apkg.addMedia(mediaToAdd)
    }


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
/*
    program
        .command('update <file-path>')
        .option('-c, --input-file-chinese <file-path>', 'File containing a json-array of Chinese characters, words and/or sentences')
        .option('-t, --temp-folder <folder-path>', 'Folder to be used/created for temporary files')
        .action((apkgFile, cmd) => {
            cmd.tempFolder = cmd.tempFolder || './anki-deck-generator-temp'
            fs.emptyDir(cmd.tempFolder).then(() => {
                return fs.readFile(apkgFile)
            }).then(zipData => {
                return JSZip.loadAsync(zipData)
            }).then(zip => {
                for (const filename of Object.keys(zip.files)) {
                    if (filename.includes('.anki2')) {
                        zip.files[filename].async('uint8array').then(fileData => {
                            return fs.writeFile(`${cmd.tempFolder}/${filename}`, fileData)
                        })
                    }
                }
            }).then(() => {
                console.log("Done!")
            }).catch(console.error)
        })
*/




/*
if (!program.apkgFile || !program.inputFileChinese) {
    throw new Error("Errorreturn fs.readFile(apkgFile)
        }).then(zipData => {
            return JSZip.loadAsync(zipData)
        }).then(zip => {
            for (const filename of Object.keys(zip.files)) {
                if (filename.includes('.anki2')) {
                    zip.files[filename].async('uint8array').then(fileData => {
                        return fs.writeFile(`${cmd.tempFolder}/${filename}`, fileData)
                    })
                }
            }, missing required parameter(s)!")
}
program.tempFolder = program.tempFolder || './temp'

const apkg = new AnkiDeckGenerator('./db.anki2')

fs.ensureDir(program.tempFolder).then(() => {
    return fs.readFile(program.inputFileChinese,'utf8')
}).then(fileContents => {
    return apkg.init()
}).then(() => {
    return apkg.addDeck({
        name: "NewDeck",
        desc: "Test deck"
    })
}).then(() => {
    console.log("Done!")
}).catch(console.error)
*/
    /*const chineseInputArr = fileContents.split(/\r?\n/)
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
})*/

/*
.then(tsvOutput => {
    return fs.writeFile(`${program.outputFolder}/data.txt`, tsvOutput)
}).then(() => {
    console.log('Done!')
}).catch(console.error)
*/
