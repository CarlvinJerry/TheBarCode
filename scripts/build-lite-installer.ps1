[CmdletBinding()]
param([string]$Version)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $Version) { $Version = (Get-Content -Raw -LiteralPath (Join-Path $root 'VERSION')).Trim() }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'VERSION must use semantic versioning.' }
$stage = Join-Path $root 'installer\stage-lite'
$web = Join-Path $root 'apps\web'
$driver = Join-Path $root 'installer\vendor\Xprinter-Receipt-Driver-2025.12.22.01.exe'
$webView = Join-Path $root 'installer\vendor\MicrosoftEdgeWebView2Setup.exe'
foreach ($required in @($driver,$webView)) { if (-not (Test-Path -LiteralPath $required)) { throw "Installer prerequisite missing: $required" } }
if (Test-Path -LiteralPath $stage) {
  $resolved = [IO.Path]::GetFullPath($stage); $safeRoot = [IO.Path]::GetFullPath((Join-Path $root 'installer'))
  if (-not $resolved.StartsWith($safeRoot,[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe staging path.' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
New-Item -ItemType Directory -Force -Path "$stage\desktop","$stage\server\wwwroot","$stage\print-bridge","$stage\driver","$stage\prerequisites" | Out-Null
Push-Location $web
try {
  $env:VITE_APP_VERSION=$Version
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'Web dependency installation failed.' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Web production build failed.' }
} finally { Remove-Item Env:VITE_APP_VERSION -ErrorAction SilentlyContinue; Pop-Location }
dotnet publish (Join-Path $root 'apps\api\TheBarcode.Api.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:Version=$Version -o "$stage\server"
dotnet publish (Join-Path $root 'apps\print-bridge\TheBarcode.PrintBridge.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:Version=$Version -o "$stage\print-bridge"
dotnet publish (Join-Path $root 'apps\desktop\Dukora.Desktop.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:Version=$Version -o "$stage\desktop"
Copy-Item -Path "$web\dist\*" -Destination "$stage\server\wwwroot" -Recurse -Force
Copy-Item -LiteralPath $driver -Destination "$stage\driver\Xprinter-Receipt-Driver-2025.12.22.01.exe"
Copy-Item -LiteralPath $webView -Destination "$stage\prerequisites\MicrosoftEdgeWebView2Setup.exe"
$iscc = Get-Command iscc.exe -ErrorAction SilentlyContinue
if (-not $iscc) { $isccPath = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe","$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe") | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1 } else { $isccPath=$iscc.Source }
if (-not $isccPath) { throw 'Inno Setup 6 is required.' }
& $isccPath "/DAppVersion=$Version" (Join-Path $root 'installer\DukoraLite.iss')
if ($LASTEXITCODE -ne 0) { throw 'Lite installer compilation failed.' }
$installer=Join-Path $root "installer\output\Dukora-Lite-Setup-$Version-x64.exe"
if (-not (Test-Path -LiteralPath $installer)) { throw 'Lite installer output was not created.' }
Write-Host "Installer created: $installer" -ForegroundColor Green
Write-Host "SHA256: $((Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash)" -ForegroundColor Green
