// The one file allowed to call api.v1.ui.updateParts.
//
// It holds no decisions: derive() decides, patch() diffs, this pushes. Two wake
// sources feed one tick — a store subscription (subscribeSelector on
// storeSignature does the change detection) and a self-rescheduling timer.
// Only timer ticks re-arm the timer, so a burst of dispatches cannot stack
// parallel chains.
//
// No module-level state: everything lives in the closure so the driver is
// injected from mount.ts rather than being a singleton.

import type { Store } from "nai-store";
import {
  uiRequestCancellation,
  uiUserPresenceConfirmed,
  importWizardOpened,
  bootstrapRequested,
  bootstrapContinueRequested,
  type RootState,
} from "../../core/store";
import { derive, storeSignature, type HeaderModel } from "./header-model";
import { patch, type HeaderHandlers } from "./header-parts";

/** 1s while counting down so the label ticks; 5s otherwise, which is only
 *  there to notice the output bucket silently refilling. */
const TICK_WAIT_MS = 1000;
const TICK_IDLE_MS = 5000;

export type HeaderDriverOptions = {
  /** Result of `(await api.v1.document.sectionIds()).length > 0`, read before
   *  the header is built so `initialModel()` is correct on first paint and
   *  no post-register updateParts correction is needed. */
  hasDocumentContent: boolean;
};

export type HeaderDriver = {
  /** Model for the first paint. Call before buildHeader so the initial specs
   *  are already correct and no updateParts is needed on mount. */
  initialModel(): HeaderModel;
  handlers: HeaderHandlers;
  start(): void;
  stop(): void;
};

export function createHeaderDriver(
  store: Store<RootState>,
  options: HeaderDriverOptions,
): HeaderDriver {
  let lastModel: HeaderModel | null = null;
  let hasDocumentContent = options.hasDocumentContent;
  let bootstrapWasPending = false;
  let timerId: number | null = null;
  let stopped = false;
  let docSeq = 0;
  const unsubscribes: Array<() => void> = [];

  function currentModel(): HeaderModel {
    return derive(store.getState(), {
      allowedOutput: api.v1.script.getAllowedOutput(),
      hasDocumentContent,
      now: Date.now(),
    });
  }

  function push(model: HeaderModel): void {
    const parts = patch(lastModel, model);
    lastModel = model;
    if (parts.length > 0) {
      void api.v1.ui.updateParts(parts);
    }
  }

  async function refreshDocument(): Promise<void> {
    const seq = ++docSeq;
    const ids = await api.v1.document.sectionIds();
    const has = ids.length > 0;
    // seq !== docSeq means a newer refreshDocument() call started while this
    // one was in flight; an older read resolving later must not clobber it.
    if (stopped || seq !== docSeq || has === hasDocumentContent) return;
    hasDocumentContent = has;
    push(currentModel());
  }

  function tick(): void {
    if (stopped) return;
    const model = currentModel();
    // A bootstrap that just settled changed the document — re-derive its label.
    if (bootstrapWasPending && !model.bootstrap.disabled)
      void refreshDocument();
    bootstrapWasPending = model.bootstrap.disabled;
    push(model);
  }

  function scheduleTimer(): void {
    if (stopped) return;
    const delay =
      lastModel?.widget.mode === "wait" ? TICK_WAIT_MS : TICK_IDLE_MS;
    void api.v1.timers
      .setTimeout(() => {
        if (stopped) return;
        tick();
        scheduleTimer();
      }, delay)
      .then((id: number) => {
        // The creation promise can resolve after stop(); clear it if so.
        if (stopped) void api.v1.timers.clearTimeout(id);
        else timerId = id;
      });
  }

  const handlers: HeaderHandlers = {
    onWidget: () => {
      // The click itself is what clears the harness's FlagB. In budget mode
      // that is the whole effect and there is deliberately nothing else to do.
      const mode = currentModel().widget.mode;
      if (mode === "continue") store.dispatch(uiUserPresenceConfirmed());
      else if (mode === "cancel" || mode === "wait")
        // Already calls genX.cancelAll() and marks the active request
        // cancelled, so this one dispatch is the whole global cancel.
        store.dispatch(uiRequestCancellation());
    },
    onImport: () => store.dispatch(importWizardOpened()),
    onBootstrap: () =>
      store.dispatch(
        hasDocumentContent
          ? bootstrapContinueRequested()
          : bootstrapRequested(),
      ),
  };

  return {
    initialModel: () => {
      const model = currentModel();
      lastModel = model;
      bootstrapWasPending = model.bootstrap.disabled;
      return model;
    },
    handlers,
    start: () => {
      unsubscribes.push(store.subscribeSelector(storeSignature, () => tick()));
      unsubscribes.push(
        store.subscribeSelector(
          (s) => s.runtime.historyEpoch,
          () => void refreshDocument(),
        ),
      );
      scheduleTimer();
    },
    stop: () => {
      stopped = true;
      unsubscribes.forEach((u) => u());
      unsubscribes.length = 0;
      if (timerId !== null) {
        void api.v1.timers.clearTimeout(timerId);
        timerId = null;
      }
    },
  };
}
