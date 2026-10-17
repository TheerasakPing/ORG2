#!/usr/bin/env python3
"""Create a private, static HTML overview from the read-only session doctor.

The source SQLite database is never written. Output includes only aggregated
safe status counts and bounded timestamp statistics, never session records.
"""
from __future__ import annotations

import argparse
import html
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from session_doctor import diagnose

_LABELS = {
    "running": "กำลังทำงาน · Running",
    "pending": "รอดำเนินการ · Pending",
    "queued": "อยู่ในคิว · Queued",
    "paused": "หยุดชั่วคราว · Paused",
    "idle": "ว่าง · Idle",
    "completed": "สำเร็จ · Completed",
    "finished": "เสร็จสิ้น · Finished",
    "failed": "ล้มเหลว · Failed",
    "error": "ผิดพลาด · Error",
    "abandoned": "ยกเลิกจากการขัดจังหวะ · Abandoned",
    "interrupted": "ถูกขัดจังหวะ · Interrupted",
    "cancelled": "ยกเลิก · Cancelled",
    "canceled": "ยกเลิก · Canceled",
    "stopped": "หยุดแล้ว · Stopped",
    "<other>": "สถานะไม่รู้จัก · Other",
}

_STYLE = r"""
:root { color-scheme: light; --ink:#123448; --muted:#576c78;
  --accent:#087c89; --accent-soft:#dff7f5; --line:#d9e6e9;
  --bg:#f1f7f7; --surface:#fff; --warning:#995500; --danger:#bd444d; }
* { box-sizing:border-box; }
body { margin:0; font-family:system-ui,-apple-system,"Segoe UI","Noto Sans Thai",sans-serif;
  color:var(--ink); background:var(--bg); line-height:1.6; }
header { background:linear-gradient(115deg,#102f44,#135267); color:white; padding:40px 20px 54px; }
.inner { max-width:1080px; margin:0 auto; }
.eyebrow { text-transform:uppercase; font-size:12px; font-weight:750;
  letter-spacing:0.17em; color:#a9f0e8; }
h1 { font-size:clamp(28px,5vw,43px); line-height:1.2; margin:10px 0 8px; }
.subtitle { color:#d2e8ea; margin:0; max-width:740px; }
.pills { display:flex; gap:8px; flex-wrap:wrap; margin-top:20px; }
.pill { display:inline-block; border:1px solid #7ab9c2; border-radius:999px;
  padding:4px 12px; font-size:12px; color:#e9fffb; }
main { max-width:1080px; margin:-30px auto 48px; padding:0 20px; }
.metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:13px; }
.card,.panel { background:var(--surface); border:1px solid var(--line);
  box-shadow:0 5px 22px #1746590b; border-radius:16px; }
.card { padding:21px 19px 16px; }
.card .label { font-size:13px; color:var(--muted); font-weight:650; }
.card .number { font-size:36px; font-weight:760; line-height:1.2; margin:10px 0 4px; }
.card .hint { font-size:12px; color:var(--muted); }
.card.warn .number { color:var(--warning); }
.panel { margin-top:16px; padding:24px; }
h2 { margin:0 0 8px; font-size:21px; }
p { margin:0 0 10px; }
.caption { color:var(--muted); font-size:13px; }
.row { display:grid; grid-template-columns:minmax(175px,1.2fr) minmax(120px,3fr) 55px;
  gap:14px; align-items:center; margin:17px 0; }
.state { font-size:13px; font-weight:600; overflow-wrap:anywhere; }
.meter { height:13px; background:#e9f0f2; border-radius:20px; overflow:hidden; }
.fill { display:block; height:100%; border-radius:20px; background:var(--accent); }
.fill.fail { background:var(--danger); }
.fill.running { background:#d5973b; }
.count { font-variant-numeric:tabular-nums; font-weight:750; text-align:right; }
.notice { padding:15px 18px; border-left:4px solid var(--accent);
  background:var(--accent-soft); border-radius:8px; margin-top:14px; }
.notice.warn { background:#fff4e4; border-color:#cf8b2a; }
ul { padding-left:20px; color:var(--muted); margin:14px 0 0; }
li { margin:6px 0; overflow-wrap:anywhere; }
footer { padding:0 20px 32px; max-width:1080px; margin:auto;
  color:var(--muted); font-size:12px; }
@media(max-width:780px) { .metrics { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .panel { padding:18px; } }
@media(max-width:470px) { header { padding-top:30px; } .metrics { gap:9px; }
  .card { padding:14px 12px; }.card .number { font-size:27px; }
  .row { grid-template-columns:minmax(115px,1fr) minmax(65px,2fr) 32px; gap:8px; }
  .state { font-size:11px; } main { padding:0 12px; } }
@media print { header { color:black; background:white; padding-bottom:28px; }
  header .eyebrow,header .subtitle,.pill { color:var(--ink); }
  main { margin:0 auto; }.card,.panel { box-shadow:none; break-inside:avoid; } }
"""

def _escape(value: Any) -> str:
    return html.escape(str(value), quote=True)


def render_html(report: dict[str, Any], *, created: datetime | None = None) -> str:
    """Render aggregate-only diagnostics. Escapes all dynamic fields."""
    created = created or datetime.now(timezone.utc)
    counts = report.get("status_counts") or {}
    # An independently supplied report must not create dynamic HTML with raw keys.
    safe_counts: dict[str, int] = {}
    for key, amount in counts.items():
        if key not in _LABELS or not isinstance(amount, int) or isinstance(amount, bool):
            key = "<other>"
        if not isinstance(amount, int) or isinstance(amount, bool):
            continue
        safe_counts[key] = safe_counts.get(key, 0) + max(0, amount)
    total = sum(safe_counts.values())
    running = safe_counts.get("running", 0)
    stale = report.get("possibly_stale_running")
    stale_label = str(stale) if type(stale) is int and stale >= 0 else "—"
    unknown = report.get("timestamp_unknown", 0)
    unknown_label = str(unknown) if type(unknown) is int and unknown >= 0 else "—"
    threshold = report.get("threshold_minutes")
    threshold_label = str(threshold) if type(threshold) is int and threshold > 0 else "—"

    rows = []
    for status, count in sorted(safe_counts.items(), key=lambda item: (-item[1], item[0])):
        label = _escape(_LABELS.get(status, _LABELS["<other>"]))
        width = 100 * count / total if total else 0
        cls = "fail" if status in {"failed", "error", "abandoned"} else (
            "running" if status in {"running", "pending", "queued"} else ""
        )
        rows.append(
            '<div class="row"><div class="state">' + label + '</div>'
            + '<div class="meter" aria-label="' + label + '">'
            + '<span class="fill ' + cls + '" style="width:' + f"{width:.2f}" + '%"></span>'
            + '</div><div class="count">' + str(count) + '</div></div>'
        )
    bars = "\n".join(rows) if rows else '<p class="caption">ไม่มีข้อมูลสถานะ · No session records</p>'
    caution = (
        "พบ Session ที่อาจไม่มีความคืบหน้าตามเกณฑ์เวลา ตรวจสอบ Logs ก่อนตัดสินใจแก้ไข"
        if stale_label not in {"—", "0"}
        else "รายงานนี้เป็นภาพรวมสถานะจากฐานข้อมูล ไม่ใช่หลักฐานยืนยันว่า Provider ทำงานหรือค้าง"
    )
    notes = report.get("notes") or []
    # Only display own tool's documented diagnostic notes, not arbitrary records.
    note_set = {
        "Counts are a snapshot, not proof of a live provider hang",
        "No session IDs, prompts, tool inputs, credentials or paths are reported",
        "No last-progress field found; cannot estimate staleness",
        "Running rows exceed analysis cap; staleness not estimated",
        "Unqualified, unsupported or future timestamps were not classified",
        "agent_sessions table is absent; schema compatibility not established",
        "status column is absent; schema compatibility not established",
    }
    note_html = "\n".join(
        "<li>" + _escape(note) + "</li>"
        for note in notes if isinstance(note, str) and note in note_set
    )
    stamp = created.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    template = """<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy"
 content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>TP Agent Studio · Session Health</title>
<style>__STYLE__</style></head><body>
<header><div class="inner">
<div class="eyebrow">TP AGENT STUDIO / DIAGNOSTICS</div>
<h1>Session Health Dashboard</h1>
<p class="subtitle">ตรวจสอบสถานะ Session แบบออฟไลน์ · Offline, read-only snapshot</p>
<div class="pills"><span class="pill">READ ONLY</span><span class="pill">NO NETWORK</span>
<span class="pill">NO SESSION CONTENT</span><span class="pill">__STAMP__</span></div>
</div></header>
<main>
<section class="metrics" aria-label="Summary">
<div class="card"><div class="label">ทั้งหมด · Total</div><div class="number">__TOTAL__</div>
<div class="hint">สถานะที่อ่านได้ · Counted sessions</div></div>
<div class="card"><div class="label">กำลังทำงาน · Running</div><div class="number">__RUNNING__</div>
<div class="hint">ข้อมูลจาก SQLite · Persisted</div></div>
<div class="card warn"><div class="label">อาจค้าง · Possibly stale</div><div class="number">__STALE__</div>
<div class="hint">เกณฑ์ __THRESHOLD__ นาที · Heuristic</div></div>
<div class="card"><div class="label">เวลาไม่ชัดเจน · Unknown time</div><div class="number">__UNKNOWN__</div>
<div class="hint">ไม่นับเป็น Stale โดยเดา</div></div>
</section>
<section class="panel">
<h2>Session Status / สถานะทั้งหมด</h2>
<p class="caption">Aggregated counts only · ไม่มี Session ID, Prompt หรือข้อมูล Credentials</p>
__BARS__
</section>
<section class="panel">
<h2>ผลประเมิน · Assessment</h2>
<div class="notice __NOTICE_CLASS__"><strong>ข้อควรระวัง</strong><br>__CAUTION__</div>
<ul>__NOTES__</ul>
</section>
<section class="panel">
<h2>แนวทางตรวจสอบ · Next steps</h2>
<p>เมื่อพบค่าผิดปกติ ให้ตรวจ Logs ของ Scheduler, Provider Timeout, การใช้ RAM
และ SQLite Writer Lock ควบคู่กับข้อมูลการทำงานจริง อย่าใช้สถานะเก่าเพียงอย่างเดียว
สรุปว่า Agent หยุดทำงานแล้ว</p>
<p class="caption">ห้ามลบ sessions.db, -wal หรือ -shm เพื่อแก้ปัญหาโดยไม่มี Backup และขั้นตอน Recovery
/ Never delete or rewrite database files as a shortcut.</p>
</section></main>
<footer>Generated locally by TP Agent Studio Session Doctor. Static HTML:
no scripts, external fonts, network calls, session identifiers or raw messages.</footer>
</body></html>"""
    # Replace each explicit placeholder once: dynamically generated values are
    # counts, allowlisted notes, or escaped fixed labels, never user transcripts.
    variables = {
        "__STYLE__": _STYLE,
        "__STAMP__": _escape(stamp),
        "__TOTAL__": str(total),
        "__RUNNING__": str(running),
        "__STALE__": stale_label,
        "__UNKNOWN__": unknown_label,
        "__THRESHOLD__": threshold_label,
        "__BARS__": bars,
        "__CAUTION__": _escape(caution),
        "__NOTICE_CLASS__": "warn" if stale_label not in {"—", "0"} else "",
        "__NOTES__": note_html,
    }
    for marker, value in variables.items():
        template = template.replace(marker, value)
    return template


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, required=True, help="SQLite source path (not printed)")
    parser.add_argument("--out", type=Path, required=True, help="New HTML report (never overwritten)")
    parser.add_argument("--threshold-minutes", type=int, default=30)
    args = parser.parse_args(argv)

    try:
        if args.out.suffix.lower() != ".html":
            raise ValueError("output must be HTML")
        if args.db.resolve() == args.out.resolve():
            raise ValueError("cannot overwrite source database")
        report = diagnose(args.db, threshold_minutes=args.threshold_minutes)
        content = render_html(report)
        # O_EXCL prevents clobbering anything at the explicit output path,
        # including the source SQLite database, a symlink, or an older report.
        fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as out:
                out.write(content)
        except BaseException:
            args.out.unlink(missing_ok=True)
            raise
    except (FileExistsError, FileNotFoundError, sqlite3.Error,
            ValueError, PermissionError, OSError) as exc:
        # Do not print OS/SQLite exception messages containing private paths.
        print("Unable to create report safely (" + type(exc).__name__ + ")", file=sys.stderr)
        return 2
    print("Offline Session Health HTML report created (private file, read-only source)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
