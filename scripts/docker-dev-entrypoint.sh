#!/bin/sh
set -eu

lock_hash="$(sha256sum package-lock.json | cut -d ' ' -f 1)"
stamp_file="node_modules/.wreader-package-lock.sha256"

if [ ! -f "$stamp_file" ] || [ "$(cat "$stamp_file")" != "$lock_hash" ]; then
  echo "Synchronizing container dependencies with package-lock.json..."
  npm ci --no-audit --no-fund
  printf '%s\n' "$lock_hash" > "$stamp_file"
fi

exec npm run dev
