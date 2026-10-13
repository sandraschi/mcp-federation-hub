<#
.SYNOPSIS
    Minimal FleetStartMode patch for bootstrap web launchers (header + frontend gate only).
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

$NewHeader = @'
param(
    [switch]$Headless,
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$NoBrowser
)

. "D:/Dev/repos/mcp-central-docs/standards/FleetStartMode.ps1"
$FleetStart = Initialize-FleetStartMode @PSBoundParameters
Enter-FleetHeadlessConsole -Headless:$Headless -BackendOnly:$BackendOnly

'@

$OldHeaderRegex = '(?s)^(?:Param|param)\(\[switch\]\$Headless[^\)]*\)\s*\r?\n(?:\$SkipFrontend[^\r\n]*\r?\n)?(?:\# --- SOTA Headless Standard ---.*?# ---+\s*\r?\n)?'

foreach ($path in $Launchers) {
    if (-not (Test-Path -LiteralPath $path)) {
        Write-Host "SKIP missing $path" -ForegroundColor Yellow
        continue
    }
    $text = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    if ($text -match 'FleetStartMode\.ps1') {
        Write-Host "OK   already $path" -ForegroundColor DarkGray
        continue
    }

    if ($text -match $OldHeaderRegex) {
        $text = [regex]::Replace($text, $OldHeaderRegex, $NewHeader, 1)
    } else {
        $text = $NewHeader + $text
    }

    $text = $text -replace '\$SkipFrontend\s*=\s*\$Headless\r?\n', ''
    $text = $text -replace 'if\s*\(\s*\$SkipFrontend\s*\)\s*\{\s*return\s*\}', 'if (-not $FleetStart.RunFrontend) { return }'
    $text = $text -replace 'if\s*\(\s*-not\s*\$BackendOnly\s*\)\s*\{', 'if ($FleetStart.RunFrontend) {'
    $text = $text -replace 'if\s*\(\s*-not\s*\$NoBrowser\s*\)', 'if (-not $FleetStart.SkipBrowser)'

    if ($text -notmatch 'if \(-not \$FleetStart\.RunFrontend\) \{ return \}') {
        $gate = "if (-not `$FleetStart.RunFrontend) { return }`r`n"
        $text = $text -replace '(?m)^(\s*npm run dev)', ($gate + '$1')
    }

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

$DelegateBody = @'
param(
    [switch]$Headless,
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$NoBrowser
)
$child = Join-Path $PSScriptRoot "{CHILD}"
if (-not (Test-Path -LiteralPath $child)) {
    Write-Error "Missing launcher: $child"
    exit 1
}
& $child @PSBoundParameters
exit $LASTEXITCODE

'@

@(
    @{ Root = "D:/Dev/repos/docker-mcp/start.ps1"; Child = "web_sota/start.ps1" },
    @{ Root = "D:/Dev/repos/advanced-memory-mcp/start.ps1"; Child = "webapp/start.ps1" }
) | ForEach-Object {
    Set-Content -LiteralPath $_.Root -Value ($DelegateBody.Replace("{CHILD}", $_.Child)) -Encoding UTF8
    Write-Host "DELEGATE $($_.Root)" -ForegroundColor Cyan
}

Write-Host "Done." -ForegroundColor Green
