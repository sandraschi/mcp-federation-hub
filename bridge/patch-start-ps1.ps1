<#
.SYNOPSIS
    Add -Headless gating to fleet start.ps1 files so frontend (Vite) is skipped
    when running headless (supervisor mode). Backs up each file first.
#>

param(
    [switch]$Apply,
    [string]$FleetConfig = "D:\Dev\repos\mcp-federation-hub\federation-config.json"
)

$ErrorActionPreference = "Stop"

# ---- Load fleet server ids ------------------------------------------
$fleet = Get-Content $FleetConfig -Raw | ConvertFrom-Json -AsHashtable
$fleetIds = $fleet.servers.Keys
Write-Host "Fleet servers: $($fleetIds.Count)"

# ---- Find all start.ps1 across fleet repos --------------------------
$patched = @()
$skipped = @()
$errors = @()

foreach ($sid in $fleetIds) {
    # Guess repo paths
    $candidates = @(
        "D:\Dev\repos\$sid",
        "D:\Dev\repos\$($sid -replace '-mcp$','')",
        "D:\Dev\repos\$($sid -replace '-server$','')"
    )
    $repoPath = $null
    foreach ($c in $candidates) { if (Test-Path $c) { $repoPath = $c; break } }
    if (-not $repoPath) { $skipped += "$sid (no repo)"; continue }

    # Find start.ps1 files in the repo (root, webapp, web_sota, web-sota, web)
    $ps1Files = @()
    foreach ($sub in @("", "webapp", "web_sota", "web-sota", "web", "scripts")) {
        $p = if ($sub) { Join-Path $repoPath $sub "start.ps1" } else { Join-Path $repoPath "start.ps1" }
        if (Test-Path $p) { $ps1Files += $p }
    }
    if ($ps1Files.Count -eq 0) { $skipped += "$sid (no start.ps1)"; continue }

    foreach ($ps1 in $ps1Files) {
        $content = Get-Content $ps1 -Raw
        $orig = $content

        # Check if it has frontend start patterns
        $hasFrontend = $content -match 'npm run dev|vite\s|npm run serve'
        if (-not $hasFrontend) { $skipped += "$sid ($(Split-Path $ps1 -Parent | Split-Path -Leaf)/start.ps1 no frontend)"; continue }

        # Already has SkipFrontend? skip
        if ($content -match '\$SkipFrontend|\$BackendOnly') { $skipped += "$sid ($(Split-Path $ps1 -Parent | Split-Path -Leaf) already patched)"; continue }

        # Add SkipFrontend after the headless standard block
        $headlessMarker = '$WindowStyle = if ($Headless)'
        $skipLine = "`$SkipFrontend = `$Headless"
        if ($content -match $headlessMarker) {
            $content = $content -replace "(\$WindowStyle = if \(\$Headless\).*)", "`$1`n$skipLine"
        } else {
            # No headless standard - add at top
            # Check if Param exists
            if ($content -match 'Param\(') {
                $content = $content -replace '(Param\([^)]+\))', "`$1`n`$SkipFrontend = `$Headless"
            } else {
                $content = "`$SkipFrontend = `$Headless`n$content"
            }
        }

        # Add a "return" guard before the first frontend line (npm run dev / vite)
        # This is cleaner than wrapping multi-line commands with backtick continuations.
        $frontendPatterns = @(
            'npm\s+run\s+dev',
            'vite\s',
            'npm\s+run\s+serve'
        )

        $guardLine = "if (`$SkipFrontend) { return }"
        if ($content -match [regex]::Escape($guardLine)) {
            $skipped += "$sid ($(Split-Path $ps1 -Parent | Split-Path -Leaf) already patched)"
            continue
        }

        foreach ($pattern in $frontendPatterns) {
            $newContent = $content -replace "(?m)^([ \t]*)$pattern", "$guardLine`n`$1`$0"
            if ($newContent -ne $content) {
                $content = $newContent
                break
            }
        }

        if ($content -eq $orig) {
            $skipped += "$sid ($(Split-Path $ps1 -Parent | Split-Path -Leaf) no change)"
            continue
        }

        # Backup
        $bak = "$ps1.bak.$(Get-Date -Format 'yyyyMMdd_HHmmss')"
        Copy-Item $ps1 $bak

        if ($Apply) {
            Set-Content $ps1 $content -Encoding UTF8 -NoNewline
            $patched += "$sid ($(Split-Path $ps1 -Parent | Split-Path -Leaf))"
            Write-Host "  [ok] $sid ($(Split-Path $ps1 -Parent | Split-Path -Leaf))" -ForegroundColor Green
        } else {
            $patched += "$sid ($(Split-Path $ps1 -Parent | Split-Path -Leaf)) [DRY]"
            Write-Host "  [DRY] $sid ($(Split-Path $ps1 -Parent | Split-Path -Leaf))" -ForegroundColor DarkGray
        }
    }
}

Write-Host "`n=== Results ===" -ForegroundColor Cyan
Write-Host "Patched: $($patched.Count)"
Write-Host "Skipped: $($skipped.Count)"
if ($Apply) { Write-Host "Backups saved as *.bak.* in each repo dir" } else { Write-Host "Dry run - use -Apply to write" }
