import { SegaService, SegaItem } from "../core/sega-service";
import { createResponsiveGenerateButton } from "./ui-components";
import { AgentWorkflowService } from "../core/agent-workflow";

const { text, row, column, button } = api.v1.ui.part;

export class SegaModal {
  private modal: any;

  constructor(
    private service: SegaService,
    private agentWorkflow: AgentWorkflowService,
  ) {}

  public async show() {
    // Initialize/Refresh list on open if not already running
    if (!this.service.isRunning) {
      this.service.initialize();
    }

    this.modal = await api.v1.ui.modal.open({
      title: "Story Engine Generate All (S.E.G.A.)",
      content: this.renderContent(),
      size: "large",
      // Removed non-standard style prop
    });

    this.service.setUpdateCallback(() => {
      this.modal.update({ content: this.renderContent() });
    });

    // Wait for close
    await this.modal.closed;

    this.service.cancel();

    // Detach callback
    this.service.setUpdateCallback(() => {});
  }

  private renderContent(): UIPart[] {
    return [
      column({
        style: { gap: "16px", height: "100%" },
        content: [
          text({
            text: "S.E.G.A. will process empty fields sequentially. New Lorebook entries created during the process will be added to the queue automatically.",
            style: { opacity: "0.8", "margin-bottom": "8px" },
          }),

          // List of items
          column({
            style: {
              flex: "1",
              border: "1px solid rgba(128,128,128,0.2)",
              "border-radius": "4px",
              padding: "8px",
              "max-height": "500px",
              "overflow-y": "auto",
            },
            content: [
              column({
                style: { gap: "4px" },
                content: this.service.items.map((item) =>
                  this.renderItem(item),
                ),
              }),
            ],
          }),

          // Footer with Master Button
          row({
            style: {
              "justify-content": "center",
              "padding-top": "16px",
              "border-top": "1px solid rgba(128,128,128,0.2)",
            },
            content: [this.renderMasterButton()],
          }),
        ],
      }),
    ];
  }

  private renderItem(item: SegaItem): UIPart {
    let statusIcon: IconId = "circle";
    let statusColor = "gray";
    let statusOpacity = "0.3";

    if (item.status === "checked") {
      statusIcon = "check-circle";
      statusColor = "#4caf50"; // Green
      statusOpacity = "1";
    } else if (item.status === "queued") {
      statusIcon = "clock";
      statusColor = "#ff9800"; // Orange
      statusOpacity = "1";
    } else if (item.status === "generating") {
      statusIcon = "chevrons-right"; // Fast forward / active
      statusColor = "#2196f3"; // Blue
      statusOpacity = "1";
    } else if (item.status === "error") {
      statusIcon = "alert";
      statusColor = "#f44336"; // Red
      statusOpacity = "1";
    }

    return row({
      style: {
        "align-items": "center",
        padding: "4px 8px",
        "background-color":
          item.status === "generating"
            ? "rgba(33, 150, 243, 0.1)"
            : "transparent",
        "border-radius": "4px",
        gap: "12px",
      },
      content: [
        button({
          iconId: statusIcon,
          text: "", // Icon only
          style: {
            color: statusColor,
            opacity: statusOpacity,
            background: "transparent",
            border: "none",
            padding: "0",
            width: "24px",
            height: "24px",
            cursor: "default",
          },
          callback: () => {},
        }),
        column({
          style: { gap: "2px", flex: "1" },
          content: [
            text({
              text: item.label,
              style: {
                "font-weight": item.status === "generating" ? "bold" : "normal",
              },
            }),
            item.status === "error"
              ? text({
                  text: item.error || "Error",
                  style: { color: "red", "font-size": "0.8em" },
                })
              : null,
          ].filter(Boolean) as UIPart[],
        }),
        item.type === "lorebook"
          ? text({
              text: "Lorebook",
              style: {
                "font-size": "0.7em",
                opacity: "0.5",
                border: "1px solid gray",
                "border-radius": "4px",
                padding: "1px 4px",
              },
            })
          : null,
      ].filter(Boolean) as UIPart[],
    });
  }

  private renderMasterButton(): UIPart {
    const isRunning = this.service.isRunning;
    const currentId = this.service.currentFieldId;

    let budgetState: "normal" | "waiting_for_user" | "waiting_for_timer" =
      "normal";

    // Look up budget state if running
    if (currentId) {
      // Check list generation state first
      let state = this.agentWorkflow.getListGenerationState(currentId);
      if (!state.isRunning) {
        // Check field session
        const session = this.agentWorkflow.getSession(currentId);
        if (session) {
          budgetState = session.budgetState || "normal";
        }
      } else {
        budgetState = state.budgetState || "normal";
      }
    }

    return createResponsiveGenerateButton(
      "sega-master-btn",
      {
        isRunning: isRunning,
        isQueued: false, // We handle queuing internally
        budgetState: budgetState,
      },
      {
        onStart: () => {
          this.service.startQueue();
        },
        onCancel: () => {
          this.service.cancel();
        },
        onContinue: () => {
          // Trigger resolve on the *current* session
          if (currentId) {
            const session = this.agentWorkflow.getSession(currentId);
            if (session && session.budgetResolver) {
              session.budgetResolver();
              return;
            }

            // Check list state
            const listState =
              this.agentWorkflow.getListGenerationState(currentId);
            if (listState && listState.budgetResolver) {
              listState.budgetResolver();
            }
          }
        },
      },
      "S.E.G.A. Start",
    );
  }
}
