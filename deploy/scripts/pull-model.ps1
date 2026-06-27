# Pull OLLAMA_MODEL — 优先 Docker 容器，否则本机 ollama CLI
$ErrorActionPreference = "Stop"

$model = $env:OLLAMA_MODEL
if (-not $model) {
  $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) "config\.env.local"
  if (Test-Path $envFile) {
    $line = Get-Content $envFile | Where-Object { $_ -match '^OLLAMA_MODEL=' } | Select-Object -First 1
    if ($line) { $model = ($line -split '=', 2)[1].Trim() }
  }
}
if (-not $model) { $model = "qwen3.6:latest" }

$running = docker ps --filter "name=agent-ollama" --filter "status=running" -q
if ($running) {
  Write-Host "==> docker exec agent-ollama ollama pull $model"
  docker exec agent-ollama ollama pull $model
  exit $LASTEXITCODE
}

$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
if ($ollamaCmd) {
  Write-Host "==> ollama pull $model  (host)"
  & ollama pull $model
  exit $LASTEXITCODE
}

Write-Host "No agent-ollama container and no host ollama CLI." -ForegroundColor Yellow
Write-Host "  Start host Ollama, or: agentm local:docker-ollama" -ForegroundColor Yellow
exit 1
