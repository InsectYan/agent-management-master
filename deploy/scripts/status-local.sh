#!/usr/bin/env bash
set -euo pipefail
echo "==> docker compose ps"
bash "$(dirname "$0")/compose.sh" --profile local --profile ollama --profile postgres ps
echo ""
echo "==> health"
curl -sf "http://127.0.0.1:3001/health" || echo "  server not reachable on :3001"
