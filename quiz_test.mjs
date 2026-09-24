/**
 * End-to-end check of the quiz, driven over CDP against a running dev server.
 *
 *   node quiz_test.mjs                 # http://localhost:5188/quiz
 *   URL=http://localhost:3100/quiz node quiz_test.mjs
 *
 * The correct tone is never in the page, so the test reads it out of
 * `data/quiz.db` — the same file the server writes — and then answers the UI
 * accordingly. That keeps the assertions honest: the UI is graded by the server,
 * not by the test's own idea of the answer.
 */
import { spawn, execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9341
const BASE = process.env.BASE ?? 'http://localhost:5188'
const URL = process.env.URL ?? `${BASE}/quiz`
const DB = process.env.DB ?? 'data/quiz.db'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures.push(`${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}`)
}
const checkThat = (label, ok, detail = '') => {
  if (!ok) failures.push(`${label} ${detail}`)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

const TONE = /^([a-z\u00fc]+)([1-4])$/
const toneOf = (item) => Number(TONE.exec(item)[2])

/** A clip's full length in seconds, straight from the file. */
const clipSeconds = (url) => {
  const info = execFileSync('afinfo', [`public${url}`], { encoding: 'utf8' })
  return Number(/estimated duration: ([\d.]+)/.exec(info)[1])
}

/** Clear previous rounds so the assertions see a single fresh one. */
function resetRounds() {
  const db = new DatabaseSync(DB)
  db.exec('DELETE FROM questions; DELETE FROM rounds;')
  db.close()
}

/** The newest round's questions, in the order the card will show them. */
function latestRound() {
  const db = new DatabaseSync(DB)
  const round = db.prepare('SELECT id FROM rounds ORDER BY id DESC LIMIT 1').get()
  if (!round) {
    db.close()
    return null
  }
  const rows = db
    .prepare('SELECT id, item, is_retry FROM questions WHERE round_id = ? ORDER BY position')
    .all(round.id)
  db.close()
  return {
    roundId: round.id,
    questions: rows.map((r) => ({ id: r.id, item: r.item, tone: toneOf(r.item), isRetry: r.is_retry === 1 })),
  }
}

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1400,980',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let ws
let id = 0
const pending = new Map()
const send = (method, params = {}) => {
  const i = ++id
  ws.send(JSON.stringify({ id: i, method, params }))
  return new Promise((r) => pending.set(i, r))
}

async function main() {
  resetRounds()

  let list = []
  for (let i = 0; i < 40; i++) {
    try {
      list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      if (list.some((t) => t.type === 'page')) break
    } catch {}
    await sleep(250)
  }
  ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))

  const consoleErrors = []
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result)
      pending.delete(m.id)
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '))
    if (m.method === 'Runtime.exceptionThrown')
      consoleErrors.push('EXCEPTION ' + m.params.exceptionDetails.text)
  }

  await send('Runtime.enable')
  await send('Page.enable')
  // The quiz schedules audio on the Web Audio clock, so record every
  // source.start(when, offset, duration). Those three numbers are the whole
  // playback contract: `offset` skips the clip's lead-in silence, `duration` is
  // its voiced length, and the gaps between successive `when`s are the rhythm.
  // `stop` is recorded too, because starting a new question or replaying one
  // must cancel whatever is still scheduled.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__plays = [];
      window.__stops = 0;
      const origStart = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
        window.__plays.push({
          when, offset, duration,
          at: performance.now(),
          total: this.buffer ? this.buffer.duration : null,
        });
        return origStart.apply(this, arguments);
      };
      const origStop = AudioBufferSourceNode.prototype.stop;
      AudioBufferSourceNode.prototype.stop = function () {
        window.__stops += 1;
        return origStop.apply(this, arguments);
      };
    `,
  })

  const ev = async (e) =>
    (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))
      .result?.value

  // ---------------------------------------------------------------- chart page
  await send('Page.navigate', { url: `${BASE}/` })
  await sleep(3000)
  console.log('--- chart page ---')
  const cta = await ev(`(() => {
    const button = document.querySelector('.quiz-cta');
    const title = document.querySelector('main h1');
    if (!button || !title) return null;
    const t = title.getBoundingClientRect(), b = button.getBoundingClientRect();
    return {
      text: button.textContent.trim(),
      afterTitle: b.left >= t.right - 1,
      verticallyCentred: Math.abs((b.top + b.bottom) / 2 - (t.top + t.bottom) / 2) < 12,
    };
  })()`)
  check('chart page has a 测验 button', cta?.text, '测验')
  checkThat('button sits after the title', cta?.afterTitle)
  checkThat('button is centred on the title', cta?.verticallyCentred)
  const chartShot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('quiz_cta.png', Buffer.from(chartShot.data, 'base64'))

  // Click through to the quiz rather than navigating, so the route is exercised.
  const ctaPos = await ev(`(() => {
    const r = document.querySelector('.quiz-cta').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`)
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', {
      type,
      x: ctaPos.x,
      y: ctaPos.y,
      button: 'left',
      clickCount: 1,
    })
  }
  await sleep(2500)

  console.log('--- quiz page ---')
  check('pathname after clicking 测验', await ev('location.pathname'), '/quiz')
  check('topbar title', await ev("document.querySelector('.quiz-topbar__title').textContent.trim()"), '拼音听力测验')
  check('back link', await ev("document.querySelector('.quiz-back').textContent.trim()"), '← 返回拼音图')

  // Letter-spacing adds a trailing gap, which used to leave tracked-out text
  // sitting left of centre. Measure the glyphs themselves, not the box.
  const centred = async (selector) =>
    ev(`(() => {
      const el = document.querySelector('${selector}');
      const node = el.firstChild;
      const range = document.createRange();
      range.setStart(node, 0); range.setEnd(node, 1);
      const left = range.getBoundingClientRect().left;
      range.setStart(node, node.length - 1); range.setEnd(node, node.length);
      const right = range.getBoundingClientRect().right;
      const glyphs = (left + right) / 2;
      const page = document.documentElement.clientWidth / 2;
      return Math.round((glyphs - page) * 10) / 10;
    })()`)
  const titleOffset = await centred('.quiz-topbar__title')
  checkThat('topbar title is centred', Math.abs(titleOffset) <= 0.8, `${titleOffset}px off centre`)

  const round = latestRound()
  checkThat('a round was persisted', round !== null && round.questions.length === 20, `${round?.questions.length} questions`)
  const questions = round.questions
  const items = questions.map((q) => q.item)

  check('题号 shows 1 / 20', await ev("document.querySelector('.quiz-meta__value').textContent.replace(/\\s+/g,'')"), '1/20')
  check('得分 starts at 0', await ev("document.querySelectorAll('.quiz-meta__value')[1].textContent.trim()"), '0')
  check('progress segments', await ev("document.querySelectorAll('.quiz-progress__seg').length"), 20)

  // The first question on the card must be the first question in the round.
  const card = await ev(`(() => {
    const options = [...document.querySelectorAll('.quiz-option')];
    return {
      syllable: document.querySelector('.quiz-question__pinyin').textContent.trim(),
      word: document.querySelector('.quiz-question__word')?.textContent.trim() ?? null,
      retry: !!document.querySelector('.quiz-question__retry'),
      letters: options.map(o => o.querySelector('.quiz-option__letter').textContent.trim()),
      pinyins: options.map(o => o.querySelector('.quiz-option__pinyin').textContent.trim()),
      toneNames: options.map(o => o.querySelector('.quiz-option__tone').textContent.trim()),
      marked: options.filter(o => o.classList.contains('is-correct') || o.classList.contains('is-wrong')).length,
      nextDisabled: document.querySelector('.quiz-next').disabled,
      nextLabel: document.querySelector('.quiz-next').textContent.trim(),
    };
  })()`)
  check('card shows the toneless syllable', card.syllable, items[0].replace(/\d$/, ''))
  check('option letters', card.letters, ['A', 'B', 'C', 'D'])
  check('option tone names', card.toneNames, ['第一声', '第二声', '第三声', '第四声'])
  checkThat('options are the four tone-marked readings', card.pinyins.length === 4 && card.pinyins.every((p) => p !== card.syllable), card.pinyins.join(' '))
  check('nothing marked before answering', card.marked, 0)
  check('下一题 is disabled before answering', card.nextDisabled, true)
  check('retry badge on a fresh round', card.retry, false)

  // The answer must not be in the page: no tone attribute, no tone in a class.
  checkThat(
    'no tone leaks into the DOM',
    await ev(`(() => {
      const html = document.querySelector('.quiz-card').outerHTML;
      return !/data-tone|"tone"/.test(html);
    })()`),
  )

  const { WORDS } = await import('./src/shared/words.ts')
  const { keyAudioUrl } = await import('./src/shared/quiz.ts')

  /**
   * Wait until no new sources have been scheduled for a poll. `speak()` loads
   * the clips and then schedules the whole question in one synchronous burst, so
   * once the count stops moving the batch is complete and its index range is
   * unambiguous.
   */
  const settle = async () => {
    let count = -1
    for (let i = 0; i < 30; i++) {
      const now = (await ev('window.__plays')).length
      if (now === count && now > 0) return now
      count = now
      await sleep(300)
    }
    return count
  }

  const target = keyAudioUrl(items[0])
  const expected = [target, target, ...(WORDS[items[0]]?.syllables ?? []).map(keyAudioUrl)]
  await settle()
  const plays = (await ev('window.__plays')).slice(0, expected.length)

  console.log('--- auto-play ---')
  console.log('     clips:', expected.join(' '))
  console.log(
    '     scheduled:',
    plays
      .map((p) => `${p.offset.toFixed(3)}+${p.duration.toFixed(3)} of ${p.total.toFixed(3)}`)
      .join('  '),
  )

  // buffer.duration fingerprints which clip was loaded, in which slot.
  const expectedDurations = expected.map(clipSeconds)
  check('first question scheduled the right clips', plays.length, expected.length)
  checkThat(
    'each slot loaded the expected recording',
    plays.every((p, i) => Math.abs(p.total - expectedDurations[i]) < 0.05),
    plays.map((p, i) => `${p.total.toFixed(3)}/${expectedDurations[i]}`).join(' '),
  )
  check(
    'the 组词 on the card is the one that was played',
    await ev("document.querySelector('.quiz-question__word')?.textContent.trim() ?? null"),
    WORDS[items[0]]?.word ?? null,
  )

  // Each clip's own padding is skipped, so the rhythm below is the app's.
  checkThat(
    'lead-in silence is skipped',
    plays.every((p) => p.offset > 0.05),
    plays.map((p) => p.offset.toFixed(3)).join(' '),
  )
  checkThat(
    'tail silence is trimmed',
    plays.every((p) => p.total - p.offset - p.duration > 0.02 && p.total - p.offset - p.duration < 0.35),
    plays.map((p) => (p.total - p.offset - p.duration).toFixed(3)).join(' '),
  )
  const silence = (a, b) => Math.round((plays[b].when - (plays[a].when + plays[a].duration)) * 1000)
  checkThat(
    'a beat before the second standalone reading',
    Math.abs(silence(0, 1) - 480) < 8,
    `${silence(0, 1)}ms`,
  )

  // A question with a two-syllable 组词, to check the word is not read as two
  // separate words. Not every item has one (zhuàng has no common word at all),
  // and it must not be the question already on screen — jumping to it is what
  // triggers the schedule being measured.
  const wordAt = questions.findIndex(
    (q, i) => i > 0 && (WORDS[q.item]?.syllables ?? []).length === 2,
  )
  checkThat('the round contains a two-syllable 组词', wordAt >= 0, `question ${wordAt + 1}`)
  const wordItem = questions[wordAt].item
  const wordClipUrls = [wordItem, wordItem, ...WORDS[wordItem].syllables].map(keyAudioUrl)
  const beforeWord = await settle()
  await ev(`document.querySelectorAll('.quiz-progress__seg')[${wordAt}].click()`)
  const afterWord = await settle()
  const wordPlays = (await ev('window.__plays')).slice(beforeWord, afterWord)

  console.log('--- 组词 chaining ---')
  console.log(`     ${WORDS[wordItem].word} (${wordItem}) -> ${wordClipUrls.join(' ')}`)
  const wordDurations = wordClipUrls.map(clipSeconds)
  checkThat(
    `${WORDS[wordItem].word} scheduled the expected clips`,
    wordPlays.length === 4 && wordPlays.every((p, i) => Math.abs(p.total - wordDurations[i]) < 0.05),
    wordPlays.map((p, i) => `${p.total.toFixed(3)}/${wordDurations[i]}`).join(' '),
  )
  const wordSilence = Math.round((wordPlays[3].when - (wordPlays[2].when + wordPlays[2].duration)) * 1000)
  checkThat(
    'the two halves of the 组词 overlap',
    Math.abs(wordSilence + 25) < 8,
    `${-wordSilence}ms of overlap between syllables`,
  )
  checkThat(
    'the beat before the 组词 is kept',
    Math.abs(Math.round((wordPlays[2].when - (wordPlays[1].when + wordPlays[1].duration)) * 1000) - 480) < 8,
  )

  // Back to the first question so the answering flow below starts where it expects.
  await ev("document.querySelectorAll('.quiz-progress__seg')[0].click()")
  const beforeReplay = await settle()
  const stopsBefore = await ev('window.__stops')
  await ev("document.querySelector('.quiz-replay').click()")
  let replay = []
  for (let i = 0; i < 20; i++) {
    replay = await ev('window.__plays')
    if (replay.length >= beforeReplay + expected.length) break
    await sleep(300)
  }
  const batch = replay.slice(beforeReplay, beforeReplay + expected.length)
  check('再听一遍 replays the whole question', batch.length, expected.length)
  checkThat(
    'the replay is the same question again',
    batch.every((p, i) => Math.abs(p.total - expectedDurations[i]) < 0.05),
    batch.map((p) => p.total.toFixed(3)).join(' '),
  )
  checkThat(
    'replaying cancels what was still scheduled',
    (await ev('window.__stops')) >= stopsBefore + expected.length,
    `${await ev('window.__stops')} stops, was ${stopsBefore}`,
  )

  const quizShot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('quiz_card.png', Buffer.from(quizShot.data, 'base64'))

  // ------------------------------------------------------- answer everything
  console.log('--- answering ---')
  /** Count the confetti canvas' painted pixels — 0 means nothing was fired. */
  const painted = async () =>
    ev(`(() => {
      const c = document.querySelector('canvas.confetti');
      if (!c) return -1;
      const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
      let n = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
      return n;
    })()`)
  /** Click the option for `tone` (1-4) on the card. */
  const clickTone = async (tone) => {
    const box = await ev(`(() => {
      const o = [...document.querySelectorAll('.quiz-option')][${tone - 1}];
      const r = o.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`)
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
    }
    await sleep(700)
  }

  // Answer the first one right, then deliberately miss the last one.
  await clickTone(questions[0].tone)
  const afterFirst = await ev(`(() => {
    const options = [...document.querySelectorAll('.quiz-option')];
    const correct = options.findIndex(o => o.classList.contains('is-correct'));
    const wrong = options.findIndex(o => o.classList.contains('is-wrong'));
    return {
      correctIndex: correct,
      wrongIndex: wrong,
      letter: correct >= 0 ? options[correct].querySelector('.quiz-option__letter').textContent.trim() : null,
      score: document.querySelectorAll('.quiz-meta__value')[1].textContent.trim(),
      note: document.querySelector('.quiz-note').textContent.trim(),
      nextDisabled: document.querySelector('.quiz-next').disabled,
      firstSeg: document.querySelectorAll('.quiz-progress__seg')[0].className,
    };
  })()`)
  check('the correct option is revealed', afterFirst.correctIndex, questions[0].tone - 1)
  check('no option is marked wrong after a correct pick', afterFirst.wrongIndex, -1)
  check('score goes up by 1', afterFirst.score, '1')
  checkThat('the note confirms the point', afterFirst.note.includes('得 1 分'), afterFirst.note)
  check('下一题 unlocks', afterFirst.nextDisabled, false)
  checkThat('the progress segment turns green', afterFirst.firstSeg.includes('is-right'), afterFirst.firstSeg)
  check('no confetti for an ordinary correct answer', await painted(), 0)
  // Same trailing-letter-space trap inside the question panel.
  const panelOffsets = await ev(`(() => {
    const offsets = {};
    for (const [key, sel] of [['label','.quiz-question__label'],['pinyin','.quiz-question__pinyin'],['word','.quiz-question__word']]) {
      const el = document.querySelector(sel);
      if (!el) { offsets[key] = 'absent'; continue; }
      const node = el.firstChild;
      const range = document.createRange();
      range.setStart(node, 0); range.setEnd(node, 1);
      const left = range.getBoundingClientRect().left;
      range.setStart(node, node.length - 1); range.setEnd(node, node.length);
      const right = range.getBoundingClientRect().right;
      const panel = el.getBoundingClientRect();
      offsets[key] = Math.round(((left + right) / 2 - (panel.left + panel.right) / 2) * 10) / 10;
    }
    return offsets;
  })()`)
  checkThat(
    'question panel text is centred',
    Object.values(panelOffsets).every((v) => v === 'absent' || Math.abs(v) <= 0.8),
    JSON.stringify(panelOffsets),
  )

  const answeredShot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('quiz_answered.png', Buffer.from(answeredShot.data, 'base64'))

  const goNext = async () => {
    const box = await ev(`(() => {
      const r = document.querySelector('.quiz-next').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`)
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
    }
    await sleep(500)
  }

  const wordMismatches = []
  for (let i = 1; i < questions.length; i++) {
    await goNext()
    const shown = await ev("document.querySelector('.quiz-question__pinyin').textContent.trim()")
    checkThat(`question ${i + 1} matches the round`, shown === items[i].replace(/\d$/, ''), `${shown} vs ${items[i]}`)
    const shownWord = await ev("document.querySelector('.quiz-question__word')?.textContent.trim() ?? null")
    const wantWord = WORDS[items[i]]?.word ?? null
    if (shownWord !== wantWord) wordMismatches.push(`${items[i]}: ${shownWord} vs ${wantWord}`)
    const miss = i === questions.length - 1
    await clickTone(miss ? (questions[i].tone % 4) + 1 : questions[i].tone)
    if (miss) {
      const note = await ev("document.querySelector('.quiz-note').textContent.trim()")
      checkThat('a miss names the right answer', note.includes('答错了'), note)
      checkThat(
        'a miss marks the chosen option',
        await ev("[...document.querySelectorAll('.quiz-option')].some(o => o.classList.contains('is-wrong'))"),
      )
      check(
        'a miss does not score',
        await ev("document.querySelectorAll('.quiz-meta__value')[1].textContent.trim()"),
        '19',
      )
      check(
        'a miss turns the segment red',
        await ev("document.querySelectorAll('.quiz-progress__seg')[19].className.includes('is-wrong')"),
        true,
      )
    }
  }

  check('last button says 查看成绩', await ev("document.querySelector('.quiz-next').textContent.trim()"), '查看成绩')
  check('every 组词 matches the generated table', wordMismatches, [])

  // -------------------------------------------------- manual question switching
  console.log('--- manual switching ---')
  await ev("document.querySelectorAll('.quiz-progress__seg')[0].click()")
  await sleep(1200)
  check('clicking a segment jumps to that question', await ev("document.querySelector('.quiz-meta__value').textContent.replace(/\\s+/g,'')"), '1/20')
  checkThat(
    'a revisited question keeps its answer',
    await ev("[...document.querySelectorAll('.quiz-option')].some(o => o.classList.contains('is-correct'))"),
  )
  check('下一题 is enabled again on an answered question', await ev("document.querySelector('.quiz-next').disabled"), false)

  // ------------------------------------------------------------ result panel
  await ev("document.querySelectorAll('.quiz-progress__seg')[19].click()")
  await sleep(1000)
  await goNext()
  await sleep(600)
  const result = await ev(`(() => {
    const card = document.querySelector('.quiz-card--result');
    if (!card) return null;
    return {
      score: card.querySelector('.quiz-result__score').textContent.replace(/\\s+/g, ''),
      line: card.querySelector('.quiz-result__line').textContent.trim(),
      actions: [...card.querySelectorAll('button')].map(b => b.textContent.trim()),
      canvas: !!document.querySelector('canvas.confetti'),
      cardGone: !document.querySelector('.quiz-question'),
    };
  })()`)
  check('result score', result?.score, '19/20')
  checkThat('result summarises the round', result?.line.includes('答对 19 题'), result?.line)
  check('result actions', result?.actions, ['再来一轮', '返回拼音图'])
  checkThat('the question card is gone', result?.cardGone)
  const resultShot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('quiz_result.png', Buffer.from(resultShot.data, 'base64'))

  // ------------------------------------------- next round folds in the misses
  console.log('--- next round ---')
  await ev("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '再来一轮').click()")
  await sleep(2500)
  const second = latestRound()
  const missed = items[questions.length - 1]
  checkThat('a second round was persisted', second !== null && second.roundId !== round.roundId, `round ${second?.roundId}`)
  const secondItems = second.questions.map((q) => q.item)
  checkThat('the missed item is folded into the new round', secondItems.includes(missed), missed)
  checkThat(
    'it is flagged as a retry',
    second.questions.find((q) => q.item === missed)?.isRetry === true,
  )
  const overlap = secondItems.filter((i) => items.includes(i) && i !== missed)
  check('no other overlap with the previous round', overlap, [])
  check(
    'the new round starts over at 0',
    await ev("document.querySelectorAll('.quiz-meta__value')[1].textContent.trim()"),
    '0',
  )

  // Redeem the carried-over item: that is what earns the confetti burst.
  const retryAt = second.questions.findIndex((q) => q.isRetry)
  checkThat('the carried-over item is in the new round', retryAt >= 0, `position ${retryAt + 1}`)
  await ev(`document.querySelectorAll('.quiz-progress__seg')[${retryAt}].click()`)
  await sleep(1400)
  checkThat(
    'the card flags it as a retry',
    await ev("!!document.querySelector('.quiz-question__retry')"),
  )
  check('no confetti before redeeming', await painted(), 0)
  await clickTone(second.questions[retryAt].tone)
  // Capture while the streamers are mid-flight, before they fall away.
  const confettiShot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('quiz_confetti.png', Buffer.from(confettiShot.data, 'base64'))
  let confetti = 0
  for (let i = 0; i < 6; i++) {
    confetti = Math.max(confetti, await painted())
    await sleep(180)
  }
  checkThat('confetti fires when a missed item is redeemed', confetti > 1000, `${confetti} opaque pixels`)

  // ---------------------------------------------------------------- hygiene
  console.log('--- hygiene ---')
  const { quizPool } = await import('./src/shared/quiz.ts')
  const { existsSync } = await import('node:fs')
  const pool = quizPool()
  const noRecording = pool
    .flatMap((item) => [item.key, ...(item.wordKeys ?? [])])
    .filter((key) => !existsSync(`public${keyAudioUrl(key)}`))
  check('every quiz syllable has a recording', [...new Set(noRecording)], [])
  console.log('     pool:', pool.length, '| with 组词:', pool.filter((i) => i.word).length)

  const blocked = await ev(`(async () => {
    const res = await fetch('/api/quiz/round', { method: 'POST' });
    const data = await res.json();
    return data.questions.map(q => q.word).filter(Boolean);
  })()`)
  const BLOCKED = '操肏屄毴屌逼干嫖骚娼妓婊淫贱尻屎屁'
  const dirty = blocked.filter((w) => [...w].some((c) => BLOCKED.includes(c)))
  check('no 脏字 in any 组词', dirty, [])
  console.log('     words sampled:', blocked.length, blocked.slice(0, 8).join(' '))

  check('no console errors', consoleErrors, [])

  // -------------------------------------------------------- narrow viewport
  console.log('--- narrow viewport ---')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  })
  await sleep(900)
  const narrow = await ev(`(() => {
    const card = document.querySelector('.quiz-card');
    const options = [...document.querySelectorAll('.quiz-option')];
    const de = document.documentElement;
    return {
      cardFits: card.getBoundingClientRect().width <= 390,
      optionColumns: new Set(options.map(o => Math.round(o.getBoundingClientRect().left))).size,
      overflowX: de.scrollWidth > de.clientWidth,
      // 真正的验收标准：一屏放下，不需要纵向滚动。
      scrollsY: de.scrollHeight > de.clientHeight,
      cardBottom: Math.round(card.getBoundingClientRect().bottom),
      viewportH: de.clientHeight,
    };
  })()`)
  check('narrow: the card fits the viewport', narrow.cardFits, true)
  // 手机端是两列（不是一列）。一列时四个选项纵向堆 366px，整张卡就顶出屏幕了。
  check('narrow: options sit in two columns', narrow.optionColumns, 2)
  checkThat('narrow: no horizontal overflow', !narrow.overflowX)
  checkThat(
    'narrow: no vertical scroll',
    !narrow.scrollsY,
    `cardBottom=${narrow.cardBottom} viewportH=${narrow.viewportH}`,
  )
  const narrowShot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('quiz_narrow.png', Buffer.from(narrowShot.data, 'base64'))

  console.log(`\n${failures.length ? `${failures.length} FAILURE(S)` : 'all checks passed'}`)
  for (const f of failures) console.log('  -', f)
  process.exitCode = failures.length ? 1 : 0
}

main()
  .catch((e) => {
    console.error('harness error:', e)
    process.exitCode = 1
  })
  .finally(() => chrome.kill())
