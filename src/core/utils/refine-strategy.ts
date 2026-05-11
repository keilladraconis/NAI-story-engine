import type { RefineContext } from "../chat-types/types";
import { REFINE_SYSTEM_PROMPT } from "./prompts";

/**
 * Builds the refine "tail" — instruction + target snapshot + chat history —
 * to be appended after a field strategy's base messages.
 *
 * Layout:
 *   [system] REFINE_SYSTEM_PROMPT
 *   [system] === REFINE TARGET (<fieldId>) ===\n<currentText>\n=== END TARGET ===
 *   [user/assistant ...] history turns (system messages filtered out)
 */
export function buildRefineTail(refine: RefineContext): Message[] {
  const tail: Message[] = [
    { role: "system", content: REFINE_SYSTEM_PROMPT },
    {
      role: "system",
      content: `=== REFINE TARGET (${refine.fieldId}) ===\n${refine.currentText}\n=== END TARGET ===`,
    },
  ];
  for (const msg of refine.history) {
    if (msg.role === "system") continue;
    tail.push({ role: msg.role, content: msg.content });
  }
  return tail;
}
