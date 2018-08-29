#!/usr/bin/env node

const AnkiDeckGenerator = require('./AnkiDeckGenerator')
const ankiDeckGen = new AnkiDeckGenerator()

ankiDeckGen.mmah.getCharData('你').then(console.log)
