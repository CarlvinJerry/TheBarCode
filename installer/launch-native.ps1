[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$InstallRoot)

$ErrorActionPreference = 'Stop'
$apiUrl = 'http://127.0.0.1:8088'
$logRoot = Join-Path ${env:LOCALAPPDATA} 'Beyond Raw Data\TheBarcode\Logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$logFile = Join-Path $logRoot 'launcher.log'

function Show-LauncherError([string]$Message) {
  try {
    Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
    [System.Windows.MessageBox]::Show($Message, 'TheBarcode', 'OK', 'Error') | Out-Null
  } catch { Write-Error $Message }
}

try {
  $service = Get-Service -Name 'TheBarcodeApi' -ErrorAction SilentlyContinue
  if (-not $service) {
    $configure = Join-Path $InstallRoot 'tools\configure-native-launcher.ps1'
    if (-not (Test-Path -LiteralPath $configure)) { throw 'TheBarcode Local Server is not installed. Run the installer repair/configuration action.' }
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$configure,'-InstallRoot',$InstallRoot) -Verb RunAs -Wait
    $service = Get-Service -Name 'TheBarcodeApi' -ErrorAction SilentlyContinue
  } elseif ($service.Status -ne 'Running') {
    try { Start-Service -Name $service.Name -ErrorAction Stop } catch {
      Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $InstallRoot 'tools\configure-native-launcher.ps1'),'-InstallRoot',$InstallRoot) -Verb RunAs -Wait
    }
  }

  $ready = $false
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
      $health = Invoke-RestMethod -Uri "$apiUrl/api/health" -TimeoutSec 2
      if ($health.status -eq 'healthy') { $ready = $true; break }
    } catch { }
  }
  if (-not $ready) {
    $state = (Get-Service -Name 'TheBarcodeApi' -ErrorAction SilentlyContinue).Status
    throw "TheBarcode Local Server is not ready (service state: $state). Run Configure TheBarcode as Administrator and try again."
  }
  Start-Process "$apiUrl/"
} catch {
  $message = $_.Exception.Message
  Add-Content -LiteralPath $logFile -Value "$(Get-Date -Format o) $message"
  Show-LauncherError $message
  exit 1
}
