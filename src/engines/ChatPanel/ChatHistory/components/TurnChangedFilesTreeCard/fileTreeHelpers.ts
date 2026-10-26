import type { FileChangeInfo } from "@src/engines/ChatPanel/InputArea/components/compactFileChangesHelpers";

export interface DirectoryTreeNode {
  folderPath: string;
  folderName: string;
  files: FileChangeInfo[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface FileTreeSummary {
  nodes: DirectoryTreeNode[];
  rootFiles: FileChangeInfo[];
  totalAdditions: number;
  totalDeletions: number;
  totalFiles: number;
}

/**
 * Groups a flat array of changed files into folder buckets with rolled-up diff counts,
 * matching the tree structure shown in modern AI coding agents.
 */
export function buildFileTree(
  files: readonly FileChangeInfo[]
): FileTreeSummary {
  const folderMap = new Map<
    string,
    { files: FileChangeInfo[]; additions: number; deletions: number }
  >();
  const rootFiles: FileChangeInfo[] = [];

  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const file of files) {
    totalAdditions += file.additions;
    totalDeletions += file.deletions;

    const normalizedPath = file.path.replace(/\\/g, "/").replace(/^\/+/, "");
    const lastSlash = normalizedPath.lastIndexOf("/");

    if (lastSlash === -1) {
      rootFiles.push(file);
    } else {
      const folderPath = normalizedPath.slice(0, lastSlash);
      const existing = folderMap.get(folderPath);
      if (existing) {
        existing.files.push(file);
        existing.additions += file.additions;
        existing.deletions += file.deletions;
      } else {
        folderMap.set(folderPath, {
          files: [file],
          additions: file.additions,
          deletions: file.deletions,
        });
      }
    }
  }

  const nodes: DirectoryTreeNode[] = Array.from(folderMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folderPath, data]) => {
      const segments = folderPath.split("/");
      const folderName = segments[segments.length - 1] || folderPath;
      return {
        folderPath,
        folderName,
        files: data.files.sort((a, b) => a.fileName.localeCompare(b.fileName)),
        totalAdditions: data.additions,
        totalDeletions: data.deletions,
      };
    });

  return {
    nodes,
    rootFiles: rootFiles.sort((a, b) => a.fileName.localeCompare(b.fileName)),
    totalAdditions,
    totalDeletions,
    totalFiles: files.length,
  };
}
