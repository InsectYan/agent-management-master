#!/usr/bin/env bash
set -euo pipefail
MODEL="${OLLAMA_MODEL:-}"
if [ -z "$MODEL" ] && [ -f deploy/config/.env.local ]; then
  MODEL="$(grep -E '^OLLAMA_MODEL=' deploy/config/.env.local | head -1 | cut -d= -f2- | tr -d '\r')"
fi
MODEL="${MODEL:-qwen3.6:latest}"

if docker ps --filter "name=agent-ollama" --filter "status=running" -q | grep -q .; then
  echo "==> docker exec agent-ollama ollama pull $MODEL"
  exec docker exec agent-ollama ollama pull "$MODEL"
fi

if command -v ollama >/dev/null 2>&1; then
  echo "==> ollama pull $MODEL  (host)"
  exec ollama pull "$MODEL"
fi

echo "No agent-ollama container and no host ollama CLI."
echo "  Start host Ollama, or: agentm local:docker-ollama"
exit 1
