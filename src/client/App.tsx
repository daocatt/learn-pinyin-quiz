import { useEffect, useState } from 'react'
import type { ChartData } from '../shared/chart'
import { PinyinChart } from './components/PinyinChart'
import { Quiz } from './components/Quiz'
import { navigate, usePathname } from './lib/router'

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
        <section className="py-[35px]">
          {/* Title, constrained to the 969px text column. */}
          <div className="mx-auto w-full max-w-[969px] px-4 sm:px-0">
            <div className="mb-5 flex items-center justify-center gap-4">
              <h1 className="text-center text-[38px] font-light leading-[1.4] text-brand">
                拼音学习图
              </h1>
              <button type="button" className="quiz-cta" onClick={() => navigate('/quiz')}>
                测验
              </button>
            </div>

            {/* Mint rule, kept as the divider that used to sit above the intro copy. */}
            <div className="w-full border-t-[3px] border-accent" />
          </div>

          {/* The chart row is capped at 1310px and offset by 30px. */}
          <div className="mx-auto w-full max-w-[1310px] pt-[30px]">
            {error ? (
              <p className="py-10 text-center text-[15px] text-brand">拼音图加载失败：{error}</p>
            ) : data ? (
              <PinyinChart data={data} />
            ) : (
              <p className="py-10 text-center text-[15px] text-muted">正在加载拼音图…</p>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-[#ddd] py-8 text-center text-[13px] text-muted">
        ivy 拼音学习图
      </footer>
    </div>
  )
}
