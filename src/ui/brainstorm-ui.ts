import { BrainstormCard } from "../core/brainstorm-cards";
import { BrainstormService } from "../core/brainstorm-service";
import { StoryManager } from "../core/story-manager";

const { column, row, button, text, multilineTextInput } = api.v1.ui.part;

export class BrainstormUI {
  private storyManager: StoryManager;
  private brainstormService: BrainstormService;
  private onUpdate: () => void;
  
  // Local state for the UI session
  private directive: string = "";
  private isGenerating: boolean = false;
  private streamingText: string = "";

  constructor(storyManager: StoryManager, onUpdate: () => void) {
    this.storyManager = storyManager;
    this.brainstormService = new BrainstormService(storyManager);
    this.onUpdate = onUpdate;
  }

  public createUI(): UIPart {
    const fieldData = this.storyManager.getBrainstormData();
    const cards: BrainstormCard[] = fieldData.cards || [];

    return column({
      content: [
        this.createControls(cards),
        this.createCardStream(cards),
      ],
      style: { gap: "12px" }
    });
  }

  private createControls(cards: BrainstormCard[]): UIPart {
    return column({
      content: [
        // Directive Input
        multilineTextInput({
          initialValue: this.directive,
          placeholder: "Give direction (e.g., 'Focus on the magic system', 'More dark themes')...",
          onChange: (val: string) => { this.directive = val; },
          style: { height: "60px" },
        }),
        
        row({
          content: [
            button({
              text: this.isGenerating ? "Generating..." : "⚡ Burst Generate",
              callback: () => this.handleGenerate(cards),
              disabled: this.isGenerating,
            }),
            button({
              text: "🧹 Compact Stack",
              callback: () => this.handleCompact(cards),
            }),
            button({
              text: "🗑️ Clear All",
              callback: () => this.handleClear(),
            })
          ],
          style: { gap: "8px", "margin-top": "8px" }
        })
      ]
    });
  }

  private createCardStream(cards: BrainstormCard[]): UIPart {
    const cardElements = cards.map(card => this.renderCard(card));

    // If generating, show the streaming text
    if (this.isGenerating && this.streamingText) {
      cardElements.push(column({
        content: [text({ text: this.streamingText, style: { opacity: 0.7 } })],
        style: { 
          padding: "10px", 
          border: "1px dashed #666", 
          "border-radius": "4px",
          "margin-bottom": "8px" 
        }
      }));
    }

    return column({
      content: cardElements.length > 0 ? cardElements : [
        text({ text: "No ideas yet. Enter a direction and click Burst Generate!", style: { opacity: 0.5, "font-style": "italic" } })
      ],
      style: { "margin-top": "10px" }
    });
  }

  private renderCard(card: BrainstormCard): UIPart {
    // Default style (Accepted)
    let borderColor = "#4CAF50"; 
    let bgColor = "rgba(76, 175, 80, 0.1)";
    let opacity = 1.0;
    let textDecor = "none";

    if (card.status === "rejected") {
      borderColor = "#F44336";
      bgColor = "transparent";
      opacity = 0.5;
      textDecor = "line-through";
    }

    return column({
      content: [
        row({
          content: [
            // Tag Badge
            column({
              content: [text({ text: card.tag, style: { "font-size": "0.8em", "font-weight": "bold" } })],
              style: { 
                "background-color": "#333", 
                padding: "2px 6px", 
                "border-radius": "4px",
                "margin-right": "8px"
              }
            }),
            // Content
            text({ 
              text: card.content, 
              style: { 
                flex: 1, 
                "text-decoration": textDecor 
              } 
            }),
          ],
          style: { "align-items": "center", "margin-bottom": "8px" }
        }),
        // Actions
        row({
          content: [
            button({
              text: "✗",
              callback: () => this.updateCardStatus(card, "rejected"),
              style: { 
                "background-color": card.status === "rejected" ? "#F44336" : "#333",
                width: "30px"
              }
            }),
          ],
          style: { gap: "4px", "justify-content": "flex-end" }
        })
      ],
      style: {
        border: `1px solid ${borderColor}`,
        "background-color": bgColor,
        "border-radius": "4px",
        padding: "8px",
        "margin-bottom": "8px",
        opacity: opacity
      }
    });
  }

  private async handleGenerate(cards: BrainstormCard[]) {
    this.isGenerating = true;
    this.streamingText = "";
    this.onUpdate();

    try {
      const newCards = await this.brainstormService.generateBurst(
        cards, 
        this.directive, 
        (delta) => {
          this.streamingText = delta;
          this.onUpdate();
        }
      );

      // Add new cards to the existing list
      const updatedCards = [...cards, ...newCards];
      await this.saveCards(updatedCards);
    } catch (e) {
      api.v1.ui.toast("Brainstorm generation failed", { type: "error" });
      api.v1.log(e);
    } finally {
      this.isGenerating = false;
      this.streamingText = "";
      this.onUpdate();
    }
  }

  private async handleCompact(cards: BrainstormCard[]) {
    // Filter out rejected cards
    const keptCards = cards.filter(c => c.status !== "rejected");
    
    if (keptCards.length === cards.length) {
       api.v1.ui.toast("No rejected cards to clean up.", { type: "info" });
       return;
    }

    await this.saveCards(keptCards);
    api.v1.ui.toast(`Compacted stack. Removed ${cards.length - keptCards.length} rejected cards.`, { type: "success" });
  }

  private async handleClear() {
    await this.saveCards([]);
    this.onUpdate();
  }

  private async updateCardStatus(card: BrainstormCard, status: "accepted" | "rejected") {
    // Toggle: If clicking same status, revert to pending
    if (card.status === status) {
      card.status = "pending";
    } else {
      card.status = status;
    }
    
    // We need to save the whole list because we modified a mutable object inside it
    // Best practice: treat state as immutable, but for now accessing via reference
    // We don't need 'fieldData' variable here, just access the structure via storyManager
    
    await this.storyManager.saveStoryData(false); // Save without full notify if possible, but notify updates UI
    this.onUpdate();
  }

  private async saveCards(cards: BrainstormCard[]) {
    // Update StoryManager
    this.storyManager.setBrainstormCards(cards);
    await this.storyManager.saveStoryData(true);
  }
}