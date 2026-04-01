/**
 * Crucible Build Strategy — Build loop pass that uses structured commands.
 * GLM emits CREATE/REVISE/LINK/DELETE/CRITIQUE/DONE commands;
 * the harness parses and executes them against world state.
 */

import {
  RootState,
  GenerationStrategy,
} from "../store/types";
import { MessageFactory } from "nai-gen-x";
import { buildCruciblePrefix } from "./context-builder";
import { formatWorldState } from "./crucible-world-formatter";
import { getModel } from "./config";

/**
 * Creates a message factory for a build pass.
 * Includes direction + tensions + formatted world state + user guidance.
 */
export const createBuildPassFactory = (
  getState: () => RootState,
  passNumber: number,
  guidance: string,
): MessageFactory => {
  return async () => {
    const buildPrompt = String(
      (await api.v1.config.get("crucible_build_pass_prompt")) || "",
    );

    const state = getState();

    const prefix = await buildCruciblePrefix(getState, {
      includeDirection: true,
      includeTensions: true,
      includeWorldState: state.crucible.elements.length > 0,
    });

    const messages: Message[] = [...prefix];

    // Shape context
    if (state.crucible.shape) {
      messages.push({
        role: "system",
        content: `SHAPE: ${state.crucible.shape.name}\n${state.crucible.shape.instruction}`,
      });
    }

    // Build pass instructions
    const userParts: string[] = [buildPrompt];

    // Pass-specific context
    if (passNumber === 1) {
      userParts.push("This is the FIRST pass. Create the essential world elements needed for the tensions above.");
    } else {
      const worldState = formatWorldState(state.crucible);
      if (worldState && !prefix.some((m) => m.content?.includes("[WORLD STATE]"))) {
        userParts.push(`CURRENT WORLD:\n${worldState}`);
      }
      userParts.push(`This is pass ${passNumber}. Refine the existing world — add what's missing, revise what's weak, connect what's isolated.`);

      // Mandatory attention list — these must be handled this pass
      const { elements, links } = state.crucible;
      const unfilled = elements.filter((el) => !el.content).map((el) => el.name);
      const elementNames = new Set(elements.map((e) => e.name.toLowerCase()));
      const missingFromLinks: string[] = [];
      for (const link of links) {
        if (!elementNames.has(link.fromName.toLowerCase())) missingFromLinks.push(link.fromName);
        if (!elementNames.has(link.toName.toLowerCase())) missingFromLinks.push(link.toName);
      }

      const requiredLines: string[] = [];
      if (unfilled.length > 0) {
        requiredLines.push(
          `REVISE these elements — they exist but have no description:\n${unfilled.map((n) => `- ${n}`).join("\n")}`,
        );
      }
      if (missingFromLinks.length > 0) {
        requiredLines.push(
          `CREATE these elements — referenced in relationships but missing (use the correct TYPE):\n${missingFromLinks.map((n) => `- ${n}`).join("\n")}`,
        );
      }
      if (requiredLines.length > 0) {
        userParts.push(`REQUIRED THIS PASS:\n${requiredLines.join("\n\n")}`);
      }
    }

    // User guidance
    if (guidance.trim()) {
      userParts.push(`USER GUIDANCE:\n${guidance.trim()}`);
    }

    messages.push(
      { role: "user", content: userParts.join("\n\n") },
      { role: "assistant", content: "[" },
    );

    return {
      messages,
      params: {
        model: await getModel(),
        max_tokens: 1024,
        temperature: 0.8,
        min_p: 0.05,
        stop: ["</think>"],
      },
    };
  };
};

export const buildBuildPassStrategy = (
  getState: () => RootState,
  passNumber: number,
  guidance: string,
): GenerationStrategy => {
  return {
    requestId: api.v1.uuid(),
    messageFactory: createBuildPassFactory(getState, passNumber, guidance),
    target: { type: "crucibleBuildPass", passNumber },
    prefillBehavior: "keep",
    assistantPrefill: "[",
    continuation: { maxCalls: 3 },
  };
};
