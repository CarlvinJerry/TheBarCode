[CmdletBinding()]
param([int]$Port = 17777)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root 'apps\print-bridge\TheBarcode.PrintBridge.csproj'
$install = Join-Path $env:LOCALAPPDATA 'TheBarcode\PrintBridge'
$startup = [Environment]::GetFolderPath('Startup')
$launcher = Join-Path $startup 'TheBarcode Print Bridge.cmd'

New-Item -ItemType Directory -Force -Path $install | Out-Null
dotnet publish $project -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o $install
if ($LASTEXITCODE -ne 0) { throw 'Print bridge publish failed.' }

$exe = Join-Path $install 'TheBarcode.PrintBridge.exe'
@(
  '@echo off'
  "start `"`" /min `"$exe`" --urls http://127.0.0.1:$Port"
) | Set-Content -LiteralPath $launcher -Encoding ascii

Start-Process -FilePath $exe -ArgumentList "--urls http://127.0.0.1:$Port" -WindowStyle Hidden
Write-Host "Silent print bridge installed and started on 127.0.0.1:$Port" -ForegroundColor Green
