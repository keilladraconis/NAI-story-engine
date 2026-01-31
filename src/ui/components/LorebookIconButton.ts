import { Component, createEvents } from "../../../lib/nai-act";
import { RootState } from "../../core/store/types";
import {
  uiCancelRequest,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
  lorebookItemGenerationRequested,
} from "../../core/store";
import { NAI_WARNING, NAI_HEADER } from "../colors";

export interface LorebookIconButtonProps {
  id: string;
  entryId: string;
}

const { button } = api.v1.ui.part;

// Icon-based visual states
const STYLES = {
  // Idle - no content (grey, low opacity)
  idle: {
    width: "24px",
    padding: "4px",
    opacity: "0.3",
    cursor: "pointer",
  },
  // Idle - has content (green tint)
  idleWithContent: {
    width: "24px",
    padding: "4px",
    opacity: "1",
    cursor: "pointer",
    color: "rgb(144, 238, 144)", // Light green
  },
  // Queued (yellow/amber tint)
  queued: {
    width: "24px",
    padding: "4px",
    opacity: "1",
    cursor: "pointer",
    color: NAI_HEADER,
  },
  // Generating - cancel available (red tint)
  cancel: {
    width: "24px",
    padding: "4px",
    opacity: "1",
    cursor: "pointer",
    color: NAI_WARNING,
  },
  // Waiting for user interaction (amber/warning)
  continue: {
    width: "24px",
    padding: "4px",
    opacity: "1",
    cursor: "pointer",
    color: NAI_HEADER,
    animation: "pulse 1s infinite",
  },
  // Waiting for budget
  wait: {
    width: "24px",
    padding: "4px",
    opacity: "0.6",
    cursor: "pointer",
    color: NAI_HEADER,
  },
};

const events = createEvents<
  LorebookIconButtonProps,
  {
    generate(): void;
    cancel(): void;
    cancelActive(): void;
    continue(): void;
  }
>();

export const LorebookIconButton: Component<LorebookIconButtonProps, RootState> =
  {
    id: (props) => props.id,
    events,

    describe(props) {
      const { id } = props;

      // Single button that changes appearance based on state
      return button({
        id,
        iconId: "book",
        style: STYLES.idle,
        callback: () => events.generate(props),
      });
    },

    onMount(props, { dispatch, useSelector }) {
      const { id, entryId } = props;

      let hasContent = false;
      let timerId: any = null;
      let isTimerActive = false;
      let lastMode: "idle" | "queued" | "cancel" | "continue" | "wait" | null =
        null;

      // Attach event handlers
      events.attach({
        generate(p) {
          // Derive request IDs from props
          const contentReqId = `lb-item-${p.entryId}-content`;
          const keysReqId = `lb-item-${p.entryId}-keys`;
          dispatch(
            lorebookItemGenerationRequested({
              entryId: p.entryId,
              contentRequestId: contentReqId,
              keysRequestId: keysReqId,
            }),
          );
        },
        cancel(p) {
          // Cancel queued request - derive IDs from props
          const contentReqId = `lb-item-${p.entryId}-content`;
          const keysReqId = `lb-item-${p.entryId}-keys`;
          dispatch(uiCancelRequest({ requestId: contentReqId }));
          dispatch(uiCancelRequest({ requestId: keysReqId }));
        },
        cancelActive(_p) {
          dispatch(uiRequestCancellation());
        },
        continue(_p) {
          dispatch(uiUserPresenceConfirmed());
        },
      });

      const updateTimer = (endTime: number) => {
        if (!isTimerActive) return;

        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));

        // Update button to show countdown number (no icon)
        api.v1.ui.updateParts([
          {
            id,
            text: `${remaining}`,
            iconId: undefined,
            style: STYLES.wait,
            callback: () => events.cancelActive(props),
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

      // Check lorebook entry for content on mount and periodically
      const checkContent = async () => {
        try {
          const entry = await api.v1.lorebook.entry(entryId);
          hasContent = !!(entry?.text && entry.text.trim().length > 0);
        } catch {
          hasContent = false;
        }
      };

      // Initial content check
      checkContent();

      // Reactive state tracking
      // Return raw state values from selector, do instance-specific comparison in callback
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

          // Derive request IDs from props (not closure variables)
          const contentRequestId = `lb-item-${entryId}-content`;
          const keysRequestId = `lb-item-${entryId}-keys`;

          // Instance-specific comparison in callback (like GenerationButton)
          const isProcessing =
            activeRequestId === contentRequestId ||
            activeRequestId === keysRequestId;
          const isQueued =
            queueIds.includes(contentRequestId) ||
            queueIds.includes(keysRequestId);

          // Determine button mode based on task status & GenX status
          let mode: "idle" | "queued" | "cancel" | "continue" | "wait" = "idle";

          if (isQueued) {
            mode = "queued";
          } else if (isProcessing) {
            if (genxStatus === "waiting_for_user") {
              mode = "continue";
            } else if (genxStatus === "waiting_for_budget") {
              mode = "wait";
            } else {
              mode = "cancel";
            }
          }

          // For idle mode, always verify content state (handles list re-renders)
          if (mode === "idle") {
            checkContent().then(() => {
              // Only update if we're still in idle mode
              if (lastMode === "idle") {
                api.v1.ui.updateParts([
                  {
                    id,
                    iconId: "book",
                    text: undefined, // Clear text when showing icon
                    style: hasContent ? STYLES.idleWithContent : STYLES.idle,
                    callback: () => events.generate(props),
                  },
                ]);
              }
            });

            // For idle specifically, skip immediate update if mode unchanged
            // (the async checkContent will handle the update)
            if (mode === lastMode) {
              return;
            }
          }

          lastMode = mode;

          // Determine icon and style based on mode
          let iconId = "book";
          let style = STYLES.idle;
          let callback = () => events.generate(props);

          switch (mode) {
            case "idle":
              iconId = "book";
              style = hasContent ? STYLES.idleWithContent : STYLES.idle;
              callback = () => events.generate(props);
              break;
            case "queued":
              iconId = "clock";
              style = STYLES.queued;
              callback = () => events.cancel(props);
              break;
            case "cancel":
              iconId = "x";
              style = STYLES.cancel;
              callback = () => events.cancelActive(props);
              break;
            case "continue":
              iconId = "alert-triangle";
              style = STYLES.continue;
              callback = () => events.continue(props);
              break;
            case "wait":
              // Wait mode is handled by updateTimer - it shows countdown number
              // Just set callback here, timer will update the visual
              style = STYLES.wait;
              callback = () => events.cancelActive(props);
              break;
          }

          // Update the button immediately (no async before this!)
          // For wait mode, skip this - the timer will handle the update
          if (mode !== "wait") {
            api.v1.ui.updateParts([
              {
                id,
                iconId,
                text: undefined, // Clear text when showing icon (exiting wait mode)
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
              // Immediate update with initial countdown value
              const initialRemaining = Math.max(
                0,
                Math.ceil((endTime - Date.now()) / 1000),
              );
              api.v1.ui.updateParts([
                {
                  id,
                  text: `${initialRemaining}`,
                  iconId: undefined,
                  style: STYLES.wait,
                  callback: () => events.cancelActive(props),
                },
              ]);
              // Start the countdown timer
              updateTimer(endTime);
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
