import { useCallback, useRef } from 'react'
import type { QuizQuestion } from '../../shared/quiz'

/**
 * Quiz playback.
 *
 * The recordings are per-syllable chart clips, each padded with its own
 * lead-in and tail of silence. Chaining them as-is puts roughly half a second
 * of dead air between the two halves of a word — 告诉 came out as "gào … sù",
 * two separate words. So each clip's padding is measured once and skipped, and
 * the whole question is then scheduled on the Web Audio clock, which makes the
 * gaps exactly what this file says they are.
 *
 * Measured across the library the padding varies (lead 100–280ms, tail
 * 80–300ms), so it cannot be a constant: a fixed 200ms tail trim would clip the
 * final consonant of the ~45% of clips that have less than that.
 */

/** Beat between the two standalone readings, and before the word. */
const READING_GAP = 0.48
/**
 * The word's syllables are joined with a small overlap, not a gap.
 *
 * In speech the coda of one syllable runs into the onset of the next — 林's
 * nasal tail sits on top of 区's affricate. Overlapping also hides the seam
 * where the first clip's trimmed tail ends, which a hard butt-join at 0ms
 * would leave audible as a cut.
 */
const WORD_OVERLAP = 0.025
/** Analysis window for finding where a clip's sound starts and stops. */
const WINDOW = 0.01
/** A window counts as voiced above this fraction of the clip's loudest window. */
const VOICED_RATIO = 0.05
/** Decoded clips are ~200 kB of Float32 each, so the cache is bounded. */
const CACHE_MAX = 160

type Clip = {
  buffer: AudioBuffer
  /** Seconds of lead-in silence the recording carries. */
  lead: number
  /** Seconds of actual sound, starting at `lead`. */
  voiced: number
}

let context: AudioContext | undefined
const cache = new Map<string, Promise<Clip>>()

function audioContext(): AudioContext {
  context ??= new AudioContext()
  return context
}

/** Where the recording's own silence ends, and how much sound follows. */
function measure(buffer: AudioBuffer): { lead: number; voiced: number } {
  const data = buffer.getChannelData(0)
  const step = Math.max(1, Math.round(buffer.sampleRate * WINDOW))
  const windows = Math.floor(data.length / step)
  if (windows < 3) return { lead: 0, voiced: buffer.duration }

  const rms = new Float32Array(windows)
  let peak = 0
  for (let w = 0; w < windows; w++) {
    let sum = 0
    for (let i = w * step; i < (w + 1) * step; i++) sum += data[i] * data[i]
    rms[w] = Math.sqrt(sum / step)
    if (rms[w] > peak) peak = rms[w]
  }

  const threshold = peak * VOICED_RATIO
  let first = 0
  while (first < windows && rms[first] <= threshold) first++
  let last = windows - 1
  while (last > first && rms[last] <= threshold) last--
  if (first >= last) return { lead: 0, voiced: buffer.duration }

  // One window of margin either side, so a quiet onset or a soft final
  // consonant is never clipped.
  first = Math.max(0, first - 1)
  last = Math.min(windows - 1, last + 1)
  return {
    lead: (first * step) / buffer.sampleRate,
    voiced: ((last - first + 1) * step) / buffer.sampleRate,
  }
}

function load(url: string): Promise<Clip> {
  let pending = cache.get(url)
  if (!pending) {
    pending = (async () => {
      const response = await fetch(url)
      const buffer = await audioContext().decodeAudioData(await response.arrayBuffer())
      return { buffer, ...measure(buffer) }
    })()
    cache.set(url, pending)
    if (cache.size > CACHE_MAX) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined && oldest !== url) cache.delete(oldest)
    }
  }
  return pending
}

export function useQuizAudio() {
  const playing = useRef<AudioBufferSourceNode[]>([])
  /** Bumped to invalidate a sequence that is mid-flight. */
  const token = useRef(0)

  const silence = useCallback(() => {
    for (const source of playing.current) {
      try {
        source.stop()
      } catch {
        /* already finished */
      }
    }
    playing.current = []
  }, [])

  const stop = useCallback(() => {
    token.current += 1
    silence()
  }, [silence])

  const speak = useCallback(
    async (question: QuizQuestion) => {
      const mine = ++token.current
      const cancelled = () => token.current !== mine
      silence()

      const ctx = audioContext()
      if (ctx.state === 'suspended') await ctx.resume()
      if (cancelled()) return

      const target = await load(question.audio.target)
      const word = await Promise.all(question.audio.word.map(load))
      if (cancelled()) return

      // The standalone syllable twice, then the word once. Placed by each
      // clip's measured voiced length, so the gaps are exactly the constants
      // above rather than the recordings' own padding.
      const queue = [target, target, ...word]
      let at = ctx.currentTime + 0.08
      for (let i = 0; i < queue.length; i++) {
        const clip = queue[i]
        const source = ctx.createBufferSource()
        source.buffer = clip.buffer
        source.connect(ctx.destination)
        source.start(at, clip.lead, clip.voiced)
        playing.current.push(source)
        at += clip.voiced
        // Both standalone readings, and the step into the word, get a full
        // beat; only the word's own syllables are run together.
        if (i < queue.length - 1) at += i < 2 ? READING_GAP : -WORD_OVERLAP
      }
    },
    [silence],
  )

  /** Decode ahead of time so the next question's auto-play is not delayed. */
  const preload = useCallback((question: QuizQuestion) => {
    for (const url of [question.audio.target, ...question.audio.word]) void load(url)
  }, [])

  return { speak, stop, preload }
}
