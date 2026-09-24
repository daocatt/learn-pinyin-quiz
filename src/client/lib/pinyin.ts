/**
 * Pinyin tone-mark placement. The audio paths live in `shared/audio.ts`.
 *
 * Port of `$.format_pinyin` from the chart's jquery.pinyin.js: find the vowel
 * cluster at the end of the syllable and put the tone mark on it, preferring
 * `a`, then `e`, then `o` in `ou`, otherwise the last vowel.
 */

type ToneTable = Record<string, string>

const TONES: Record<string, ToneTable> = {
  a: { '1': 'ā', '2': 'á', '3': 'ǎ', '4': 'à', '5': 'a' },
  o: { '1': 'ō', '2': 'ó', '3': 'ǒ', '4': 'ò', '5': 'o' },
  e: { '1': 'ē', '2': 'é', '3': 'ě', '4': 'è', '5': 'e' },
  i: { '1': 'ī', '2': 'í', '3': 'ǐ', '4': 'ì', '5': 'i' },
  u: { '1': 'ū', '2': 'ú', '3': 'ǔ', '4': 'ù', '5': 'u' },
  ü: { '1': 'ǖ', '2': 'ǘ', '3': 'ǚ', '4': 'ǜ', '5': 'ü' },
  A: { '1': 'Ā', '2': 'Á', '3': 'Ǎ', '4': 'À', '5': 'A' },
  O: { '1': 'Ō', '2': 'Ó', '3': 'Ǒ', '4': 'Ò', '5': 'O' },
  E: { '1': 'Ē', '2': 'É', '3': 'Ě', '4': 'È', '5': 'E' },
  I: { '1': 'Ī', '2': 'Í', '3': 'Ǐ', '4': 'Ì', '5': 'I' },
  U: { '1': 'Ū', '2': 'Ú', '3': 'Ǔ', '4': 'Ù', '5': 'U' },
  Ü: { '1': 'Ǖ', '2': 'Ǘ', '3': 'Ǚ', '4': 'Ǜ', '5': 'Ü' },
}

const VOWELS = 'aoeiuü'

function isVowel(char: string): boolean {
  return VOWELS.includes(char.toLowerCase())
}

/** Returns `syllable` with the tone mark applied, e.g. `formatPinyin('ba', 1) === 'bā'`. */
export function formatPinyin(syllable: string, tone: number): string {
  let end = -1
  let start = -1

  for (let pos = syllable.length; pos >= 1; pos--) {
    const char = syllable[pos - 1]
    if (end === -1 && isVowel(char)) end = pos
    if (end !== -1 && !isVowel(char)) {
      start = pos
      break
    }
    if (end !== -1 && pos === 1 && isVowel(char)) {
      start = 0
      break
    }
  }

  if (start === -1 || end === -1) return syllable

  const vowels = syllable.slice(start, end)
  const lower = vowels.toLowerCase()
  let marked: string

  if (lower.includes('a')) {
    marked = vowels.replace('a', TONES.a[tone]).replace('A', TONES.A[tone])
  } else if (lower.includes('e')) {
    marked = vowels.replace('e', TONES.e[tone]).replace('E', TONES.E[tone])
  } else if (lower === 'ou') {
    marked = vowels.replace('o', TONES.o[tone]).replace('O', TONES.O[tone])
  } else {
    const last = vowels[vowels.length - 1]
    marked = last ? vowels.slice(0, -1) + (TONES[last]?.[tone] ?? last) : vowels
  }

  return syllable.slice(0, start) + marked + syllable.slice(end)
}
