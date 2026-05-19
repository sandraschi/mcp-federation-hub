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

# ── Fleet Depot ──────────────────────────────────────────────────────────────

# Show exchange depot stats (file counts, sizes, last modified per category)
depot-stats:
    Set-Location '{{justfile_directory()}}'
    @$depot = "D:\Dev\repos\_exchange"; \
    if (-not (Test-Path $depot)) { Write-Host "Depot not found: $depot" -ForegroundColor Red; exit 1 }; \
    Write-Host "`n  Fleet Exchange Depot: $depot" -ForegroundColor Cyan; \
    Write-Host "  " ("─" * 55) -ForegroundColor Gray; \
    Get-ChildItem $depot -Directory | ForEach-Object { \
        $files = Get-ChildItem $_.FullName -File -Recurse; \
        $count = $files.Count; \
        $size = [math]::Round(($files | Measure-Object Length -Sum).Sum / 1MB, 2); \
        $last = if ($files) { ($files | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime.ToString("yyyy-MM-dd HH:mm") } else { "-" }; \
        $exts = ($files | Group-Object Extension | ForEach-Object { "$($_.Name)($($_.Count))" }) -join " "; \
        Write-Host ("  {0,-12} {1,4} files  {2,8} MB  last: {3}  [{4}]" -f $_.Name, $count, $size, $last, $exts) -ForegroundColor White }; \
    Write-Host ""

# List import-compatible file formats for a given target MCP server
depot-formats:
    Set-Location '{{justfile_directory()}}'
    @param($target); \
    $map = @{ \
        "godot"   = @("STL (.stl)", "GLB (.glb)", "GLTF (.gltf)", "OBJ (.obj)", "CSV (.csv)"); \
        "blender" = @("OBJ", "FBX", "GLB", "GLTF", "STL", "PLY", "VRM", "DAE", "STEP", "IGES", "DXF", "SVG", "ABC", "USD"); \
        "freecad" = @("STEP (.step/.stp)", "STL (.stl)", "IFC (.ifc)", "FCStd (.fcstd)"); \
        "resonite"= @("GLB (.glb)", "FBX (.fbx)", "VRM (.vrm)", "OBJ (.obj)", "PLY (.ply)", "SPZ (.spz)"); \
        "qcad"    = @("DXF (.dxf)", "DWG (.dwg)"); \
        "avatar"  = @("VRM (.vrm)", "GLB (.glb)"); \
        "yahboom" = @("STL (.stl)", "URDF"); \
        "robotics"= @("FBX (.fbx)", "GLB (.glb)", "OBJ (.obj)", "STL (.stl)", "STEP (.step)", "SPZ (.spz)"); \
    }; \
    if ($target) { \
        $fmts = $map[$target]; \
        if ($fmts) { Write-Host "`n  $target imports:" ($fmts -join ", ") } \
        else { Write-Host "Unknown target: $target. Try: " ($map.Keys -join ", ") } \
    } else { \
        Write-Host "`n  Fleet Import Format Matrix" -ForegroundColor Cyan; \
        Write-Host "  " ("─" * 55) -ForegroundColor Gray; \
        foreach ($k in $map.Keys | Sort-Object) { \
            Write-Host ("  {0,-12} {1}" -f "${k}:", ($map[$k] -join ", ")) -ForegroundColor White }; \
        Write-Host "`n  Usage: just depot-formats blender" -ForegroundColor Gray \
    }

# Export-compatible file formats for a given source MCP server to another
depot-route:
    Set-Location '{{justfile_directory()}}'
    @param($from, $to); \
    $routes = @{ \
        "qcad→freecad"    = "DXF → STEP/STL via plan_extrude / mesh_to_solid"; \
        "freecad→godot"   = "STL → godot_import_stl | OBJ (CFD) → godot_import_obj"; \
        "freecad→blender" = "STEP/STL → blender_import"; \
        "blender→godot"   = "GLB/FBX → godot_import_glb | STL → godot_import_stl"; \
        "blender→resonite"= "GLB → blender_export_presets(RESONITE) → resonite_import_blender"; \
        "blender→avatar"  = "VRM/GLB → avatar import"; \
        "avatar→resonite" = "VRM → export_avatar → resonite inject"; \
    }; \
    if ($from -and $to) { \
        $route = $routes["$from→$to"]; \
        if ($route) { Write-Host "  ${from} → ${to}: $route" } \
        else { Write-Host "No pre-defined route for ${from} → ${to}" } \
    } else { \
        Write-Host "`n  Cross-Fleet Routes" -ForegroundColor Cyan; \
        Write-Host "  " ("─" * 55) -ForegroundColor Gray; \
        foreach ($k in $routes.Keys | Sort-Object) { \
            Write-Host ("  {0,-22} {1}" -f "${k}:", $routes[$k]) -ForegroundColor White }; \
        Write-Host "`n  Usage: just depot-route blender godot" -ForegroundColor Gray \
    }
