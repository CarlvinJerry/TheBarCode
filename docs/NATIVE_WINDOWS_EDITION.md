# TheBarcode native Windows edition

## Release discipline

`VERSION` is the authoritative application version. Always run `scripts\build-native-installer.ps1` after application changes intended for release. The build compiles the current web UI, API and print bridge, bundles the verified Xprinter driver and produces a versioned installer. Do not distribute an older file from `installer\output` after changing source code.

The first launch creates the shared organization, main branch and receipt defaults in PostgreSQL. Owners or managers can then configure business identity, industry profile, branches, terminals and receipt behaviour from Settings. Windows printer selection remains terminal-specific.

The native edition runs without Docker. It packages the touchscreen web interface, a self-contained ASP.NET local server, the PostgreSQL data connection, the XP-80 ESC/POS print bridge, and the verified Xprinter receipt-driver installer.

## Installer

Build output:

```text
installer\output\TheBarcode-Setup-<version>-x64.exe
```

The build script prints the SHA-256 checksum for each newly generated installer. Publish that checksum with the matching release rather than reusing a previous version's checksum.

The setup executable requires administrator rights. During configuration it:

1. Checks for an installed Xprinter/XP-80 queue and opens the bundled signed vendor driver when missing.
2. Checks for PostgreSQL. If missing, it invokes the official PostgreSQL 18 package through Windows Package Manager.
3. Requests the PostgreSQL administrator password and a private Dukora owner PIN.
4. Creates an isolated `thebarcode` role and database.
5. Installs the self-contained API as the automatic **Dukora Local Server** Windows service.
6. Adds a Private-network firewall rule for TCP 8088.
7. Starts the local XP-80 print bridge and registers it at Windows sign-in.
8. Creates desktop and Start-menu shortcuts.

Do not distribute the installer publicly until it has been code-signed by Beyond Raw Data. Windows may warn about an unsigned application even though the bundled Xprinter driver itself has a valid DigiCert-backed vendor signature.

## One institution, multiple terminals

Choose one suitable Windows computer as the outlet server and install the native Standard edition there. Its PostgreSQL service and TheBarcode Local Server own the outlet's shared operational data.

On additional terminals:

1. Open `http://SERVER-IP:8088` over the same private LAN.
2. Install the PWA shortcut when desired.
3. Open **Settings → Institution, outlet & terminal**.
4. Give every terminal a unique name such as `MAIN-BAR-01`, `KITCHEN-01`, or `RECEPTION-01`.

## Smart Insights and optional AI

Smart Insights works immediately after installation using Dukora's local rule engine. It reads PostgreSQL aggregates for sales, profit, expenses, customer credit and inventory, so no internet connection or AI account is required.

Optional AI analysis is configured on the API host—not in a browser. Set these Windows service environment values and restart **TheBarcode Local Server**:

- `Insights__Endpoint`: an OpenAI-compatible chat-completions HTTPS endpoint
- `Insights__Model`: the model identifier provided by the host
- `Insights__ApiKey`: the secret API key

Only aggregate business metrics are included in AI requests. Customer names, phone numbers and receipt-level records are excluded. If the endpoint is unavailable, Dukora automatically continues with its local rule engine.
5. Keep the shared API address as `/api` when the UI was opened from the outlet server.
6. Install the local print bridge only on terminals that have their own receipt printer.

All terminals then fetch the same products, customers, staff, stock and sales from the outlet server. Device IDs are written into sales, stock movements and audit events. A sale retains a globally unique device transaction ID, so synchronization retries do not duplicate it.

Use a reserved DHCP address or static LAN IP for the outlet server. Do not expose port 8088 directly to the public internet.

## Future hosted synchronization

The client already supports a configurable API base URL and durable device-side outbox. When the cloud API is hosted:

1. Publish a tenant-aware HTTPS API backed by managed PostgreSQL.
2. Put its address into **Shared local or hosted API URL**.
3. Register the institution, outlet and device against the hosted service.
4. Publish the Lite manifest at `https://thebarcode.beyondrawdata.com/releases/lite/latest.json` and the matching installer under the same `/releases/lite/` directory. TheBarcode falls back to `https://thebarcode.beyondrawdata.co.ke/releases/lite/latest.json` when the primary endpoint is unavailable. Custom HTTPS manifest endpoints can still be saved in Settings.

The release manifest contains the latest version, summary, download URL, SHA-256 and release notes. Dukora compares semantic versions, accepts installer downloads only from Beyond Raw Data HTTPS domains, verifies SHA-256, creates a pre-update database backup and requests Owner and Windows approval before installing and restarting. Sign production installers with the Beyond Raw Data Authenticode certificate when available.

## Deployment profiles

- **Native Windows Standard:** preferred for ordinary Windows POS computers; no Docker runtime.
- **Docker Server:** retained for powerful outlet servers, technical administrators and consistent container deployment.
- **Browser/PWA terminal:** connects to either server profile and keeps an offline transaction outbox on that terminal.

Both server profiles use PostgreSQL and the same API contracts, allowing deployments to match the user's hardware resources without maintaining separate business applications.

## Rebuilding

Install Node.js, .NET 10 SDK and Inno Setup 6, then run:

```powershell
.\scripts\build-native-installer.ps1 -Version 1.1.0
```

Generated `installer\stage` and `installer\output` directories are intentionally excluded from Git. The installer recipe, signed vendor driver, release manifest and application source are version-controlled.
