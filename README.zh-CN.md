# Chinese Pinyin Study & Quiz

一个交互式网页应用，通过定制测验学习和测试汉语拼音、声调与发音。

**English → [README.md](README.md)**

---

## 它有什么

两个页面，没有登录、没有账号、不依赖任何外部服务。

### 拼音图 — `/`

一张完整的音节表：**23 行声母 × 35 列韵母**，韵母按 **A / O / E / I / U / Ü**
分组，组与组之间有加粗分隔线。

点击任意音节会弹出播放器，展示**四个声调**——每个声调都有拼音、例字和播放按钮。
拼写不遵循常规规则的特殊音节用加粗标出，提醒学习者注意。

### 测验 — `/quiz`

一轮 **20 题**。每题先播放音节两遍，再播放包含它的**组词**，然后问你听到的是四个
声调中的哪一个。

- **答案从不出现在页面里。** 浏览器只提交你选的那个声调，由服务端判分，所以在
  DOM 里怎么翻都翻不出答案。
- 组词是挑过的：它的**第一个**音节就是被问的那个音节，而且组词里每个音节都有录音
  ——这既保证了卡片上的拼音和音频一致，也意味着这个组词可以靠拼接单音节录音播放。
- **答错的题会回来。** 下一轮会把上一轮做错的题折进来并标记为「重做」，重做答对时
  会放彩纸。
- 卡片布局**在手机上一屏放得下、不需要滚动**（在 360×740 到 430×932 之间都验过）。

## 快速开始

需要 **Node 24+**——服务端用的是 Node 内置的 `node:sqlite`，没有任何需要编译的原生
依赖。

```bash
npm install
npm run dev
```

打开 **http://localhost:5173**。

以上就是全部步骤。不用建数据库、不用配环境变量、不用申请密钥。测验历史写在
`data/quiz.db`，首次使用时自动创建。

> 5173 端口被占了？用 `npm run dev -- --port 5188`。

### 其他命令

```bash
npm run build       # 生产打包 -> dist/client
npm start           # 用打包产物起服务，端口 3000
npm run typecheck   # tsc --noEmit
```

## 测试

两套端到端测试通过 DevTools Protocol 驱动真实的 Chrome，都需要先有一个服务在跑。

```bash
npm run dev            # 终端 1

node test.mjs          # 终端 2 —— 测拼音图
node quiz_test.mjs     #           测测验
```

```bash
# 也可以对着生产构建跑
npm start
URL=http://localhost:3100/ node test.mjs
BASE=http://localhost:3100 node quiz_test.mjs
```

`quiz_test.mjs` 从 `data/quiz.db`（也就是服务端写的那同一个文件）里读正确答案，
而不是相信页面——这样就算代码有 bug，也不可能因为「自说自话」而蒙混过关。
`test.mjs` 校验的是真实几何：单元格对齐、滚动与缩放时气泡的锚定位置，以及用
`Range` 中点量出来的字形居中。

## Docker

```bash
docker network create caddy_net          # 如果还没有反代网络

mkdir -p ./quiz && chown -R 1001:1001 ./quiz
cp .env.example .env                     # 把 DATA_HOST_PATH 指到 ./quiz

docker compose up -d --build
```

容器以 **uid 1001** 运行，所以挂载的数据目录必须属于它。如果不属于，entrypoint
会立刻退出并打印出该执行的 `chown` 命令——SQLite 自己在这种情况下报的错要难懂得多。

对外只绑定 `127.0.0.1`，前面要放反向代理；`docker-compose.yml` 头部的注释里有可以
直接粘贴的 Caddy 配置。

## 目录结构

```
src/
  client/          React 界面
    components/    PinyinChart, SoundPlayer, Quiz, Confetti
    lib/           路由、拼音辅助函数、测验音频调度器
  server/          Hono 应用；测验轮次存在 SQLite 里
  shared/          拼音表网格、生成的表、测验类型
public/
  audio/           1620 个单音节录音，命名 {音节}{声调}.mp3
  robots.txt
*.py               数据构建脚本（见下）
data/              这些脚本读取的原始语料
```

### 音频是怎么播的

每个「音节+声调」都是独立的 mp3。测验用 **Web Audio API** 调度它们，而不是
`<audio>` 元素，换来两件事：

- 每个音频的**首尾静音是逐条测量的**（长短不一，在 80–300 ms 之间，所以固定裁剪会
  削掉韵尾辅音），然后精确跳过，而不是指望浏览器的元素串联能对齐。
- 组词的两个音节之间安排了一点**刻意的重叠**，让它听起来是连读的，而不是在接缝处
  拼接的。

> 录音是从网络上收集的，打包进来是为了让应用开箱即用；并非本项目录制。

## 生成的表是怎么来的

`src/shared/chart-data.ts`、`hanzi.ts` 和 `words.ts` 都是**生成**的——每个文件开头
都写了这一点，不要手改。

```bash
python3 build_hanzi.py     # -> src/shared/hanzi.ts  每个音节+声调的例字
python3 build_words.py     # -> src/shared/words.ts  每个测验项的组词
```

两个脚本都读 `data/` 里的语料（不会联网下载），也都 import `blocked.py`——那是
「禁止脏话脏字」这条内容规则的**唯一事实来源**。只要某个字在里面列着，无论词频表
把它排得多靠前，它都不可能出现在界面上。

数据来源与许可：

| 文件 | 来源 | 许可 |
| --- | --- | --- |
| `data/cedict.txt` | [CC-CEDICT](https://cc-cedict.org/) | CC BY-SA 4.0 |
| `data/jieba_dict.txt` | [jieba](https://github.com/fxsjy/jieba) | MIT |
| `data/ph.json` | [guoyunhe/pinyin-json](https://github.com/guoyunhe/pinyin-json) | MIT |
| `data/tghz.txt` | [mozillazg/pinyin-data](https://github.com/mozillazg/pinyin-data) | MIT |

## 说明

- 界面是中文的，`index.html` 标注 `lang="zh-CN"`。
- 它一开始是当私人学习工具做的，所以每个响应都带 `X-Robots-Tag: noindex`，并且有
  对应的 `robots.txt` 和 `<meta name="robots">`。想被搜索引擎收录就把这三处一起去掉。
