'use strict'

const MakeMeAHanzi = require('./MakeMeAHanzi')
const sqlite3 = require('sqlite3')

class AnkiDeckGenerator {
    constructor(deckFile, mmahConf) {
        this.mmahConf = this.mmahConf || {
            graphicsDataPath: './submodules/makemeahanzi/graphics.txt',
            dictPath: './submodules/makemeahanzi/dictionary.txt'
            animatedSvgsDir: './submodules/makemeahanzi/svgs'
            stillSvgsDir: './submodules/makemeahanzi/svgs-still'
        }
        this.mmah = new MakeMeAHanzi(this.mmahConf)
        this.deckFile = deckFile || './new-deck.apkg'

        this.deckDb = new sqlite3.Database(this.deckFile, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, err => {
            if (err) {
                throw new Error(err)
            }
        })
    }
    init() {
        sqlTpl = `
        PRAGMA foreign_keys=OFF;
        BEGIN TRANSACTION;
        CREATE TABLE col (
            id              integer primary key,
            crt             integer not null,
            mod             integer not null,
            scm             integer not null,
            ver             integer not null,
            dty             integer not null,
            usn             integer not null,
            ls              integer not null,
            conf            text not null,
            models          text not null,
            decks           text not null,
            dconf           text not null,
            tags            text not null
        );
        INSERT INTO col VALUES(
            1,              /* id */
            1332961200,     /* crt */
            1398130163295,  /* mod */
            1398130163168,  /* scm */
            11,             /* ver */
            0,              /* dty */
            0,              /* usn */
            0,              /* ls */
            '{              /* config */
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
                "curModel": "1398130163168",
                "collapseTime": 1200
            }',

            '{              /* models */
                "1342697561419": {
                    "vers": [],
                    "name": "Basic",
                    "tags": [],
                    "did": 1398130078204,
                    "usn": -1,
                    "req": [[0, "all", [0]]],
                    "flds": [
                        {
                            "name": "Front",
                            "rtl": false,
                            "sticky": false,
                            "media": [],
                            "ord": 0,
                            "font": "Arial",
                            "size": 12
                        }, {
                            "name": "Back",
                            "rtl": false,
                            "sticky": false,
                            "media": [],
                            "ord": 1,
                            "font": "Arial",
                            "size": 12
                        }
                    ],
                    "sortf": 0,
                    "latexPre": "\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n",
                    "tmpls": [
                        {
                            "name": "Forward",
                            "qfmt": "Template:Front",
                            "did": null,
                            "bafmt": "",
                            "afmt": "Template:FrontSide\n\n
        <hr id=answer/>\n\n{{Back}}",
                            "ord": 0,
                            "bqfmt": ""
                        }
                    ],
                    "latexPost": "\\end{document}",
                    "type": 0,
                    "id": 1342697561419,
                    "css": ".card {\n font-family: arial;\n font-size: 30px;\n text-align: center;\n color: black;\n background-color: white;\n}\n\n.card1 { background-color: #FFFFFF; }",
                    "mod": 1398130117
                }
            }',

            '{              /* decks */
                "1": {
                    "desc": "",
                    "name": "Default",
                    "extendRev": 50,
                    "usn": 0,
                    "collapsed": false,
                    "newToday": [0, 0],
                    "timeToday": [0, 0],
                    "dyn": 0,
                    "extendNew": 10,
                    "conf": 1,
                    "revToday": [0, 0],
                    "lrnToday": [0, 0],
                    "id": 1,
                    "mod": 1398130160
                },
                "1398130078204": {
                    "desc": "",
                    "name": "tatoeba",
                    "extendRev": 50,
                    "usn": -1,
                    "collapsed": false,
                    "newToday": [754, 0],
                    "timeToday": [754, 0],
                    "dyn": 0,
                    "extendNew": 10,
                    "conf": 1,
                    "revToday": [754, 0],
                    "lrnToday": [754, 0],
                    "id": 1398130078204,
                    "mod": 1398130140
                }
            }',

            '{              /* dconf */
                "1": {
                    "name": "Default",
                    "replayq": true,
                    "lapse": {
                        "leechFails": 8,
                        "minInt": 1,
                        "delays": [10],
                        "leechAction": 0,
                        "mult": 0
                    },
                    "rev": {
                        "perDay": 100,
                        "fuzz": 0.05,
                        "ivlFct": 1,
                        "maxIvl": 36500,
                        "ease4": 1.3,
                        "bury": true,
                        "minSpace": 1
                },
                    "timer": 0,
                    "maxTaken": 60,
                    "usn": 0,
                    "new": {
                        "perDay": 20,
                        "delays": [1, 10],
                        "separate": true,
                        "ints": [1, 4, 7],
                        "initialFactor": 2500,
                        "bury": true,
                        "order": 1
                    },
                    "mod": 0,
                    "id": 1,
                    "autoplay": true
                }
            }',

            '{}'            /* tags */
        );
        CREATE TABLE notes (
            id              integer primary key,   /* 0 */
            guid            text not null,         /* 1 */
            mid             integer not null,      /* 2 */
            mod             integer not null,      /* 3 */
            usn             integer not null,      /* 4 */
            tags            text not null,         /* 5 */
            flds            text not null,         /* 6 */
            sfld            integer not null,      /* 7 */
            csum            integer not null,      /* 8 */
            flags           integer not null,      /* 9 */
            data            text not null          /* 10 */
        );
        INSERT INTO notes VALUES(1398130088495,'Ot0!xywPWG',1342697561419,1398130110,-1,,'Bonjour�Hello','Bonjour',4077833205,0,);
        INSERT INTO notes VALUES(1398130111274,'OQxYbRc]Dm',1342697561419,1398130117,-1,,'Merci�Thank you','Merci',1273459409,0,);
        CREATE TABLE cards (
            id              integer primary key,   /* 0 */
            nid             integer not null,      /* 1 */
            did             integer not null,      /* 2 */
            ord             integer not null,      /* 3 */
            mod             integer not null,      /* 4 */
            usn             integer not null,      /* 5 */
            type            integer not null,      /* 6 */
            queue           integer not null,      /* 7 */
            due             integer not null,      /* 8 */
            ivl             integer not null,      /* 9 */
            factor          integer not null,      /* 10 */
            reps            integer not null,      /* 11 */
            lapses          integer not null,      /* 12 */
            left            integer not null,      /* 13 */
            odue            integer not null,      /* 14 */
            odid            integer not null,      /* 15 */
            flags           integer not null,      /* 16 */
            data            text not null          /* 17 */
        );
        INSERT INTO cards VALUES(1398130110964,1398130088495,1398130078204,0,1398130110,-1,0,0,484332854,0,0,0,0,0,0,0,0,);
        INSERT INTO cards VALUES(1398130117922,1398130111274,1398130078204,0,1398130117,-1,0,0,353754516,0,0,0,0,0,0,0,0,);
        CREATE TABLE revlog (
            id              integer primary key,
            cid             integer not null,
            usn             integer not null,
            ease            integer not null,
            ivl             integer not null,
            lastIvl         integer not null,
            factor          integer not null,
            time            integer not null,
            type            integer not null
        );
        CREATE TABLE graves (
            usn             integer not null,
            oid             integer not null,
            type            integer not null
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
    }
    addField(name) {

    }
    addMedia(files) {

    }
    save() {

    }
}

module.exports = AnkiDeckGenerator
