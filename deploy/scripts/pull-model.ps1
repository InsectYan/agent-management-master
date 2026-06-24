# Pull OLLAMA_MODEL in agent-ollama container
$ErrorActionPreference = "Stop"

$running = docker ps --filter "name=agent-ollama" --filter "status=running" -q
if (-not $running) {
  Write-Host "agent-ollama is not running. Start with: agentm local" -ForegroundColor Yellow
  exit 1
}

$model = $env:OLLAMA_MODEL
if (-not $model) {
  $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) "config\.env.local"
  if (Test-Path $envFile) {
    $line = Get-Content $envFile | Where-Object { $_ -match '^OLLAMA_MODEL=' } | Select-Object -First 1
    if ($line) { $model = ($line -split '=', 2)[1].Trim() }
  }
}
if (-not $model) { $model = "qwen3.6:latest" }

Write-Host "==> docker exec agent-ollama ollama pull $model"
docker exec agent-ollama ollama pull $model
exit $LASTEXITCODE
