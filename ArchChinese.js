'use strict'

//const cheerio = require('cheerio')
const rp = require('request-promise')
//const download = require('download')
//const fs = require('fs-extra')
const pinyinUtils = require('pinyin-utils')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class ArchChinese {
    constructior() {
        this.baseUrl = "http://www.archchinese.com"
        this.wordSearchRoute = "getSimpSentenceWithPinyin6"
        this.sentenceSearchRoute = "getExampleAudio3"
    }
    async rawSearch(query, searchFor='words', limit=25, offset=0) {
        const responseBody = await rp({
            method: 'POST',
            uri: `${this.baseUrl}/${searchFor==='words' ? this.wordSearchRoute : this.sentenceSearchRoute}`,
            formData: {
                limit,
                offset,
                unicode: query.split('').map(l=>l.charCodeAt().toString(16).toUpperCase()).join(', ')
            }
        })
        // 你好@你好@ni3 hao3@hello,hi,how are you?@9@短@N@[]@1276&你好吗@你好嗎@ni3 hao3 ma5@How are you?, How are you doing?@9@短@N@[]@6&
        return responseBody
    }

    /**
     *  query: (string) hanzi word
     *  limit: (integer) max number of results to get
     *  offset: (integer) start at result with this index
     *
     *  returns array of results. A result is an object with a few properties.
     *  [
     *      {
     *          simplified: (string) hanzi word simplified,
     *          traditional: (string) hanzi word traditional,
     *          pinyin: (string) pinyin
     *          english: (array of strings) english definitions,
     *          wordType: (string) type of word (e.g. 名)
     *      },
     *      ...
     *   ]
     */
    async searchWords(query, limit=25, offset=0) {pinyinUtils
        const responseBody = this.rawSearch(query, 'words', limit, offset)
        const list = responseBody.slice(0,-1).split(/[@&]+/)
        const chunkSize = 9
        const results = new Array(Math.ceil(list.length / chunkSize)).fill().map((_,i) => list.slice(i*chunkSize,i*chunkSize+chunkSize))
        const finalResults = []
        for (const [i,result] of results.entries()) {
            finalResults[i] = {
                simplified: result[0],
                traditional: result[1],
                pinyin: pinyinUtils.numberToMark(result[3]),
                english: result[4].split(','),
                //actualChunkSize: result[5],
                wordType: result[6],
                //unknownInt1: result[7],
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
        const responseBody = this.rawSearch(query, 'sentences', limit, offset)
        const results = responseBody.slice(0,-1).split('~')

        const finalResults = []
        for (const [i,result] of results.entries()) {
            const singleChars = result[6].map(item=>{
                return {
                    simplified: item[0],
                    traditional: item[1],
                    pinyin: item[2].split(/,\s|,/).map(p=>pinyinUtils.numberToMark(p)),
                    english: item[3].split(',')
                }
            })
            const words = []
            for (const [j,item] of result[1].entries()) {
                const itemSplit = item.split('@')
                if (itemSplit.length > 1) {
                    words[j] = {
                        simplified: itemSplit[0],
                        traditional: itemSplit[0],
                        pinyin: [pinyinUtils.numberToMark(itemSplit[1])],
                        english: itemSplit[2].split(',')
                    }
                } else {
                    words[j] = singleChars.filter(char=>char===itemSplit[0])[0]
                }
            }
            finalResults[i] = {
                simplified: result[0],
                traditional: result[7],
                pinyin: pinyinUtils.numberToMark(result[2]),
                //unknownLetter1: result[3],
                //unicodeSimplified: result[4].split('|'),
                english: result[5],
                words: words,
                //unknownInt1: result[7],
                //unknownInt2: result[8]
            }
        }
        const chunkSize = 9
        results = new Array(Math.ceil(list.length / chunkSize)).fill().map((_,i) => list.slice(i*chunkSize,i*chunkSize+chunkSize))
        return results
    }
}

/*
深圳 // result 1 hanzi (simplified)
深圳 // result 1 hanzi (traditional)
shen1 zhen4 // result 1 pinyin
Shenzhen city in Guangdong province. // result 1 english translation
9 // result 1 amount of words/sentences containing the querychunk
名 // result 1 word type (noun etc)
N // result 1
[] // result 1
8\n //
& // result separator
深圳交易所
深圳交易所
shen1 zhen4 jiao1 yi4 suo3
Shenzhen Stock Exchange
9
名
N
[]
1&深圳市
深圳市
shen1 zhen4 shi4
Shenzhen subprovincial city in Guangdong, special economic zone close to Hong Kong
9
名
N
[]
1&
*/
/*
深圳证券交易所
深圳證券交易所
shen1 zhen4 zheng4 quan4 jiao1 yi4 suo3
Shenzhen Stock Exchange, abbr. to 深交所
9

NpinyinUtils.numberToMark(
1\n
&
*/

/*
严重急性呼吸系统综合症@嚴重急性呼吸系統綜合症@yan2 zhong4 ji2 xing4 hu1 xi1 xi4 tong3 zong1 he2 zheng4@severe acute respiratory syndrome (SARS)@9@ @N@ @1&二级头呼吸器@二級頭呼吸器@er4 ji2 tou2 hu1 xi1 qi4@(diving) regulator; demand valve@9@ @N@ @1&呼吸器@呼吸器@hu1 xi1 qi4@ventilator (artificial breathing apparatus used in hospitals)@9@ @N@ @1&呼吸管@呼吸管@hu1 xi1 guan3@snorkel@9@ @N@ @1&呼吸调节器@呼吸調節器@hu1 xi1 tiao2 jie2 qi4@regulator (diving)@9@ @N@ @1&备用二级头呼吸器@備用二級頭呼吸器@bei4 yong4 er4 ji2 tou2 hu1 xi1 qi4@backup regulator; octopus (diving)@9@ @N@ @1&密闭式循环再呼吸水肺系统@密閉式循環再呼吸水肺系統@mi4 bi4 shi4 xun2 huan2 zai4 hu1 xi1 shui3 fei4 xi4 tong3@closed-circuit rebreather scuba (diving)@9@ @N@ @1&睡眠呼吸暂停@睡眠呼吸暫停@shui4 mian2 hu1 xi1 zan4 ting2@central sleep apnea (CSA)@9@ @N@ @1&
*/

module.exports = Forvo
