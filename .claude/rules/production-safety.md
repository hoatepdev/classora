# Production Safety

Read-only inspection is allowed.

Examples:

- git status
- git diff
- docker ps
- docker logs
- configuration inspection

Require explicit user approval for side effects including:

- git commit
- git push
- SSH commands
- production deployment
- production migrations
- Cloudflare mutations
- Docker shutdown/prune operations
- destructive Git operations

Never expose or commit secrets.

Never modify production data merely to debug an issue.
