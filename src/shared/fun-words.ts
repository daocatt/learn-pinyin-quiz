import type { WordEntry } from './words.ts'

/**
 * Curated list of fun, tongue-twisting, and easily confused words and idioms.
 * Every syllable key references existing audio files in public/audio/
 */
export const FUN_WORDS: Record<string, WordEntry> = {
  // 拗口/绕口令/易混淆拼音组词
  si1: { word: "四十四只石狮子", syllables: ["si4", "shi2", "si4", "zhi1", "shi2", "shi1", "zi5"] },
  shi2: { word: "十四是十四", syllables: ["shi2", "si4", "shi4", "shi2", "si4"] },
  chi1: { word: "吃葡萄不吐葡萄皮", syllables: ["chi1", "pu2", "tao5", "bu4", "tu3", "pu2", "tao5", "pi2"] },
  lv4: { word: "红鲤鱼与绿鲤鱼", syllables: ["hong2", "li3", "yu2", "yu3", "lv4", "li3", "yu2"] },
  bian3: { word: "扁担长板凳宽", syllables: ["bian3", "dan1", "chang2", "ban3", "deng4", "kuan1"] },
  liu4: { word: "刘奶奶找牛奶奶", syllables: ["liu2", "nai3", "nai5", "zhao3", "niu2", "nai3", "nai5"] },
  niu2: { word: "牛奶奶喝榴莲牛奶", syllables: ["niu2", "nai3", "nai5", "he1", "liu2", "lian2", "niu2", "nai3"] },

  // 趣味/易读错生僻常用字词
  tang1: { word: "大快朵颐", syllables: ["da4", "kuai4", "duo3", "yi2"] },
  xu1: { word: "酗酒成性", syllables: ["xu4", "jiu3", "cheng2", "xing4"] },
  gang1: { word: "提纲挈领", syllables: ["ti2", "gang1", "qie4", "ling3"] },
  qiong2: { word: "图穷匕见", syllables: ["tu2", "qiong2", "bi3", "xian4"] },
  gan1: { word: "尴尬万分", syllables: ["gan1", "ga4", "wan4", "fen1"] },
  tao1: { word: "饕餮盛宴", syllables: ["tao1", "tie4", "sheng4", "yan4"] },
  beng4: { word: "蚌埠住了", syllables: ["beng4", "bu4", "zhu4", "le5"] },
  hao1: { word: "薅羊毛", syllables: ["hao1", "yang2", "mao2"] },
  meng3: { word: "一脸懵逼", syllables: ["yi4", "lian3", "meng3", "bi1"] },
  jiao3: { word: "矫揉造作", syllables: ["jiao3", "rou2", "zao4", "zuo4"] },
  pi1: { word: "披荆斩棘", syllables: ["pi1", "jing1", "zhan3", "ji2"] },
  ze2: { word: "相形见绌", syllables: ["xiang1", "xing2", "jian4", "chut4"] },
  xue4: { word: "噱头十足", syllables: ["xue2", "tou5", "shi2", "zu2"] },
  cuo4: { word: "不知所措", syllables: ["bu4", "zhi1", "suo3", "cuo4"] },
  chuo4: { word: "绰绰有余", syllables: ["chuo4", "chuo4", "you3", "yu2"] },
  gu1: { word: "呱呱坠地", syllables: ["gu1", "gu1", "zhui4", "di4"] },
  chen4: { word: "称心如意", syllables: ["chen4", "xin1", "ru2", "yi4"] },
  se4: { word: "晦涩难懂", syllables: ["hui4", "se4", "nan2", "dong3"] },
  fu2: { word: "随声附和", syllables: ["sui2", "sheng1", "fu4", "he4"] },
  mai2: { word: "埋怨不已", syllables: ["man2", "yuan4", "bu4", "yi3"] },
  cha4: { word: "差强人意", syllables: ["cha1", "qiang2", "ren2", "yi4"] },
  bo1: { word: "萝卜白菜", syllables: ["luo2", "bo5", "bai2", "cai4"] },
}
