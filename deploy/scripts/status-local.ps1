# Show local Docker stack status
$ErrorActionPreference = "Continue"

Write-Host "==> docker compose ps"
& (Join-Path $PSScriptRoot "compose.ps1") --profile local --profile ollama --profile postgres ps

Write-Host ""
Write-Host "==> health probe"
try {
  $h = Invoke-RestMethod -Uri "http://127.0.0.1:3001/health" -TimeoutSec 3
  Write-Host ($h | ConvertTo-Json -Compress)
} catch {
  Write-Host "  server not reachable on :3001" -ForegroundColor Yellow
}
