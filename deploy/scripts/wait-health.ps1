param(
  [string]$Base = "http://127.0.0.1:3001",
  [int]$MaxWait = 120
)

Write-Host "==> wait $Base/health (max ${MaxWait}s)"
for ($i = 1; $i -le $MaxWait; $i++) {
  try {
    $r = Invoke-RestMethod -Uri "$Base/health" -TimeoutSec 3 -ErrorAction Stop
    if ($r.status -eq "ok") {
      Write-Host "    health ok (${i}s)"
      exit 0
    }
  } catch {
    # retry
  }
  Start-Sleep -Seconds 1
}
Write-Host "FAIL: health timeout" -ForegroundColor Red
exit 1
