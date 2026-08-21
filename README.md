# TheBarcode

Windows-first, offline-capable point of sale and inventory system for a bar, café, food counter, and kitchen. The repository replaces the Shiny proof of concept while preserving its operational workflows.

## Architecture

- `apps/web`: installable React/TypeScript touchscreen PWA with IndexedDB and an offline synchronization outbox.
- `apps/api`: ASP.NET Core API with JWT role authorization, audit events, idempotent sale synchronization, and PostgreSQL.
- `tests`: automated API and domain tests.
- PostgreSQL is the central source of truth. Each POS device continues operating from its local browser database when disconnected.

## Local prerequisites

- Windows 10/11
- Docker Desktop
- .NET 10 SDK
- Node.js 22+

## Secure configuration

Copy `.env.example` to `.env` and replace every value. Never commit `.env`. The first owner account is created using `BOOTSTRAP_ADMIN_PIN`; individual staff accounts and PINs are added after login.

## Start PostgreSQL and API

```powershell
docker compose up -d --build
```

The API is available at `http://localhost:8080/api/health`.

## Start the touchscreen app

```powershell
cd apps/web
npm install
npm run dev
```

Open `http://localhost:5173`. Installation and P510 testing instructions will be finalized after the product workflows are accepted.
