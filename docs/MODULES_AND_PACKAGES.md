# Dukora modules and package boundaries

Version 1.9.0 introduces a module registry in **Open Preview** mode. Every completed module remains visible while the product is tested. Roles still govern approvals, staff administration, archival, refunds and other sensitive actions. Subscription enforcement will be connected later without duplicating the application or its data.

## Proposed packages

| Package | Completed modules included | Intended customer |
|---|---|---|
| Starter | Sales & POS, bills and credit, inventory, customers, expenses, essential reports | Small single-site retail or hospitality business |
| Growth | Starter plus recipes and production, Smart Insights, bulk imports and advanced inventory | Bakery, café, restaurant and growing retailer |
| Business | Growth plus future procurement, accounting, services and multi-branch controls | Multi-department or multi-branch operator |
| Enterprise | Business plus future HR/payroll, communications, integrations, SSO and governed API access | Larger institutions and tailored deployments |

## Separation rules

- Sales owns orders, bills, receipts and payments. It requests stock consumption; it does not edit ingredient balances directly.
- Inventory owns items, units, balances and immutable stock movements.
- Production owns recipes, versions and production runs. A completed run consumes ingredients and produces finished stock atomically.
- Expenses owns operating obligations, approvals and settlements. Only active approved expenses enter profit reporting.
- Reporting reads posted transactions from each module and never invents values.
- Entitlements control access at the module boundary. Role permissions continue to control actions inside an enabled module.
- Demo and live institution data remain isolated in every module.

Modules not yet implemented are deliberately absent from navigation. They will be enabled only after their setup, transactions, permissions, audit, reports, tests and upgrade-safe migrations are complete.
