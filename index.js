#!/usr/bin/env node
'use strict'

const packageInfo = require('./package.json')
const program = require('commander')
const fs = require('fs-extra')
const AnkiDeckGenerator = require('./AnkiDeckGenerator')
const JSZip = require("jszip")

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
        fs.emptyDir(cmd.tempFolder).then(() => {
            apkg = new AnkiDeckGenerator(`${cmd.tempFolder}/${cmd.deckName}.anki2`)
        }).then(() => {
            return apkg.init()
        }).then(() => {
            return apkg.addDeck({
                name: cmd.deckName,
                desc: cmd.deckDescription
            })
        }).then(() => {
            return fs.readdir(cmd.tempFolder)
        }).then(files => {
            const apkgArchive = new JSZip()
            const filepathArr = files.map(filename=>`${cmd.tempFolder}/${filename}`)
            filepathArr.forEach(filepath => {
                console.log(filepath)
                apkgArchive.file(filepath, CONTENT) // <-- TODO! https://stuk.github.io/jszip/documentation/api_jszip/generate_async.html
            })
            return apkgArchive.generateAsync({type:"uint8array"})
        }).then(content => {
            console.log(content)
            return fs.writeFile(apkgFile, content)
        }).then(() => {
            console.log("Done!")
        }).catch(console.error)
    })

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
