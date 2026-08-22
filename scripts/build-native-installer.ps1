[CmdletBinding()]
param([string]$Version = '1.1.0')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $root 'installer\stage'
$web = Join-Path $root 'apps\web'
$driver = Join-Path $root 'installer\vendor\Xprinter-Receipt-Driver-2025.12.22.01.exe'
if (-not (Test-Path -LiteralPath $driver)) { throw 'The verified Xprinter installer is missing from installer\vendor.' }

if (Test-Path -LiteralPath $stage) {
  $resolvedStage = [IO.Path]::GetFullPath($stage)
  $resolvedInstaller = [IO.Path]::GetFullPath((Join-Path $root 'installer'))
  if (-not $resolvedStage.StartsWith($resolvedInstaller, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe staging path.' }
  Remove-Item -LiteralPath $resolvedStage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path "$stage\api\wwwroot","$stage\print-bridge","$stage\tools","$stage\driver","$stage\release" | Out-Null

Push-Location $web
try { npm ci; npm run build } finally { Pop-Location }
dotnet publish (Join-Path $root 'apps\api\TheBarcode.Api.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o "$stage\api"
dotnet publish (Join-Path $root 'apps\print-bridge\TheBarcode.PrintBridge.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o "$stage\print-bridge"
Copy-Item -Path "$web\dist\*" -Destination "$stage\api\wwwroot" -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root 'installer\configure-native.ps1') -Destination "$stage\tools\configure-native.ps1"
Copy-Item -LiteralPath $driver -Destination "$stage\driver\Xprinter-Receipt-Driver-2025.12.22.01.exe"
Copy-Item -LiteralPath (Join-Path $root 'release\latest.json') -Destination "$stage\release\latest.json"

$iscc = Get-Command iscc.exe -ErrorAction SilentlyContinue
if (-not $iscc) {
  $candidates = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe","$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe")
  $isccPath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
} else { $isccPath = $iscc.Source }
if (-not $isccPath) { throw 'Inno Setup 6 is required to compile the final installer. Install it with: winget install JRSoftware.InnoSetup' }
& $isccPath "/DAppVersion=$Version" (Join-Path $root 'installer\TheBarcode.iss')
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
Write-Host "Installer created under installer\output" -ForegroundColor Green
