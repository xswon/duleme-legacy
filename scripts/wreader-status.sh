#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose ps

if curl -fsS http://127.0.0.1:4387/api/health >/dev/null 2>&1; then
  echo "Health check: ok"
  echo "URL: http://127.0.0.1:4387"
else
  echo "Health check: failed"
  exit 1
fi
