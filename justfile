set windows-shell := ["pwsh.exe", "-NoLogo", "-Command"]

# ── Dashboard ─────────────────────────────────────────────────────────────────

# Display the SOTA Industrial Dashboard
default:
    @$lines = Get-Content '{{justfile()}}'; \
    Write-Host ' [SOTA] Industrial Operations Dashboard v1.3.2' -ForegroundColor White -BackgroundColor Cyan; \
    Write-Host '' ; \
    $currentCategory = ''; \
    foreach ($line in $lines) { \
        if ($line -match '^# ── ([^─]+) ─') { \
            $currentCategory = $matches[1].Trim(); \
            Write-Host "`n  $currentCategory" -ForegroundColor Cyan; \
            Write-Host ('  ' + ('─' * 45)) -ForegroundColor Gray; \
        } elseif ($line -match '^# ([^─].+)') { \
            $desc = $matches[1].Trim(); \
            $idx = [array]::IndexOf($lines, $line); \
            if ($idx -lt $lines.Count - 1) { \
                $nextLine = $lines[$idx + 1]; \
                if ($nextLine -match '^([a-z0-9-]+):') { \
                    $recipe = $matches[1]; \
                    $pad = ' ' * [math]::Max(2, (18 - $recipe.Length)); \
                    Write-Host "    $recipe" -ForegroundColor White -NoNewline; \
                    Write-Host "$pad$desc" -ForegroundColor Gray; \
                } \
            } \
        } \
    } \
    Write-Host "`n  [System State: PROD/HARDENED]" -ForegroundColor DarkGray; \
    Write-Host ''

# ── Operator ────────────────────────────────────────────────────────────────

# Launch the fleet system tray icon (right-click: dashboard, status, restart)
tray:
    Start-Process "C:\Program Files\AutoHotkey\v2\AutoHotkey.exe" -ArgumentList "{{justfile_directory()}}\fleet-tray.ahk"

# ── Quality ───────────────────────────────────────────────────────────────────

# Execute Ruff SOTA v13.1 linting
lint:
    Set-Location '{{justfile_directory()}}'
    uv run ruff check .

# Execute Ruff SOTA v13.1 fix and formatting
fix:
    Set-Location '{{justfile_directory()}}'
    uv run ruff check . --fix --unsafe-fixes
    uv run ruff format .

# ── Hardening ─────────────────────────────────────────────────────────────────

# Execute Bandit security audit
check-sec:
    Set-Location '{{justfile_directory()}}'
    uv run bandit -r src/

# Execute safety audit of dependencies
audit-deps:
    Set-Location '{{justfile_directory()}}'
    uv run safety check

# ── Federation ──────────────────────────────────────────────────────────────

# Check the health of all registered federation member servers
fed-status:
    Set-Location '{{justfile_directory()}}'
    curl -s http://127.0.0.1:10857/health | python -c "import sys,json; d=json.load(sys.stdin); print(f'H hub: {d.get(\"status\",\"?\")}'); s=d.get('federation',{}); [print(f'  {k}: {v}') for k,v in s.items()]"

# List all registered MCP servers in the hub
fed-servers:
    Set-Location '{{justfile_directory()}}'
    curl -s http://127.0.0.1:10857/federation/servers | python -c "import sys,json; d=json.load(sys.stdin); [print(f'  {s[\"name\"]:20} {s.get(\"status\",\"?\")}  {s.get(\"version\",\"\")}') for s in d.get('servers',[])]"

# Broadcast an invalidation signal to all members
fed-invalidate:
    Set-Location '{{justfile_directory()}}'
    curl -s -X POST http://127.0.0.1:10857/api/v1/invalidate -H "Content-Type: application/json" -d '{}' | python -c "import sys,json; print(json.load(sys.stdin))"
