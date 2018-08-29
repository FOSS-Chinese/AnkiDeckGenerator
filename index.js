#!/usr/bin/env node

const AnkiDeckGenerator = require('./ankiDeckGenerator')
const ankiDeckGen = new AnkiDeckGenerator()

ankiDeckGen.mmah.getCharData('你').then(console.log)
