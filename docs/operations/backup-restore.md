# Backup and restore operations

Classora uses PostgreSQL database-per-tenant isolation. A production backup is complete only when it contains the trusted control database and every tenant database registered in it, and the run has been verified in private off-host storage.

## Backup contract

Run manually from the repository root:

```bash
./scripts/backup-tenants.sh run
./scripts/backup-tenants.sh status
./scripts/backup-tenants.sh last-success
```

The script reads tenant database names from the control database, validates registry identifiers, writes custom-format PostgreSQL dumps with restrictive permissions, and uses `.partial` files followed by atomic rename. A failed required dump, checksum, upload, remote verification, or retention operation exits nonzero. The registry is read again after dumps; a changed roster fails the run rather than publishing an apparently complete backup.

Each run is laid out as:

```text
<BACKUP_ROOT>/YYYY/MM/DD/<backup-id>/
  control.dump
  tenant-<slug>.dump
  registry.tsv
  manifest.tsv
  COMPLETE
```

`manifest.tsv` records the format version, backup ID, UTC timestamps, control database name, optional release version, every artifact filename, source database, tenant slug/ID, size, SHA-256 checksum, and local/off-host status. It never contains passwords, URLs, JWT secrets, R2 keys, or access tokens. `COMPLETE` is written last.

The control and tenant dumps are individually transactionally consistent PostgreSQL snapshots, but they are not one globally atomic snapshot. The databases are dumped sequentially. Schedule during a quiet period and pause tenant provisioning/writes when a strict cross-database recovery point is required; the registry snapshot guard detects roster changes but cannot invent distributed transactions.

## R2 off-host storage

Production host configuration sets `BACKUP_UPLOAD=1` and supplies the variables in [environment.md](environment.md). The script uses the installed AWS CLI against the private Cloudflare R2 S3-compatible endpoint. R2 object keys are immutable run paths under:

```text
<R2_PREFIX>/production/YYYY/MM/DD/<backup-id>/
```

The script uploads only after all local artifacts succeed. Every object is checked with `head-object` for existence, content length, and SHA-256 metadata. The `COMPLETE` marker is uploaded last. Restore downloads the listed objects and re-checks their actual size and SHA-256 content. `head-object` metadata is not presented as a substitute for downloaded-content verification.

Create a private bucket and a least-privilege R2 token limited to this prefix and the required list, put, head, and delete operations. Do not enable public bucket access. The repository does not claim client-side encryption: local protection is filesystem permissions and host controls; off-host protection relies on the private R2 bucket and its configured server-side protection.

## Retention and failure visibility

Successful local runs retain the newest three complete runs (the supported setting is 2 or 3). R2 retention is the union of 14 distinct daily runs, 8 weekly runs, and 12 monthly runs. Pruning lists and validates complete run markers first, skips malformed prefixes, and refuses broad deletion on parsing/listing errors. It never deletes the newest successful/current run.

The systemd service writes persistent status under `BACKUP_ROOT`:

```bash
./scripts/backup-tenants.sh status
./scripts/backup-tenants.sh last-success
systemctl status classora-backup.service
journalctl -u classora-backup.service
```

Operators must alert on a failed service and on a stale `last-success`, and monitor free space on the local backup filesystem. The lock directory prevents overlapping backup and restore runs on the current single VPS. If a process dies, inspect the PID and remove only a confirmed stale lock.

Install the templates from `infrastructure/systemd/` as root, provide `/etc/classora/backup.env` with mode `0600`, and enable the daily UTC timer:

```bash
systemctl daemon-reload
systemctl enable --now classora-backup.timer
systemctl list-timers classora-backup.timer
```

The timer runs at 03:15 UTC with a bounded random delay and `Persistent=true`; the service uses an absolute repository path and fails nonzero on every required backup step.

## Restore verification

Never restore blindly over production. Verify a local complete run into generated disposable names:

```bash
./scripts/restore-tenants.sh --source /var/lib/classora/backups/2026/09/20/<backup-id> --require-data
```

For R2:

```bash
./scripts/restore-tenants.sh --r2 s3://<bucket>/<prefix>/production/2026/09/20/<backup-id> --require-data
```

Before creating databases, the tool requires `COMPLETE`, validates the manifest, rejects malformed/duplicate mappings, checks every artifact size and SHA-256 checksum, and rejects unsafe source names. It restores the control database first, verifies the restored slug-to-source-database registry, creates fresh generated tenant database names, restores every tenant archive, updates only the disposable control registry to those generated names, and writes a mapping file. It checks the Prisma migration ledger, expected tenant tables, representative students when requested, and that every restored row's `tenant_id` matches its control tenant. This catches swapped tenant archives and proves isolation.

Generated databases remain for inspection unless `--cleanup` is supplied. Cleanup drops only names recorded by the current restore run and never accepts arbitrary production names. On failure, only databases created by the current run are removed.

## Single-tenant recovery

1. Stop writes for the affected tenant and preserve the damaged database where practical.
2. Select a `COMPLETE` run and verify its manifest/checksums and application/migration compatibility.
3. Run the disposable restore verifier first.
4. Confirm the target database is the registered database for that tenant and obtain human confirmation before replacement.
5. Replace or restore the single tenant only during the approved maintenance window; do not restore over an unknown destination.
6. Run tenant readiness and authenticated smoke checks.

## Full disaster recovery

Recovery order is:

1. restore PostgreSQL availability and credentials;
2. restore and validate the control database;
3. validate the trusted tenant registry and memberships;
4. create/restore every tenant database and verify the mapping file;
5. confirm application and migration-version compatibility;
6. start the API and gateway;
7. verify readiness;
8. run authenticated tenant smoke checks for each restored tenant.

Do not claim the RPO or RTO has been met without an observed drill. The initial policy target is **RPO <= 24 hours** (maximum acceptable data-loss window) and **RTO <= 4 hours** (target time to restore service). Record the measured restore duration, the selected backup timestamp, and any operator steps after each drill. Production R2 connectivity, timer execution, alert delivery, disk capacity, and a periodic full restore drill remain deployment/operator verification items until observed on the VPS.
