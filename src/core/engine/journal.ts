// Generation Journal: an in-memory record of every GLM call, for reviewing
// prompts. Enabled by the `generation_journal` config; never stored.

export interface JournalEntry {
  label: string;
  timestamp: number;
  messages: { role: string; content?: string }[];
  params: Record<string, unknown>;
  response: string;
  success: boolean;
}

let journal: JournalEntry[] = [];
let enabled = false;

export function enableJournal(): void {
  enabled = true;
}

export function recordEntry(entry: JournalEntry): void {
  if (enabled) journal.push(entry);
}

export function journalCount(): number {
  return journal.length;
}

export function clearJournal(): void {
  journal = [];
}

export function formatJournal(): string {
  if (journal.length === 0)
    return "# Generation Journal\n\nNo entries recorded.";
  const lines = ["# Generation Journal\n"];
  for (const entry of journal) {
    lines.push(
      `## ${entry.label} (${new Date(entry.timestamp).toISOString()})`,
    );
    const params = Object.entries(entry.params)
      .filter(([k]) => k !== "taskId")
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
    lines.push(`**Params:** ${params.join(", ")}`);
    lines.push(`**Success:** ${entry.success ? "yes" : "no"}\n`);
    lines.push("### Prompt");
    for (const m of entry.messages) {
      lines.push(`[${m.role.toUpperCase()}]`, m.content || "(empty)", "");
    }
    lines.push("### Response", entry.response || "(empty)", "", "---\n");
  }
  return lines.join("\n");
}
