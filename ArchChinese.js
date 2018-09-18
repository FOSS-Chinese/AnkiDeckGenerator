'use strict'

const cheerio = require('cheerio')
const rp = require('request-promise')
const download = require('download')
const fs = require('fs-extra')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class ArchChinese {
    constructior() {

    }
}

/*
深圳 // result 1 hanzi
深圳 // result 1 hanzi
shen1 zhen4 // result 1 pinyin
Shenzhen city in Guangdong province. // result 1 english translation
9 // result 1 amount of words/sentences containing the query
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

N
1\n
&
*/

/*
严重急性呼吸系统综合症@嚴重急性呼吸系統綜合症@yan2 zhong4 ji2 xing4 hu1 xi1 xi4 tong3 zong1 he2 zheng4@severe acute respiratory syndrome (SARS)@9@ @N@ @1&二级头呼吸器@二級頭呼吸器@er4 ji2 tou2 hu1 xi1 qi4@(diving) regulator; demand valve@9@ @N@ @1&呼吸器@呼吸器@hu1 xi1 qi4@ventilator (artificial breathing apparatus used in hospitals)@9@ @N@ @1&呼吸管@呼吸管@hu1 xi1 guan3@snorkel@9@ @N@ @1&呼吸调节器@呼吸調節器@hu1 xi1 tiao2 jie2 qi4@regulator (diving)@9@ @N@ @1&备用二级头呼吸器@備用二級頭呼吸器@bei4 yong4 er4 ji2 tou2 hu1 xi1 qi4@backup regulator; octopus (diving)@9@ @N@ @1&密闭式循环再呼吸水肺系统@密閉式循環再呼吸水肺系統@mi4 bi4 shi4 xun2 huan2 zai4 hu1 xi1 shui3 fei4 xi4 tong3@closed-circuit rebreather scuba (diving)@9@ @N@ @1&睡眠呼吸暂停@睡眠呼吸暫停@shui4 mian2 hu1 xi1 zan4 ting2@central sleep apnea (CSA)@9@ @N@ @1&
*/

module.exports = Forvo
