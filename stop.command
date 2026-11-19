#!/bin/bash
set -e
cd "$(dirname "$0")"
docker compose stop
if [ "$(uname -s)" = Darwin ]; then node scripts/launch-sync.mjs stop; fi
echo '容器和账号同步已停止，凭据仍保存在本机 runtime 中。'
