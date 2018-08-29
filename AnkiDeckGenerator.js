'use strict'

const MakeMeAHanzi = require('./MakeMeAHanzi')

class AnkiDeckGenerator {
    constructor(conf={}) {
        this.graphicsDataPath = conf.graphicsDataPath || './submodules/makemeahanzi/graphics.txt'
        this.dictPath = conf.dictPath || './submodules/makemeahanzi/dictionary.txt'
        this.animatedSvgsDir = conf.animatedSvgsDir || './submodules/makemeahanzi/svgs'
        this.stillSvgsDir = conf.stillSvgsDir || './submodules/makemeahanzi/svgs-still'
        this.mmahConf = {graphicsDataPath:this.graphicsDataPath, dictPath: this.dictPath, animatedSvgsDir: this.animatedSvgsDir, stillSvgsDir: this.stillSvgsDir}
        this.mmah = new MakeMeAHanzi(this.mmahConf)
    }

}

module.exports = AnkiDeckGenerator
