import { Component, createEvents } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import {
  uiCancelRequest,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
  lorebookContentGenerationRequested,
  lorebookKeysGenerationRequested,
} from "../../../core/store";
import { IDS } from "../../framework/ids";
import {
  NAI_WARNING,
  NAI_HEADER,
  NAI_DARK_BACKGROUND,
  NAI_PARAGRAPH,
} from "../../colors";

/**
 * Lorebook-specific generation button that derives requestId from selected entry.
 * This is a thin wrapper that handles the dynamic requestId resolution that the
 * unified GenerationButton cannot do (since it needs access to full state in selector).
 */

export interface LorebookGenerationButtonProps {
  id: string;
  type: "content" | "keys";
  label: string;
}

const { button, row } = api.v1.ui.part;

const getButtonStyles = () => {
  const base = {
    width: "100%",
    "font-weight": "bold",
  };
  return {
    gen: { ...base },
    disabled: {
      ...base,
      opacity: "0.5",
      cursor: "not-allowed",
    },
    queue: {
      ...base,
      "background-color": NAI_DARK_BACKGROUND,
      color: NAI_PARAGRAPH,
      cursor: "pointer",
    },
    cancel: {
      ...base,
      background: NAI_WARNING,
      color: NAI_DARK_BACKGROUND,
    },
    continue: {
      ...base,
      background: NAI_HEADER,
      color: NAI_DARK_BACKGROUND,
    },
    wait: {
      ...base,
      "background-color": NAI_DARK_BACKGROUND,
      color: NAI_PARAGRAPH,
    },
  };
};

type ButtonMode = "gen" | "queue" | "cancel" | "continue" | "wait" | "disabled";

const events = createEvents<
  LorebookGenerationButtonProps,
  {
    generate(): void;
    cancel(): void;
    cancelActive(): void;
    continue(): void;
  }
>();

export const LorebookGenerationButton: Component<
  LorebookGenerationButtonProps,
  RootState
> = {
  id: (props) => props.id,
  events,

  describe(props) {
    const { id, label } = props;
    const styles = getButtonStyles();

    const btnGenerate = button({
      id: `${id}-gen`,
      text: `⚡ ${label}`,
      style: styles.gen,
      callback: () => events.generate(props),
    });

    const btnQueued = button({
      id: `${id}-queue`,
      text: label ? `⏳ Queued` : "⏳",
      style: { ...styles.queue, display: "none" },
      callback: () => events.cancel(props),
    });

    const btnCancel = button({
      id: `${id}-cancel`,
      text: label ? `🚫 Cancel` : "🚫",
      style: { ...styles.cancel, display: "none" },
      callback: () => events.cancelActive(props),
    });

    const btnContinue = button({
      id: `${id}-continue`,
      text: label ? `⚠️ Continue` : "⚠️",
      style: { ...styles.continue, display: "none" },
      callback: () => events.continue(props),
    });

    const btnWait = button({
      id: `${id}-wait`,
      text: label ? `⏳ Wait` : "⏳",
      style: { ...styles.wait, display: "none" },
      callback: () => events.cancelActive(props),
    });

    return row({
      id,
      style: { gap: "4px", alignItems: "center" },
      content: [btnGenerate, btnQueued, btnCancel, btnContinue, btnWait],
    });
  },

  onMount(props, { dispatch, useSelector }) {
    const { id, type, label } = props;
    const styles = getButtonStyles();
    let timerId: any = null;
    let isTimerActive = false;

    // Attach Handlers - these don't do anything directly,
    // actual dispatch happens in selector callback with derived requestId
    events.attach({
      generate() {},
      cancel() {},
      cancelActive() {
        dispatch(uiRequestCancellation());
      },
      continue() {
        dispatch(uiUserPresenceConfirmed());
      },
    });

    const updateTimer = (endTime: number) => {
      if (!isTimerActive) return;

      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));

      api.v1.ui.updateParts([
        {
          id: `${id}-wait`,
          text: label ? `⏳ Wait (${remaining}s)` : `⏳ (${remaining}s)`,
        },
      ]);

      if (remaining > 0) {
        api.v1.timers
          .setTimeout(() => updateTimer(endTime), 1000)
          .then((tid: any) => {
            if (isTimerActive) {
              timerId = tid;
            } else {
              api.v1.timers.clearTimeout(tid);
            }
          });
      }
    };

    // Subscribe to BOTH selectedEntryId AND runtime state
    useSelector(
      (state) => ({
        selectedEntryId: state.ui.lorebook.selectedEntryId,
        activeRequestId: state.runtime.activeRequest?.id,
        queueIds: state.runtime.queue.map((q) => q.id),
        genxStatus: state.runtime.genx.status,
        budgetWaitEndTime: state.runtime.genx.budgetWaitEndTime,
      }),
      (slice) => {
        const {
          selectedEntryId,
          activeRequestId,
          queueIds,
          genxStatus,
          budgetWaitEndTime,
        } = slice;

        // If no entry selected, show disabled state
        if (!selectedEntryId) {
          api.v1.ui.updateParts([
            {
              id: `${id}-gen`,
              style: { ...styles.disabled, display: "block" },
            },
            { id: `${id}-queue`, style: { display: "none" } },
            { id: `${id}-cancel`, style: { display: "none" } },
            { id: `${id}-continue`, style: { display: "none" } },
            { id: `${id}-wait`, style: { display: "none" } },
          ]);
          return;
        }

        // Derive requestId dynamically from current selectedEntryId
        const entryIds = IDS.LOREBOOK.entry(selectedEntryId);
        const requestId =
          type === "content" ? entryIds.CONTENT_REQ : entryIds.KEYS_REQ;

        let mode: ButtonMode = "gen";
        let taskStatus: "queued" | "processing" | "not_found" = "not_found";

        // Determine Task Status based on derived requestId
        if (activeRequestId === requestId) {
          taskStatus = "processing";
        } else if (queueIds.includes(requestId)) {
          taskStatus = "queued";
        }

        // Determine Button Mode based on Task Status & GenX Status
        if (taskStatus === "queued") {
          mode = "queue";
        } else if (taskStatus === "processing") {
          if (genxStatus === "waiting_for_user") {
            mode = "continue";
          } else if (genxStatus === "waiting_for_budget") {
            mode = "wait";
          } else {
            mode = "cancel";
          }
        } else {
          mode = "gen";
        }

        // Create callbacks that use the current requestId
        const generateCallback = () => {
          if (type === "content") {
            dispatch(lorebookContentGenerationRequested({ requestId }));
          } else {
            dispatch(lorebookKeysGenerationRequested({ requestId }));
          }
        };

        const cancelCallback = () => {
          dispatch(uiCancelRequest({ requestId }));
        };

        const cancelActiveCallback = () => {
          dispatch(uiRequestCancellation());
        };

        const continueCallback = () => {
          dispatch(uiUserPresenceConfirmed());
        };

        api.v1.ui.updateParts([
          {
            id: `${id}-gen`,
            style: {
              ...styles.gen,
              display: mode === "gen" ? "block" : "none",
            },
            callback: generateCallback,
          },
          {
            id: `${id}-queue`,
            style: {
              ...styles.queue,
              display: mode === "queue" ? "block" : "none",
            },
            callback: cancelCallback,
          },
          {
            id: `${id}-cancel`,
            style: {
              ...styles.cancel,
              display: mode === "cancel" ? "block" : "none",
            },
            callback: cancelActiveCallback,
          },
          {
            id: `${id}-continue`,
            style: {
              ...styles.continue,
              display: mode === "continue" ? "block" : "none",
            },
            callback: continueCallback,
          },
          {
            id: `${id}-wait`,
            style: {
              ...styles.wait,
              display: mode === "wait" ? "block" : "none",
            },
            callback: cancelActiveCallback,
          },
        ]);

        if (mode === "wait") {
          if (!isTimerActive) {
            isTimerActive = true;
            updateTimer(budgetWaitEndTime || Date.now() + 60000);
          }
        } else {
          isTimerActive = false;
          if (timerId) {
            api.v1.timers.clearTimeout(timerId);
            timerId = null;
          }
        }
      },
    );
  },
};
