# mcp-federation-hub starter
param([switch]$BackendOnly)
$ErrorActionPreference = "Stop"
$Repo = $PSScriptRoot
$UV = "C:\Users\sandr\.local\bin\uv.exe"
Write-Host "=== mcp-federation-hub ===" -ForegroundColor Cyan
& $UV run python -m mcp_federation_hub
