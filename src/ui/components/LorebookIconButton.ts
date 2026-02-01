import { Component, createEvents } from "../../../lib/nai-act";
import { RootState } from "../../core/store/types";
import {
  uiCancelRequest,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
  lorebookItemGenerationRequested,
} from "../../core/store";
import { NAI_WARNING, NAI_HEADER } from "../colors";

/**
 * Icon-based generation button for DULFS list items.
 * Derives requestIds from the entryId prop and tracks lorebook content state.
 */

export interface LorebookIconButtonProps {
  id: string;
  entryId: string;
}

const { button } = api.v1.ui.part;

type ButtonMode = "idle" | "queued" | "cancel" | "continue" | "wait";

// Icon-based visual states
const STYLES = {
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
      let lastMode: ButtonMode | null = null;

      // Derive request IDs from entryId
      const contentRequestId = `lb-item-${entryId}-content`;
      const keysRequestId = `lb-item-${entryId}-keys`;

      // Attach event handlers
      events.attach({
        generate(p) {
          dispatch(
            lorebookItemGenerationRequested({
              entryId: p.entryId,
              contentRequestId: `lb-item-${p.entryId}-content`,
              keysRequestId: `lb-item-${p.entryId}-keys`,
            }),
          );
        },
        cancel(p) {
          dispatch(
            uiCancelRequest({ requestId: `lb-item-${p.entryId}-content` }),
          );
          dispatch(uiCancelRequest({ requestId: `lb-item-${p.entryId}-keys` }));
        },
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

      // Check lorebook entry for content
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
        (slice) => {
          const { activeRequestId, queueIds, genxStatus, budgetWaitEndTime } =
            slice;

          // Check if any of our requests are active/queued
          const isProcessing =
            activeRequestId === contentRequestId ||
            activeRequestId === keysRequestId;
          const isQueued =
            queueIds.includes(contentRequestId) ||
            queueIds.includes(keysRequestId);

          // Determine button mode
          let mode: ButtonMode = "idle";

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

          // For idle mode, always verify content state
          if (mode === "idle") {
            checkContent().then(() => {
              if (lastMode === "idle") {
                api.v1.ui.updateParts([
                  {
                    id,
                    iconId: "book",
                    text: undefined,
                    style: hasContent ? STYLES.idleWithContent : STYLES.idle,
                    callback: () => events.generate(props),
                  },
                ]);
              }
            });

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
              style = STYLES.wait;
              callback = () => events.cancelActive(props);
              break;
          }

          // Update button (skip for wait mode - timer handles it)
          if (mode !== "wait") {
            api.v1.ui.updateParts([
              {
                id,
                iconId,
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
                  style: STYLES.wait,
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
        },
      );
    },
  };
