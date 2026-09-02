[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$InstallRoot)
$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'TheBarcode configuration requires Administrator privileges. Run the installer as Administrator.'
}

function New-HexSecret([int]$Length) {
  $bytes = New-Object byte[] $Length
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

$driver = Join-Path $InstallRoot 'driver\Xprinter-Receipt-Driver-2025.12.22.01.exe'
$hasXprinter = Get-Printer -ErrorAction SilentlyContinue | Where-Object Name -Match 'Xprinter|XP-80'
if (-not $hasXprinter -and (Test-Path -LiteralPath $driver)) {
  Write-Host 'The Xprinter driver is not installed. Complete the vendor setup window.' -ForegroundColor Yellow
  Start-Process -FilePath $driver -Wait
}

$postgres = Get-Service 'postgresql*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not $postgres) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'PostgreSQL is missing and winget is unavailable. Install PostgreSQL 17 or 18, then rerun Configure TheBarcode.' }
  Write-Host 'Installing PostgreSQL 18. Record the postgres administrator password selected by its installer.' -ForegroundColor Yellow
  winget install --id PostgreSQL.PostgreSQL.18 --exact --interactive --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL installation did not complete.' }
  $postgres = Get-Service 'postgresql*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
}
if (-not $postgres) { throw 'PostgreSQL service was not found.' }
if ($postgres.Status -ne 'Running') { Start-Service $postgres.Name }

$psql = Get-ChildItem 'C:\Program Files\PostgreSQL' -Filter psql.exe -Recurse -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $psql) { throw 'psql.exe was not found.' }
$ownerPin = Read-Host 'Choose TheBarcode owner PIN (at least 6 characters)' -AsSecureString
$ownerPinText = [Net.NetworkCredential]::new('', $ownerPin).Password
if ($ownerPinText.Length -lt 6) { throw 'Owner PIN must contain at least 6 characters.' }
$pgSecret = Read-Host 'Enter the PostgreSQL postgres administrator password' -AsSecureString
$pgPassword = [Net.NetworkCredential]::new('', $pgSecret).Password
$dbPassword = New-HexSecret 24
$jwt = New-HexSecret 48
$env:PGPASSWORD = $pgPassword
try {
  $roleExists = & $psql.FullName -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='thebarcode'"
  if ($roleExists.Trim() -ne '1') { & $psql.FullName -U postgres -d postgres -c "CREATE ROLE thebarcode LOGIN PASSWORD '$dbPassword'" }
  else { & $psql.FullName -U postgres -d postgres -c "ALTER ROLE thebarcode PASSWORD '$dbPassword'" }
  $dbExists = & $psql.FullName -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='thebarcode'"
  if ($dbExists.Trim() -ne '1') { & $psql.FullName -U postgres -d postgres -c 'CREATE DATABASE thebarcode OWNER thebarcode' }
} finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }

$config = @{
  ConnectionStrings = @{ Postgres = "Host=127.0.0.1;Port=5432;Database=thebarcode;Username=thebarcode;Password=$dbPassword" }
  Jwt = @{ Key = $jwt }
  Bootstrap = @{ AdminPin = $ownerPinText }
  AllowedOrigins = @('http://localhost:8088','http://127.0.0.1:8088')
  Release = @{ Channel = 'local-windows' }
} | ConvertTo-Json -Depth 5
$config | Set-Content -LiteralPath (Join-Path $InstallRoot 'server\appsettings.Production.json') -Encoding utf8

$api = Join-Path $InstallRoot 'server\TheBarcode.Api.exe'
& sc.exe stop TheBarcodeApi 2>$null | Out-Null
& sc.exe delete TheBarcodeApi 2>$null | Out-Null
for ($attempt = 1; $attempt -le 20 -and (Get-Service TheBarcodeApi -ErrorAction SilentlyContinue); $attempt++) { Start-Sleep -Milliseconds 250 }
& sc.exe create TheBarcodeApi binPath= "`"$api`" --urls http://0.0.0.0:8088" start= auto DisplayName= "TheBarcode Local Server" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Windows could not register the TheBarcode Local Server service.' }
& sc.exe description TheBarcodeApi 'Local API and shared business data service for TheBarcode' | Out-Null
& sc.exe start TheBarcodeApi | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Windows could not start the TheBarcode Local Server service.' }
& netsh.exe advfirewall firewall delete rule name='TheBarcode Local Server' 2>$null | Out-Null
& netsh.exe advfirewall firewall add rule name='TheBarcode Local Server' dir=in action=allow protocol=TCP localport=8088 profile=private | Out-Null

$healthy = $false
for ($attempt = 1; $attempt -le 20; $attempt++) {
  Start-Sleep -Milliseconds 500
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8088/api/health' -TimeoutSec 2
    if ($health.status -eq 'healthy') { $healthy = $true; break }
  } catch { }
}
if (-not $healthy) {
  $serviceState = (Get-Service TheBarcodeApi -ErrorAction SilentlyContinue).Status
  throw "TheBarcode Local Server did not become ready on port 8088. Service status: $serviceState. Re-run Configure TheBarcode as Administrator."
}

$bridge = Join-Path $InstallRoot 'print-bridge\TheBarcode.PrintBridge.exe'
$startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'TheBarcode Print Bridge.cmd'
"@echo off`r`nstart `"`" /min `"$bridge`" --urls http://127.0.0.1:17777" | Set-Content -LiteralPath $startup -Encoding ascii
Start-Process -FilePath $bridge -ArgumentList '--urls http://127.0.0.1:17777' -WindowStyle Hidden

Write-Host 'TheBarcode installation is configured and responding on port 8088.' -ForegroundColor Green
Write-Host 'Other terminals on this outlet network can use this computer IP on port 8088.' -ForegroundColor Cyan
Start-Process 'http://localhost:8088'
Read-Host 'Press Enter to close'
