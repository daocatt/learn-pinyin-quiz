#!/bin/sh
set -e

# 题库数据库落在挂载卷上。最常见的坑是宿主机 bind mount：目录属 root，而容器以
# uid 1001 运行，SQLite 建不出 data/quiz.db，服务在启动时就报一个很难懂的错。
# 这里提前失败，并把修复命令直接打出来。
mkdir -p data
if [ ! -w data ]; then
  echo "ERROR: /app/data 对 uid $(id -u) 不可写。" >&2
  echo "       在宿主机上修复：mkdir -p <宿主机数据目录> && chown -R 1001:1001 <宿主机数据目录>" >&2
  exit 1
fi

echo "拼音学习图 启动中（端口 ${PORT:-3000}）..."
exec node src/server/serve.ts
