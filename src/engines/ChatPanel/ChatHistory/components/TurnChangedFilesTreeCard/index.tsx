import React, { memo, useCallback, useMemo, useState } from "react";

import FileTypeIcon from "@src/components/FileTypeIcon";
import type { FileChangeInfo } from "@src/engines/ChatPanel/InputArea/components/compactFileChangesHelpers";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUpDownIcon,
  ClipboardCopyIcon,
  FolderOpenIcon,
  GitBranchIcon,
  HugeiconsIcon,
  SquareArrowUpRight02Icon,
} from "@src/icons";

import { buildFileTree } from "./fileTreeHelpers";

export interface TurnChangedFilesTreeCardProps {
  files: readonly FileChangeInfo[];
  branchName?: string;
  completedAt?: string;
  onOpenDiff?: (filePath?: string) => void;
  className?: string;
}

export const TurnChangedFilesTreeCard: React.FC<TurnChangedFilesTreeCardProps> =
  memo(({ files, branchName, completedAt, onOpenDiff, className = "" }) => {
    const [collapsedFolders, setCollapsedFolders] = useState<
      Record<string, boolean>
    >({});
    const [copied, setCopied] = useState(false);

    const tree = useMemo(() => buildFileTree(files), [files]);

    const toggleFolder = useCallback((folderPath: string) => {
      setCollapsedFolders((prev) => ({
        ...prev,
        [folderPath]: !prev[folderPath],
      }));
    }, []);

    const toggleAll = useCallback(() => {
      setCollapsedFolders((prev) => {
        const anyExpanded = tree.nodes.some((n) => !prev[n.folderPath]);
        const next: Record<string, boolean> = {};
        for (const node of tree.nodes) {
          next[node.folderPath] = anyExpanded;
        }
        return next;
      });
    }, [tree.nodes]);

    const handleCopy = useCallback(() => {
      const lines: string[] = [
        `${tree.totalFiles} changed files (+${tree.totalAdditions} -${tree.totalDeletions})`,
      ];
      for (const node of tree.nodes) {
        lines.push(
          `📁 ${node.folderPath}/ (+${node.totalAdditions} -${node.totalDeletions})`
        );
        for (const file of node.files) {
          lines.push(
            `  ${file.fileName} (+${file.additions} -${file.deletions})`
          );
        }
      }
      for (const file of tree.rootFiles) {
        lines.push(`${file.fileName} (+${file.additions} -${file.deletions})`);
      }
      void navigator.clipboard.writeText(lines.join("\n")).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        setCopied(false);
      });
    }, [tree]);

    const formattedTime = useMemo(() => {
      if (!completedAt) return "";
      try {
        const date = new Date(completedAt);
        if (Number.isNaN(date.getTime())) return completedAt;
        return date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return completedAt;
      }
    }, [completedAt]);

    if (files.length === 0) return null;

    return (
      <div
        className={`my-2 flex flex-col overflow-hidden rounded-xl border border-border-2 bg-fill-2/60 font-sans text-text-1 shadow-sm transition-all ${className}`}
        data-testid="turn-changed-files-tree-card"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-border-3 bg-fill-1/40 px-3.5 py-2.5 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <span className="text-text-1">
              {tree.totalFiles}{" "}
              {tree.totalFiles === 1 ? "changed file" : "changed files"}
            </span>
            <span className="font-mono text-xs font-semibold text-emerald-400">
              +{tree.totalAdditions}
            </span>
            <span className="font-mono text-xs font-semibold text-rose-400">
              -{tree.totalDeletions}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {tree.nodes.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                title="Toggle all folders"
                className="rounded p-1 text-text-3 transition-colors hover:bg-fill-3 hover:text-text-1"
                aria-label="Toggle all folders"
              >
                <HugeiconsIcon icon={ArrowUpDownIcon} size={15} />
              </button>
            )}

            {onOpenDiff && (
              <button
                type="button"
                onClick={() => onOpenDiff()}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-2 bg-fill-3 px-2.5 py-1 text-xs font-medium text-text-2 transition-colors hover:bg-fill-4 hover:text-text-1"
                data-testid="tree-card-open-diff"
              >
                <HugeiconsIcon
                  icon={SquareArrowUpRight02Icon}
                  size={13}
                  className="text-text-3"
                />
                <span>Open diff</span>
              </button>
            )}
          </div>
        </div>

        {/* Tree List */}
        <div className="flex flex-col space-y-0.5 px-2 py-1.5 text-xs">
          {tree.nodes.map((node) => {
            const isCollapsed = Boolean(collapsedFolders[node.folderPath]);
            return (
              <div key={node.folderPath} className="flex flex-col">
                {/* Folder Row */}
                <div
                  onClick={() => toggleFolder(node.folderPath)}
                  className="group flex cursor-pointer items-center justify-between rounded px-2 py-1 text-text-2 transition-colors select-none hover:bg-fill-3/60"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <HugeiconsIcon
                      icon={isCollapsed ? ArrowRight01Icon : ArrowDown01Icon}
                      size={13}
                      className="shrink-0 text-text-3"
                    />
                    <HugeiconsIcon
                      icon={FolderOpenIcon}
                      size={15}
                      className="shrink-0 text-amber-400/90"
                    />
                    <span className="truncate font-mono text-xs font-medium text-text-2">
                      {node.folderPath}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5 pl-2 font-mono text-[11px]">
                    <span className="text-emerald-400/90">
                      +{node.totalAdditions}
                    </span>
                    <span className="text-rose-400/90">
                      -{node.totalDeletions}
                    </span>
                  </div>
                </div>

                {/* Folder Files */}
                {!isCollapsed && (
                  <div className="my-0.5 ml-3.5 flex flex-col space-y-0.5 border-l border-border-3/40 pl-6">
                    {node.files.map((file) => (
                      <div
                        key={file.path}
                        onClick={() => onOpenDiff?.(file.path)}
                        className="group flex cursor-pointer items-center justify-between rounded px-2 py-1 text-text-2 transition-colors hover:bg-fill-3"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <FileTypeIcon fileName={file.fileName} size="small" />
                          <span className="truncate font-mono text-xs text-text-1 transition-colors group-hover:text-primary-5">
                            {file.fileName}
                          </span>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5 pl-2 font-mono text-[11px]">
                          <span className="text-emerald-400">
                            +{file.additions}
                          </span>
                          <span className="text-rose-400">
                            -{file.deletions}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Root-level Files */}
          {tree.rootFiles.map((file) => (
            <div
              key={file.path}
              onClick={() => onOpenDiff?.(file.path)}
              className="group flex cursor-pointer items-center justify-between rounded px-2 py-1 text-text-2 transition-colors hover:bg-fill-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileTypeIcon fileName={file.fileName} size="small" />
                <span className="truncate font-mono text-xs text-text-1 transition-colors group-hover:text-primary-5">
                  {file.fileName}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 pl-2 font-mono text-[11px]">
                <span className="text-emerald-400">+{file.additions}</span>
                <span className="text-rose-400">-{file.deletions}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Card Footer Bar */}
        <div className="flex items-center justify-between border-t border-border-3 bg-fill-1/30 px-3 py-1.5 text-[11px] text-text-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCopy}
              className="flex cursor-pointer items-center gap-1 transition-colors hover:text-text-1"
              title="Copy changed files summary"
            >
              <HugeiconsIcon icon={ClipboardCopyIcon} size={13} />
              <span>{copied ? "Copied!" : ""}</span>
            </button>

            {branchName && (
              <div className="flex items-center gap-1 text-text-3">
                <HugeiconsIcon icon={GitBranchIcon} size={13} />
                <span className="font-mono">{branchName}</span>
              </div>
            )}
          </div>

          {formattedTime && (
            <span className="font-mono text-text-3">{formattedTime}</span>
          )}
        </div>
      </div>
    );
  });

TurnChangedFilesTreeCard.displayName = "TurnChangedFilesTreeCard";

export default TurnChangedFilesTreeCard;
