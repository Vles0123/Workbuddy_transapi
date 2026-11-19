#!/bin/bash
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo '请先安装 Node.js 22+，并在此目录运行 npm ci --ignore-scripts'; exit 1; }
command -v docker >/dev/null || { echo '请先安装并打开 Docker Desktop'; exit 1; }
[ -d node_modules ] || npm ci --ignore-scripts --no-audit --no-fund
node scripts/init-runtime.mjs
if [ "$(uname -s)" = Darwin ]; then
  if ! docker info >/dev/null 2>&1; then
    open -a Docker
    for attempt in {1..60}; do docker info >/dev/null 2>&1 && break; sleep 1; done
  fi
  node host-sync.mjs --once
  node scripts/launch-sync.mjs install
fi
docker compose up -d --build
echo 'API: http://127.0.0.1:3081/v1; 密钥位于 runtime/data/api-key'
