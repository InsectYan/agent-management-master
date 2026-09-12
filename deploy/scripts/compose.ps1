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

function Ensure-DockerOnPath {
  if (Get-Command docker -ErrorAction SilentlyContinue) { return $true }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\resources\bin"),
    (Join-Path $env:ProgramFiles "Docker\Docker\resources\bin")
  )
  foreach ($dir in $candidates) {
    if (Test-Path -LiteralPath (Join-Path $dir "docker.exe")) {
      $env:PATH = "$dir;$env:PATH"
      return $true
    }
  }
  return $false
}

$dockerFound = Ensure-DockerOnPath
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
if ($dockerFound) {
  & docker version --format "{{.Server.Version}}" 2>&1 | Out-Null
}
$daemonOk = ($dockerFound -and $LASTEXITCODE -eq 0)
$ErrorActionPreference = $prevEap

if (-not $daemonOk) {
  Write-Host ""
  if (-not $dockerFound) {
    Write-Host "docker CLI not found on PATH." -ForegroundColor Red
    Write-Host "  Install Docker Desktop, then close this terminal and open a new one." -ForegroundColor Yellow
  } else {
    Write-Host "Cannot connect to Docker daemon." -ForegroundColor Red
    Write-Host "  Windows: start Docker Desktop, wait for Running, then retry agentm local." -ForegroundColor Yellow
  }
  exit 1
}

# NOTE: must not use $composeArgs — PowerShell names are case-insensitive and would overwrite $ComposeArgs param
$fileArgs = @('--env-file', $RootEnv, '-f', $ComposeFile)
if ($env:AGENTM_DEV -eq '1' -and (Test-Path -LiteralPath $ComposeDevFile)) {
  $fileArgs += @('-f', $ComposeDevFile)
}

$ErrorActionPreference = 'Continue'
$finalArgs = $fileArgs + @($ComposeArgs)
& docker compose @finalArgs
$exitCode = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }
exit $exitCode
