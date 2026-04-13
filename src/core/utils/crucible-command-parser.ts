/**
 * Crucible Command Parser — Parses and executes structured commands emitted by GLM
 * during the build loop.
 *
 * Command vocabulary:
 *   [CREATE <TYPE> "<Name>"]       — new world element
 *   [REVISE "<Name>"]              — update existing element (content follows on next lines)
 *   [LINK "<Name>" → "<Name>"]     — explicit relationship
 *   [DELETE "<Name>"]              — remove element
 *   [CRITIQUE]                     — self-assessment (content follows on next lines)
 *   [DONE]                         — signal pass complete
 */

import { DulfsFieldID, FieldID } from "../../config/field-definitions";
import {
  RootState,
  AppDispatch,
  CrucibleWorldElement,
  CrucibleLink,
} from "../store/types";
import {
  elementCreated,
  elementRevised,
  elementDeleted,
  linkCreated,
  critiqueSet,
} from "../store/slices/crucible";

/** Map command type names to World Entry field IDs. */
export const TYPE_TO_FIELD: Record<string, DulfsFieldID> = {
  CHARACTER: FieldID.DramatisPersonae,
  LOCATION: FieldID.Locations,
  FACTION: FieldID.Factions,
  SYSTEM: FieldID.UniverseSystems,
  SITUATION: FieldID.SituationalDynamics,
  TOPIC: FieldID.Topics,
};

const VALID_TYPES = new Set(Object.keys(TYPE_TO_FIELD));

// --- Parsed Command Types ---

export interface CreateCommand {
  kind: "CREATE";
  elementType: string;
  name: string;
  content: string;
}

export interface ReviseCommand {
  kind: "REVISE";
  name: string;
  content: string;
}

export interface LinkCommand {
  kind: "LINK";
  fromName: string;
  toName: string;
  description: string;
}

export interface DeleteCommand {
  kind: "DELETE";
  name: string;
}

export interface CritiqueCommand {
  kind: "CRITIQUE";
  text: string;
}

export interface ThreadCommand {
  kind: "THREAD";
  title: string;
  memberNames: string[];
  description: string;
}

export interface DoneCommand {
  kind: "DONE";
}

export type ParsedCommand =
  | CreateCommand
  | ReviseCommand
  | LinkCommand
  | DeleteCommand
  | ThreadCommand
  | CritiqueCommand
  | DoneCommand;

// --- Parser ---

/**
 * Parses structured commands from GLM output text.
 * Lenient: skips unparseable lines rather than failing.
 */
export function parseCommands(text: string): ParsedCommand[] {
  const commands: ParsedCommand[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // [DONE]
    if (/^\[\s*DONE\s*\]$/.test(line)) {
      commands.push({ kind: "DONE" });
      continue;
    }

    // [CREATE TYPE "Name" | inline description] — forge inline format
    const createInline = line.match(
      /^\[\s*CREATE\s+([A-Z]+)\s+"([^"]+)"\s*\|\s*(.+?)\]?\s*$/,
    );
    if (createInline) {
      commands.push({
        kind: "CREATE",
        elementType: createInline[1],
        name: createInline[2].trim(),
        content: createInline[3].trim(),
      });
      continue;
    }

    // [CREATE TYPE "Name"] — classic multi-line format (Crucible)
    const createMatch = line.match(/^\[\s*CREATE\s+([A-Z]+)\s+"([^"]+)"\]/);
    if (createMatch) {
      const elementType = createMatch[1];
      const name = createMatch[2].trim();
      const inline = line.slice(createMatch[0].length).trim();
      const content = collectContent(lines, i + 1, inline);
      i += countContentLines(lines, i + 1);
      commands.push({ kind: "CREATE", elementType, name, content });
      continue;
    }

    // [REVISE "Name" | inline description] — forge inline format
    // Also handles [REVISE TYPE "Name" | desc]
    const reviseInline = line.match(
      /^\[\s*(?:REVISE|DESCRIPTION)\s+(?:[A-Z]+\s+)?"([^"]+)"\s*\|\s*(.+?)\]?\s*$/,
    );
    if (reviseInline) {
      commands.push({
        kind: "REVISE",
        name: reviseInline[1].trim(),
        content: reviseInline[2].trim(),
      });
      continue;
    }

    // [REVISE "Name"] or [REVISE TYPE "Name"] — classic multi-line format
    // Also accepts [DESCRIPTION "Name"] as an alias — GLM sometimes emits this
    // when asked to update a character description.
    const reviseMatch = line.match(
      /^\[\s*(?:REVISE|DESCRIPTION)\s+(?:[A-Z]+\s+)?"([^"]+)"\]/,
    );
    if (reviseMatch) {
      const name = reviseMatch[1].trim();
      const inline = line.slice(reviseMatch[0].length).trim();
      const content = collectContent(lines, i + 1, inline);
      i += countContentLines(lines, i + 1);
      commands.push({ kind: "REVISE", name, content });
      continue;
    }

    // [LINK "Name" → "Name"] or [LINK "Name" -> "Name"]
    const linkMatch = line.match(
      /^\[\s*LINK\s+"([^"]+)"\s*(?:→|->)\s*"([^"]+)"\]/,
    );
    if (linkMatch) {
      const fromName = linkMatch[1].trim();
      const toName = linkMatch[2].trim();
      const inline = line.slice(linkMatch[0].length).trim();
      const description = collectContent(lines, i + 1, inline);
      i += countContentLines(lines, i + 1);
      commands.push({ kind: "LINK", fromName, toName, description });
      continue;
    }

    // [DELETE "Name"]
    const deleteMatch = line.match(/^\[\s*DELETE\s+"([^"]+)"\]/);
    if (deleteMatch) {
      commands.push({ kind: "DELETE", name: deleteMatch[1].trim() });
      continue;
    }

    // [THREAD "Title" | "Name1", "Name2" | optional description]
    const threadMatch = line.match(/^\[\s*THREAD\s+"([^"]+)"\s*\|([^|]+?)\|([^\]]+?)\]?\s*$/) ??
                        line.match(/^\[\s*THREAD\s+"([^"]+)"\s*\|([^|]+?)\]?\s*$/);
    if (threadMatch) {
      const title = threadMatch[1].trim();
      const membersRaw = threadMatch[2];
      const description = (threadMatch[3] ?? "").trim();
      const memberNames: string[] = [];
      const nameRe = /"([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = nameRe.exec(membersRaw)) !== null) {
        memberNames.push(m[1].trim());
      }
      if (memberNames.length > 0) {
        commands.push({ kind: "THREAD", title, memberNames, description });
      }
      continue;
    }

    // [CRITIQUE | 2-4 sentences of self-assessment]
    const critiqueMatch = line.match(/^\[\s*CRITIQUE\s*\|\s*(.+?)\]?\s*$/);
    if (critiqueMatch) {
      commands.push({ kind: "CRITIQUE", text: critiqueMatch[1].trim() });
      continue;
    }

    // Warn about unrecognized command-like lines
    if (/^\[\s*[A-Z]/.test(line) && line.includes("]")) {
      api.v1.log(`[crucible-parser] unrecognized command: ${line}`);
    }
  }

  return commands;
}

/** Collect non-command lines following a command as its content.
 *  `inline` captures any text on the same line as the command (after the `]`).
 */
function collectContent(
  lines: string[],
  startIdx: number,
  inline = "",
): string {
  const contentLines: string[] = [];
  if (inline) contentLines.push(inline);
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (isCommandLine(line)) break;
    if (line) contentLines.push(lines[i].trimEnd());
  }
  return contentLines.join("\n").trim();
}

/** Count how many content lines follow a command. */
function countContentLines(lines: string[], startIdx: number): number {
  let count = 0;
  for (let i = startIdx; i < lines.length; i++) {
    if (isCommandLine(lines[i].trim())) break;
    count++;
  }
  return count;
}

/** Check if a line starts a new command. */
function isCommandLine(line: string): boolean {
  return /^\[\s*(CREATE|REVISE|DESCRIPTION|LINK|DELETE|THREAD|CRITIQUE|DONE)\b/.test(
    line,
  );
}

// --- Executor ---

export interface ExecuteResult {
  commandLog: string[];
  critique: string | null;
}

/**
 * Executes parsed commands against state.
 * CREATE with existing name → rejected (noted in log).
 * REVISE/DELETE with unknown name → skipped (noted in log).
 */
export function executeCommands(
  commands: ParsedCommand[],
  getState: () => RootState,
  dispatch: AppDispatch,
): ExecuteResult {
  const log: string[] = [];
  let critique: string | null = null;

  for (const cmd of commands) {
    switch (cmd.kind) {
      case "CREATE": {
        if (!VALID_TYPES.has(cmd.elementType)) {
          log.push(
            `⚠ CREATE: unknown type "${cmd.elementType}" for "${cmd.name}"`,
          );
          break;
        }
        const fieldId = TYPE_TO_FIELD[cmd.elementType];

        // Hard dedup: reject if name already exists (case-insensitive)
        const existing = getState().crucible.elements.find(
          (e) => e.name.toLowerCase() === cmd.name.toLowerCase(),
        );
        if (existing) {
          log.push(
            `⚠ CREATE rejected: "${cmd.name}" already exists as ${cmd.elementType}`,
          );
          break;
        }

        const element: CrucibleWorldElement = {
          id: api.v1.uuid(),
          fieldId,
          name: cmd.name,
          content: cmd.content,
        };
        dispatch(elementCreated({ element }));
        log.push(`✓ CREATE ${cmd.elementType} "${cmd.name}"`);
        break;
      }

      case "REVISE": {
        const el = findElementByName(getState(), cmd.name);
        if (!el) {
          log.push(`⚠ REVISE: "${cmd.name}" not found`);
          break;
        }
        dispatch(elementRevised({ id: el.id, content: cmd.content }));
        log.push(`✓ REVISE "${cmd.name}"`);
        break;
      }

      case "DELETE": {
        const el = findElementByName(getState(), cmd.name);
        if (!el) {
          log.push(`⚠ DELETE: "${cmd.name}" not found`);
          break;
        }
        dispatch(elementDeleted({ id: el.id }));
        log.push(`✓ DELETE "${cmd.name}"`);
        break;
      }

      case "LINK": {
        // Warn about unknown link endpoints — they surface in MISSING ELEMENTS on the next pass
        for (const name of [cmd.fromName, cmd.toName]) {
          if (!findElementByName(getState(), name)) {
            log.push(
              `⚠ LINK: "${name}" not found — will appear in MISSING ELEMENTS next pass`,
            );
          }
        }
        const link: CrucibleLink = {
          id: api.v1.uuid(),
          fromName: cmd.fromName,
          toName: cmd.toName,
          description: cmd.description,
        };
        dispatch(linkCreated({ link }));
        log.push(`✓ LINK "${cmd.fromName}" → "${cmd.toName}"`);
        break;
      }

      case "CRITIQUE": {
        critique = cmd.text;
        dispatch(critiqueSet({ critique: cmd.text }));
        log.push("✓ CRITIQUE recorded");
        break;
      }

      case "DONE": {
        log.push("✓ DONE");
        break;
      }
    }
  }

  return { commandLog: log, critique };
}

/** Find an element by name (case-insensitive). */
function findElementByName(
  state: RootState,
  name: string,
): CrucibleWorldElement | undefined {
  return state.crucible.elements.find(
    (e) => e.name.toLowerCase() === name.toLowerCase(),
  );
}
