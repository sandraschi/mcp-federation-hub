<#
.SYNOPSIS
    Remove duplicate legacy Headless blocks after FleetStartMode header.
#>
$Launchers = Get-ChildItem -Path "D:/Dev/repos" -Recurse -Filter "start.ps1" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '(webapp|web_sota|web-sota|\\web\\)' }

$LegacyBlock = '(?ms)^\# --- SOTA Headless Standard ---\r?\nif \(\$Headless.*?\# ---+\s*\r?\n\r?\n'

foreach ($f in $Launchers) {
    $text = Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8
    if ($text -notmatch 'FleetStartMode\.ps1') { continue }
    $new = [regex]::Replace($text, $LegacyBlock, '')
    if ($new -ne $text) {
        Set-Content -LiteralPath $f.FullName -Value $new -Encoding UTF8 -NoNewline
        Write-Host "cleaned $($f.FullName)"
    }
}
