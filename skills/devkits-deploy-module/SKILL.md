---
name: devkits-deploy-module
description: Release a finished billing-platform module to staging or production — pre-deploy checks, a signed and checksummed artifact, staged rollout, verification and a ready rollback. Use when asked to package, release, ship or deploy a module.
---

# Deploy a module

Production deployment needs explicit approval from the person responsible for that installation. Approval for staging is not approval for production.

## 1. Pre-deploy
- All gates in `devkits-dev-module` passed with evidence; CHANGELOG and version updated.
- Backup of the target installation's database and module directory, with a tested restore command.
- Maintenance window and affected customers known for anything that touches billing or provisioning.

## 2. Build the artifact
- Package only the module files (no tests, fixtures, `.env`, VCS folders).
- Produce `{slug}-{version}.zip`, a `SHA256SUMS` file and, where the team signs releases, a detached signature. Record the checksum in the release notes.

## 3. Staging
Install or upgrade on staging, run the full lifecycle smoke test, check logs for warnings, and confirm the upgrade path from the previous version.

## 4. Production
- Upload, verify the checksum on the server, then activate.
- Prefer a staged rollout: enable for a test product or a small customer group first, watch logs and provider responses, then widen.
- Keep the previous artifact and the backup ready; define the rollback trigger (error rate, failed provisioning, payment errors) before starting.

## 5. Report
Version, checksum, where it was deployed, checks run with results, anything skipped, and the rollback command. Never report a deployment as successful without a post-deploy check result.
