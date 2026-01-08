import { StoryManager, DULFSField } from "./story-manager";
import { hyperGenerate } from "../../lib/hyper-generator";
import { ContextStrategyFactory } from "./context-strategies";
import { FieldID } from "../config/field-definitions";

export interface FieldSession {
  fieldId: string;
  isRunning: boolean;
  cancellationSignal?: CancellationSignal;
  budgetState?: "normal" | "waiting_for_user" | "waiting_for_timer";
  budgetResolver?: () => void;
  budgetWaitTime?: number;
}

export class AgentWorkflowService {
  private contextFactory: ContextStrategyFactory;
  private sessions: Map<string, FieldSession> = new Map();

  // Track list generation state: fieldId -> { isRunning, signal }
  private listGenerationState: Map<
    string,
    {
      isRunning: boolean;
      signal?: any;
      budgetState?: "normal" | "waiting_for_user" | "waiting_for_timer";
      budgetResolver?: () => void;
      budgetWaitTime?: number;
    }
  > = new Map();

  constructor(private storyManager: StoryManager) {
    this.contextFactory = new ContextStrategyFactory(storyManager);
  }

  public getSession(fieldId: string): FieldSession | undefined {
    return this.sessions.get(fieldId);
  }

  public startSession(fieldId: string): FieldSession {
    const session: FieldSession = {
      fieldId,
      isRunning: false,
    };
    this.sessions.set(fieldId, session);
    return session;
  }

  public getListGenerationState(fieldId: string) {
    return this.listGenerationState.get(fieldId) || { isRunning: false };
  }

  public cancelListGeneration(fieldId: string) {
    const state = this.listGenerationState.get(fieldId);
    if (state && state.signal) {
      state.signal.cancel();
    }
  }

  public parseListLine(
    line: string,
    fieldId: string,
  ): { name: string; description: string; content: string } | null {
    let clean = line.trim();

    // Still strip list markers because models are stubborn, and they shouldn't be part of the final data
    clean = clean.replace(/^[-*+]\s+/, "");
    clean = clean.replace(/^\d+[\.)]\s+/, "");

    if (fieldId === FieldID.DramatisPersonae) {
      // Regex for: Name (gender, age, occupation): motivation, tell
      // Hammer: must have the parens with commas and a colon
      const dpRegex = /^([^:(]+)\s*\(([^,]+),\s*([^,]+),\s*([^)]+)\):\s*(.+)$/;
      const match = clean.match(dpRegex);
      if (match) {
        return {
          name: match[1].trim(),
          description: match[5].trim(),
          content: clean,
        };
      }
    } else {
      // Hammer: Name: Description
      const genericRegex = /^([^:]+):\s*(.+)$/;
      const match = clean.match(genericRegex);
      if (match) {
        return {
          name: match[1].trim(),
          description: match[2].trim(),
          content: clean,
        };
      }
    }

    return null;
  }

  public async runListGeneration(
    fieldId: string,
    updateFn: () => void,
  ): Promise<void> {
    const cancellationSignal = await api.v1.createCancellationSignal();
    const state = {
      isRunning: true,
      signal: cancellationSignal,
      budgetState: "normal" as const,
    };
    this.listGenerationState.set(fieldId, state);
    updateFn();

    try {
      const result = await this.contextFactory.buildDulfsContext(fieldId);
      const { messages, params } = result;

      const model = (await api.v1.config.get("model")) || "glm-4-6";
      let buffer = "";

      const applyFilters = (t: string) => {
        let out = t;
        if ((result as any).filters) {
          for (const filter of (result as any).filters) {
            out = filter(out);
          }
        }
        return out;
      };

      await hyperGenerate(
        messages,
        {
          maxTokens: 2048,
          minTokens: 50,
          model,
          ...params,
          onBudgetWait: (_1, _2, time) => {
            const s = this.listGenerationState.get(fieldId);
            if (s) {
              s.budgetState = "waiting_for_user";
              s.budgetWaitTime = time;
              updateFn();
              return new Promise<void>((resolve) => {
                s.budgetResolver = () => {
                  s.budgetState = "waiting_for_timer";
                  updateFn();
                  resolve();
                };
              });
            }
            return Promise.resolve();
          },
          onBudgetResume: () => {
            const s = this.listGenerationState.get(fieldId);
            if (s) {
              s.budgetState = "normal";
              updateFn();
            }
          },
        },
        (text) => {
          buffer += text;
          const lines = buffer.split("\n");
          // Keep the last segment as it might be incomplete
          buffer = lines.pop() || "";

          for (const line of lines) {
            const filteredLine = applyFilters(line);
            const parsed = this.parseListLine(filteredLine, fieldId);
            if (parsed) {
              const newItem: DULFSField = {
                id: api.v1.uuid(),
                category: fieldId as any,
                content: parsed.content,
                name: parsed.name,
                description: parsed.description,
                attributes: {},
                linkedLorebooks: [],
              };
              this.storyManager.addDulfsItem(fieldId, newItem);
              updateFn();
            }
          }
        },
        "background",
        cancellationSignal,
      );

      if (cancellationSignal.cancelled) return;

      // Process any remaining buffer
      if (buffer.trim().length > 0) {
        const filteredBuffer = applyFilters(buffer);
        const parsed = this.parseListLine(filteredBuffer, fieldId);
        if (parsed) {
          const newItem: DULFSField = {
            id: api.v1.uuid(),
            category: fieldId as any,
            content: parsed.content,
            name: parsed.name,
            description: parsed.description,
            attributes: {},
            linkedLorebooks: [],
          };
          this.storyManager.addDulfsItem(fieldId, newItem);
          updateFn();
        }
      }
    } catch (e: any) {
      if (!e.message.includes("cancelled")) {
        api.v1.ui.toast(`List generation failed: ${e.message}`, {
          type: "error",
        });
      }
    } finally {
      this.listGenerationState.set(fieldId, {
        isRunning: false,
        signal: undefined,
      });
      updateFn();
    }
  }

  public async runFieldGeneration(
    fieldId: string,
    updateFn: () => void,
  ): Promise<void> {
    const session = this.getSession(fieldId) || this.startSession(fieldId);
    session.isRunning = true;
    session.cancellationSignal = await api.v1.createCancellationSignal();
    updateFn();

    try {
      const result = await this.contextFactory.build(session);
      const { messages, params } = result;

      // Find assistant pre-fill if it exists
      let buffer = "";
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.role === "assistant" && lastMsg.content) {
        buffer = lastMsg.content;
      }

      await this.storyManager.saveFieldDraft(session.fieldId, buffer);
      const model = (await api.v1.config.get("model")) || "glm-4-6";

      const applyFilters = (t: string) => {
        let out = t;
        if (result.filters) {
          for (const filter of result.filters) {
            out = filter(out);
          }
        }
        return out;
      };

      await hyperGenerate(
        messages,
        {
          maxTokens: 2048,
          model,
          ...params,
          minTokens: params.minTokens || 50,
          onBudgetWait: (_1, _2, time) => {
            session.budgetState = "waiting_for_user";
            session.budgetWaitTime = time;
            updateFn();
            return new Promise<void>((resolve) => {
              session.budgetResolver = () => {
                session.budgetState = "waiting_for_timer";
                updateFn();
                resolve();
              };
            });
          },
          onBudgetResume: () => {
            session.budgetState = "normal";
            updateFn();
          },
        },
        (text) => {
          if (text) {
            buffer += applyFilters(text);
            this.storyManager.saveFieldDraft(session.fieldId, buffer);
            updateFn();
          }
        },
        "background",
        session.cancellationSignal,
      );

      if (session.cancellationSignal.cancelled) return;

      await this.storyManager.setFieldContent(
        session.fieldId,
        buffer,
        true,
        true,
      );
    } catch (e: any) {
      if (!e.message.includes("cancelled")) {
        api.v1.ui.toast(`Generation failed: ${e.message}`, { type: "error" });
      }
    } finally {
      session.isRunning = false;
      session.cancellationSignal = undefined;
      updateFn();
    }
  }
}
