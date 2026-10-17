# Parallel PR CI (TP Agent Studio)

This branch reorganizes the existing `.github/workflows/ci.yml` **without
changing the Rust workspace test command or disabling Windows/security gates**.

## Job graph

```text
PR update
 ├─ Gitleaks secret scan ──────────────────────────────────┐
 ├─ Frontend quality (tsgo, i18n, changed lint, contracts) ├─ Frontend (typecheck · lint · test) [old protected name]
 ├─ Frontend production build ─────────────────────────────┤
 ├─ Frontend affected unit tests ──────────────────────────┘
 ├─ Detect CI scope (Rust + audit)
 │   ├─ macOS Clippy ───────────────┐
 │   ├─ macOS full workspace tests ─┴─ Rust (clippy) [old protected name]
 │   ├─ Windows Clippy (independent protected check)
 │   └─ cargo audit (Cargo.lock / audit policy changes)
 └─ CodeQL / other workflows (independent)
```

The two aggregators execute with `if: always()` and fail when any required
subjob fails, is cancelled or is unexpectedly skipped. The Rust aggregator
only succeeds with skipped subjobs when diff scope was successfully resolved
as `rust_required=false`. This preserves the existing protected check names
without silently dropping coverage during a branch-protection transition.

## Cache and cost

Three frontend runners restore the same existing `node_modules` key and
each invokes a frozen pnpm install. The individual jobs can finish sooner,
but this consumes more **total** runner minutes and downloads. macOS Clippy
and Rust workspace tests restore the same `ci-macos` warm cache; Clippy is
restore-only, and tests can save test-profile artifacts after a failed
assertion to avoid losing completed compilation on the next PR iteration.
These parallel macOS jobs may duplicate some compile work, so measure
wall-clock time **and** billed runner-minutes before keeping the split.

The base-branch `warm-rust-cache.yml` job still compiles both Clippy and
test-profile artifacts. No cache-key migration or release-build setting is
required for this change.

## Rust change detection

`scripts/ci/detect-rust-changes.cjs` keeps Rust code, Tauri assets,
orgtrack contract fixtures, sidecar staging scripts and shared composite
actions in scope. Among standalone workflows, only Rust-affecting build
workflows (`ci.yml`, `warm-rust-cache.yml`, `nightly-full-checks.yml`,
`release.yaml`) trigger the costly compiler jobs. Editing independent
Python, CodeQL, frontend-only or fork-safety workflows does **not** trigger
Rust compile, unless another Rust-relevant path is also changed.

The detector continues to fail closed when the diff unexpectedly contains
no paths. Rust-sensitive new out-of-tree inputs must be added deliberately
to this list in the same change.

## Verification

```bash
node --test scripts/ci/detect-rust-changes.test.cjs
node --test scripts/ci/parallel-ci.test.cjs
node --test scripts/ci/*.test.cjs
```

On a real PR, verify all required checks including Windows Clippy, CodeQL,
frontend aggregation, and macOS Rust aggregation. Inspect the full
`cargo test --workspace --no-fail-fast` result, not merely the aggregation
name. Native macOS/Windows/Linux E2E checks and installation signing remain
separate release gates. This change cannot fix unrelated SQLite lock or
native-store lock test failures by itself.

**Rollback:** revert the CI workflow and detector/test changes together;
the aggregator job names are unchanged, so branch-protection migration is
not required.
