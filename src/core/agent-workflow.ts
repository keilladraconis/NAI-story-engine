import { StoryManager, DULFSField } from "./story-manager";
import { hyperGenerate } from "../../lib/hyper-generator";
import { ContextStrategyFactory } from "./context-strategies";

export interface FieldSession {
  fieldId: string;
  isRunning: boolean;
  isQueued?: boolean;
  cancellationSignal?: CancellationSignal;
  budgetState?: "normal" | "waiting_for_user" | "waiting_for_timer";
  budgetResolver?: () => void;
  budgetWaitTime?: number;
}

export class AgentWorkflowService {
  private contextFactory: ContextStrategyFactory;
  private sessions: Map<string, FieldSession> = new Map();

  private taskQueue: Array<
    | { type: "field"; fieldId: string; updateFn: () => void }
    | { type: "list"; fieldId: string; updateFn: () => void }
  > = [];
  private isGlobalGenerating: boolean = false;

  // Track list generation state: fieldId -> { isRunning, signal }
  private listGenerationState: Map<
    string,
    {
      isRunning: boolean;
      isQueued?: boolean;
      signal?: CancellationSignal;
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
    // Check queue first
    const queueIndex = this.taskQueue.findIndex(
      (t) => t.type === "list" && t.fieldId === fieldId,
    );
    if (queueIndex !== -1) {
      const task = this.taskQueue.splice(queueIndex, 1)[0];
      const state = this.listGenerationState.get(fieldId);
      if (state) {
        state.isQueued = false;
        state.isRunning = false;
      }
      if (task.updateFn) task.updateFn();
      return;
    }

    const state = this.listGenerationState.get(fieldId);
    if (state && state.signal) {
      state.signal.cancel();
    }
  }

  public cancelFieldGeneration(fieldId: string) {
    // Check queue first
    const queueIndex = this.taskQueue.findIndex(
      (t) => t.type === "field" && t.fieldId === fieldId,
    );
    if (queueIndex !== -1) {
      const task = this.taskQueue.splice(queueIndex, 1)[0];
      const session = this.getSession(fieldId);
      if (session) {
        session.isQueued = false;
      }
      if (task.updateFn) task.updateFn();
      return;
    }

    const session = this.getSession(fieldId);
    if (session && session.cancellationSignal) {
      session.cancellationSignal.cancel();
    }
  }

  public requestListGeneration(fieldId: string, updateFn: () => void) {
    const state = this.listGenerationState.get(fieldId) || { isRunning: false };
    this.listGenerationState.set(fieldId, state);

    if (this.isGlobalGenerating || state.isRunning) {
      state.isQueued = true;
      this.taskQueue.push({ type: "list", fieldId, updateFn });
      updateFn();
    } else {
      this.isGlobalGenerating = true;
      this._runListGeneration(fieldId, updateFn);
    }
  }

  public requestFieldGeneration(fieldId: string, updateFn: () => void) {
    const session = this.getSession(fieldId) || this.startSession(fieldId);
    if (this.isGlobalGenerating || session.isRunning) {
      session.isQueued = true;
      this.taskQueue.push({ type: "field", fieldId, updateFn });
      updateFn();
    } else {
      this.isGlobalGenerating = true;
      this._runFieldGeneration(fieldId, updateFn);
    }
  }

  private async processQueue() {
    if (this.taskQueue.length === 0) {
      this.isGlobalGenerating = false;
      return;
    }

    const nextTask = this.taskQueue.shift();
    if (!nextTask) {
      this.isGlobalGenerating = false;
      return;
    }

    if (nextTask.type === "field") {
      const session = this.getSession(nextTask.fieldId);
      if (session) {
        session.isQueued = false;
        nextTask.updateFn(); // Update UI to show running
      }
      await this._runFieldGeneration(nextTask.fieldId, nextTask.updateFn);
    } else if (nextTask.type === "list") {
      const state = this.listGenerationState.get(nextTask.fieldId);
      if (state) {
        state.isQueued = false;
        nextTask.updateFn();
      }
      await this._runListGeneration(nextTask.fieldId, nextTask.updateFn);
    }
  }

  private async _runListGeneration(
    fieldId: string,
    updateFn: () => void,
  ): Promise<void> {
    const cancellationSignal = await api.v1.createCancellationSignal();
    const state = {
      isRunning: true,
      isQueued: false,
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
            const parsed = this.storyManager.parseListLine(filteredLine, fieldId);
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
        const parsed = this.storyManager.parseListLine(filteredBuffer, fieldId);
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
        isQueued: false,
        signal: undefined,
      });
      updateFn();
      this.processQueue();
    }
  }

  private async _runFieldGeneration(
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
      // Default behavior is 'keep' to maintain backward compatibility and support strictly formatted fields
      const prefixBehavior = result.prefixBehavior || "keep";

      if (lastMsg && lastMsg.role === "assistant" && lastMsg.content) {
        if (prefixBehavior === "keep") {
          buffer = lastMsg.content;
        }
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

      // Automatically generate keys for Lorebook entries
      if (session.fieldId.startsWith("lorebook:")) {
        const entryId = session.fieldId.split(":")[1];
        api.v1.ui.toast("Generating Lorebook Keys...", { type: "info" });
        await this.storyManager.generateLorebookKeys(entryId, buffer);
      }
    } catch (e: any) {
      if (!e.message.includes("cancelled")) {
        api.v1.ui.toast(`Generation failed: ${e.message}`, { type: "error" });
      }
    } finally {
      session.isRunning = false;
      session.cancellationSignal = undefined;
      updateFn();
      this.processQueue();
    }
  }
}
