export type CardStatus = "pending" | "accepted" | "rejected";

export interface BrainstormCard {
  id: string;
  tag: string;
  content: string;
  status: CardStatus;
  userDirective?: string; // If this card was generated following a specific directive
}

export interface BrainstormData {
  cards: BrainstormCard[];
  lastDirective?: string; // The last user instruction given
}

export class BrainstormManager {
  /**
   * Parses raw LLM output into BrainstormCards.
   * Expected format:
   * [Category] The idea content...
   * -or-
   * **Category**: The idea content...
   */
  static parseOutputToCards(rawOutput: string, startIdIndex: number = 0): BrainstormCard[] {
    const cards: BrainstormCard[] = [];
    const lines = rawOutput.split("\n");
    let currentId = startIdIndex;

    // Matches [Tag] Content or **Tag**: Content or Tag: Content
    // Group 1: Tag
    // Group 2: Content
    const startRegex = /^\s*(?:\[|\*\*)?([a-zA-Z0-9\s\-_]+)(?:\]|\*\*|:)\s*[:\-]?\s*(.*)$/;

    let currentCard: Partial<BrainstormCard> | null = null;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const match = trimmedLine.match(startRegex);
      
      // Heuristic: It's a new card if it matches the tag pattern
      // AND the tag isn't too long (avoiding false positives on normal sentences)
      if (match && match[1] && match[1].length < 30) {
        // If we have an existing card being built, save it
        if (currentCard) {
          cards.push(currentCard as BrainstormCard);
        }

        // Start new card
        currentCard = {
          id: `card-${Date.now()}-${currentId++}`,
          tag: match[1].trim(),
          content: match[2].trim(),
          status: "accepted",
        };
      } else {
        // Not a new start line
        if (currentCard) {
          // Append to existing card
          currentCard.content += " " + trimmedLine;
        } else {
          // Orphaned text at the start? Treat as generic card
          currentCard = {
            id: `card-${Date.now()}-${currentId++}`,
            tag: "Idea",
            content: trimmedLine,
            status: "accepted",
          };
        }
      }
    }

    // Push the final card
    if (currentCard) {
      cards.push(currentCard as BrainstormCard);
    }

    return cards;
  }

  /**
   * Compacts accepted cards into a structured Markdown string.
   */
  static compactCards(cards: BrainstormCard[]): string {
    const accepted = cards.filter(c => c.status === "accepted");
    if (accepted.length === 0) return "";

    // Group by tag
    const grouped = new Map<string, string[]>();
    for (const card of accepted) {
      const existing = grouped.get(card.tag) || [];
      existing.push(card.content);
      grouped.set(card.tag, existing);
    }

    let markdown = "## Brainstorm Summary\n\n";
    for (const [tag, contents] of grouped) {
      markdown += `### ${tag}\n`;
      for (const content of contents) {
        markdown += `- ${content}\n`;
      }
      markdown += "\n";
    }

    return markdown.trim();
  }
}
