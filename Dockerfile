# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# 拼音学习图 —— 生产镜像
#
# 与 panel-roomly 的差异：那边是 Next.js standalone 打包产物，这边不是。本项目的
# 服务端不经过打包，直接由 Node 24 在加载时擦除类型后运行 src/server/serve.ts，
# 所以镜像里放的是「源码 + 构建好的前端 + 运行期依赖」。
#
# 运行期只需要两个依赖（hono、@hono/node-server）；vite / tailwindcss /
# typescript 只在构建期用得到，靠 prod-deps 阶段排除掉。
# ---------------------------------------------------------------------------

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Vite 会把 public/ 整个复制进 dist/client，那样 75 MB 的音节录音会在镜像里存两份。
# 服务端是从 public/ 直接提供 /audio/* 的，所以把这份重复的删掉。
RUN npm run build && rm -rf dist/client/audio

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs pinyin

# package.json 是必需的：它带着 "type": "module"，Node 靠这个字段决定把 .ts
# 服务端文件按 ESM 还是 CJS 加载，漏掉会直接启动失败。
COPY --chown=pinyin:nodejs package.json ./package.json
COPY --from=prod-deps --chown=pinyin:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=pinyin:nodejs /app/src ./src
COPY --from=builder --chown=pinyin:nodejs /app/public ./public
COPY --from=builder --chown=pinyin:nodejs /app/dist/client ./dist/client

# 测验题库写在这里，compose 会用卷覆盖它。
RUN mkdir -p /app/data && chown pinyin:nodejs /app/data

COPY --chown=pinyin:nodejs docker-entrypoint.sh ./docker-entrypoint.sh

USER pinyin

EXPOSE 3000

# 服务端调用的是 server.listen(port, undefined, ...)，即监听全部网卡，端口映射
# 才能把流量送进来。
ENTRYPOINT ["sh", "docker-entrypoint.sh"]
