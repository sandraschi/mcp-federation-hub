# Bridge Start Script
# Runs the MCP Federation Bridge on port 10857

$BridgePort = 10857
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Checking port $BridgePort..." -ForegroundColor Yellow
$squatters = Get-NetTCPConnection -LocalPort $BridgePort -ErrorAction SilentlyContinue |
    Where-Object { $_.OwningProcess -gt 4 } |
    Select-Object -ExpandProperty OwningProcess -Unique
foreach ($p in $squatters) {
    Write-Host "Killing PID $p on port $BridgePort" -ForegroundColor Red
    try { Stop-Process -Id $p -Force -ErrorAction Stop } catch {}
}

Set-Location $ScriptDir

# Ensure uv env is synced
Write-Host "Syncing uv environment..." -ForegroundColor Cyan
uv sync --quiet

Write-Host "Starting bridge on port $BridgePort (reload enabled)..." -ForegroundColor Green
uv run uvicorn app.main:app --host 0.0.0.0 --port $BridgePort --reload --log-level info
