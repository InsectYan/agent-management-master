#!/usr/bin/env bash
# Shared smoke entry (deploy/shared/scripts/smoke-agent.sh)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
exec bash "$ROOT/deploy/scripts/smoke-docker.sh" "$@"
