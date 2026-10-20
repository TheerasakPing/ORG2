// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { installWindowDragFallback } from "./windowDrag";

const windowApi = vi.hoisted(() => ({
  startWindowDrag: vi.fn(() => Promise.resolve()),
}));

vi.mock("@src/hooks/logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));
vi.mock("@src/util/platform/ipcRenderer", () => windowApi);
vi.mock("@src/util/platform/tauri", () => ({
  isTauriDesktop: () => true,
  isWindows: () => false,
}));

describe("installWindowDragFallback", () => {
  let dispose: () => void = () => undefined;

  afterEach(() => {
    dispose();
    document.body.replaceChildren();
    windowApi.startWindowDrag.mockClear();
  });

  it("starts dragging from non-interactive descendants of declared regions", () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <div data-tauri-drag-region>
        <span id="drag">Drag</span>
        <button id="button">Action</button>
        <div data-tauri-drag-region="false"><span id="no-drag">No drag</span></div>
        <div style="-webkit-app-region: no-drag"><span id="styled-no-drag">No drag</span></div>
        <div data-tauri-drag-region="false"><div data-tauri-drag-region><span id="nested-no-drag">No drag</span></div></div>
        <div style="-webkit-app-region: no-drag"><div data-tauri-drag-region><span id="nested-styled-no-drag">No drag</span></div></div>
        <span id="direct" data-tauri-drag-region>Direct region</span>
      </div>
      <span id="outside">Outside</span>
    `;
    document.body.append(host);
    dispose = installWindowDragFallback(document);

    const dispatch = (id: string) => {
      const event = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        detail: 1,
      });
      const element = document.getElementById(id);
      if (!element) throw new Error(`Missing fixture element: ${id}`);
      element.dispatchEvent(event);
      return event;
    };

    expect(dispatch("drag").defaultPrevented).toBe(true);
    expect(dispatch("button").defaultPrevented).toBe(false);
    expect(dispatch("no-drag").defaultPrevented).toBe(false);
    expect(dispatch("styled-no-drag").defaultPrevented).toBe(false);
    expect(dispatch("nested-no-drag").defaultPrevented).toBe(false);
    expect(dispatch("nested-styled-no-drag").defaultPrevented).toBe(false);
    expect(dispatch("direct").defaultPrevented).toBe(false);
    expect(dispatch("outside").defaultPrevented).toBe(false);
    expect(windowApi.startWindowDrag).toHaveBeenCalledOnce();

    dispose();
    host.remove();
  });

  it("ignores right clicks and double clicks and stops handling events after disposal", () => {
    document.body.innerHTML =
      '<div data-tauri-drag-region><span id="drag">Drag</span></div>';
    const element = document.getElementById("drag");
    if (!element) throw new Error("Missing fixture element: drag");
    dispose = installWindowDragFallback(document);

    const dispatch = (button: number, detail: number) => {
      const event = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button,
        detail,
      });
      element.dispatchEvent(event);
      return event;
    };

    expect(dispatch(2, 1).defaultPrevented).toBe(false);
    expect(dispatch(0, 2).defaultPrevented).toBe(false);
    expect(windowApi.startWindowDrag).not.toHaveBeenCalled();
    expect(dispatch(0, 1).defaultPrevented).toBe(true);
    expect(windowApi.startWindowDrag).toHaveBeenCalledOnce();

    dispose();

    expect(dispatch(0, 1).defaultPrevented).toBe(false);
    expect(windowApi.startWindowDrag).toHaveBeenCalledOnce();
  });
});
