import { Component, createEvents } from "../../../lib/nai-act";
import {
  generationRequested,
  generationCancelled,
  uiUserPresenceConfirmed,
  uiRequestCancellation,
} from "../../core/store/actions";
import { NAI_DARK_BACKGROUND, NAI_HEADER, NAI_WARNING } from "../colors";
import { GenerationRequest, RootState } from "../../core/store/types";

const { button, row } = api.v1.ui.part;

export interface GenerationButtonProps {
  id: string;
  requestId?: string;
  request?: GenerationRequest;
  label: string;
  style?: any;
  onClick?: () => void;
  onCancel?: () => void;
  onContinue?: () => void;
  dispatch?: (action: any) => void;
}

const events = createEvents({
  generate: (props: GenerationButtonProps, dispatch: any) => {
    if (props.request) {
      dispatch(generationRequested(props.request));
    } else if (props.onClick) {
      props.onClick();
    }
  },
  cancel: (props: GenerationButtonProps, dispatch: any) => {
    if (props.requestId) {
      dispatch(generationCancelled({ requestId: props.requestId }));
    } else if (props.onCancel) {
      props.onCancel();
    }
  },
  cancelActive: (props: GenerationButtonProps, dispatch: any) => {
    if (props.onCancel) {
      props.onCancel();
    } else {
      dispatch(uiRequestCancellation());
    }
  },
  continue: (props: GenerationButtonProps, dispatch: any) => {
    if (props.onContinue) {
      props.onContinue();
    } else {
      dispatch(uiUserPresenceConfirmed());
    }
  },
});

export const GenerationButton: Component<GenerationButtonProps, RootState> = {
  id: (props) => props.id,

  describe(props, state) {
    const { activeRequest, queue, genx } = state.runtime;
    const activeRequestId = activeRequest?.id;
    const queueIds = queue.map((q) => q.id);
    const genxStatus = genx.status;
    const genxBudgetState = genx.budgetState;
    const genxBudgetTime = genx.budgetTimeRemaining;
    const label = props.label;

    let mode:
      | "idle"
      | "queued"
      | "generating"
      | "budget_user"
      | "budget_timer" = "idle";

    if (props.requestId) {
      const isActive = activeRequestId === props.requestId;
      const isQueued = queueIds.includes(props.requestId);

      if (isActive) {
        if (
          genxStatus === "waiting_for_user" ||
          genxBudgetState === "waiting_for_user"
        ) {
          mode = "budget_user";
        } else if (
          genxStatus === "waiting_for_budget" ||
          genxBudgetState === "waiting_for_timer"
        ) {
          mode = "budget_timer";
        } else {
          mode = "generating";
        }
      } else if (isQueued) {
        mode = "queued";
      } else if (
        genxStatus === "generating" ||
        genxStatus === "waiting_for_user" ||
        genxStatus === "waiting_for_budget"
      ) {
        mode = "idle";
      }
    } else {
      if (genxStatus === "queued") mode = "queued";
      else if (
        genxStatus === "waiting_for_user" ||
        genxBudgetState === "waiting_for_user"
      )
        mode = "budget_user";
      else if (
        genxStatus === "waiting_for_budget" ||
        genxBudgetState === "waiting_for_timer"
      )
        mode = "budget_timer";
      else if (genxStatus === "generating") mode = "generating";
    }

    const style = props.style || {};
    const dispatch = props.dispatch;

    // Helper to attach callback if dispatch is available
    const mkCallback = (handler: (p: GenerationButtonProps, d: any) => void) =>
      dispatch ? () => handler(props, dispatch) : () => {};

    const btnGenerate = button({
      id: `${props.id}-gen`,
      text: `⚡ ${label}`,
      style: {
        "font-weight": "bold",
        padding: "4px 8px",
        ...style,
        display: mode === "idle" ? "block" : "none",
      },
      callback: mkCallback(events.generate),
    });

    const btnQueued = button({
      id: `${props.id}-queue`,
      text: `⏳ ${label} (Queued)`,
      style: {
        "background-color": "#e2e3e5",
        color: "#383d41",
        padding: "4px 8px",
        cursor: "pointer",
        ...style,
        display: mode === "queued" ? "block" : "none",
      },
      callback: mkCallback(events.cancel),
    });

    const btnCancel = button({
      id: `${props.id}-cancel`,
      text: `🚫 Cancel`,
      style: {
        "font-weight": "bold",
        background: NAI_WARNING,
        color: NAI_DARK_BACKGROUND,
        padding: "4px 8px",
        ...style,
        display: mode === "generating" ? "block" : "none",
      },
      callback: mkCallback(events.cancelActive),
    });

    const btnContinue = button({
      id: `${props.id}-continue`,
      text: `⚠️ Continue`,
      style: {
        background: NAI_HEADER,
        color: NAI_DARK_BACKGROUND,
        "font-weight": "bold",
        padding: "4px 8px",
        ...style,
        display: mode === "budget_user" ? "block" : "none",
      },
      callback: mkCallback(events.continue),
    });

    const remaining = Math.ceil((genxBudgetTime || 0) / 1000);
    const btnWait = button({
      id: `${props.id}-wait`,
      text: `⏳ Wait (${remaining}s)`,
      style: {
        "background-color": "#e2e3e5",
        color: "#383d41",
        padding: "4px 8px",
        ...style,
        display: mode === "budget_timer" ? "block" : "none",
      },
      callback: mkCallback(events.cancelActive),
    });

    return row({
      id: props.id,
      style: { gap: "4px", alignItems: "center" },
      content: [btnGenerate, btnQueued, btnCancel, btnContinue, btnWait],
    });
  },

  bind({ useSelector, updateParts, dispatch }, props) {
    // If props.dispatch was missing in describe, we attach callbacks here
    if (!props.dispatch) {
      updateParts([
        {
          id: `${props.id}-gen`,
          callback: () => events.generate(props, dispatch),
        },
        {
          id: `${props.id}-queue`,
          callback: () => events.cancel(props, dispatch),
        },
        {
          id: `${props.id}-cancel`,
          callback: () => events.cancelActive(props, dispatch),
        },
        {
          id: `${props.id}-continue`,
          callback: () => events.continue(props, dispatch),
        },
        {
          id: `${props.id}-wait`,
          callback: () => events.cancelActive(props, dispatch),
        },
      ]);
    }

    useSelector(
      (state) => ({
        activeRequestId: state.runtime.activeRequest?.id,
        queueIds: state.runtime.queue.map((q) => q.id),
        genxStatus: state.runtime.genx.status,
        genxBudgetState: state.runtime.genx.budgetState,
        genxBudgetTime: state.runtime.genx.budgetTimeRemaining,
      }),
      (slice) => {
        const { activeRequestId, queueIds, genxStatus, genxBudgetState } =
          slice;
        let mode = "idle";

        if (props.requestId) {
          const isActive = activeRequestId === props.requestId;
          const isQueued = queueIds.includes(props.requestId);
          if (isActive) {
            if (
              genxStatus === "waiting_for_user" ||
              genxBudgetState === "waiting_for_user"
            )
              mode = "budget_user";
            else if (
              genxStatus === "waiting_for_budget" ||
              genxBudgetState === "waiting_for_timer"
            )
              mode = "budget_timer";
            else mode = "generating";
          } else if (isQueued) {
            mode = "queued";
          }
          // If the request is neither active nor queued, and generation is ongoing, it's idle.
          else if (
            genxStatus === "generating" ||
            genxStatus === "waiting_for_user" ||
            genxStatus === "waiting_for_budget"
          ) {
            mode = "idle";
          }
        } else {
          if (genxStatus === "queued") mode = "queued";
          else if (
            genxStatus === "waiting_for_user" ||
            genxBudgetState === "waiting_for_user"
          )
            mode = "budget_user";
          else if (
            genxStatus === "waiting_for_budget" ||
            genxBudgetState === "waiting_for_timer"
          )
            mode = "budget_timer";
          else if (genxStatus === "generating") mode = "generating";
        }

        const updates: any[] = [
          {
            id: `${props.id}-gen`,
            style: { display: mode === "idle" ? "block" : "none" },
          },
          {
            id: `${props.id}-queue`,
            style: { display: mode === "queued" ? "block" : "none" },
          },
          {
            id: `${props.id}-cancel`,
            style: { display: mode === "generating" ? "block" : "none" },
          },
          {
            id: `${props.id}-continue`,
            style: { display: mode === "budget_user" ? "block" : "none" },
          },
        ];

        if (mode === "budget_timer") {
          const remaining = Math.ceil((slice.genxBudgetTime || 0) / 1000);
          updates.push({
            id: `${props.id}-wait`,
            text: `⏳ Wait (${remaining}s)`,
            style: { display: "block" },
          });
        } else {
          updates.push({ id: `${props.id}-wait`, style: { display: "none" } });
        }

        updateParts(updates);
      },
    );
  },
};
