import { StoryManager } from "../core/story-manager";
import { AgentWorkflowService } from "../core/agent-workflow";
import { calculateTextAreaHeight } from "./ui-components";
import { Action } from "../core/store";
import { StoryData } from "../core/story-data-manager";
import { FieldID } from "../config/field-definitions";

const { column, row, button, text, multilineTextInput } = api.v1.ui.part;
const { sidebarPanel } = api.v1.ui.extension;

export class BrainstormUI {
  private static readonly KEYS = {
    SIDEBAR_ID: "kse-brainstorm-sidebar",
  };

  public sidebar: UIExtensionSidebarPanel;
  private storyManager: StoryManager;
  private agentWorkflowService: AgentWorkflowService;

  // Local State
  private inputValue: string = "";
  private editingIndex: number | null = null;
  private editValue: string = "";

  constructor(
    storyManager: StoryManager,
    agentWorkflowService: AgentWorkflowService,
    private dispatch: (action: Action<StoryData>) => void
  ) {
    this.storyManager = storyManager;
    this.agentWorkflowService = agentWorkflowService;

    this.sidebar = this.createSidebar();

    // Subscribe to story manager updates to refresh chat history
    this.storyManager.subscribe(() => {
      const session = this.agentWorkflowService.getBrainstormSession();
      // Only refresh if we are not currently generating (streaming handles its own updates via workflow sub)
      if (!session.isRunning) {
        this.updateUI();
      }
    });

    // Subscribe to workflow updates
    this.agentWorkflowService.subscribe((fieldId) => {
      if (fieldId === "brainstorm") {
        this.updateUI();
      }
    });
  }

  private updateUI(): void {
    this.sidebar = this.createSidebar();
    api.v1.ui.update([
      this.sidebar as UIExtensionSidebarPanel & { id: string },
    ]);
  }

  public createSidebar(): UIExtensionSidebarPanel {
    return sidebarPanel({
      id: BrainstormUI.KEYS.SIDEBAR_ID,
      name: "Brainstorm",
      iconId: "cloud-lightning",
      content: [
        column({
          content: [
            // Chat History Area
            this.createMessageList(),

            // Input Area
            this.createInputArea(),
          ],
          style: {
            height: "100%",
            "justify-content": "space-between",
          },
        }),
      ],
    });
  }

  private createMessageList(): UIPart {
    const history = this.storyManager.getBrainstormMessages();
    const session = this.agentWorkflowService.getBrainstormSession();
    const messageParts: UIPart[] = [];

    const isGenerating =
      session.isRunning &&
      !session.isQueued &&
      (!session.budgetState || session.budgetState === "normal");

    // Render Streaming Message (if any) - goes at the very bottom (first in reversed list)
    if (isGenerating) {
      // Use streaming content or "Thinking..." if empty
      const displayContent = session.outputBuffer || "...";
      messageParts.push(
        this.renderMessageBubble("assistant", displayContent, -1, true),
      );
    }

    // Render History (Reversed so latest is at the top of the array, which is the bottom of the UI due to column-reverse)
    const reversedHistory = history
      .map((msg, idx) => ({ ...msg, idx }))
      .reverse();

    reversedHistory.forEach((msg) => {
      messageParts.push(
        this.renderMessageBubble(msg.role, msg.content, msg.idx),
      );
    });

    if (messageParts.length === 0 && !isGenerating) {
      return column({
        content: [
          text({
            text: "Start brainstorming by typing a message below or just hit Send!",
            style: {
              opacity: 0.5,
              "text-align": "center",
              "margin-top": "20px",
            },
          }),
        ],
        style: { flex: 1 },
      });
    }

    return column({
      content: messageParts,
      style: {
        flex: 1,
        overflow: "auto",
        gap: "10px",
        padding: "8px",
        "padding-bottom": "20px",
        "flex-direction": "column-reverse", // Anchors to bottom
        "justify-content": "flex-start", // Messages anchor to bottom
      },
    });
  }

  private renderMessageBubble(
    role: string,
    content: string,
    index: number,
    isStreaming: boolean = false,
  ): UIPart {
    const isUser = role === "user";
    const bgColor = isUser
      ? "rgba(64, 156, 255, 0.2)"
      : "rgba(255, 255, 255, 0.05)";
    const align = isUser ? "flex-end" : "flex-start";
    const radius = isUser ? "12px 12px 0 12px" : "12px 12px 12px 0";

    // Edit Mode
    if (this.editingIndex === index && !isStreaming) {
      return row({
        content: [
          column({
            content: [
              text({
                text: isUser ? "Editing You" : "Editing Brainstorm",
                style: {
                  "font-size": "0.7em",
                  opacity: 0.7,
                  "margin-bottom": "2px",
                },
              }),
              multilineTextInput({
                initialValue: this.editValue,
                onChange: (val) => (this.editValue = val),
                style: {
                  height: calculateTextAreaHeight(this.editValue),
                  "margin-bottom": "8px",
                },
              }),
              row({
                content: [
                  button({
                    text: "Cancel",
                    callback: () => this.handleCancelEdit(),
                    style: {
                      flex: 1,
                      "background-color": "transparent",
                      opacity: 0.8,
                    },
                  }),
                  button({
                    text: "Save",
                    iconId: "save",
                    callback: () => this.handleSaveEdit(),
                    style: { flex: 1 },
                  }),
                ],
                style: { gap: "8px" },
              }),
            ],
            style: {
              "background-color": bgColor,
              padding: "10px",
              "border-radius": radius,
              "max-width": "85%",
              width: "100%", // Full width within max-width constraint
            },
          }),
        ],
        style: {
          "justify-content": align,
          width: "100%",
        },
      });
    }

    // Normal View
    const processedContent = content.replace(/\n/g, "  \n");

    const session = this.agentWorkflowService.getBrainstormSession();
    const isBusy = session.isRunning || session.isQueued;

    const actionButtons: UIPart[] = [];
    if (!isStreaming) {
      // Edit Button
      actionButtons.push(
        button({
          iconId: "edit-3",
          callback: () => !isBusy && this.handleEdit(index, content),
          style: {
            width: "24px",
            height: "24px",
            padding: "2px",
            "background-color": "transparent",
            opacity: isBusy ? 0.2 : 0.5,
          },
          disabled: isBusy,
        }),
      );

      // Retry Button
      actionButtons.push(
        button({
          iconId: "refresh-cw",
          callback: () => !isBusy && this.handleRetry(index),
          style: {
            width: "24px",
            height: "24px",
            padding: "2px",
            "background-color": "transparent",
            opacity: isBusy ? 0.2 : 0.5,
          },
          disabled: isBusy,
        }),
      );

      // Delete Button
      actionButtons.push(
        button({
          iconId: "trash-2",
          callback: () => !isBusy && this.handleDelete(index),
          style: {
            width: "24px",
            height: "24px",
            padding: "2px",
            "background-color": "transparent",
            opacity: isBusy ? 0.2 : 0.5,
            color: "rgba(255, 100, 100, 0.8)",
          },
          disabled: isBusy,
        }),
      );
    }

    return row({
      content: [
        column({
          content: [
            row({
              content: [
                text({
                  text: isUser ? "You" : "Brainstorm",
                  style: {
                    "font-size": "0.7em",
                    opacity: 0.7,
                    "margin-bottom": "2px",
                    flex: 1,
                  },
                }),
                // Actions Row
                !isStreaming
                  ? row({
                      content: actionButtons,
                      style: { gap: "4px" },
                    })
                  : text({ text: "" }),
              ],
              style: { "align-items": "center", "margin-bottom": "4px" },
            }),
            text({
              text: processedContent,
              markdown: true,
              style: { "word-break": "break-word", "user-select": "text" },
            }),
          ],
          style: {
            "background-color": bgColor,
            padding: "10px",
            "border-radius": radius,
            "max-width": "85%",
            border: isStreaming ? "1px dashed #666" : "none",
          },
        }),
      ],
      style: {
        "justify-content": align,
        width: "100%",
      },
    });
  }

  private handleEdit(index: number, content: string) {
    this.editingIndex = index;
    this.editValue = content;
    this.updateUI();
  }

  private handleCancelEdit() {
    this.editingIndex = null;
    this.editValue = "";
    this.updateUI();
  }

  private async handleSaveEdit() {
    if (this.editingIndex !== null) {
      await this.agentWorkflowService.brainstormService.editMessage(
        this.editingIndex,
        this.editValue,
      );
      this.editingIndex = null;
      this.editValue = "";
      this.updateUI();
    }
  }

  private async handleDelete(index: number) {
    await this.agentWorkflowService.brainstormService.deleteMessage(index);
    this.updateUI();
  }

  private async handleRetry(index: number) {
    const session = this.agentWorkflowService.getBrainstormSession();
    if (session.isRunning || session.isQueued) return;

    // Truncate history
    await this.agentWorkflowService.brainstormService.prepareRetry(index);

    this.updateUI();

    this.agentWorkflowService.requestBrainstormGeneration(false);
  }

  private createInputArea(): UIPart {
    const session = this.agentWorkflowService.getBrainstormSession();
    const isBusy = session.isRunning || session.isQueued;

    let buttonText = "Send";
    let buttonIcon: any = "send";
    let onCallback: () => void | Promise<void> = () => this.handleSend();

    if (session.isQueued) {
      buttonText = "Queued";
      buttonIcon = "clock";
      onCallback = () => this.agentWorkflowService.cancelBrainstormGeneration();
    } else if (session.budgetState === "waiting_for_user") {
      buttonText = "Continue...?";
      buttonIcon = "play";
      onCallback = () => {
        if (session.budgetResolver) session.budgetResolver();
      };
    } else if (session.budgetState === "waiting_for_timer") {
      const remaining = session.budgetTimeRemaining || 0;
      buttonText = `Waiting... (${remaining}s)`;
      buttonIcon = "hourglass";
      onCallback = () => this.agentWorkflowService.cancelBrainstormGeneration();
    } else if (session.isRunning) {
      buttonText = "Thinking...";
      buttonIcon = "loader";
      onCallback = () => this.agentWorkflowService.cancelBrainstormGeneration();
    }

    return column({
      content: [
        multilineTextInput({
          placeholder: "Type an idea or click Send to brainstorm...",
          initialValue: this.inputValue,
          onChange: (val) => {
            this.inputValue = val;
          },
          onSubmit: () => !isBusy && this.handleSend(),
          style: { "min-height": "60px", "max-height": "120px" },
          disabled: isBusy,
        }),
        row({
          content: [
            button({
              text: "Clear Chat",
              callback: () => this.handleClear(),
              style: { flex: 0.3 },
              disabled: isBusy,
            }),
            button({
              text: buttonText,
              iconId: buttonIcon,
              callback: onCallback,
              disabled: false, // Always enabled so we can cancel if needed
              style: {
                flex: 0.7,
                "font-weight": "bold",
                "background-color": isBusy
                  ? "rgba(255, 100, 100, 0.2)"
                  : undefined,
              },
            }),
          ],
          style: { gap: "8px", "margin-top": "8px" },
        }),
      ],
      style: {
        padding: "8px",
        "border-top": "1px solid rgba(128,128,128, 0.2)",
        "background-color": "rgba(0,0,0,0.2)", // Slight background for input area
      },
    });
  }

  private async handleSend() {
    const session = this.agentWorkflowService.getBrainstormSession();
    if (session.isRunning || session.isQueued) return;

    const message = this.inputValue;
    this.inputValue = "";

    // Add user message immediately
    await this.agentWorkflowService.brainstormService.addUserMessage(message);

    this.updateUI();

    this.agentWorkflowService.requestBrainstormGeneration(
      !message.trim(), // isInitial if message was empty
    );
  }

  private handleClear() {
    this.dispatch((store) =>
      store.update((s) => {
        const brainstorm = s[FieldID.Brainstorm];
        if (brainstorm && brainstorm.data) {
          brainstorm.data.messages = [];
        }
      }),
    );
    api.v1.ui.toast("Brainstorm history cleared", { type: "info" });
  }
}