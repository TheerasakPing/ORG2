# Chat Action Stream and Changed Files Tree Specification

## 1. Overview & Objective

Users in modern AI development environments (such as Cursor, Windsurf, Claude Code, and T3 Code) rely heavily on visual cues to understand agent execution at a glance.
The objective of this specification is to enhance the chat turn interface with two complementary components:

1. **Compact Action/Tool Execution Stream**: Clean, single-line action rows for terminal commands (`>_`), file reads (`👁`), and file edits (`📝`), complete with timestamps and interactive expandable details.
2. **Interactive Changed Files Tree Card**: A structured file-tree card showing total files changed, diff statistics (`+N -M`), directory-level grouping with expand/collapse, file-type icons, an `Open diff` button, and a footer with copy, git branch, and timestamp.

Both components render directly below the agent's response when a turn completes.

---

## 2. Component Design & Anatomy

### 2.1 Compact Action Stream (`TurnActionFeed`)

#### Visual Layout:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 📝  ORG2/docs/superpowers/plans/2026-10-18-plan.md                   > │
│ >_  pkill -f "/Applications/TP Agent Studio.app/..."       12:40 PM  > │
│ >_  git status                                                       > │
│ 👁  Read ORG2/docs/superpowers/plans/...                             > │
│ 📝  ORG2/docs/superpowers/plans/...                                  > │
│ >_  git add docs/... && git commit -m "docs..."                      > │
└────────────────────────────────────────────────────────────────────────┘
```

#### Row Types:

- **Terminal Command (`run_shell`, `run_command`, bash/exec)**:
  - Icon: Terminal prompt `>_`
  - Text: Full or truncated command line
  - Meta: Execution time (e.g., `12:40 PM`)
  - Control: Chevron `>` to expand inline output/exit code.
- **File Read (`read_file`, `view_file`, `client_view_file`)**:
  - Icon: Eye glyph (`ViewIcon`)
  - Text: `Read <relative_path>`
  - Control: Chevron `>` to open preview or inspect lines read.
- **File Edit/Write (`edit_file`, `client_edit_file`, `client_create_file`)**:
  - Icon: Pencil/document glyph (`PencilEdit02Icon`)
  - Text: `<relative_path>`
  - Control: Chevron `>` to view file change diff.

---

### 2.2 Changed Files Tree Card (`TurnChangedFilesTreeCard`)

#### Visual Layout:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 4 changed files  +115 -14                                 ^v  [+] Open diff │
│                                                                        │
│ v 📁 docs                                                       +2  -2 │
│     M↓ RELEASE-HANDOFF.md                                      +2  -2 │
│ v 📁 src                                                      +111 -11 │
│     ⚛ main.tsx                                                 +83  -8 │
│     # style.css                                                +28  -3 │
│ v 📁 src-tauri/src                                              +2  -1 │
│     ⚙ keychain.rs                                               +2  -1 │
│                                                                        │
│ 📋 [Copy]   🌿 work/macos-m4-beta-readiness                    1:25 PM │
└────────────────────────────────────────────────────────────────────────┘
```

#### Key Elements:

1. **Header Bar**:
   - Total changed files counter (e.g. `4 changed files`).
   - Combined additions (`+115` in emerald green) and deletions (`-14` in rose red).
   - Collapse/Expand all toggle (`ArrowUpDownIcon`).
   - `Open diff` button: calls `openDiff()` to open Agent Station Diff viewer with current turn scope.
2. **Hierarchical Tree View**:
   - Files partitioned by directory path segments (`docs`, `src`, `src-tauri/src`).
   - Directory rows with folder icon, folder path, and aggregated folder diff stats.
   - File rows with canonical `FileTypeIcon`, file basename, and per-file diff stats.
   - Clicking a file opens the diff viewer focused on that file.
3. **Card Footer**:
   - Copy button: copies file paths & diff summary to clipboard.
   - Branch indicator: displays active git branch or git artifact summary.
   - Timestamp: formatted completion time (e.g., `1:25 PM`).

---

## 3. Data Integration

- **Turn Summary**: Extracted from `TurnSummary` in SQLite cache via `turnMetadataAtomFamily`.
- **Modified Files**: Mapped from `TurnModifiedFile[]` (`path`, `fileName`, `additions`, `deletions`, `status`).
- **Turn Events**: Loaded via `loadTurnBody(sessionId, turnId)` for live or completed turns to extract terminal commands and individual tool actions.

---

## 4. Verification Criteria

1. **Tree Parsing**: Unit test verifies nested folder tree construction from flat `TurnModifiedFile[]` array with accurate aggregated stats.
2. **Action Feed**: Unit test verifies correct classification and formatting of shell commands, file reads, and file edits.
3. **Diff Integration**: Clicking `Open diff` correctly sets diff scope atom and switches simulator to Agent Station Diff mode.
4. **Copy Action**: Clicking Copy writes formatted file summary to clipboard.
