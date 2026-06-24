#!/usr/bin/env bash
set -euo pipefail
BASE="${SMOKE_BASE_URL:-http://127.0.0.1:3001}"
MAX_WAIT="${SMOKE_MAX_WAIT:-120}"
echo "==> wait $BASE/health max ${MAX_WAIT}s"
for i in $(seq 1 "$MAX_WAIT"); do
  if curl -sf "$BASE/health" | grep -q '"status":"ok"'; then
    echo "    health ok (${i}s)"
    exit 0
  fi
  sleep 1
done
echo "FAIL: health timeout"
exit 1
