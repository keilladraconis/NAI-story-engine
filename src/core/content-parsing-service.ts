import { FIELD_CONFIGS, FieldID } from "../config/field-definitions";

export interface ParsedListItem {
  name: string;
  description: string;
  content: string;
}

export class ContentParsingService {
  /**
   * Parses a single line of text into a structured list item based on the field configuration.
   * Handles stripping of markdown list markers and applies field-specific regex.
   */
  public parseListLine(line: string, fieldId: string): ParsedListItem | null {
    let clean = line.trim();

    // Strip list markers because models are stubborn
    clean = clean.replace(/^[-*+]\s+/, "");
    clean = clean.replace(/^\d+[\.)]\s+/, "");

    const config = FIELD_CONFIGS.find((c) => c.id === fieldId);

    if (fieldId === FieldID.DramatisPersonae) {
      const dpRegex =
        config?.parsingRegex ||
        /^([^:(]+)\s*\(([^,]+),\s*([^,]+),\s*([^)]+)\):\s*(.+)$/;
      const match = clean.match(dpRegex);
      if (match) {
        return {
          name: match[1].trim(),
          description: match[5].trim(),
          content: clean,
        };
      }
    } else {
      const genericRegex = config?.parsingRegex || /^([^:]+):\s*(.+)$/;
      const match = clean.match(genericRegex);
      if (match) {
        return {
          name: match[1].trim(),
          description: match[2].trim(),
          content: clean,
        };
      }
    }

    return null;
  }
}
