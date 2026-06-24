#!/usr/bin/env bash
# Unified docker compose entry (deploy/docker-compose.yml)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
COMPOSE_DEV="$DEPLOY_DIR/docker-compose.dev.yml"

if [ ! -f "$REPO_ROOT/.env" ]; then
  if [ -f "$REPO_ROOT/.env.example" ]; then
    cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
  else
    touch "$REPO_ROOT/.env"
  fi
fi

ARGS=(-f "$COMPOSE_FILE")
if [ "${AGENTM_DEV:-0}" = "1" ] && [ -f "$COMPOSE_DEV" ]; then
  ARGS+=(-f "$COMPOSE_DEV")
fi

exec docker compose "${ARGS[@]}" "$@"
