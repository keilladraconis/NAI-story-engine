import { FieldSession } from "../core/agent-cycle";
import { AgentWorkflowService } from "../core/agent-workflow";

const { column, row, button, checkboxInput } = api.v1.ui.part;

export class WandUI {
  constructor(
    private agentWorkflowService: AgentWorkflowService,
    private onUpdateCallback: () => void,
  ) {}

  public createInlineControlCluster(
    session: FieldSession,
    fieldId: string,
    onSave?: (session: FieldSession) => void,
    onDiscard?: (session: FieldSession) => void,
  ): UIPart {
    const activeStage = session.selectedStage;
    return column({
      style: { "margin-top": "16px" },
      content: [
        this.createStageSelector(session, fieldId, activeStage),
        this.createActionRow(session, fieldId, activeStage, onSave, onDiscard),
      ],
    });
  }

  private createStageSelector(
    session: FieldSession,
    fieldId: string,
    activeStage: "generate" | "review" | "refine",
  ): UIPart {
    const update = () => this.onUpdateCallback();
    return row({
      id: `wand-stage-selector-${fieldId}`,
      style: { "align-items": "center", "margin-bottom": "16px", gap: "16px" },
      content: [
        row({
          content: [
            button({
              text: "1. Generate",
              iconId: "file-text",
              style:
                activeStage === "generate"
                  ? { "background-color": "rgb(245, 243, 194)", color: "black" }
                  : {},
              callback: () => {
                session.selectedStage = "generate";
                update();
              },
            }),
            button({
              text: "2. Review",
              iconId: "eye",
              style:
                activeStage === "review"
                  ? { "background-color": "rgb(245, 243, 194)", color: "black" }
                  : {},
              callback: () => {
                session.selectedStage = "review";
                update();
              },
            }),
            button({
              text: "3. Refine",
              iconId: "feather",
              style:
                activeStage === "refine"
                  ? { "background-color": "rgb(245, 243, 194)", color: "black" }
                  : {},
              callback: () => {
                session.selectedStage = "refine";
                update();
              },
            }),
          ],
          style: { gap: "8px" },
        }),
        checkboxInput({
          id: `wand-auto-checkbox-${fieldId}`,
          label: "Auto-Advance",
          initialValue: session.isAuto,
          onChange: (val) => {
            session.isAuto = val;
          },
        }),
      ],
    });
  }

  private createActionRow(
    session: FieldSession,
    fieldId: string,
    activeStage: "generate" | "review" | "refine",
    onSave?: (session: FieldSession) => void,
    onDiscard?: (session: FieldSession) => void,
  ): UIPart {
    const update = () => this.onUpdateCallback();

    const leftControls = (() => {
      if (session.budgetState === "waiting_for_user") {
        return button({
          id: `wand-continue-btn-${fieldId}`,
          text: "⚠️ Continue",
          style: {
            "background-color": "#fff3cd",
            color: "#856404",
            "font-weight": "bold",
          },
          callback: () => {
            if (session.budgetResolver) {
              session.budgetState = "waiting_for_timer";
              session.budgetResolver();
              session.budgetResolver = undefined;
              update();
            }
          },
        });
      }
      if (session.budgetState === "waiting_for_timer") {
        return button({
          id: `wand-wait-btn-${fieldId}`,
          text: "⏳ Refilling...",
          style: {
            "background-color": "#e2e3e5",
            color: "#383d41",
          },
          callback: () => {
            // Allow cancel during wait
            if (session.cancellationSignal) {
              session.cancellationSignal.cancel();
              api.v1.ui.toast("Wait cancelled", { type: "info" });
              update();
            }
          },
        });
      }
      if (session.cycles[activeStage].status === "running") {
        return button({
          id: `wand-cancel-btn-${fieldId}`,
          text: "🚫 Cancel",
          style: {
            "font-weight": "bold",
            "background-color": "#ffcccc",
            color: "red",
          },
          callback: () => {
            if (session.cancellationSignal) {
              session.cancellationSignal.cancel();
              api.v1.ui.toast("Generation cancelled", {
                type: "info",
              });
              update();
            }
          },
        });
      }
      return button({
        id: `wand-ignite-btn-${fieldId}`,
        text: "⚡ Ignite",
        style: { "font-weight": "bold" },
        callback: () => {
          if (session.isAuto) {
            this.agentWorkflowService.runAutoGeneration(session, update);
          } else {
            this.agentWorkflowService.runStageGeneration(session, update);
          }
        },
      });
    })();

    const rightControls = (() => {
      const buttons = [];
      if (onSave) {
        buttons.push(
          button({
            id: `wand-save-btn-${fieldId}`,
            text: "Save",
            callback: () => {
              // Ensure we save the content of the currently viewed stage
              onSave(session);
            },
          }),
        );
      }
      if (onDiscard) {
        buttons.push(
          button({
            id: `wand-discard-btn-${fieldId}`,
            text: "Discard",
            callback: () => {
              onDiscard(session);
            },
          }),
        );
      }
      if (buttons.length === 0) return null;

      return row({
        id: `wand-save-discard-row-${fieldId}`,
        content: buttons,
        style: { gap: "8px" },
      });
    })();

    const rowContent: any[] = [leftControls];
    if (rightControls) rowContent.push(rightControls);

    return row({
      id: `wand-action-row-${fieldId}`,
      style: { "margin-top": "24px", "justify-content": "space-between" },
      content: rowContent,
    });
  }
}
