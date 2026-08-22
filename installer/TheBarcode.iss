#ifndef AppVersion
  #define AppVersion "1.2.0"
#endif
#define StageDir "stage"

[Setup]
AppId={{B1D3FE72-6935-4FB0-A1F4-2B55E0D6AF19}
AppName=TheBarcode
AppVersion={#AppVersion}
AppPublisher=Beyond Raw Data
DefaultDirName={autopf}\Beyond Raw Data\TheBarcode
DefaultGroupName=TheBarcode
OutputDir=output
OutputBaseFilename=TheBarcode-Setup-{#AppVersion}-x64
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
Compression=lzma2/max
SolidCompression=yes
UninstallDisplayIcon={app}\TheBarcode.Api.exe
WizardStyle=modern

[Files]
Source: "{#StageDir}\api\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\print-bridge\*"; DestDir: "{app}\print-bridge"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\tools\*"; DestDir: "{app}\tools"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\driver\*"; DestDir: "{app}\driver"; Flags: ignoreversion
Source: "{#StageDir}\release\*"; DestDir: "{app}\release"; Flags: ignoreversion

[Icons]
Name: "{group}\TheBarcode"; Filename: "http://localhost:8088"
Name: "{autodesktop}\TheBarcode"; Filename: "http://localhost:8088"; Tasks: desktopicon
Name: "{group}\Configure TheBarcode"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\tools\configure-native.ps1"" -InstallRoot ""{app}"""

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: checkedonce

[Run]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\tools\configure-native.ps1"" -InstallRoot ""{app}"""; Description: "Configure database, printer and Windows services"; Flags: postinstall waituntilterminated runascurrentuser
Filename: "http://localhost:8088"; Description: "Open TheBarcode"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "sc.exe"; Parameters: "stop TheBarcodeApi"; Flags: runhidden; RunOnceId: "StopApi"
Filename: "sc.exe"; Parameters: "delete TheBarcodeApi"; Flags: runhidden; RunOnceId: "DeleteApi"
Filename: "taskkill.exe"; Parameters: "/IM TheBarcode.PrintBridge.exe /F"; Flags: runhidden; RunOnceId: "StopPrintBridge"
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""TheBarcode Local Server"""; Flags: runhidden; RunOnceId: "RemoveFirewallRule"

[Code]
function InitializeSetup(): Boolean;
begin
  Result := IsWin64;
  if not Result then MsgBox('TheBarcode requires 64-bit Windows.', mbError, MB_OK);
end;
