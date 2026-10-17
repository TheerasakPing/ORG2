# Independent ORG2 Fork — Engineering Roadmap

**Status:** Planning and initial release-safety changes, not a production release.
**Repository:** https://github.com/TheerasakPing/ORG2
**Upstream:** https://github.com/org2AI/ORG2
**Tracking:** GitHub Issues are currently disabled on this fork; this file is the active task checklist until Issues are enabled.

## P0 — Safe ownership and packaging (must pass before installers)

- [ ] Select a final brand and domain; inventory ORG2 trademarks and upstream-only UI links.
- [ ] Change app name/identifier and macOS/Windows/Linux metadata without clobbering upstream installs.
- [ ] Introduce a configurable app-data root; isolate SQLite databases, workspace memory, key storage, sidecars, logs, IPC ports and deep-link protocols.
- [x] Disable base updater and custom Rust upstream update route for unreleased fork.
- [ ] Replace update URLs, public signing key, CI release dependencies and signing identities with fork-owned infrastructure.
- [ ] Run same-machine concurrent-install and migration/rollback tests.
- [ ] Publish fork-built packages only after independent signing and end-to-end smoke tests.

**Acceptance:** a fresh fork installation cannot update from upstream, overwrite upstream binaries, or read/write upstream profiles unless the user explicitly approves migration.

## P1 — Reliability and security

- [ ] Replace PID/write-and-read workspace auto-dream lock with a real cross-process atomic lock and race tests.
- [ ] Add sandbox profiles for untrusted agent shell commands; separate read/write paths, environment secrets, network and process limits.
- [ ] Introduce versioned, transactional SQLite migrations with verification and recovery procedures.
- [ ] Classify transient vs permanent LLM reflection failures; TTL/backoff rather than permanent blacklist for transient errors.
- [ ] Add session crash/restart, cancel/resume, provider-retry-after-tool and background-process teardown fault injection.

**Acceptance:** no double-owned memory consolidation; session/tool cancellation leaves no orphaned jobs; migration failures cannot leave an app silently running on a partially upgraded schema.

## P2 — Unified agent experience

- [ ] Define a shared session identity/event provenance contract for native Rust Harness and external CLI sessions.
- [ ] Preserve multi-agent task/call provenance across replay, forks, and resume.
- [ ] Build a unified runtime dashboard: tokens, costs, tool latency, retry reason, memory queue, session CPU/RAM, pending approvals.
- [ ] Add permissions preview and audit receipts for CLI, MCP, desktop and browser execution.
- [ ] Improve agent-team orchestration with role capabilities, checkpoints, budgets and human approval rules.

**Acceptance:** imported and native sessions produce equivalent timeline events; each tool effect has an auditable identity; users can reproduce errors from structured diagnostics.

## P3 — Product features and automation

- [ ] Task templates, scheduling and unattended execution with max-cost and max-runtime limits.
- [ ] Agent workflows that plan, implement, test, review and prepare PRs under explicit branch protection.
- [ ] Memory provenance inspector with conflict handling, expiration and per-workspace privacy controls.
- [ ] Portable session export/import and cross-device encrypted synchronization (opt-in).
- [ ] Consistent UX and full localization; accessibility and performance budgets.

## CI acceptance matrix

| Platform | Build | Unit | Native integration | Install/upgrade | UI E2E |
| --- | --- | --- | --- | --- | --- |
| macOS Apple Silicon | Required | Required | Required | Required | Required |
| Windows 11 x64 | Required | Required | Required | Required | Required |
| Linux x64 | Required | Required | Required | Required | Required |

Do not mark these checks complete based on source inspection; attach real logs, artifact hashes and CI run URLs.

## Upstream sync policy

- Prefer upstream security/fix updates before product-feature merges.
- Keep fork-specific release and identity configuration isolated in owned changes.
- For each upstream merge, rerun the fork-safety gate and release-install acceptance tests.
- Preserve `LICENSE`, copyright notices and upstream commit attribution.
