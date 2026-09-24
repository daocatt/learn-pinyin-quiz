// Pinyin chart grid: 23 initial rows x 35 finals, with the bold exception cells.
// Do not edit by hand.

export type ChartCell = string | { text: string; bold?: boolean } | null

/** Vowel-group header spans (A / O / E / I / U / Ü). */
export const GROUP_HEADERS = [
  { label: "A", span: 5 },
  { label: "O", span: 3 },
  { label: "E", span: 5 },
  { label: "I", span: 10 },
  { label: "U", span: 8 },
  { label: "Ü", span: 4 },
] as const

/** 35 finals, in column order. */
export const FINALS: string[] = [
  "a", "ai", "ao", "an", "ang", "o", "ong", "ou", "e", "ei", "en", "eng", "er", "i", "ia", "iao", "ie", "iu", "ian", "iang", "in", "ing", "iong", "u", "ua", "uo", "ui", "uai", "uan", "un", "uang", "ü", "üe", "üan", "ün",
]

/** 1-based column indexes that end a vowel group (used for the thicker divider). */
export const GROUP_END_COLUMNS = [1, 6, 9, 14, 24, 32] as const

export type ChartRow = { initial: string; cells: ChartCell[] }

/** 23 initial rows (b … y). */
export const INITIAL_ROWS: ChartRow[] = [
  { initial: "b", cells: ["ba", "bai", "bao", "ban", "bang", "bo", null, null, null, "bei", "ben", "beng", null, "bi", null, "biao", "bie", null, "bian", null, "bin", "bing", null, "bu", null, null, null, null, null, null, null, null, null, null, null] },
  { initial: "p", cells: ["pa", "pai", "pao", "pan", "pang", "po", null, "pou", null, "pei", "pen", "peng", null, "pi", null, "piao", "pie", null, "pian", null, "pin", "ping", null, "pu", null, null, null, null, null, null, null, null, null, null, null] },
  { initial: "m", cells: ["ma", "mai", "mao", "man", "mang", "mo", null, "mou", null, "mei", "men", "meng", null, "mi", null, "miao", "mie", "miu", "mian", null, "min", "ming", null, "mu", null, null, null, null, null, null, null, null, null, null, null] },
  { initial: "f", cells: ["fa", null, null, "fan", "fang", "fo", null, "fou", null, "fei", "fen", "feng", null, null, null, null, null, null, null, null, null, null, null, "fu", null, null, null, null, null, null, null, null, null, null, null] },
  { initial: "d", cells: ["da", "dai", "dao", "dan", "dang", null, "dong", "dou", "de", "dei", null, "deng", null, "di", null, "diao", "die", "diu", "dian", null, null, "ding", null, "du", null, "duo", "dui", null, "duan", "dun", null, null, null, null, null] },
  { initial: "t", cells: ["ta", "tai", "tao", "tan", "tang", null, "tong", "tou", "te", null, null, "teng", null, "ti", null, "tiao", "tie", null, "tian", null, null, "ting", null, "tu", null, "tuo", "tui", null, "tuan", "tun", null, null, null, null, null] },
  { initial: "n", cells: ["na", "nai", "nao", "nan", "nang", null, "nong", "nou", "ne", "nei", "nen", "neng", null, "ni", null, "niao", "nie", "niu", "nian", "niang", "nin", "ning", null, "nu", null, "nuo", null, null, "nuan", null, null, "nü", "nüe", null, null] },
  { initial: "l", cells: ["la", "lai", "lao", "lan", "lang", null, "long", "lou", "le", "lei", null, "leng", null, "li", "lia", "liao", "lie", "liu", "lian", "liang", "lin", "ling", null, "lu", null, "luo", null, null, "luan", "lun", null, "lü", "lüe", null, null] },
  { initial: "z", cells: ["za", "zai", "zao", "zan", "zang", null, "zong", "zou", "ze", "zei", "zen", "zeng", null, { text: "zi", bold: true }, null, null, null, null, null, null, null, null, null, "zu", null, "zuo", "zui", null, "zuan", "zun", null, null, null, null, null] },
  { initial: "c", cells: ["ca", "cai", "cao", "can", "cang", null, "cong", "cou", "ce", null, "cen", "ceng", null, { text: "ci", bold: true }, null, null, null, null, null, null, null, null, null, "cu", null, "cuo", "cui", null, "cuan", "cun", null, null, null, null, null] },
  { initial: "s", cells: ["sa", "sai", "sao", "san", "sang", null, "song", "sou", "se", null, "sen", "seng", null, { text: "si", bold: true }, null, null, null, null, null, null, null, null, null, "su", null, "suo", "sui", null, "suan", "sun", null, null, null, null, null] },
  { initial: "zh", cells: ["zha", "zhai", "zhao", "zhan", "zhang", null, "zhong", "zhou", "zhe", "zhei", "zhen", "zheng", null, { text: "zhi", bold: true }, null, null, null, null, null, null, null, null, null, "zhu", "zhua", "zhuo", "zhui", "zhuai", "zhuan", "zhun", "zhuang", null, null, null, null] },
  { initial: "ch", cells: ["cha", "chai", "chao", "chan", "chang", null, "chong", "chou", "che", null, "chen", "cheng", null, { text: "chi", bold: true }, null, null, null, null, null, null, null, null, null, "chu", "chua", "chuo", "chui", "chuai", "chuan", "chun", "chuang", null, null, null, null] },
  { initial: "sh", cells: ["sha", "shai", "shao", "shan", "shang", null, null, "shou", "she", "shei", "shen", "sheng", null, { text: "shi", bold: true }, null, null, null, null, null, null, null, null, null, "shu", "shua", "shuo", "shui", "shuai", "shuan", "shun", "shuang", null, null, null, null] },
  { initial: "r", cells: [null, null, "rao", "ran", "rang", null, "rong", "rou", "re", null, "ren", "reng", null, { text: "ri", bold: true }, null, null, null, null, null, null, null, null, null, "ru", "rua", "ruo", "rui", null, "ruan", "run", null, null, null, null, null] },
  { initial: "g", cells: ["ga", "gai", "gao", "gan", "gang", null, "gong", "gou", "ge", "gei", "gen", "geng", null, null, null, null, null, null, null, null, null, null, null, "gu", "gua", "guo", "gui", "guai", "guan", "gun", "guang", null, null, null, null] },
  { initial: "k", cells: ["ka", "kai", "kao", "kan", "kang", null, "kong", "kou", "ke", "kei", "ken", "keng", null, null, null, null, null, null, null, null, null, null, null, "ku", "kua", "kuo", "kui", "kuai", "kuan", "kun", "kuang", null, null, null, null] },
  { initial: "h", cells: ["ha", "hai", "hao", "han", "hang", null, "hong", "hou", "he", "hei", "hen", "heng", null, null, null, null, null, null, null, null, null, null, null, "hu", "hua", "huo", "hui", "huai", "huan", "hun", "huang", null, null, null, null] },
  { initial: "j", cells: [null, null, null, null, null, null, null, null, null, null, null, null, null, "ji", "jia", "jiao", "jie", "jiu", "jian", "jiang", "jin", "jing", "jiong", null, null, null, null, null, null, null, null, { text: "ju", bold: true }, "jue", { text: "juan", bold: true }, { text: "jun", bold: true }] },
  { initial: "q", cells: [null, null, null, null, null, null, null, null, null, null, null, null, null, "qi", "qia", "qiao", "qie", "qiu", "qian", "qiang", "qin", "qing", "qiong", null, null, null, null, null, null, null, null, { text: "qu", bold: true }, "que", { text: "quan", bold: true }, { text: "qun", bold: true }] },
  { initial: "x", cells: [null, null, null, null, null, null, null, null, null, null, null, null, null, "xi", "xia", "xiao", "xie", "xiu", "xian", "xiang", "xin", "xing", "xiong", null, null, null, null, null, null, null, null, { text: "xu", bold: true }, "xue", { text: "xuan", bold: true }, { text: "xun", bold: true }] },
  { initial: "w", cells: ["wa", "wai", null, "wan", "wang", "wo", null, null, null, "wei", { text: "wen", bold: true }, "weng", null, null, null, null, null, null, null, null, null, null, null, "wu", null, null, null, null, null, null, null, null, null, null, null] },
  { initial: "y", cells: ["ya", null, "yao", { text: "yan", bold: true }, "yang", null, "yong", "you", { text: "ye", bold: true }, null, null, null, null, "yi", null, null, null, null, null, null, "yin", "ying", null, null, null, null, null, null, null, null, null, { text: "yu", bold: true }, "yue", { text: "yuan", bold: true }, { text: "yun", bold: true }] },
]

/** Bottom summary row (A/O/E finals only). */
export const FOOTER_ROW: ChartCell[] = [
  "a", "ai", "ao", "an", "ang", "o", null, "ou", "e", "ei", "en", "eng", "er", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
]
