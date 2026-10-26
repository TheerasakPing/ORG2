# Chat Action Stream and Changed Files Tree Implementation Plan

> **Goal:** Implement the Compact Action/Tool Execution Stream and the Interactive Changed Files Tree Card at the end of agent turns in the Chat Panel, matching modern AI coding assistant interfaces.

- **Design Spec:** [`docs/superpowers/specs/2026-10-18-chat-action-stream-and-changed-files-design.md`](file:///Volumes/Data/workspace/git/ORG2/docs/superpowers/specs/2026-10-18-chat-action-stream-and-changed-files-design.md)
- **Branch:** `work/macos-m4-beta-readiness`

---

## Proposed Changes

### `src/engines/ChatPanel/ChatHistory/components`

#### 1. File Tree Helper & Tree Card

- **File:** `src/engines/ChatPanel/ChatHistory/components/TurnChangedFilesTreeCard/fileTreeHelpers.ts`
  - Function `buildFileTree(files: FileChangeInfo[]): DirectoryTreeNode[]` to partition flat files into folder nodes with aggregated addition/deletion counts.
- **File:** `src/engines/ChatPanel/ChatHistory/components/TurnChangedFilesTreeCard/index.tsx`
  - Renders the header (`{N} changed files`, `+X -Y`, `Open diff`), collapsible folder branches with `FileTypeIcon`, and the footer bar with Copy, Branch, and Timestamp.
- **File:** `src/engines/ChatPanel/ChatHistory/components/TurnChangedFilesTreeCard/__tests__/fileTreeHelpers.test.ts`
  - Unit tests asserting accurate directory grouping, deep folder rollup, and diff stat aggregation.

#### 2. Compact Action Feed

- **File:** `src/engines/ChatPanel/ChatHistory/components/TurnActionFeed/actionFeedHelpers.ts`
  - Helper to extract and categorize action items (`terminal`, `read`, `edit`) from turn events or `resourceInteractions`.
- **File:** `src/engines/ChatPanel/ChatHistory/components/TurnActionFeed/index.tsx`
  - Renders single-line rows with `>_`, `👁`, `📝` icons, timestamp, chevron, and expandable output drawer.
- **File:** `src/engines/ChatPanel/ChatHistory/components/TurnActionFeed/__tests__/actionFeedHelpers.test.ts`
  - Unit tests asserting correct action identification, path normalization, and timestamp formatting.

#### 3. Integration into `TurnMetadataFooter`

- **File:** `src/engines/ChatPanel/ChatHistory/components/TurnMetadataFooter/index.tsx`
  - Embed `TurnActionFeed` and `TurnChangedFilesTreeCard` cleanly within the completed turn footer.
  - Maintain backwards compatibility with existing tabs and test suites.

---

## Tasks

### Task 1: Build File Tree Generator & Tests

- Implement `fileTreeHelpers.ts` with directory tree aggregation.
- Add comprehensive unit tests in `fileTreeHelpers.test.ts`.
- Run tests: `pnpm test src/engines/ChatPanel/ChatHistory/components/TurnChangedFilesTreeCard`.

### Task 2: Build `TurnChangedFilesTreeCard` Component

- Implement `TurnChangedFilesTreeCard.tsx` with header (+N -M, Open diff), folder toggles, `FileTypeIcon`, and footer (Copy, Git Branch, Timestamp).
- Add component test asserting rendering and click callbacks.

### Task 3: Build `TurnActionFeed` Component & Helpers

- Implement `actionFeedHelpers.ts` to transform turn events into compact action entries (`terminal`, `read`, `edit`).
- Implement `TurnActionFeed.tsx` with chevron expanders and inline detail previews.
- Add unit tests verifying action extraction.

### Task 4: Integrate into Turn Footer & Verify

- Mount `TurnActionFeed` and `TurnChangedFilesTreeCard` in `TurnMetadataFooter`.
- Run full test suite for chat components (`pnpm test src/engines/ChatPanel/ChatHistory/components/TurnMetadataFooter`).
- Run fork safety and icon invariant checks (`node scripts/fork/check-safety.mjs`).
- Build frontend (`pnpm build`).
