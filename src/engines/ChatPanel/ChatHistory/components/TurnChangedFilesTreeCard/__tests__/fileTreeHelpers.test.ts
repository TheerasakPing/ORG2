import { describe, expect, it } from "vitest";

import type { FileChangeInfo } from "@src/engines/ChatPanel/InputArea/components/compactFileChangesHelpers";

import { buildFileTree } from "../fileTreeHelpers";

describe("buildFileTree", () => {
  it("groups files by folder and aggregates addition/deletion counts", () => {
    const files: FileChangeInfo[] = [
      {
        path: "docs/RELEASE-HANDOFF.md",
        fileName: "RELEASE-HANDOFF.md",
        status: "modified",
        additions: 2,
        deletions: 2,
        lineCount: 0,
      },
      {
        path: "src/main.tsx",
        fileName: "main.tsx",
        status: "modified",
        additions: 83,
        deletions: 8,
        lineCount: 0,
      },
      {
        path: "src/style.css",
        fileName: "style.css",
        status: "modified",
        additions: 28,
        deletions: 3,
        lineCount: 0,
      },
      {
        path: "src-tauri/src/keychain.rs",
        fileName: "keychain.rs",
        status: "modified",
        additions: 2,
        deletions: 1,
        lineCount: 0,
      },
    ];

    const tree = buildFileTree(files);

    expect(tree.totalFiles).toBe(4);
    expect(tree.totalAdditions).toBe(115);
    expect(tree.totalDeletions).toBe(14);
    expect(tree.nodes).toHaveLength(3);

    // docs
    const docs = tree.nodes.find((n) => n.folderPath === "docs");
    expect(docs).toBeDefined();
    expect(docs?.totalAdditions).toBe(2);
    expect(docs?.totalDeletions).toBe(2);
    expect(docs?.files).toHaveLength(1);

    // src
    const src = tree.nodes.find((n) => n.folderPath === "src");
    expect(src).toBeDefined();
    expect(src?.totalAdditions).toBe(111);
    expect(src?.totalDeletions).toBe(11);
    expect(src?.files).toHaveLength(2);

    // src-tauri/src
    const tauri = tree.nodes.find((n) => n.folderPath === "src-tauri/src");
    expect(tauri).toBeDefined();
    expect(tauri?.totalAdditions).toBe(2);
    expect(tauri?.totalDeletions).toBe(1);
    expect(tauri?.files).toHaveLength(1);
  });

  it("handles root-level files correctly", () => {
    const files: FileChangeInfo[] = [
      {
        path: "README.md",
        fileName: "README.md",
        status: "modified",
        additions: 10,
        deletions: 0,
        lineCount: 0,
      },
    ];

    const tree = buildFileTree(files);
    expect(tree.nodes).toHaveLength(0);
    expect(tree.rootFiles).toHaveLength(1);
    expect(tree.rootFiles[0].fileName).toBe("README.md");
  });
});
