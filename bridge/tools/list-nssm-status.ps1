# Quick NSSM + port status for fleet selection (no PATH nssm required)
$NssmExe = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\nssm.exe"
if (-not (Test-Path -LiteralPath $NssmExe)) {
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd) { $NssmExe = $cmd.Source }
}
if (-not (Test-Path -LiteralPath $NssmExe)) {
    Write-Host "NSSM not found"
    exit 1
}

$cfgPath = Join-Path $PSScriptRoot "..\nssm-services.json"
$cfg = Get-Content -LiteralPath $cfgPath -Raw | ConvertFrom-Json
$ids = @("mcp-federation-hub") + @($cfg.selected)

Write-Host ""
Write-Host "NSSM installed services" -ForegroundColor Cyan
foreach ($id in $ids) {
    $svc = if ($id -eq "mcp-federation-hub") { "mcp-federation-hub" } else { "mcp-$id" }
    $raw = & $NssmExe status $svc 2>&1
    if ($LASTEXITCODE -ne 0) {
        $st = "NOT_INSTALLED"
    } else {
        $st = ($raw | Select-Object -First 1).ToString().Trim()
    }
    Write-Host ("  {0,-34} {1}" -f $svc, $st)
}

Write-Host ""
Write-Host "Tip: install fleet services (Admin):" -ForegroundColor DarkGray
Write-Host "  ..\install-mcp-services.ps1 -Apply"
exit 0
