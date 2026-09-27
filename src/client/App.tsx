import { useEffect, useState } from 'react'
import type { ChartData } from '../shared/chart'
import { PinyinChart } from './components/PinyinChart'
import { MobileChart } from './components/MobileChart'
import { Quiz } from './components/Quiz'
import { navigate, usePathname } from './lib/router'
import { unlockAudio } from './lib/quiz-audio'

export default function App() {
  const path = usePathname()
  return path === '/quiz' ? <Quiz /> : <ChartPage />
}

function ChartPage() {
  const [data, setData] = useState<ChartData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/chart', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<ChartData>
      })
      .then(setData)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => controller.abort()
  }, [])

  return (
    <div className="min-h-screen bg-white font-sans leading-[1.4] text-ink">
      <main>
        <section className="py-4 md:py-[35px]">
          {/* Title header */}
          <div className="mx-auto w-full max-w-[969px] px-4 sm:px-0">
            <div className="mb-4 md:mb-5 flex items-center justify-between md:justify-center gap-4">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.jpg"
                  alt="Jieba Pinyin Quiz Logo"
                  className="h-9 w-9 rounded-lg shadow-sm border border-[#e2ece5] object-cover"
                />
                <h1 className="text-left md:text-center text-2xl md:text-[38px] font-light leading-[1.4] text-brand">
                  Jieba Pinyin Quiz
                </h1>
              </div>
              <button
                type="button"
                className="quiz-cta"
                onClick={() => {
                  unlockAudio()
                  navigate('/quiz')
                }}
              >
                Listening Quiz
              </button>
            </div>

            {/* Mint rule divider */}
            <div className="w-full border-t-[3px] border-accent" />
          </div>

          {/* Error / Loading */}
          {error ? (
            <p className="py-10 text-center text-[15px] text-brand">拼音图加载失败：{error}</p>
          ) : !data ? (
            <p className="py-10 text-center text-[15px] text-muted">正在加载拼音图…</p>
          ) : (
            <>
              {/* Desktop layout: md and above */}
              <div className="hidden md:block mx-auto w-full max-w-[1310px] pt-[30px]">
                <PinyinChart data={data} />
              </div>

              {/* Mobile layout: below md */}
              <div className="block md:hidden w-full pt-2">
                <MobileChart data={data} />
              </div>
            </>
          )}
        </section>
      </main>

      <footer className="border-t border-[#ddd] py-10 text-center text-[13px] text-muted">
        <div className="mx-auto flex flex-col items-center justify-center gap-3">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.jpg"
              alt="Jieba Logo"
              className="h-7 w-7 rounded-md border border-[#e5eae7] shadow-sm object-cover"
            />
            <span className="font-medium text-[#111] text-[15px]">Jieba Pinyin Quiz</span>
          </div>
          <p className="max-w-md text-xs text-[#7e8c84] leading-relaxed">
            No more stuttering in Chinese. Say goodbye to &quot;Jieba&quot;. Speak Chinese with flow.
            <br />
            <span className="text-[#0b6b41] font-medium">From stuttering to fluent: Master Pinyin first.</span>
          </p>
        </div>
      </footer>
    </div>
  )
}
