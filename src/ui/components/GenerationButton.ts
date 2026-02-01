import { Component, createEvents } from "../../../lib/nai-act";
import { RootState } from "../../core/store/types";
import {
  uiCancelRequest,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
} from "../../core/store";
import {
  NAI_WARNING,
  NAI_HEADER,
  NAI_DARK_BACKGROUND,
  NAI_PARAGRAPH,
} from "../colors";

/**
 * Unified generation button component that handles:
 * - Field generation (Story Prompt, ATTG, Style, DULFS lists)
 * - Lorebook content/keys generation
 * - DULFS list item generation (icon variant)
 */

export type GenerationButtonVariant = "button" | "icon";

export interface GenerationButtonProps {
  id: string;
  /** Variant: 'button' for full button, 'icon' for compact icon-only */
  variant?: GenerationButtonVariant;
  /** Static request ID (for field buttons) or undefined for dynamic resolution */
  requestId?: string;
  /** Function to resolve requestId from state (for lorebook buttons) */
  requestIdResolver?: (state: RootState) => string | undefined;
  /** Action to dispatch on generate (for field buttons) */
  generateAction?: any;
  /** Callback to run on generate (for lorebook/custom buttons) */
  onGenerate?: () => void;
  /** Label text (only shown for 'button' variant) */
  label?: string;
  /** Custom styles */
  style?: Record<string, string>;
  /** Callback for cancel action */
  onCancel?: () => void;
  /** Callback for continue action */
  onContinue?: () => void;
  /** For icon variant: whether the target has content (affects idle style) */
  hasContent?: boolean;
  /** For icon variant: icon ID to show in idle state */
  iconId?: string;
}

const { button, row } = api.v1.ui.part;

// Button variant styles
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

// Icon variant styles
const getIconStyles = () => ({
  idle: {
    width: "24px",
    padding: "4px",
    opacity: "0.3",
    cursor: "pointer",
  },
  idleWithContent: {
    width: "24px",
    padding: "4px",
    opacity: "1",
    cursor: "pointer",
    color: "rgb(144, 238, 144)", // Light green
  },
  queued: {
    width: "24px",
    padding: "4px",
    opacity: "1",
    cursor: "pointer",
    color: NAI_HEADER,
  },
  cancel: {
    width: "24px",
    padding: "4px",
    opacity: "1",
    cursor: "pointer",
    color: NAI_WARNING,
  },
  continue: {
    width: "24px",
    padding: "4px",
    opacity: "1",
    cursor: "pointer",
    color: NAI_HEADER,
    animation: "pulse 1s infinite",
  },
  wait: {
    width: "24px",
    padding: "4px",
    opacity: "0.6",
    cursor: "pointer",
    color: NAI_HEADER,
  },
});

type ButtonMode = "gen" | "queue" | "cancel" | "continue" | "wait" | "disabled";

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
    const {
      id,
      variant = "button",
      label = "",
      style = {},
      iconId = "book",
    } = props;

    if (variant === "icon") {
      // Icon variant - single button that changes appearance
      return button({
        id,
        iconId: iconId as IconId,
        style: { ...getIconStyles().idle, ...style },
        callback: () => events.generate(props),
      });
    }

    // Button variant - row with multiple button states
    const styles = getButtonStyles();

    const btnGenerate = button({
      id: `${id}-gen`,
      text: `⚡ ${label}`,
      style: { ...styles.gen, ...style },
      callback: () => events.generate(props),
    });

    const btnQueued = button({
      id: `${id}-queue`,
      text: label ? `⏳ Queued` : "⏳",
      style: { ...styles.queue, display: "none", ...style },
      callback: () => events.cancel(props),
    });

    const btnCancel = button({
      id: `${id}-cancel`,
      text: label ? `🚫 Cancel` : "🚫",
      style: { ...styles.cancel, display: "none", ...style },
      callback: () => events.cancelActive(props),
    });

    const btnContinue = button({
      id: `${id}-continue`,
      text: label ? `⚠️ Continue` : "⚠️",
      style: { ...styles.continue, display: "none", ...style },
      callback: () => events.continue(props),
    });

    const btnWait = button({
      id: `${id}-wait`,
      text: label ? `⏳ Wait` : "⏳",
      style: { ...styles.wait, display: "none", ...style },
      callback: () => events.cancelActive(props),
    });

    return row({
      id,
      style: { gap: "4px", alignItems: "center", ...style },
      content: [btnGenerate, btnQueued, btnCancel, btnContinue, btnWait],
    });
  },

  onMount(props, { dispatch, useSelector }) {
    const { id, variant = "button", label = "", iconId = "book" } = props;
    const buttonStyles = getButtonStyles();
    const iconStyles = getIconStyles();
    let timerId: any = null;
    let isTimerActive = false;

    // Attach Handlers
    events.attach({
      generate(p) {
        if (p.generateAction) {
          dispatch(p.generateAction);
        }
        if (p.onGenerate) {
          p.onGenerate();
        }
      },
      cancel(p) {
        // Resolve requestId for cancellation
        const requestId = p.requestId;
        if (requestId) {
          dispatch(uiCancelRequest({ requestId }));
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

      if (variant === "icon") {
        api.v1.ui.updateParts([
          {
            id,
            text: `${remaining}`,
            iconId: undefined,
            style: iconStyles.wait,
            callback: () => events.cancelActive(props),
          },
        ]);
      } else {
        api.v1.ui.updateParts([
          {
            id: `${id}-wait`,
            text: label ? `⏳ Wait (${remaining}s)` : `⏳ (${remaining}s)`,
          },
        ]);
      }

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

        // Resolve requestId - either static from props or dynamic from resolver
        let requestId = props.requestId;
        // For dynamic resolution, we'd need to call requestIdResolver
        // but that requires access to full state which we don't have here
        // This will be handled by the caller updating props.requestId dynamically

        let mode: ButtonMode = "gen";
        let taskStatus: "queued" | "processing" | "not_found" = "not_found";

        // Determine Task Status
        if (requestId) {
          if (activeRequestId === requestId) {
            taskStatus = "processing";
          } else if (queueIds.includes(requestId)) {
            taskStatus = "queued";
          }
        } else {
          // Global Button Fallback (no specific requestId)
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
            mode = "cancel";
          }
        } else {
          mode = "gen";
        }

        // Update UI based on variant
        if (variant === "icon") {
          updateIconVariant(mode, budgetWaitEndTime);
        } else {
          updateButtonVariant(mode, budgetWaitEndTime);
        }
      },
    );

    function updateIconVariant(mode: ButtonMode, budgetWaitEndTime?: number) {
      let style = iconStyles.idle;
      let icon = iconId;
      let callback = () => events.generate(props);

      switch (mode) {
        case "gen":
          style = props.hasContent
            ? iconStyles.idleWithContent
            : iconStyles.idle;
          icon = iconId;
          callback = () => events.generate(props);
          break;
        case "queue":
          style = iconStyles.queued;
          icon = "clock";
          callback = () => events.cancel(props);
          break;
        case "cancel":
          style = iconStyles.cancel;
          icon = "x";
          callback = () => events.cancelActive(props);
          break;
        case "continue":
          style = iconStyles.continue;
          icon = "alert-triangle";
          callback = () => events.continue(props);
          break;
        case "wait":
          style = iconStyles.wait;
          callback = () => events.cancelActive(props);
          break;
      }

      // Don't update for wait mode - timer will handle it
      if (mode !== "wait") {
        api.v1.ui.updateParts([
          {
            id,
            iconId: icon,
            text: undefined,
            style,
            callback,
          },
        ]);
      }

      // Handle timer for wait state
      if (mode === "wait") {
        if (!isTimerActive) {
          isTimerActive = true;
          const endTime = budgetWaitEndTime || Date.now() + 60000;
          const initialRemaining = Math.max(
            0,
            Math.ceil((endTime - Date.now()) / 1000),
          );
          api.v1.ui.updateParts([
            {
              id,
              text: `${initialRemaining}`,
              iconId: undefined,
              style: iconStyles.wait,
              callback: () => events.cancelActive(props),
            },
          ]);
          updateTimer(endTime);
        }
      } else {
        isTimerActive = false;
        if (timerId) {
          api.v1.timers.clearTimeout(timerId);
          timerId = null;
        }
      }
    }

    function updateButtonVariant(mode: ButtonMode, budgetWaitEndTime?: number) {
      api.v1.ui.updateParts([
        {
          id: `${id}-gen`,
          style: {
            ...buttonStyles.gen,
            display: mode === "gen" ? "block" : "none",
          },
        },
        {
          id: `${id}-queue`,
          style: {
            ...buttonStyles.queue,
            display: mode === "queue" ? "block" : "none",
          },
        },
        {
          id: `${id}-cancel`,
          style: {
            ...buttonStyles.cancel,
            display: mode === "cancel" ? "block" : "none",
          },
        },
        {
          id: `${id}-continue`,
          style: {
            ...buttonStyles.continue,
            display: mode === "continue" ? "block" : "none",
          },
        },
        {
          id: `${id}-wait`,
          style: {
            ...buttonStyles.wait,
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
    }
  },
};
