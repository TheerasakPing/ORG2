import { describe, expect, it } from "vitest";

import type { SessionEvent } from "@src/engines/SessionCore/core/types";

import { extractActionFeedItems } from "../actionFeedHelpers";

describe("extractActionFeedItems", () => {
  it("extracts terminal, read, and edit items with correct timestamps", () => {
    const events: SessionEvent[] = [
      {
        id: "ev-1",
        sessionId: "s1",
        actionType: "tool_call",
        functionName: "run_shell",
        args: { command: "git status" },
        createdAt: "2026-10-18T12:40:00Z",
      } as unknown as SessionEvent,
      {
        id: "ev-2",
        sessionId: "s1",
        actionType: "tool_call",
        functionName: "read_file",
        args: { path: "docs/spec.md" },
        createdAt: "2026-10-18T12:41:00Z",
      } as unknown as SessionEvent,
      {
        id: "ev-3",
        sessionId: "s1",
        actionType: "tool_call",
        functionName: "edit_file",
        args: { path: "src/main.tsx" },
        createdAt: "2026-10-18T12:42:00Z",
      } as unknown as SessionEvent,
    ];

    const items = extractActionFeedItems(events);
    expect(items).toHaveLength(3);

    expect(items[0].category).toBe("terminal");
    expect(items[0].title).toBe("git status");

    expect(items[1].category).toBe("read");
    expect(items[1].title).toBe("Read docs/spec.md");

    expect(items[2].category).toBe("edit");
    expect(items[2].title).toBe("src/main.tsx");
  });
});
