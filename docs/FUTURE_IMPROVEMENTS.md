# Internal product backlog

This document is for Beyond Raw Data development planning. It is not copied into the installed application and must not be shown in customer-facing screens or installer release notes.

## Product and inventory model

- Product types: stocked, prepared, manufactured, service, bundle, variable-weight and custom-order.
- Delivered in 1.7.0: package-size variants, discrete/measured stock units, bulk CSV validation, duplicate policies and dependency-safe import reversal.
- Remaining: modifiers and explicitly configured unit conversions. Never infer conversions from product names.
- Recipes/bills of materials with automatic ingredient consumption.
- Batch, expiry, wastage and spoilage controls.
- Purchasing, suppliers, purchase orders and goods received notes.

## Highest-priority production gaps

- Formal tax engine: inclusive/exclusive pricing, tax categories, exemptions, per-line rounding and jurisdiction-ready tax reports.
- Stocktake sessions, variance approval, damaged/expired stock, batch/lot traceability and expiry-first issuing.
- Recipes and bills of materials so prepared food and cocktails consume exact ingredient quantities and preserve yield/cost history.
- Purchasing workflow: supplier catalogues, purchase orders, partial receiving, landed cost and supplier returns.
- Cashier shifts: opening float, cash drawer movements, end-of-shift reconciliation, variance approval and cashier accountability.
- Tested backup/restore UI, scheduled encrypted backups and a disaster-recovery verification routine.
- Hosted multi-terminal sync with tenant isolation, idempotency, conflict rules and an offline conflict-resolution screen.
- Granular permission policies for price overrides, discounts, voids, refunds, stock adjustments, exports and sensitive customer data.
- Partial returns/exchanges and credit-note allocation at individual sale-line level.
- Branch/warehouse-specific stock balances and controlled inter-branch transfers.
- Performance, penetration, recovery and fiscal-calculation test suites before broad commercial rollout.

## Industry modules

- Bakery: custom cake orders, deposits, reference images, collection/delivery dates and production scheduling.
- Restaurant: tables, kitchen tickets, courses and order routing.
- Hotel: rooms, folios and guest charging.
- Services: appointments, staff assignment and service duration.
- Profile-driven navigation, terminology, dashboards and permissions.

## People and finance

- Employee records, attendance, shifts, leave and payroll preparation.
- Cash drawer shifts, reconciliation, refunds and supervisor approvals.
- Quotations, invoices, credit notes, delivery notes and a shared document engine.
- Customer statements, due dates, payment allocation and settlement receipts.

## Connectivity and compliance

- Hosted synchronization API with tenant isolation and conflict handling.
- M-Pesa reconciliation and payment callbacks.
- KRA/eTIMS integration.
- Signed automatic updates with staged channels and rollback.
- Digital receipts, QR verification and optional email/WhatsApp delivery.
- Opt-in WhatsApp daily summaries and stock alerts through Meta Cloud API or an approved BSP: encrypted credentials, approved templates, designated recipients, retry/outbox delivery, rate limiting, consent audit and delivery-status tracking. Never automate through WhatsApp Web or an unofficial personal-account bot.
