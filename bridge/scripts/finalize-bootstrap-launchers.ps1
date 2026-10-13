$Launchers = @(
    "D:/Dev/repos/filesystem-mcp/webapp/start.ps1",
    "D:/Dev/repos/devices-mcp/web-sota/start.ps1",
    "D:/Dev/repos/arxiv-mcp/web_sota/start.ps1",
    "D:/Dev/repos/calibre-mcp/webapp/start.ps1",
    "D:/Dev/repos/plex-mcp/webapp/start.ps1",
    "D:/Dev/repos/tailscale-mcp/web_sota/start.ps1",
    "D:/Dev/repos/home-assistant-mcp/web_sota/start.ps1",
    "D:/Dev/repos/docker-mcp/web_sota/start.ps1",
    "D:/Dev/repos/virtualization-mcp/webapp/start.ps1",
    "D:/Dev/repos/ring-mcp/web_sota/start.ps1",
    "D:/Dev/repos/winrar-mcp/webapp/start.ps1",
    "D:/Dev/repos/email-mcp/webapp/start.ps1",
    "D:/Dev/repos/fastsearch-mcp/web_sota/start.ps1",
    "D:/Dev/repos/bookmarks-mcp/web_sota/start.ps1",
    "D:/Dev/repos/system-admin-mcp/web_sota/start.ps1",
    "D:/Dev/repos/local-llm-mcp/web_sota/start.ps1",
    "D:/Dev/repos/rustdesk-mcp/web_sota/start.ps1"
)
$LegacyBlock = '(?ms)^\# --- SOTA Headless Standard ---\r?\nif \(\$Headless.*?\# ---+\s*\r?\n\r?\n'
foreach ($path in $Launchers) {
    $text = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    $text = [regex]::Replace($text, $LegacyBlock, '')
    if ($text -notmatch 'if \(-not \$FleetStart\.RunFrontend\) \{ return \}[\s\S]*Starting Vite') {
        $text = $text -replace '(?m)^(# 5\. Run server|Write-Host "Starting Vite frontend)', "if (-not `$FleetStart.RunFrontend) { return }`r`n`r`n`$1"
    }
    Set-Content -LiteralPath $path -Value $text -Encoding UTF8 -NoNewline
    $errs = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$null, [ref]$errs)
    if ($errs.Count -gt 0) { Write-Host "FAIL $path"; $errs | ForEach-Object { Write-Host $_.Message } }
    else { Write-Host "OK $path" }
}
