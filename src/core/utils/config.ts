const GLM_MODEL = "glm-4-6";
const XIALONG_MODEL = "xialong-v1";

// Stop sequences applied to all lorebook content/refine generation to prevent
// the model from chaining multiple entries in a single response.
export const LOREBOOK_CHAIN_STOPS = [
  "\nName:", // new entry header
  "\n---", // markdown HR (GLM common separator)
  "---", // bare HR — appears without leading newline at end of output
  "\n***", // markdown HR (asterisk variant)
  "\n[ Chapter", // chapter / section header
  "\n[Chapter",
  "\n[ Style", // Xialong style token — switches model to prose/story mode
  "</think>", // thinking tag leak
];

/**
 * Trim any full or partial stop sequence from the tail of generated text.
 * When a stop fires mid-token the fragment lands in accumulatedText — this
 * removes it. Only trims prefixes of length >= 2 to avoid eating lone newlines.
 */
export function trimStopTail(text: string, stops: string[]): string {
  for (const stop of stops) {
    for (let len = stop.length; len >= 2; len--) {
      const prefix = stop.slice(0, len);
      if (text.endsWith(prefix)) {
        return text.slice(0, text.length - prefix.length);
      }
    }
  }
  return text;
}

/** True when the sampler stopped because it ran out of room rather than because
 *  the model finished. The two spellings are both observed in the wild, so the
 *  question is asked in one place — every caller that has to decide "is this
 *  text cut off" reads the same answer. */
export function isTruncated(finishReason: string | undefined): boolean {
  return finishReason === "length" || finishReason === "max_tokens";
}

/** Prepend the erato "----\n" divider to non-empty content when erato mode is on
 *  and it isn't already prefixed.
 *
 *  Lives here rather than beside one of its callers because three of them are
 *  now unrelated — the entity edit pane's Save, the lorebook completion handler,
 *  and the Engine's own entry rewrite — and an entry that loses its divider
 *  because one of them forgot is a silent formatting regression for exactly the
 *  writers who turned the setting on. */
export function applyEratoPrefix(content: string, erato: boolean): string {
  if (content && erato && !content.startsWith("----\n"))
    return "----\n" + content;
  return content;
}

export async function isXialongMode(): Promise<boolean> {
  return Boolean(await api.v1.config.get("xialong_mode"));
}

/** What a generation needs from a model.
 *
 *  `glm-4-6` follows instructions markedly more reliably; `xialong-v1` is a
 *  creative-writing fine-tune of it. Splitting the two means `xialong_mode`
 *  finally says what it always meant — use Xialong for prose — rather than
 *  "use Xialong for literally every call, including comma-separated key lists".
 *
 *  Everything defaults to "creative", so a callsite that does not care keeps
 *  exactly the behaviour it had before this existed. */
export type Capability = "creative" | "instruct";

/**
 * The single answer to "which model, and is it Xialong". Everything that varies
 * by model resolves here — params AND message shaping — so a callsite cannot
 * end up on GLM while still being handed Xialong style guidance.
 */
export async function resolveModel(
  capability: Capability = "creative",
): Promise<{ model: string; xialong: boolean }> {
  const xialong = capability === "creative" && (await isXialongMode());
  return { model: xialong ? XIALONG_MODEL : GLM_MODEL, xialong };
}

/**
 * Build generation params for the active model and capability.
 * Xialong (creative only): removes min_p, adds top_k: 250, top_p: 0.95.
 * Otherwise passes base params through with glm-4-6.
 */
export async function buildModelParams(
  base: Omit<GenerationParams, "model">,
  capability: Capability = "creative",
): Promise<GenerationParams> {
  const { model, xialong } = await resolveModel(capability);
  if (xialong) {
    const { min_p: _min_p, ...rest } = base;
    return { model, top_k: 250, top_p: 0.95, ...rest };
  }
  return { model, ...base };
}

/**
 * Append a Xialong style guidance message immediately before the assistant
 * prefill — only when this call is actually going to Xialong. An instruct call
 * never gets one, whatever xialong_mode says.
 */
export async function appendXialongStyleMessage(
  messages: Message[],
  styleBlock: string,
  capability: Capability = "creative",
): Promise<void> {
  const { xialong } = await resolveModel(capability);
  if (xialong) {
    messages.push({ role: "user", content: styleBlock });
  }
}
