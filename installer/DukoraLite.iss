#ifndef AppVersion
#define AppVersion "1.12.2"
#endif
#define StageDir "stage-lite"

[Setup]
AppId={{39B83C6A-CB14-46E7-94E8-4915E6AFA6E8}
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
SetupIconFile=branding\thebarcode.ico
UninstallDisplayIcon={app}\thebarcode.ico
WizardStyle=modern
WizardSmallImageFile=branding\thebarcode-mark.png

[Files]
Source: "{#StageDir}\desktop\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\server\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\print-bridge\*"; DestDir: "{app}\print-bridge"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\prerequisites\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall
Source: "{#StageDir}\driver\Xprinter-Receipt-Driver-2025.12.22.01.exe"; DestDir: "{app}\driver"; Flags: ignoreversion
Source: "branding\thebarcode.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "branding\thebarcode-mark.png"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\driver-launcher\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Tasks]
Name: "desktopicon"; Description: "Create a TheBarcode desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: checkedonce
Name: "printerdriver"; Description: "Run the Xprinter receipt-printer driver setup"; GroupDescription: "Optional printer support:"; Flags: unchecked

[Icons]
Name: "{group}\TheBarcode"; Filename: "{app}\TheBarcode.Desktop.exe"; IconFilename: "{app}\thebarcode.ico"
Name: "{autodesktop}\TheBarcode"; Filename: "{app}\TheBarcode.Desktop.exe"; IconFilename: "{app}\thebarcode.ico"; Tasks: desktopicon
Name: "{group}\Install Xprinter Driver"; Filename: "{app}\Dukora.DriverInstaller.exe"; IconFilename: "{app}\thebarcode.ico"

[Run]
Filename: "{tmp}\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"; Parameters: "/silent /install"; StatusMsg: "Installing the Microsoft Edge WebView2 desktop runtime..."; Flags: runhidden waituntilterminated; Check: NeedsWebView2
Filename: "{app}\Dukora.DriverInstaller.exe"; StatusMsg: "Installing Xprinter receipt-printer support..."; Flags: waituntilterminated; Tasks: printerdriver
Filename: "{app}\TheBarcode.Desktop.exe"; Description: "Open TheBarcode"; Flags: postinstall nowait

[Code]
function WebView2Installed(): Boolean;
var
  Version: String;
  ClientKey: String;
begin
  ClientKey := 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  Result :=
    (RegQueryStringValue(HKLM32, ClientKey, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0')) or
    (RegQueryStringValue(HKCU32, ClientKey, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
end;

function NeedsWebView2(): Boolean;
begin
  Result := not WebView2Installed();
end;

function InitializeSetup(): Boolean;
begin
  Result := IsWin64;
  if not Result then MsgBox('TheBarcode requires 64-bit Windows.', mbError, MB_OK);
end;
