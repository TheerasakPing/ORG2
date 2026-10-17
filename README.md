> **Independent community fork — TheerasakPing/ORG2**
>
> This repository is a fork of [org2AI/ORG2](https://github.com/org2AI/ORG2).
> Work-in-progress app identity: **TP Agent Studio** (provisional branding; legacy compatibility names remain in internal APIs).
>
> ![TP Agent Studio two-tone icon](assets/branding/tp-agent-studio.svg)
>
> Two-tone desktop branding details: [branding guide](docs/fork/TWO_TONE_BRANDING.md).
> This fork does **not** distribute the upstream publisher's installers.
> The fork's application updater is intentionally disabled pending independent signing and release infrastructure.
> **Do not install experimental fork builds alongside upstream ORG2** until the app identity,
> deep links and `~/.orgii` state/storage are isolated and migration-tested.
> See [FORK.md](FORK.md), [the fork roadmap](docs/fork/ROADMAP.md),
> [Cloud boundary audit](docs/fork/FORK_CLOUD_BOUNDARY.md) and [session-stall recovery](docs/fork/SESSION_STALL_RECOVERY.md).
>
> **Development status (17 October 2026):** Consolidated changes from [PR #23](https://github.com/TheerasakPing/ORG2/pull/23)
> (`7cf8c3329d9ffd0379f72a1a73b05c84c9f2d210`) are merged into `develop`. Local unsigned macOS Apple Silicon (M4 `aarch64-apple-darwin`) `.app` and `.dmg` preview artifacts build and launch with isolated `~/.tp-agent-studio` runtime defaults, while official Developer ID code signing, notarization, co-installation migration, and fork-owned Cloud/OAuth infrastructure remain pending before a signed public release.

---

<div align="center">
  <h1>TP Agent Studio</h1>
  <p><strong>The system of record for how agents build software.<br />Run your coding agents — replay any session, review as a team, and trace every line back to the decision behind it.</strong></p>
</div>

---

> **No TP Agent Studio installers are published yet.** macOS Apple Silicon, Windows 11, and Linux builds are undergoing identity, data-isolation, CI and signing verification. See [release readiness](FORK.md) and [engineering roadmap](docs/fork/ROADMAP.md).

---

<p align="center">
  <a href="README.md">English</a> · <a href="docs/readmes/README.fr.md">Français</a> · <a href="docs/readmes/README.zh.md">简体中文</a> · <a href="docs/readmes/README.zh-Hant.md">繁體中文</a> · <a href="docs/readmes/README.es.md">Español</a> · <a href="docs/readmes/README.hi.md">हिन्दी</a> · <a href="docs/readmes/README.ru.md">Русский</a> · <a href="docs/readmes/README.pt.md">Português</a> · <a href="docs/readmes/README.de.md">Deutsch</a> · <a href="docs/readmes/README.ja.md">日本語</a> · <a href="docs/readmes/README.ko.md">한국어</a> · <a href="docs/readmes/README.tr.md">Türkçe</a> · <a href="docs/readmes/README.vi.md">Tiếng Việt</a> · <a href="docs/readmes/README.id.md">Bahasa Indonesia</a> · <a href="docs/readmes/README.pl.md">Polski</a>
</p>

<p>Built with Rust and Tauri for local-first execution under 100MB on disk. Supports agent trajectory livestream and replay. Easy to follow and review.</p>

<p align="center">
  <video src="https://github.com/user-attachments/assets/bd4833d2-4cc4-4971-9805-84529b14d01a" controls width="720"></video>
</p>

Answering why a piece of code exists — and whether it worked — has always meant stitching systems together by hand. Jira sees only tickets. Codex sees only its own sessions. GitHub sees only committed lines. Amplitude sees only metrics. That was survivable when humans wrote the code. At agent speed it isn't: code written on Monday is legacy by Friday.

ORG-2 is where your team runs its coding agents — a native Rust harness plus launchers for 20+ agent CLIs — and it builds that record automatically. Every session becomes a trajectory teammates replay like a video, reviewing how the work was actually built rather than just the diff and commenting in context. Sessions run in other tools are ingested and backfilled from their history, so the record covers work that never touched the app. The record links what the human asked for, what the agent understood, and what it actually did, so any shipped line traces back to the session that wrote it.

It is not just another AI coding tool; it is an experiment in human/agent organizations and org-level alignment. ORG2 treats agents as persistent, observable colleagues inside a structured organization — replayable execution, cross-session memory, AI blame, and a local-first Rust runtime so humans, agents, and teams can collaborate around shared context and aligned goals.

## TP Agent Studio fork status / สถานะการพัฒนา

**ภาษาไทย:** TP Agent Studio เป็น Fork อิสระของ ORG2 ซึ่งได้รวมความสามารถหลักจาก [PR #23](https://github.com/TheerasakPing/ORG2/pull/23) เข้าสู่สาขา `develop` แล้ว ประกอบด้วยอัตลักษณ์แอปและไอคอน Two-tone, ระบบ Rust Agent Harness (`DialogScheduler`), Live Session Monitor, Worker Overview, การแก้ไขปัญหา SQLite Lock Contention / Auto-Dream Lease Lock และการสร้างไฟล์ติดตั้งแบบ Preview (Unsigned) สำหรับ macOS Apple Silicon (M4 `aarch64-apple-darwin`), Windows 11 x64 และ Linux x64 ทั้งนี้ **ยังไม่มีการเผยแพร่ไฟล์ติดตั้งที่ลงนามรับรอง (Signed Production Installer)** และ **ยังไม่ควรใช้งานร่วมกับบัญชี Cloud จริงหรือข้อมูลสำคัญ** จนกว่าการแยกบริการ OAuth/Cloud และการลงนามโค้ดอิสระจะเสร็จสมบูรณ์

### Live Session Monitor, Worker Architecture & Recovery Behavior

The fork provides a **read-only** diagnostic panel ([Live Session Monitor](docs/fork/LIVE_SESSION_MONITOR.md)) for multi-session Agent Harness observability:

1. **Worker Architecture (`DialogScheduler`)**:
   - Each native Rust session registered in `AgentAppState` lazily creates at most one Tokio worker task on its first queued job (`execute`, `interrupt`, `abort`, or maintenance).
   - **Registered sessions != Created workers**: `NativeWorkerOverview` reports 10 distinct runtime counters directly from Rust (`registeredSessions`, `initializedWorkers`, `liveWorkers`, `busyWorkers`, `activeTurnWorkers`, `maintenanceWorkers`, `idleWorkers`, `queuedJobs`, `terminatedWorkers`, and `neverStarted`).
   - Counts reflect **only** in-memory native Tokio `DialogScheduler` tasks. They never include external CLI processes, Cloud agents, subagents, or OS threads.
2. **Session Monitoring & 7-State Diagnostic Distinction**:
   - **UI responsiveness**: The monitor subscribes to 5 bounded, content-free Tauri events only while expanded, caps rendered rows at 50 (`MAX_VISIBLE_SESSIONS`), and bounds in-memory maps at 128 sessions (`MAX_TRACKED_SESSIONS`).
   - **Scheduler heartbeat (`agent:scheduler-heartbeat`)**: Emitted every 15s while a worker task polls an active turn (`recent` <45s, `late` ≥45s, `missing` ≥120s). Proves Tokio worker polling only — not LLM provider or tool progress.
   - **Provider/tool phase & progress watch (`agent:native-phase`, `agent:native-progress`)**: Tracks `provider_request_start`, `tool_execute_start`, `tool_result`, and rate-limited (≥2s) provider streaming pulses. Quiet-period advisories trigger at ≥5m (`quiet`) and ≥60m (`expired`) of silence.
   - **Legitimate user wait vs DB contention**: Sessions awaiting approval (`waiting_for_user`, `paused`) are separated into the Attention bucket, while SQLite connections use `WAL` + `busy_timeout = 5000ms` + bounded retries.
3. **Safe Recovery Guarantees**:
   - **No automatic replay of side-effectful work**: Quiet-period and heartbeat warnings are strictly diagnostic.
   - **Dead-worker replacement**: If a worker panics or exits unexpectedly, `ensure_worker_alive()` spawns a fresh worker on the next submission without replaying failed turns.
   - **Parallel tool persistence before exit**: Completed sibling tool results are persisted to the transcript before `EndTurn` or error-limit exits.
   - **Startup recovery**: Reconciles stale `running`/`in_progress` sessions to `abandoned` across independent phases without aborting later cleanup steps.

### Release validation status & terminology (`PR #23` on `develop`)

To avoid ambiguity, TP Agent Studio tracks five distinct engineering states:

| Status term       | Definition                                                                                            | Current state on `develop` (`7cf8c3329d9ffd0379f72a1a73b05c84c9f2d210` + branch fixes)                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Implemented**   | Source code and configuration exist in the repository                                                 | Fork identity (`com.theerasakping.tpagentstudio`), isolated runtime profile (`~/.tp-agent-studio`), disabled updater (`FORK_UPDATER_READY=false`), `DialogScheduler` recovery, Auto-Dream OS file lease, Live Session Monitor, and Worker Overview                                                         |
| **Tested**        | Automated unit/integration tests pass with recorded evidence                                          | Frontend typecheck/ESLint/Vitest (52/52 SessionHealth, 57/57 dev scripts, 10/10 tauri wrapper tests), fork safety/identity/icon guards, and Rust scheduler/recovery/lock tests (including synthetic 1/5/20/50-session offline concurrency tests; **does not** prove 50 concurrent live LLM provider calls) |
| **Built**         | Compiled native binary and packaged `.app` / `.dmg` / `.exe` / `.deb` artifacts produced              | macOS Apple Silicon (`aarch64-apple-darwin`) `.app` and `.dmg` built locally (local build mode, ad-hoc signed `-`); Linux x64 and Windows x64 preview installers built in GitHub Actions run `39045826243`                                                                                                 |
| **Installed**     | Artifact mounted/copied and launched on target OS hardware with verified profile isolation            | Verified on Apple Silicon Mac M4 (`arm64`): `TP Agent Studio.app` launches, renders UI, stages `org2-pm` sidecar, keeps updater disabled, and isolates runtime state from `~/.orgii`                                                                                                                       |
| **Release-ready** | Independently signed, notarized, Cloud/OAuth-isolated, and certified for public end-user distribution | **Not yet Release-ready** — blocked on Apple Developer ID signing/notarization, Windows Authenticode signing, fork-owned Cloud/OAuth backend (`docs/fork/FORK_CLOUD_BOUNDARY.md`), and real-provider 50-session stress certification                                                                       |

**Important:** GitHub commits on this fork do **not** modify an installed upstream ORG2 application.
To track code review and CI: [merged PR #23](https://github.com/TheerasakPing/ORG2/pull/23) ·
[GitHub Actions](https://github.com/TheerasakPing/ORG2/actions) ·
[Cloud/OAuth release blockers](docs/fork/FORK_CLOUD_BOUNDARY.md) ·
[two-tone icon and regeneration](docs/fork/TWO_TONE_BRANDING.md).

## Features

<table>
<tr>
<td width="50%" valign="middle">

### Built-in Rust harness

Run fast, token-saving, customizable native agents with your existing API keys and agent subscriptions.

</td>
<td width="50%">
  <img src="docs/assets/feature-wall/rust-harness.gif" alt="Run agents with the ORG2 Rust harness" width="100%" />
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Manage sessions across 10+ apps &amp; CLIs

Load and manage agent sessions from all your tools in one place. Scan history, inspect subagents, and control each source without switching apps.

</td>
<td width="50%">
  <img src="docs/assets/feature-wall/session-sources.png" alt="Manage agent session sources across apps and CLIs in ORG2" width="100%" />
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Team up and review trajectories, not just PRs

Form your team and share sessions across devices and teammates. Review the full agent trajectory, not only the resulting diff, and leave comments in context.

</td>
<td width="50%">
  <img src="docs/assets/feature-wall/team-trajectory-review.png" alt="Manage teammates and trajectory replay permissions in ORG2" width="100%" />
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Tool calls, now as videos

Replay work from the native Rust harness and 15+ CLI agents. Messages, tool calls, file edits, and command output stay synchronized in one reviewable timeline.

</td>
<td width="50%">
  <img src="docs/assets/feature-wall/replay.gif" alt="Replay an agent session in ORG2" width="100%" />
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### AI blame, not just Git blame

Do not stop at who changed a line. Trace it back to the agent sessions, tool calls, and decisions that drove the change.

</td>
<td width="50%">
  <img src="docs/assets/feature-wall/ai-blame.gif" alt="Trace code changes back to agent sessions and decisions in ORG2" width="100%" />
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Stay on track

See how your time is spent across tasks and agent sessions. A daily activity timeline keeps duration, code changes, and priorities visible.

</td>
<td width="50%">
  <img src="docs/assets/feature-wall/work-diary.png" alt="Review time spent across tasks and agent sessions in ORG2" width="100%" />
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Full dev workspace

Use the terminal, manage source control, trace Git history, and review pull requests without leaving your agent workspace.

</td>
<td width="50%">
  <img src="docs/assets/feature-wall/development-workspace.gif" alt="Source control, Git history, and code review tools in ORG2" width="100%" />
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Design Mode

Inspect live pages in the native WebKit browser. Select an element and send its exact page context straight to the agent for a straightforward fix.

</td>
<td width="50%">
  <img src="docs/assets/feature-wall/design-mode.gif" alt="Inspect a webpage element with ORG2 Design Mode" width="100%" />
</td>
</tr>
</table>

## More capabilities

- GUI, CLI, terminal, Git, browser, LSP, timeline, and database tooling.
- Cross-session memory, cross-agent knowledge sharing, and shared workspace state.
- Resource-aware execution that can react to CPU, RAM, and human attention availability.
- Agent-powered GUI end-to-end testing for supervised self-evolution.
- Scheduling and auto-started sessions so agents can run overnight or continue work when you are away.
- Org-level alignment surfaces (issues/projects management) for coordinating humans, agents, goals, and accountability (WIP).
- Session collaboration and group issue workflows via self-hosted Supabase (WIP).

## Supported Agents

Use ORG2's built-in Rust harness or launch these supported coding-agent CLIs from the desktop app.

### GUI + TUI

<p>
  <a href="#built-in-rust-harness"><kbd><img src="docs/assets/org2-icon.svg" alt="ORG-2 logo" width="22" valign="middle" /> ORG-2</kbd></a> &nbsp;
  <a href="https://cursor.com/docs/cli/overview"><kbd><img src="src/assets/modelIcons/cursor.svg" alt="Cursor CLI logo" width="16" valign="middle" /> Cursor CLI</kbd></a> &nbsp;
  <a href="https://code.claude.com/docs/en/configuration"><kbd><img src="src/assets/modelIcons/claude.svg" alt="Claude logo" width="16" valign="middle" /> Claude Code</kbd></a> &nbsp;
  <a href="https://developers.openai.com/codex/config-basic"><kbd><img src="src/assets/modelIcons/openai.svg" alt="Codex logo" width="16" valign="middle" /> Codex</kbd></a> &nbsp;
  <a href="https://kiro.dev/docs/cli/installation"><kbd><img src="src/assets/modelIcons/kiro.svg" alt="Kiro CLI logo" width="16" valign="middle" /> Kiro CLI</kbd></a> &nbsp;
  <a href="https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-in-the-cli"><kbd><img src="src/assets/modelIcons/copilot.svg" alt="GitHub Copilot logo" width="16" valign="middle" /> GitHub Copilot</kbd></a> &nbsp;
  <a href="https://opencode.ai/docs/config/"><kbd><img src="src/assets/modelIcons/opencode.svg" alt="OpenCode logo" width="16" valign="middle" /> OpenCode</kbd></a> &nbsp;
  <a href="https://github.com/deepseek-ai/deepseek-harness"><kbd><img src="src/assets/modelIcons/deepseek.svg" alt="DeepSeek Harness logo" width="16" valign="middle" /> DeepSeek Harness</kbd></a> &nbsp;
  <a href="https://antigravity.google/docs/cli/getting-started"><kbd><img src="src/assets/modelIcons/antigravity.svg" alt="Antigravity logo" width="16" valign="middle" /> Antigravity</kbd></a>
</p>

### TUI

<p>
  <a href="https://www.kimi.com/code/docs/en/kimi-code-cli/configuration/configuration-files.html"><kbd><img src="src/assets/modelIcons/kimi.svg" alt="Kimi Code CLI logo" width="16" valign="middle" /> Kimi Code CLI</kbd></a> &nbsp;
  <a href="https://aider.chat/docs/config.html"><kbd><img src="src/assets/modelIcons/aider.svg" alt="Aider logo" width="16" valign="middle" /> Aider</kbd></a> &nbsp;
  <a href="https://goose-docs.ai/docs/category/getting-started/"><kbd><img src="src/assets/modelIcons/goose.svg" alt="Goose logo" width="16" valign="middle" /> Goose</kbd></a> &nbsp;
  <a href="https://ampcode.com/manual"><kbd><img src="src/assets/modelIcons/amp.svg" alt="Amp logo" width="16" valign="middle" /> Amp</kbd></a> &nbsp;
  <a href="https://docs.cline.bot/cli/cli-reference"><kbd><img src="src/assets/modelIcons/cline.svg" alt="Cline logo" width="16" valign="middle" /> Cline</kbd></a> &nbsp;
  <a href="https://kilo.ai/docs/cli"><kbd><img src="src/assets/modelIcons/kilo.svg" alt="Kilo Code logo" width="16" valign="middle" /> Kilo Code</kbd></a> &nbsp;
  <a href="https://docs.x.ai/build/overview"><kbd><img src="src/assets/modelIcons/grok.svg" alt="Grok CLI logo" width="16" valign="middle" /> Grok CLI</kbd></a> &nbsp;
  <a href="https://docs.devin.ai/cli"><kbd><img src="src/assets/modelIcons/devin.svg" alt="Devin logo" width="16" valign="middle" /> Devin</kbd></a> &nbsp;
  <a href="https://hermes-agent.nousresearch.com/docs/user-guide/configuration"><kbd><img src="src/assets/modelIcons/hermes.svg" alt="Hermes logo" width="16" valign="middle" /> Hermes</kbd></a> &nbsp;
  <a href="https://docs.openclaw.ai/cli/config"><kbd><img src="src/assets/modelIcons/openclaw.svg" alt="OpenClaw logo" width="16" valign="middle" /> OpenClaw</kbd></a> &nbsp;
  <a href="https://www.codebuff.com/docs"><kbd><img src="src/assets/modelIcons/infinity-agent.svg" alt="Codebuff logo" width="16" valign="middle" /> Codebuff</kbd></a> &nbsp;
  <a href="https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/"><kbd><img src="src/assets/modelIcons/qwen.svg" alt="Qwen Code logo" width="16" valign="middle" /> Qwen Code</kbd></a> &nbsp;
  <a href="https://mimo.xiaomi.com/mimocode/config-files"><kbd><img src="src/assets/modelIcons/xiaomimimo.svg" alt="Mimo Code logo" width="16" valign="middle" /> Mimo Code</kbd></a> &nbsp;
  <a href="https://docs.continue.dev/cli/configuration"><kbd><img src="src/assets/modelIcons/continue.svg" alt="Continue logo" width="16" valign="middle" /> Continue</kbd></a> &nbsp;
  <a href="https://docs.factory.ai/cli/byok/overview"><kbd><img src="src/assets/modelIcons/droid.svg" alt="Droid logo" width="16" valign="middle" /> Droid</kbd></a> &nbsp;
  <a href="https://docs.mistral.ai/vibe/code/cli/install-setup"><kbd><img src="src/assets/modelIcons/mistral.svg" alt="Mistral Vibe logo" width="16" valign="middle" /> Mistral Vibe</kbd></a> &nbsp;
  <a href="https://docs.autohand.ai/integrations/ai-model-providers"><kbd><img src="src/assets/modelIcons/autohand.svg" alt="Autohand logo" width="16" valign="middle" /> Autohand</kbd></a> &nbsp;
  <a href="https://github.com/open-horizon-labs/oh-omp"><kbd><img src="src/assets/modelIcons/omp.svg" alt="OMP logo" width="16" valign="middle" /> OMP</kbd></a> &nbsp;
  <a href="https://pi.dev/docs/latest/providers"><kbd><img src="src/assets/modelIcons/pi.svg" alt="Pi logo" width="16" valign="middle" /> Pi</kbd></a>
</p>

## Release availability

Current source version: v2.0.8 (2026-09-23)

**No independently signed TP Agent Studio installers are available yet.** This fork is being developed and tested separately from the original publisher. Releases are blocked on independent Apple Developer ID / Windows Authenticode signing, real-provider concurrency/restart stress certification, and independent Cloud/OAuth infrastructure. Unsigned preview builds are for isolated local testing only and must never be treated as signed production releases.

See [Fork Engineering Guide](FORK.md) for current safety status, macOS M4 build/install instructions, environment configuration, and troubleshooting. Do not mistake upstream installers for releases of this fork.

## Supported platforms

| Platform                    | Target triple              | Preview packaging     | Status                                                             |
| --------------------------- | -------------------------- | --------------------- | ------------------------------------------------------------------ |
| macOS Apple Silicon (M1–M4) | `aarch64-apple-darwin`     | `.app`, `.dmg`        | Built & verified locally on Apple M4 (`arm64`, ad-hoc signed `-`)  |
| Windows 11 x64              | `x86_64-pc-windows-msvc`   | `.exe` (NSIS), `.msi` | Built in GitHub Actions preview workflow (`39045826243`, unsigned) |
| Linux x64                   | `x86_64-unknown-linux-gnu` | `.deb`, `.rpm`        | Built in GitHub Actions preview workflow (`39045826243`, unsigned) |

## Develop & build from source (macOS Apple Silicon M4)

### 1. Prerequisites & development setup

- **macOS** on Apple Silicon (`arm64` / `aarch64-apple-darwin`) with Xcode Command Line Tools (`xcode-select --install`)
- **Rust** stable (`rustc` / `cargo`) with target `aarch64-apple-darwin`
- **Node.js** (v20+ / v26 tested) and **pnpm** (`9.x`)

```bash
git clone https://github.com/TheerasakPing/ORG2.git
cd ORG2
git switch develop
pnpm install --frozen-lockfile
pnpm run download:sidecars
pnpm run tauri:dev
```

### 2. Building & installing on macOS M4

`src-tauri/build.rs` enforces build-provenance guards and `scripts/tauri/prepare-sidecars.cjs` automatically compiles and stages the required `org2-pm` binary into `src-tauri/binaries/org2-pm-aarch64-apple-darwin` before Tauri bundles:

- `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/TP Agent Studio.app`
- `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/TP Agent Studio_2.0.8_aarch64.dmg`

See [FORK.md](FORK.md) for the exact local preview build command, environment/profile isolation variables (`~/.tp-agent-studio`, ports `23847` / `27888`), Gatekeeper `xattr -cr` instructions, and troubleshooting.

## Optional native sidecars

Browser Use and Computer Use features rely on optional native helpers for browser automation and macOS screen automation:

- `agent-browser` is downloaded from `vercel-labs/agent-browser` releases for the current OS/CPU.
- `peekaboo` is downloaded from `steipete/peekaboo` releases on macOS.

Computer Use is currently available on macOS only. Browser Use can use `agent-browser` on supported platforms.

If a sidecar is missing, the Rust build creates a small placeholder resource so development builds can continue. The related capability may fall back to `PATH` or remain unavailable until you run `pnpm run download:sidecars`.

For more contribution details, see [CONTRIBUTING.md](.github/CONTRIBUTING.md). We ask everyone to be respectful and empathetic; see [CODE_OF_CONDUCT.md](.github/CODE_OF_CONDUCT.md).

## Community

Have questions, feedback, or want to follow along as ORG-2 evolves? Join us on Discord:

👉 **Discord: [discord.gg/tvWgAqhCzs](https://discord.gg/tvWgAqhCzs)**
👉 **WeChat: [https://github.com/org2AI/ORG2/issues/128]**

- **#how-to-use-org2** and **#faq** — get up and running
- **#announcement** — release news and updates
- **#lets-chat** — share what you're building and meet the community
- **#feedback** — ideas, feature requests, and bug reports

## License

ORG2 is licensed under the GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`). See [`LICENSE`](LICENSE) for the full license text.
