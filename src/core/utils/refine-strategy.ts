import type { RefineContext } from "../chat-types/types";
import { REFINE_SYSTEM_PROMPT, STYLE_REFINE_PROMPT } from "./prompts";
import { LOREBOOK_CHAIN_STOPS } from "./config";

/**
 * Per-field output budget for a refine generation.
 *
 * `maxTokens` is the cap on a single call; `maxCalls` is the total number of
 * calls the engine may spend on one refine (the first plus its continuations).
 * Keeping `maxTokens` modest and leaning on continuations is deliberate: a
 * small first call clears the output-budget bucket quickly, and the engine
 * only spends further calls when the model was actually cut off mid-answer.
 */
export interface RefineBudget {
  maxTokens: number;
  maxCalls: number;
  stop: string[];
}

// Short structured fields (attg, intent, style, contract) finish well inside
// one call; the extra calls only ever fire if the model is genuinely mid-answer.
const DEFAULT_REFINE_BUDGET: RefineBudget = {
  maxTokens: 400,
  maxCalls: 4,
  stop: ["</think>", "\n***", "\n---", "---", "]\n"],
};

const REFINE_BUDGETS: Record<string, RefineBudget> = {
  // Lorebook entries are generated at 1024 tokens, so a rewrite needs at least
  // as much headroom — 8 × 512 gives a truncated entry room to finish rather
  // than committing a sentence that stops mid-word. The chain stops are the
  // ones lorebook generation itself uses; notably they omit `]\n`, which cuts
  // prose that legitimately contains a bracketed clause.
  lorebookContent: {
    maxTokens: 512,
    maxCalls: 8,
    stop: LOREBOOK_CHAIN_STOPS,
  },
};

/** Output budget for refining `fieldId`. */
export function refineBudgetFor(fieldId: string): RefineBudget {
  return REFINE_BUDGETS[fieldId] ?? DEFAULT_REFINE_BUDGET;
}

/**
 * Builds the complete message array for a refine generation by combining
 * the field strategy's base messages with the refine instruction tail.
 *
 * Strips any trailing [USER] `[ Style: ... ]` message from baseMessages before
 * inserting the ---- boundary. In Xialong mode every field factory appends one
 * of these via appendXialongStyleMessage; left in place it sits immediately
 * above ---- and acts as a prose generation directive that overrides the
 * rewrite instructions below it. Stripping it here (inside the factory
 * closure, where the message is already present) is the only reliable fix —
 * doing it at a higher level races against Xialong-mode detection.
 *
 * Layout (after strip):
 *   [...base messages without trailing style anchor]
 *   [system] ----
 *   [system] REFINE_SYSTEM_PROMPT
 *   [system] === REFINE TARGET (<fieldId>) ===\n<currentText>\n=== END TARGET ===
 *   [user/assistant ...] history turns (system messages filtered out)
 */
export function buildRefineTail(
  baseMessages: Message[],
  refine: RefineContext,
): Message[] {
  const messages = [...baseMessages];
  const last = messages[messages.length - 1];
  if (last?.role === "user" && last.content?.startsWith("[ Style:")) {
    messages.pop();
  }
  const fieldFormatPrompt =
    refine.fieldId === "style" ? STYLE_REFINE_PROMPT : undefined;
  messages.push(
    { role: "system", content: "----" },
    { role: "system", content: REFINE_SYSTEM_PROMPT },
    ...(fieldFormatPrompt
      ? [{ role: "system" as const, content: fieldFormatPrompt }]
      : []),
    {
      role: "system",
      content: `=== REFINE TARGET (${refine.fieldId}) ===\n${refine.currentText}\n=== END TARGET ===`,
    },
  );
  for (const msg of refine.history) {
    if (msg.role === "system") continue;
    messages.push({ role: msg.role, content: msg.content });
  }
  return messages;
}
