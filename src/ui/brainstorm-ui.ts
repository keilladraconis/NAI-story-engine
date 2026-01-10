import { BrainstormService } from "../core/brainstorm-service";
import { StoryManager } from "../core/story-manager";
import { calculateTextAreaHeight } from "./ui-components";

const { column, row, button, text, multilineTextInput } = api.v1.ui.part;
const { sidebarPanel } = api.v1.ui.extension;

export class BrainstormUI {
  private static readonly KEYS = {
    SIDEBAR_ID: "kse-brainstorm-sidebar",
  };

  public sidebar: UIExtensionSidebarPanel;
  private storyManager: StoryManager;
  private brainstormService: BrainstormService;

  // Local State
  private inputValue: string = "";
  private isGenerating: boolean = false;
  private streamingContent: string = "";
  private editingIndex: number | null = null;
  private editValue: string = "";

  constructor(storyManager: StoryManager) {
    this.storyManager = storyManager;
    this.brainstormService = new BrainstormService(storyManager);

    this.sidebar = this.createSidebar();

    // Subscribe to story manager updates to refresh chat history
    this.storyManager.subscribe(() => {
      // Only refresh if we are not currently generating (streaming handles its own updates)
      if (!this.isGenerating) {
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
      iconId: "cloud-lightning", // Using a relevant icon
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
    const messageParts: UIPart[] = [];

    // Render Streaming Message (if any) - goes at the very bottom (first in reversed list)
    if (this.isGenerating && this.streamingContent) {
      messageParts.push(
        this.renderMessageBubble("assistant", this.streamingContent, -1, true),
      );
    }

    // Render History (Reversed so latest is at the top of the array, which is the bottom of the UI due to column-reverse)
    // We need to map original indices to the reversed items
    const reversedHistory = history
      .map((msg, idx) => ({ ...msg, idx }))
      .reverse();

    reversedHistory.forEach((msg) => {
      messageParts.push(
        this.renderMessageBubble(msg.role, msg.content, msg.idx),
      );
    });

    if (messageParts.length === 0) {
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

    const actionButtons: UIPart[] = [];
    if (!isStreaming) {
      // Edit Button
      actionButtons.push(
        button({
          iconId: "edit-3",
          callback: () => this.handleEdit(index, content),
          style: {
            width: "24px",
            height: "24px",
            padding: "2px",
            "background-color": "transparent",
            opacity: 0.5,
          },
        }),
      );

      // Retry Button (Assistant only, or User to regenerate response)
      // "Retry" on User message -> Truncate future, regen response to this.
      // "Retry" on Assistant message -> Truncate this + future, regen response to previous.
      actionButtons.push(
        button({
          iconId: "refresh-cw",
          callback: () => this.handleRetry(index),
          style: {
            width: "24px",
            height: "24px",
            padding: "2px",
            "background-color": "transparent",
            opacity: 0.5,
          },
        }),
      );

      // Delete Button
      actionButtons.push(
        button({
          iconId: "trash-2",
          callback: () => this.handleDelete(index),
          style: {
            width: "24px",
            height: "24px",
            padding: "2px",
            "background-color": "transparent",
            opacity: 0.5,
            color: "rgba(255, 100, 100, 0.8)",
          },
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
                // Actions Row (Top Right)
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
      await this.brainstormService.editMessage(
        this.editingIndex,
        this.editValue,
      );
      this.editingIndex = null;
      this.editValue = "";
      this.updateUI();
    }
  }

  private async handleDelete(index: number) {
    // Direct delete without confirmation for now as api.v1.ui.confirm is not available
    await this.brainstormService.deleteMessage(index);
    this.updateUI();
  }

  private async handleRetry(index: number) {
    if (this.isGenerating) return;

    // Direct retry without confirmation
    this.isGenerating = true;
    this.streamingContent = "";

    // Optimistic UI update handled by service truncating history,
    // but we need to start showing the spinner/streaming bubble.
    // The service.retryMessage will truncate -> save -> we see history update.
    // Then it starts generating -> onDelta -> we see streaming bubble.

    const retryPromise = this.brainstormService.retryMessage(index, (delta) => {
      this.streamingContent = delta;
      this.updateUI();
    });

    this.updateUI();

    try {
      await retryPromise;
    } catch (e) {
      api.v1.ui.toast("Failed to regenerate", { type: "error" });
    } finally {
      this.isGenerating = false;
      this.streamingContent = "";
      this.updateUI();
    }
  }

  private createInputArea(): UIPart {
    return column({
      content: [
        multilineTextInput({
          placeholder: "Type an idea or click Send to brainstorm...",
          initialValue: this.inputValue,
          onChange: (val) => {
            this.inputValue = val;
          },
          onSubmit: () => this.handleSend(),
          style: { "min-height": "60px", "max-height": "120px" },
        }),
        row({
          content: [
            button({
              text: "Clear Chat",
              callback: () => this.handleClear(),
              style: { flex: 0.3 },
            }),
            button({
              text: this.isGenerating ? "Thinking..." : "Send",
              iconId: "send",
              callback: () => this.handleSend(),
              disabled: this.isGenerating,
              style: { flex: 0.7, "font-weight": "bold" },
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
    const message = this.inputValue;
    this.inputValue = ""; // Clear input immediately
    this.isGenerating = true;
    this.streamingContent = ""; // Start with empty, or "..."

    // Start generation (which adds user message to history immediately)
    const generatePromise = this.brainstormService.sendChat(
      message,
      (deltaText) => {
        this.streamingContent = deltaText;
        this.updateUI();
      },
    );

    // Immediate update to show the new user message (now in history)
    this.updateUI();

    try {
      await generatePromise;
    } catch (e) {
      api.v1.ui.toast("Failed to generate response", { type: "error" });
    } finally {
      this.isGenerating = false;
      this.streamingContent = "";
      this.updateUI(); // Final update
    }
  }

  private async handleClear() {
    await this.brainstormService.clearHistory();
    api.v1.ui.toast("Brainstorm history cleared", { type: "info" });
    this.updateUI();
  }
}
