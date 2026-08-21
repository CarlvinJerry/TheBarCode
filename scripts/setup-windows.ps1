[CmdletBinding()]
param([int]$Port = 8088)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker Desktop is required. Install it, start Docker Desktop, then run this script again.'
}
docker info | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is installed but is not running.' }

if (-not (Test-Path -LiteralPath $envFile)) {
  $pin = Read-Host 'Choose the private owner PIN (at least 6 characters)' -AsSecureString
  $pinText = [System.Net.NetworkCredential]::new('', $pin).Password
  if ($pinText.Length -lt 6) { throw 'The owner PIN must have at least 6 characters.' }
  $random = [System.Security.Cryptography.RandomNumberGenerator]
  $dbPassword = [Convert]::ToHexString($random::GetBytes(24)).ToLowerInvariant()
  $jwtKey = [Convert]::ToBase64String($random::GetBytes(48))
  @(
    'POSTGRES_DB=thebarcode'
    'POSTGRES_USER=thebarcode'
    "POSTGRES_PASSWORD=$dbPassword"
    "JWT_KEY=$jwtKey"
    "BOOTSTRAP_ADMIN_PIN=$pinText"
    "APP_PORT=$Port"
  ) | Set-Content -LiteralPath $envFile -Encoding utf8
  Write-Host 'Secure local configuration created.' -ForegroundColor Green
}

Push-Location $root
try { docker compose up -d --build } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw 'TheBarcode did not start successfully. Run docker compose logs for details.' }
Start-Process "http://localhost:$Port"
Write-Host "TheBarcode is running at http://localhost:$Port" -ForegroundColor Green
