[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$InstallRoot)
$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'TheBarcode configuration requires Administrator privileges. Run the installer as Administrator.'
}

$currentConfig = Join-Path $InstallRoot 'server\appsettings.Production.json'
$legacyInstallRoots = @(
  (Join-Path ${env:ProgramFiles} 'Beyond Raw Data\TheBarcode'),
  (Join-Path ${env:ProgramFiles(x86)} 'Beyond Raw Data\TheBarcode'),
  (Join-Path ${env:ProgramFiles} 'Beyond Raw Data\Dukora'),
  (Join-Path ${env:ProgramFiles(x86)} 'Beyond Raw Data\Dukora'),
  (Join-Path ${env:ProgramFiles} 'Beyond Raw Data\Dukora Lite'),
  (Join-Path ${env:ProgramFiles(x86)} 'Beyond Raw Data\Dukora Lite')
) | Where-Object { $_ -and $_ -notlike '\\Beyond Raw Data\\' } | Select-Object -Unique

# Lite uses a separate SQLite data engine. When it is present, migrate it into
# the shared PostgreSQL database below instead of silently creating an empty
# native environment.
$legacyLiteDataRoots = @(
  (Join-Path ${env:LOCALAPPDATA} 'Beyond Raw Data\TheBarcode'),
  (Join-Path ${env:LOCALAPPDATA} 'Beyond Raw Data\Dukora Lite'),
  (Join-Path ${env:LOCALAPPDATA} 'Beyond Raw Data\Dukora'),
  (Join-Path ${env:LOCALAPPDATA} 'TheBarcode'),
  (Join-Path ${env:APPDATA} 'Beyond Raw Data\TheBarcode'),
  (Join-Path ${env:APPDATA} 'Beyond Raw Data\Dukora Lite')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
$legacyLiteDatabase = @(
  foreach ($root in $legacyLiteDataRoots) {
    foreach ($name in @('thebarcode.db','dukora.db','TheBarcode.db','Dukora.db')) {
      $candidate = Join-Path $root $name
      if (Test-Path -LiteralPath $candidate -PathType Leaf) { Get-Item -LiteralPath $candidate }
    }
  }
) | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$legacyLiteDatabasePath = if ($legacyLiteDatabase) { $legacyLiteDatabase.FullName } else { $null }

# A branded folder change must not create a second environment. Reuse the
# previous native install configuration when the new directory is empty.
if (-not (Test-Path -LiteralPath $currentConfig)) {
  $legacyConfig = $legacyInstallRoots |
    ForEach-Object { Join-Path $_ 'server\appsettings.Production.json' } |
    Where-Object { Test-Path -LiteralPath $_ } |
    Select-Object -First 1
  if ($legacyConfig) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $currentConfig) | Out-Null
    Copy-Item -LiteralPath $legacyConfig -Destination $currentConfig -Force
    Write-Host "Reused the existing TheBarcode database configuration from $legacyConfig." -ForegroundColor Cyan
  }
}

function New-HexSecret([int]$Length) {
  $bytes = New-Object byte[] $Length
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

$driver = Join-Path $InstallRoot 'driver\Xprinter-Receipt-Driver-2025.12.22.01.exe'
$hasXprinter = @(Get-Printer -ErrorAction SilentlyContinue | Where-Object Name -Match 'Xprinter|XP-80').Count -gt 0
if (-not $hasXprinter -and (Test-Path -LiteralPath $driver)) {
  Write-Host 'The Xprinter driver is not installed. Complete the vendor setup window.' -ForegroundColor Yellow
  $driverProcess = Start-Process -FilePath $driver -Verb RunAs -Wait -PassThru
  if ($driverProcess.ExitCode -notin @(0, 1641, 3010)) {
    throw "Xprinter setup exited with code $($driverProcess.ExitCode)."
  }
}

$existing = $null
$preserveExisting = $false
if (Test-Path -LiteralPath $currentConfig) {
  try { $existing = Get-Content -Raw -LiteralPath $currentConfig | ConvertFrom-Json } catch { $existing = $null }
  $preserveExisting = $null -ne $existing -and
    -not [string]::IsNullOrWhiteSpace([string]$existing.ConnectionStrings.Postgres) -and
    -not [string]::IsNullOrWhiteSpace([string]$existing.Jwt.Key) -and
    -not [string]::IsNullOrWhiteSpace([string]$existing.Bootstrap.AdminPin)
}

# A stale or partially-created configuration must not suppress migration. Only
# a complete PostgreSQL configuration means this machine already has a native
# database that should be preserved.
$needsLiteMigration = [bool]($legacyLiteDatabasePath -and -not $preserveExisting)

# PostgreSQL is the canonical local data store. Prefer the installer bundled
# with this release so a client never needs to know what winget, PATH, or
# database installer options are. Existing services are always reused.
$postgresAdminPassword = $null
$postgres = Get-Service 'postgresql*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not $postgres) {
  $bundledPostgres = Get-ChildItem (Join-Path $InstallRoot 'prerequisites') -Filter 'postgresql-*-windows-x64.exe' -File -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if ($bundledPostgres) {
    $postgresAdminPassword = New-HexSecret 32
    Write-Host 'Installing the bundled PostgreSQL service. This may take a few minutes.' -ForegroundColor Yellow
    # Let the vendor installer choose its versioned default directory. This
    # keeps the bootstrap compatible with future PostgreSQL 18.x refreshes.
    $postgresArgs = @('--mode','unattended','--unattendedmodeui','none','--superpassword',$postgresAdminPassword,'--serverport','5432')
    $postgresProcess = Start-Process -FilePath $bundledPostgres.FullName -ArgumentList $postgresArgs -Verb RunAs -Wait -PassThru
    if ($postgresProcess.ExitCode -notin @(0, 1641, 3010)) {
      throw "Bundled PostgreSQL setup exited with code $($postgresProcess.ExitCode)."
    }
  } elseif (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host 'Bundled PostgreSQL was not found; using winget as a fallback.' -ForegroundColor Yellow
    winget install --id PostgreSQL.PostgreSQL.18 --exact --interactive --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL installation did not complete.' }
  } else {
    throw 'PostgreSQL is missing and the bundled installer is unavailable. Re-run this installer or install PostgreSQL 17/18.'
  }
  for ($attempt = 1; $attempt -le 60 -and -not $postgres; $attempt++) {
    Start-Sleep -Seconds 1
    $postgres = Get-Service 'postgresql*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  }
}
if (-not $postgres) { throw 'PostgreSQL service was not found after installation.' }
if ($postgres.Status -ne 'Running') { Start-Service $postgres.Name }

$psql = Get-ChildItem 'C:\Program Files\PostgreSQL' -Filter psql.exe -Recurse -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $psql) { throw 'psql.exe was not found after PostgreSQL installation.' }

if (-not $preserveExisting) {
  $ownerPin = Read-Host 'Choose TheBarcode owner PIN (at least 6 characters)' -AsSecureString
  $ownerPinText = [Net.NetworkCredential]::new('', $ownerPin).Password
  if ($ownerPinText.Length -lt 6) { throw 'Owner PIN must contain at least 6 characters.' }
  if ($postgresAdminPassword) {
    $pgPassword = $postgresAdminPassword
  } else {
    $pgSecret = Read-Host 'Enter the PostgreSQL postgres administrator password' -AsSecureString
    $pgPassword = [Net.NetworkCredential]::new('', $pgSecret).Password
  }
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
  $config | Set-Content -LiteralPath $currentConfig -Encoding utf8
} else {
  Write-Host 'Existing PostgreSQL configuration preserved; no new database credentials were generated.' -ForegroundColor Cyan
}

$targetConnectionString = if ($preserveExisting) {
  [string]$existing.ConnectionStrings.Postgres
} else {
  "Host=127.0.0.1;Port=5432;Database=thebarcode;Username=thebarcode;Password=$dbPassword"
}

if ($needsLiteMigration) {
  $migration = Join-Path $InstallRoot 'tools\TheBarcode.Migration.exe'
  if (-not (Test-Path -LiteralPath $migration)) { throw 'The SQLite-to-PostgreSQL migration tool is missing from this installer.' }
  $liteProcesses = Get-Process -Name 'TheBarcode.Desktop','Dukora.Desktop' -ErrorAction SilentlyContinue
  if ($liteProcesses) {
    Write-Host 'Closing the Lite desktop host before taking the migration backup...' -ForegroundColor Yellow
    $liteProcesses | Stop-Process -Force
    Start-Sleep -Seconds 1
  }
  $migrationBackupRoot = Join-Path ${env:LOCALAPPDATA} 'Beyond Raw Data\TheBarcode\MigrationBackups'
  New-Item -ItemType Directory -Force -Path $migrationBackupRoot | Out-Null
  $migrationBackup = Join-Path $migrationBackupRoot ("lite-before-native-{0:yyyyMMdd-HHmmss}.db" -f (Get-Date))
  Copy-Item -LiteralPath $legacyLiteDatabasePath -Destination $migrationBackup -Force
  foreach ($suffix in @('-wal','-shm')) {
    if (Test-Path -LiteralPath ($legacyLiteDatabasePath + $suffix)) {
      Copy-Item -LiteralPath ($legacyLiteDatabasePath + $suffix) -Destination ($migrationBackup + $suffix) -Force
    }
  }
  Write-Host "Migrating Lite records from $legacyLiteDatabasePath into the shared PostgreSQL database..." -ForegroundColor Yellow
  & $migration --sqlite $legacyLiteDatabasePath --postgres $targetConnectionString
  if ($LASTEXITCODE -ne 0) { throw 'SQLite-to-PostgreSQL migration failed. The original Lite database backup was retained.' }
  Write-Host "Lite data migrated successfully. Backup retained at $migrationBackup." -ForegroundColor Green
}

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
