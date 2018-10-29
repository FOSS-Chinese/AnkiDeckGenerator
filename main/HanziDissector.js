'use strict'

class HanziDissector {
    constructor(mmah,s2t,t2s) {
        this.mmah = mmah
        this.s2t = s2t
        this.t2s = t2s
    }

    getTextType(text) {
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

    groupInput(input) {
        const groupedInput = {}
        for (const [deckName,deckItems] of Object.entries(input)) {
            groupedInput[deckName] = {chars:[],words:[],sentences:[]}
            for (const [i,deckItem] of deckItems.entries()) {
                const type = this.getTextType(deckItem.simplified)
                const prop = `${type}s`
                groupedInput[deckName][prop].push(deckItem)
            }
        }
        return groupedInput
    }

    async extractCmpsRecursively(char,chars,extractedChars) {
        const charData = (await this.mmah.getCharData(char.simplified))[char.simplified]
        if (charData.decomposition === '？')
            return
        const cmps = charData.decomposition.replace(/[\u2FF0-\u2FFB？]+/g,'').split('')
        for (const [i,cmp] of cmps.entries()) {
            const alreadyInChars = chars.filter(c => (c.simplified === cmp)).length>0
            const alreadyInExtractedChars = extractedChars.filter(c => (c.simplified === cmp)).length>0
            if (!alreadyInChars && !alreadyInExtractedChars) {
                extractedChars.push({simplified:cmp})
                await this.extractCmpsRecursively({simplified:cmp},chars,extractedChars)
            }
        }
    }

    async dissect(input,dissect=true,progressCb) {
        const groupedInput = this.groupInput(input)
        groupedInput.allChars = []
        groupedInput.allWords = []
        groupedInput.allSentences = []
        const deckCount = Object.keys(groupedInput).filter(k=>!['allChars','allWords','allSentences'].includes(k)).length
        let deckIndex = 0
        for (const [deckName,groupedItems] of Object.entries(groupedInput)) {
            if (['allChars','allWords','allSentences'].includes(deckName))
                continue
            const sentences = groupedItems['sentences']
            const words = groupedItems['words']
            const chars = groupedItems['chars']
            groupedInput[deckName].extractedChars = [] //TODO: cehck if groupedItems.extractedChars would suffice
            groupedInput[deckName].extractedWords = []
            const extractedChars = groupedInput[deckName].extractedChars
            const extractedWords = groupedInput[deckName].extractedWords

            if (dissect) {
                //console.log(sentences)
                /*if (!sentences) {
                    console.log(deckName)
                    console.log(groupedItems)
                }*/
                for (const [i,sentence] of sentences.entries()) {
                    for (let [j,word] of sentence.simplified.split(' ').entries()) {
                        word = word.replace(/[，？！。；,\?\!\.\;]/g,'')
                        if (!words.includes(word) && !extractedWords.includes(word))
                            extractedWords.push({simplified: word, traditional: await this.s2t.convertPromise(word)})
                    }
                    /*for (let [j,word] of sentence.traditional.split(' ').entries()) {
                        word = word.replace(/[，？！。；,\?\!\.\;]/g,'')
                        if (!words.includes(word) && !extractedWords.includes(word))
                            extractedWords.push(word)
                    }*/
                }

                for (const [i,word] of words.concat(extractedWords).entries()) {
                    for (const [j,char] of word.simplified.split('').entries()) {
                        if (!chars.includes(char) && !extractedChars.includes(char))
                            extractedChars.push({simplified:char})
                    }
                    /*for (const [j,char] of word.traditional.split('').entries()) {
                        if (!chars.includes(char) && !extractedChars.includes(char))
                            extractedChars.push(char)
                    }*/
                }

                for (const [i,char] of chars.concat(extractedChars).entries()) {
                    await this.extractCmpsRecursively(char,chars,extractedChars)
                    //await this.extractCmpsRecursively(char.traditional,chars,extractedChars)
                }
            }

            groupedInput[deckName].allChars = chars.concat(extractedChars)
            groupedInput.allChars = groupedInput.allChars.concat(groupedInput[deckName].allChars)

            groupedInput[deckName].allWords = words.concat(extractedWords)
            groupedInput.allWords = groupedInput.allWords.concat(groupedInput[deckName].allWords)

            groupedInput[deckName].allSentences = sentences
            groupedInput.allSentences = groupedInput.allSentences.concat(groupedInput[deckName].allSentences)

            progressCb(Math.round((++deckIndex/deckCount)*100))
        }

        return groupedInput
    }
}

module.exports = HanziDissector
