#!/usr/bin/env python3
"""Read-only, aggregate diagnostics for an ORG2 / TP Agent Studio sessions database.

Never updates session rows, emits session identifiers, or reads prompt/message bodies.
The timestamp-based warning is heuristic; only the runtime can confirm a hang.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

KNOWN_STATUSES = frozenset({
    "running", "pending", "queued", "paused", "idle", "completed",
    "finished", "failed", "error", "abandoned", "interrupted",
    "cancelled", "canceled", "stopped",
})
# Starting time is not evidence of lack of progress. Never use created_at/started_at.
PROGRESS_COLUMNS = (
    "last_progress_at", "last_activity_at", "last_event_at",
    "updated_at", "modified_at",
)
MAX_TIMESTAMP_ROWS = 5000


def _parse_time(value: Any) -> datetime | None:
    """Accept timezone-qualified ISO timestamps and numeric epoch s/ms/us."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    elif isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        try:
            number = float(value)
        except ValueError:
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None
            # Local/naive timestamps cannot be compared to UTC safely.
            if parsed.utcoffset() is None:
                return None
            return parsed.astimezone(timezone.utc)
    else:
        return None
    try:
        magnitude = abs(number)
        if magnitude >= 1e14:
            number /= 1_000_000  # microseconds
        elif magnitude >= 1e11:
            number /= 1000  # milliseconds
        return datetime.fromtimestamp(number, tz=timezone.utc)
    except (ValueError, OverflowError, OSError):
        return None


def diagnose(db: Path, threshold_minutes: int = 30, now: datetime | None = None) -> dict[str, Any]:
    """Read only DB schema, aggregate states and bounded running timestamps."""
    if threshold_minutes < 1:
        raise ValueError("threshold_minutes must be positive")
    if not db.is_file():
        raise FileNotFoundError("Database file was not found (no file was created)")
    now = now or datetime.now(timezone.utc)
    if now.utcoffset() is None:
        raise ValueError("now must have a timezone")
    # SQLite URI mode=ro prevents implicitly creating a missing DB or writing rows.
    # query_only is belt-and-suspenders protection against SQL mistakes in this tool.
    connection = sqlite3.connect(db.absolute().as_uri() + "?mode=ro", uri=True, timeout=2.0)
    try:
        connection.execute("PRAGMA query_only=ON")
        connection.execute("PRAGMA busy_timeout=2000")
        exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='agent_sessions'"
        ).fetchone()
        if exists is None:
            return {
                "ok": True, "table_found": False, "status_counts": {}, "running": 0,
                "possibly_stale_running": None, "timestamp_column": None,
                "timestamp_inspected": 0, "timestamp_unknown": 0,
                "threshold_minutes": threshold_minutes,
                "notes": ["agent_sessions table is absent; schema compatibility not established"],
            }
        columns = {
            row[1] for row in connection.execute('PRAGMA table_info("agent_sessions")')
        }
        if "status" not in columns:
            return {
                "ok": True, "table_found": True, "status_counts": {}, "running": None,
                "possibly_stale_running": None, "timestamp_column": None,
                "timestamp_inspected": 0, "timestamp_unknown": 0,
                "threshold_minutes": threshold_minutes,
                "notes": ["status column is absent; schema compatibility not established"],
            }
        status_counts: dict[str, int] = {}
        for raw_status, count in connection.execute(
            'SELECT status, COUNT(*) FROM "agent_sessions" GROUP BY status'
        ):
            normalized = (raw_status or "").strip().lower() if isinstance(raw_status, str) else ""
            # Unknown DB values might themselves contain user data. Never print them.
            safe_status = normalized if normalized in KNOWN_STATUSES else "<other>"
            status_counts[safe_status] = status_counts.get(safe_status, 0) + count
        running = status_counts.get("running", 0)
        selected = next((name for name in PROGRESS_COLUMNS if name in columns), None)
        result: dict[str, Any] = {
            "ok": True, "table_found": True,
            "status_counts": dict(sorted(status_counts.items())),
            "running": running, "possibly_stale_running": None,
            "timestamp_column": selected, "timestamp_inspected": 0,
            "timestamp_unknown": 0, "threshold_minutes": threshold_minutes,
            "notes": [
                "Counts are a snapshot, not proof of a live provider hang",
                "No session IDs, prompts, tool inputs, credentials or paths are reported",
            ],
        }
        if not running:
            result["possibly_stale_running"] = 0
            return result
        if selected is None:
            result["notes"].append("No last-progress field found; cannot estimate staleness")
            return result
        # The column name comes from our own fixed allowlist, never user input.
        values = connection.execute(
            f'SELECT "{selected}" FROM "agent_sessions" WHERE LOWER(TRIM(status))=? LIMIT ?',
            ("running", MAX_TIMESTAMP_ROWS + 1),
        ).fetchall()
        if len(values) > MAX_TIMESTAMP_ROWS:
            result["notes"].append("Running rows exceed analysis cap; staleness not estimated")
            return result
        cutoff = now.astimezone(timezone.utc) - timedelta(minutes=threshold_minutes)
        stale = 0
        unknown = 0
        for (raw_time,) in values:
            timestamp = _parse_time(raw_time)
            if timestamp is None or timestamp > now + timedelta(minutes=5):
                unknown += 1
            elif timestamp < cutoff:
                stale += 1
        result["possibly_stale_running"] = stale
        result["timestamp_inspected"] = len(values)
        result["timestamp_unknown"] = unknown
        if unknown:
            result["notes"].append("Unqualified, unsupported or future timestamps were not classified")
        return result
    finally:
        connection.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, required=True, help="Explicit path to sessions.db (never printed)")
    parser.add_argument("--threshold-minutes", type=int, default=30)
    parser.add_argument("--json", action="store_true", help="Machine-readable aggregate output")
    args = parser.parse_args(argv)
    try:
        result = diagnose(args.db, threshold_minutes=args.threshold_minutes)
    except (FileNotFoundError, sqlite3.Error, ValueError, PermissionError, OSError) as exc:
        # Avoid displaying sqlite exception details: some OS errors contain private paths.
        output = {"ok": False, "error": exc.__class__.__name__,
                  "message": "Unable to read the selected database safely"}
        print(json.dumps(output) if args.json else output["message"], file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(result, sort_keys=True))
    else:
        print("TP Agent Studio session diagnostic (READ-ONLY)")
        print("Schema found:", result["table_found"])
        print("Session counts:", result["status_counts"])
        print("Running:", result["running"])
        print("Possibly stale running:", result["possibly_stale_running"])
        print("Timestamp inspected:", result["timestamp_inspected"])
        for note in result["notes"]:
            print("Note:", note)
    return 0


if __name__ == "__main__":
    sys.exit(main())
