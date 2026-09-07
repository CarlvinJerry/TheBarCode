[CmdletBinding()]
param([string]$Version,[string]$SigningCertificate,[string]$SigningPassword)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$versionFile = Join-Path $root 'VERSION'
if (-not $Version) { $Version = (Get-Content -Raw -LiteralPath $versionFile).Trim() }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'VERSION must use semantic versioning, for example 1.2.0.' }
$stage = Join-Path $root 'installer\stage'
$web = Join-Path $root 'apps\web'
$driver = Join-Path $root 'installer\vendor\Xprinter-Receipt-Driver-2025.12.22.01.exe'
$postgres = Get-ChildItem (Join-Path $root 'installer\vendor') -Filter 'postgresql-*-windows-x64.exe' -File -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not (Test-Path -LiteralPath $driver)) { throw 'The verified Xprinter installer is missing from installer\vendor.' }
if (-not $postgres) { throw 'The official PostgreSQL Windows installer is missing from installer\vendor.' }
if ((Get-Item -LiteralPath $postgres.FullName).Length -lt 100MB) { throw 'The PostgreSQL installer appears incomplete; download the full official Windows package before building.' }
$postgresSignature = Get-AuthenticodeSignature -LiteralPath $postgres.FullName
if ($postgresSignature.Status -ne 'Valid') { throw "The PostgreSQL installer signature is not valid ($($postgresSignature.Status))." }

if (Test-Path -LiteralPath $stage) {
  $resolvedStage = [IO.Path]::GetFullPath($stage)
  $resolvedInstaller = [IO.Path]::GetFullPath((Join-Path $root 'installer'))
  if (-not $resolvedStage.StartsWith($resolvedInstaller, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe staging path.' }
  Remove-Item -LiteralPath $resolvedStage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path "$stage\api\wwwroot","$stage\print-bridge","$stage\tools","$stage\driver","$stage\driver-launcher","$stage\launcher","$stage\prerequisites","$stage\release" | Out-Null

Push-Location $web
try {
  $env:VITE_APP_VERSION=$Version
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'Web dependency installation failed; installer build stopped.' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Web production build failed; installer build stopped.' }
} finally { Remove-Item Env:VITE_APP_VERSION -ErrorAction SilentlyContinue; Pop-Location }
dotnet publish (Join-Path $root 'apps\api\TheBarcode.Api.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:Version=$Version -o "$stage\api"
dotnet publish (Join-Path $root 'apps\print-bridge\TheBarcode.PrintBridge.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:Version=$Version -o "$stage\print-bridge"
dotnet publish (Join-Path $root 'apps\driver-launcher\Dukora.DriverInstaller.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:Version=$Version -o "$stage\driver-launcher"
dotnet publish (Join-Path $root 'apps\migration\TheBarcode.Migration.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:Version=$Version -o "$stage\tools"
dotnet publish (Join-Path $root 'apps\native-launcher\TheBarcode.Launcher.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:Version=$Version -o "$stage\launcher"
Copy-Item -Path "$web\dist\*" -Destination "$stage\api\wwwroot" -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root 'installer\configure-native.ps1') -Destination "$stage\tools\configure-native.ps1"
Copy-Item -LiteralPath (Join-Path $root 'installer\configure-native-launcher.ps1') -Destination "$stage\tools\configure-native-launcher.ps1"
Copy-Item -LiteralPath $driver -Destination "$stage\driver\Xprinter-Receipt-Driver-2025.12.22.01.exe"
Copy-Item -LiteralPath $postgres.FullName -Destination "$stage\prerequisites\$($postgres.Name)"
Copy-Item -LiteralPath (Join-Path $root 'release\latest.json') -Destination "$stage\release\latest.json"

$iscc = Get-Command iscc.exe -ErrorAction SilentlyContinue
if (-not $iscc) {
  $candidates = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe","$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe")
  $isccPath = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
} else { $isccPath = $iscc.Source }
if (-not $isccPath) { throw 'Inno Setup 6 is required to compile the final installer. Install it with: winget install JRSoftware.InnoSetup' }
& $isccPath "/DAppVersion=$Version" (Join-Path $root 'installer\TheBarcode.iss')
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
$installer = Join-Path $root "installer\output\TheBarcode-Setup-$Version-x64.exe"
if (-not (Test-Path -LiteralPath $installer)) { throw 'Installer output was not created.' }
if ($SigningCertificate) {
  if (-not (Test-Path -LiteralPath $SigningCertificate)) { throw "Signing certificate was not found: $SigningCertificate" }
  $signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if (-not $signtool) {
    $signtoolPath = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Filter signtool.exe -Recurse -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if ($signtoolPath) { $signtool = @{ Source = $signtoolPath.FullName } }
  }
  if (-not $signtool) { throw 'signtool.exe was not found. Install the Windows SDK or provide it on PATH.' }
  $signArgs = @('sign','/fd','SHA256','/tr','http://timestamp.digicert.com','/td','SHA256','/f',$SigningCertificate)
  if ($SigningPassword) { $signArgs += @('/p',$SigningPassword) }
  $signArgs += $installer
  & $signtool.Source @signArgs
  if ($LASTEXITCODE -ne 0) { throw 'Authenticode signing failed.' }
  & $signtool.Source 'verify','/pa','/all',$installer
  if ($LASTEXITCODE -ne 0) { throw 'Authenticode signature verification failed.' }
}
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash
Write-Host "Installer created: $installer" -ForegroundColor Green
Write-Host "SHA256: $hash" -ForegroundColor Green
