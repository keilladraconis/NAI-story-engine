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

      // Request IDs for this item's generations
      const contentRequestId = `lb-item-${entryId}-content`;
      const keysRequestId = `lb-item-${entryId}-keys`;

      let hasContent = false;
      let timerId: any = null;
      let isTimerActive = false;

      // Attach event handlers
      events.attach({
        generate(p) {
          dispatch(
            lorebookItemGenerationRequested({
              entryId: p.entryId,
              contentRequestId,
              keysRequestId,
            }),
          );
        },
        cancel(_p) {
          // Cancel queued request
          dispatch(uiCancelRequest({ requestId: contentRequestId }));
          dispatch(uiCancelRequest({ requestId: keysRequestId }));
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

        // Could update a tooltip or similar, but for icon we just maintain wait state
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
      useSelector(
        (state) => ({
          activeRequestId: state.runtime.activeRequest?.id,
          queueIds: state.runtime.queue.map((q) => q.id),
          genxStatus: state.runtime.genx.status,
          budgetWaitEndTime: state.runtime.genx.budgetWaitEndTime,
        }),
        async (slice) => {
          const { activeRequestId, queueIds, genxStatus, budgetWaitEndTime } =
            slice;

          // Determine task status for this item's requests
          // We track the content request primarily, but also check keys
          let taskStatus: "queued" | "processing" | "not_found" = "not_found";

          if (
            activeRequestId === contentRequestId ||
            activeRequestId === keysRequestId
          ) {
            taskStatus = "processing";
          } else if (
            queueIds.includes(contentRequestId) ||
            queueIds.includes(keysRequestId)
          ) {
            taskStatus = "queued";
          }

          // Determine button mode based on task status & GenX status
          let mode: "idle" | "queued" | "cancel" | "continue" | "wait" = "idle";

          if (taskStatus === "queued") {
            mode = "queued";
          } else if (taskStatus === "processing") {
            if (genxStatus === "waiting_for_user") {
              mode = "continue";
            } else if (genxStatus === "waiting_for_budget") {
              mode = "wait";
            } else {
              mode = "cancel";
            }
          } else {
            mode = "idle";
            // Refresh content check when returning to idle
            await checkContent();
          }

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
              iconId = "clock";
              style = STYLES.wait;
              callback = () => events.cancelActive(props);
              break;
          }

          // Update the button
          api.v1.ui.updateParts([
            {
              id,
              iconId,
              style,
              callback,
            },
          ]);

          // Handle timer for wait state
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
