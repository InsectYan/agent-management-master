# Docker smoke (PowerShell, no Git Bash required)
param(
  [string]$Base = "http://127.0.0.1:3001",
  [int]$MaxWait = 120
)

$ErrorActionPreference = "Stop"
$Root = Join-Path $PSScriptRoot "..\.."

& (Join-Path $PSScriptRoot "wait-health.ps1") -Base $Base -MaxWait $MaxWait
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> ready"
$r = Invoke-RestMethod -Uri "$Base/ready" -TimeoutSec 10
if ($r.status -ne "ready") { throw "ready failed: $($r | ConvertTo-Json -Compress)" }
Write-Host "    ready ok"

Write-Host "==> schemes / memory / llm"
Invoke-RestMethod -Uri "$Base/api/schemes" -TimeoutSec 10 | Out-Null
Invoke-RestMethod -Uri "$Base/api/memory" -TimeoutSec 10 | Out-Null
Invoke-RestMethod -Uri "$Base/api/llm/profiles" -TimeoutSec 10 | Out-Null
Write-Host "    platform APIs ok"

Write-Host "==> npm selftest:all"
Push-Location $Root
$env:BASE_URL = $Base
npm run selftest:all
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { exit $code }

Write-Host "PASS smoke-docker"
