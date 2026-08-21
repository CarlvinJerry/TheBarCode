# Windows installation

## First installation

1. Install and start Docker Desktop on Windows 10 or 11.
2. Open PowerShell in the `TheBarcode` folder.
3. Run `Set-ExecutionPolicy -Scope Process Bypass`.
4. Run `.\scripts\setup-windows.ps1`.
5. Choose a private owner PIN when prompted. The installer generates the database and signing secrets locally and does not commit them.
6. The app opens at `http://localhost:8088`. Sign in as staff ID `OWNER` using the PIN chosen during setup.

In Microsoft Edge or Chrome, use **Install TheBarcode** from the address bar/menu to place it on the Windows desktop and Start menu. The installed PWA retains its catalogue and unsynced sales locally when internet or the central service is unavailable.

## Daily start and backup

Run `.\scripts\start-windows.ps1` if Docker Desktop did not start the services automatically.

Back up PostgreSQL regularly. Before production rollout, choose an encrypted off-device destination and schedule a daily `pg_dump`. Never copy or publish `.env`.

## Updating

After receiving a reviewed release, stop sales entry, ensure the outbox shows zero pending records, back up PostgreSQL, then run `docker compose up -d --build` from the project folder.
