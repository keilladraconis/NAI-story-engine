import { Component, createEvents } from "../../../lib/nai-act";
import { RootState, GenerationRequest } from "../../core/store/types";
import {
  generationRequested,
  generationCancelled,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
} from "../../core/store";
import { NAI_WARNING, NAI_HEADER, NAI_DARK_BACKGROUND } from "../colors";

export interface GenerationButtonProps {
  id: string;
  requestId?: string;
  request?: GenerationRequest;
  label: string;
  style?: any;
  onClick?: () => void;
  onCancel?: () => void;
  onContinue?: () => void;
}

const { button, row } = api.v1.ui.part;

const events = createEvents<GenerationButtonProps, {
  generate(): void;
  cancel(): void;
  cancelActive(): void;
  continue(): void;
}>();

export const GenerationButton: Component<GenerationButtonProps, RootState> = {
  id: (props) => props.id,
  events,

  describe(props) {
    const { id, label, style = {} } = props;

    const btnGenerate = button({
      id: `${id}-gen`,
      text: `⚡ ${label}`,
      style: {
        "font-weight": "bold",
        padding: "4px 8px",
        ...style,
      },
      callback: () => events.generate(props),
    });

    const btnQueued = button({
      id: `${id}-queue`,
      text: `⏳ ${label} (Queued)`,
      style: {
        "background-color": "#e2e3e5",
        color: "#383d41",
        padding: "4px 8px",
        cursor: "pointer",
        ...style,
        display: "none",
      },
      callback: () => events.cancel(props),
    });

    const btnCancel = button({
      id: `${id}-cancel`,
      text: `🚫 Cancel`,
      style: {
        "font-weight": "bold",
        background: NAI_WARNING,
        color: NAI_DARK_BACKGROUND,
        padding: "4px 8px",
        ...style,
        display: "none",
      },
      callback: () => events.cancelActive(props),
    });

    const btnContinue = button({
      id: `${id}-continue`,
      text: `⚠️ Continue`,
      style: {
        background: NAI_HEADER,
        color: NAI_DARK_BACKGROUND,
        "font-weight": "bold",
        padding: "4px 8px",
        ...style,
        display: "none",
      },
      callback: () => events.continue(props),
    });

    const btnWait = button({
      id: `${id}-wait`,
      text: `⏳ Wait`,
      style: {
        "background-color": "#e2e3e5",
        color: "#383d41",
        padding: "4px 8px",
        ...style,
        display: "none",
      },
      callback: () => events.cancelActive(props),
    });

    return row({
      id,
      style: { gap: "4px", alignItems: "center" },
      content: [btnGenerate, btnQueued, btnCancel, btnContinue, btnWait],
    });
  },

  onMount(props, { dispatch, useSelector }) {
    const { id, requestId } = props;

    // Attach Handlers
    events.attach({
      generate(p) {
        if (p.request) {
          dispatch(generationRequested(p.request));
        } else if (p.onClick) {
          p.onClick();
        }
      },
      cancel(p) {
        if (p.requestId) {
          dispatch(generationCancelled({ requestId: p.requestId }));
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

    // Reactive State
    useSelector(
      (state) => ({
        activeRequestId: state.runtime.activeRequest?.id,
        queueIds: state.runtime.queue.map((q) => q.id),
        genxStatus: state.runtime.genx.status,
        genxBudgetState: state.runtime.genx.budgetState,
        genxBudgetTime: state.runtime.genx.budgetTimeRemaining,
      }),
      (slice) => {
        const { activeRequestId, queueIds, genxStatus, genxBudgetState } = slice;
        let mode = "idle";

        if (requestId) {
          const isActive = activeRequestId === requestId;
          const isQueued = queueIds.includes(requestId);
          if (isActive) {
            if (genxStatus === "waiting_for_user" || genxBudgetState === "waiting_for_user")
              mode = "budget_user";
            else if (genxStatus === "waiting_for_budget" || genxBudgetState === "waiting_for_timer")
              mode = "budget_timer";
            else mode = "generating";
          } else if (isQueued) {
            mode = "queued";
          } else if (
            genxStatus === "generating" ||
            genxStatus === "waiting_for_user" ||
            genxStatus === "waiting_for_budget"
          ) {
            // Global busy state
            mode = "idle"; 
          }
        } else {
          // Global button (Brainstorm Send)
          if (genxStatus === "queued") mode = "queued";
          else if (genxStatus === "waiting_for_user" || genxBudgetState === "waiting_for_user")
            mode = "budget_user";
          else if (genxStatus === "waiting_for_budget" || genxBudgetState === "waiting_for_timer")
            mode = "budget_timer";
          else if (genxStatus === "generating") mode = "generating";
        }

        const updates: any[] = [
          { id: `${id}-gen`, style: { display: mode === "idle" ? "block" : "none" } },
          { id: `${id}-queue`, style: { display: mode === "queued" ? "block" : "none" } },
          { id: `${id}-cancel`, style: { display: mode === "generating" ? "block" : "none" } },
          { id: `${id}-continue`, style: { display: mode === "budget_user" ? "block" : "none" } },
        ];

        if (mode === "budget_timer") {
          const remaining = Math.ceil((slice.genxBudgetTime || 0) / 1000);
          updates.push({
            id: `${id}-wait`,
            text: `⏳ Wait (${remaining}s)`,
            style: { display: "block" },
          });
        } else {
          updates.push({ id: `${id}-wait`, style: { display: "none" } });
        }

        api.v1.ui.updateParts(updates);
      }
    );
  },
};
