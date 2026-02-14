import { Component } from "nai-act";
import { RootState } from "../../core/store/types";
import { uiUserPresenceConfirmed } from "../../core/store";
import { NAI_HEADER, NAI_DARK_BACKGROUND, NAI_PARAGRAPH } from "../colors";

export interface BudgetFeedbackProps {
  id: string;
}

const { button, row, text } = api.v1.ui.part;

const styles = {
  root: {
    gap: "4px",
    "align-items": "center",
  },
  continueBtn: {
    padding: "3px 8px",
    "font-size": "0.75em",
    background: NAI_HEADER,
    color: NAI_DARK_BACKGROUND,
    "border-radius": "4px",
    "font-weight": "bold",
  },
  waitText: {
    "font-size": "0.75em",
    color: NAI_PARAGRAPH,
    opacity: "0.7",
  },
  hidden: { display: "none" },
};

export const BudgetFeedback: Component<BudgetFeedbackProps, RootState> = {
  id: (props) => props.id,

  build(props, { dispatch, useSelector }) {
    const { id } = props;
    const continueId = `${id}-continue`;
    const waitId = `${id}-wait`;

    let timerId: any = null;
    let isTimerActive = false;

    const handleContinue = () => {
      dispatch(uiUserPresenceConfirmed());
    };

    const updateTimer = (endTime: number) => {
      if (!isTimerActive) return;

      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));

      api.v1.ui.updateParts([
        { id: waitId, text: `Wait (${remaining}s)` },
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

    useSelector(
      (state) => ({
        genxStatus: state.runtime.genx.status,
        budgetWaitEndTime: state.runtime.genx.budgetWaitEndTime,
      }),
      (slice) => {
        const showContinue = slice.genxStatus === "waiting_for_user";
        const showWait = slice.genxStatus === "waiting_for_budget";

        api.v1.ui.updateParts([
          {
            id: continueId,
            style: showContinue ? styles.continueBtn : styles.hidden,
          },
          {
            id: waitId,
            style: showWait ? styles.waitText : styles.hidden,
          },
        ]);

        if (showWait) {
          if (!isTimerActive) {
            isTimerActive = true;
            updateTimer(slice.budgetWaitEndTime || Date.now() + 60000);
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

    return row({
      id,
      style: styles.root,
      content: [
        button({
          id: continueId,
          text: "Continue",
          iconId: "fast-forward",
          style: styles.hidden,
          callback: handleContinue,
        }),
        text({
          id: waitId,
          text: "",
          style: styles.hidden,
        }),
      ],
    });
  },
};
