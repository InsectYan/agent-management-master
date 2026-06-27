#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
MODE="${1:-host-ollama}"

bash deploy/scripts/compose.sh --profile local --profile ollama --profile postgres down -v
AGENTM_WAIT=1 bash deploy/scripts/start-local.sh "$MODE"

if [ "${SKIP_SMOKE:-0}" != "1" ]; then
  bash deploy/scripts/smoke-docker.sh
fi
