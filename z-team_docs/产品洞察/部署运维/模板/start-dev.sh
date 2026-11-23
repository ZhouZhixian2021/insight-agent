#!/usr/bin/env bash
# 启动产品洞察的 Web 界面（macOS / Linux）。
#
# 用法：改下面两个路径，然后 ./start-dev.sh
#   ./start-dev.sh          默认 54512 端口
#   ./start-dev.sh 54520    换端口
#   BUILD=1 ./start-dev.sh  先重新构建再启动

set -euo pipefail

# 改成自己的路径
REPO="${REPO:-$HOME/code/insight-agent-dev}"
WORKSPACE="${WORKSPACE:-$HOME/code/insight}"
PORT="${1:-54512}"

BIN="$REPO/apps/cli/lib/bin.js"

if [ ! -d "$REPO" ]; then
  echo "找不到仓库目录：$REPO" >&2
  exit 1
fi

if [ "${BUILD:-0}" = "1" ] || [ ! -f "$BIN" ]; then
  echo '构建中（约 3 分钟）...'
  ( cd "$REPO" && pnpm run build:artifacts )
fi

export DSH_HOME="$REPO/.dsh-runtime"

cd "$WORKSPACE"
exec node "$BIN" web --port "$PORT"
