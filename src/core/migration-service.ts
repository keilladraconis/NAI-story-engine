import { StoryData } from "./story-data-manager";
import { FieldID } from "../config/field-definitions";

export class MigrationService {
  public migrate(data: any): StoryData {
    const migrated = { ...data };

    // Migration: Ensure dulfsCategoryIds exists
    if (!migrated.dulfsCategoryIds) {
      migrated.dulfsCategoryIds = {};
      // Transfer old single category if it exists
      if (migrated.dulfsCategoryId) {
        delete migrated.dulfsCategoryId;
      }
    }

    // Migration: Ensure dulfsEnabled exists
    if (!migrated.dulfsEnabled) {
      migrated.dulfsEnabled = {};
    }

    // Migration: Ensure ATTG and Style fields exist
    if (!migrated[FieldID.ATTG]) {
      migrated[FieldID.ATTG] = {
        id: FieldID.ATTG,
        type: "attg",
        content: "",
        version: 0,
        history: [],
        linkedEntities: [],
      };
    }
    if (!migrated[FieldID.Style]) {
      migrated[FieldID.Style] = {
        id: FieldID.Style,
        type: "style",
        content: "",
        version: 0,
        history: [],
        linkedEntities: [],
      };
    }

    // Migration: Generator Sync
    if (typeof migrated.attgEnabled === "undefined") {
      migrated.attgEnabled = false;
    }
    if (typeof migrated.styleEnabled === "undefined") {
      migrated.styleEnabled = false;
    }

    return migrated as StoryData;
  }
}
