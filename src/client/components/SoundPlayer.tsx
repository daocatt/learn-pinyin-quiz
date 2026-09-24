import { useEffect, useRef, useState } from 'react'
import { audioUrl } from '../../shared/audio'
import { HANZI } from '../../shared/hanzi'
import { formatPinyin } from '../lib/pinyin'

const TONES = [1, 2, 3, 4]

export type PlayerPosition = {
  top: number
  left: number | null
  right: number | null
  pointer: 'left' | 'right'
}

type Props = {
  syllable: string
  position: PlayerPosition
}

/**
 * The floating four-tone player: one card per tone, laid out horizontally, each
 * showing the tone-marked pinyin above an example character with a speaker in
 * the top-right corner. Every card preloads its own mp3 and only becomes
 * playable once the file is actually available.
 */
export function SoundPlayer({ syllable, position }: Props) {
  const [loaded, setLoaded] = useState<boolean[]>([false, false, false, false])
  const audios = useRef<(HTMLAudioElement | null)[]>([])

  useEffect(() => {
    setLoaded([false, false, false, false])
    const created = TONES.map((tone) => {
      const audio = new Audio(audioUrl(syllable, tone))
      audio.preload = 'auto'
      audio.volume = 1
      const markLoaded = () =>
        setLoaded((prev) => {
          if (prev[tone - 1]) return prev
          const next = [...prev]
          next[tone - 1] = true
          return next
        })
      audio.addEventListener('canplaythrough', markLoaded, { once: true })
      audio.addEventListener('loadeddata', markLoaded, { once: true })
      return audio
    })
    audios.current = created

    return () => {
      for (const audio of created) {
        audio.pause()
        audio.removeAttribute('src')
      }
    }
  }, [syllable])

  const play = (tone: number) => {
    const audio = audios.current[tone - 1]
    if (!audio) return
    try {
      audio.currentTime = 0
      void audio.play().catch(() => {
        /* syllable has no recording (e.g. a bare final such as "i") */
      })
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="snd-player"
      style={{ top: position.top, left: position.left ?? 'auto', right: position.right ?? 'auto' }}
      onClick={(event) => event.stopPropagation()}
      role="group"
      aria-label={`${syllable} 的四个声调`}
    >
      <div className="snd-player__row">
        {TONES.map((tone) => {
          const pinyin = formatPinyin(syllable, tone)
          // Absent when the tone does not exist in Mandarin (e.g. "bán").
          const hanzi = HANZI[`${syllable}${tone}`]
          return (
            <button
              key={tone}
              type="button"
              className={`snd-player__card${loaded[tone - 1] ? ' is-loaded' : ''}`}
              title={hanzi ? `${pinyin} · ${hanzi}` : pinyin}
              aria-label={`播放 ${pinyin}${hanzi ? `，${hanzi}` : ''}`}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                play(tone)
              }}
            >
              <span className="snd-player__icon" aria-hidden="true">
                🔊
              </span>
              <span className="snd-player__pinyin">{pinyin}</span>
              <span className={`snd-player__hanzi${hanzi ? '' : ' snd-player__hanzi--empty'}`}>
                {hanzi ?? '—'}
              </span>
            </button>
          )
        })}
      </div>
      <span className={`snd-player__pointer snd-player__pointer--${position.pointer}`} />
    </div>
  )
}
