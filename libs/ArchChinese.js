'use strict'

const rp = require('request-promise')
const pinyinUtils = require('pinyin-utils')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class ArchChinese {
    constructor(conf={}) {
        this.baseUrl = "http://www.archchinese.com"
        this.wordSearchRoute = "getSimpSentenceWithPinyin6"
        this.sentenceSearchRoute = "getExampleAudio3"
        this.sleepAfterSearch = conf.sleepAfterSearch || 0
    }
    async rawSearch(query, searchFor='words', limit=25, offset=0) {
        const res = await rp({
            method: 'POST',
            uri: `${this.baseUrl}/${searchFor==='words' ? this.wordSearchRoute : this.sentenceSearchRoute}`,
            formData: {
                limit:limit.toString(),
                offset:offset.toString(),
                unicode: query.replace(/\s/g,'').split('').map(l=>l.charCodeAt().toString(16).toUpperCase()).join(', ')
            },
            headers: {
                "content-type":"application/x-www-form-urlencoded",
                "user-agent":"Mozilla/5.0 (X11; Linux x86_64; rv:60.0) Gecko/20100101 Firefox/60.0",
                "accept-encoding":"",
                "cache-control":"no-cache",
                "accept":"*/*",
                "host":"www.archchinese.com",
                "connection":"keep-alive"
            },
            resolveWithFullResponse: true
        })
        //TODO: debug why ArchChinese returns an empty body when requesting sentences
        /*console.log(res)
        console.log(res.headers)
        console.log(res.body)
        console.log(res.statusCode)
        console.log(`${this.baseUrl}/${searchFor==='words' ? this.wordSearchRoute : this.sentenceSearchRoute}`)
        console.log({
            limit:limit.toString(),
            offset:offset.toString(),
            unicode: query.replace(/[，？！。；,\?\!\.\;\s]/g,'').split('').map(l=>l.charCodeAt().toString(16).toUpperCase()).join(', ')
        })*/
        await sleep(this.sleepAfterSearch)
        // 你好@你好@ni3 hao3@hello,hi,how are you?@9@短@N@[]@1276&你好吗@你好嗎@ni3 hao3 ma5@How are you?, How are you doing?@9@短@N@[]@6&
        return res.body
    }

    /**
     *  query: (string) hanzi word
     *  limit: (integer) max number of results to get
     *  offset: (integer) start at result with this index
     *
     *  returns array of results. A result is an object with a few properties.
     *  [
     *      {
     *          simplified: (string) hanzi word simplified
     *          traditional: (string) hanzi word traditional
     *          pinyin: (string) pinyin
     *          english: (array of strings) english definitions
     *      },
     *      ...
     *   ]
     */
    async searchWords(query, limit=25, offset=0) {
        const responseBody = await this.rawSearch(query, 'words', limit, offset)
        if (!responseBody)
            return []
        const rawResults = responseBody.slice(0,-1).split('&')

        const finalResults = []
        for (const [i,rawResult] of rawResults.entries()) {
            const result = rawResult.split('@')
            finalResults[i] = {
                simplified: result[0],
                traditional: result[1],
                pinyin: result[2].split(' ').map(pinyin=>pinyinUtils.numberToMark(pinyin)).join(' '),
                english: result[3].includes(';') ? result[3].split(';') : result[3].split(','),
                //unknownInt1: result[4],
                //wordType: result[5], // sometimes missing
                //unknownYesNoLetter: result[6],
                //unknownArray: result[7],
                //unknownInt2: result[8]
            }
        }
        return finalResults
    }

    /**
     *  query: (string) hanzi sentence
     *  limit: (integer) max number of results to get
     *  offset: (integer) start at result with this index
     *
     *  returns array of results. A result is an object with a few properties.
     *  [
     *      {
     *          simplified: (string) hanzi sentence simplified
     *          traditional: (string) hanzi sentence traditional (don't rely on this being traditional, unless it's a single char)
     *          pinyin: (string) pinyin
     *          english: (array of strings) english definitions
     *          words: [
     *              simplified: (string) hanzi word simplified
     *              traditional: (string) hanzi word traditional (don't rely on this being traditional, unless it's a single char)
     *              pinyin: (array of strings) pinyin (more than 1 entry only for single char words)
     *              english: (array of strings) english definitions
     *          ],
     *      },
     *      ...
     *   ]
     */
    async searchSentences(query, limit=25, offset=0) {
        const responseBody = await this.rawSearch(query, 'sentences', limit, offset)
        if (!responseBody)
            return []
        const rawResults = responseBody.slice(0,-1).split('~')

        const finalResults = []
        for (const [i,rawResult] of rawResults.entries()) {
            const result = rawResult.split('^')
            const singleChars = result[6].split('&').map(rawItem=>{
                const item = rawItem.split('@')
                return {
                    simplified: item[0],
                    traditional: item[1],
                    pinyin: item[2].split(/,\s|,/).map(p=>p.split(' ').map(pinyin=>pinyinUtils.numberToMark(pinyin)).join(' ')),
                    english: item[3].includes(';') ? item[3].split(';') : item[3].split(',')
                }
            })
            const words = []
            for (const [j,item] of result[1].split('&').entries()) {
                const itemSplit = item.split('@')
                if (itemSplit.length > 1) {
                    words[j] = {
                        simplified: itemSplit[0],
                        traditional: itemSplit[0],
                        pinyin: [pinyinUtils.numberToMark(itemSplit[1])],
                        english: itemSplit[2].includes(';') ? itemSplit[2].split(';') : itemSplit[2].split(',')
                    }
                } else {
                    words[j] = singleChars.filter(char=>char.simplified===itemSplit[0])[0]
                }
            }
            finalResults[i] = {
                simplified: result[0],
                traditional: result[7],
                pinyin: pinyinUtils.numberToMark(result[2]),
                //unknownLetter1: result[3],
                //unicodeSimplified: result[4].split('|'),
                english: result[5].includes(';') ? result[5].split(';') : result[5].split(','),
                words: words,
                //unknownInt1: result[7],
                //unknownInt2: result[8]
            }
        }
        return finalResults
    }
}

module.exports = ArchChinese
