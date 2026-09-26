# LOCAL-12 Parent / Student Portal

## Identity

Classora uses one global credential identity and separate tenant authorization paths:

```text
User
├─ TenantMembership -> Staff App
└─ PortalAccess
   ├─ Guardian -> current linked Students
   └─ Student  -> self
```

`PortalAccess != TenantMembership`. Portal access does not add a `TenantRole`, staff permission, alternate password, JWT secret, or tenant credential record. A User may legitimately have staff membership and portal access without those privileges blending.

## Invitation lifecycle

Staff with `portal.manage` may invite an existing Guardian or Student whose current tenant profile has a valid email. The profile email is authoritative; staff cannot choose an unrelated login email.

The API returns the raw activation token only in the invite/resend response. It stores a SHA-256 hash, expiry, creator, subject and tenant. Resend revokes the previous pending invitation. Acceptance is single-use and transactionally creates or reuses the global User and creates one active PortalAccess for the tenant subject. Existing Users must sign in with the invited email. No TenantMembership is created or changed.

Security-sensitive changes are recorded in the control audit log as `portal.invited`, `portal.invitation_resent`, `portal.invitation_revoked`, `portal.activated`, `portal.disabled`, `portal.enabled`, and `portal.removed`. Tokens and passwords are excluded.

## Authorization

Tenant identity always comes from the validated hostname. `PortalAccessGuard` loads active grants for the authenticated User and resolved tenant, validates every subject in that tenant database, and attaches a trusted portal context.

Guardian Students are derived from current `StudentGuardian` rows. Removing a relationship removes the child on the next request. Student access is self-only. Every route containing a Student ID checks that ID against the derived set before querying, preventing cross-student and cross-tenant IDOR.

Billing is a second authorization boundary. A Guardian can view a Student's billing only while their current relationship has `isBillingContact = true`. Other linked Guardians and Student subjects are denied. Removing billing-contact status takes effect immediately.

## Portal projections

The portal is read-only in LOCAL-12.

- Profile: Student ID, code, full name, status, date of birth, school.
- Enrollments: Class, Course, Level, Branch, status and lifecycle dates.
- Schedule: bounded date range; Session date/time/status, Class, Course/Level, Teacher name, Room and Branch. Future sessions require current TRIAL/ACTIVE participation; historical participation uses persisted attendance truth.
- Attendance: LOCKED sheets only; status and academic context. Provisional OPEN records, notes and correction history are excluded. One formula counts PRESENT/LATE/ONLINE/MAKEUP as attended and both absence statuses as absent.
- Makeup: current entitlement and booked/used destination Session information; no booking mutation.
- Billing: issued/void invoice number and dates, allowlisted items, gross/credit/paid/outstanding and effective status from the LOCAL-08 ledger, plus payment method/date/amount and refund date/amount. Internal ledger IDs, references, notes, reversals and audit metadata are excluded.
- Notifications: LOCAL-11 `CommunicationMessage` rows where `channel = IN_APP` and recipient type/ID exactly match an authenticated Guardian or Student subject. The immutable rendered event type, subject, body and creation time are returned. No second notification store or unread model exists.

Internal Student notes, source/CRM metadata, tags, audit events, teacher contact details, compensation, staff communication history and internal financial fields are never included.

## Web surface

The existing Vite application provides separate `/portal/*` routes and a lightweight responsive `PortalShell`. Portal login uses the existing `/auth/login` endpoint and token. `PortalProtectedRoute` authorizes only through `/portal/me`; the staff shell and membership-based `ProtectedRoute` remain separate.

Parents can switch between currently linked Students and see billing navigation only for billing-authorized children. Students see only their own academic information and notifications. The portal uses Classora's existing Vietnamese-first tokens and components, with mobile navigation and structured record layouts at 390px.

## Verification boundaries

Automated coverage includes token hashing, new and existing User activation, replay and concurrency, no membership creation, active/disabled access, relationship-derived children, Student IDOR, billing-contact revocation, finalized attendance allowlists, exact IN_APP recipient isolation, dual identity, and cross-tenant subject/Student probes. The control migration owns the new tables and constraints; tenant schemas remain unchanged and continue through the existing fresh/legacy/drift/idempotency gate.
