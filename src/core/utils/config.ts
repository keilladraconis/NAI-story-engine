import { readEngineSettings } from "../engine/settings";

export const GLM_MODEL = "glm-4-6";
export const XIALONG_MODEL = "xialong-v1";

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

/** The models a creative generation may run on.
 *
 *  Two, because these are the two `api.v1.generate()` accepts — it is a
 *  chat-completion API, and NovelAI's prose models (Erato, Kayra, Clio) are not
 *  reachable through it. The list is the shape it is so that a third entry is a
 *  list entry and nothing else: the picker renders it, `normalizeCreativeModel`
 *  validates against it, and no callsite names a model directly.
 *
 *  `note` is what the picker shows under a choice a writer may not be able to
 *  make. There is no API that reports which models a subscription covers, so the
 *  UI cannot grey Xialong out for a writer without Opus — it can only say so. */
export const CREATIVE_MODELS = [
  {
    id: GLM_MODEL,
    label: "GLM 4.6",
    note: "Available to everyone. Follows instructions closely.",
  },
  {
    id: XIALONG_MODEL,
    label: "Xialong v1",
    note: "A creative-writing fine-tune of GLM. Requires an Opus subscription.",
  },
] as const;

export type CreativeModel = (typeof CREATIVE_MODELS)[number]["id"];

/** True when this story's creative work runs on Xialong — which is a question
 *  about message shaping, not only about params. Xialong takes a `[ Style: ... ]`
 *  block and emits `<think>` tags; GLM does neither, and handing it Xialong's
 *  scaffolding is how a callsite ends up prompting one model in another's
 *  dialect. */
export async function isXialongMode(): Promise<boolean> {
  const { creativeModel } = await readEngineSettings();
  return creativeModel === XIALONG_MODEL;
}

/** What a generation needs from a model.
 *
 *  `glm-4-6` follows instructions markedly more reliably; `xialong-v1` is a
 *  creative-writing fine-tune of it. Splitting the two means the creative-model
 *  choice says what it always meant — use it for prose — rather than "use it for
 *  literally every call, including comma-separated key lists". Extraction work
 *  goes to GLM whatever the writer picked.
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
  if (capability !== "creative") return { model: GLM_MODEL, xialong: false };
  const { creativeModel } = await readEngineSettings();
  return {
    model: creativeModel,
    xialong: creativeModel === XIALONG_MODEL,
  };
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
