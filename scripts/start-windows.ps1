[CmdletBinding()]
param([int]$Port = 8088)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try { docker compose up -d } finally { Pop-Location }
Start-Process "http://localhost:$Port"
