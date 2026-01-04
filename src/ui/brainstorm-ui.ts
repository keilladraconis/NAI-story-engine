import { BrainstormService } from "../core/brainstorm-service";
import { StoryManager } from "../core/story-manager";

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
        this.renderMessageBubble("assistant", this.streamingContent, true),
      );
    }

    // Render History (Reversed so latest is at the top of the array, which is the bottom of the UI due to column-reverse)
    const reversedHistory = [...history].reverse();
    reversedHistory.forEach((msg) => {
      messageParts.push(this.renderMessageBubble(msg.role, msg.content));
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
    isStreaming: boolean = false,
  ): UIPart {
    const isUser = role === "user";
    const bgColor = isUser
      ? "rgba(64, 156, 255, 0.2)"
      : "rgba(255, 255, 255, 0.05)";
    const align = isUser ? "flex-end" : "flex-start";
    const radius = isUser ? "12px 12px 0 12px" : "12px 12px 12px 0";

    // Format content (basic markdown support via 'markdown: true')
    const processedContent = content.replace(/\n/g, "  \n");

    return row({
      content: [
        column({
          content: [
            text({
              text: isUser ? "You" : "Assistant",
              style: {
                "font-size": "0.7em",
                opacity: 0.7,
                "margin-bottom": "2px",
              },
            }),
            text({
              text: processedContent,
              markdown: true,
              style: { "word-break": "break-word" },
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
    const generatePromise = this.brainstormService.sendChat(message, (deltaText) => {
        this.streamingContent = deltaText;
        this.updateUI();
    });

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
