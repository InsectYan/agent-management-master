# Unified docker compose entry (deploy/docker-compose.yml)
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ComposeArgs
)

$ErrorActionPreference = "Stop"
$DeployDir = Split-Path -Parent $PSScriptRoot
$ComposeFile = Join-Path $DeployDir "docker-compose.yml"
$ComposeDevFile = Join-Path $DeployDir "docker-compose.dev.yml"
$RepoRoot = Split-Path -Parent $DeployDir
$RootEnv = Join-Path $RepoRoot ".env"
$RootEnvExample = Join-Path $RepoRoot ".env.example"

if (-not (Test-Path -LiteralPath $ComposeFile)) {
  throw "Missing $ComposeFile"
}

if (-not (Test-Path -LiteralPath $RootEnv)) {
  if (Test-Path -LiteralPath $RootEnvExample) {
    Copy-Item $RootEnvExample $RootEnv
  } else {
    New-Item -ItemType File -Path $RootEnv -Force | Out-Null
  }
}

$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& docker version --format "{{.Server.Version}}" 2>&1 | Out-Null
$daemonOk = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $prevEap

if (-not $daemonOk) {
  Write-Host ""
  Write-Host "Cannot connect to Docker daemon." -ForegroundColor Red
  Write-Host "  Windows: start Docker Desktop, wait for Running, then retry agentm local." -ForegroundColor Yellow
  exit 1
}

$composeArgs = @("-f", $ComposeFile)
if ($env:AGENTM_DEV -eq "1" -and (Test-Path -LiteralPath $ComposeDevFile)) {
  $composeArgs += @("-f", $ComposeDevFile)
}

$ErrorActionPreference = "Continue"
& docker compose @composeArgs @ComposeArgs
$exitCode = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }
exit $exitCode
