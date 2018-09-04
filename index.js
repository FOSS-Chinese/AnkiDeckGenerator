#!/usr/bin/env node
'use strict'

const packageInfo = require('./package.json')
const program = require('commander')
const fs = require('fs-extra')
const AnkiDeckGenerator = require('./AnkiDeckGenerator')
const JSZip = require("jszip")

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
    .action((apkgFile, cmd) => {
        cmd.tempFolder = cmd.tempFolder || './anki-deck-generator-temp'
        cmd.deckName = cmd.deckName || "NewDeck"
        cmd.deckDescription = cmd.deckDescription || "A new deck"
        let apkg
        apkg = new AnkiDeckGenerator(cmd.deckName, cmd.tempFolder)

        const fields = [
            {
                name: "hanzi"
            }, {
                name: "english"
            }, {
                name: "pinyin"
            }, {
                name: "decomposition"
            }, {
                name: "etymologyType"
            }, {
                name: "etymologyHint"
            }, {
                name: "etymologyPhonetic"
            }, {
                name: "etymologySemantic"
            }, {
                name: "radical"
            }, {
                name: "charCode"
            }, {
                name: "animatedSvg"
            }, {
                name: "stillSvg"
            }
        ]
        let wordList = {}
        let vocData = {}
        let addedDecks = []
        let addedModels = []
        let addedNotes = []
        let addedCards = []
        fs.emptyDir(cmd.tempFolder).then(() => {
            return fs.readFile(cmd.inputFileChinese,'utf8')
        }).then(fileContents => {
            wordList = fileContents.split(/\r?\n/)
            return apkg.init()
        }).then(fileContents => {
            return apkg.mmah.getCharData(wordList)
        }).then(vocDataObj => {
            vocData = vocDataObj

            return apkg.addDeck({
                name: cmd.deckName,
                desc: cmd.deckDescription
            })
        }).then(deck => {
            addedDecks.push(deck)

            const templates = [{
                name: "fossChineseTemplate",
                // TODO: read HTML from file, also load bootstrap, jquery etc src and embed em
                qfmt: "{{hanzi}} [{{pinyin}}]",
                afmt: "{{english}}"
            }]

            const model = {
                name: "fossChineseModel",
                did: deck.baseConf.id,
                flds: fields,
                tmpls: templates
            }

            return apkg.addModel(model)
        }).then(model => {
            addedModels.push(model)
            const notes = []
            for (let key in vocData) {
                let item = vocData[key]
                let itemData = vocData[item.character]
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

                const note = {
                    mid: model.id,
                    flds: lineArr,
                    sfld: fields[0].name
                }
                notes.push(note)
            }
            const notePromiseArr = notes.map(note=>apkg.addNote(note))
            return Promise.all(notePromiseArr)
        }).then(notes => {
            addedNotes.push(notes)
            const cards = []
            for (const note of notes) {
                console.log(note)
                const card = {
                    nid: note.id,
                    did: addedDecks[0].baseConf.id,
                    odid: addedDecks[0].baseConf.id
                }
                cards.push(card)
            }

            const cardPromiseArr = cards.map(card=>apkg.addCard(card))
            return Promise.all(cardPromiseArr)
        })/*.then(cards) => {
            //addedCards.push(cards)
            return fs.writeFile(`${cmd.tempFolder}/media`, '{}')
        }).then(() => {
            return fs.readdir(cmd.tempFolder)
        }).then(files => {
            const apkgArchive = new JSZip()
            const filepathArr = files.map(filename=>`${cmd.tempFolder}/${filename}`)
            for (const filepath of filepathArr) {
                apkgArchive.file(filepath, fs.createReadStream(filepath))
            }
            return apkgArchive.folder(cmd.tempFolder).generateAsync({type:"uint8array"})
        }).then(content => {
            return fs.writeFile(apkgFile, content)
        }).then(content => {
            return fs.remove(cmd.tempFolder)
        })*/.then(() => {
            console.log("Done!")
        }).catch(console.error)
    })

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


program.parse(process.argv)


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
