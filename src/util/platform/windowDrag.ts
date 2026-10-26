import { createLogger } from "@src/hooks/logger";
import { startWindowDrag } from "@src/util/platform/ipcRenderer";
import { isTauriDesktop, isWindows } from "@src/util/platform/tauri";

const INTERACTIVE_SELECTOR =
  'button,a,input,select,textarea,[role="button"],[role="menuitem"],[role="tab"],[contenteditable="true"]';

/** Start dragging only for descendants of a declared drag region. */
export function shouldFallbackToWindowDrag(target: Element | null): boolean {
  if (
    !target ||
    target.hasAttribute("data-tauri-drag-region") ||
    target.closest(INTERACTIVE_SELECTOR)
  ) {
    return false;
  }

  let current: Element | null = target;
  let isDragRegionDescendant = false;
  while (current) {
    if (
      current.getAttribute("data-tauri-drag-region") === "false" ||
      /-?webkit-app-region\s*:\s*no-drag/i.test(
        current.getAttribute("style") ?? ""
      )
    ) {
      return false;
    }

    if (current !== target && current.hasAttribute("data-tauri-drag-region")) {
      isDragRegionDescendant = true;
    }
    current = current.parentElement;
  }

  return isDragRegionDescendant;
}

/** Bridge Tauri's exact-target drag regions to their otherwise inert children. */
export function installWindowDragFallback(target: Document): () => void {
  if (!isTauriDesktop() || isWindows()) return () => undefined;

  const log = createLogger("WindowDragFallback");
  const handleMouseDown = (event: MouseEvent) => {
    const eventTarget = event.target instanceof Element ? event.target : null;
    if (
      event.button !== 0 ||
      event.detail > 1 ||
      !shouldFallbackToWindowDrag(eventTarget)
    ) {
      return;
    }

    event.preventDefault();
    void startWindowDrag().catch((error) =>
      log.error("Window chrome action failed", error)
    );
  };

  target.addEventListener("mousedown", handleMouseDown, true);
  return () => target.removeEventListener("mousedown", handleMouseDown, true);
}
