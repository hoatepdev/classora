# Classora Local Roadmap

Execution ledger for the local product roadmap. LOCAL-00 is the foundation
verification gate; later work must not be started until its hard gates pass.

| ID | Stage | Status |
|---|---|---|
| LOCAL-00 | Baseline & Foundation Verification | BLOCKED |
| LOCAL-01 | Identity, Authorization & Team | BLOCKED |

LOCAL-00 blocker: GitHub Actions has not been run on this final branch state, so
Gate G (green CI) is not yet demonstrated. LOCAL-01 becomes NEXT only after
that gate passes.
| LOCAL-02 | Audit Log | Planned |
| LOCAL-03 | Student 360 + Guardians | Planned |
| LOCAL-04 | Branch + Room + Teacher/Course completion | Planned |
| LOCAL-05 | Enrollment Lifecycle | Planned |
| LOCAL-06 | Scheduling + Session Engine | Planned |
| LOCAL-07 | Attendance + Makeup | Planned |
| LOCAL-08 | Billing / Tuition | Planned |
| LOCAL-09 | Teacher Compensation | Planned |
| LOCAL-10 | CRM | Planned |
| LOCAL-11 | Communication | Planned |
| LOCAL-12 | Parent / Student Portal | Planned |
| LOCAL-13 | Progress / Assessment | Planned |
| LOCAL-14 | Dashboard | Planned |
| LOCAL-15 | Reporting | Planned |
| LOCAL-16 | Import / Export | Planned |
| LOCAL-17 | Files | Planned |
| LOCAL-18 | Automations | Planned |
| LOCAL-19 | Multi-branch | Planned |
| LOCAL-20 | Tenant Administration | Planned |
| LOCAL-21 | SaaS Plans / Entitlements | Planned |
| LOCAL-22 | Integrations | Planned |
| LOCAL-23 | AI Features | Planned |
| LOCAL-24 | UX Consistency Pass | Planned |
| LOCAL-25 | Full Local Acceptance | Planned |

## LOCAL-00 notes

Verified foundation areas include the locked dependency install, TypeScript
checks, web/API builds, API tests, tenant hostname authorization ordering,
provisioning failure handling, migration fail-closed behavior, and the
same-origin gateway contract. The disposable Compose smoke remains the
real-database acceptance path.

Non-blocking follow-up: configure a repository lint policy/toolchain and add
focused web tests when a concrete frontend regression boundary exists.
