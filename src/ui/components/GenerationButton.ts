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
  /** Multiple request IDs to track (for icon variant tracking content + keys) */
  requestIds?: string[];
  /** Custom state projection for dynamic requestId resolution */
  stateProjection?: (state: RootState) => any;
  /** Resolve requestId from projection result */
  requestIdFromProjection?: (projection: any) => string | undefined;
  /** Determine disabled state from projection result */
  isDisabledFromProjection?: (projection: any) => boolean;
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
  iconId?: IconId;
  /** For icon variant: async function to check if target has content */
  contentChecker?: () => Promise<boolean>;
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

type GenerationButtonEvents = {
  generate(): void;
  cancel(resolvedRequestId?: string): void;
  cancelActive(): void;
  continue(): void;
};

export const GenerationButton: Component<GenerationButtonProps, RootState> = {
  id: (props) => props.id,

  build(props, { dispatch, useSelector }) {
    const { id, variant = "button", label = "", style = {}, iconId } = props;
    const events = createEvents<GenerationButtonEvents>();
    const buttonStyles = getButtonStyles();
    const iconStyles = getIconStyles();
    let timerId: any = null;
    let isTimerActive = false;
    let hasContent = props.hasContent ?? false;
    let lastMode: ButtonMode | null = null;
    let currentResolvedRequestId: string | undefined = props.requestId;

    // Content checker for icon variant
    const checkContent = async () => {
      if (props.contentChecker) {
        try {
          hasContent = await props.contentChecker();
        } catch {
          hasContent = false;
        }
      }
    };

    // Initial content check
    if (variant === "icon" && props.contentChecker) {
      checkContent();
    }

    // Attach handlers - close over props and dispatch from build scope
    events.attach({
      generate() {
        if (props.generateAction) {
          dispatch(props.generateAction);
        }
        if (props.onGenerate) {
          props.onGenerate();
        }
      },
      cancel(resolvedRequestId) {
        // Cancel queued request(s)
        if (props.requestIds && props.requestIds.length > 0) {
          for (const reqId of props.requestIds) {
            dispatch(uiCancelRequest({ requestId: reqId }));
          }
        } else {
          const reqId = resolvedRequestId ?? props.requestId;
          if (reqId) {
            dispatch(uiCancelRequest({ requestId: reqId }));
          } else if (props.onCancel) {
            props.onCancel();
          }
        }
      },
      cancelActive() {
        // Cancel the active request
        if (props.onCancel) {
          props.onCancel();
        } else {
          dispatch(uiRequestCancellation());
        }
        // Also cancel any other queued requests from the same requestIds group
        if (props.requestIds && props.requestIds.length > 0) {
          for (const reqId of props.requestIds) {
            dispatch(uiCancelRequest({ requestId: reqId }));
          }
        }
      },
      continue() {
        if (props.onContinue) {
          props.onContinue();
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
            callback: () => events.cancelActive(),
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

    // Reactive State - include custom projection if provided
    useSelector(
      (state) => ({
        activeRequestId: state.runtime.activeRequest?.id,
        queueIds: state.runtime.queue.map((q) => q.id),
        genxStatus: state.runtime.genx.status,
        budgetWaitEndTime: state.runtime.genx.budgetWaitEndTime,
        customProjection: props.stateProjection?.(state),
      }),
      (slice) => {
        const {
          activeRequestId,
          queueIds,
          genxStatus,
          budgetWaitEndTime,
          customProjection,
        } = slice;

        // Resolve requestId - from projection, static prop, or requestIds array
        let resolvedRequestId: string | undefined;
        if (props.requestIdFromProjection && customProjection !== undefined) {
          resolvedRequestId = props.requestIdFromProjection(customProjection);
        } else {
          resolvedRequestId = props.requestId;
        }
        currentResolvedRequestId = resolvedRequestId;

        // Check disabled state from projection
        const isDisabled =
          props.isDisabledFromProjection?.(customProjection) ?? false;

        // Collect all requestIds to track (either explicit array or resolved single)
        const allRequestIds: string[] =
          props.requestIds ?? (resolvedRequestId ? [resolvedRequestId] : []);

        // When stateProjection is provided, the button opts into custom tracking
        // and should NOT fall back to global state even if projection returns nothing
        const hasCustomProjection = !!props.stateProjection;

        let mode: ButtonMode = "gen";
        let taskStatus: "queued" | "processing" | "not_found" = "not_found";

        // Handle disabled state
        if (isDisabled) {
          mode = "disabled";
        } else if (allRequestIds.length > 0) {
          // Check if ANY requestId is active/queued
          const isProcessing = allRequestIds.some(
            (reqId) => activeRequestId === reqId,
          );
          const isQueued = allRequestIds.some((reqId) =>
            queueIds.includes(reqId),
          );

          if (isProcessing) {
            taskStatus = "processing";
          } else if (isQueued) {
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
        } else if (!hasCustomProjection) {
          // Global Button Fallback - only for buttons WITHOUT custom projection
          // Buttons with stateProjection explicitly opt into tracking only their own requests
          if (genxStatus !== "idle") {
            if (genxStatus === "queued") taskStatus = "queued";
            else taskStatus = "processing";
          }

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
          }
        }

        // Update UI based on variant
        if (variant === "icon") {
          updateIconVariant(mode, budgetWaitEndTime);
        } else {
          updateButtonVariant(mode, budgetWaitEndTime);
        }

        lastMode = mode;
      },
    );

    function updateIconVariant(mode: ButtonMode, budgetWaitEndTime?: number) {
      let style = iconStyles.idle;
      let icon = iconId;
      // Use closures over mount props - events.X(props) passes mount props to handler
      let callback = () => events.generate();

      // For idle mode, re-check content state (async) and update accordingly
      if (mode === "gen" && props.contentChecker) {
        checkContent().then(() => {
          if (lastMode === "gen") {
            api.v1.ui.updateParts([
              {
                id,
                iconId,
                text: undefined,
                style: hasContent
                  ? iconStyles.idleWithContent
                  : iconStyles.idle,
                callback: () => events.generate(),
              },
            ]);
          }
        });
      }

      switch (mode) {
        case "gen":
          style = hasContent ? iconStyles.idleWithContent : iconStyles.idle;
          icon = iconId;
          callback = () => events.generate();
          break;
        case "queue":
          style = iconStyles.queued;
          icon = "clock";
          callback = () => events.cancel(currentResolvedRequestId);
          break;
        case "cancel":
          style = iconStyles.cancel;
          icon = "x";
          callback = () => events.cancelActive();
          break;
        case "continue":
          style = iconStyles.continue;
          icon = "fast-forward";
          callback = () => events.continue();
          break;
        case "wait":
          style = iconStyles.wait;
          callback = () => events.cancelActive();
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
              callback: () => events.cancelActive(),
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
      // For disabled mode, show gen button but with disabled style
      const showGen = mode === "gen" || mode === "disabled";
      const genStyle =
        mode === "disabled"
          ? { ...buttonStyles.disabled, display: "block" }
          : { ...buttonStyles.gen, display: showGen ? "block" : "none" };

      // Use closures over mount props - events.X(props) passes mount props to handler
      api.v1.ui.updateParts([
        {
          id: `${id}-gen`,
          style: genStyle,
          callback: () => events.generate(),
        },
        {
          id: `${id}-queue`,
          style: {
            ...buttonStyles.queue,
            display: mode === "queue" ? "block" : "none",
          },
          callback: () => events.cancel(currentResolvedRequestId),
        },
        {
          id: `${id}-cancel`,
          style: {
            ...buttonStyles.cancel,
            display: mode === "cancel" ? "block" : "none",
          },
          callback: () => events.cancelActive(),
        },
        {
          id: `${id}-continue`,
          style: {
            ...buttonStyles.continue,
            display: mode === "continue" ? "block" : "none",
          },
          callback: () => events.continue(),
        },
        {
          id: `${id}-wait`,
          style: {
            ...buttonStyles.wait,
            display: mode === "wait" ? "block" : "none",
          },
          callback: () => events.cancelActive(),
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

    // Build the UI tree
    if (variant === "icon") {
      // Icon variant - single button that changes appearance
      return button({
        id,
        iconId,
        style: iconStyles.idle,
        callback: () => events.generate(),
      });
    }

    // Button variant - row with multiple button states
    const styles = getButtonStyles();

    const btnGenerate = button({
      id: `${id}-gen`,
      iconId,
      text: `${iconId ? "" : "⚡"} ${label}`,
      style: { ...styles.gen, display: "block" },
      callback: () => events.generate(),
    });

    const btnQueued = button({
      id: `${id}-queue`,
      text: label ? `⏳ Queued` : "⏳",
      style: { ...styles.queue, display: "none" },
      callback: () => events.cancel(props.requestId),
    });

    const btnCancel = button({
      id: `${id}-cancel`,
      text: label ? `🚫 Cancel` : "🚫",
      style: { ...styles.cancel, display: "none" },
      callback: () => events.cancelActive(),
    });

    const btnContinue = button({
      id: `${id}-continue`,
      text: label ? `⚠️ Continue` : "⚠️",
      style: { ...styles.continue, display: "none" },
      callback: () => events.continue(),
    });

    const btnWait = button({
      id: `${id}-wait`,
      text: label ? `⏳ Wait` : "⏳",
      style: { ...styles.wait, display: "none" },
      callback: () => events.cancelActive(),
    });

    return row({
      id,
      style: { gap: "4px", alignItems: "center", ...style },
      content: [btnGenerate, btnQueued, btnCancel, btnContinue, btnWait],
    });
  },
};
