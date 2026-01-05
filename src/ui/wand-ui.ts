import { FieldSession, AgentCycleManager } from "../core/agent-cycle";
import { AgentWorkflowService } from "../core/agent-workflow";
import {
  createHeaderWithToggle,
  createToggleableContent,
} from "./ui-components";

const { column, row, text, button, checkboxInput } = api.v1.ui.part;

export class WandUI {
  constructor(
    private agentCycleManager: AgentCycleManager,
    private agentWorkflowService: AgentWorkflowService,
    private onUpdateCallback: () => void,
  ) {}

  public createWorkflowUI(
    session: FieldSession,
    fieldId: string,
    isEditMode: boolean,
    onToggleEditMode: () => void,
    onSave: (session: FieldSession) => void,
  ): UIPart[] {
    const activeStage = session.selectedStage;

    // Debug logging for runtime error investigation
    if (!session.cycles || !session.cycles[activeStage]) {
      api.v1.log(
        `[UI Error] Invalid session state for ${fieldId}. Stage: ${activeStage}`,
      );
      return [
        text({ text: `Error: Invalid session state. Please close and retry.` }),
        button({
          text: "Close",
          callback: () => {
            this.agentCycleManager.endSession(fieldId);
            this.onUpdateCallback();
          },
        }),
      ];
    }

    const activeContent = session.cycles[activeStage].content;

    return [
      column({
        id: `wand-container-${fieldId}`,
        content: [
          // Stage Selection
          text({
            text: "Workflow Stage:",
            style: { "font-weight": "bold", "margin-top": "8px" },
          }),
          this.createStageSelector(session, fieldId, activeStage),

          // Active Stage Content Header + Toggle
          createHeaderWithToggle(
            `Stage Output (${activeStage.toUpperCase()}):`,
            isEditMode,
            onToggleEditMode,
          ),

          // Active Stage Content
          createToggleableContent(
            isEditMode,
            activeContent,
            `Output for ${activeStage} stage will appear here...`,
            undefined, // No storage key for wand scratchpad
            (val) => {
              session.cycles[activeStage].content = val;
              session.currentContent = val;
            },
            { height: "100%" },
          ),

          // Actions
          this.createActionRow(session, fieldId, activeStage, onSave, () => {
            if (session.cancellationSignal) {
              session.cancellationSignal.cancel();
            }
            this.agentCycleManager.endSession(session.fieldId);
            this.onUpdateCallback();
          }),
        ],
      }),
    ];
  }

  public createInlineControlCluster(
    session: FieldSession,
    fieldId: string,
    onSave: (session: FieldSession) => void,
    onDiscard: (session: FieldSession) => void,
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
    onSave: (session: FieldSession) => void,
    onDiscard: (session: FieldSession) => void,
  ): UIPart {
    const update = () => this.onUpdateCallback();
    return row({
      id: `wand-action-row-${fieldId}`,
      style: { "margin-top": "24px", "justify-content": "space-between" },
      content: [
        (() => {
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
        })(),
        row({
          id: `wand-save-discard-row-${fieldId}`,
          content: [
            button({
              id: `wand-save-btn-${fieldId}`,
              text: "Save",
              callback: () => {
                // Ensure we save the content of the currently viewed stage
                session.currentContent = session.cycles[activeStage].content;
                onSave(session);
              },
            }),
            button({
              id: `wand-discard-btn-${fieldId}`,
              text: "Discard",
              callback: () => {
                onDiscard(session);
              },
            }),
          ],
          style: { gap: "8px" },
        }),
      ],
    });
  }
}
