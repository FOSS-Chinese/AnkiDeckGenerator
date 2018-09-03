'use strict'

const MakeMeAHanzi = require('./MakeMeAHanzi')
const sqlite3 = require('sqlite3')
const crypto = require("crypto")
const _ = require('lodash')

class AnkiDeckGenerator {
    constructor(apkgFile, tempDir='./anki-deck-generator-temp', mmahConf={}) {
        this.mmahConf = _.merge({
            graphicsDataPath: './submodules/makemeahanzi/graphics.txt',
            dictPath: './submodules/makemeahanzi/dictionary.txt',
            animatedSvgsDir: './submodules/makemeahanzi/svgs',
            stillSvgsDir: './submodules/makemeahanzi/svgs-still'
        }, mmahConf)
        this.mmah = new MakeMeAHanzi(this.mmahConf)
        this.tempDir = tempDir
        this.apkgFile = apkgFile || './new-deck.apkg'
    }
    init() {
        this.deckFile = `${this.tempDir}/collection.anki2`
        return new Promise((resolve,reject) => {
            this.ankiDb = new sqlite3.Database(this.deckFile, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, err => { err ? reject(new Error(err)) : resolve() })
        }).then(() => {
            return new Promise((resolve,reject) => {
                this.ankiDb.serialize(resolve)
            })
        }).then(()=>{ // Set up db tables
            return new Promise((resolve,reject) => {
                const tableSetupSql = `
                    PRAGMA foreign_keys=OFF;
                    BEGIN TRANSACTION;
                    -- Cards are what you review.
                    -- There can be multiple cards for each note, as determined by the Template.
                    CREATE TABLE cards (
                        id              integer primary key,
                          -- the epoch milliseconds of when the card was created
                        nid             integer not null,--
                          -- notes.id
                        did             integer not null,
                          -- deck id (available in col table)
                        ord             integer not null,
                          -- ordinal : identifies which of the card templates it corresponds to
                          --   valid values are from 0 to num templates - 1
                        mod             integer not null,
                          -- modificaton time as epoch seconds
                        usn             integer not null,
                          -- update sequence number : used to figure out diffs when syncing.
                          --   value of -1 indicates changes that need to be pushed to server.
                          --   usn < server usn indicates changes that need to be pulled from server.
                        type            integer not null,
                          -- 0=new, 1=learning, 2=due, 3=filtered
                        queue           integer not null,
                          -- -3=sched buried, -2=user buried, -1=suspended,
                          -- 0=new, 1=learning, 2=due (as for type)
                          -- 3=in learning, next rev in at least a day after the previous review
                        due             integer not null,
                         -- Due is used differently for different card types:
                         --   new: note id or random int
                         --   due: integer day, relative to the collection's creation time
                         --   learning: integer timestamp
                        ivl             integer not null,
                          -- interval (used in SRS algorithm). Negative = seconds, positive = days
                        factor          integer not null,
                          -- factor (used in SRS algorithm)
                        reps            integer not null,
                          -- number of reviews
                        lapses          integer not null,
                          -- the number of times the card went from a "was answered correctly"
                          --   to "was answered incorrectly" state
                        left            integer not null,
                          -- reps left till graduation
                        odue            integer not null,
                          -- original due: only used when the card is currently in filtered deck
                        odid            integer not null,
                          -- original did: only used when the card is currently in filtered deck
                        flags           integer not null,
                          -- currently unused
                        data            text not null
                          -- currently unused
                    );

                    -- col contains a single row that holds various information about the collection
                    CREATE TABLE col (
                        id              integer primary key,
                          -- arbitrary number since there is only one row
                        crt             integer not null,
                          -- created timestamp
                        mod             integer not null,
                          -- last modified in milliseconds
                        scm             integer not null,
                          -- schema mod time: time when "schema" was modified.
                          --   If server scm is different from the client scm a full-sync is required
                        ver             integer not null,
                          -- version
                        dty             integer not null,
                          -- dirty: unused, set to 0
                        usn             integer not null,
                          -- update sequence number: used for finding diffs when syncing.
                          --   See usn in cards table for more details.
                        ls              integer not null,
                          -- "last sync time"
                        conf            text not null,
                          -- json object containing configuration options that are synced
                        models          text not null,
                          -- json array of json objects containing the models (aka Note types)
                        decks           text not null,
                          -- json array of json objects containing the deck
                        dconf           text not null,
                          -- json array of json objects containing the deck options
                        tags            text not null
                          -- a cache of tags used in the collection (This list is displayed in the browser. Potentially at other place)
                    );

                    -- Contains deleted cards, notes, and decks that need to be synced.
                    -- usn should be set to -1,
                    -- oid is the original id.
                    -- type: 0 for a card, 1 for a note and 2 for a deck
                    CREATE TABLE graves (
                        usn             integer not null,
                        oid             integer not null,
                        type            integer not null
                    );

                    -- Notes contain the raw information that is formatted into a number of cards
                    -- according to the models
                    CREATE TABLE notes (
                        id              integer primary key,
                          -- epoch seconds of when the note was created
                        guid            text not null,
                          -- globally unique id, almost certainly used for syncing
                        mid             integer not null,
                          -- model id
                        mod             integer not null,
                          -- modification timestamp, epoch seconds
                        usn             integer not null,
                          -- update sequence number: for finding diffs when syncing.
                          --   See the description in the cards table for more info
                        tags            text not null,
                          -- space-separated string of tags.
                          --   includes space at the beginning and end, for LIKE "% tag %" queries
                        flds            text not null,
                          -- the values of the fields in this note. separated by 0x1f (31) character.
                        sfld            text not null,
                          -- sort field: used for quick sorting and duplicate check
                        csum            integer not null,
                          -- field checksum used for duplicate check.
                          --   integer representation of first 8 digits of sha1 hash of the first field
                        flags           integer not null,
                          -- unused
                        data            text not null
                          -- unused
                    );

                    -- revlog is a review history; it has a row for every review you've ever done!
                    CREATE TABLE revlog (
                        id              integer primary key,
                           -- epoch-milliseconds timestamp of when you did the review
                        cid             integer not null,
                           -- cards.id
                        usn             integer not null,
                            -- update sequence number: for finding diffs when syncing.
                            --   See the description in the cards table for more info
                        ease            integer not null,
                           -- which button you pushed to score your recall.
                           -- review:  1(wrong), 2(hard), 3(ok), 4(easy)
                           -- learn/relearn:   1(wrong), 2(ok), 3(easy)
                        ivl             integer not null,
                           -- interval
                        lastIvl         integer not null,
                           -- last interval
                        factor          integer not null,
                          -- factor
                        time            integer not null,
                           -- how many milliseconds your review took, up to 60000 (60s)
                        type            integer not null
                           --  0=learn, 1=review, 2=relearn, 3=cram
                    );

                    ANALYZE sqlite_master;
                    INSERT INTO "sqlite_stat1" VALUES('col',NULL,'1');
                    CREATE INDEX ix_notes_usn on notes (usn);
                    CREATE INDEX ix_cards_usn on cards (usn);
                    CREATE INDEX ix_revlog_usn on revlog (usn);
                    CREATE INDEX ix_cards_nid on cards (nid);
                    CREATE INDEX ix_cards_sched on cards (did, queue, due);
                    CREATE INDEX ix_revlog_cid on revlog (cid);
                    CREATE INDEX ix_notes_csum on notes (csum);
                    COMMIT;
                `
                this.ankiDb.exec(tableSetupSql, (err, row) => { err ? reject(new Error(err)) : resolve(row) })
            })
        }).then(()=>{ // Set up col entry
            return new Promise((resolve,reject) => {
                const conf = {
                    "nextPos": 1,
                    "estTimes": true,
                    "activeDecks": [1],
                    "sortType": "noteFld",
                    "timeLim": 0,
                    "sortBackwards": false,
                    "addToCur": true,
                    "curDeck": 1,
                    "newBury": true,
                    "newSpread": 0,
                    "dueCounts": true,
                    "curModel": null,
                    "collapseTime": 1200
                }
                const models = {}
                const decks = {}
                const dconf = {}
                const tags = {}
                const crt = Math.round(Date.now()/1000)
                const mod = Date.now()
                const scm = Date.now()
                const collectionSetupSql = `
                    INSERT INTO col VALUES(
                        1,                            /* id */
                        ${crt},                       /* crt */
                        1398130163295,                /* mod */
                        1398130163168,                /* scm */
                        11,                           /* ver */
                        0,                            /* dty */
                        0,                            /* usn */
                        0,                            /* ls */
                        '${JSON.stringify(conf)}',    /* conf */
                        '${JSON.stringify(models)}',  /* models */
                        '${JSON.stringify(decks)}',   /* decks */
                        '${JSON.stringify(dconf)}',   /* dconf */
                        '${JSON.stringify(tags)}'     /* tags */
                    );
                `
                this.ankiDb.exec(collectionSetupSql, (err, row) => { err ? reject(new Error(err)) : resolve({conf,crt,mod,scm}) })
            })
        })
    }


    addDeck(baseConf={}, advancedConf={}) {
        const id = Math.floor(Math.random() * 10000000000000)
        baseConf = _.merge({ // dconf entry
            name: "Default",         // name of deck
            extendRev: 50,           // extended review card limit (for custom study)
            usn: 0,                  // usn: Update sequence number: used in same way as other usn vales in db
            collapsed: false,        // true when deck is collapsed
            browserCollapsed: false, // true when deck collapsed in browser
            newToday: [0, 0],        // two number. First one currently not used. Second is the negation (-) of the number of new cards added today by custom study
            timeToday: [0, 0],       // two number array used somehow for custom study. Currently unused in the code
            dyn: 0,                  // 1 if dynamic (AKA filtered) deck
            extendNew: 10,           // extended new card limit (for custom study)
            conf: id,                // id of option group from dconf in `col` table
            revToday: [0, 0],        // two number. First one currently not used. Second is the negation (-) the number of review cards added today by custom study
            lrnToday: [0, 0],        // two number array used somehow for custom study. Currently unused in the code
            id: id,                  // deck ID (automatically generated long)
            mod: Date.now(),         // last modification time
            desc: ""                 // deck description
        }, baseConf)
        advancedConf = _.merge({//
            autoplay: true,           // whether the audio associated to a question should be played when the question is shown
            //dyn: true,              // Whether this deck is dynamic. Not present by default in decks.py
            id: id,                   // deck ID (automatically generated long). Not present by default in decks.py
            lapse: {                  // The configuration for lapse cards.
                delays: [ 10 ],       // The list of successive delay between the learning steps of the new cards, as explained in the manual.
                leechAction: 0,       // What to do to leech cards. 0 for suspend, 1 for mark. Numbers according to the order in which the choices appear in aqt/dconf.ui
                leechFails: 8,        // the number of lapses authorized before doing leechAction.
                minInt: 0,            // a lower limit to the new interval after a leech
                mult: 0,              // percent by which to multiply the current interval when a card goes has lapsed
            },
            maxTaken: 60,             // The number of seconds after which to stop the timer
            mod: 0,                   // Last modification time
            name: "Default",          // The name of the configuration
            new: {                    // The configuration for new cards.
                bury: true,           // Whether to bury cards related to new cards answered
                delays: [ 1, 10 ],    // The list of successive delay between the learning steps of the new cards, as explained in the manual.
                initialFactor: 2500,      // The initial ease factor
                ints: [ 1, 4, 7 ],    // The list of delays according to the button pressed while leaving the learning mode. Good, easy and unused. In the GUI, the first two elements corresponds to Graduating Interval and Easy interval
                order: 1,             // In which order new cards must be shown. NEW_CARDS_RANDOM = 0 and NEW_CARDS_DUE = 1.
                perDay: 20,           // Maximal number of new cards shown per day.
                separate: true        // Seems to be unused in the code.
            },
            replayq: true,            // whether the audio associated to a question should be played when the answer is shown
            rev: {                    // The configuration for review cards.
                bury: true,           // Whether to bury cards related to new cards answered
                ease4: 1.3,           // the number to add to the easyness when the easy button is pressed
                fuzz: 0.05,           // The new interval is multiplied by a random number between -fuzz and fuzz
                ivlFct: 1,            // multiplication factor applied to the intervals Anki generates
                maxIvl: 36500,        // the maximal interval for review
                minSpace: 1,          // not currently used according to decks.py code's comment
                perDay: 100           // Numbers of cards to review per day
            },
            timer: 0,                 // whether timer should be shown (1) or not (0)
            usn: 0                    // See usn in cards table for details.
        }, advancedConf)

        return new Promise((resolve, reject) => {
            this.ankiDb.get(`SELECT decks,dconf FROM col;`, (err, row) => { err ? reject(new Error(err)) : resolve(row) })
        }).then(col => {
            return new Promise((resolve, reject) => {
                let decks = JSON.parse(col.decks)
                decks[id] = baseConf
                let dconf = JSON.parse(col.dconf)
                dconf[id] = advancedConf
                this.ankiDb.exec(`
                    UPDATE col SET
                        decks='${JSON.stringify(decks)}',
                        dconf='${JSON.stringify(dconf)}'
                    ;
                `, (err, row) => { err ? reject(new Error(err)) : resolve({baseConf,advancedConf}) })
            })
        })
    }

    addNote(noteCfg={}) {
        return new Promise((resolve, reject) => {
            const timestampNow = Math.round(Date.now()/1000)
            const defaultNodeCfg = {
                id: timestampNow,
                guid: crypto.randomBytes(16).toString("hex"),
                mid: 0,
                mod: timestampNow,
                usn: -1,
                tags: [],
                flds: [],
                sfld: "",
                csum: 0,
                flags: 0,
                data: ""
            }
            const noteCfg = _.merge(noteCfg,defaultNodeCfg)
            noteCfg.sfld = (!noteCfg.sfld && noteCfg.flds.length>0) ? nodeCfg.sfld=noteCfg.flds[0] : nodeCfg.sfld
            noteCfg.csum = parseInt(crypto.createHash('sha1').update(noteCfg.flds.length>0 ? noteCfg.flds[0] : '').digest('hex').substring(0,8))
            this.ankiDb.exec(`
                INSERT INTO notes
                VALUES(
                    ${noteCfg.id},
                    '${noteCfg.guid}',
                    ${noteCfg.mid},
                    ${noteCfg.mod},
                    ${noteCfg.usn},
                    ' ${noteCfg.tags.join(" ")} ',
                    '${nodeCfg.flds.join(String.fromCharCode(0x1f))}',
                    '${noteCfg.sfld}',
                    ${noteCfg.csum},
                    ${noteCfg.flags},
                    '${noteCfg.data}'
                );`, (err, row) => { err ? reject(new Error(err)) : resolve(noteCfg) }
            )
        })
    }

    addCard(conf={}) {
        return new Promise((resolve, reject) => {
            const timestampNow = Math.round(Date.now()/1000)
            const nid = Math.floor(Math.random() * 10000000000000)
            conf = _.merge({ // dconf entry
                id: timestampNow,
                nid: nid,
                did: 0, // deck id (required)
                ord: 0,
                mod: timestampNow,
                usn: -1,
                type: 0,
                queue: 0,
                due: 0,
                ivl: 0,
                factor: 0,
                reps: 0,
                lapses: 0,
                odue: 0,
                odid: 0,
                flags: 0,
                data: ''
            }, baseConf)

            this.ankiDb.exec(`
                INSERT INTO cards
                VALUES(
                    ${id},
                    ${nid},
                    ${did},
                    ${ord},
                    ${mod},
                    ${usn},
                    ${type},
                    ${queue},
                    ${due},
                    ${ivl},
                    ${factor},
                    ${reps},
                    ${lapses},
                    ${odue},
                    ${odid},
                    ${flags},
                    '${data}'
                );
            `, (err, row) => { err ? reject(new Error(err)) : resolve(conf) })
        })
    }

    addModel(model) {
        const timestampNow = Math.round(Date.now()/1000)

        for ([fld,i] of model.flds.entries()) {
            fld = _.merge({
                font: "Liberation Sans",
                media: [],
                name: null, // overwrite recommended
                ord: i,
                rtl: false,
                size: 20,
                sticky: false
            }, fld)
        }

        for ([tmpl,i] of model.tmpls.entries()) {
            tmpl = _.merge({
                name: "Template name", // overwrite recommended
                qfmt: "", // overwrite recommended
                did: null,
                bafmt: "",
                afmt: "", // overwrite recommended
                ord: i,
                bqfmt: ""
            }, tmpl)
        }

        if (!model.req) {
            const ords = model.flds.map(fld=>fld.ord)
            model.req = [[ 0, "any", ords]]
        }

        model = _.merge({
            vers: [],
            name: "New Model",
            tags: ["ke10"],
            did: 0, // overwrite required (Long specifying the id of the deck that cards are added to by default)
            usn: -1,
            req: [ // Array of arrays describing which fields are required
                   // for each card to be generated, looks like: [[0, "any", [0, 3, 6]]],
                   // this is required to display a template",
                [0, "any",
                  // the 'ord' value of the template object from the 'tmpls' array you are setting the required fields of",
                  // '? string, "all" or "any"',
                    [ //"? another array of 'ord' values from field object you want to require from the 'flds' array"
                        //0, 1, 2, 3, 4, 5, 6
                    ]
                ]
            ],
            flds: [], // JSONArray containing object for each field in the model
            sortf: 0,
            latexPre: "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
            tmpls: [], // "JSONArray containing object of CardTemplate for each card in model"
            mod: timestampNow,
            latexPost: "\\end{document}",
            type: 0,
            id: 0, // overwrite required (Long specifying the id of the deck that cards are added to by default)
            css: "",
            addon: "Chinese (basic)"
        }, model)

        const aaaaaa = {
            "1535034969732": {
                "flds": [{
                    "name": "Hanzi",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 0,
                    "font": "Liberation Sans",
                    "size": 20
                }, {
                    "name": "Meaning",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 1,
                    "font": "Arial",
                    "size": 20
                }, {
                    "name": "Example",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 2,
                    "font": "Liberation Sans",
                    "size": 20
                }, {
                    "name": "Pinyin",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 3,
                    "font": "Arial",
                    "size": 20
                }, {
                    "name": "Color",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 4,
                    "font": "Arial",
                    "size": 20
                }, {
                    "name": "Sound",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 5,
                    "font": "Arial",
                    "size": 20
                }, {
                    "name": "Diagram",
                    "media": [],
                    "sticky": false,
                    "rtl": false,
                    "ord": 6,
                    "font": "Arial",
                    "size": 20
                }],
                "sortf": 0,
                "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
                "tmpls": [{
                    "name": "Recognition Chinese -> English",
                    "qfmt": "<div id=\"q\">{{Sound}}</div>\n<hr>\n<div id=\"hanziField\" class=\"headChinese\" style=\"display: none\" onclick=\"document.getElementById(this.id+'Alt').style.display='block'; this.style.display='none'; return false;\">{{Hanzi}}</div>\n<div id=\"hanziFieldAlt\" class=\"headChinese\"  style=\"display: block\" onclick=\"document.getElementById(this.id.replace('Alt','')).style.display='block'; this.style.display='none'; return false;\">Hanzi</div>\n\n\n<div id=\"pinyinField\" class=\"chinese\"  style=\"display: none\" onclick=\"document.getElementById(this.id+'Alt').style.display='block'; this.style.display='none'; return false;\">{{Pinyin}}<br/>{{Color}}<br/></div>\n<div id=\"pinyinFieldAlt\" class=\"chinese\"  style=\"display: block\" onclick=\"document.getElementById(this.id.replace('Alt','')).style.display='inline'; this.style.display='none'; return false;\">pinyin<br/>color</div>\n\n\n<br/>\naudio\n<br/>\n\n<div id=\"meaningField\" style=\"display: none\" onclick=\"document.getElementById(this.id+'Alt').style.display='block'; this.style.display='none'; return false;\">{{Meaning}}</br></div>\n<div id=\"meaningFieldAlt\"  style=\"display: block\" onclick=\"document.getElementById(this.id.replace('Alt','')).style.display='inline'; this.style.display='none'; return false;\">Meaning</div>\n<br/>\n\n<div id=\"exampleField\" style=\"display: none\" onclick=\"document.getElementById(this.id+'Alt').style.display='block'; this.style.display='none'; return false;\">{{Example}}<br/></div>\n<div id=\"exampleFieldAlt\"  style=\"display: block\" onclick=\"document.getElementById(this.id.replace('Alt','')).style.display='inline'; this.style.display='none'; return false;\">Example</div>\n<br/>\n\n\n<div id=\"diagramField\" style=\"display: none\" onclick=\"document.getElementById(this.id+'Alt').style.display='block'; this.style.display='none'; return false;\">{{Diagram}}</div>\n<div id=\"diagramFieldAlt\"  style=\"display: block\" onclick=\"document.getElementById(this.id.replace('Alt','')).style.display='inline'; this.style.display='none'; return false;\">Diagram</div>\n",
                    "did": null,
                    "bafmt": "",
                    "afmt": "<div id=\"hanziField\" class=\"headChinese\">{{Hanzi}}</div>\n<div id=\"pinyinField\" class=\"chinese\">{{Pinyin}}</div>\n<div id=\"colorField\" class=\"chinese\">{{Color}}</div>\n<br/>\n{{Sound}}\n<div id=\"meaningField\" >{{Meaning}}</div><br/>\n<div id=\"exampleField\" >{{Example}}</div><br/>\n{{Diagram}}",
                    "ord": 0,
                    "bqfmt": ""
                }],
                "mod": 1535241961,
                "latexPost": "\\end{document}",
                "type": 0,
                "id": 1535034969732,
                "css": "",
                "addon": "Chinese (basic)"
            },
            "1535034852520": {
                "vers": [],
                "name": "A Course in Contemporary Contemporary - Chinese to English",
                "tags": ["ke10"],
                "did": 1535040043730,
                "usn": -1,
                "req": [
                    [0, "any", [0, 1, 2, 3, 5, 6]]
                ],
                "flds": [{
                    "name": "Hanzi",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 0,
                    "font": "Liberation Sans",
                    "size": 20
                }, {
                    "name": "Meaning",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 1,
                    "font": "Arial",
                    "size": 20
                }, {
                    "name": "Example",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 2,
                    "font": "Liberation Sans",
                    "size": 20
                }, {
                    "name": "Pinyin",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 3,
                    "font": "Arial",
                    "size": 20
                }, {
                    "name": "Color",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 4,
                    "font": "Arial",
                    "size": 20
                }, {
                    "name": "Sound",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 5,
                    "font": "Arial",
                    "size": 20
                }, {
                    "name": "Diagram",
                    "media": [],
                    "sticky": false,
                    "rtl": false,
                    "ord": 6,
                    "font": "Arial",
                    "size": 20
                }],
                "sortf": 0,
                "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
                "tmpls": [{
                    "name": "Chinese -> English",
                    "qfmt": "<h1 id=\"loadingScreen\">Loading libraries...</h1>\n<div id=\"container\" class=\"container hide\">\n  <div class=\"panel-group\">\n    <div class=\"panel panel-primary\">\n      <div class=\"panel-heading\">\n        <h4 class=\"panel-title\">\n          <a data-toggle=\"collapse\" href=\"#hanzi-collapse\">H\u00e0nz\u00ec</a>\n        </h4>\n      </div>\n      <div id=\"hanzi-collapse\" class=\"panel-collapse collapse in\">\n        <div class=\"panel-body\">\n          <h1>{{Hanzi}}</h1>\n        </div>\n      </div>\n    </div>\n    <div class=\"panel panel-primary\">\n      <div class=\"panel-heading\">\n        <h4 class=\"panel-title\">\n          <a data-toggle=\"collapse\" href=\"#diagram-collapse\">Stroke order</a>\n        </h4>\n      </div>\n      <div id=\"diagram-collapse\" class=\"panel-collapse collapse\">\n        <div class=\"panel-body\">\n          <div id=\"diagram-container\">{{Diagram}}</div>\n        </div>\n      </div>\n    </div>\n    <div class=\"panel panel-primary\">\n      <div class=\"panel-heading\">\n        <h4 class=\"panel-title\">\n          <a data-toggle=\"collapse\" href=\"#pinyin-collapse\">P\u012bny\u012bn</a>\n        </h4>\n      </div>\n      <div id=\"pinyin-collapse\" class=\"panel-collapse collapse\">\n        <div class=\"panel-body\">\n          <h1>{{Pinyin}}</h1>\n        </div>\n      </div>\n    </div>\n    <div class=\"panel panel-primary\">\n      <div class=\"panel-heading\">\n        <h4 class=\"panel-title\">\n          <a data-toggle=\"collapse\" href=\"#english-collapse\">English translation</a>\n        </h4>\n      </div>\n      <div id=\"english-collapse\" class=\"panel-collapse collapse\">\n        <div class=\"panel-body\">\n          <h4>{{Meaning}}</h4>\n        </div>\n      </div>\n    </div>\n    <div class=\"panel panel-primary\">\n      <div class=\"panel-heading\">\n        <h4 class=\"panel-title\">\n          <a data-toggle=\"collapse\" href=\"#example-collapse\">Example</a>\n        </h4>\n      </div>\n      <div id=\"example-collapse\" class=\"panel-collapse collapse\">\n        <div class=\"panel-body\">\n          <h1>{{Example}}</h1>\n        </div>\n      </div>\n    </div>\n    <div class=\"panel panel-primary\">\n      <div class=\"panel-heading\">\n        <h4 class=\"panel-title\">\n          Chinese Audio\n        </h4>\n      </div>\n      <div class=\"panel-body\">\n        <div id=\"audio\">{{Sound}}</div>\n      </div>\n    </div>\n  </div>\n</div>\n\n\n\n<script>\n    function onLibsLoaded() {\n        $('#loadingScreen').addClass('hide');\n        $('#container').removeClass('hide');\n        //alert($('#audio').html());\n    }\n    function loadLibs(files, success_cb, fail_cb, check, maxTimeout) {\n        files.forEach(function(file){\n            var ext = file.split('.').slice(-1).pop();\n            if (ext === 'js') {\n                var script = document.createElement('script');\n                script.src = file;\n                document.getElementsByTagName('head')[0].appendChild(script);\n            } else if (ext === 'css') {\n                var css = document.createElement('link');\n                css.rel = 'stylesheet'\n                css.type = 'text/css';\n                css.href = file;\n                document.getElementsByTagName('head')[0].appendChild(css);\n            }\n        })\n        if (check === undefined) {\n            success_cb();\n        } else {\n            maxTimeout = maxTimeout || 5000\n            var t0 = Date.now();\n            function waitUntilLoaded(){\n                if (!check()) {\n                    if (Date.now() < t0+maxTimeout) {\n                        setTimeout(waitUntilLoaded,100);\n                    } else {\n                        fail_cb();\n                    }\n                } else {\n                    success_cb();\n                }\n            }\n            waitUntilLoaded();\n        }\n    }\n\n    function libCheck() {\n        return !!((typeof jQuery !== 'undefined' || window.jQuery) && typeof $().modal == 'function')\n    }\n\n    function onLibsFailed() {\n        document.getElementById('loadingScreen').innerHTML = 'Failed to load js/css libraries! Trying again...';\n        libInit();\n    }\n\n    function libInit() {\n        loadLibs(['_jquery-3.js','_bootstrap-3.js','_bootstrap-3.css','_bootstrap-3-theme.css'], onLibsLoaded, onLibsFailed, libCheck, 500);\n    }\n\n    window.onload = function(e) {\n        libInit();\n    }\n</script>\n",
                    "did": null,
                    "bafmt": "",
                    "afmt": "<h1 id=\"loadingScreen\">Loading libraries...</h1>\n<div id=\"container\" class=\"container hide\">\n  <div class=\"panel-group\">\n    <div class=\"panel panel-primary\">\n      <div class=\"panel-heading\">\n        <h4 class=\"panel-title\">\n          <a data-toggle=\"collapse\" href=\"#hanzi-collapse\">H\u00e0nz\u00ec</a>\n        </h4>\n      </div>\n      <div id=\"hanzi-collapse\" class=\"panel-collapse collapse in\">\n        <div class=\"panel-body\">\n          <h1>{{Hanzi}}</h1>\n        </div>\n      </div>\n    </div>\n    <div class=\"panel panel-primary\">\n      <div class=\"panel-heading\">\n        <h4 class=\"panel-title\">\n          <a data-toggle=\"collapse\" href=\"#diagram-collapse\">Stroke order</a>\n        </h4>\n      </div>\n      <div id=\"diagram-collapse\" class=\"panel-collapse collapse\">\n        <div class=\"panel-body\">\n          <div id=\"diagram-container\">{{Diagram}}</div>\n        </div>\n      </div>\n    </div>\n    <div class=\"panel panel-primary\">\n      <div class=\"panel-heading\">\n        <h4 class=\"panel-title\">\n          <a data-toggle=\"collapse\" href=\"#pinyin-collapse\">P\u012bny\u012bn</a>\n        </h4>\n      </div>\n      <div id=\"pinyin-collapse\" class=\"panel-collapse collapse\">\n        <div class=\"panel-body\">\n          <h1>{{Pinyin}}</h1>\n        </div>\n      </div>\n    </div>\n    <div class=\"panel panel-primary\">\n      <div class=\"panel-heading\">\n        <h4 class=\"panel-title\">\n          <a data-toggle=\"collapse\" href=\"#english-collapse\">English translation</a>\n        </h4>\n      </div>\n      <div id=\"english-collapse\" class=\"panel-collapse collapse\">\n        <div class=\"panel-body\">\n          <h4>{{Meaning}}</h4>\n        </div>\n      </div>\n    </div>\n    <div class=\"panel panel-primary\">\n      <div class=\"panel-heading\">\n        <h4 class=\"panel-title\">\n          <a data-toggle=\"collapse\" href=\"#example-collapse\">Example</a>\n        </h4>\n      </div>\n      <div id=\"example-collapse\" class=\"panel-collapse collapse\">\n        <div class=\"panel-body\">\n          <h1>{{Example}}</h1>\n        </div>\n      </div>\n    </div>\n    <div class=\"panel panel-primary\">\n      <div class=\"panel-heading\">\n        <h4 class=\"panel-title\">\n          Chinese Audio\n        </h4>\n      </div>\n      <div class=\"panel-body\">\n        {{Sound}}\n      </div>\n    </div>\n  </div>\n</div>\n\n<script>\n    function onLibsLoaded() {\n        //alert(\"asd\");\n        $('#loadingScreen').addClass('hide');\n        $('#container').removeClass('hide');\n    }\n    function loadLibs(files, success_cb, fail_cb, check, maxTimeout) {\n        files.forEach(function(file){\n            var ext = file.split('.').slice(-1).pop();\n            if (ext === 'js') {\n                var script = document.createElement('script');\n                script.src = file;\n                document.getElementsByTagName('head')[0].appendChild(script);\n            } else if (ext === 'css') {\n                var css = document.createElement('link');\n                css.rel = 'stylesheet'\n                css.type = 'text/css';\n                css.href = file;\n                document.getElementsByTagName('head')[0].appendChild(css);\n            }\n        })\n        if (check === undefined) {\n            success_cb();\n        } else {\n            maxTimeout = maxTimeout || 5000\n            var t0 = Date.now();\n            function waitUntilLoaded(){\n                if (!check()) {\n                    if (Date.now() < t0+maxTimeout) {\n                        setTimeout(waitUntilLoaded,100);\n                    } else {\n                        fail_cb();\n                    }\n                } else {\n                    success_cb();\n                }\n            }\n            waitUntilLoaded();\n        }\n    }\n\n    function libCheck() {\n        return !!((typeof jQuery !== 'undefined' || window.jQuery) && typeof $().modal == 'function')\n    }\n\n    function onLibsFailed() {\n        document.getElementById('loadingScreen').innerHTML = 'Failed to load js/css libraries! Trying again...';\n        libInit();\n    }\n\n    function libInit() {\n        loadLibs(['_jquery-3.js','_bootstrap-3.js','_bootstrap-3.css','_bootstrap-3-theme.css'], onLibsLoaded, onLibsFailed, libCheck, 1000);\n    }\n\n    window.onload = function(e) {\n        libInit();\n    }\n\n</script>\n",
                    "ord": 0,
                    "bqfmt": ""
                }],
                "mod": 1535648341,
                "latexPost": "\\end{document}",
                "type": 0,
                "id": 1535034852520,
                "css": "#q{\n\tfont-size: 24px;\n}\n\n#meaningField{\n\tfont-size: 24px;\n}\n\n.card {\n font-family: arial;\n font-size: 20px;\n text-align: center;\n color: black;\n background-color: white;\n}\n.card { word-wrap: break-word; }\n.win .chinese { font-family: \"MS Mincho\", \"\uff2d\uff33 \u660e\u671d\"; }\n.mac .chinese { }\n.linux .chinese { font-family: \"Kochi Mincho\", \"\u6771\u98a8\u660e\u671d\"; }\n.mobile .chinese { font-family: \"Hiragino Mincho ProN\"; }\n.chinese { font-size: 30px;}\n.headChinese { font-size: 48px;}\n.comment {font-size: 15px; color:grey;}\n.tags {color:gray;text-align:right;font-size:10pt;}\n.note {color:gray;font-size:12pt;margin-top:20pt;}\n.hint {font-size:12pt;}\n\n\n.tone1 {color: red;}\n.tone2 {color: orange;}\n.tone3 {color: green;}\n.tone4 {color: blue;}\n.tone5 {color: gray;}\n\n#diagram-container {\n    height: 150px;\n    width: 100%;\n    text-align: left;\n    overflow-y: scroll\n}\n#diagram-container > img {\n    width: 50%;\n}",
                "addon": "Chinese (basic)"
            },
            "1535034947930": {
                "vers": [],
                "name": "A Course in Contemporary Contemporary - English to Chinese",
                "tags": ["ke10"],
                "did": 1535039700267,
                "usn": -1,
                "req": [
                    [0, "any", [0, 1, 2, 3, 4, 5, 6]]
                ],
                "flds": [{
                    "name": "Hanzi",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 0,
                    "font": "Liberation Sans",
                    "size": 20
                }, {
                    "name": "Meaning",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 1,
                    "font": "Arial",
                    "size": 20
                }, {
                    "name": "Example",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 2,
                    "font": "Liberation Sans",
                    "size": 20
                }, {
                    "name": "Pinyin",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 3,
                    "font": "Arial",
                    "size": 20
                }, {
                    "name": "Color",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 4,
                    "font": "Arial",
                    "size": 20
                }, {
                    "name": "Sound",
                    "rtl": false,
                    "sticky": false,
                    "media": [],
                    "ord": 5,
                    "font": "Arial",
                    "size": 20
                }, {
                    "name": "Diagram",
                    "media": [],
                    "sticky": false,
                    "rtl": false,
                    "ord": 6,
                    "font": "Arial",
                    "size": 20
                }],
                "sortf": 0,
                "addon": "Chinese (basic)",
                "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
                "tmpls": [{
                    "name": "English -> Chinese",
                    "qfmt": "<div id=\"q\">{{Meaning}}</div>\n<hr>\n<div id=\"hanziField\" class=\"headChinese\" style=\"display: none\" onclick=\"document.getElementById(this.id+'Alt').style.display='block'; this.style.display='none'; return false;\">{{Hanzi}}</div>\n<div id=\"hanziFieldAlt\" class=\"headChinese\"  style=\"display: block\" onclick=\"document.getElementById(this.id.replace('Alt','')).style.display='block'; this.style.display='none'; return false;\">Hanzi</div>\n\n\n<div id=\"pinyinField\" class=\"chinese\"  style=\"display: none\" onclick=\"document.getElementById(this.id+'Alt').style.display='block'; this.style.display='none'; return false;\">{{Pinyin}}<br/>{{Color}}<br/></div>\n<div id=\"pinyinFieldAlt\" class=\"chinese\"  style=\"display: block\" onclick=\"document.getElementById(this.id.replace('Alt','')).style.display='inline'; this.style.display='none'; return false;\">pinyin<br/>color</div>\n\n\n<br/>\n{{Sound}}\n<br/>\n\n<div id=\"meaningField\" style=\"display: none\" onclick=\"document.getElementById(this.id+'Alt').style.display='block'; this.style.display='none'; return false;\">{{Meaning}}</br></div>\n<div id=\"meaningFieldAlt\"  style=\"display: block\" onclick=\"document.getElementById(this.id.replace('Alt','')).style.display='inline'; this.style.display='none'; return false;\">Meaning</div>\n<br/>\n\n<div id=\"exampleField\" style=\"display: none\" onclick=\"document.getElementById(this.id+'Alt').style.display='block'; this.style.display='none'; return false;\">{{Example}}<br/></div>\n<div id=\"exampleFieldAlt\"  style=\"display: block\" onclick=\"document.getElementById(this.id.replace('Alt','')).style.display='inline'; this.style.display='none'; return false;\">Example</div>\n<br/>\n\n\n<div id=\"diagramField\" style=\"display: none\" onclick=\"document.getElementById(this.id+'Alt').style.display='block'; this.style.display='none'; return false;\">{{Diagram}}</div>\n<div id=\"diagramFieldAlt\"  style=\"display: block\" onclick=\"document.getElementById(this.id.replace('Alt','')).style.display='inline'; this.style.display='none'; return false;\">Diagram</div>\n",
                    "did": null,
                    "bafmt": "",
                    "afmt": "<div id=\"hanziField\" class=\"headChinese\">{{Hanzi}}</div>\n<div id=\"pinyinField\" class=\"chinese\">{{Pinyin}}</div>\n<div id=\"colorField\" class=\"chinese\">{{Color}}</div>\n<br/>\n{{Sound}}\n<div id=\"meaningField\" >{{Meaning}}</div><br/>\n<div id=\"exampleField\" >{{Example}}</div><br/>\n{{Diagram}}",
                    "ord": 0,
                    "bqfmt": ""
                }],
                "latexPost": "\\end{document}",
                "type": 0,
                "id": 1535034947930,
                "css": "#q{\n\tfont-size: 24px;\n}\n\n#meaningField{\n\tfont-size: 24px;\n}\n\n.card {\n font-family: arial;\n font-size: 20px;\n text-align: center;\n color: black;\n background-color: white;\n}\n.card { word-wrap: break-word; }\n.win .chinese { font-family: \"MS Mincho\", \"\uff2d\uff33 \u660e\u671d\"; }\n.mac .chinese { }\n.linux .chinese { font-family: \"Kochi Mincho\", \"\u6771\u98a8\u660e\u671d\"; }\n.mobile .chinese { font-family: \"Hiragino Mincho ProN\"; }\n.chinese { font-size: 30px;}\n.headChinese { font-size: 48px;}\n.comment {font-size: 15px; color:grey;}\n.tags {color:gray;text-align:right;font-size:10pt;}\n.note {color:gray;font-size:12pt;margin-top:20pt;}\n.hint {font-size:12pt;}\n\n\n.tone1 {color: red;}\n.tone2 {color: orange;}\n.tone3 {color: green;}\n.tone4 {color: blue;}\n.tone5 {color: gray;}\n",
                "mod": 1535242454
            }
        }

        return new Promise((resolve, reject) => {
            this.ankiDb.get(`SELECT models FROM col;`, (err, row) => { err ? reject(new Error(err)) : resolve(row) })
        }).then(col => {
            return new Promise((resolve, reject) => {
                let models = JSON.parse(col.models)
                models[timestampNow] = model
                this.ankiDb.exec(`
                    UPDATE col SET
                        models='${JSON.stringify(models)}'
                    ;
                `, (err, row) => { err ? reject(new Error(err)) : resolve(row) })
            })
        })
    }

    addMedia(files) {

    }
}

module.exports = AnkiDeckGenerator
