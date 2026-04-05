# Webapp Start - Standardized SOTA (Auto-Repaired V2.5)
$WebPort = 10856
$BackendPort = 10857
$ProjectRoot = Split-Path -Parent $PSScriptRoot

# 1. Kill any process squatting on the ports
Write-Host "Checking for port squatters on $WebPort and $BackendPort..." -ForegroundColor Yellow
$pids = Get-NetTCPConnection -LocalPort $WebPort, $BackendPort -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 4 } | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $pids) {
    Write-Host "Found squatter (PID: $p). Terminating..." -ForegroundColor Red
    try { Stop-Process -Id $p -Force -ErrorAction Stop } catch { Write-Host "Warning: Could not terminate PID $p." -ForegroundColor Gray }
}

# 2. Setup
Set-Location $PSScriptRoot
if (-not (Test-Path "node_modules")) { npm install }

# 3. Start the Python backend (Federation Bridge in bridge/)
Write-Host "Starting Python backend on port $BackendPort ..." -ForegroundColor Cyan
$BridgeRoot = Join-Path $ProjectRoot "bridge"
$backendCmd = "uv run python -m uvicorn app.main:app --host 127.0.0.1 --port $BackendPort --log-level info"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WorkingDirectory $BridgeRoot -WindowStyle Normal

# 3b. Wait for bridge (Vite proxies /api to this port â€” avoid empty dashboard on slow cold start)
$HealthUrl = "http://127.0.0.1:$BackendPort/health"
Write-Host "Waiting for bridge at $HealthUrl (max 45s) ..." -ForegroundColor DarkGray
$bridgeUp = $false
for ($i = 0; $i -lt 45; $i++) {
    try {
        $r = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $bridgeUp = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
}
if (-not $bridgeUp) {
    Write-Warning "Bridge did not respond yet. Open the bridge PowerShell window for errors. UI will start anyway."
} else {
    Write-Host "Bridge OK." -ForegroundColor Green
}

# 4. Run server (Vite dev). Proxy in vite.config.ts forwards /api (and /health) to 127.0.0.1:$BackendPort.
Write-Host "Starting Vite frontend on port $WebPort ..." -ForegroundColor Green

# 4b. Launch background task to open browser once frontend is ready (Auto-opened by Antigravity)
$frontendUrl = "http://127.0.0.1:$WebPort/"
$pollAndOpen = "for (` = 0; ` -lt 60; `++) { try { ` = Invoke-WebRequest -Uri '`' -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop; Start-Process '`'; exit } catch { Start-Sleep -Seconds 1 } }"
Start-Process powershell -ArgumentList "-NoProfile", "-WindowStyle", "Hidden", "-Command", $pollAndOpen

Write-Host "Browser will open automatically when Vite is ready." -ForegroundColor Gray
npm run dev -- --port $WebPort --host


