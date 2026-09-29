#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or is not on PATH." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop, then run this script again." >&2
  exit 1
fi

docker compose up -d --build

for _ in {1..40}; do
  if curl -fsS http://127.0.0.1:4387/api/health >/dev/null 2>&1; then
    echo "WReader is running at http://127.0.0.1:4387"
    exit 0
  fi
  sleep 1
done

echo "WReader container started, but health check did not pass yet." >&2
docker compose ps
exit 1
