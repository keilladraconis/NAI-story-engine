const STORAGE_KEY = "kse-gen-journal";

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

export async function loadJournal(): Promise<void> {
  const stored = await api.v1.storyStorage.get(STORAGE_KEY);
  journal = Array.isArray(stored) ? stored : [];
}

export async function recordEntry(entry: JournalEntry): Promise<void> {
  journal.push(entry);
  await api.v1.storyStorage.set(STORAGE_KEY, journal);
}

export function getJournalCount(): number {
  return journal.length;
}

export function formatJournal(): string {
  if (journal.length === 0) return "# Generation Journal\n\nNo entries recorded.";

  const lines: string[] = ["# Generation Journal\n"];

  for (const entry of journal) {
    const time = new Date(entry.timestamp).toISOString();
    lines.push(`## ${entry.label} (${time})`);

    // Params — show key generation settings
    const paramParts: string[] = [];
    for (const [k, v] of Object.entries(entry.params)) {
      if (k === "taskId") continue;
      paramParts.push(`${k}=${JSON.stringify(v)}`);
    }
    lines.push(`**Params:** ${paramParts.join(", ")}`);
    lines.push(`**Uncached tokens:** ${entry.uncachedTokens}`);
    lines.push(`**Success:** ${entry.success ? "yes" : "no"}`);
    lines.push("");

    // Prompt
    lines.push("### Prompt");
    for (const msg of entry.messages) {
      const role = msg.role.toUpperCase();
      const content = msg.content || "(empty)";
      lines.push(`[${role}]`);
      lines.push(content);
      lines.push("");
    }

    // Response
    lines.push("### Response");
    lines.push(entry.response || "(empty)");
    lines.push("");
    lines.push("---\n");
  }

  return lines.join("\n");
}

const SEGA_LABELS = /^(field:|list:|lb-content:|lb-relmap:|lb-keys:|lb-refine:|bootstrap)/;

export function formatDigest(): string {
  const sega = journal.filter((e) => SEGA_LABELS.test(e.label) && e.success);
  if (sega.length === 0) return "# SEGA Digest\n\nNo SEGA entries recorded.";

  const lines: string[] = ["# SEGA Digest\n"];

  for (const entry of sega) {
    lines.push(`## ${entry.label}`);

    if (entry.label.startsWith("lb-keys:")) {
      // Keys: just show the key line
      const keysMatch = entry.response.match(/KEYS:\s*(.+)/);
      if (keysMatch) {
        lines.push(keysMatch[1].trim());
      } else {
        lines.push(entry.response);
      }
    } else if (entry.label.startsWith("lb-relmap:")) {
      lines.push(entry.response);
    } else {
      lines.push(entry.response);
    }

    lines.push("");
    lines.push("---\n");
  }

  return lines.join("\n");
}

export async function clearJournal(): Promise<void> {
  journal = [];
  await api.v1.storyStorage.set(STORAGE_KEY, journal);
}
