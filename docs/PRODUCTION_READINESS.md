# Production readiness checklist

Version 1.12.8 adds native startup recovery and safe Lite-to-PostgreSQL upgrade detection on top of the production hardening pass.

## Runtime checks

- `GET /api/health/live` confirms that the API process is responding.
- `GET /api/health/ready` checks that the configured database can be reached. Load balancers should route traffic only when this endpoint returns `200`.
- The API must use a managed PostgreSQL instance for shared, multi-terminal deployments. SQLite remains the Lite/offline edition.

## Client resilience

- API requests time out after 15 seconds with an actionable message.
- Offline outbox retries use bounded exponential backoff (15 seconds up to five minutes) so a disconnected terminal does not create a request storm.
- Existing idempotency keys for sales and stock movements remain the authoritative duplicate protection on the server.
- The native Windows shortcut starts the local service when needed, waits for readiness, then opens the browser; incomplete legacy configuration cannot suppress SQLite migration detection.

## Release gates before a hosted rollout

1. Configure HTTPS API and database connection secrets outside source control.
2. Restrict API CORS to the production and approved preview domains.
3. Run database backup and restore verification before applying migrations.
4. Test paid, credit, held-bill revision, expense payment, stock movement and production flows from two terminals.
5. Confirm `/api/health/live`, `/api/health/ready`, login, offline queueing and recovery after reconnect.
6. Publish a preview build, review the release notes, then promote the same commit to production.

No production deployment should run with demo data, a development JWT key, unrestricted CORS, or an unverified backup.
