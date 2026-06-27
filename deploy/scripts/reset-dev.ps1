# Reset dev stack
param(
  [Parameter(Position = 0)]
  [ValidateSet("docker-ollama", "host-ollama", "full")]
  [string]$OllamaMode = "host-ollama"
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\..")

$Compose = Join-Path $PSScriptRoot "compose.ps1"
$profiles = @("--profile", "local", "--profile", "ollama", "--profile", "postgres")

Write-Host "==> docker compose down -v"
& $Compose @profiles down -v
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& (Join-Path $PSScriptRoot "start-local.ps1") -OllamaMode $OllamaMode -Wait
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($env:SKIP_SMOKE -ne "1") {
  Write-Host "==> smoke-docker"
  & (Join-Path $PSScriptRoot "smoke-docker.ps1")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
