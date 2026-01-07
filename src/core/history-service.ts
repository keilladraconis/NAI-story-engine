import { StoryDataManager } from "./story-data-manager";
import { FieldID } from "../config/field-definitions";
import { FieldHistory } from "./field-history";

export class HistoryService {
  constructor(private dataManager: StoryDataManager) {}

  public async commit(): Promise<boolean> {
    const data = this.dataManager.data;
    if (!data) return false;

    let changed = false;

    const textFields = [
      data[FieldID.StoryPrompt],
      data[FieldID.Brainstorm],
      data[FieldID.WorldSnapshot],
      data[FieldID.ATTG],
      data[FieldID.Style],
    ];

    for (const field of textFields) {
      const lastEntry = field.history.length > 0 ? field.history[field.history.length - 1] : null;

      if ((!lastEntry && field.content.trim() !== "") || (lastEntry && lastEntry.content !== field.content)) {
        const newVersion = field.version + 1;
        const historyEntry: FieldHistory = {
          id: api.v1.uuid(),
          timestamp: new Date(),
          version: newVersion,
          content: field.content,
          source: "commit",
        };

        field.history.push(historyEntry);
        field.version = newVersion;
        changed = true;
      }
    }

    if (changed) {
      data.lastModified = new Date();
      await this.dataManager.save();
      return true;
    }
    return false;
  }
}
