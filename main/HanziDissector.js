'use strict'

const mustache = require('mustache')

class HanziDissector {
    constructor(mmah) {
        this.mmah = mmah
    }

    function getTextType(text) {
        let type
        if (/[，？！。；,\?\!\.\;\s]/.test(text)) {
            type = 'sentence'
        } else if (text.length > 1) {
            type = 'word'
        } else {
            type = 'char'
        }
        return type
    }

    function groupInput(input) {
        const groupedInput = {}
        for (const [deckName,deckItems] of Object.entries(input)) {
            groupedInput[deckName] = {chars:[],words:[],sentences:[]}
            for (const [i,deckItem] of deckItems.entries()) {
                let type = getTextType(deckItem.simplified)
                if (type === 'sentence') {
                    groupedInput[deckName].sentence.push(deckItem)
                } else if (type === 'word') {
                    groupedInput[deckName].words.push(deckItem)
                } else {
                    groupedInput[deckName].chars.push(deckItem)
                }
            }
        }
    }

    async function extractCmpsRecursively(char,chars,extractedChars) {
        const charData = (await this.mmah.getCharData([char]))[char]
        if (charData.decomposition === '？')
            return
        const cmps = charData.decomposition.replace(/[\u2FF0-\u2FFB？]+/g,'').split('')
        for (const [i,cmp] of cmps.entries()) {
            if (!chars.includes(cmp) && !extractedChars.includes(cmp)) {
                extractedChars.push(cmp)
                await this.extractCmpsRecursively(cmp,chars,extractedChars)
            }
        }
    }

    async function dissect(input,dissect=true) {
        const groupedInput = this.groupInput(input)
        groupedInput.allChars = []
        groupedInput.allWords = []
        groupedInput.allSentences = []

        for (const [deckName,groupedItems] of Object.entries(groupedInput)) {
            const sentences = groupedItems['sentences']
            const words = groupedItems['words']
            const chars = groupedItems['chars']
            groupedInput[deckName].extractedChars = [] //TODO: cehck if groupedItems.extractedChars would suffice
            groupedInput[deckName].extractedWords = []
            const extractedChars = groupedInput[deckName].extractedChars
            const extractedWords = groupedInput[deckName].extractedWords

            if (dissect) {
                for (const [i,sentence] of sentences.entries()) {
                    for (let [j,word] of sentence.split(' ').entries()) {
                        word = word.replace(/[，？！。；,\?\!\.\;]/g,'')
                        if (!words.includes(word) && !extractedWords.includes(word))
                            extractedWords.push(word)
                    }
                }

                for (const [i,word] of words.concat(ts.extractedWords).entries()) {
                    for (const [j,char] of word.split('').entries()) {
                        if (!chars.includes(char) && !extractedChars.includes(char))
                            extractedChars.push(char)
                    }
                }

                for (const [i,char] of chars.concat(extractedChars).entries()) {
                    await this.extractCmpsRecursively(char,chars,extractedChars)
                }
            }
            
            groupedInput[deckName].allChars = chars.concat(extractedChars)
            groupedInput.allChars = groupedInput.allChars.concat(groupedInput[deckName].allChars)

            groupedInput[deckName].allWords = words.concat(extractedWords)
            groupedInput.allWords = groupedInput.allWords.concat(groupedInput[deckName].allWords)

            groupedInput[deckName].allSentences = sentences.concat(extractedSentences)
            groupedInput.allSentences = groupedInput.allSentences.concat(groupedInput[deckName].allSentences)
        }

        return groupedInput
    }
}

module.exports = HanziDissector
