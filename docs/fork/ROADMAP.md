# Independent ORG2 Fork — Engineering Roadmap

**Status:** Beta preview engineering on `develop` (PR #23 merged at `7cf8c3329d9ffd0379f72a1a73b05c84c9f2d210`; PR #24 merged at `5199a63c0`); unsigned macOS M4 `.app`/`.dmg` preview built and verified locally; not yet a signed production release.
**Repository:** https://github.com/TheerasakPing/ORG2
**Upstream:** https://github.com/org2AI/ORG2
**Tracking:** GitHub Issues are currently disabled on this fork; this file is the active task checklist until Issues are enabled.

## Milestone status definitions

| Milestone         | Meaning                                                                        | Current status                                                                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Implemented**   | Feature/fix is coded and integrated into `develop`                             | Completed for fork identity, disabled updater, `DialogScheduler`, Auto-Dream file lease, Live Session Monitor, Worker Overview, Action Stream & Tree Card, Window Drag Fallback, Runtime Dashboard, Permission Governance, and Team Orchestration |
| **Tested**        | Unit, lint, typecheck, and targeted/workspace automated suites pass            | Completed on `develop` and feature branch (107 Vitest tests passing, CodeQL, and local Mac M4 verification)                                                                                                                                       |
| **Built**         | Platform installer/bundle artifacts compiled and packaged                      | Completed for macOS `aarch64-apple-darwin` (`.app`, `.dmg` local preview) and Linux/Windows preview installers (`39045826243`)                                                                                                                    |
| **Installed**     | Bundle mounted/installed and launched on target hardware with isolated profile | Completed on Apple Silicon Mac M4 (`arm64`, `~/.tp-agent-studio` isolated from `~/.orgii`)                                                                                                                                                        |
| **Release-ready** | Signed, notarized, Cloud-isolated, and certified for public end-user release   | **Pending** (requires Apple/Windows signing certificates, fork-owned Cloud/OAuth backend, and live-provider stress certification)                                                                                                                 |

## P0 — Safe ownership and packaging (must pass before signed public installers)

- [ ] Select a final brand and domain; inventory ORG2 trademarks and upstream-only UI links.
- [x] Introduce original two-tone TP Agent Studio icons for desktop bundle, Dev and default live Dock; remaining tray, Store/mobile and legacy optional Dock variants need rebranding and platform validation.
- [x] Add provisional TP Agent Studio Tauri names/identifiers for main, dev and Windows; installer coexistence requires runtime acceptance tests.
- [x] Move the canonical application data root and runtime-default ports to fork-specific paths; external history and native transcript defaults are isolated. Remaining hard-coded legacy paths, runtime hooks and installer coexistence still require an end-to-end audit.
- [x] Disable base updater and custom Rust upstream update route for unreleased fork.
- [x] Remove clickable upstream installer links from fork README and clear the disabled Tauri updater manifest list.
- [ ] Replace remaining upstream public signing key, CI release dependencies and signing identities with fork-owned infrastructure.
- [x] Harden the explicit fork data-root guard against parent traversal, missing suffixes and symlinked ancestors; add focused Rust and fork-safety tests.
- [x] Align fork frontend runtime ports and OAuth callback schemes with embedded Rust application identifiers; include production/dev/numbered/E2E parity tests (verified in `instance-profile.test.cjs`, `tauri-dev-processes.test.cjs`, and `run-with-features.test.cjs`).
- [ ] **P0 Cloud ownership:** Fork defaults still reference the ORG2-managed Supabase/web backend and some Cloud parsers still accept only `orgii://` links. Configure fork-owned endpoints, secrets/credential namespaces and redirect allowlists; until then, prohibit real-account cloud onboarding and production distribution. See [Cloud boundary audit](FORK_CLOUD_BOUNDARY.md).
- [ ] Separate workspace-local `.orgii` metadata from upstream workspace metadata with opt-in migration, source-attributed ownership and rollback tests.
- [ ] Run same-machine concurrent-install and migration/rollback tests.
- [ ] Publish fork-built packages only after independent signing and end-to-end smoke tests.

**Acceptance:** a fresh fork installation cannot update from upstream, overwrite upstream binaries, or read/write upstream profiles unless the user explicitly approves migration.

## P1 — Reliability and security

- [x] Replace the production auto-dream acquisition path with a stable OS-level exclusive file lease, plus eight-contender, cross-process exclusion tests and portable rollback.
- [ ] Add multi-process crash/kill/restart, Windows/macOS/Linux lock test evidence and split committed timestamp from in-progress state.
- [ ] Add sandbox profiles for untrusted agent shell commands; separate read/write paths, environment secrets, network and process limits.
- [ ] Introduce versioned, transactional SQLite migrations with verification and recovery procedures.
- [ ] Classify transient vs permanent LLM reflection failures; TTL/backoff rather than permanent blacklist for transient errors.
- [ ] Add session crash/restart, cancel/resume, provider-retry-after-tool and background-process teardown fault injection.
- [x] Catch scheduler execute-factory panics, track dead worker handles, recover the queue on next enqueue, and persist failed session state; added targeted regression tests (merged in PR #23, CI run `39045829235` passed).
- [x] **Implemented & Tested** on `work/macos-m4-beta-readiness` (`83b04d2ce`, merged in PR #24): harden conversation continuation and queue recovery in `localConversationSettledTail.ts`. Verify native transcript identity, preserve interrupted output, distinguish terminal receipts from answers, and expose pending or blocked recovery when an anchor cannot be proved. Focused settled-tail and dispatcher recovery tests passed; live-provider recovery remains unverified.
- [x] Continue independent startup reconciliation phases after a partial failure so stale in-flight session cleanup is still attempted; see [multi-session recovery audit](SESSION_STALL_RECOVERY.md).
- [ ] Implement bounded progress/heartbeat diagnostics for genuinely hung provider or Tool futures, with cancellation semantics that never replay side-effectful work.
- [x] Add bounded, synthetic Rust `DialogScheduler` stress tests for 1/5/20/50 concurrent sessions, targeted cancellation, dead-worker no-replay isolation and queue capacity (CI confirmed: macOS Rust workspace tests, macOS/Windows Clippy and CodeQL passed on PR #23; real provider/tool load still unverified). See [Multi-Session Stress Lab](MULTI_SESSION_STRESS_LAB.md).
- [ ] Stress-test 1/5/20/50 concurrent sessions under live provider/tool load and validate clean shutdown/restart on all three platforms.

## P2 — Unified agent experience

- [ ] Define a shared session identity/event provenance contract for native Rust Harness and external CLI sessions.
- [ ] Preserve multi-agent task/call provenance across replay, forks, and resume.
- [x] Add a bounded, on-demand live Session Monitor panel using existing Rust roster and CLI hook status signals. See [Live Monitor](LIVE_SESSION_MONITOR.md).
- [x] Emit content-free native Rust provider-request/tool-execute-start/tool-result transition events and project them into the opened Monitor (merged in PR #23). These are not periodic heartbeats or proof of provider liveness.
- [x] Emit rate-limited, content-free actual provider-delta progress pulses and read-only no-output advisories (merged in PR #23). No destructive auto-recovery or real concurrency certification yet.
- [x] Provide a private, bilingual offline Session Health HTML snapshot from SQLite aggregate status counts; this is not live agent activity or a native app tab. See [Session Health Dashboard](SESSION_HEALTH_DASHBOARD.md).
- [x] Add passive quiet-phase advisories after 5/60 minutes for observed native turns (merged in PR #23). No automatic recovery or hang certainty.\n- [x] Add 15-second scheduler-owned heartbeat signals scoped by Turn epoch and bounded frontend monitor warnings at 45/120 seconds (merged in PR #23). This proves only Tokio task polling, not provider/tool progress or safe automatic recovery.
- [x] Add in-app Worker Overview sourced from the actual in-memory Rust AgentAppState/DialogScheduler worker handles (merged in PR #23, synced with top-level Monitor refresh): created, live, busy, idle, dead, queue, maintenance and not-started counts. Excludes CLI/Cloud workers and does not auto-recover.
- [x] **Implemented & Tested** on `work/macos-m4-beta-readiness` (merged in PR #24): integrate the Chat Panel Action Stream Feed (`TurnActionFeed`) and Changed Files Tree Card (`TurnChangedFilesTreeCard`) into the turn footer. Action extraction and folder/diff-total grouping tests passed; rendered interactions remain unverified by E2E.
- [x] **Implemented & Tested** on `work/macos-m4-beta-readiness` (merged in PR #24): add the macOS/Linux window drag fallback (`windowDrag.ts`) for non-interactive drag-region descendants, excluding controls and no-drag regions. jsdom tests cover drag eligibility, click exclusions, and listener disposal; native platform dragging remains unverified in this audit.
- [x] **Implemented & Tested** on `feature/p2-runtime-dashboard-and-governance`: Build a unified runtime dashboard: tokens, costs, tool latency, retry reason, memory queue, session CPU/RAM, pending approvals (`RuntimeDashboardPanel.tsx`, `runtimeTelemetryModel.ts`).
- [x] **Implemented & Tested** on `feature/p2-runtime-dashboard-and-governance`: Add permissions preview and audit receipts for CLI, MCP, desktop and browser execution (`PermissionPreviewModal.tsx`, `permissionRiskEvaluator.ts`, `auditReceiptStore.ts`).
- [x] **Implemented & Tested** on `feature/p2-runtime-dashboard-and-governance`: Improve agent-team orchestration with role capabilities, checkpoints, budgets and human approval rules (`AgentTeamManager.tsx`, `budgetGovernor.ts`).

**Acceptance:** imported and native sessions produce equivalent timeline events; each tool effect has an auditable identity; users can reproduce errors from structured diagnostics.

## P3 — Product features and automation

- [ ] Task templates, scheduling and unattended execution with max-cost and max-runtime limits.
- [ ] Agent workflows that plan, implement, test, review and prepare PRs under explicit branch protection.
- [ ] Memory provenance inspector with conflict handling, expiration and per-workspace privacy controls.
- [ ] Portable session export/import and cross-device encrypted synchronization (opt-in).
- [ ] Consistent UX and full localization; accessibility and performance budgets.

## CI acceptance matrix

The recent branch features above passed 107 focused tests across 8 files on 2026-10-20. See [Recent feature status](../../FORK.md#recent-feature-status) for the exact command and coverage limits.

| Platform            | Build                                     | Unit                                          | Native integration                                      | Install/upgrade                                         | UI E2E  |
| ------------------- | ----------------------------------------- | --------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- | ------- |
| macOS Apple Silicon | Verified (local M4 `.app`/`.dmg` + CI)    | Verified (`39045829235`)                      | Verified (synthetic 1/5/20/50 scheduler + local launch) | Local unsigned preview verified; signed upgrade pending | Pending |
| Windows 11 x64      | Verified (`39045826243` preview NSIS/MSI) | Verified (Clippy + frontend CI `39045829235`) | Pending                                                 | Pending                                                 | Pending |
| Linux x64           | Verified (`39045826243` preview DEB/RPM)  | Verified (`39045829235`)                      | Pending                                                 | Pending                                                 | Pending |

Do not mark remaining checks complete based on source inspection; attach real logs, artifact hashes and CI run URLs.

## Upstream sync policy

- Prefer upstream security/fix updates before product-feature merges.
- Keep fork-specific release and identity configuration isolated in owned changes.
- For each upstream merge, rerun the fork-safety gate and release-install acceptance tests.
- Preserve `LICENSE`, copyright notices and upstream commit attribution.
