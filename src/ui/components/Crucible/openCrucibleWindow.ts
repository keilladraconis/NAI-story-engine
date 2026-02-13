import { StoreLike, mount } from "nai-act";
import { matchesAction } from "nai-store";
import { RootState } from "../../../core/store/types";
import { windowToggled } from "../../../core/store/slices/crucible";
import { CrucibleWindow } from "./CrucibleWindow";

export function registerCrucibleWindow(store: StoreLike<RootState>): void {
  let windowHandle: {
    update: (options: Record<string, unknown>) => Promise<void>;
    close: () => Promise<void>;
    isClosed: () => boolean;
    closed: Promise<void>;
  } | null = null;
  let unmountContent: (() => void) | null = null;

  store.subscribeEffect(
    matchesAction(windowToggled),
    async (_action, { getState, dispatch }) => {
      const { windowOpen } = getState().crucible;

      if (windowOpen && !windowHandle) {
        // Mount fresh content
        const { part, unmount } = mount(CrucibleWindow, undefined, store);
        unmountContent = unmount;

        // Open window
        const handle = await api.v1.ui.window.open({
          id: "kse-crucible-window",
          title: "Crucible",
          defaultWidth: 500,
          defaultHeight: 600,
          minWidth: 380,
          minHeight: 400,
          resizable: true,
          content: [part],
        });
        windowHandle = handle;

        // Sync state when user closes via X button
        handle.closed.then(() => {
          windowHandle = null;
          if (unmountContent) {
            unmountContent();
            unmountContent = null;
          }
          // Only dispatch if state still shows open (user closed via X)
          if (getState().crucible.windowOpen) {
            dispatch(windowToggled());
          }
        });
      } else if (!windowOpen && windowHandle) {
        await windowHandle.close();
        windowHandle = null;
        if (unmountContent) {
          unmountContent();
          unmountContent = null;
        }
      }
    },
  );
}
