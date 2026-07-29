Param([switch]$Headless)

# --- SOTA Headless Standard ---
if ($Headless -and ($Host.UI.RawUI.WindowTitle -notmatch 'Hidden')) {
    Start-Process pwsh -ArgumentList '-NoProfile', '-File', $PSCommandPath, '-Headless' -WindowStyle Hidden
    exit
}
$WindowStyle = if ($Headless) { 'Hidden' } else { 'Normal' }
# ------------------------------

$BridgePort = 10857
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`n=== Federation Hub Bridge ===" -ForegroundColor Cyan

# Check if already running
$HealthUrl = "http://127.0.0.1:$BridgePort/health"
try {
    $r = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    if ($r.StatusCode -eq 200) {
        Write-Host "Bridge already running on :$BridgePort" -ForegroundColor Green
        exit 0
    }
} catch {}

# Zombie kill with fallback
Write-Host "Checking port $BridgePort ..." -ForegroundColor Yellow
$conn = Get-NetTCPConnection -LocalPort $BridgePort -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 4 } | Select-Object -First 1
if ($conn) {
    $targetPid = $conn.OwningProcess
    Write-Host "Port is held by PID $targetPid. Attempting to free..." -ForegroundColor Yellow
    try { Stop-Process -Id $targetPid -Force -ErrorAction Stop; Start-Sleep 1 } catch {
        try { taskkill /F /PID $targetPid 2>&1 | Out-Null; Start-Sleep 1 } catch {
            try { Get-CimInstance Win32_Process -Filter "ProcessId = $targetPid" -ErrorAction Stop | Invoke-CimMethod -MethodName Terminate -ErrorAction Stop | Out-Null; Start-Sleep 1 } catch {}
        }
    }
    # Verify port is free
    $still = Get-NetTCPConnection -LocalPort $BridgePort -ErrorAction SilentlyContinue
    if ($still) {
        Write-Host "Could not free port $BridgePort (PID $targetPid is system-owned or requires Admin)." -ForegroundColor Red
        Write-Host "Run PowerShell as Administrator and: taskkill /F /PID $targetPid" -ForegroundColor Yellow
        exit 1
    }
}

# Sync + start
Set-Location $ScriptDir
Write-Host "Syncing dependencies... " -ForegroundColor Cyan
uv sync --quiet
Write-Host "Starting bridge on :$BridgePort (reload enabled)..." -ForegroundColor Green
uv run uvicorn app.main:app --host 0.0.0.0 --port $BridgePort --reload --log-level info

$FleetStartPath = Join-Path $ProjectRoot "scripts\FleetStartMode.ps1"
if (-not (Test-Path -LiteralPath $FleetStartPath)) {
    Write-Host "ERROR: Missing vendored launcher helper: $FleetStartPath" -ForegroundColor Red
    exit 1
}
. $FleetStartPath

