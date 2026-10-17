# Offline session-stall diagnosis (read only)

A long-running Rust agent turn can appear to be working after its scheduler worker,
provider future, or persistence state has stopped advancing. The session doctor
is a **non-destructive, offline snapshot** of persisted statuses, intended to
help triage the problem without resetting or deleting user data.

## Run without installing dependencies

Python 3.10+ and a **local** SQLite database are sufficient. First exit the
app normally. If the database remains live, a read-only snapshot might include
transactions committed during the check; it is not a synchronized runtime trace.

```bash
# Explicitly choose the fork's database; do not point at an upstream profile by accident.
python3 scripts/fork/session_doctor.py \
  --db "$HOME/.tp-agent-studio/sessions.db" --threshold-minutes 30

# Aggregated machine-readable output (no session IDs or prompts)
python3 scripts/fork/session_doctor.py \
  --db "$HOME/.tp-agent-studio/sessions.db" --json

# Fast offline regression suite (synthetic temporary SQLite databases only)
python3 -m unittest discover -s scripts/fork -p 'test_session_doctor.py' -v
```

The path above is the *intended* fork production default, not a promise that
all existing installations use it. Specify the real profile path for a built
fork; never assume the upstream `~/.orgii/` database is safe to repurpose.

## What the output can and cannot say

- `status_counts` includes an aggregate for each known session status; unknown
  status values are collapsed into `<other>` rather than exposing their contents.
- `possibly_stale_running` counts rows with status `running` whose **available
  last-progress timestamp** is older than the chosen threshold. It is **not**
  proof of a stuck LLM or dead worker. `None` means a reliable age check was
  unavailable, rather than zero stale sessions.
- The parser accepts Unix epoch seconds/milliseconds/microseconds and ISO 8601
  with an explicit offset. It deliberately does not guess a timezone for
  naive timestamps. Unknown or future timestamps are counted separately.
- The tool does not execute tools, replay agent turns, modify rows, migrate
  schemas, read credentials, or print user prompts/session IDs/absolute paths.
  It caps inspected `running` timestamps at 5,000 per call.
- If the `agent_sessions` table or expected columns are absent, the tool
  reports that schema compatibility could not be established. Do not modify
  the schema to make this diagnostic work.

## Next step when records look stale

Preserve application logs and record the build, OS, provider/CLI type, elapsed
time, and approximate number of concurrent sessions. Correlate read-only
counts with `[scheduler]`, `[StartupRecovery]`, provider timeouts, memory
pressure, and `database is locked` events. Before sharing logs, redact
credentials, account identifiers, prompts, private filesystem paths, and URLs
containing secrets.

**Never delete `sessions.db` or its `-wal` and `-shm` companions** as a repair.
Use the [session-stall recovery audit](SESSION_STALL_RECOVERY.md) for actual
scheduler failure paths and the remaining native crash/restart acceptance tests.

This script intentionally does **not** replace the ongoing 1/5/20/50 native
concurrency stress tests or certify any Windows/macOS/Linux release build.
