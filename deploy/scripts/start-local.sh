#!/usr/bin/env bash
# Local stack launcher
set -euo pipefail
cd "$(dirname "$0")/../.."

MODE="${1:-host-ollama}"
DEV="${AGENTM_DEV:-0}"
WAIT="${AGENTM_WAIT:-0}"
SMOKE="${AGENTM_SMOKE:-0}"

[ ! -f .env ] && cp .env.example .env
[ ! -f deploy/config/.env.local ] && cp deploy/config/.env.local.example deploy/config/.env.local
mkdir -p data workspaces memory_files

export AGENTM_DEV="$DEV"
PROFILES=(--profile local)

case "$MODE" in
  docker-ollama)
    export OLLAMA_BASE_URL="http://ollama:11434/v1"
    PROFILES+=(--profile ollama)
    echo "==> compose up (local + ollama container)"
    ;;
  host-ollama)
    export OLLAMA_BASE_URL="http://host.docker.internal:11434/v1"
    echo "==> compose up (local + host Ollama)"
    ;;
  full)
    export OLLAMA_BASE_URL="http://host.docker.internal:11434/v1"
    PROFILES+=(--profile postgres)
    echo "==> compose up (local + postgres + host Ollama)"
    ;;
  *)
    echo "unknown mode: $MODE"
    exit 1
    ;;
esac

bash deploy/scripts/compose.sh "${PROFILES[@]}" up -d --build

if [ "$WAIT" = "1" ] || [ "$SMOKE" = "1" ]; then
  bash deploy/scripts/wait-health.sh
fi
if [ "$SMOKE" = "1" ]; then
  bash deploy/scripts/smoke-docker.sh
fi

echo ""
echo "Local stack started — http://localhost:4001/health"
