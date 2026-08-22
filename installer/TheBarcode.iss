#ifndef AppVersion
  #define AppVersion "1.8.10"
#endif
#define StageDir "stage"

[Setup]
AppId={{B1D3FE72-6935-4FB0-A1F4-2B55E0D6AF19}
AppName=Dukora
AppVersion={#AppVersion}
AppPublisher=Beyond Raw Data
DefaultDirName={autopf}\Beyond Raw Data\Dukora
DefaultGroupName=Dukora
OutputDir=output
OutputBaseFilename=Dukora-Setup-{#AppVersion}-x64
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
Compression=lzma2/max
SolidCompression=yes
SetupIconFile=branding\dukora.ico
UninstallDisplayIcon={app}\branding\dukora.ico
WizardStyle=modern
WizardSmallImageFile=branding\dukora-logo.png

[Files]
Source: "{#StageDir}\api\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\print-bridge\*"; DestDir: "{app}\print-bridge"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\tools\*"; DestDir: "{app}\tools"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\driver\*"; DestDir: "{app}\driver"; Flags: ignoreversion
Source: "{#StageDir}\release\*"; DestDir: "{app}\release"; Flags: ignoreversion
Source: "branding\dukora-logo.png"; DestDir: "{app}\branding"; Flags: ignoreversion
Source: "branding\dukora-full-logo.png"; DestDir: "{app}\branding"; Flags: ignoreversion
Source: "branding\dukora.ico"; DestDir: "{app}\branding"; Flags: ignoreversion

[Icons]
Name: "{group}\Dukora"; Filename: "http://localhost:8088"; IconFilename: "{app}\branding\dukora.ico"
Name: "{autodesktop}\Dukora"; Filename: "http://localhost:8088"; IconFilename: "{app}\branding\dukora.ico"; Tasks: desktopicon
Name: "{group}\Configure Dukora"; Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\tools\configure-native-launcher.ps1"" -InstallRoot ""{app}"""; IconFilename: "{app}\branding\dukora.ico"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: checkedonce

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\tools\configure-native.ps1"" -InstallRoot ""{app}"""; Description: "Configure database, printer and Windows services"; Flags: waituntilterminated

[UninstallRun]
Filename: "sc.exe"; Parameters: "stop TheBarcodeApi"; Flags: runhidden; RunOnceId: "StopApi"
Filename: "sc.exe"; Parameters: "delete TheBarcodeApi"; Flags: runhidden; RunOnceId: "DeleteApi"
Filename: "taskkill.exe"; Parameters: "/IM TheBarcode.PrintBridge.exe /F"; Flags: runhidden; RunOnceId: "StopPrintBridge"
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""TheBarcode Local Server"""; Flags: runhidden; RunOnceId: "RemoveFirewallRule"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := IsWin64;
  if not Result then MsgBox('Dukora requires 64-bit Windows.', mbError, MB_OK);
end;
