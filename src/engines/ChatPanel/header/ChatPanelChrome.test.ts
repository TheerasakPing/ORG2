// @vitest-environment jsdom
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatPanelChrome } from "./ChatPanelChrome";

const windowApi = vi.hoisted(() => ({
  startWindowDrag: vi.fn(() => Promise.resolve()),
  maxWindow: vi.fn(() => Promise.resolve()),
  closeWindow: vi.fn(() => Promise.resolve()),
  minWindow: vi.fn(() => Promise.resolve()),
}));

vi.mock("@src/util/platform/ipcRenderer", () => windowApi);

vi.mock("@src/scaffold/AppLayout/usePaneLayoutInsetTransition", () => ({
  usePaneLayoutInsetTransition: () => "",
}));

vi.mock("@src/hooks/ui/sidebar/useCollapsedSidebarChromeOffset", () => ({
  useCollapsedSidebarChromeOffset: () => 0,
}));

vi.mock("@src/util/platform/tauri", () => ({
  isWindows: () => false,
}));

describe("ChatPanelChrome", () => {
  afterEach(() => {
    windowApi.startWindowDrag.mockClear();
    windowApi.maxWindow.mockClear();
  });

  it.each([false, true])(
    "leaves direct drag-region double-clicks to Tauri when collapsed is %s",
    (tabRowCollapsed) => {
      const host = document.createElement("div");
      const root = createRoot(host);

      act(() => {
        root.render(
          React.createElement(ChatPanelChrome, {
            tabStrip: "Session",
            tabRowCollapsed,
          })
        );
      });

      const header = host.querySelector(
        tabRowCollapsed
          ? '[data-testid="chat-panel-collapsed-header"]'
          : '[data-testid="chat-panel-header"]'
      );
      expect(header?.hasAttribute("data-tauri-drag-region")).toBe(true);

      act(() => {
        for (const type of ["mousedown", "mouseup"]) {
          header?.dispatchEvent(
            new MouseEvent(type, { bubbles: true, button: 0, detail: 2 })
          );
        }
      });

      expect(windowApi.maxWindow).not.toHaveBeenCalled();
      act(() => root.unmount());
    }
  );

  it("maximizes the native window on a non-interactive header double-click", () => {
    const host = document.createElement("div");
    const root = createRoot(host);

    act(() => {
      root.render(
        React.createElement(ChatPanelChrome, {
          tabStrip: null,
          centerContent: React.createElement(
            "span",
            { "data-testid": "label" },
            "Session"
          ),
          tabRowCollapsed: true,
        })
      );
    });

    act(() => {
      host
        .querySelector('[data-testid="label"]')
        ?.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, button: 0, detail: 2 })
        );
    });

    expect(windowApi.maxWindow).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("maximizes the native window on an expanded header double-click", () => {
    const host = document.createElement("div");
    const root = createRoot(host);

    act(() => {
      root.render(
        React.createElement(ChatPanelChrome, {
          tabStrip: React.createElement(
            "span",
            { "data-testid": "tab-label" },
            "Session"
          ),
        })
      );
    });

    act(() => {
      host
        .querySelector('[data-testid="tab-label"]')
        ?.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, button: 0, detail: 2 })
        );
    });

    expect(windowApi.maxWindow).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("shares the desktop tab row and published header frame", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ChatPanelChrome, {
        tabStrip: React.createElement("span", null, "Session tab"),
        toolbar: React.createElement("button", null, "Refresh"),
        publishedHeaderSlots: {
          content: React.createElement("span", null, "SDE Agent"),
          trailing: React.createElement("span", null, "Read only"),
        },
      })
    );

    expect(markup).toContain('data-testid="chat-panel-header-surface"');
    expect(markup).toContain('data-testid="chat-panel-header"');
    expect(markup).toContain('data-testid="chat-panel-published-header"');
    expect(markup).toContain("workspace-header header-tab-group");
    expect(markup).toContain("Session tab");
    expect(markup).toContain("SDE Agent");
    expect(markup).toContain("Read only");
  });

  it("does not reserve a published-header row when no slots are supplied", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ChatPanelChrome, {
        tabStrip: React.createElement("span", null, "Only tab row"),
      })
    );

    expect(markup).not.toContain('data-testid="chat-panel-published-header"');
    expect(markup).toContain("height:44px");
  });
  it("preserves the desktop pinned-control reservation in the shared frame", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ChatPanelChrome, {
        tabStrip: "Tabs",
        trailingInsetPx: 96,
        tabRowCollapsed: true,
        publishedHeaderSlots: { content: "Session" },
      })
    );
    expect(markup).toContain("padding-right:96px");
    expect(markup).toContain('data-testid="chat-panel-collapsed-header"');
  });
});
