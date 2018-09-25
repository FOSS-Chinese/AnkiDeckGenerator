#!/usr/bin/env node
'use strict'

const program = require('commander')
const fs = require('fs-extra')
const JSZip = require("jszip")
const glob = require("glob")

const packageInfo = require('./package.json')
const AnkiPackage = require('./AnkiPackage')
const MakeMeAHanzi = require('./MakeMeAHanzi')
const Forvo = require("./Forvo")

const forvo = new Forvo()

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
        autoGenerate(apkgFile, cmd).then(console.log).catch(err=>console.error(new Error(err)))
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
            html: `<span class="hanzi">{{hanzi}}</span>`,
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

    function generateTemplateHtml(fields) {
        let collapsablePanels = ''
        for (let [i,field] of fields.entries()) {
            const content = field.html || `{{${field.name}}}`
            collapsablePanels += generateCollapsablePanel(field.displayName, content, !!field.center, i===0)
        }
        return `
            <div id="base-container">
              <div class="panel-group">
                ${collapsablePanels}
              </div>
            </div>
            <script>
                var deckType = "${fields[0].name}";
                var hanzi = "{{hanzi}}";
                var pinyin = "{{pinyin}}";
                var english = "{{english}}";
                var audioFiles = [];
                function onLoadAudio(af) {
                    audioFiles = af;
                }
                function onLibsLoaded() {
                    //alert("Lib loading succeeded!");
                    var audioSection = $('#base-container .chinese-audio');
                    audioFiles[hanzi].forEach(function(audioFile, i){
                        var audioEl = $('<audio/>', {
                            class: 'audio-' + i,
                            src: audioFile,
                            type: 'audio/mp3',
                            text: '▶ Play ' + audioFile
                        })
                        var audioButton = $('<button/>', {
                            text: '▶ Play ' + audioFile,
                            click: function() {
                                $('#base-container .chinese-audio .audio-' + i).get(0).play();
                            }
                        })
                        audioSection.append(audioEl);
                        audioSection.append(audioButton);
                    });
                }
                function onLibsFailed() {
                    alert("Lib loading failed!");
                }
            </script>
            <script>
                function loadLibs(files, success_cb, fail_cb, timeout) {
                    var timer = setTimeout(fail_cb || function(){alert("loadLibs failed!");}, timeout || 5000);
                    var loadCount = 0;
                    function onLibLoaded() {
                        loadCount++;
                        if (loadCount === files.length) {
                            clearTimeout(timer);
                            success_cb();
                        }
                    }
                    files.forEach(function(file){
                        if (file[0] !== '_')
                            alert("Error: Please rename '" + file + "' to '_" + file + "'!");
                        var ext = file.split('.').slice(-1).pop();
                        if (ext === 'js' || ext === 'jsonp') {
                            var script = document.createElement('script');
                            script.src = file;
                            script.addEventListener ("load", onLibLoaded);
                            //script.onload = onLibLoaded;
                            document.getElementsByTagName('head')[0].appendChild(script);
                        } else if (ext === 'css') {
                            var css = document.createElement('link');
                            css.rel = 'stylesheet'
                            css.type = 'text/css';
                            css.href = file;
                            css.addEventListener ("load", onLibLoaded);
                            //css.onload = onLibLoaded;
                            document.getElementsByTagName('head')[0].appendChild(css);
                        }
                    })
                }
                loadLibs(['_jquery-3.js','_bootstrap-3.js','_bootstrap-3.css','_bootstrap-3-theme.css','_audio.jsonp'], onLibsLoaded, onLibsFailed, 1000);
            </script>
            <style>
                body {
                    margin: 1px;
                }
                #base-container .panel-heading {
                    cursor: pointer;
                }
                #base-container .hanzi {
                    font-size: 35px;
                }
                #diagram-container {
                    height: 300px;
                    width: 100%;
                    text-align: left;
                    overflow-y: scroll
                }
                #diagram-container > img {
                    width: 100%;
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
    }

    const questionSkipTemplate = `
        <script>
            var isEditMode = true
            var scriptEls = document.getElementsByTagName('script')
            for (var i = 0; i < scriptEls.length; i++) {
                var tag = scriptEls[i]
                if (tag.innerHTML.indexOf('jQuery JavaScript Library') !== -1 && tag.innerHTML.indexOf('isEditMode') === -1)
                    isEditMode = false
            }
            if (!isEditMode) {
                var interval = setInterval(function(){
                    if (!!document.getElementById('base-container')) {
                        clearInterval(interval)
                    } else {
                        if (typeof (pycmd) !== "undefined") {
                            pycmd('ans')
                        } else if (typeof (py) !== "undefined") {
                            py.link('ans')
                        }
                    }
                },100)
                setTimeout(function() {
                    clearInterval(interval)
                },5000)
            }
        </script>
        <div>
            If you're using AnkiDroid, please adjust your settings accordingly:<br/>
            [Settings] -> [Reviewing] -> Check [Automatic display answer]<br/>
            [Settings] -> [Reviewing] -> Set [Time to show answer] to [1 s]<br/>
            [Settings] -> [Reviewing] -> Set [Time to show next question] to [0 s]
        </div>
    `

    const decks = []
    const templates = []
    for (const [i,field] of fields.entries()) {
        const reorderedFields = JSON.parse(JSON.stringify(fields)).sort((x,y) => x.name === field.name ? -1 : y.name === field.name ? 1 : 0)
        const template = {
            name: `${field.name}Template`,
            qfmt: questionSkipTemplate,
            afmt: generateTemplateHtml(reorderedFields)
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
    for (const [i,line] of wordList.entries()) {
        const lang = line.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/) !== null ? "cn" : "en"
        let type
        if (line.includes(' '))
            type = 'sentence'
        else if (line.length > 1)
            type = 'word'
        else
            type = "char"

        if (lang === 'cn') { // TODO get audio for chard and chard form sentences etc
            if (type === 'word') {
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
                const words = line.split(' ')
                for (const word of words) {
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
                    chars.push(char)

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

    await fs.outputFile(`${cmd.tempFolder}/_audio.jsonp`,`onLoadAudio(${JSON.stringify(addedMedia.audio)})`)
    await apkg.addMedia(`${cmd.tempFolder}/_audio.jsonp`)
    await fs.remove(`${cmd.tempFolder}/_audio.jsonp`)

    const notes = []
    const vocDataObj = await mmah.getCharData(chars)
    for (let key in vocDataObj) {
        let item = vocDataObj[key]
        let itemData = vocDataObj[item.character]
        let fieldContentArr = []
        fieldContentArr.push(itemData.character || '')
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

const apkg = new AnkiPackage('./db.anki2')

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
