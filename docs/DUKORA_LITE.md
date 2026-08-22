# Dukora Lite for Windows

Dukora Lite is the low-resource, offline-first Windows edition. It uses the same web interface, API, business rules, reports, Smart Insights and receipt-printing integration as Dukora Server.

## What changes

- SQLite replaces the separately installed PostgreSQL service.
- `Dukora.Desktop.exe` starts the local API and print bridge only while Dukora is open.
- Microsoft WebView2 displays the existing React UI in a branded desktop window.
- Data is stored per Windows user under `%LOCALAPPDATA%\Beyond Raw Data\Dukora Lite`.
- The owner chooses a private PIN on first launch; it is protected with Windows DPAPI.

## Installation

Installer: `installer\output\Dukora-Lite-Setup-1.5.1-x64.exe`

1. Run `Dukora-Lite-Setup-<version>-x64.exe` and approve Windows setup.
2. Leave **Create a Dukora Lite desktop shortcut** selected if desired.
3. Select the optional Xprinter driver only when the computer does not already have the working XP-80 driver.
4. Open Dukora Lite and create the private Owner PIN.

No PostgreSQL password, Docker, firewall rule or Windows service is required. Setup includes Microsoft's full offline x64 Evergreen WebView2 runtime. If the embedded view still cannot initialize, Dukora records the exact error and opens the same local interface in the default browser while keeping the API and printing process running.

## Backups and Server migration

Back up `%LOCALAPPDATA%\Beyond Raw Data\Dukora Lite\dukora.db` while Dukora is closed. A future migration utility will move the same domain records to the PostgreSQL Server or hosted Cloud edition. Do not copy a live SQLite WAL database while Dukora is open.
