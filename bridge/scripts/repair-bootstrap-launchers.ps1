<#
.SYNOPSIS
    Repair brace structure after patch-bootstrap-launchers.ps1
#>
$ErrorActionPreference = "Stop"
$Launchers = @(
    "D:/Dev/repos/git-github-mcp/web/start.ps1",
    "D:/Dev/repos/filesystem-mcp/webapp/start.ps1",
    "D:/Dev/repos/devices-mcp/web-sota/start.ps1",
    "D:/Dev/repos/advanced-memory-mcp/webapp/start.ps1",
    "D:/Dev/repos/arxiv-mcp/web_sota/start.ps1",
    "D:/Dev/repos/calibre-mcp/webapp/start.ps1",
    "D:/Dev/repos/plex-mcp/webapp/start.ps1",
    "D:/Dev/repos/yahboom-mcp/webapp/start.ps1",
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

foreach ($path in $Launchers) {
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $text = Get-Content -LiteralPath $path -Raw -Encoding UTF8

    # Remove duplicate consecutive RunBackend guards
    while ($text -match 'if \(\$FleetStart\.RunBackend\) \{\r?\nif \(\$FleetStart\.RunBackend\) \{') {
        $text = $text -replace 'if \(\$FleetStart\.RunBackend\) \{\r?\nif \(\$FleetStart\.RunBackend\) \{', 'if ($FleetStart.RunBackend) {'
    }

    # Close backend block before frontend section markers
    $markers = @(
        '# 4\. Run Vite',
        '# 5\. Run server',
        '# 5\. Run server \(Vite',
        'Write-Host "Starting Vite frontend',
        "Write-Host 'Starting Vite frontend",
        '# 4\. Run server'
    )
    foreach ($m in $markers) {
        if ($text -match "(?ms)(?<pre>if \(\`$FleetStart\.RunBackend\) \{.*?)(?<marker>$m)") {
            $segment = $Matches['pre']
            if ($segment -notmatch '\}\r?\n\r?\nif \(-not \$FleetStart\.RunFrontend\)') {
                $insert = "}`r`n`r`nif (-not `$FleetStart.RunFrontend) { return }`r`n`r`n"
                $text = $text -replace "(?ms)(?<body>if \(\`$FleetStart\.RunBackend\) \{.*?)(?<marker>$m)", "`${body}${insert}`${marker}"
            }
            break
        }
    }

    # Remove stray closing brace immediately before RunFrontend return
    $browserFix = "Write-Host `"Browser will open automatically when Vite is ready.`" -ForegroundColor Gray`r`n`r`nif (-not `$FleetStart.RunFrontend)"
    $text = $text -replace '(?ms)Write-Host "Browser will open automatically[^\n]*\r?\n\}\r?\n\r?\nif \(-not \$FleetStart\.RunFrontend\)', $browserFix

    # git-github: drop duplicate param line
    $text = $text -replace '(?m)^param\(\[switch\]\$Headless, \[switch\]\$BackendOnly, \[switch\]\$NoBrowser\)\r?\n', ''

    # git-github: honor SkipBrowser
    $text = $text -replace 'if \(-not \$NoBrowser\)', 'if (-not $FleetStart.SkipBrowser)'

    Set-Content -LiteralPath $path -Value $text -Encoding UTF8 -NoNewline

    $errs = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$null, [ref]$errs)
    if ($errs.Count -gt 0) {
        Write-Host "FAIL $path" -ForegroundColor Red
        $errs | ForEach-Object { Write-Host "  $($_.Message)" }
    } else {
        Write-Host "OK   $path" -ForegroundColor Green
    }
}
