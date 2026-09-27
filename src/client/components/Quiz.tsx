import { useCallback, useEffect, useRef, useState } from 'react'
import type { QuizAnswer, QuizRound } from '../../shared/quiz'
import { formatPinyin } from '../lib/pinyin'
import { useQuizAudio } from '../lib/quiz-audio'
import { navigate } from '../lib/router'
import { buildXShareUrl, getLocalHistory, saveRoundResult } from '../lib/history'
import { Confetti } from './Confetti'

/** A/B/C/D map to the four tones in order. */
const TONES = [
  { tone: 1, letter: 'A', name: 'Tone 1' },
  { tone: 2, letter: 'B', name: 'Tone 2' },
  { tone: 3, letter: 'C', name: 'Tone 3' },
  { tone: 4, letter: 'D', name: 'Tone 4' },
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

  useEffect(() => {
    if (finished && round) {
      saveRoundResult({
        id: round.roundId,
        score,
        total,
      })
    }
  }, [finished, round, score, total])

  const percentage = Math.round((score / (total || 1)) * 100)
  const shareUrl = buildXShareUrl({ score, total, percentage })
  const localHistory = finished ? getLocalHistory() : []

  return (
    <div className="quiz-page">
      <Confetti trigger={burst} />

      <header className="quiz-topbar">
        <button type="button" className="quiz-back" onClick={() => navigate('/')}>
          ← Back to Chart
        </button>
        <span className="quiz-topbar__title">Listening Quiz</span>
        <span className="quiz-topbar__meta">{total ? `${total} Questions` : ''}</span>
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
            <p className="quiz-result__label">ROUND SCORE</p>
            <p className="quiz-result__score">
              {score}
              <span className="quiz-result__of"> / {total}</span>
            </p>
            <p className="quiz-result__line">
              {right} correct, {total - right} incorrect ({percentage}% accuracy).
              {right === total
                ? ' Perfect score! Your tones are rock solid.'
                : ' Missed items will be reviewed in upcoming rounds.'}
            </p>

            <div className="quiz-result__actions">
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="quiz-share-x"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Share on X
              </a>
              <button type="button" className="quiz-next" onClick={() => void startRound()}>
                Play Again
              </button>
              <button type="button" className="quiz-ghost" onClick={() => navigate('/')}>
                Back to Chart
              </button>
            </div>

            {localHistory.length > 1 && (
              <div className="mt-8 border-t border-[#eef3ef] pt-5 text-left">
                <p className="text-xs font-semibold tracking-wider text-[#9db0a5] uppercase">
                  Recent Rounds (Local Device)
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {localHistory.slice(0, 6).map((h, i) => (
                    <span
                      key={h.id || i}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#e2ece5] bg-[#fbfdfc] px-2.5 py-1 text-xs text-[#2b2b2b]"
                    >
                      <span className="font-semibold text-[#0b6b41]">
                        {h.score}/{h.total}
                      </span>
                      <span className="text-[11px] text-[#9db0a5]">{h.percentage}%</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : question ? (
          <article className="quiz-card">
            <header className="quiz-card__head">
              <div className="flex items-center gap-3">
                <span className="quiz-meta">
                  <span className="quiz-meta__label">Question</span>
                  <span className="quiz-meta__value">
                    {index + 1}
                    <span className="quiz-meta__of"> / {total}</span>
                  </span>
                </span>
                {question.isFun && !question.isRetry && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#fef3c7] text-[#92400e] border border-[#fde68a]">
                    ✨ Fun Challenge
                  </span>
                )}
              </div>
              <span className="quiz-meta quiz-meta--end">
                <span className="quiz-meta__label">Score</span>
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
                      title={`Question ${position + 1}`}
                      aria-label={`Question ${position + 1}`}
                      onClick={() => goTo(position)}
                    />
                  </li>
                )
              })}
            </ol>

            <section className="quiz-question">
              <p className="quiz-question__label">Choose the correct tone for this syllable</p>
              <p className="quiz-question__pinyin">{question.syllable}</p>
              {question.word && <p className="quiz-question__word">{question.word}</p>}
              {question.isRetry && <p className="quiz-question__retry">Review Missed Question</p>}
              <button
                type="button"
                className="quiz-replay"
                onClick={() => void speak(question)}
              >
                <span aria-hidden="true">🔊</span> Play Again
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
                  ? ''
                  : answered.correct
                    ? 'Correct! +1 point.'
                    : `Incorrect. Correct answer is ${TONES[answered.answer - 1].letter} · ${formatPinyin(question.syllable, answered.answer)}.`}
                {error && <span className="quiz-note__error">({error})</span>}
              </p>
              <button
                type="button"
                className="quiz-next"
                disabled={!answered}
                onClick={() => goTo(index + 1)}
              >
                {isLast ? 'View Results' : 'Next Question'}
              </button>
            </footer>
          </article>
        ) : null}
      </main>

      <footer className="quiz-footer flex items-center justify-center gap-2">
        <img src="/logo.jpg" alt="Logo" className="w-4 h-4 rounded object-cover" />
        <span>Jieba Pinyin Quiz</span>
      </footer>
    </div>
  )
}
