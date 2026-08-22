#ifndef AppVersion
#define AppVersion "1.8.2"
#endif
#define StageDir "stage-lite"

[Setup]
AppId={{39B83C6A-CB14-46E7-94E8-4915E6AFA6E8}
AppName=Dukora Lite
AppVersion={#AppVersion}
AppPublisher=Beyond Raw Data
DefaultDirName={autopf}\Beyond Raw Data\Dukora Lite
DefaultGroupName=Dukora Lite
OutputDir=output
OutputBaseFilename=Dukora-Lite-Setup-{#AppVersion}-x64
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
Compression=lzma2/max
SolidCompression=yes
SetupIconFile=branding\dukora.ico
UninstallDisplayIcon={app}\dukora.ico
WizardStyle=modern
WizardSmallImageFile=branding\dukora-logo.png

[Files]
Source: "{#StageDir}\desktop\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\server\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\print-bridge\*"; DestDir: "{app}\print-bridge"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\prerequisites\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall
Source: "{#StageDir}\driver\Xprinter-Receipt-Driver-2025.12.22.01.exe"; DestDir: "{app}\driver"; Flags: ignoreversion
Source: "branding\dukora.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\driver-launcher\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Tasks]
Name: "desktopicon"; Description: "Create a Dukora Lite desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: checkedonce
Name: "printerdriver"; Description: "Run the Xprinter receipt-printer driver setup"; GroupDescription: "Optional printer support:"; Flags: unchecked

[Icons]
Name: "{group}\Dukora Lite"; Filename: "{app}\Dukora.Desktop.exe"; IconFilename: "{app}\dukora.ico"
Name: "{autodesktop}\Dukora Lite"; Filename: "{app}\Dukora.Desktop.exe"; IconFilename: "{app}\dukora.ico"; Tasks: desktopicon
Name: "{group}\Install Xprinter Driver"; Filename: "{app}\Dukora.DriverInstaller.exe"; IconFilename: "{app}\dukora.ico"

[Run]
Filename: "{tmp}\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"; Parameters: "/silent /install"; StatusMsg: "Installing the Microsoft desktop runtime..."; Flags: runhidden waituntilterminated
Filename: "{app}\Dukora.DriverInstaller.exe"; StatusMsg: "Installing Xprinter receipt-printer support..."; Flags: waituntilterminated; Tasks: printerdriver
Filename: "{app}\Dukora.Desktop.exe"; Description: "Open Dukora Lite"; Flags: postinstall nowait skipifsilent

[Code]
function InitializeSetup(): Boolean;
begin
  Result := IsWin64;
  if not Result then MsgBox('Dukora Lite requires 64-bit Windows.', mbError, MB_OK);
end;
