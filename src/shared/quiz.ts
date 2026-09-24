import { audioUrl } from './audio.ts'
import { HANZI } from './hanzi.ts'
import { WORDS } from './words.ts'

/**
 * The quiz asks "which tone is this?" about a syllable, so an item is a
 * syllable+tone that actually exists in Mandarin — that is, one the chart popup
 * can show an example character for. Restricting the pool to HANZI also keeps
 * the question honest: the recordings ship all four tones for every syllable,
 * including readings Mandarin does not have (bán), and those must never be
 * asked about.
 */
export type QuizItem = {
  /** Syllable+tone key, e.g. "shang1". */
  key: string
  /** Toneless syllable, e.g. "shang" — the form the card shows. */
  syllable: string
  /** 1–4. Never sent to the client; the client picks a tone and the server grades it. */
  tone: number
  /** Example 组词, absent when nothing suitable was found. */
  word?: string
  /** Syllable+tone keys of `word`, in order. */
  wordKeys?: string[]
}

const KEY = /^([a-z\u00fc]+)([1-4])$/

/** A question as the browser sees it — note there is no tone field. */
export type QuizQuestion = {
  id: number
  /** Toneless syllable, e.g. "shang". */
  syllable: string
  /** Example 组词, absent when the item has none. */
  word?: string
  /** True when this item was answered wrongly in an earlier round. */
  isRetry: boolean
  /**
   * The recordings to play, in order: the standalone syllable twice, then the
   * word once. The URLs name the tone, so this is not a secrecy boundary — the
   * recording *is* the question. The tone is only kept out of a tidy `tone`
   * field so that nothing in the UI can render the answer by accident.
   */
  audio: { target: string; word: string[] }
}

export type QuizRound = {
  roundId: number
  total: number
  questions: QuizQuestion[]
}

/** Result of grading one answer. */
export type QuizAnswer = {
  correct: boolean
  /** The tone that was actually played. */
  answer: number
  /** Points for the whole round. */
  score: number
  /** True when the item had been missed in an earlier round. */
  isRetry: boolean
}

/** `"shang1"` -> `{ syllable: "shang", tone: 1 }`; null if it is not a key. */
export function parseKey(key: string): { syllable: string; tone: number } | null {
  const match = KEY.exec(key)
  return match ? { syllable: match[1], tone: Number(match[2]) } : null
}

/** Playback URL for a syllable+tone key, e.g. `"shang1"` -> `/audio/shang1.mp3`. */
export function keyAudioUrl(key: string): string | null {
  const parsed = parseKey(key)
  return parsed ? audioUrl(parsed.syllable, parsed.tone) : null
}

let cached: QuizItem[] | undefined

/** Every item the quiz may ask about, in a stable order. */
export function quizPool(): QuizItem[] {
  cached ??= Object.keys(HANZI).flatMap((key) => {
    const parsed = parseKey(key)
    if (!parsed) return []
    const entry = WORDS[key]
    return [
      {
        key,
        ...parsed,
        ...(entry ? { word: entry.word, wordKeys: entry.syllables } : {}),
      },
    ]
  })
  return cached
}
