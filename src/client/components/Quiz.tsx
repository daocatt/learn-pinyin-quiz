import { useCallback, useEffect, useRef, useState } from 'react'
import type { QuizAnswer, QuizRound } from '../../shared/quiz'
import { formatPinyin } from '../lib/pinyin'
import { useQuizAudio } from '../lib/quiz-audio'
import { navigate } from '../lib/router'
import { Confetti } from './Confetti'

/** A/B/C/D map to the four tones in order. */
const TONES = [
  { tone: 1, letter: 'A', name: '第一声' },
  { tone: 2, letter: 'B', name: '第二声' },
  { tone: 3, letter: 'C', name: '第三声' },
  { tone: 4, letter: 'D', name: '第四声' },
] as const

type Answer = { choice: number } & QuizAnswer

export function Quiz() {
  const [round, setRound] = useState<QuizRound | null>(null)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, Answer>>({})
  const [score, setScore] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [burst, setBurst] = useState(0)

  const { speak, stop, preload } = useQuizAudio()
  const started = useRef(false)

  const startRound = useCallback(async () => {
    stop()
    setLoading(true)
    setError(null)
    setRound(null)
    setAnswers({})
    setScore(0)
    setIndex(0)
    setFinished(false)
    try {
      const response = await fetch('/api/quiz/round', { method: 'POST' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      setRound((await response.json()) as QuizRound)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [stop])

  useEffect(() => {
    // StrictMode mounts effects twice, and a round is persisted server-side, so
    // make sure only one is ever created.
    if (started.current) return
    started.current = true
    void startRound()
  }, [startRound])

  const question = round?.questions[index]
  const answered = question ? answers[question.id] : undefined
  const total = round?.questions.length ?? 0
  const isLast = index + 1 >= total

  useEffect(() => {
    if (question) void speak(question)
  }, [question, speak])

  // Warm the next question's recordings so its auto-play is not delayed.
  useEffect(() => {
    const next = round?.questions[index + 1]
    if (next) preload(next)
  }, [round, index, preload])

  useEffect(() => {
    if (finished) stop()
  }, [finished, stop])

  const choose = async (choice: number) => {
    if (!round || !question || answered || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/quiz/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roundId: round.roundId, questionId: question.id, choice }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const result = (await response.json()) as QuizAnswer
      setAnswers((prev) => ({ ...prev, [question.id]: { choice, ...result } }))
      setScore(result.score)
      // A previously-missed item redeemed — celebrate it.
      if (result.correct && result.isRetry) setBurst((n) => n + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const goTo = (target: number) => {
    if (!round) return
    if (target >= round.questions.length) {
      setFinished(true)
      return
    }
    setIndex(Math.max(0, target))
  }

  const right = Object.values(answers).filter((entry) => entry.correct).length

  return (
    <div className="quiz-page">
      <Confetti trigger={burst} />

      <header className="quiz-topbar">
        <button type="button" className="quiz-back" onClick={() => navigate('/')}>
          ← 返回拼音图
        </button>
        <span className="quiz-topbar__title">拼音听力测验</span>
        <span className="quiz-topbar__meta">{total ? `共 ${total} 题` : ''}</span>
      </header>

      <main className="quiz-stage">
        {loading ? (
          <p className="quiz-status">正在出题…</p>
        ) : !round ? (
          <p className="quiz-status quiz-status--error">
            出题失败：{error ?? '未知错误'}
            <button type="button" className="quiz-status__retry" onClick={() => void startRound()}>
              重试
            </button>
          </p>
        ) : finished ? (
          <section className="quiz-card quiz-card--result">
            <p className="quiz-result__label">本轮成绩</p>
            <p className="quiz-result__score">
              {score}
              <span className="quiz-result__of"> / {total}</span>
            </p>
            <p className="quiz-result__line">
              答对 {right} 题，答错 {total - right} 题。
              {right === total
                ? '全部正确，声调掌握得很稳。'
                : '答错的题目会出现在下一轮里。'}
            </p>
            <div className="quiz-result__actions">
              <button type="button" className="quiz-next" onClick={() => void startRound()}>
                再来一轮
              </button>
              <button type="button" className="quiz-ghost" onClick={() => navigate('/')}>
                返回拼音图
              </button>
            </div>
          </section>
        ) : question ? (
          <article className="quiz-card">
            <header className="quiz-card__head">
              <span className="quiz-meta">
                <span className="quiz-meta__label">题号</span>
                <span className="quiz-meta__value">
                  {index + 1}
                  <span className="quiz-meta__of"> / {total}</span>
                </span>
              </span>
              <span className="quiz-meta quiz-meta--end">
                <span className="quiz-meta__label">得分</span>
                <span className="quiz-meta__value">{score}</span>
              </span>
            </header>

            <ol className="quiz-progress">
              {round.questions.map((item, position) => {
                const state = answers[item.id]
                const classes = [
                  'quiz-progress__seg',
                  position === index ? 'is-current' : '',
                  state ? (state.correct ? 'is-right' : 'is-wrong') : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <li key={item.id} className="quiz-progress__item">
                    <button
                      type="button"
                      className={classes}
                      title={`第 ${position + 1} 题`}
                      aria-label={`第 ${position + 1} 题`}
                      onClick={() => goTo(position)}
                    />
                  </li>
                )
              })}
            </ol>

            <section className="quiz-question">
              <p className="quiz-question__label">请选出这个音节的声调</p>
              <p className="quiz-question__pinyin">{question.syllable}</p>
              {question.word && <p className="quiz-question__word">{question.word}</p>}
              {question.isRetry && <p className="quiz-question__retry">上次答错，再考一次</p>}
              <button
                type="button"
                className="quiz-replay"
                onClick={() => void speak(question)}
              >
                <span aria-hidden="true">🔊</span> 再听一遍
              </button>
            </section>

            <div className="quiz-options">
              {TONES.map(({ tone, letter, name }) => {
                const state = !answered
                  ? 'is-idle'
                  : tone === answered.answer
                    ? 'is-correct'
                    : tone === answered.choice
                      ? 'is-wrong'
                      : 'is-muted'
                return (
                  <button
                    key={tone}
                    type="button"
                    className={`quiz-option ${state}`}
                    disabled={Boolean(answered) || busy}
                    onClick={() => void choose(tone)}
                  >
                    <span className="quiz-option__letter">{letter}</span>
                    <span className="quiz-option__body">
                      <span className="quiz-option__pinyin">
                        {formatPinyin(question.syllable, tone)}
                      </span>
                      <span className="quiz-option__tone">{name}</span>
                    </span>
                    <span className="quiz-option__mark" aria-hidden="true">
                      {state === 'is-correct' ? '✓' : state === 'is-wrong' ? '✗' : ''}
                    </span>
                  </button>
                )
              })}
            </div>

            <footer className="quiz-card__foot">
              <p
                className={`quiz-note${
                  answered ? (answered.correct ? ' is-right' : ' is-wrong') : ''
                }`}
              >
                {!answered
                  ? '听两遍独立音节，再听一遍组词，然后作答。'
                  : answered.correct
                    ? '答对了，得 1 分。'
                    : `答错了，正确答案是 ${TONES[answered.answer - 1].letter} · ${formatPinyin(question.syllable, answered.answer)}。`}
                {error && <span className="quiz-note__error">（{error}）</span>}
              </p>
              <button
                type="button"
                className="quiz-next"
                disabled={!answered}
                onClick={() => goTo(index + 1)}
              >
                {isLast ? '查看成绩' : '下一题'}
              </button>
            </footer>
          </article>
        ) : null}
      </main>

      <footer className="quiz-footer">ivy 拼音学习图</footer>
    </div>
  )
}
