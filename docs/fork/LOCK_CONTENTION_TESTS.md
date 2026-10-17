# Lock contention regression checks

## Origin

The October 17, 2026 macOS CI run
[`39023376993`](https://github.com/TheerasakPing/ORG2/actions/runs/39023376993)
finished after approximately 52 minutes. Both macOS Clippy and Windows Clippy
passed, but the full Rust workspace test job failed in two lock-related tests:

1. `agent_cli::managed_config::native_app::codex_history::files::writer_release_tests::release_confirmation_stops_at_deadline_without_notifying_busy_store`
   at `files.rs:398`: immediate exclusive re-lock failed after the
   original writer was dropped.
2. `agent_core::core::turn_executor::tool_execution::parallel::tests::end_turn_persists_all_already_executed_parallel_results`
   at `parallel.rs:512`: `SQLITE_BUSY` / `database is locked` during
   a test fixture INSERT.

## Changes

**SQLite fixture:** Run the schema/setup INSERT under
`database::db::with_sessions_writer`. The sessions database documents this
process-wide writer guard as the production coordination boundary, yet this
fixture previously performed its own write without acquiring it. This
prevents this fixture from racing other writers that honor the same guard
and preserves the existing message persistence assertions.

**Native writer lock fixture:** Replace a single immediate post-Drop
`try_lock_exclusive` assertion with bounded retry (2s, 10ms probes).
The test still verifies that the live writer cannot be exclusively locked,
the short release-confirmation deadline does not notify a busy store, and
the writer **must** become exclusively lockable after it is dropped. A
permanently leaked/inherited file descriptor still fails.

No production runtime behavior, SQLite timeout defaults, session schemas,
or lock protocols were modified.

## Focused verification

From `src-tauri` on **macOS**:

```bash
cargo test -p agent_cli --lib \
  release_confirmation_stops_at_deadline_without_notifying_busy_store
cargo test -p agent_core --lib \
  end_turn_persists_all_already_executed_parallel_results
cargo test -p agent_core --lib \
  error_limit_persists_all_already_executed_parallel_results
```

For contention coverage, repeat the focused tests and run the full
`cargo test --workspace --no-fail-fast` on CI when the cache is warm.
macOS-only file-lock behavior cannot be established by a non-macOS text
inspection; until GitHub CI reports, consider this patch **unverified
natively**. Other writers that do not follow the shared session writer
guard can still contend; this change does not assert that the entire
app/session freeze problem is solved.
