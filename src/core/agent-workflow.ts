import { StoryManager } from "./story-manager";
import { FieldSession } from "./agent-cycle";
import { hyperGenerate } from "../hyper-generator";
import { ContextStrategyFactory } from "./context-strategies";

export class AgentWorkflowService {
  private contextFactory: ContextStrategyFactory;

  constructor(private storyManager: StoryManager) {
    this.contextFactory = new ContextStrategyFactory(storyManager);
  }

  public async runAutoGeneration(
    session: FieldSession,
    updateFn: () => void,
  ): Promise<void> {
    const stages: ("generate" | "review" | "refine")[] = [
      "generate",
      "review",
      "refine",
    ];
    const startIndex = stages.indexOf(session.selectedStage);

    // Iterate from current stage to the end
    for (let i = startIndex; i < stages.length; i++) {
      // If cancelled during auto-run, stop
      if (session.cancellationSignal && session.cancellationSignal.cancelled) {
        break;
      }

      session.selectedStage = stages[i];
      updateFn(); // Switch tab

      const success = await this.runStageGeneration(session, updateFn);
      if (!success) {
        session.isAuto = false;
        updateFn();
        break;
      }

      // Small pause between stages for visual clarity
      if (i < stages.length - 1) {
        await api.v1.timers.sleep(500);
      }
    }

    // Automatically disable auto after completion
    session.isAuto = false;
    updateFn();
  }

  public async runStageGeneration(
    session: FieldSession,
    updateFn: () => void,
  ): Promise<boolean> {
    const stage = session.selectedStage;
    session.cycles[stage].status = "running";
    session.cycles[stage].content = ""; // Clear previous content

    // Only clear currentContent if we are going to write to it (replace)
    if (stage !== "review") {
      session.currentContent = "";
    }

    // Review streaming state
    let reviewBuffer = "";

    // Strip existing tags if starting a review
    if (stage === "review") {
      const tagRegex = /\[[A-Z_]+\] /g;
      if (tagRegex.test(session.currentContent)) {
        api.v1.log("[AgentWorkflow] Stripping existing tags before Review.");
        session.currentContent = session.currentContent.replace(tagRegex, "");
        this.storyManager.saveFieldDraft(
          session.fieldId,
          session.currentContent,
        );
        updateFn();
      }
    }

    const processReviewLine = (line: string) => {
      const trimmed = line.trim();
      const match = trimmed.match(
        /^(\*\*)?\[([A-Z_]+)\](\*\*)?\s*\|\|\s*"(.*)"$/,
      );
      if (match) {
        const tag = match[2];
        const rawLocator = match[4];

        api.v1.log(`[Review Patcher] Processing: [${tag}] || "${rawLocator}"`);

        // Strategy: Prefix Match with Fuzzy Punctuation
        // 1. Split locator into tokens
        const tokens = rawLocator.trim().split(/\s+/);
        if (tokens.length === 0) return;

        // 2. Take first 5 words
        const searchTokens = tokens.slice(0, 5);

        // 3. Create pattern parts
        const regexParts = searchTokens.map((token) => {
          // Replace any non-alphanumeric character with '.' (wildcard)
          return token
            .split("")
            .map((char) => (/\w/.test(char) ? char : "."))
            .join("");
        });

        // 4. Join with fuzzy separator (allowing whitespace, markdown, punctuation)
        const pattern = regexParts.join("[\\W\\s]+");
        api.v1.log(`[Review Patcher] Prefix Pattern: ${pattern}`);

        try {
          const regex = new RegExp(pattern, "i"); // Case insensitive

          // Search from the top (allows out-of-order matching)
          const searchMatch = regex.exec(session.currentContent);

          if (searchMatch) {
            const matchedText = searchMatch[0];
            const absoluteIdx = searchMatch.index;

            api.v1.log(
              `[Review Patcher] Found match: "${matchedText.substring(0, 20)}..." at index ${absoluteIdx}`,
            );

            const tagInsert = `[${tag}] `;
            session.currentContent =
              session.currentContent.slice(0, absoluteIdx) +
              tagInsert +
              session.currentContent.slice(absoluteIdx);
          } else {
            api.v1.log(
              `[Review Patcher] Failed to find locator: "${rawLocator}"`,
            );
          }
        } catch (e) {
          api.v1.log(`[Review Patcher] Regex Error: ${e}`);
        }
      }
    };

    // @ts-ignore
    session.cancellationSignal = await api.v1.createCancellationSignal();
    updateFn();

    try {
      const { messages, params } = await this.contextFactory.build(session);

      // 3. Generate
      if (!session.cancellationSignal)
        throw new Error("Failed to create cancellation signal");

      let result = await hyperGenerate(
        messages,
        {
          maxTokens: 2048,
          minTokens: 50,
          ...params,
          onBudgetWait: (_1, _2, time) => {
            session.budgetState = "waiting_for_user";
            session.budgetWaitTime = time;
            updateFn();
            return new Promise<void>((resolve) => {
              session.budgetResolver = resolve;
            });
          },
          onBudgetResume: () => {
            session.budgetState = "normal";
            updateFn();
          },
        },
        (text) => {
          session.cycles[stage].content += text; // Append delta

          if (stage === "review") {
            reviewBuffer += text;
            const lines = reviewBuffer.split("\n");
            // Process complete lines, keep the remainder
            while (lines.length > 1) {
              processReviewLine(lines.shift()!);
            }
            reviewBuffer = lines[0];
          } else {
            session.currentContent = session.cycles[stage].content;
          }
          updateFn();
        },
        "background",
        session.cancellationSignal,
      );

      // Process remaining buffer for review
      if (stage === "review" && reviewBuffer.trim()) {
        processReviewLine(reviewBuffer);
      }

      if (stage === "review") {
        result = this.cleanReviewOutput(result);
        api.v1.log(`[Review Stage Completed]:\n${result}`);
      }

      session.cycles[stage].content = result;
      session.cycles[stage].status = "completed";

      if (stage !== "review") {
        session.currentContent = result;
      }
      
      await this.storyManager.saveFieldDraft(session.fieldId, session.currentContent);
      return true;
    } catch (e: any) {
      if (
        e.message &&
        (e.message.includes("cancelled") || e.message.includes("Aborted"))
      ) {
        session.cycles[stage].status = "idle";
        api.v1.log("Generation cancelled");
        return false;
      } else {
        session.cycles[stage].status = "idle";
        api.v1.ui.toast(`Generation failed: ${e.message}`, { type: "error" });
        api.v1.log(`Generation failed: ${e}`);
        return false;
      }
    } finally {
      session.cancellationSignal = undefined;
      // Ensure we don't leave it in running state if something weird happened
      if (session.cycles[stage].status === "running") {
        session.cycles[stage].status = "idle";
      }
      updateFn();
    }
  }

  private cleanReviewOutput(content: string): string {
    const lines = content.split("\n");
    const validLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      // Validates format: [TAG] || "locator"
      // Allows optional spaces around || and optional markdown bolding **
      return /^(\*\*)?\[[A-Z_]+\](\*\*)?\s*\|\|\s*".*"$/.test(trimmed);
    });
    return validLines.join("\n");
  }
}
