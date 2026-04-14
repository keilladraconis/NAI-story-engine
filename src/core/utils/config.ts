const GLM_MODEL = "glm-4-6";
const XIALONG_MODEL = "xialong-v1";

// Stop sequences applied to all lorebook content/refine generation to prevent
// the model from chaining multiple entries in a single response.
export const LOREBOOK_CHAIN_STOPS = [
  "\nName:",       // new entry header
  "\n---",         // markdown HR (GLM common separator)
  "\n***",         // markdown HR (asterisk variant)
  "\n[ Chapter",   // chapter / section header
  "\n[Chapter",
  "\n[ Style",     // Xialong style token — switches model to prose/story mode
  "</think>",      // thinking tag leak
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

export async function isXialongMode(): Promise<boolean> {
  return Boolean(await api.v1.config.get("xialong_mode"));
}

/**
 * Read the configured model. Returns xialong-v1 when Xialong Mode is on,
 * glm-4-6 otherwise.
 */
export async function getModel(): Promise<string> {
  return (await isXialongMode()) ? XIALONG_MODEL : GLM_MODEL;
}

/**
 * Build generation params adapted for the active model.
 * When Xialong Mode is on: removes min_p, adds top_k: 250, top_p: 0.95.
 * When off: passes base params through with glm-4-6 as the model.
 */
export async function buildModelParams(
  base: Omit<GenerationParams, "model">,
): Promise<GenerationParams> {
  const useXialong = await isXialongMode();
  const model = useXialong ? XIALONG_MODEL : GLM_MODEL;
  if (useXialong) {
    const { min_p: _min_p, ...rest } = base;
    return { model, top_k: 250, top_p: 0.95, ...rest };
  }
  return { model, ...base };
}

/**
 * Append a Xialong style guidance message immediately before the assistant
 * prefill. Only adds the message when Xialong Mode is active.
 */
export async function appendXialongStyleMessage(
  messages: Message[],
  styleBlock: string,
): Promise<void> {
  if (await isXialongMode()) {
    messages.push({ role: "user", content: styleBlock });
  }
}
