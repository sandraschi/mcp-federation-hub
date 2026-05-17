Param([switch]$Headless)

# --- SOTA Headless Standard ---
if ($Headless -and ($Host.UI.RawUI.WindowTitle -notmatch 'Hidden')) {
    Start-Process pwsh -ArgumentList '-NoProfile', '-File', $PSCommandPath, '-Headless' -WindowStyle Hidden
    exit
}
$WindowStyle = if ($Headless) { 'Hidden' } else { 'Normal' }
# ------------------------------

# Webapp Start - Standardized SOTA (Auto-Repaired V3)
$WebPort = 10856
$BackendPort = 10857
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Clear-Port {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 4 } | Select-Object -First 1
    if (-not $conn) { return $false }
    $pid = $conn.OwningProcess
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    $name = if ($proc) { $proc.ProcessName } else { "PID $pid" }
    Write-Host "Port $Port is held by $name (PID: $pid). Attempting to free it..." -ForegroundColor Yellow

    # Layer 1: Stop-Process (works for same-user, same-session)
    try { Stop-Process -Id $pid -Force -ErrorAction Stop; Start-Sleep 1; return $true } catch {}

    # Layer 2: taskkill /F (different privilege path, handles some SYSTEM orphans)
    try { taskkill /F /PID $pid 2>&1 | Out-Null; Start-Sleep 1; return $true } catch {}

    # Layer 3: CIM Win32_Process (handles orphaned session-1 processes with empty token)
    try {
        $cim = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $pid" -ErrorAction Stop
        if ($cim) { Invoke-CimMethod -InputObject $cim -MethodName Terminate -ErrorAction Stop | Out-Null; Start-Sleep 1; return $true }
    } catch {}

    Write-Host "  Could not free port $Port. Run as Admin: taskkill /F /PID $pid" -ForegroundColor Red
    return $false
}

# 1. Clear ports
Write-Host "`n=== Federation Hub Webapp ===" -ForegroundColor Cyan
Write-Host "Ports: backend :$BackendPort | frontend :$WebPort`n" -ForegroundColor Gray

Clear-Port $WebPort | Out-Null

# 2. Setup
Set-Location $PSScriptRoot
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies (npm install)..." -ForegroundColor Cyan
    npm install
}

# 3. Backend: check if bridge is already running
$HealthUrl = "http://127.0.0.1:$BackendPort/health"
$bridgeUp = $false
try {
    $r = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $bridgeUp = $true }
} catch { }

if ($bridgeUp) {
    Write-Host "`nBackend: ALREADY RUNNING (NSSM service or previous instance) on :$BackendPort" -ForegroundColor Green
} else {
    # Clear port for starting fresh
    if (-not (Clear-Port $BackendPort)) {
        Write-Warning "Port :$BackendPort is blocked. Vite will proxy to it but the backend won't start until the blocker is removed."
    }

    Write-Host "`nBackend: Starting bridge on :$BackendPort ..." -ForegroundColor Cyan
    $BridgeRoot = Join-Path $ProjectRoot "bridge"
    $backendCmd = "uv run python -m uvicorn app.main:app --host 127.0.0.1 --port $BackendPort --log-level info"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WorkingDirectory $BridgeRoot -WindowStyle $WindowStyle

    Write-Host "Backend: Waiting for health check (max 45s) ..." -ForegroundColor DarkGray
    for ($i = 0; $i -lt 45; $i++) {
        try {
            $r = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { $bridgeUp = $true; break }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if ($bridgeUp) { Write-Host "Backend: OK." -ForegroundColor Green }
    else { Write-Warning "Backend: Not responding within 45s. Check the bridge PowerShell window for errors." }
}

# 4. Frontend: check if Vite is already up
$WebUrl = "http://127.0.0.1:$WebPort/"
$viteUp = $false
try {
    $r = Invoke-WebRequest -Uri $WebUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    if ($r.StatusCode -eq 200) { $viteUp = $true }
} catch { }

if ($viteUp) {
    Write-Host "Frontend: ALREADY RUNNING on :$WebPort" -ForegroundColor Green
    Write-Host "Frontend: Open $WebUrl in your browser." -ForegroundColor Gray
    exit 0
}

# 5. Start Vite
Write-Host "Frontend: Starting Vite on :$WebPort ..." -ForegroundColor Cyan
$pollAndOpen = "for (`$i = 0; `$i -lt 60; `$i++) { try { `$null=Invoke-WebRequest -Uri '$WebUrl' -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop; Start-Process '$WebUrl'; exit } catch { Start-Sleep -Seconds 1 } }"
Start-Process powershell -ArgumentList "-NoProfile", "-WindowStyle", "Hidden", "-Command", $pollAndOpen

Write-Host "Frontend: Browser will open automatically when ready." -ForegroundColor Gray
npm run dev -- --port $WebPort --host
