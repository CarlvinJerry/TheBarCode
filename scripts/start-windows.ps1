[CmdletBinding()]
param([int]$Port = 8088)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bridgeExe = Join-Path $env:LOCALAPPDATA 'TheBarcode\PrintBridge\TheBarcode.PrintBridge.exe'
if ((Test-Path -LiteralPath $bridgeExe) -and -not (Get-Process TheBarcode.PrintBridge -ErrorAction SilentlyContinue)) {
  Start-Process -FilePath $bridgeExe -ArgumentList '--urls http://127.0.0.1:17777' -WindowStyle Hidden
}
Push-Location $root
try { docker compose up -d } finally { Pop-Location }
Start-Process "http://localhost:$Port"
