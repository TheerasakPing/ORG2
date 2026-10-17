# TP Agent Studio — Offline Session Health Dashboard

A bilingual Thai/English, **single-file HTML summary** generated from the
read-only session doctor. This is a user-facing diagnostics feature for
investigating a seemingly active agent after many concurrent sessions, not a
live session watchdog, runtime health signal, automated repair or native GUI.

## Generate an offline report

**Close the app normally first** so the database snapshot is easier to
interpret; preserve a backup of the application profile if investigating a
real fault. Use Python 3.10+; no pip packages or internet access required.

```bash
python3 scripts/fork/session_health_dashboard.py \
  --db "$HOME/.tp-agent-studio/sessions.db" \
  --out "$HOME/Desktop/tp-session-health.html" \
  --threshold-minutes 30

# Run existing and new regression checks together, offline:
python3 -m unittest discover -s scripts/fork -p 'test_session_doctor.py' -v
```

The profile path is the fork's **intended** production default, not a
promise that every build uses it. Confirm the installed application's
selected profile and do not accidentally point the tool at upstream ORG2.

Open the resulting `.html` with any modern browser, including on macOS,
Windows or Linux. The layout also adapts to mobile-screen widths. Sharing
the report is optional: **it remains only on the local machine** until the
user chooses to move/share it. The output file is created with exclusive
creation (never overwrites an existing file) and owner-only permissions
on POSIX. Choose a new filename for each snapshot.

## Data handling and interpretation

- Input SQLite database is opened with `mode=ro` and `query_only=ON` via
  `session_doctor.diagnose()`. The feature does **not** update session rows,
  replay tool calls, reset stuck turns or modify database companions.
- HTML embeds **only aggregate counts of allowlisted session statuses**,
  known, bounded diagnostic notes, threshold and generation time.
  Unknown status values are collapsed to `<other>`, not echoed.
- No prompts, session IDs, messages, tokens, emails, raw timestamps,
  database paths or provider URLs appear in the HTML.
- HTML is completely static, uses an inline stylesheet and a restrictive
  CSP; it has **no JavaScript, external images/fonts, tracking or requests**.
- `Possibly stale` compares one available persisted progress timestamp
  against the threshold. It does **not** prove that the agent, Provider or
  Tool is hung. Without a usable timestamp, the dashboard shows `—`
  (unknown), never misrepresents missing evidence as zero stale turns.
- The underlying doctor caps running timestamps inspected at 5,000 and
  refuses to guess timezones for unqualified timestamps.

### Security caveats

Counts can still be sensitive operational metadata; do not publish the
HTML automatically or upload it to third-party sites. Other programs may
hold SQLite write locks while the app is running, so this is a best-effort
read-only point-in-time view, not a synchronized database export.

**Never delete** `sessions.db`, `-wal` or `-shm` to clear a stuck
session. Correlate the output with runtime logs and fault-injection testing;
use [Session Recovery](SESSION_STALL_RECOVERY.md) for deeper triage.

## Roadmap integration

- [x] Offline, private, responsive aggregate session dashboard.
- [x] CLI generates HTML only when an explicit safe output path is supplied.
- [x] Lightweight synthetic SQLite privacy and no-overwrite regression tests.
- [ ] Live in-app provider/tool heartbeat and timeout diagnostics.
- [ ] First-class native frontend tab and bounded session metrics.
- [ ] Real 1/5/20/50 simultaneous session stress and restart testing.
- [ ] Native UI and installer validation across macOS M4, Windows 11, Linux.

This PR deliberately avoids modifying Rust runtimes, network providers,
Cloud/OAuth identities, signing configuration or any source database.
