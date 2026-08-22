# Install TheBarcode on another Windows computer

This guide installs a complete standalone copy of TheBarcode on a Windows 10 or Windows 11 computer. The computer will run the web interface, API and PostgreSQL database locally, so sales can continue when the internet is unavailable.

## 1. Check the computer

Recommended minimum for the current Docker installation:

- 64-bit Windows 10 or 11
- 8 GB RAM; 4 GB may work but Docker Desktop will feel slow
- 10 GB free disk space
- A current Microsoft Edge or Google Chrome installation
- Administrator access for installing Docker Desktop and the printer driver

For a low-spec machine, do not run unrelated Docker containers. Configure Docker Desktop to use about 2 GB memory and two processor cores. A future native Windows package can remove Docker Desktop, but the current supported installer uses Docker.

## 2. Copy the application

Copy the complete `TheBarcode` project folder to the target computer, for example:

```text
C:\TheBarcode
```

Do not copy `.env` when this should be a new independent installation. The setup script will create new database credentials and ask for a new owner PIN.

If the target must contain the existing business database, follow **Move an existing database** below instead of starting live sales immediately.

## 3. Install Docker Desktop

1. Install Docker Desktop from the official Docker website.
2. During installation, enable the WSL 2 backend when offered.
3. Restart Windows if requested.
4. Start Docker Desktop and wait until it reports that Docker is running.

## 4. Run the TheBarcode installer

Open PowerShell inside `C:\TheBarcode`, then run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup-windows.ps1
```

Enter a private owner PIN of at least six characters. The installer creates local secrets, builds the application and opens:

```text
http://localhost:8088
```

Sign in as **Admin · Owner** using the PIN selected during installation. The removable demo account is **Demo User** with PIN **123456**.

## 5. Install it as a Windows app

In Microsoft Edge:

1. Open `http://localhost:8088`.
2. Select the install icon in the address bar, or choose **⋯ → Apps → Install TheBarcode**.
3. Enable the desktop and Start-menu shortcuts.
4. Launch TheBarcode using the new shortcut.

It will open in a dedicated app window. The underlying application still uses web technology, but ordinary users do not need to work in a browser tab.

## 6. Configure the institution and receipt

Sign in as Admin and open **Settings → Business profile**.

1. Enter the institution or business name.
2. Enter the receipt footer.
3. Select **Save receipt identity**.

The institution name is printed at the top of every receipt. A selected registered customer is printed below it; walk-in sales print **Walk-in customer**.

## 7. Connect the P510 printer

TheBarcode prints through the normal Windows printer queue. This supports either connection supplied by the P510:

### USB

1. Connect the printer by USB.
2. Install its Windows driver if Windows does not do so automatically.
3. Open **Settings → Bluetooth & devices → Printers & scanners**.
4. Confirm that a Windows test page prints.

### Bluetooth

1. Put the P510 in pairing mode.
2. Pair it under **Settings → Bluetooth & devices**.
3. Install or select the matching Windows printer driver.
4. Confirm that a Windows test page prints.

For either connection:

1. Set paper width to 58 mm in printer preferences.
2. Set the P510 as the default printer during testing.
3. Open **TheBarcode → Settings → Receipt printer → Print test receipt**.
4. Complete cash, M-Pesa and named-customer credit sales and verify each receipt.

The current application does not send raw ESC/POS bytes directly to USB or Bluetooth. The browser opens the Windows print workflow, and Windows sends the job through the selected USB or Bluetooth printer driver. This is more reliable across different computers and connection types. Silent printing would require a separately installed local print bridge or controlled kiosk configuration and should be evaluated after the P510 driver is tested.

## 8. Confirm offline operation

1. Sign in and allow the catalogue to load.
2. Disconnect Wi-Fi or unplug the internet connection.
3. Record a test sale and print its receipt.
4. Confirm the header says **Offline ready** and the queued count increases.
5. Reconnect the network.
6. Select **Settings → Sync now** and confirm the queued count returns to zero.

Do not clear browser site data: it contains the device's offline catalogue and unsynchronized work.

## 9. Move an existing database

On the old computer, from the project folder:

```powershell
docker compose exec postgres sh -c "pg_dump -U thebarcode -d thebarcode -Fc -f /tmp/thebarcode.backup"
docker compose cp postgres:/tmp/thebarcode.backup .\thebarcode.backup
```

Copy `thebarcode.backup` securely to the new computer. Complete the new installation and stop sales entry. From the new project folder, restore it with:

```powershell
docker compose cp .\thebarcode.backup postgres:/tmp/thebarcode.backup
docker compose exec postgres pg_restore -U thebarcode -d thebarcode --clean --if-exists /tmp/thebarcode.backup
docker compose restart api
```

Restoration replaces matching operational database objects. Only run it against a new or intentionally replaceable installation, and retain the verified backup until all totals and staff accounts have been checked.

Keep `.env` private. It contains database and token-signing secrets and must not be emailed, published or committed to Git.

## 10. Daily startup, updates and troubleshooting

Start Docker Desktop, then run:

```powershell
.\scripts\start-windows.ps1
```

To install a reviewed update:

```powershell
docker compose up -d --build
```

If the app does not open:

```powershell
docker compose ps
docker compose logs --tail 100
```

If a new interface is deployed but the old one appears, close and reopen the installed PWA or refresh twice so its offline service worker activates the update.
