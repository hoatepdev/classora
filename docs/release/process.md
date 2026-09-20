# Classora release process

A release is a Git tag `vX.Y.Z` on a reviewed commit. `main` must remain releasable; the tag, commit SHA, and image digests are one immutable release record.

## 1. Verify

Before tagging, CI must pass on the commit:

```bash
pnpm install --frozen-lockfile
pnpm --filter web build
pnpm --filter api build
pnpm --filter api test
```

The disposable Compose smoke also runs B5 schema equivalence and the B6 backup/restore drill. Do not tag a commit with a failed gate.

## 2. Tag and publish

Create and push an annotated version tag from the reviewed commit:

```bash
git tag -a vX.Y.Z -m 'Release vX.Y.Z' <commit-sha>
git push origin vX.Y.Z
```

The tag-only GitHub Actions workflow builds each application image once and publishes it to GHCR with the release tag and full commit SHA as discovery aliases. It does not publish or deploy `latest`. The workflow records:

- release tag;
- exact Git commit SHA;
- web image digest;
- API image digest;
- digest-qualified `WEB_IMAGE` and `API_IMAGE` values.

Only the digest-qualified values are valid deployment inputs.

## 3. Back up and verify

Run the production backup and complete the verification/checksum step. Keep the resulting success marker and manifest available to the operator. A deployment must stop if the verified backup marker is missing or empty.

## 4. Deploy explicitly

On the VPS, operators provide the release manifest values and invoke `scripts/deploy-prod.sh`. The script validates the environment, free Docker disk, current release record, exact image digests, and merged production Compose configuration. It pulls the exact images, then runs exactly one serialized `api-migrate` job.

Only a successful migration permits the new `api` and `web` containers to start. A failed migration stops the script and does not start the new application release. Migration is forward-only; the script never attempts an automatic rollback.

## 5. Verify

The deployment script checks readiness through the loopback gateway using the tenant `Host`. Operators then run the authenticated smoke checks and verify the Cloudflare path. Record the release manifest, backup marker, readiness response, smoke result, and operator identity with the release record.

## 6. Rollback decision

An application-only rollback selects the previous immutable web/API image pair and does not run migrations. It is valid only when the previous code is compatible with the current schema. The rollback smoke must show readiness and unchanged persisted data.

Prisma migrations are forward-only. If the previous application cannot read the new schema, do not repeatedly restart it: either roll forward with a compatible application or use the B6 restore procedure when data recovery is required. A schema rollback is never inferred from an image rollback.
