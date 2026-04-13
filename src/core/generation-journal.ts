import { parseCommands } from "./utils/crucible-command-parser";
import { stripThinkingTags } from "./utils/tag-parser";

export interface JournalEntry {
  id: string;
  timestamp: number;
  label: string;
  messages: { role: string; content?: string }[];
  params: Record<string, unknown>;
  response: string;
  uncachedTokens: number;
  success: boolean;
}

let journal: JournalEntry[] = [];
let enabled = false;

/** Call once at plugin startup to enable recording. Pure in-memory — no storage. */
export function loadJournal(): void {
  enabled = true;
}

export function recordEntry(entry: JournalEntry): void {
  if (!enabled) return;
  journal.push(entry);
}

export function getJournalCount(): number {
  return journal.length;
}

export function formatJournal(): string {
  if (journal.length === 0)
    return "# Generation Journal\n\nNo entries recorded.";

  const lines: string[] = ["# Generation Journal\n"];

  for (const entry of journal) {
    const time = new Date(entry.timestamp).toISOString();
    lines.push(`## ${entry.label} (${time})`);

    const paramParts: string[] = [];
    for (const [k, v] of Object.entries(entry.params)) {
      if (k === "taskId") continue;
      paramParts.push(`${k}=${JSON.stringify(v)}`);
    }
    lines.push(`**Params:** ${paramParts.join(", ")}`);
    lines.push(`**Uncached tokens:** ${entry.uncachedTokens}`);
    lines.push(`**Success:** ${entry.success ? "yes" : "no"}`);
    lines.push("");

    lines.push("### Prompt");
    for (const msg of entry.messages) {
      const role = msg.role.toUpperCase();
      const content = msg.content || "(empty)";
      lines.push(`[${role}]`);
      lines.push(content);
      lines.push("");
    }

    lines.push("### Response");
    lines.push(entry.response || "(empty)");
    lines.push("");
    lines.push("---\n");
  }

  return lines.join("\n");
}

const SEGA_LABELS =
  /^(field:|list:|lb-content:|lb-relmap:|lb-keys:|lb-refine:|bootstrap)/;

/**
 * Extract the entity name from the assistant prefill message, if present.
 * Lorebook content/keys factories end with an assistant prefill:
 *   "Name: Elspeth Wren\nType: Character\nSetting: ..."
 * Returns the name portion, or null if not found.
 */
function extractEntityName(
  messages: { role: string; content?: string }[],
): string | null {
  const prefill = [...messages].reverse().find((m) => m.role === "assistant");
  if (!prefill?.content) return null;
  const match = prefill.content.match(/^Name:\s*(.+)/m);
  return match?.[1]?.trim() ?? null;
}

export function formatDigest(): string {
  const sega = journal.filter((e) => SEGA_LABELS.test(e.label) && e.success);
  if (sega.length === 0) return "# SEGA Digest\n\nNo SEGA entries recorded.";

  const lines: string[] = ["# SEGA Digest\n"];

  for (const entry of sega) {
    const entityName = extractEntityName(entry.messages);
    const header = entityName
      ? `## ${entry.label} — ${entityName}`
      : `## ${entry.label}`;
    lines.push(header);

    if (entry.label.startsWith("lb-content:")) {
      // Show full lorebook text: prefill + response
      const prefillMsg = [...entry.messages]
        .reverse()
        .find((m) => m.role === "assistant");
      const prefill = prefillMsg?.content ?? "";
      lines.push(prefill + entry.response);
    } else if (entry.label.startsWith("lb-keys:")) {
      // Show full keys response — let the reader see what was generated
      lines.push(entry.response);
    } else {
      lines.push(entry.response);
    }

    lines.push("");
    lines.push("---\n");
  }

  return lines.join("\n");
}

/**
 * Forge diagnostic digest — shows the raw/stripped response and what the
 * command parser extracted for each forge step. Use this to diagnose
 * "no content" rejections, multi-command responses, and think-tag leakage.
 */
export function formatForgeDigest(): string {
  const entries = journal.filter((e) => e.label.startsWith("forge:"));
  if (entries.length === 0)
    return "# Forge Digest\n\nNo forge entries recorded.";

  const lines: string[] = [`# Forge Digest (${entries.length} steps)\n`];

  for (const entry of entries) {
    lines.push(`## ${entry.label} — ${entry.success ? "ok" : "FAILED"}`);

    const raw = entry.response.trim();
    const stripped = stripThinkingTags(raw).trim();
    const hasThinking = raw.includes("<think>") || raw.includes("</think>");

    if (hasThinking) {
      lines.push("**⚠ Model used `<think>` tags**");
      lines.push("");
      lines.push("Raw (with thinking):");
      lines.push("```");
      lines.push(raw || "(empty)");
      lines.push("```");
      lines.push("");
      lines.push("Stripped (what parser sees):");
      lines.push("```");
      lines.push(stripped || "(empty after stripping)");
      lines.push("```");
    } else {
      lines.push("Response:");
      lines.push("```");
      lines.push(raw || "(empty)");
      lines.push("```");
    }
    lines.push("");

    if (stripped) {
      const commands = parseCommands(stripped);
      if (commands.length === 0) {
        lines.push("**Parser: no commands recognized**");
      } else {
        const countNote =
          commands.length > 1
            ? `**⚠ ${commands.length} commands found (expected 1):**`
            : "Parsed:";
        lines.push(countNote);
        for (const cmd of commands) {
          switch (cmd.kind) {
            case "CREATE":
              lines.push(
                cmd.content.trim()
                  ? `  ✓ CREATE ${cmd.elementType} "${cmd.name}" (${cmd.content.length} chars)`
                  : `  ✗ CREATE ${cmd.elementType} "${cmd.name}" — NO CONTENT`,
              );
              break;
            case "REVISE":
              lines.push(
                cmd.content.trim()
                  ? `  ✓ REVISE "${cmd.name}" (${cmd.content.length} chars)`
                  : `  ✗ REVISE "${cmd.name}" — NO CONTENT`,
              );
              break;
            case "DELETE":
              lines.push(`  ✓ DELETE "${cmd.name}"`);
              break;
            case "CRITIQUE":
              lines.push(`  ✓ CRITIQUE (${cmd.text.length} chars)`);
              break;
            case "DONE":
              lines.push("  ✓ DONE");
              break;
            case "LINK":
              lines.push(
                `  ✓ LINK "${cmd.fromName}" → "${cmd.toName}" (ignored by forge)`,
              );
              break;
          }
        }
      }
    }

    lines.push("");
    lines.push("---\n");
  }

  return lines.join("\n");
}

export function clearJournal(): void {
  journal = [];
}
