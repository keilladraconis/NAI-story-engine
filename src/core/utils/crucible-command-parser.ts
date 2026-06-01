/**
 * Forge Command Parser — Parses structured commands emitted by the Forge loop.
 *
 * Command vocabulary:
 *   [CREATE <TYPE> "<Name>" | description]        — new world element
 *   [REVISE "<Name>" | description]               — update existing element
 *   [RENAME "<Old>" → "<New>"]                    — rename an element
 *   [DELETE "<Name>"]                             — remove element
 *   [THREAD "<Title>" | "<A>", "<B>" | desc]      — group related elements
 *   [CRITIQUE | text]                             — running self-assessment
 *   [DONE]                                        — signal pass complete
 *
 *   [LINK "<From>" → "<To>"]                      — legacy Crucible link (still parsed for back-compat)
 *
 * This file only parses; execution lives with the caller (see forge handler).
 */

import { DulfsFieldID, FieldID } from "../../config/field-definitions";

/** Map command type names to World Entry field IDs. */
export const TYPE_TO_FIELD: Record<string, DulfsFieldID> = {
  CHARACTER: FieldID.DramatisPersonae,
  LOCATION: FieldID.Locations,
  FACTION: FieldID.Factions,
  SYSTEM: FieldID.UniverseSystems,
  SITUATION: FieldID.SituationalDynamics,
  TOPIC: FieldID.Topics,
};

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

export interface RenameCommand {
  kind: "RENAME";
  oldName: string;
  newName: string;
}

export interface DoneCommand {
  kind: "DONE";
}

export type ParsedCommand =
  | CreateCommand
  | ReviseCommand
  | LinkCommand
  | DeleteCommand
  | RenameCommand
  | ThreadCommand
  | CritiqueCommand
  | DoneCommand;

// --- Tokenizer ---

export type ForgeLineToken =
  | { kind: "prose"; text: string }
  | { kind: "command"; command: ParsedCommand }
  | { kind: "unrecognized"; raw: string };

/** Verbs that begin a command line (mirrors isCommandLine's verb set). */
const KNOWN_COMMAND_VERBS = new Set([
  "CREATE",
  "REVISE",
  "DESCRIPTION",
  "LINK",
  "DELETE",
  "RENAME",
  "THREAD",
  "CRITIQUE",
  "DONE",
]);

/** A line that clearly *meant* to be a command (known verb or known element
 *  type) but did not fully parse. Stray prose brackets like [she pauses] are
 *  excluded — their first word is neither a verb nor a type. */
function looksLikeIntendedCommand(line: string): boolean {
  const m = line.match(/^\[\s*([A-Za-z]+)\b/);
  if (!m) return false;
  const word = m[1].toUpperCase();
  return KNOWN_COMMAND_VERBS.has(word) || word in TYPE_TO_FIELD;
}

/**
 * Walks `text` into document-order tokens: recognized commands (consuming any
 * multiline content), intended-but-malformed command lines (`unrecognized`),
 * and everything else (`prose`, one token per line). Reuses parseCommandAt so
 * it can never drift from the parser.
 */
export function walkForgeLines(text: string): ForgeLineToken[] {
  const lines = text.split("\n");
  const tokens: ForgeLineToken[] = [];
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseCommandAt(lines, i);
    if (parsed) {
      tokens.push({ kind: "command", command: parsed.command });
      i += parsed.consumed;
      continue;
    }
    const line = lines[i].trim();
    if (looksLikeIntendedCommand(line)) {
      tokens.push({ kind: "unrecognized", raw: line });
    } else {
      tokens.push({ kind: "prose", text: lines[i] });
    }
  }
  return tokens;
}

// --- Parser ---

interface ParsedCommandAt {
  command: ParsedCommand;
  /** Extra lines consumed beyond the start line (multiline content). */
  consumed: number;
}

/** Parse the command starting at lines[i], or null if that line is not a
 *  command. Returns how many *following* lines were consumed as content. */
function parseCommandAt(lines: string[], i: number): ParsedCommandAt | null {
  const line = lines[i].trim();

  if (/^\[\s*DONE\s*\]$/.test(line)) {
    return { command: { kind: "DONE" }, consumed: 0 };
  }

  const createInline = line.match(
    /^\[\s*CREATE\s+([A-Z]+)\s+"([^"]+)"\s*\|\s*(.+?)\]?\s*$/,
  );
  if (createInline) {
    return {
      command: {
        kind: "CREATE",
        elementType: createInline[1],
        name: createInline[2].trim(),
        content: createInline[3].trim(),
      },
      consumed: 0,
    };
  }

  const createMatch = line.match(/^\[\s*CREATE\s+([A-Z]+)\s+"([^"]+)"\]/);
  if (createMatch) {
    const inline = line.slice(createMatch[0].length).trim();
    return {
      command: {
        kind: "CREATE",
        elementType: createMatch[1],
        name: createMatch[2].trim(),
        content: collectContent(lines, i + 1, inline),
      },
      consumed: countContentLines(lines, i + 1),
    };
  }

  const reviseInline = line.match(
    /^\[\s*(?:REVISE|DESCRIPTION)\s+(?:[A-Z]+\s+)?"([^"]+)"\s*\|\s*(.+?)\]?\s*$/,
  );
  if (reviseInline) {
    return {
      command: {
        kind: "REVISE",
        name: reviseInline[1].trim(),
        content: reviseInline[2].trim(),
      },
      consumed: 0,
    };
  }

  const reviseMatch = line.match(
    /^\[\s*(?:REVISE|DESCRIPTION)\s+(?:[A-Z]+\s+)?"([^"]+)"\]/,
  );
  if (reviseMatch) {
    const inline = line.slice(reviseMatch[0].length).trim();
    return {
      command: {
        kind: "REVISE",
        name: reviseMatch[1].trim(),
        content: collectContent(lines, i + 1, inline),
      },
      consumed: countContentLines(lines, i + 1),
    };
  }

  const linkMatch = line.match(
    /^\[\s*LINK\s+"([^"]+)"\s*(?:→|->)\s*"([^"]+)"\]/,
  );
  if (linkMatch) {
    const inline = line.slice(linkMatch[0].length).trim();
    return {
      command: {
        kind: "LINK",
        fromName: linkMatch[1].trim(),
        toName: linkMatch[2].trim(),
        description: collectContent(lines, i + 1, inline),
      },
      consumed: countContentLines(lines, i + 1),
    };
  }

  const deleteMatch = line.match(/^\[\s*DELETE\s+"([^"]+)"\]/);
  if (deleteMatch) {
    return {
      command: { kind: "DELETE", name: deleteMatch[1].trim() },
      consumed: 0,
    };
  }

  const renameMatch = line.match(
    /^\[\s*RENAME\s+"([^"]+)"\s*(?:→|->)\s*"([^"]+)"\]/,
  );
  if (renameMatch) {
    return {
      command: {
        kind: "RENAME",
        oldName: renameMatch[1].trim(),
        newName: renameMatch[2].trim(),
      },
      consumed: 0,
    };
  }

  const threadMatch =
    line.match(/^\[\s*THREAD\s+"([^"]+)"\s*\|([^|]+?)\|([^\]]+?)\]?\s*$/) ??
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
      return {
        command: { kind: "THREAD", title, memberNames, description },
        consumed: 0,
      };
    }
  }

  const critiqueMatch = line.match(/^\[\s*CRITIQUE\s*\|\s*(.+?)\]?\s*$/);
  if (critiqueMatch) {
    return {
      command: { kind: "CRITIQUE", text: critiqueMatch[1].trim() },
      consumed: 0,
    };
  }

  // Lenient: a bare element type with no CREATE keyword, with or without a
  // colon — the forge frequently emits [SYSTEM: "Name" | desc] instead of
  // [CREATE SYSTEM "Name" | desc]. Gated on the known element types.
  const bareInline = line.match(
    /^\[\s*([A-Za-z]+)\s*:?\s+"([^"]+)"\s*\|\s*(.+?)\]?\s*$/,
  );
  if (bareInline && bareInline[1].toUpperCase() in TYPE_TO_FIELD) {
    return {
      command: {
        kind: "CREATE",
        elementType: bareInline[1].toUpperCase(),
        name: bareInline[2].trim(),
        content: bareInline[3].trim(),
      },
      consumed: 0,
    };
  }

  const bareMulti = line.match(/^\[\s*([A-Za-z]+)\s*:?\s+"([^"]+)"\]/);
  if (bareMulti && bareMulti[1].toUpperCase() in TYPE_TO_FIELD) {
    const inline = line.slice(bareMulti[0].length).trim();
    return {
      command: {
        kind: "CREATE",
        elementType: bareMulti[1].toUpperCase(),
        name: bareMulti[2].trim(),
        content: collectContent(lines, i + 1, inline),
      },
      consumed: countContentLines(lines, i + 1),
    };
  }

  return null;
}

/**
 * Parses structured commands from forge output text. Lenient: non-command
 * lines are skipped. Delegates to walkForgeLines so there is one shared walk.
 */
export function parseCommands(text: string): ParsedCommand[] {
  return walkForgeLines(text)
    .filter(
      (t): t is Extract<ForgeLineToken, { kind: "command" }> =>
        t.kind === "command",
    )
    .map((t) => t.command);
}

/** Render a parsed command back to its canonical single-line form. */
export function serializeForgeCommand(cmd: ParsedCommand): string {
  switch (cmd.kind) {
    case "CREATE":
      return `[CREATE ${cmd.elementType.toUpperCase()} "${cmd.name}" | ${cmd.content}]`;
    case "REVISE":
      return `[REVISE "${cmd.name}" | ${cmd.content}]`;
    case "DELETE":
      return `[DELETE "${cmd.name}"]`;
    case "RENAME":
      return `[RENAME "${cmd.oldName}" → "${cmd.newName}"]`;
    case "THREAD": {
      const members = cmd.memberNames.map((n) => `"${n}"`).join(", ");
      return cmd.description
        ? `[THREAD "${cmd.title}" | ${members} | ${cmd.description}]`
        : `[THREAD "${cmd.title}" | ${members}]`;
    }
    case "CRITIQUE":
      return `[CRITIQUE | ${cmd.text}]`;
    case "LINK":
      return `[LINK "${cmd.fromName}" → "${cmd.toName}" | ${cmd.description}]`;
    case "DONE":
      return "[DONE]";
  }
}

/**
 * Rewrites every recognized command in `text` to canonical form, in place,
 * folding multiline bodies into the inline form and leaving prose and
 * unrecognized brackets untouched. Idempotent on canonical input. Reuses
 * parseCommandAt so it can never drift from parseCommands.
 */
export function canonicalizeForgeCommands(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseCommandAt(lines, i);
    if (parsed) {
      out.push(serializeForgeCommand(parsed.command));
      i += parsed.consumed;
    } else {
      out.push(lines[i]);
    }
  }
  return out.join("\n");
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
  if (
    /^\[\s*(CREATE|REVISE|DESCRIPTION|LINK|DELETE|RENAME|THREAD|CRITIQUE|DONE)\b/.test(
      line,
    )
  ) {
    return true;
  }
  // Bare TYPE-led command (e.g. [SYSTEM: "Name" …]) — a known type + quoted name.
  const bare = line.match(/^\[\s*([A-Za-z]+)\s*:?\s+"/);
  return !!bare && bare[1].toUpperCase() in TYPE_TO_FIELD;
}

/**
 * Removes whole-line forge action commands from a message for display, leaving
 * conversational prose. Operates on the single-line command grammar the forge
 * emits; the stored message is unchanged, so parseCommands / extractLastCritique
 * still read the full text.
 */
export function stripForgeCommands(text: string): string {
  return text
    .split("\n")
    .filter((line) => !isCommandLine(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
