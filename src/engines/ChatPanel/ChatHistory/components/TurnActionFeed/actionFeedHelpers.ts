import type { SessionEvent } from "@src/engines/SessionCore/core/types";
import type { TurnResourceInteraction } from "@src/engines/SessionCore/storage/sqliteCache";

export type ActionCategory = "terminal" | "read" | "edit";

export interface ActionFeedItem {
  id: string;
  category: ActionCategory;
  title: string;
  subtitle?: string;
  timestamp?: string;
  details?: string;
  path?: string;
}

function formatTime(isoString?: string): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/**
 * Extracts compact action items from raw session events or resource interactions
 */
export function extractActionFeedItems(
  events: readonly SessionEvent[],
  interactions?: readonly TurnResourceInteraction[]
): ActionFeedItem[] {
  const items: ActionFeedItem[] = [];

  for (const event of events) {
    const fn = (
      event.functionName ||
      event.actionType ||
      event.uiCanonical ||
      ""
    ).toLowerCase();
    const args = event.args || {};
    const result = event.result || {};

    // 1. Terminal commands
    if (
      fn === "run_shell" ||
      fn === "run_command" ||
      fn === "bash" ||
      fn === "exec" ||
      fn === "terminal"
    ) {
      const command =
        (args.command as string) ||
        (args.CommandLine as string) ||
        (result.command as string) ||
        "";
      if (command) {
        items.push({
          id: event.id || `shell-${items.length}`,
          category: "terminal",
          title: command.trim(),
          timestamp: formatTime(event.createdAt),
          details:
            (result.stdout as string) ||
            (result.output as string) ||
            (event.extracted?.kind === "shell"
              ? event.extracted.output
              : undefined),
        });
        continue;
      }
    }

    // 2. File reads
    if (fn === "read_file" || fn === "view_file" || fn === "client_view_file") {
      const path =
        (args.path as string) ||
        (args.absolute_path as string) ||
        (args.target_file as string) ||
        "";
      if (path) {
        items.push({
          id: event.id || `read-${items.length}`,
          category: "read",
          title: `Read ${path}`,
          path,
          timestamp: formatTime(event.createdAt),
        });
        continue;
      }
    }

    // 3. File edits / writes
    if (
      fn === "edit_file" ||
      fn === "client_edit_file" ||
      fn === "client_create_file" ||
      fn === "write_file" ||
      fn === "delete_file"
    ) {
      const path =
        (args.path as string) ||
        (args.target_file as string) ||
        (args.targetFile as string) ||
        "";
      if (path) {
        items.push({
          id: event.id || `edit-${items.length}`,
          category: "edit",
          title: path,
          path,
          timestamp: formatTime(event.createdAt),
        });
        continue;
      }
    }
  }

  // If no detailed events were found, fallback to resource interactions
  if (items.length === 0 && interactions && interactions.length > 0) {
    for (const [idx, inter] of interactions.entries()) {
      if (inter.action === "read") {
        items.push({
          id: `inter-read-${idx}`,
          category: "read",
          title: `Read ${inter.path}`,
          path: inter.path,
          timestamp: formatTime(inter.lastOccurredAt),
        });
      } else if (inter.action === "write" || inter.action === "create") {
        items.push({
          id: `inter-edit-${idx}`,
          category: "edit",
          title: inter.path,
          path: inter.path,
          timestamp: formatTime(inter.lastOccurredAt),
        });
      }
    }
  }

  return items;
}
