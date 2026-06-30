#!/usr/bin/env bash
# agent-management-master Docker smoke (no browser)
set -euo pipefail
BASE="${SMOKE_BASE_URL:-http://localhost:4001}"
MAX_WAIT="${SMOKE_MAX_WAIT:-120}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "==> wait health ($BASE) max ${MAX_WAIT}s"
for i in $(seq 1 "$MAX_WAIT"); do
  if curl -sf "$BASE/health" | grep -q '"status":"ok"'; then
    echo "    health ok (${i}s)"
    break
  fi
  if [ "$i" -eq "$MAX_WAIT" ]; then
    echo "FAIL: health timeout"
    curl -s "$BASE/health" || true
    exit 1
  fi
  sleep 1
done

echo "==> ready"
curl -sf "$BASE/ready" | grep -q '"status":"ready"' && echo "    ready ok"

echo "==> schemes"
curl -sf "$BASE/api/schemes" | grep -q '"schemes"' && echo "    schemes ok"

echo "==> llm profiles"
curl -sf "$BASE/api/llm/profiles" | grep -q 'profiles' && echo "    llm profiles ok"

echo "==> memory"
curl -sf "$BASE/api/memory" | grep -q 'skills' && echo "    memory ok"

echo "==> npm selftest:all"
cd "$ROOT"
BASE_URL="$BASE" npm run selftest:all

echo "PASS smoke-docker"
