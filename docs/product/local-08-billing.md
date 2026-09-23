# LOCAL-08 Billing and Tuition Semantics

This document records the LOCAL-08 product and verification contract. It does
not claim that the implementation or its verification gates have passed.

## Money and currency

- Monetary values are persisted as PostgreSQL `BIGINT amount_minor` values.
- The currency for LOCAL-08 is VND. Amounts are integer minor units; no
  floating-point arithmetic, decimal rounding, or formatted strings may be
  used for persisted financial values.
- Calculations operate on persisted integer values. Formatting is a display
  concern and must not change an amount.
- Client-supplied totals are never authoritative; totals are derived from the
  persisted append-only entries.

## Billing status

Billing documents support exactly these statuses:

```text
DRAFT -> ISSUED -> VOID
```

Status is effective-dated. A read at an `asOf` instant uses the latest status
whose effective time is at or before `asOf`; when effective timestamps tie, the
specified status precedence is applied deterministically rather than relying
on database row order. `VOID` is terminal for the document. Historical
statuses remain readable, and a future-effective status must not affect an
earlier `asOf` view.

The implementation must encode this precedence and tie-break rule in the
persistence/query boundary. It must not accept an arbitrary derived status
from the client.

## Required formulas

The financial summary is derived with integer arithmetic:

```text
gross      = sum(charge line amount_minor)
credit     = sum(applied CreditNote amount_minor)
netDue     = gross - credit
paid       = sum(Payment amount_minor)
            - sum(Reversal amount_minor)
            - sum(Refund amount_minor)
outstanding = netDue - paid
```

A `CreditNote` reduces what is owed; it is not a payment and must not be
counted in `paid`. A Payment records collection against the invoice. A
Reversal or Refund is an append-only negative correction to collected money,
with its own actor, reason, and linkage to the affected entry. The implementation
must keep these categories distinct so that `netDue`, `paid`, and
`outstanding` remain explainable.

## Append-only financial history

Posted charges and every Payment, Reversal, Refund, CreditNote, and status
change are immutable. Corrections append a new linked entry; they never edit
or delete the original row. The original and its correction remain visible in
history, and the formulas above are reproducible from that history.

Every balance-affecting mutation must be atomic with its audit event. Failed
transactions leave the prior ledger unchanged. Retries must be protected by a
stable idempotency key or equivalent uniqueness rule so a retry cannot apply a
financial effect twice.

## Permissions and audit

Use the centralized permissions below, not role-name checks:

- `billing.read` for billing reads;
- `billing.manage` for billing-document and configuration management;
- `billing.collect` for recording collection/payment entries;
- `billing.refund` for refunds and refund corrections.

The implementation must enforce least privilege for each operation. A
correction or refund must not be reachable through a weaker read or collect
permission alone.

Every billing mutation writes a tenant audit event in the same database
transaction. The event includes the stable resource action, entity and entry
identifiers, trusted actor, safe before/after or delta data, reason, request
ID, and occurrence time. Payment credentials and other sensitive instrument
material must never be stored in or copied to audit snapshots.

## Tenant isolation and concurrency

Tenant context is resolved from the trusted authenticated host/membership
flow before tenant storage is queried. A client-provided tenant ID or database
selector is not an authorization input. Tenant-qualified foreign keys and
queries must prevent cross-tenant references and reads.

Balance-affecting writes use a transaction and a tenant-local lock for the
relevant billing document or account. Concurrent collection, reversal, refund,
correction, and status operations must serialize to one valid result, preserve
append-only history, and reject duplicate idempotency keys. A retry after a
serialization or unique-conflict failure must be safe and observable.

## Verification gates

The following execution items remain pending until actually run against the
implementation and supported database setup:

- focused money/formula and effective-status tests;
- append-only Payment/Reversal/Refund/CreditNote correction tests;
- permission and same-transaction audit tests;
- cross-tenant isolation tests;
- concurrent balance-affecting request tests;
- migration/schema and full API test gates.

No roadmap status is changed by this document.
