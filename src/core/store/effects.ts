import { Store, matchesAction } from "nai-store";
import {
  RootState,
  BrainstormMessage,
  GenerationStrategy,
  AppDispatch,
} from "./types";
import { currentChat, currentMessages } from "./slices/brainstorm";
import { GenX, MessageFactory } from "nai-gen-x";
import { registerSegaEffects } from "./effects/sega";
import {
  uiBrainstormSubmitUserMessage,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
  messageAdded,
  messageUpdated,
  generationSubmitted,
  uiCancelRequest,
  queueCleared,
  requestQueued,
  uiBrainstormMessageEditBegin,
  uiBrainstormMessageEditEnd,
  editingMessageIdSet,
  uiBrainstormRetryGeneration,
  uiBrainstormSummarize,
  pruneHistory,
  messagesCleared,
  uiGenerationRequested,
  dulfsItemRemoved,
  dulfsItemAdded,
  storyCleared,
  uiLorebookContentGenerationRequested,
  uiLorebookKeysGenerationRequested,
  uiLorebookItemGenerationRequested,
  uiLorebookRefineRequested,
  requestCancelled,
  requestCompleted,
  crucibleGoalsRequested,
  crucibleStopRequested,
  crucibleMergeRequested,
  crucibleDirectionRequested,
  crucibleBuildRequested,
  crucibleReset,
  directionSet,
  goalAdded,
  goalRemoved,
  phaseTransitioned,
  expansionStarted,
} from "./index";
import {
  createLorebookContentFactory,
  createLorebookRefineFactory,
  buildLorebookKeysPayload,
} from "../utils/lorebook-strategy";
import {
  buildBrainstormStrategy,
  buildSummarizeStrategy,
  buildBootstrapStrategy,
  buildCanonStrategy,
  buildDulfsListStrategy,
  buildATTGStrategy,
  buildStyleStrategy,
  extractDulfsItemName,
} from "../utils/context-builder";
import {
  buildCrucibleDirectionStrategy,
  buildCrucibleGoalStrategy,
} from "../utils/crucible-strategy";
import {
  buildStructuralGoalStrategy,
  buildPrereqsStrategy,
  buildElementsStrategy,
  buildExpansionStrategy,
} from "../utils/crucible-chain-strategy";
import { IDS } from "../../ui/framework/ids";
import {
  DulfsFieldID,
  FieldID,
  FIELD_CONFIGS,
} from "../../config/field-definitions";
import { getHandler } from "./effects/generation-handlers";
import { attgForMemory } from "../utils/filters";

// Lorebook sync constants
const SE_CATEGORY_PREFIX = "SE: ";
const SE_ERATO_MARKER_NAME = "SE: End of Lorebook";

// Helper: Find or create a category for a DULFS field
async function ensureCategory(fieldId: DulfsFieldID): Promise<string> {
  const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
  const name = `${SE_CATEGORY_PREFIX}${config?.label || fieldId}`;

  const categories = await api.v1.lorebook.categories();
  const existing = categories.find((c) => c.name === name);
  if (existing) return existing.id;

  const erato = (await api.v1.config.get("erato_compatibility")) || false;

  return api.v1.lorebook.createCategory({
    id: api.v1.uuid(),
    name,
    enabled: true,
    settings: erato ? {} : { entryHeader: "----" },
  });
}

// Helper: Find a category for a DULFS field (returns null if not found)
async function findCategory(fieldId: DulfsFieldID): Promise<string | null> {
  const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
  const name = `${SE_CATEGORY_PREFIX}${config?.label || fieldId}`;
  const categories = await api.v1.lorebook.categories();
  return categories.find((c) => c.name === name)?.id || null;
}

/**
 * Sync lorebook entries and categories when erato_compatibility is toggled.
 * - Erato ON: clear entryHeader from categories, prepend "----\n" to entry text
 * - Erato OFF: set entryHeader on categories, strip "----\n" from entry text
 */
export async function syncEratoCompatibility(
  getState: () => RootState,
): Promise<void> {
  const erato = (await api.v1.config.get("erato_compatibility")) || false;
  const dulfs = getState().story.dulfs;

  // Collect managed entry IDs from DULFS state
  const entryIds: string[] = [];
  for (const fieldId in dulfs) {
    const items = dulfs[fieldId as DulfsFieldID];
    if (items) {
      for (const item of items) {
        entryIds.push(item.id);
      }
    }
  }

  // Gather unique category IDs from managed entries
  const categoryIds = new Set<string>();
  for (const entryId of entryIds) {
    const entry = await api.v1.lorebook.entry(entryId);
    if (entry?.category) {
      categoryIds.add(entry.category);
    }
  }

  // Update categories
  for (const categoryId of categoryIds) {
    if (erato) {
      await api.v1.lorebook.updateCategory(categoryId, { settings: { entryHeader: "" } });
    } else {
      await api.v1.lorebook.updateCategory(categoryId, {
        settings: { entryHeader: "----" },
      });
    }
  }

  // Update entry text
  for (const entryId of entryIds) {
    const entry = await api.v1.lorebook.entry(entryId);
    if (!entry?.text) continue;

    if (erato && !entry.text.startsWith("----\n")) {
      await api.v1.lorebook.updateEntry(entryId, {
        text: "----\n" + entry.text,
      });
    } else if (!erato && entry.text.startsWith("----\n")) {
      await api.v1.lorebook.updateEntry(entryId, {
        text: entry.text.slice(5),
      });
    }
  }

  // Manage "End of Lorebook" marker entry
  const allEntries = await api.v1.lorebook.entries();
  const existingMarker = allEntries.find(
    (e) => e.displayName === SE_ERATO_MARKER_NAME,
  );

  if (erato && !existingMarker) {
    await api.v1.lorebook.createEntry({
      id: api.v1.uuid(),
      displayName: SE_ERATO_MARKER_NAME,
      text: "***\n",
      keys: [],
      enabled: true,
      forceActivation: true,
    });
    api.v1.ui.toast(
      'Created "SE: End of Lorebook" entry. Set its insertion order to 1.',
      { type: "info" },
    );
  } else if (!erato && existingMarker) {
    await api.v1.lorebook.removeEntry(existingMarker.id);
  }

  // Re-sync ATTG → Memory through attgForMemory (adds/removes [ S:4 ] as needed)
  const attgSyncEnabled = await api.v1.storyStorage.get("kse-sync-attg-memory");
  if (attgSyncEnabled) {
    const attgContent = String((await api.v1.storyStorage.get("kse-field-attg")) || "");
    if (attgContent) {
      await api.v1.memory.set(await attgForMemory(attgContent));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generation Effect Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the prefix text for resumption scenarios
 */
function resolvePrefill(
  strategy: GenerationStrategy,
  getState: () => RootState,
): string {
  const { prefillBehavior, assistantPrefill, target, messages } = strategy;

  if (prefillBehavior !== "keep") return "";

  const state = getState();

  if (target.type === "brainstorm") {
    const message = currentMessages(state.brainstorm).find(
      (m) => m.id === target.messageId,
    );
    return message?.content || "";
  }

  if (target.type === "field") {
    if (assistantPrefill) return assistantPrefill;
    if (messages) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === "assistant" && lastMsg.content) {
        return lastMsg.content;
      }
    }
  }

  if (target.type === "lorebookKeys") {
    if (assistantPrefill) return assistantPrefill;
  }

  // Crucible targets use explicit assistantPrefill
  if (
    target.type === "crucibleDirection" ||
    target.type === "crucibleGoal" ||
    target.type === "crucibleStructuralGoal" ||
    target.type === "cruciblePrereqs" ||
    target.type === "crucibleElements" ||
    target.type === "crucibleExpansion"
  ) {
    if (assistantPrefill) return assistantPrefill;
  }

  return "";
}

/**
 * Queue lorebook request if not already in queue (for button state tracking)
 */
function queueLorebookRequestIfNeeded(
  target: GenerationStrategy["target"],
  requestId: string,
  getState: () => RootState,
  dispatch: AppDispatch,
): void {
  if (
    target.type !== "lorebookContent" &&
    target.type !== "lorebookKeys" &&
    target.type !== "lorebookRefine"
  ) {
    return;
  }

  const currentQueue = getState().runtime.queue;
  const alreadyQueued = currentQueue.some((r) => r.id === requestId);

  if (!alreadyQueued) {
    dispatch(
      requestQueued({
        id: requestId,
        type: target.type,
        targetId: target.entryId,
      }),
    );
  }
}

/**
 * Capture original lorebook content for rollback on cancellation
 */
async function captureRollbackState(
  target: GenerationStrategy["target"],
): Promise<{ content: string; keys: string }> {
  if (
    target.type !== "lorebookContent" &&
    target.type !== "lorebookKeys" &&
    target.type !== "lorebookRefine"
  ) {
    return { content: "", keys: "" };
  }

  const entry = await api.v1.lorebook.entry(target.entryId);
  return {
    content: entry?.text || "",
    keys: entry?.keys?.join(", ") || "",
  };
}

/**
 * Descriptive label for cache instrumentation logs.
 */
function cacheLabel(target: GenerationStrategy["target"]): string {
  switch (target.type) {
    case "field":
      return `field:${target.fieldId}`;
    case "list":
      return `list:${target.fieldId}`;
    case "brainstorm":
      return `brainstorm:${target.messageId}`;
    case "lorebookContent":
      return `lb-content:${target.entryId.slice(0, 8)}`;
    case "lorebookKeys":
      return `lb-keys:${target.entryId.slice(0, 8)}`;
    case "lorebookRefine":
      return `lb-refine:${target.entryId.slice(0, 8)}`;
    case "bootstrap":
      return "bootstrap";
    case "crucibleDirection":
      return "crucible-direction";
    case "crucibleGoal":
      return `crucible-goal:${target.goalId.slice(0, 8)}`;
    case "crucibleStructuralGoal":
      return `crucible-sg:${target.goalId.slice(0, 8)}`;
    case "cruciblePrereqs":
      return "crucible-prereqs";
    case "crucibleElements":
      return "crucible-elements";
    case "crucibleExpansion":
      return `crucible-expand:${target.elementId.slice(0, 8)}`;
  }
}

/**
 * Check if a request was cancelled by the user
 */
function checkCancellation(
  requestId: string,
  getState: () => RootState,
): boolean {
  const activeRequest = getState().runtime.activeRequest;
  return (
    activeRequest?.id === requestId && activeRequest?.status === "cancelled"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Brainstorm Edit Effects
// ─────────────────────────────────────────────────────────────────────────────

function registerBrainstormEditEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
): void {
  // Intent: Brainstorm Edit Begin
  subscribeEffect(
    matchesAction(uiBrainstormMessageEditBegin),
    async (action) => {
      const { id: newId } = action.payload;
      const state = getState();
      const currentEditingId = state.brainstorm.editingMessageId;

      // 1. If currently editing another message, save it first
      if (currentEditingId && currentEditingId !== newId) {
        const prevInputId = IDS.BRAINSTORM.message(currentEditingId).INPUT;
        const content =
          (await api.v1.storyStorage.get(`draft-${prevInputId}`)) || "";
        dispatch(
          messageUpdated({ id: currentEditingId, content: String(content) }),
        );
      }

      // 2. Prepare the NEW message for editing
      const newMessage = currentMessages(state.brainstorm).find((m) => m.id === newId);
      if (newMessage) {
        const newInputId = IDS.BRAINSTORM.message(newId).INPUT;
        await api.v1.storyStorage.set(
          `draft-${newInputId}`,
          newMessage.content,
        );

        // 3. Set the editing ID
        dispatch(editingMessageIdSet(newId));
      }
    },
  );

  // Intent: Brainstorm Edit End (Save)
  subscribeEffect(
    (action) => action.type === uiBrainstormMessageEditEnd.type,
    async () => {
      const state = getState();
      const editingId = state.brainstorm.editingMessageId;

      if (editingId) {
        const inputId = IDS.BRAINSTORM.message(editingId).INPUT;
        const content =
          (await api.v1.storyStorage.get(`draft-${inputId}`)) || "";

        dispatch(messageUpdated({ id: editingId, content: String(content) }));
        dispatch(editingMessageIdSet(null));
      }
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Effects Registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerEffects(store: Store<RootState>, genX: GenX) {
  const { subscribeEffect, dispatch, getState } = store;

  // Register brainstorm edit effects
  registerBrainstormEditEffects(subscribeEffect, dispatch, getState);

  // Register SEGA effects
  registerSegaEffects(subscribeEffect, dispatch, getState, genX);

  // Intent: Brainstorm Submit
  subscribeEffect(
    (action) => action.type === uiBrainstormSubmitUserMessage.type,
    async (_action, { dispatch, getState }) => {
      const editingId = getState().brainstorm.editingMessageId;
      if (editingId) {
        const editInputId = IDS.BRAINSTORM.message(editingId).INPUT;
        const editContent =
          (await api.v1.storyStorage.get(`draft-${editInputId}`)) || "";
        dispatch(messageUpdated({ id: editingId, content: String(editContent) }));
        dispatch(editingMessageIdSet(null));
      }

      const storageKey = IDS.BRAINSTORM.INPUT;
      const content = (await api.v1.storyStorage.get(storageKey)) || "";

      // Clear Input
      await api.v1.storyStorage.set(storageKey, "");
      api.v1.ui.updateParts([{ id: IDS.BRAINSTORM.INPUT, value: "" }]);

      let assistantId;

      if (content.trim()) {
        const userMsg: BrainstormMessage = {
          id: api.v1.uuid(),
          role: "user",
          content: String(content),
        };
        dispatch(messageAdded(userMsg));
      }

      const lastMessage = currentMessages(getState().brainstorm).at(-1);
      if (lastMessage?.role == "user") {
        assistantId = api.v1.uuid();
        const assistantMsg: BrainstormMessage = {
          id: assistantId,
          role: "assistant",
          content: "",
        };
        dispatch(messageAdded(assistantMsg));
      } else if (lastMessage?.role == "assistant") {
        assistantId = lastMessage.id;
      } else {
        return;
      }

      const mode = currentChat(getState().brainstorm).mode || "cowriter";
      const strategy = buildBrainstormStrategy(getState, assistantId, mode);
      dispatch(
        requestQueued({
          id: strategy.requestId,
          type: "brainstorm",
          targetId: assistantId,
        }),
      );
      dispatch(generationSubmitted(strategy));
    },
  );

  // Intent: Brainstorm Retry
  subscribeEffect(
    matchesAction(uiBrainstormRetryGeneration),
    async (action, { dispatch, getState }) => {
      const { messageId } = action.payload;
      dispatch(pruneHistory(messageId));

      const state = getState();
      const lastMessage = currentMessages(state.brainstorm).at(-1);

      let assistantId: string;

      if (lastMessage && lastMessage.role === "assistant") {
        assistantId = api.v1.uuid();
      } else {
        assistantId = api.v1.uuid();
        dispatch(
          messageAdded({
            id: assistantId,
            role: "assistant",
            content: "",
          }),
        );
      }

      const mode = currentChat(getState().brainstorm).mode || "cowriter";
      const strategy = buildBrainstormStrategy(getState, assistantId, mode);
      dispatch(
        requestQueued({
          id: strategy.requestId,
          type: "brainstorm",
          targetId: assistantId,
        }),
      );
      dispatch(generationSubmitted(strategy));
    },
  );

  // Intent: Brainstorm Summarize
  subscribeEffect(
    matchesAction(uiBrainstormSummarize),
    async (_action, { dispatch, getState }) => {
      const messages = currentMessages(getState().brainstorm);
      if (messages.length === 0) {
        api.v1.ui.toast("Nothing to summarize", { type: "info" });
        return;
      }

      const chatHistory = [...messages];
      dispatch(messagesCleared());
      const assistantId = api.v1.uuid();
      dispatch(
        messageAdded({
          id: assistantId,
          role: "assistant",
          content: "",
        }),
      );

      const strategy = buildSummarizeStrategy(getState, assistantId, chatHistory);
      dispatch(
        requestQueued({
          id: strategy.requestId,
          type: "brainstorm",
          targetId: assistantId,
        }),
      );
      dispatch(generationSubmitted(strategy));
    },
  );

  // Intent: Field/List Generation
  subscribeEffect(
    matchesAction(uiGenerationRequested),
    async (action, { dispatch, getState }) => {
      const { id: requestId, type, targetId } = action.payload;

      if (type === "field") {
        if (targetId.includes(":")) {
          return;
        }

        let strategy;
        if (targetId === FieldID.Canon) {
          strategy = buildCanonStrategy(getState, targetId);
        } else if (targetId === FieldID.ATTG) {
          strategy = buildATTGStrategy(getState);
        } else if (targetId === FieldID.Style) {
          strategy = buildStyleStrategy(getState);
        } else {
          api.v1.log(
            `[effects] No generation strategy found for field: ${targetId}`,
          );
          return;
        }

        strategy.requestId = requestId;
        dispatch(generationSubmitted(strategy));
      } else if (type === "list") {
        const strategy = buildDulfsListStrategy(getState, targetId);
        strategy.requestId = requestId;
        dispatch(generationSubmitted(strategy));
      } else if (type === "bootstrap") {
        const strategy = buildBootstrapStrategy(getState, requestId);
        dispatch(generationSubmitted(strategy));
      }
    },
  );

  // Intent: GenX Generation (using handler map pattern)
  subscribeEffect(
    matchesAction(generationSubmitted),
    async (action, { dispatch, getState }) => {
      const strategy = action.payload;
      const { requestId, messages, messageFactory, params, target } = strategy;

      let accumulatedText = resolvePrefill(strategy, getState);

      let messagesOrFactory: Message[] | MessageFactory | undefined;
      let resolvedMessages: Message[] | undefined;
      const apiParams = { ...params };

      if (messageFactory && strategy.continuation) {
        const result = await messageFactory();
        resolvedMessages = result.messages;
        if (result.params) Object.assign(apiParams, result.params);
        const uncached = await api.v1.script.countUncachedInputTokens(result.messages, "glm-4-6");
        api.v1.log(`[cache] ${cacheLabel(target)}: ${uncached} uncached tokens`);
        messagesOrFactory = resolvedMessages;
      } else if (messageFactory) {
        messagesOrFactory = async () => {
          const result = await messageFactory();
          const uncached = await api.v1.script.countUncachedInputTokens(result.messages, "glm-4-6");
          api.v1.log(`[cache] ${cacheLabel(target)}: ${uncached} uncached tokens`);
          return result;
        };
      } else if (messages) {
        const uncached = await api.v1.script.countUncachedInputTokens(messages, "glm-4-6");
        api.v1.log(`[cache] ${cacheLabel(target)}: ${uncached} uncached tokens`);
        messagesOrFactory = messages;
      }
      if (!messagesOrFactory) {
        api.v1.log("Generation failed: no messages or factory provided");
        return;
      }

      queueLorebookRequestIfNeeded(target, requestId, getState, dispatch);

      const rollbackState = await captureRollbackState(target);

      const handler = getHandler(target.type);
      let generationSucceeded = false;

      try {
        const result = await genX.generate(
          messagesOrFactory,
          { ...apiParams, taskId: requestId },
          (choices, _final) => {
            const text = choices[0]?.text || "";
            if (text) {
              accumulatedText += text;
              handler.streaming({ target, getState, accumulatedText }, text);
            }
          },
          "background",
          await api.v1.createCancellationSignal(),
        );

        generationSucceeded = true;

        // Continuation: extend output beyond single max_tokens call
        if (strategy.continuation && resolvedMessages && result) {
          let calls = 1;
          const maxCalls = strategy.continuation.maxCalls;
          let finishReason = result.choices?.[0]?.finish_reason;

          while (calls < maxCalls && finishReason === "length") {
            api.v1.log(`[continuation] Call ${calls + 1}/${maxCalls}, extending output...`);

            const continuationMessages: Message[] = [
              ...resolvedMessages.slice(0, -1),
              { role: "assistant", content: accumulatedText },
            ];

            try {
              const contResult = await api.v1.generate(
                continuationMessages,
                { ...apiParams, max_tokens: 1024 },
                (choices) => {
                  const text = choices[0]?.text || "";
                  if (text) {
                    accumulatedText += text;
                    handler.streaming({ target, getState, accumulatedText }, text);
                  }
                },
                "background",
                await api.v1.createCancellationSignal(),
              );
              finishReason = contResult.choices?.[0]?.finish_reason;
            } catch (e) {
              api.v1.log("[continuation] Error:", e);
              break;
            }
            calls++;
          }
        }
      } catch (error: any) {
        api.v1.log(`[effects] Generation error for ${requestId}:`, error);
        generationSucceeded = false;
      }

      const wasCancelled = checkCancellation(requestId, getState);
      if (wasCancelled) {
        api.v1.log(`[effects] Generation was cancelled for ${requestId}`);
        generationSucceeded = false;
      }

      try {
        await handler.completion({
          target,
          getState,
          accumulatedText,
          generationSucceeded,
          dispatch,
          originalContent: rollbackState.content,
          originalKeys: rollbackState.keys,
        });
      } catch (e) {
        api.v1.log(`[effects] Completion handler error for ${requestId}:`, e);
      }

      if (generationSucceeded) {
        api.v1.log(
          `[effects] Generation completed successfully for ${requestId}`,
        );
      } else if (wasCancelled) {
        api.v1.log(
          `[effects] Generation cancelled for ${requestId}, signaling completion`,
        );
      } else {
        api.v1.log(
          `[effects] Generation failed for ${requestId}, signaling completion`,
        );
      }
      dispatch(requestCompleted({ requestId }));

      // Toast notifications for Story Engine generations
      if (generationSucceeded) {
        if (target.type === "list") {
          const fieldConfig = FIELD_CONFIGS.find(
            (c) => c.id === target.fieldId,
          );
          const label = fieldConfig?.label || "Items";
          api.v1.ui.toast(`${label} generated`, { type: "success" });
        } else if (target.type === "lorebookContent") {
          const entry = await api.v1.lorebook.entry(target.entryId);
          const name = entry?.displayName || "Entry";
          api.v1.ui.toast(`Lorebook: ${name}`, { type: "success" });
        } else if (target.type === "lorebookKeys") {
          const entry = await api.v1.lorebook.entry(target.entryId);
          const name = entry?.displayName || "Entry";
          api.v1.ui.toast(`Keys: ${name}`, { type: "success" });
        } else if (target.type === "lorebookRefine") {
          const entry = await api.v1.lorebook.entry(target.entryId);
          const name = entry?.displayName || "Entry";
          api.v1.ui.toast(`Refined: ${name}`, { type: "success" });
        }
      }
    },
  );

  // Intent: Specific Cancellation
  subscribeEffect(matchesAction(uiCancelRequest), (action, { dispatch }) => {
    const { requestId } = action.payload;
    dispatch(requestCancelled({ requestId }));
    genX.cancelQueued(requestId);
    const status = genX.getTaskStatus(requestId);
    if (status === "processing") {
      genX.cancelAll();
    }
  });

  // Intent: Cancellation (global - cancels current task)
  subscribeEffect(
    (action) => action.type === uiRequestCancellation.type,
    (_action, { dispatch, getState }) => {
      const activeRequest = getState().runtime.activeRequest;
      if (activeRequest) {
        dispatch(requestCancelled({ requestId: activeRequest.id }));
      }
      genX.cancelAll();
    },
  );

  // Intent: User Presence
  subscribeEffect(
    (action) => action.type === uiUserPresenceConfirmed.type,
    () => {
      genX.userInteraction();
    },
  );

  // Intent: Crucible Direction Requested → queue direction generation
  subscribeEffect(
    matchesAction(crucibleDirectionRequested),
    async (_action, { dispatch }) => {
      const strategy = buildCrucibleDirectionStrategy(getState);
      dispatch(
        requestQueued({
          id: strategy.requestId,
          type: "crucibleDirection",
          targetId: "crucible",
        }),
      );
      dispatch(generationSubmitted(strategy));
    },
  );

  // Intent: Crucible Goals Requested → sync intent, create 3 empty goals, queue per-goal generation
  subscribeEffect(
    matchesAction(crucibleGoalsRequested),
    async (_action, { dispatch }) => {
      const editedDirection = String(
        (await api.v1.storyStorage.get("cr-direction")) || "",
      );
      if (editedDirection) {
        dispatch(directionSet({ direction: editedDirection }));
      }

      for (let i = 0; i < 3; i++) {
        const goalId = api.v1.uuid();
        dispatch(goalAdded({ goal: { id: goalId, text: "", starred: false } }));

        const strategy = buildCrucibleGoalStrategy(getState, goalId);
        dispatch(
          requestQueued({
            id: strategy.requestId,
            type: "crucibleGoal",
            targetId: goalId,
          }),
        );
        dispatch(generationSubmitted(strategy));
      }

      dispatch(phaseTransitioned({ phase: "goals" }));
    },
  );

  // Intent: Crucible Build Requested → three-step chain pipeline
  subscribeEffect(
    matchesAction(crucibleBuildRequested),
    async (_action, { dispatch, getState: getLatest }) => {
      dispatch(phaseTransitioned({ phase: "building" }));

      const state = getLatest();
      const starredGoals = state.crucible.goals.filter((g) => g.starred);
      if (starredGoals.length === 0) {
        api.v1.log("[crucible] Build requested but no goals starred");
        return;
      }

      api.v1.ui.updateParts([{
        id: IDS.CRUCIBLE.PROGRESS_ROOT,
        text: "Finding the heart of your story...",
      }]);

      // Queue structural goal derivation for each starred goal
      for (const goal of starredGoals) {
        const strategy = buildStructuralGoalStrategy(getState, goal.id);
        dispatch(
          requestQueued({
            id: strategy.requestId,
            type: "crucibleStructuralGoal",
            targetId: goal.id,
          }),
        );
        dispatch(generationSubmitted(strategy));
      }
    },
  );

  // Pipeline continuation: when a crucible request completes, advance to next step
  subscribeEffect(
    matchesAction(requestCompleted),
    async () => {
      await api.v1.timers.sleep(150);

      const state = getState();
      if (state.crucible.phase !== "building" && state.crucible.phase !== "expanding") return;
      if (state.runtime.activeRequest || state.runtime.queue.length > 0) return;

      const starredGoals = state.crucible.goals.filter((g) => g.starred);

      if (state.crucible.phase === "building") {
        // Check which step we're at based on what data exists
        const hasAllStructuralGoals = starredGoals.every((g) =>
          state.crucible.structuralGoals.some((sg) => sg.sourceGoalId === g.id),
        );

        if (!hasAllStructuralGoals) {
          // Structural goals still generating or failed — don't advance
          api.v1.log("[crucible] Waiting for structural goals to complete");
          return;
        }

        if (state.crucible.prerequisites.length === 0) {
          // Step 2: Queue prerequisites
          api.v1.log("[crucible] Structural goals complete → queuing prerequisites");
          api.v1.ui.updateParts([{
            id: IDS.CRUCIBLE.PROGRESS_ROOT,
            text: "Deriving what must be true...",
          }]);

          const strategy = buildPrereqsStrategy(getState);
          dispatch(
            requestQueued({
              id: strategy.requestId,
              type: "cruciblePrereqs",
              targetId: "crucible",
            }),
          );
          dispatch(generationSubmitted(strategy));
          return;
        }

        if (state.crucible.elements.length === 0) {
          // Step 3: Queue world elements
          api.v1.log("[crucible] Prerequisites complete → queuing world elements");
          api.v1.ui.updateParts([{
            id: IDS.CRUCIBLE.PROGRESS_ROOT,
            text: "Building your world...",
          }]);

          const strategy = buildElementsStrategy(getState);
          dispatch(
            requestQueued({
              id: strategy.requestId,
              type: "crucibleElements",
              targetId: "crucible",
            }),
          );
          dispatch(generationSubmitted(strategy));
          return;
        }

        // All steps complete → transition to review
        api.v1.log("[crucible] All steps complete → transitioning to review");
        dispatch(phaseTransitioned({ phase: "review" }));
        api.v1.ui.toast("World elements ready for review", { type: "success" });
        return;
      }

      if (state.crucible.phase === "expanding") {
        // Expansion complete — stay in expanding phase for user review
        api.v1.log("[crucible] Expansion complete");
        api.v1.ui.toast("Expansion complete — review new elements", { type: "success" });
      }
    },
  );

  // Intent: Crucible Expansion Started → queue expansion strategy
  subscribeEffect(
    matchesAction(expansionStarted),
    async (action, { dispatch }) => {
      const { elementId } = action.payload;
      api.v1.ui.updateParts([{
        id: IDS.CRUCIBLE.PROGRESS_ROOT,
        text: "Expanding...",
      }]);

      const strategy = buildExpansionStrategy(getState, elementId);
      dispatch(
        requestQueued({
          id: strategy.requestId,
          type: "crucibleExpansion",
          targetId: elementId,
        }),
      );
      dispatch(generationSubmitted(strategy));
    },
  );

  // Intent: Crucible Stop → cancel active crucible request
  subscribeEffect(
    matchesAction(crucibleStopRequested),
    (_action, { dispatch, getState: getLatest }) => {
      const state = getLatest();
      const activeRequest = state.runtime.activeRequest;
      const crucibleTypes = new Set([
        "crucibleDirection", "crucibleGoal",
        "crucibleStructuralGoal", "cruciblePrereqs",
        "crucibleElements", "crucibleExpansion",
      ]);
      if (activeRequest && crucibleTypes.has(activeRequest.type)) {
        dispatch(requestCancelled({ requestId: activeRequest.id }));
        genX.cancelAll();
      }
    },
  );

  // Intent: Crucible Reset → clean up cr- storyStorage keys
  subscribeEffect(
    matchesAction(crucibleReset),
    async () => {
      const allKeys = await api.v1.storyStorage.list();
      for (const key of allKeys) {
        if (key.startsWith("cr-")) {
          await api.v1.storyStorage.remove(key);
        }
      }

      api.v1.ui.updateParts([
        { id: `${IDS.CRUCIBLE.DIRECTION_TEXT}-view`, text: "" },
      ]);
    },
  );

  // Intent: Goal Removed → clean up goal storyStorage keys
  subscribeEffect(
    matchesAction(goalRemoved),
    async (action) => {
      const { goalId } = action.payload;
      const allKeys = await api.v1.storyStorage.list();
      for (const key of allKeys) {
        if (
          key === `cr-goal-${goalId}` ||
          key === `cr-goal-section-${goalId}`
        ) {
          await api.v1.storyStorage.remove(key);
        }
      }
    },
  );

  // Intent: Crucible Merge → write elements to DULFS
  subscribeEffect(
    matchesAction(crucibleMergeRequested),
    async (_action, { dispatch, getState: getLatest }) => {
      const state = getLatest();
      const { elements } = state.crucible;
      if (elements.length === 0) {
        api.v1.log("[crucible] Merge requested but no elements");
        api.v1.ui.toast("No world elements to merge", { type: "info" });
        return;
      }

      let count = 0;
      for (const el of elements) {
        const newId = api.v1.uuid();
        // Build content including want/need/relationship if present
        const parts = [el.name];
        if (el.content) parts.push(el.content);
        if (el.want) parts.push(`Want: ${el.want}`);
        if (el.need) parts.push(`Need: ${el.need}`);
        if (el.relationship) parts.push(`Relationship: ${el.relationship}`);
        const content = parts.join("\n");

        await api.v1.storyStorage.set(`dulfs-item-${newId}`, content);
        dispatch(dulfsItemAdded({ fieldId: el.fieldId, item: { id: newId, fieldId: el.fieldId } }));
        count++;
      }

      dispatch(phaseTransitioned({ phase: "merged" }));
      api.v1.log(`[crucible] Merged ${count} elements to DULFS`);
      api.v1.ui.toast(`Merged ${count} world elements to DULFS`, { type: "success" });
    },
  );

  // Stop crucible pipeline on cancellation
  subscribeEffect(
    matchesAction(requestCancelled),
    (action) => {
      const state = getState();
      if (state.crucible.phase !== "building" && state.crucible.phase !== "expanding") return;

      const { requestId } = action.payload;
      const crucibleTypes = new Set([
        "crucibleStructuralGoal", "cruciblePrereqs",
        "crucibleElements", "crucibleExpansion",
      ]);
      if (
        state.runtime.activeRequest?.id === requestId &&
        crucibleTypes.has(state.runtime.activeRequest?.type || "")
      ) {
        api.v1.log("[crucible] Pipeline cancelled, staying in current phase for retry");
      }
    },
  );

  // Save Story Effect (Autosave)
  subscribeEffect(
    (action) =>
      action.type.startsWith("story/") ||
      action.type.startsWith("brainstorm/") ||
      action.type.startsWith("crucible/"),
    async (_action, { getState }) => {
      try {
        const state = getState();
        const persistData = {
          story: state.story,
          brainstorm: state.brainstorm,
          crucible: state.crucible,
        };
        api.v1.storyStorage.set("kse-persist", persistData);
      } catch (e) {
        /* ignore */
      }
    },
  );

  // Lorebook Sync: Item Added
  subscribeEffect(
    matchesAction(dulfsItemAdded),
    async (action) => {
      const { fieldId, item } = action.payload;
      const content =
        (await api.v1.storyStorage.get(`dulfs-item-${item.id}`)) || "";

      const name = extractDulfsItemName(String(content), fieldId);

      const categoryId = await ensureCategory(fieldId);
      await api.v1.lorebook.createEntry({
        id: item.id,
        category: categoryId,
        displayName: name,
        keys: [],
        enabled: true,
      });
    },
  );

  // Lorebook Sync: Item Removed
  subscribeEffect(matchesAction(dulfsItemRemoved), async (action) => {
    const { fieldId, itemId } = action.payload;

    await api.v1.lorebook.removeEntry(itemId);
    await api.v1.storyStorage.set(`dulfs-item-${itemId}`, null);

    const categoryId = await findCategory(fieldId);
    if (categoryId) {
      const entries = await api.v1.lorebook.entries(categoryId);
      if (entries.length === 0) {
        await api.v1.lorebook.removeCategory(categoryId);
      }
    }
  });

  // Lorebook Sync & Storage Cleanup: Story Cleared
  subscribeEffect(
    (action) => action.type === storyCleared.type,
    async (_action, { dispatch }) => {
      const categories = await api.v1.lorebook.categories();
      const seCategories = categories.filter((c) =>
        c.name?.startsWith(SE_CATEGORY_PREFIX),
      );

      for (const category of seCategories) {
        const entries = await api.v1.lorebook.entries(category.id);
        for (const entry of entries) {
          await api.v1.lorebook.removeEntry(entry.id);
        }
        await api.v1.lorebook.removeCategory(category.id);
      }

      const allEntries = await api.v1.lorebook.entries();
      const marker = allEntries.find(
        (e) => e.displayName === SE_ERATO_MARKER_NAME,
      );
      if (marker) {
        await api.v1.lorebook.removeEntry(marker.id);
      }

      const allKeys = await api.v1.storyStorage.list();
      const patternsToRemove = [
        /^kse-field-/,
        /^kse-sync-/,
        /^kse-section-/,
        /^draft-/,
        /^dulfs-item-/,
        /^se-bs-input$/,
        /^cr-/,
        /^lb-/,
      ];

      for (const key of allKeys) {
        if (patternsToRemove.some((pattern) => pattern.test(key))) {
          await api.v1.storyStorage.remove(key);
        }
      }

      dispatch(queueCleared());
    },
  );

  // Intent: Lorebook Content Generation
  subscribeEffect(
    matchesAction(uiLorebookContentGenerationRequested),
    async (action, { dispatch, getState }) => {
      const { requestId } = action.payload;
      const { selectedEntryId } = getState().ui.lorebook;

      if (!selectedEntryId) {
        api.v1.log(
          "[effects] No lorebook entry selected for content generation",
        );
        return;
      }

      const messageFactory = createLorebookContentFactory(
        getState,
        selectedEntryId,
      );

      dispatch(
        generationSubmitted({
          requestId,
          messageFactory,
          params: { model: "glm-4-6", max_tokens: 512 },
          target: { type: "lorebookContent", entryId: selectedEntryId },
          prefillBehavior: "trim",
        }),
      );
    },
  );

  // Intent: Lorebook Keys Generation
  subscribeEffect(
    matchesAction(uiLorebookKeysGenerationRequested),
    async (action, { dispatch, getState }) => {
      const { requestId } = action.payload;
      const { selectedEntryId } = getState().ui.lorebook;

      if (!selectedEntryId) {
        api.v1.log("[effects] No lorebook entry selected for keys generation");
        return;
      }

      const keysPayload = await buildLorebookKeysPayload(getState, selectedEntryId, requestId);
      dispatch(generationSubmitted(keysPayload));
    },
  );

  // Intent: Lorebook Item Generation
  subscribeEffect(
    matchesAction(uiLorebookItemGenerationRequested),
    async (action, { dispatch, getState }) => {
      const { entryId, contentRequestId, keysRequestId } = action.payload;

      dispatch(
        requestQueued({
          id: contentRequestId,
          type: "lorebookContent",
          targetId: entryId,
        }),
      );
      dispatch(
        requestQueued({
          id: keysRequestId,
          type: "lorebookKeys",
          targetId: entryId,
        }),
      );

      const contentFactory = createLorebookContentFactory(getState, entryId);
      dispatch(
        generationSubmitted({
          requestId: contentRequestId,
          messageFactory: contentFactory,
          params: { model: "glm-4-6", max_tokens: 512 },
          target: { type: "lorebookContent", entryId },
          prefillBehavior: "trim",
        }),
      );

      const keysPayload = await buildLorebookKeysPayload(getState, entryId, keysRequestId);
      dispatch(generationSubmitted(keysPayload));
    },
  );

  // Intent: Lorebook Refine
  subscribeEffect(
    matchesAction(uiLorebookRefineRequested),
    async (action, { dispatch, getState }) => {
      const { requestId } = action.payload;
      const { selectedEntryId } = getState().ui.lorebook;

      if (!selectedEntryId) {
        api.v1.log("[effects] No lorebook entry selected for refinement");
        return;
      }

      const getInstructions = async () =>
        String(
          (await api.v1.storyStorage.get(IDS.LOREBOOK.REFINE_INSTRUCTIONS_RAW)) ||
          "",
        );
      const messageFactory = createLorebookRefineFactory(
        getState,
        selectedEntryId,
        getInstructions,
      );

      dispatch(
        generationSubmitted({
          requestId,
          messageFactory,
          params: { model: "glm-4-6", max_tokens: 700 },
          target: { type: "lorebookRefine", entryId: selectedEntryId },
          prefillBehavior: "trim",
        }),
      );
    },
  );
}
