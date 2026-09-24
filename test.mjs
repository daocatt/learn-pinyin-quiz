import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9340
const URL = process.env.URL ?? 'http://localhost:5188/'

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${PORT}`, '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ws, id = 0
const pending = new Map()
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r) => pending.set(i, r)) }

async function main() {
  let list = []
  for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (list.some(t => t.type === 'page')) break } catch {} await sleep(250) }
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => (ws.onopen = r))
  const consoleErrors = []
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id) }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map(a => a.value ?? a.description).join(' '))
    if (m.method === 'Runtime.exceptionThrown') consoleErrors.push('EXCEPTION ' + m.params.exceptionDetails.text)
  }
  await send('Runtime.enable'); await send('Page.enable')
  await send('Page.navigate', { url: URL })
  await sleep(4000)
  const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value

  console.log('title:', await ev('document.title'))
  console.log('rows:', await ev("document.querySelectorAll('.pinyin-table tbody tr').length"))
  console.log('cells:', await ev("document.querySelectorAll('.pinyin-table td').length"))
  console.log('bold cells:', await ev("document.querySelectorAll('.pinyin-table td b').length"))

  // The two trailing content sections must be gone, and the footer reworded.
  console.log('sections:', await ev("document.querySelectorAll('main > section').length"))
  console.log('removed headings present:', await ev(
    "['学习汉语拼音','拼音备忘单','额外的洞察力','英语近似值'].filter(t => document.body.innerText.includes(t))"))
  console.log('cheat-sheet iframe:', await ev("!!document.querySelector('iframe')"))
  console.log('footer:', await ev("document.querySelector('footer').textContent.trim()"))

  // Heading copy: eyebrow and intro paragraph removed, title renamed.
  console.log('h1:', await ev("document.querySelector('main h1').textContent.trim()"))
  console.log('eyebrow (h2) count:', await ev("document.querySelectorAll('main h2').length"))
  console.log('intro paragraph present:', await ev("document.body.innerText.includes('点击这里')"))
  console.log('pdf link present:', await ev("!!document.querySelector('a[href$=\".pdf\"]')"))
  console.log('note text:', await ev(
    "document.querySelector('#pinyin_chart_wrapper + p').innerText.replace(/\\s+/g, ' ').trim()"))

  // Header and the 单击时 control row must be gone entirely.
  console.log('header element:', await ev("document.querySelectorAll('header').length"))
  console.log('logo images on page:', await ev("document.querySelectorAll('img[src*=logo]').length"))
  console.log('chart_controls:', await ev("!!document.querySelector('#chart_controls')"))
  console.log('click_rule select:', await ev("!!document.querySelector('select.click_rule')"))
  console.log('h1 color:', await ev("getComputedStyle(document.querySelector('main h1')).color"))

  // --- finals row now carries the audio marking (the bottom row is gone) ---
  console.log('tbody rows:', await ev("document.querySelectorAll('.pinyin-table tbody tr').length"))
  console.log('finals w/ audio:', await ev(
    "[...document.querySelectorAll('.finals-row td.finals-row__audio')].map(td => td.textContent).join(' ')"))
  console.log('finals w/o audio:', await ev(
    "[...document.querySelectorAll('.finals-row td')].filter(td => td.textContent.trim() && !td.classList.contains('finals-row__audio')).map(td => td.textContent).join(' ')"))
  console.log('finals row style:', await ev(`(() => {
    const on = document.querySelector('.finals-row td.finals-row__audio');
    const off = [...document.querySelectorAll('.finals-row td')].find(t => t.textContent.trim() === 'ong');
    return {
      withAudio: { color: getComputedStyle(on).color, weight: getComputedStyle(on).fontWeight },
      withoutAudio: { color: getComputedStyle(off).color, weight: getComputedStyle(off).fontWeight },
    };
  })()`))

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('mine_top.png', Buffer.from(shot.data, 'base64'))

  // --- hover a cell ---
  const pos = await ev(`(() => {
    const cells = [...document.querySelectorAll('#pinyin td')];
    const find = t => cells.find(c => c.textContent.trim() === t);
    const ba = find('ba').getBoundingClientRect();
    return { x: ba.x + ba.width/2, y: ba.y + ba.height/2 };
  })()`)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y, buttons: 0 })
  await sleep(400)
  console.log('hover bg:', await ev(`(() => {
    const cells = [...document.querySelectorAll('#pinyin td')];
    const f = t => getComputedStyle(cells.find(c => c.textContent.trim() === t)).backgroundColor;
    return { ba: f('ba'), bai: f('bai'), pa: f('pa') };
  })()`))

  // --- click to open the tone player ---
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1, buttons: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1, buttons: 0 })
  await sleep(1500)
  console.log('player:', await ev(`(() => {
    const p = document.querySelector('.snd-player');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    const cards = [...p.querySelectorAll('.snd-player__card')];
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      cards: cards.length,
      layout: getComputedStyle(p.querySelector('.snd-player__row')).flexDirection,
      pinyin: cards.map(c => c.querySelector('.snd-player__pinyin').textContent),
      hanzi: cards.map(c => c.querySelector('.snd-player__hanzi').textContent),
      loaded: cards.map(c => c.classList.contains('is-loaded')) };
  })()`))

  // Every card must be a horizontal sibling with the speaker pinned top-right.
  console.log('card geometry:', await ev(`(() => {
    const cards = [...document.querySelectorAll('.snd-player__card')];
    return cards.map(c => {
      const r = c.getBoundingClientRect();
      const ic = c.querySelector('.snd-player__icon').getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y),
        iconRightGap: Math.round(r.right - ic.right), iconTopGap: Math.round(ic.top - r.top) };
    });
  })()`))
  console.log('pinyin above hanzi:', await ev(`(() => {
    const c = document.querySelector('.snd-player__card');
    const py = c.querySelector('.snd-player__pinyin').getBoundingClientRect();
    const hz = c.querySelector('.snd-player__hanzi').getBoundingClientRect();
    return { pinyinBottom: Math.round(py.bottom), hanziTop: Math.round(hz.top), ok: py.bottom <= hz.top };
  })()`))

  const shot2 = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('mine_player.png', Buffer.from(shot2.data, 'base64'))

  // The speaker glyph is an emoji now, not an <img>.
  console.log('player imgs:', await ev("document.querySelectorAll('.snd-player img').length"))
  console.log('player icon:', await ev(`(() => {
    const el = document.querySelector('.snd-player__icon');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { text: el.textContent.trim(), size: cs.fontSize, codePoint: el.textContent.trim().codePointAt(0).toString(16) };
  })()`))

  // --- the popup must stay anchored to its cell while the page scrolls ---
  const anchorDelta = (syl) => ev(`(() => {
    const cells = [...document.querySelectorAll('#pinyin td')];
    const c = cells.find(x => x.textContent.trim() === '${syl}');
    const p = document.querySelector('.snd-player');
    if (!c || !p) return null;
    const cr = c.getBoundingClientRect(), pr = p.getBoundingClientRect();
    return {
      gapX: Math.round(pr.left - cr.right),
      gapY: Math.round((pr.top + pr.height / 2) - (cr.top + cr.height / 2)),
    };
  })()`)
  const beforeScroll = await anchorDelta('ba')
  await ev('window.scrollBy(0, 320); true')
  await sleep(500)
  const afterScroll = await anchorDelta('ba')
  console.log('anchor before scroll:', beforeScroll)
  console.log('anchor after scroll :', afterScroll)
  console.log('scrollY now:', await ev('Math.round(window.scrollY)'))
  console.log('popup still anchored:', JSON.stringify(beforeScroll) === JSON.stringify(afterScroll))
  const shotScrolled = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('mine_scrolled.png', Buffer.from(shotScrolled.data, 'base64'))
  await ev('window.scrollTo(0, 0); true')
  await sleep(400)

  // --- click the first tone card and confirm audio decodes ---
  const audioInfo = await ev(`(async () => {
    document.querySelectorAll('.snd-player__card')[0].click();
    await new Promise(r => setTimeout(r, 1200));
    return { cards: document.querySelectorAll('.snd-player__card').length };
  })()`)
  console.log('clicked tone card:', audioInfo)

  // verify a known audio file actually loads over HTTP from our server
  const audioProbe = await ev(`(async () => {
    const res = await fetch('/audio/ba1.mp3');
    const buf = await res.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    return { status: res.status, bytes: buf.byteLength, duration: Math.round(decoded.duration * 1000) / 1000, rate: decoded.sampleRate };
  })()`)
  console.log('audio probe:', audioProbe)

  // With the 单击时 row gone, every cell click opens the tone popup.
  const daPos = await ev(`(() => { const cells=[...document.querySelectorAll('#pinyin td')]; const d=cells.find(c=>c.textContent.trim()==='da').getBoundingClientRect(); return {x:d.x+d.width/2,y:d.y+d.height/2}; })()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: daPos.x, y: daPos.y, button: 'left', clickCount: 1, buttons: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: daPos.x, y: daPos.y, button: 'left', clickCount: 1, buttons: 0 })
  await sleep(500)
  console.log('player opens on click:', await ev("!!document.querySelector('.snd-player')"))
  console.log('player tones after 2nd click:', await ev(
    "[...document.querySelectorAll('.snd-player__pinyin')].map(s => s.textContent)"))
  console.log('player hanzi after 2nd click:', await ev(
    "[...document.querySelectorAll('.snd-player__hanzi')].map(s => s.textContent)"))

  // --- 脏话/脏字 filter: no vulgar example character may reach the UI ---
  const VULGAR = ['操', '肏', '屄', '毴', '屌', '逼', '干', '嫖', '骚', '娼', '妓', '婊', '淫', '贱', '尻', '屎', '屁']
  const seen = []
  for (const syl of ['cao', 'bi', 'gan', 'piao', 'sao', 'kao', 'diao', 'niao', 'dan']) {
    const p = await ev(`(() => {
      const cells = [...document.querySelectorAll('#pinyin td')];
      const c = cells.find(x => x.textContent.trim() === '${syl}');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.x + r.width/2, y: r.y + r.height/2 };
    })()`)
    if (!p) { console.log(`  ${syl}: cell not in chart`); continue }
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 0 })
    await sleep(350)
    const cards = await ev(`[...document.querySelectorAll('.snd-player__card')].map(c =>
      c.querySelector('.snd-player__pinyin').textContent + '=' + c.querySelector('.snd-player__hanzi').textContent)`)
    seen.push(...cards)
    console.log(`  ${syl}: ${cards.join('  ')}`)
  }
  const offenders = seen.filter((s) => [...s].some((ch) => VULGAR.includes(ch)))
  console.log('vulgar characters in popups:', offenders.length ? offenders : 'none')

  // --- a tinted final plays, an untinted one (ong) stays inert ---
  for (const [syl, expected] of [['a', true], ['ong', false]]) {
    const fp = await ev(`(() => {
      const td = [...document.querySelectorAll('.finals-row td')].find(t => t.textContent.trim() === '${syl}');
      const r = td.getBoundingClientRect();
      return { x: r.x + r.width/2, y: r.y + r.height/2 };
    })()`)
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fp.x, y: fp.y, button: 'left', clickCount: 1, buttons: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fp.x, y: fp.y, button: 'left', clickCount: 1, buttons: 0 })
    await sleep(400)
    const open = await ev("!!document.querySelector('.snd-player')")
    console.log(`finals '${syl}' click -> popup ${open} (expected ${expected}) ${open === expected ? 'OK' : 'MISMATCH'}`)
    if (open) { await ev("document.body.click()"); await sleep(250) }
  }

  // --- popup must follow the chart's OWN horizontal scroll (overflow-x) and resize ---
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false })
  await sleep(500)
  const ap = await ev(`(() => {
    const c = [...document.querySelectorAll('#pinyin td')].find(x => x.textContent.trim() === 'ba');
    const r = c.getBoundingClientRect();
    return { x: r.x + r.width/2, y: r.y + r.height/2 };
  })()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: ap.x, y: ap.y, button: 'left', clickCount: 1, buttons: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ap.x, y: ap.y, button: 'left', clickCount: 1, buttons: 0 })
  await sleep(600)
  // Invariant: popup left edge tracks the cell's left edge, and the popup stays
  // vertically centred on the cell. Comparing raw gapY would be wrong, because
  // resizing reflows the table (thead font-size changes at <=980px) so the cell
  // itself changes height.
  const gap = `(() => {
    const p = document.querySelector('.snd-player');
    const c = [...document.querySelectorAll('#pinyin td')].find(x => x.textContent.trim() === 'ba');
    const pr = p.getBoundingClientRect(), cr = c.getBoundingClientRect();
    return {
      gapX: Math.round(pr.left - cr.left),
      centerDeltaY: Math.round((pr.top + pr.height/2) - (cr.top + cr.height/2)),
    };
  })()`
  const g0 = await ev(gap)
  await ev("document.querySelector('#pinyin').scrollLeft = 120")
  await sleep(450)
  const g1 = await ev(gap)
  await ev('window.scrollBy(0, 120)')
  await sleep(450)
  const g2 = await ev(gap)
  await send('Emulation.setDeviceMetricsOverride', { width: 1150, height: 700, deviceScaleFactor: 1, mobile: false })
  await sleep(600)
  const g3 = await ev(gap)
  const near = (a, b) => Math.abs(a.gapX - b.gapX) <= 1 && Math.abs(a.centerDeltaY - b.centerDeltaY) <= 1
  console.log('anchor gap  initial:', g0, '| inner h-scroll:', g1, '| page scroll:', g2, '| resize:', g3)
  console.log('popup followed in all cases:', near(g1, g0) && near(g2, g0) && near(g3, g0))

  console.log('console errors:', consoleErrors.length ? consoleErrors : 'none')
  ws.close(); chrome.kill(); process.exit(0)
}
main().catch(e => { console.error(e); chrome.kill(); process.exit(1) })
