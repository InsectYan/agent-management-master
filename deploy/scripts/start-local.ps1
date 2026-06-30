# Local stack launcher
param(
  [Parameter(Position = 0)]
  [ValidateSet("docker-ollama", "host-ollama", "full")]
  [string]$OllamaMode = "host-ollama",
  [switch]$Dev,
  [switch]$Wait,
  [switch]$Smoke
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\..")

$RootEnv = Join-Path (Get-Location) ".env"
$RootEnvExample = Join-Path (Get-Location) ".env.example"
if (-not (Test-Path $RootEnv)) {
  if (-not (Test-Path $RootEnvExample)) { throw "Missing .env.example" }
  Copy-Item $RootEnvExample $RootEnv
  Write-Host "==> created .env from .env.example"
}

$DeployEnvLocal = Join-Path "deploy" "config\.env.local"
$DeployEnvExample = Join-Path "deploy" "config\.env.local.example"
if (-not (Test-Path $DeployEnvLocal)) {
  Copy-Item $DeployEnvExample $DeployEnvLocal
  Write-Host "==> created deploy/config/.env.local"
}

@("data", "workspaces", "memory_files") | ForEach-Object {
  $d = Join-Path (Get-Location) $_
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null }
}

if ($Dev) { $env:AGENTM_DEV = "1" } else { Remove-Item Env:AGENTM_DEV -ErrorAction SilentlyContinue }

$Compose = Join-Path $PSScriptRoot "compose.ps1"

switch ($OllamaMode) {
  "docker-ollama" {
    $env:OLLAMA_BASE_URL = "http://ollama:11434/v1"
    Write-Host "==> compose up (local + ollama container$(if ($Dev) { ' + dev' }))"
    & $Compose '--profile' 'local' '--profile' 'ollama' 'up' '-d' '--build'
  }
  "host-ollama" {
    $env:OLLAMA_BASE_URL = "http://host.docker.internal:11434/v1"
    Write-Host "==> compose up (local + host Ollama$(if ($Dev) { ' + dev' }))"
    & $Compose '--profile' 'local' 'up' '-d' '--build'
  }
  "full" {
    $env:OLLAMA_BASE_URL = "http://host.docker.internal:11434/v1"
    Write-Host "==> compose up (local + postgres + host Ollama$(if ($Dev) { ' + dev' }))"
    & $Compose '--profile' 'local' '--profile' 'postgres' 'up' '-d' '--build'
  }
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($Wait -or $Smoke) {
  & (Join-Path $PSScriptRoot "wait-health.ps1")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($Smoke) {
  & (Join-Path $PSScriptRoot "smoke-docker.ps1")
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host ""
Write-Host "Local stack started"
Write-Host "  Server    http://localhost:4001/health"
Write-Host "  Ready     http://localhost:4001/ready"
if ($OllamaMode -eq "full") {
  $pgPort = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { "5500" }
  Write-Host "  Postgres  localhost:$pgPort"
}
if ($OllamaMode -eq "docker-ollama") {
  Write-Host "  Ollama    http://localhost:11434  (agentm local:pull-model)"
} else {
  Write-Host "  Ollama    host.docker.internal:11434  (本机需已运行 ollama serve)"
}
if ($Dev) { Write-Host "  Dev mode  plugins/ mounted read-write" }
Write-Host ""
Write-Host "Status: agentm local:status | Stop: agentm local:down"
