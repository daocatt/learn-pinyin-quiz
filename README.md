# Chinese Pinyin Study & Quiz

An interactive web app to learn and test Mandarin Chinese Pinyin, tones, and pronunciation through customized quizzes.

**中文文档 → [README.zh-CN.md](README.zh-CN.md)**

---

## What it does

Two pages, no login, no accounts, no external services.

### Pinyin chart — `/`

A full syllable grid: **23 initial rows × 35 finals**, with the finals grouped into
**A / O / E / I / U / Ü** and thicker dividers between the groups.

Click any syllable and a player opens with all **four tones** — the pinyin, an
example character for each tone, and a play button. Cells whose spelling doesn't
follow the regular pattern are set in bold so learners notice them.

### Quiz — `/quiz`

A round is **20 questions**. Each question plays a syllable twice, then a 组词
(a two-character word containing it), and asks which of the four tones you heard.

- **The answer is never in the page.** The browser sends your choice and the
  server grades it, so no amount of DOM-poking reveals the tone.
- The 组词 is picked so that its **first** syllable is the one being asked about,
  and every syllable in it has a recording — which is why the word can be played
  by chaining clips, and why the pinyin on the card always matches the audio.
- **Wrong answers come back.** The next round folds in the items you missed,
  flagged as 重做; redeeming one fires confetti.
- **History is per browser.** Each visitor gets an opaque cookie, so on a shared
  deployment your 重做 list is your own — nobody inherits your mistakes, and
  nobody can read or grade your round.
- The card is laid out to **fit a single phone screen with no scrolling**
  (verified at 360×740 up to 430×932).

## Quick start

Requires **Node 24+** — the server uses the built-in `node:sqlite`, so there are
no native dependencies to compile.

```bash
npm install
npm run dev
```

Open **http://localhost:5173**.

That's the whole setup. No database to create, no environment variables, no API
keys. Quiz history is written to `data/quiz.db`, created on first use.

> Port 5173 already taken? `npm run dev -- --port 5188`.

### Other commands

```bash
npm run build       # production bundle -> dist/client
npm start           # serve the built bundle on :3000
npm run typecheck   # tsc --noEmit
```

## Testing

Three suites. Two drive a real Chrome over the DevTools Protocol; all three
expect a server to already be running.

```bash
npm run dev            # terminal 1

node test.mjs          # terminal 2 — the chart
node quiz_test.mjs     #              the quiz
node session_test.mjs  #              that two browsers stay separate
```

```bash
# against a production build instead
npm start
URL=http://localhost:3100/ node test.mjs
BASE=http://localhost:3100 node quiz_test.mjs
BASE=http://localhost:3100 node session_test.mjs
```

`quiz_test.mjs` reads the correct answer out of `data/quiz.db` — the same file
the server writes — instead of trusting the page, so a bug can't pass by
agreeing with itself. `test.mjs` checks real geometry: cell alignment, popup
anchoring under scroll and resize, and glyph centring measured from `Range`
midpoints. `session_test.mjs` needs no browser: it posts as two cookie jars and
asserts that one learner's mistakes never show up as the other's 重做, and that
neither can grade or read the other's round.

## Docker

```bash
docker network create caddy_net          # if you don't already have one

mkdir -p ./quiz && chown -R 1001:1001 ./quiz
cp .env.example .env                     # point DATA_HOST_PATH at ./quiz

docker compose up -d --build
```

The container runs as **uid 1001**, so the mounted data directory must be owned
by it. If it isn't, the entrypoint exits immediately and prints the exact
`chown` command to run — SQLite's own error for that situation is much harder
to read.

The published port is bound to `127.0.0.1` only. Put a reverse proxy in front;
`docker-compose.yml` has a ready-to-paste Caddy snippet in its header comment.

## Project layout

```
src/
  client/          React UI
    components/    PinyinChart, SoundPlayer, Quiz, Confetti
    lib/           router, pinyin helpers, quiz audio scheduler
  server/          Hono app; quiz rounds persisted in SQLite
  shared/          chart grid, generated tables, quiz types
public/
  audio/           1620 per-syllable recordings, named {syllable}{tone}.mp3
  robots.txt
*.py               data-build scripts (see below)
data/              source corpora those scripts read
```

### How the audio is played

Every syllable+tone is its own mp3. The quiz schedules them with the **Web Audio
API** rather than `<audio>` elements, which buys two things:

- Each clip's lead-in and tail silence is **measured per clip** (they vary
  80–300 ms, so a constant trim would clip final consonants) and skipped
  precisely, instead of hoping the browser's element chaining lines up.
- The two halves of a 组词 are scheduled with a **small deliberate overlap**, so
  the word sounds linked rather than stitched together at a seam.

> The recordings were collected from the internet and are bundled here so the app
> works out of the box. They are not produced by this project.

## How the generated tables are built

`src/shared/chart-data.ts`, `hanzi.ts` and `words.ts` are **generated** — each
says so at the top. Don't hand-edit them.

```bash
python3 build_hanzi.py     # -> src/shared/hanzi.ts  (example character per syllable+tone)
python3 build_words.py     # -> src/shared/words.ts  (组词 for each quiz item)
```

Both read the corpora in `data/` — they download nothing — and both import
`blocked.py`, the **single source of truth** for the no-profanity rule. A
character listed there can never reach the UI, however high the frequency tables
rank it.

Sources and licences:

| file | source | licence |
| --- | --- | --- |
| `data/cedict.txt` | [CC-CEDICT](https://cc-cedict.org/) | CC BY-SA 4.0 |
| `data/jieba_dict.txt` | [jieba](https://github.com/fxsjy/jieba) | MIT |
| `data/ph.json` | [guoyunhe/pinyin-json](https://github.com/guoyunhe/pinyin-json) | MIT |
| `data/tghz.txt` | [mozillazg/pinyin-data](https://github.com/mozillazg/pinyin-data) | MIT |

## Notes

- The UI is in Chinese and `index.html` is `lang="zh-CN"`.
- It was built as a private study tool, so every response carries
  `X-Robots-Tag: noindex`, and there is a matching `robots.txt` and
  `<meta name="robots">`. Remove all three if you want it indexed.
