[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$InstallRoot)

$script = Join-Path $InstallRoot 'tools\configure-native.ps1'
if (-not (Test-Path -LiteralPath $script)) { throw 'Dukora configuration tool was not found.' }
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -InstallRoot `"$InstallRoot`""
Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -Wait
