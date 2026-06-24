#!/usr/bin/env bash
set -euo pipefail
MODEL="${OLLAMA_MODEL:-}"
if [ -z "$MODEL" ] && [ -f deploy/config/.env.local ]; then
  MODEL="$(grep -E '^OLLAMA_MODEL=' deploy/config/.env.local | head -1 | cut -d= -f2- | tr -d '\r')"
fi
MODEL="${MODEL:-qwen3.6:latest}"
echo "==> docker exec agent-ollama ollama pull $MODEL"
docker exec agent-ollama ollama pull "$MODEL"
