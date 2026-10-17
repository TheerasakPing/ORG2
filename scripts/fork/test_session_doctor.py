"""Independent, dependency-free session doctor regression checks."""
from __future__ import annotations

import importlib.util
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("session_doctor.py")
spec = importlib.util.spec_from_file_location("session_doctor", MODULE_PATH)
assert spec and spec.loader
session_doctor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(session_doctor)


class SessionDoctorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db = Path(self.temp.name) / "sessions.db"
        self.now = datetime(2026, 10, 17, 12, 0, tzinfo=timezone.utc)

    def create_db(self, *, with_timestamp: bool = True) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db)
        if with_timestamp:
            conn.execute("CREATE TABLE agent_sessions (status TEXT, updated_at TEXT, secret_prompt TEXT)")
        else:
            conn.execute("CREATE TABLE agent_sessions (status TEXT, secret_prompt TEXT)")
        conn.commit()
        return conn

    def test_counts_and_age_are_only_aggregates(self) -> None:
        conn = self.create_db()
        old = (self.now - timedelta(minutes=50)).isoformat()
        recent = (self.now - timedelta(minutes=5)).isoformat()
        conn.executemany("INSERT INTO agent_sessions VALUES (?, ?, ?)", [
            ("running", old, "SECRET-DO-NOT-EMIT"),
            ("RUNNING", recent, "SECRET-DO-NOT-EMIT"),
            ("failed", recent, "SECRET-DO-NOT-EMIT"),
            ("user@example.com", old, "SECRET-DO-NOT-EMIT"),
        ])
        conn.commit()
        conn.close()
        before = self.db.read_bytes()
        report = session_doctor.diagnose(self.db, now=self.now)
        self.assertEqual(report["status_counts"], {"<other>": 1, "failed": 1, "running": 2})
        self.assertEqual(report["possibly_stale_running"], 1)
        self.assertEqual(report["timestamp_inspected"], 2)
        self.assertNotIn("SECRET", json.dumps(report))
        self.assertNotIn("user@example", json.dumps(report))
        self.assertNotIn(str(self.db), json.dumps(report))
        self.assertEqual(before, self.db.read_bytes())

    def test_missing_db_does_not_get_created(self) -> None:
        with self.assertRaises(FileNotFoundError):
            session_doctor.diagnose(self.db)
        self.assertFalse(self.db.exists())

    def test_missing_schema_and_status_are_handled(self) -> None:
        conn = sqlite3.connect(self.db)
        conn.execute("CREATE TABLE unrelated (x INTEGER)")
        conn.close()
        report = session_doctor.diagnose(self.db)
        self.assertFalse(report["table_found"])
        self.db.unlink()
        conn = sqlite3.connect(self.db)
        conn.execute("CREATE TABLE agent_sessions (other TEXT)")
        conn.close()
        self.assertIsNone(session_doctor.diagnose(self.db)["running"])

    def test_no_timestamp_reports_unknown_instead_of_stale(self) -> None:
        conn = self.create_db(with_timestamp=False)
        conn.execute("INSERT INTO agent_sessions VALUES (?, ?)", ("running", "secret"))
        conn.commit()
        conn.close()
        report = session_doctor.diagnose(self.db, now=self.now)
        self.assertIsNone(report["possibly_stale_running"])
        self.assertIsNone(report["timestamp_column"])

    def test_epoch_seconds_milliseconds_microseconds_and_iso(self) -> None:
        moment = self.now - timedelta(hours=1)
        for encoded in [moment.timestamp(), moment.timestamp() * 1000,
                        moment.timestamp() * 1000000, moment.isoformat(),
                        moment.isoformat().replace("+00:00", "Z")]:
            with self.subTest(encoded=encoded):
                self.assertEqual(session_doctor._parse_time(encoded), moment)
        self.assertIsNone(session_doctor._parse_time("2026-10-17T12:00:00"))

    def test_future_and_unqualified_timestamps_are_not_classified(self) -> None:
        conn = self.create_db()
        conn.executemany("INSERT INTO agent_sessions VALUES (?, ?, ?)", [
            ("running", "2035-01-01T00:00:00Z", "secret"),
            ("running", "2026-01-01 00:00:00", "secret"),
        ])
        conn.commit()
        conn.close()
        report = session_doctor.diagnose(self.db, now=self.now)
        self.assertEqual(report["possibly_stale_running"], 0)
        self.assertEqual(report["timestamp_unknown"], 2)

    def test_cli_machine_output_has_no_path_or_prompts(self) -> None:
        conn = self.create_db()
        conn.execute("INSERT INTO agent_sessions VALUES (?, ?, ?)",
                     ("running", self.now.isoformat(), "PRIVATE PROMPT"))
        conn.commit()
        conn.close()
        completed = subprocess.run(
            [sys.executable, str(MODULE_PATH), "--db", str(self.db), "--json"],
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertNotIn("PRIVATE", completed.stdout)
        self.assertNotIn(str(self.db), completed.stdout)
        self.assertEqual(json.loads(completed.stdout)["running"], 1)

    def test_diagnostic_count_scales_for_synthetic_sessions(self) -> None:
        conn = self.create_db()
        for n in (1, 5, 20, 50):
            conn.execute("DELETE FROM agent_sessions")
            conn.executemany("INSERT INTO agent_sessions VALUES (?, ?, ?)",
                             [("running", self.now.isoformat(), "secret")] * n)
            conn.commit()
            with self.subTest(concurrent_session_records=n):
                self.assertEqual(session_doctor.diagnose(self.db, now=self.now)["running"], n)
        conn.close()


if __name__ == "__main__":
    unittest.main()
