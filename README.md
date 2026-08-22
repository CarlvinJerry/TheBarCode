# Dukora

**Smarter Business Operations**

Current version: **1.8.5** (see `VERSION`). Native installers must be rebuilt after every releasable change so the installer always contains the current UI, API, database initialization and print bridge.

Windows deployment profiles:

- **Dukora Lite:** SQLite plus a branded WebView2 desktop host; no PostgreSQL, Docker or Windows service.
- **Dukora Server:** PostgreSQL-backed local-network installation for concurrent terminals.
- **Docker:** retained for capable hosts and future cloud deployments.

Windows-first, offline-capable point of sale and inventory system for a bar, café, food counter, and kitchen. The repository replaces the Shiny proof of concept while preserving its operational workflows.

## Architecture

- `apps/web`: installable React/TypeScript touchscreen PWA with IndexedDB and an offline synchronization outbox.
- `apps/api`: ASP.NET Core API with JWT role authorization, audit events, idempotent sale synchronization, and PostgreSQL.
- `tests`: automated API and domain tests.
- PostgreSQL is the central source of truth. Each POS device continues operating from its local browser database when disconnected.

## Windows prerequisites

- Windows 10/11
- Docker Desktop

.NET and Node.js are only required for development; the packaged installation runs them inside containers.

## Secure configuration

Copy `.env.example` to `.env` and replace every value. Never commit `.env`. The first owner account is created using `BOOTSTRAP_ADMIN_PIN`; individual staff accounts and PINs are added after login.

## Install the complete app

```powershell
.\scripts\setup-windows.ps1
```

The touchscreen app opens at `http://localhost:8088`. See `docs/WINDOWS_INSTALLATION.md`, `docs/INSTALL_ON_ANOTHER_WINDOWS_PC.md` and `docs/P510_PRINTER_TEST.md` for installation, transfer to another computer, offline use and receipt acceptance testing.

For the self-contained non-Docker Windows installer, shared outlet terminals, versioning and future cloud endpoint configuration, see `docs/NATIVE_WINDOWS_EDITION.md`.

## Development

Run PostgreSQL and the API with Docker Compose, then run `npm install` and `npm run dev` inside `apps/web`. Vite proxies `/api` to the local API.
