# Registration and module entitlements

TheBarcode now has an institution-level entitlement foundation that works in the local SQLite edition and the shared PostgreSQL edition.

## Current behavior

- The default `OpenPreview` plan keeps the complete product available so local development and evaluation do not lose functionality.
- The Owner can open **Settings → Plan & modules**, choose a package, choose the deployment mode and billing state, set limits, and save the entitlement.
- Core modules (Sales & POS, Inventory and Expenses) remain available in every package. Optional modules are normalized to the selected plan by the API.
- Optional routes enforce the plan and module state server-side. The UI also hides optional navigation when a module is unavailable.
- `GET /api/registration/catalog` is public and is safe to use from a future registration or marketing screen.
- `GET /api/registration` and `PUT /api/registration` are Owner-only after authentication.
- `GET /api/modules` reports the effective package, billing state and module status for the signed-in institution.

## Payment-ready data model

`organizations` now stores `plan_code`, `billing_status`, `trial_ends_at`, `deployment_mode`, `branch_limit`, `terminal_limit` and `user_limit`. Payment collection is deliberately not enforced yet. A future billing adapter can update the organization entitlement through a server-side integration without changing sales, inventory, accounting or audit tables.

The migration is additive and preserves existing SQLite/PostgreSQL data. Existing installations default to `OpenPreview` and receive all currently completed modules.

## Package catalog

Package names and limits live in `apps/api/PlanCatalog.cs`, not in the frontend. This keeps entitlement decisions authoritative on the API and leaves pricing/payment providers replaceable later.
