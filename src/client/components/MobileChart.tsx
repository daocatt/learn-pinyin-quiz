import { useState, useEffect, useRef } from 'react'
import type { ChartData } from '../../shared/chart'
import type { ChartCell } from '../../shared/chart-data'
import { audioUrl } from '../../shared/audio'
import { HANZI } from '../../shared/hanzi'
import { formatPinyin } from '../lib/pinyin'

function cellText(cell: ChartCell): string {
  if (!cell) return ''
  return typeof cell === 'string' ? cell : cell.text
}

function cellBold(cell: ChartCell): boolean {
  return typeof cell === 'object' && cell !== null && Boolean(cell.bold)
}

const TONES = [1, 2, 3, 4]

interface MobileChartProps {
  data: ChartData
}

export function MobileChart({ data }: MobileChartProps) {
  // Extract all valid initial initials
  const initials = data.rows.map((r) => r.initial)
  const [selectedInitial, setSelectedInitial] = useState<string>(initials[0] || 'b')
  const [activeSyllable, setActiveSyllable] = useState<string | null>(null)
  const [playingTone, setPlayingTone] = useState<number | null>(null)
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([])

  // Find currently selected row
  const currentRow = data.rows.find((r) => r.initial === selectedInitial)

  // Collect all syllables that have readings in this row
  const availableSyllables = currentRow
    ? currentRow.cells
        .map((c, idx) => ({
          text: cellText(c),
          bold: cellBold(c),
          final: data.finals[idx] || '',
        }))
        .filter((item) => item.text.length > 0)
    : []

  // Preload audio when activeSyllable changes
  useEffect(() => {
    if (!activeSyllable) return
    setPlayingTone(null)
    const audios = TONES.map((tone) => {
      const a = new Audio(audioUrl(activeSyllable, tone))
      a.preload = 'auto'
      return a
    })
    audioRefs.current = audios
    return () => {
      for (const a of audios) {
        a.pause()
        a.removeAttribute('src')
      }
    }
  }, [activeSyllable])

  const playTone = (tone: number) => {
    if (!activeSyllable) return
    const a = audioRefs.current[tone - 1]
    if (!a) return
    setPlayingTone(tone)
    a.currentTime = 0
    a.play().catch(() => {})
    a.onended = () => {
      setPlayingTone((curr) => (curr === tone ? null : curr))
    }
  }

  return (
    <div className="w-full pb-16">
      {/* 1. Mobile Initial Picker (2 Rows Grid) */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-[#e5eee8] px-3 py-2.5">
        <div className="text-[11px] font-semibold text-[#7e8c84] mb-2 px-0.5 tracking-wider uppercase">
          Select Initial
        </div>
        <div className="grid grid-flow-col grid-rows-2 gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {initials.map((init) => {
            const isSelected = init === selectedInitial
            return (
              <button
                key={init}
                type="button"
                onClick={() => {
                  setSelectedInitial(init)
                  setActiveSyllable(null)
                }}
                className={`min-w-[42px] px-2.5 py-1.5 rounded-lg text-sm font-semibold text-center transition-all ${
                  isSelected
                    ? 'bg-[#0b6b41] text-white shadow-sm shadow-[#0b6b41]/30 scale-102'
                    : 'bg-[#f4f8f5] text-[#2b2b2b] hover:bg-[#eaf4ed] active:scale-95'
                }`}
              >
                {init}
              </button>
            )
          })}
        </div>
      </div>

      {/* 2. Syllables Grid under selected initial */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-[#7e8c84]">
            Initial <span className="font-bold text-[#0b6b41] text-sm">[{selectedInitial}]</span> Syllables ({availableSyllables.length})
          </span>
          <span className="text-[11px] text-[#9db0a5]">Tap to listen</span>
        </div>

        {availableSyllables.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#7e8c84] bg-[#fbfdfc] rounded-xl border border-dashed border-[#d8e5dd]">
            No available syllables for this initial
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            {availableSyllables.map((item) => {
              const isSelected = item.text === activeSyllable
              return (
                <button
                  key={item.text}
                  type="button"
                  onClick={() => setActiveSyllable(item.text)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-[#0b6b41] bg-[#eaf6ef] shadow-sm ring-2 ring-[#74d990]/40'
                      : 'border-[#e2ece5] bg-[#fbfdfc] hover:bg-[#f2faf5] active:scale-98'
                  }`}
                >
                  <span className="text-lg font-medium text-[#0b6b41]">{item.text}</span>
                  <span className="text-[11px] text-[#9db0a5] mt-0.5">+{item.final}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 3. Bottom ActionSheet for 4 Tones */}
      {activeSyllable && (
        <div className="fixed inset-x-0 bottom-0 z-50 bg-white/95 backdrop-blur-lg border-t border-[#d8e5dd] shadow-2xl p-4 rounded-t-2xl animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-[#f0f5f2] mb-3">
            <div>
              <span className="text-xs text-[#7e8c84]">正在播放音节</span>
              <h3 className="text-xl font-bold text-[#0b6b41]">{activeSyllable}</h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveSyllable(null)}
              className="p-1.5 rounded-full text-[#7e8c84] hover:bg-[#f0f5f2]"
              aria-label="关闭"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {TONES.map((tone) => {
              const hanzi = (HANZI as Record<string, string>)[`${activeSyllable}${tone}`] || ''
              const isPlaying = playingTone === tone
              return (
                <button
                  key={tone}
                  type="button"
                  onClick={() => playTone(tone)}
                  className={`flex flex-col items-center py-2.5 px-1 rounded-xl border transition-all ${
                    isPlaying
                      ? 'border-[#0b6b41] bg-[#0b6b41] text-white scale-102 shadow-md'
                      : 'border-[#d8e5dd] bg-[#fbfdfc] text-[#2b2b2b] hover:bg-[#eaf4ed] active:scale-95'
                  }`}
                >
                  <span className="text-base font-semibold leading-tight">
                    {formatPinyin(activeSyllable, tone)}
                  </span>
                  <span
                    className={`text-[11px] mt-1 ${
                      isPlaying ? 'text-white/80' : 'text-[#7e8c84]'
                    }`}
                  >
                    Tone {tone}
                  </span>
                  <span
                    className={`text-sm mt-1 font-serif ${
                      isPlaying ? 'text-[#74d990]' : 'text-[#0b6b41]'
                    }`}
                  >
                    {hanzi || '·'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
