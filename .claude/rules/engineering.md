# Classora Engineering Standard

Classora is a production SaaS product intended for real customer deployment.

It is not an MVP, prototype, demo, proof of concept, or temporary implementation.

Engineering decisions must choose the strongest technically sound solution that
Classora can responsibly build and operate within its current constraints.

The goal is not maximum architectural sophistication.

The goal is:

> Enterprise-grade within current constraints.
> Production-ready now.
> Secure by default.
> Observable and recoverable.
> Scale-ready by design.
> No MVP shortcuts.
> No enterprise theater.
> No unnecessary complexity.

## Priorities

When engineering goals conflict, optimize in this order:

1. correctness
2. security
3. tenant isolation
4. data integrity
5. reliability
6. deployment and recovery safety
7. maintainability
8. observability and auditability
9. scalability
10. performance
11. operational simplicity
12. cost efficiency
13. implementation simplicity

Simplicity remains important, but it must not override correctness, security,
reliability, data integrity, operational safety, or a clear scaling path.

The smallest implementation is not automatically the best implementation.

The most sophisticated implementation is not automatically the best
implementation either.

Prefer the simplest solution that fully satisfies the required production
guarantees.

## Best Solution Within Current Constraints

Evaluate architecture in this order:

1. determine the technically ideal solution for the actual requirement
2. identify the real project constraints
3. choose the strongest feasible production solution within those constraints
4. make limiting assumptions explicit
5. preserve a clean migration path when a constraint may change

Relevant constraints may include:

- the existing stack
- current infrastructure
- deployment topology
- operational capacity
- team size
- cost
- compatibility requirements
- existing architectural boundaries

Do not deliberately choose a weaker design merely because:

- traffic is currently low
- there are currently few tenants
- there is currently one VPS
- there is currently one API instance
- the weaker option needs less code
- the stronger option is not strictly required today

At the same time, do not introduce distributed infrastructure for hypothetical
future scale.

Current simplicity is acceptable.

Temporary engineering is not.

## Production-Grade by Default

Code merged into the product should be suitable for production unless explicitly
stated otherwise.

Where relevant, production readiness includes:

- explicit and validated configuration
- secure defaults
- authentication and authorization
- tenant isolation
- input validation
- bounded resource usage
- deterministic failure behavior
- useful error handling
- structured logging
- health/readiness checks
- actionable metrics
- auditability for sensitive operations
- safe database migrations
- backup and restore considerations
- repeatable deployments
- rollback or forward-recovery strategy
- automated tests at meaningful boundaries
- CI quality gates
- dependency and vulnerability hygiene
- operational documentation

Do not defer an obvious production requirement merely because the code can run
locally without it.

## No MVP Shortcuts

Do not optimize technical decisions for MVP speed.

Avoid shortcuts that knowingly create production risk or immediate technical
debt, including:

- hidden configuration fallbacks
- unsafe default credentials
- silent failure recovery that masks defects
- unbounded in-memory state
- authorization based on client-controlled tenant identity
- manual production schema changes
- unsafe migration baselining
- deployment steps with ambiguous partial-failure behavior
- state stored locally when correctness requires shared state
- temporary architecture with no safe evolution path
- implementation that accidentally depends on a single process or host

A simple implementation is acceptable when it is genuinely production-safe.

Simple does not mean provisional.

## No Enterprise Theater

Enterprise-grade means engineering discipline, not infrastructure quantity.

Do not introduce technologies solely to make the architecture look more
advanced.

This includes, unless a concrete requirement justifies them:

- Kubernetes
- microservices
- Redis
- Kafka
- RabbitMQ
- service mesh
- event sourcing
- CQRS
- distributed caches
- distributed tracing platforms
- multiple database servers
- multi-region infrastructure
- complex orchestration systems

Every new infrastructure dependency must justify:

- the concrete problem or risk it solves
- why the existing architecture cannot solve that problem adequately
- failure modes
- deployment impact
- operational burden
- monitoring needs
- recovery needs
- cost

Use an ADR when the change materially affects architecture or operations.

## Scale-Ready by Design

Classora does not need distributed infrastructure before it is needed.

However, implementation decisions must not unnecessarily block future
horizontal scaling.

For stateful behavior, explicitly consider the transition from:

```text
1 application instance

to:

N application instances
```

Identify whether state is:

- request-local
- process-local
- host-local
- database-backed
- externally shared

If an implementation relies on process-local or host-local state, determine
whether multiple instances would break correctness, security, or expected
semantics.

Local state is acceptable when all of the following are true:

- it is correct for the supported topology
- the topology assumption is explicit
- resource growth is bounded
- restart behavior is understood
- the component boundary allows replacement
- the migration path to shared/distributed state is clear

Do not add distributed state prematurely.

Do not design a component so tightly around local state that scaling later
requires rewriting unrelated domain behavior.

## Security by Default

Security requirements take precedence over convenience.

Always consider, where relevant:

- authentication
- authorization
- least privilege
- tenant isolation
- trusted proxy boundaries
- secret management
- input validation
- abuse protection
- rate limiting
- secure headers
- sensitive-data exposure
- dependency vulnerabilities
- logging hygiene

Never trust client-controlled data for authorization decisions.

Never weaken a security boundary solely to simplify implementation.

Never log:

- passwords
- authentication tokens
- database credentials
- secrets
- sensitive authentication material

Security-sensitive behavior should have automated tests at meaningful
boundaries.

## Tenant Isolation

Tenant isolation is a fundamental Classora security and data boundary.

Every tenant-scoped design must consider:

- tenant resolution
- membership authorization
- permission authorization
- database selection
- connection lifecycle
- request-local context
- background work
- caching
- logging
- metrics
- migrations

Never rely solely on a client-provided tenant identifier.

Never allow tenant-specific context, data, connections, or cache state to leak
between unrelated requests or tenants.

Changes touching authentication, authorization, tenant resolution, database
routing, caching, or tenant migrations require explicit tenant-isolation review.

## Data Integrity

Protecting persisted customer data is more important than implementation
convenience.

Database changes must be migration-driven.

Schema and migration work must consider:

- existing tenant databases
- newly provisioned tenant databases
- unknown or partially provisioned states
- partial migration failures
- retry safety
- idempotency where appropriate
- data preservation
- deployment ordering
- rollback or forward-recovery implications
- observability of migration status

Never manually mutate production schemas as a normal deployment strategy.

Do not mark a migration applied unless the expected prior state has been
verified safely.

Avoid destructive migrations unless there is an explicit migration and
recovery plan.

## Reliability and Failure Modes

For meaningful production changes, inspect the failure path as carefully as the
success path.

Ask:

- What happens if this operation fails halfway?
- Can it be retried safely?
- Is idempotency required?
- Can it leave partial state?
- What happens after process restart?
- What happens after host restart?
- What happens if PostgreSQL is unavailable?
- What happens during deployment?
- Can an operator identify the failure quickly?
- Can the system recover without manually editing customer data?

Do not design only for the happy path.

## Configuration

Configuration must be explicit and validated.

Required configuration should fail fast when missing or invalid.

Do not add defaults that hide deployment mistakes.

Configuration contracts should be consistent across:

- development
- test
- CI
- staging when present
- production

Tests may provide explicit test configuration, but they should not rely on
implicit fallbacks that would hide a broken production configuration contract.

Environment differences must be deliberate and documented.

## Deployment and Release Safety

Deployment is part of system design.

Separate deployment-time responsibilities from runtime responsibilities when
that produces clearer and safer failure behavior.

A production release should have explicit phases where applicable:

```text
build
  -> validate
  -> migrate
  -> deploy
  -> health check
  -> verify
```

Deployment workflows should be:

- repeatable
- observable
- fail-fast
- idempotent where practical
- recoverable

Database migrations must have explicit ownership.

Do not couple migrations to application startup when doing so makes partial
failure, retries, rollback, or availability harder to reason about.

Production releases should have a defined rollback or forward-recovery path.

## Observability and Auditability

A production system must make meaningful failures diagnosable.

Use observability proportionally to the system's needs.

Prefer:

- structured logs
- useful request or operation correlation
- health checks
- readiness checks where needed
- actionable metrics
- deployment visibility
- migration visibility
- audit events for security-sensitive or high-impact actions

Add distributed tracing only when the architecture or diagnostic need justifies
its cost.

Observability must not leak secrets or sensitive authentication material.

## Dependencies

Do not reject a dependency merely because the same behavior could technically
be implemented manually.

Do not add a dependency merely because a package exists.

Evaluate dependencies based on:

- correctness
- maturity
- security history
- maintenance status
- framework/ecosystem fit
- complexity removed
- complexity introduced
- testability
- operational implications
- migration/exit path

Prefer established framework primitives when they materially improve
correctness, security, maintainability, or operability.

Prefer local code when it provides equivalent guarantees with materially less
complexity.

Do not assume:

- custom code = MVP
- package = production
- distributed system = enterprise

Evaluate the actual engineering properties.

## Abstractions

Do not create abstractions for hypothetical reuse.

An abstraction is justified when it creates a real boundary, for example:

- multiple implementations
- external infrastructure
- a security boundary
- a domain boundary
- a persistence boundary
- a replaceable state backend
- a meaningful testing seam

Avoid:

- one-use wrapper helpers
- empty interfaces
- generic repositories without a real need
- unnecessary service layers
- pass-through components
- abstractions created only to reduce file length

Do not avoid a useful boundary merely to minimize files or lines of code.

Before introducing a new pattern, inspect the repository for an existing one.

## Maintainability

Prefer code that is:

- explicit
- typed
- cohesive
- predictable
- readable
- easy to debug
- easy to test
- consistent with appropriate nearby code

Reuse existing patterns when they remain technically sound.

Do not preserve a weak pattern solely for consistency when it creates a
security, correctness, scalability, reliability, or data-integrity problem.

Keep changes focused.

Do not perform unrelated refactors during feature work unless they are required
to implement the requested change safely.

Avoid comments that merely restate obvious code. Document invariants, unusual
constraints, and non-obvious operational reasoning instead.

## Performance

Do not perform speculative optimization.

Do not knowingly introduce obviously inefficient behavior on critical paths.

Consider, where relevant:

- database query count
- N+1 queries
- indexes based on real access patterns
- connection usage
- memory growth
- request latency
- expensive serialization
- unnecessary network calls
- batch behavior across tenant databases

Use measurement when practical.

Optimization should follow measured or clearly predictable bottlenecks rather
than hypothetical ones.

## Operational Simplicity

Operational complexity is a real engineering cost.

Prefer architectures that the current team can reliably:

- deploy
- monitor
- debug
- back up
- restore
- upgrade
- recover

A theoretically more scalable architecture that cannot be operated reliably is
not a better architecture.

Do not trade operational reliability for architectural sophistication.

## Decision Framework

When several implementation options exist, evaluate them independently.

Do not choose an option merely because:

- the user appears to prefer it
- documentation marks it as "Recommended"
- it uses more technologies
- it uses fewer technologies
- large companies commonly use it
- it is easiest to implement
- it is architecturally sophisticated
- it matches a previous recommendation

For meaningful alternatives, evaluate:

- correctness
- security
- tenant isolation
- data integrity
- reliability
- failure modes
- deployment and recovery safety
- maintainability
- observability and auditability
- scalability
- performance
- operational burden
- cost
- migration path

Choose the strongest solution justified by the requirement and current
constraints.

Do not manipulate the evaluation to match a previously expressed preference.

When a trade-off is material, state it explicitly.

## Architecture Evolution

When the ideal long-term solution exceeds current constraints:

- identify the ideal solution
- identify the constraint preventing it
- choose the strongest production-safe solution available now
- make the limiting assumption explicit
- preserve a clean migration path
- define the condition that should trigger the upgrade

Example:

```text
Current:
single application instance
+ process-local implementation

Upgrade trigger:
multiple application instances require shared correctness

Evolution:
replace the local backend with a shared backend
without rewriting domain behavior
```

Future scalability should primarily come from clean boundaries and explicit
assumptions, not premature distributed infrastructure.

## Scope Discipline

Inspect existing code before introducing a new pattern.

Reuse existing implementations when they satisfy the required guarantees.

Do not:

- refactor unrelated code
- add architecture for hypothetical features
- create wrappers that add no behavior
- split functions or components solely to reduce line count
- add dependencies for trivial functionality
- add fallbacks that hide configuration or programming errors
- introduce competing patterns for problems already solved correctly
- generate code merely because a task sounds enterprise-related

Security, accessibility, data integrity, tenant isolation, reliability, and
production safety are never sacrificed for fewer lines.

## Final Rule

When uncertain between alternatives, ask:

> What is the best engineering solution Classora can responsibly operate under
> its current constraints, without taking an MVP shortcut and without
> introducing unjustified complexity?

That answer should drive the implementation.
