import type { RefineContext } from "../chat-types/types";
import { REFINE_SYSTEM_PROMPT, STYLE_REFINE_PROMPT } from "./prompts";

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
