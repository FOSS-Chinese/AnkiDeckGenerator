'use strict'

const sqlite3 = require('sqlite3')
const crypto = require("crypto")
const _ = require('lodash')
const fs = require('fs-extra')

/*
// BASIC IDEA (DOES NOT REPRESENT ACTUAL IMPLEMENTATION)
apkg.addDeck(config)
[modelId, templateIndexNumbers] = apkg.addModel(config, fields, templates)
noteId = apkg.addNote(config, modelId, fields)
cardId = apkg.addCard(config, notesId, deckId, fields, templateIndexNumber, originalDeckId) // originalDeckId is required for filtered decks
*/

class AnkiPackage {
    constructor(apkgFile, tempDir='./apkg-temp') {
        this.tempDir = tempDir
        this.apkgFile = apkgFile || './new-deck.apkg'
        this.deckFile = `${this.tempDir}/collection.anki2`
        this.mediaFile = `${this.tempDir}/media`
    }
    init() {
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
                        ${mod},                       /* mod */
                        ${scm},                       /* scm */
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
            name: "Default",         // recommendation: overwrite (REQUIRED) [name of deck]
            desc: "",                // recommendation: overwrite (optional) [OPTIONAL deck description]
            dyn: 0,                  // recommendation: none (optional)      [1 if dynamic (AKA filtered) deck]
            collapsed: false,        // recommendation: leave as is          [true when deck is collapsed]
            browserCollapsed: false, // recommendation: leave as is          [true when deck collapsed in browser]
            extendRev: 50,           // recommendation: leave as is          [extended review card limit (for custom study)]
            extendNew: 10,           // recommendation: leave as is          [extended new card limit (for custom study)]
            newToday: [0, 0],        // recommendation: leave as is          [two number. First one currently not used. Second is the negation (-) of the number of new cards added today by custom study]
            timeToday: [0, 0],       // recommendation: leave as is          [two number array used somehow for custom study. Currently unused in the code]
            revToday: [0, 0],        // recommendation: leave as is          [two number. First one currently not used. Second is the negation (-) the number of review cards added today by custom study]
            lrnToday: [0, 0],        // recommendation: leave as is          [two number array used somehow for custom study. Currently unused in the code]
            usn: 0,                  // recommendation: leave as is          [usn: Update sequence number: used in same way as other usn vales in db]
            conf: id,                // recommendation: leave as is          [id of option group from dconf in `col` table]
            id: id,                  // recommendation: leave as is          [deck ID (automatically generated long)]
            mod: Date.now()          // recommendation: leave as is          [last modification time]
        }, baseConf)
        advancedConf = _.merge({//
            autoplay: false,          // whether the audio associated to a question should be played when the question is shown
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
                initialFactor: 2500,  // The initial ease factor
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
                maxIvl: 2190000,      // the maximal interval for review
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

    addModel(model={}) {
        const timestampNow = Math.round(Date.now()/1000)
        const id = Math.round(10000000000*Math.random())

        for (let [i,fld] of model.flds.entries()) {
            model.flds[i] = _.merge({
                name: null,              // recommendation: overwrite (optional)
                font: "Liberation Sans", // recommendation: leave as is []
                size: 20,                // recommendation: leave as is
                rtl: false,              // recommendation: leave as is
                sticky: false,           // recommendation: ?
                ord: i,                  // recommendation: leave as is
                media: []                // recommendation: ?
            }, fld)
        }

        for (let [i,tmpl] of model.tmpls.entries()) {
            model.tmpls[i] = _.merge({
                name: "Template name", // recommendation: overwrite (REQUIRED)
                qfmt: "",              // recommendation: overwrite (optional)
                afmt: "",              // recommendation: overwrite (optional)
                did: null,             // recommendation: leave as is           [deck overwrite (id)]
                bafmt: "",             // recommendation: leave as is
                bqfmt: "",             // recommendation: leave as is
                ord: i                 // recommendation: leave as is
            }, tmpl)
        }

        if (!model.req) {
            const ords = model.flds.map(fld=>fld.ord)
            model.req = []
            for (const [i,tpl] of model.tmpls.entries())
                model.req.push([i, "any", ords])
        }

        model = _.merge({
            name: "New Model", // recommendation: overwrite (REQUIRED)
            did: 0,            // recommendation: overwrite (REQUIRED) [(Long specifying the id of the deck that cards are added to by default)
            flds: [],          // recommendation: overwrite (REQUIRED) [JSONArray containing object for each field in the model
            tmpls: [],         // recommendation: overwrite (REQUIRED) ["JSONArray containing object of CardTemplate for each card in model"
                               // recommendation: overwrite (optional)
            css: `
                .card {
                    font-family: arial;
                    font-size: 20px;
                    text-align: center;
                    color: black;
                    background-color: white;
                }
                .cloze {
                    font-weight: bold;
                    color: blue;
                }
            `,
            tags: ["ke10"],    // recommendation: ?
            usn: -1,           // recommendation: ?
            req: [ // recommendation: ?
                   // Array of arrays describing which fields are required
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
            latexPre: "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
            latexPost: "\\end{document}",
            sortf: 0,
            type: 0,
            addon: "Chinese (basic)",    // recommendation: ?
            mod: timestampNow,
            id: timestampNow,
            vers: []
        }, model)

        return new Promise((resolve, reject) => {
            this.ankiDb.get(`SELECT models FROM col;`, (err, row) => { err ? reject(new Error(err)) : resolve(row) })
        }).then(col => {
            return new Promise((resolve, reject) => {
                let models = JSON.parse(col.models)
                models[timestampNow] = model
                this.ankiDb.run(`
                    UPDATE col SET
                        models = ?
                    ;
                `, JSON.stringify(models), function (err, row) { err ? reject(new Error(err)) : resolve(this.changes) })
            })
        }).then(()=>{
            return new Promise((resolve, reject) => {
                this.ankiDb.get(`SELECT models FROM col;`, (err, row) => { err ? reject(new Error(err)) : resolve(JSON.parse(row.models)[timestampNow]) })
            })
        })
    }

    addNote(noteCfg={}) {
        return new Promise((resolve, reject) => {
            const timestampNow = Math.round(Date.now()/1000)
            const id = Math.round(100000000000000*Math.random())
            const guid = crypto.randomBytes(16).toString("hex")
            const defaultNoteCfg = {
                mid: 0,            // recommendation: overwrite (REQUIRED)         [model id]
                flds: [],          // recommendation: overwrite (REQUIRED)         [data to the fields]
                tags: [],          // recommendation: none (overwrite is optional) []
                sfld: "",          // recommendation: leave as is                  [sort by field with this name]
                flags: 0,          // recommendation: leave as is
                mod: timestampNow, // recommendation: leave as is
                usn: -1,           // recommendation: leave as is
                csum: 0,           // recommendation: leave as is
                id: id,            // recommendation: leave as is
                guid: guid,        // recommendation: leave as is
                data: ''           // recommendation: leave as is                  [useless, has no effect]
            }
            noteCfg = _.merge(defaultNoteCfg, noteCfg)

            noteCfg.sfld = (!noteCfg.sfld && noteCfg.flds.length>0) ? noteCfg.sfld=noteCfg.flds[0] : noteCfg.sfld
            noteCfg.csum = parseInt('0x'+crypto.createHash('sha1').update(noteCfg.flds.length>0 ? noteCfg.flds[0] : '').digest('hex').substring(0,8))

            this.ankiDb.exec(`
                INSERT INTO notes
                VALUES(
                    ${noteCfg.id},
                    '${noteCfg.guid}',
                    ${noteCfg.mid},
                    ${noteCfg.mod},
                    ${noteCfg.usn},
                    ' ${noteCfg.tags.join(" ")} ',
                    '${noteCfg.flds.join(String.fromCharCode(0x1f)).replace(/%/g,"!%").replace(/'/g,"%")}',
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
            const id = Math.floor(Math.random() * 10000000000000)
            conf = _.merge({ // dconf entry
                nid: 0,            // recommendation: overwrite (REQUIRED)         [notes id]
                did: 0,            // recommendation: overwrite (REQUIRED)         [deck id]
                odid: 0,           // recommendation: overwrite                    [original deck id]
                ord: 0,            // recommendation: none (optional)              [template index]
                type: 0,           // recommendation: none (optional)              [0=new, 1=learning, 2=due, 3=filtered]
                queue: 0,
                due: 0,
                ivl: 0,
                factor: 0,
                reps: 0,
                lapses: 0,
                left: 0,
                odue: 0,
                flags: 0,
                usn: -1,
                mod: timestampNow, // recommendation: leave as is
                id: id,            // recommendation: leave as is
                data: ''           // useless, not used
            }, conf)

            this.ankiDb.exec(`
                INSERT INTO cards
                VALUES(
                    ${conf.id},
                    ${conf.nid},
                    ${conf.did},
                    ${conf.ord},
                    ${conf.mod},
                    ${conf.usn},
                    ${conf.type},
                    ${conf.queue},
                    ${conf.due},
                    ${conf.ivl},
                    ${conf.factor},
                    ${conf.reps},
                    ${conf.lapses},
                    ${conf.left},
                    ${conf.odue},
                    ${conf.odid},
                    ${conf.flags},
                    '${conf.data}'
                );
            `, (err, row) => { err ? reject(new Error(err)) : resolve(conf) })
        })
    }

    async addMedia(files) {
        files = Array.isArray(files) ? files : [files]
        const media = await fs.readJSON(this.mediaFile) // TODO: maybe store in this.media
        let maxIndex
        try {
            maxIndex = Object.keys(media).reduce(function(a, b){return parseInt(a,10) > parseInt(b,10) ? a : b})
        } catch {
            maxIndex = 0
        }
        for (const [i,file] of files.entries()) {
            maxIndex++
            const filename = file.split(/(\\|\/)/g).pop()
            await fs.copy(file,`${this.tempDir}/${maxIndex}`)
            media[maxIndex.toString()] = filename.startsWith('_') ? filename : `_${filename}`
        }
        return await fs.writeJSON(this.mediaFile, media)
    }

    async hasMedia(filenameToSearch) {
        const media = await fs.readJSON(this.mediaFile)
        for (const [id,filename] of Object.entries(media)) {
            if (filename === filenameToSearch)
                return true
        }
    }
}

module.exports = AnkiPackage
