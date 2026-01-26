import { Component, createEvents } from "../../../lib/nai-act";
import { RootState } from "../../core/store/types";
import {
  uiCancelRequest,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
} from "../../core/store";
import { NAI_WARNING, NAI_HEADER, NAI_DARK_BACKGROUND, NAI_PARAGRAPH } from "../colors";

export interface GenerationButtonProps {
  id: string;
  requestId?: string;
  generateAction?: any;
  label: string;
  style?: any;
  onCancel?: () => void;
  onContinue?: () => void;
}

const { button, row } = api.v1.ui.part;

const getButtonStyles = () => {
  const base = {
    width: "100%",
    "font-weight": "bold",
  };
  return {
    gen: { ...base },
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

const events = createEvents<
  GenerationButtonProps,
  {
    generate(): void;
    cancel(): void;
    cancelActive(): void;
    continue(): void;
  }
>();

export const GenerationButton: Component<GenerationButtonProps, RootState> = {
  id: (props) => props.id,
  events,

  describe(props) {
    const { id, label, style = {} } = props;
    const styles = getButtonStyles();

    const btnGenerate = button({
      id: `${id}-gen`,
      text: `⚡ ${label}`,
      style: styles.gen,
      callback: () => events.generate(props),
    });

    const btnQueued = button({
      id: `${id}-queue`,
      text: `⏳ ${label} (Queued)`,
      style: { ...styles.queue, display: "none" },
      callback: () => events.cancel(props),
    });

    const btnCancel = button({
      id: `${id}-cancel`,
      text: `🚫 Cancel`,
      style: { ...styles.cancel, display: "none" },
      callback: () => events.cancelActive(props),
    });

    const btnContinue = button({
      id: `${id}-continue`,
      text: `⚠️ Continue`,
      style: { ...styles.continue, display: "none" },
      callback: () => events.continue(props),
    });

    const btnWait = button({
      id: `${id}-wait`,
      text: `⏳ Wait`,
      style: { ...styles.wait, display: "none" },
      callback: () => events.cancelActive(props),
    });

    return row({
      id,
      style: { gap: "4px", alignItems: "center", ...style },
      content: [btnGenerate, btnQueued, btnCancel, btnContinue, btnWait],
    });
  },

  onMount(props, { dispatch, useSelector }) {
    const { id, requestId } = props;
    const styles = getButtonStyles();
    let timerId: any = null;
    let isTimerActive = false;

    // Attach Handlers
    events.attach({
      generate(p) {
        if (p.generateAction) {
          dispatch(p.generateAction);
        }
      },
      cancel(p) {
        if (p.requestId) {
          dispatch(uiCancelRequest({ requestId: p.requestId }));
        } else if (p.onCancel) {
          p.onCancel();
        }
      },
      cancelActive(p) {
        if (p.onCancel) {
          p.onCancel();
        } else {
          dispatch(uiRequestCancellation());
        }
      },
      continue(p) {
        if (p.onContinue) {
          p.onContinue();
        } else {
          dispatch(uiUserPresenceConfirmed());
        }
      },
    });

    const updateTimer = (endTime: number) => {
      if (!isTimerActive) return;

      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));

      api.v1.ui.updateParts([
        {
          id: `${id}-wait`,
          text: `⏳ Wait (${remaining}s)`,
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

    // Reactive State
    useSelector(
      (state) => ({
        activeRequestId: state.runtime.activeRequest?.id,
        queueIds: state.runtime.queue.map((q) => q.id),
        genxStatus: state.runtime.genx.status,
        budgetWaitEndTime: state.runtime.genx.budgetWaitEndTime,
      }),
      (slice) => {
        const { activeRequestId, queueIds, genxStatus, budgetWaitEndTime } =
          slice;

        let mode: "gen" | "queue" | "cancel" | "continue" | "wait" = "gen";
        let taskStatus: "queued" | "processing" | "not_found" = "not_found";

        // Determine Task Status
        if (requestId) {
          if (activeRequestId === requestId) {
            taskStatus = "processing";
          } else if (queueIds.includes(requestId)) {
            taskStatus = "queued";
          }
        } else {
          // Global Button Fallback
          if (genxStatus !== "idle") {
            if (genxStatus === "queued") taskStatus = "queued";
            else taskStatus = "processing";
          }
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
            // generating or other processing states
            mode = "cancel";
          }
        } else {
          mode = "gen";
        }

        api.v1.ui.updateParts([
          {
            id: `${id}-gen`,
            style: { ...styles.gen, display: mode === "gen" ? "block" : "none" },
          },
          {
            id: `${id}-queue`,
            style: {
              ...styles.queue,
              display: mode === "queue" ? "block" : "none",
            },
          },
          {
            id: `${id}-cancel`,
            style: {
              ...styles.cancel,
              display: mode === "cancel" ? "block" : "none",
            },
          },
          {
            id: `${id}-continue`,
            style: {
              ...styles.continue,
              display: mode === "continue" ? "block" : "none",
            },
          },
          {
            id: `${id}-wait`,
            style: {
              ...styles.wait,
              display: mode === "wait" ? "block" : "none",
            },
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