# Dukora Lite for Windows

Dukora Lite is the low-resource, offline-first Windows edition. It uses the same web interface, API, business rules, reports, Smart Insights and receipt-printing integration as Dukora Server.

## What changes

- SQLite replaces the separately installed PostgreSQL service.
- `Dukora.Desktop.exe` starts the local API and print bridge only while Dukora is open.
- Microsoft WebView2 displays the existing React UI in a branded desktop window.
- Data is stored per Windows user under `%LOCALAPPDATA%\Beyond Raw Data\Dukora Lite`.
- The owner chooses a private PIN on first launch; it is protected with Windows DPAPI.

## Installation

Installer: `installer\output\Dukora-Lite-Setup-1.7.0-x64.exe`

## Bulk item setup

- Item Setup provides an Excel-compatible CSV template and validates every row before importing.
- A product's stock unit is stored separately from its package quantity and package unit: for example, `24 bottle` stock with a `500 ml` package size.
- Discrete stock (bottles, bags, pieces and packs) requires whole quantities. Measured stock (kg, g, L and ml) supports three decimal places.
- Separate sizes remain separate product variants with independent SKU/barcode, prices, cost, stock and reorder thresholds.
- Duplicate handling is explicit: skip the existing variant, update details only, or update details and add opening stock.
- Every import is recorded as a batch. Owners and Managers may reverse it only while no later sale, stock movement or controlled item edit depends on the imported records.

## Governed bill workflow

- **Held** is an editable unpaid order. Printing an unpaid copy creates the numbered held bill but does not post revenue, debt, profit or inventory.
- Adding items is permitted to normal sales users. Reducing quantities/prices, increasing discounts and cancelling require an Owner or Manager session, a reason and an audit record.
- Every held-bill edit creates an immutable numbered revision. An expected-revision check prevents one terminal from overwriting another terminal's changes.
- **Paid**, **Credit** and **PartiallyPaid** are posted transactions. Posting validates stock and commits inventory movements, accounting values, payments and audit history in one database transaction.
- Credit requires a registered customer. Later payments remain attached to the original invoice until its balance reaches zero.
- Refunds are controlled reversals: they restore inventory, reverse the recorded payment and exclude the refunded sale from live revenue and profit.
- Items, customers and staff are archived/deactivated rather than physically removed so historical documents remain valid.

Display size is configured under **Settings → Display size**. Compact, Standard, Large and Extra large scale the complete interface and persist on that Windows terminal.

1. Run `Dukora-Lite-Setup-<version>-x64.exe` and approve Windows setup.
2. Leave **Create a Dukora Lite desktop shortcut** selected if desired.
3. Select the optional Xprinter driver only when the computer does not already have the working XP-80 driver.
4. Open Dukora Lite and create the private Owner PIN.

No PostgreSQL password, Docker, firewall rule or Windows service is required. Setup includes Microsoft's full offline x64 Evergreen WebView2 runtime. If the embedded view still cannot initialize, Dukora records the exact error and opens the same local interface in the default browser while keeping the API and printing process running.

The optional Xprinter task runs during elevated setup. To install or repair it later, open **Start → Dukora Lite → Install Xprinter Driver** and approve the Windows UAC prompt.

## Backups and Server migration

Back up `%LOCALAPPDATA%\Beyond Raw Data\Dukora Lite\dukora.db` while Dukora is closed. A future migration utility will move the same domain records to the PostgreSQL Server or hosted Cloud edition. Do not copy a live SQLite WAL database while Dukora is open.
