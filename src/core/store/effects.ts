import { Store, matchesAction } from "nai-store";
import {
  RootState,
  BrainstormMessage,
  GenerationStrategy,
  AppDispatch,
} from "./types";
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
  pruneHistory,
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
  goalsConfirmed,
  crucibleChainRequested,
  chainStarted,
  activeGoalAdvanced,
  autoChainStarted,
  autoChainStopped,
  crucibleDirectorRequested,
} from "./index";
import {
  createLorebookContentFactory,
  createLorebookRefineFactory,
  buildLorebookKeysPayload,
} from "../utils/lorebook-strategy";
import {
  buildBrainstormStrategy,
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
  buildCrucibleChainStrategy,
} from "../utils/crucible-strategy";
import { buildCrucibleBuildStrategy } from "../utils/crucible-builder-strategy";
import { buildCrucibleDirectorStrategy } from "../utils/crucible-director-strategy";
import { resetStreamTranscript } from "./effects/handlers/crucible";
import { IDS } from "../../ui/framework/ids";
import {
  DulfsFieldID,
  FieldID,
  FIELD_CONFIGS,
} from "../../config/field-definitions";
import { getHandler } from "./effects/generation-handlers";

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
  // Erato has no clean boundary between lorebook (pos 400) and story text (pos 0).
  // A forced-activation entry with "***\n" acts as a visual separator.
  // The user must manually set its insertion position to 1.
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
      'Created "SE: End of Lorebook" entry. Set its insertion position to 1.',
      { type: "info" },
    );
  } else if (!erato && existingMarker) {
    await api.v1.lorebook.removeEntry(existingMarker.id);
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
    const message = state.brainstorm.messages.find(
      (m) => m.id === target.messageId,
    );
    return message?.content || "";
  }

  if (target.type === "field") {
    // Use explicit assistantPrefill if provided (for factory-based strategies)
    if (assistantPrefill) return assistantPrefill;

    // Fallback: extract from messages array
    if (messages) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === "assistant" && lastMsg.content) {
        return lastMsg.content;
      }
    }
  }

  // For lorebookKeys, use explicit assistantPrefill (entry name as first key)
  if (target.type === "lorebookKeys") {
    if (assistantPrefill) return assistantPrefill;
  }

  // Crucible targets use explicit assistantPrefill (JSON anchors)
  if (target.type === "crucibleDirection" || target.type === "crucibleGoal" || target.type === "crucibleChain" || target.type === "crucibleBuild") {
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
    case "crucibleChain":
      return `crucible-chain:${target.goalId.slice(0, 8)}`;
    case "crucibleBuild":
      return `crucible-build:${target.goalId.slice(0, 8)}`;
    case "crucibleDirector":
      return "crucible-director";
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
      const newMessage = state.brainstorm.messages.find((m) => m.id === newId);
      if (newMessage) {
        // Seed the storage so the input shows the current content
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
      const storageKey = IDS.BRAINSTORM.INPUT;
      const content = (await api.v1.storyStorage.get(storageKey)) || "";

      // Clear Input
      await api.v1.storyStorage.set(storageKey, "");
      api.v1.ui.updateParts([{ id: IDS.BRAINSTORM.INPUT, value: "" }]); // Reset UI

      let assistantId;

      // Add User Message if user typed something
      if (content.trim()) {
        const userMsg: BrainstormMessage = {
          id: api.v1.uuid(),
          role: "user",
          content: String(content),
        };
        dispatch(messageAdded(userMsg));
      }

      const lastMessage = getState().brainstorm.messages.at(-1);
      if (lastMessage?.role == "user") {
        // User sent a message
        // Add Assistant Placeholder
        assistantId = api.v1.uuid();
        const assistantMsg: BrainstormMessage = {
          id: assistantId,
          role: "assistant",
          content: "",
        };
        dispatch(messageAdded(assistantMsg));
      } else if (lastMessage?.role == "assistant") {
        // Continue the most recent assistant message.
        assistantId = lastMessage.id;
      } else {
        // There are no messages
        return;
      }

      // Request Generation - use factory pattern for JIT message building
      const strategy = buildBrainstormStrategy(getState, assistantId);
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

      // Prune history (keep up to user, remove assistant response if target is assistant)
      // Or if target is user, keep up to that user message.
      // The logic inside pruneHistory handles role-based pruning.
      dispatch(pruneHistory(messageId));

      // After pruning, we need to generate a response.
      // 1. If we retried a User message, we pruned everything after it. We need an Assistant response.
      // 2. If we retried an Assistant message, we pruned it. We need a new Assistant response.

      const state = getState(); // Get updated state
      const lastMessage =
        state.brainstorm.messages[state.brainstorm.messages.length - 1];

      let assistantId: string;

      if (lastMessage && lastMessage.role === "assistant") {
        // Should not happen if we just pruned to generate?
        // If we pruned an assistant message, the last one should be User.
        // If we pruned a user message, the last one is that User message.
        // So in both cases we need a new Assistant placeholder.
        // Wait, if we are "retrying" a user message, do we want to edit it? No, that's Edit.
        // Retry on User message usually means "Regenerate the response to this message".
        // Retry on Assistant message means "Regenerate this response".
        assistantId = api.v1.uuid();
      } else {
        // Last is user (or system), add assistant placeholder
        assistantId = api.v1.uuid();
        dispatch(
          messageAdded({
            id: assistantId,
            role: "assistant",
            content: "",
          }),
        );
      }

      // Request Generation - use factory pattern for JIT message building
      const strategy = buildBrainstormStrategy(getState, assistantId);
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
        // Single field (e.g., Canon) or DULFS item (format: "fieldId:itemId")
        if (targetId.includes(":")) {
          // DULFS item content generation (skip for now per requirements)
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

        strategy.requestId = requestId; // Use store's ID for queue tracking
        dispatch(generationSubmitted(strategy));
      } else if (type === "list") {
        // DULFS list generation (generate names)
        const strategy = buildDulfsListStrategy(getState, targetId);
        strategy.requestId = requestId; // Use store's ID for queue tracking
        dispatch(generationSubmitted(strategy));
      } else if (type === "bootstrap") {
        // Bootstrap generation - scene opening instruction
        const strategy = buildBootstrapStrategy(getState, requestId);
        dispatch(generationSubmitted(strategy));
      }
      // "brainstorm" type is handled via separate submit/retry effects
    },
  );

  // Intent: GenX Generation (using handler map pattern)
  subscribeEffect(
    matchesAction(generationSubmitted),
    async (action, { dispatch, getState }) => {
      const strategy = action.payload;
      const { requestId, messages, messageFactory, params, target } = strategy;

      // 1. Resolve prefix for resumption
      let accumulatedText = resolvePrefill(strategy, getState);

      // 2. Determine what to pass to GenX: factory or messages
      // Wrap with instrumentation to log uncached token counts
      let messagesOrFactory: Message[] | MessageFactory | undefined;
      let resolvedMessages: Message[] | undefined;
      const apiParams = { ...params };

      if (messageFactory && strategy.continuation) {
        // Continuation strategies: resolve eagerly — need messages for continuation rebuilds
        const result = await messageFactory();
        resolvedMessages = result.messages;
        if (result.params) Object.assign(apiParams, result.params);
        const uncached = await api.v1.script.countUncachedInputTokens(result.messages, "glm-4-6");
        api.v1.log(`[cache] ${cacheLabel(target)}: ${uncached} uncached tokens`);
        messagesOrFactory = resolvedMessages;
      } else if (messageFactory) {
        // Wrap factory to instrument after resolution
        messagesOrFactory = async () => {
          const result = await messageFactory();
          const uncached = await api.v1.script.countUncachedInputTokens(result.messages, "glm-4-6");
          api.v1.log(`[cache] ${cacheLabel(target)}: ${uncached} uncached tokens`);
          return result;
        };
      } else if (messages) {
        // Instrument static messages inline
        const uncached = await api.v1.script.countUncachedInputTokens(messages, "glm-4-6");
        api.v1.log(`[cache] ${cacheLabel(target)}: ${uncached} uncached tokens`);
        messagesOrFactory = messages;
      }
      if (!messagesOrFactory) {
        api.v1.log("Generation failed: no messages or factory provided");
        return;
      }

      // 3. Queue lorebook requests if needed (for button state tracking)
      queueLorebookRequestIfNeeded(target, requestId, getState, dispatch);

      // 4. Capture rollback state for lorebook
      const rollbackState = await captureRollbackState(target);

      // 5. Get handler for this target type
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

            // Rebuild messages with accumulated text as assistant message
            const continuationMessages: Message[] = [
              ...resolvedMessages.slice(0, -1), // everything except original prefill
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

      // 6. Check cancellation
      const wasCancelled = checkCancellation(requestId, getState);
      if (wasCancelled) {
        api.v1.log(`[effects] Generation was cancelled for ${requestId}`);
        generationSucceeded = false;
      }

      // 7. Run completion handler BEFORE signaling completion.
      // SEGA schedules the next task on requestCompleted — the handler must
      // finish updating state (e.g. adding DULFS items) first, otherwise the
      // scheduler sees stale counts and re-schedules the same category.
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

      // 8. Signal completion (after handler has updated state).
      // Always dispatch — this clears activeRequest so UI buttons reset.
      // SEGA relies on this signal to advance — without it, SEGA gets stuck.
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

      // 9. Show toast notification for Story Engine generations
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

    // Mark as cancelled in state (for detection after generation completes)
    dispatch(requestCancelled({ requestId }));

    // Try to cancel if queued
    genX.cancelQueued(requestId);
    // If it's the current one?
    const status = genX.getTaskStatus(requestId);
    if (status === "processing") {
      genX.cancelAll();
    }
  });

  // Intent: Cancellation (global - cancels current task)
  subscribeEffect(
    (action) => action.type === uiRequestCancellation.type,
    (_action, { dispatch, getState }) => {
      // Mark the active request as cancelled
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
      // Sync intent from storyStorage (user may have edited it)
      const editedDirection = String(
        (await api.v1.storyStorage.get("cr-direction")) || "",
      );
      if (editedDirection) {
        dispatch(directionSet({ direction: editedDirection }));
      }

      // Create 3 empty goals and queue generation for each
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
    },
  );

  // Intent: Goals Confirmed → init chains for selected goals, start auto-chaining
  subscribeEffect(
    matchesAction(goalsConfirmed),
    (_action, { dispatch, getState: getLatest }) => {
      resetStreamTranscript();
      const state = getLatest();
      const starredGoals = state.crucible.goals.filter((g) => g.starred);
      if (starredGoals.length === 0) {
        api.v1.log("[crucible] No goals starred");
        return;
      }

      // Init chains for all starred goals
      for (const goal of starredGoals) {
        dispatch(chainStarted({ goalId: goal.id }));
      }

      // Start auto-chaining with the first goal
      dispatch(autoChainStarted());
      dispatch(crucibleChainRequested());
    },
  );

  // Intent: Crucible Chain Requested → queue chain generation for activeGoalId
  subscribeEffect(
    matchesAction(crucibleChainRequested),
    async (_action, { dispatch, getState: getLatest }) => {
      const state = getLatest();
      const { activeGoalId } = state.crucible;
      if (!activeGoalId) {
        api.v1.log("[crucible] Chain requested but no active goal");
        return;
      }

      const strategy = await buildCrucibleChainStrategy(getState, activeGoalId);
      dispatch(
        requestQueued({
          id: strategy.requestId,
          type: "crucibleChain",
          targetId: activeGoalId,
        }),
      );
      dispatch(generationSubmitted(strategy));
    },
  );

  // Intent: Crucible Stop → cancel active request + stop auto-chain
  subscribeEffect(
    matchesAction(crucibleStopRequested),
    (_action, { dispatch, getState: getLatest }) => {
      const state = getLatest();
      if (state.crucible.autoChaining) {
        dispatch(autoChainStopped());
      }
      const activeRequest = state.runtime.activeRequest;
      if (activeRequest && (activeRequest.type === "crucibleDirection" || activeRequest.type === "crucibleGoal" || activeRequest.type === "crucibleChain" || activeRequest.type === "crucibleBuild" || activeRequest.type === "crucibleDirector")) {
        dispatch(requestCancelled({ requestId: activeRequest.id }));
        genX.cancelAll();
      }
    },
  );

  // Intent: Crucible Reset → clear stream transcript + all cr- storyStorage keys + view
  subscribeEffect(
    matchesAction(crucibleReset),
    async () => {
      resetStreamTranscript();

      // Remove all cr- prefixed storyStorage keys (goals, scenes, sections, etc.)
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

  // Intent: Crucible Merge → write builder elements to DULFS
  subscribeEffect(
    matchesAction(crucibleMergeRequested),
    async (_action, { dispatch, getState: getLatest }) => {
      const state = getLatest();
      const { elements } = state.crucible.builder;
      if (elements.length === 0) {
        api.v1.log("[crucible] Merge requested but no elements");
        return;
      }

      let count = 0;
      for (const el of elements) {
        const newId = api.v1.uuid();
        const content = el.content ? `${el.name}: ${el.content}` : el.name;

        // Write to storyStorage (lorebook sync effect reads this)
        await api.v1.storyStorage.set(`dulfs-item-${newId}`, content);

        // Add to DULFS state — triggers lorebook sync effect automatically
        dispatch(dulfsItemAdded({ fieldId: el.fieldId, item: { id: newId, fieldId: el.fieldId } }));
        count++;
      }

      api.v1.log(`[crucible] Merged ${count} elements to DULFS`);
      api.v1.ui.toast(`Merged ${count} world elements to DULFS`, { type: "success" });
    },
  );

  // Intent: Crucible Build Requested → queue builder generation
  subscribeEffect(
    matchesAction(crucibleBuildRequested),
    async (_action, { dispatch, getState: getLatest }) => {
      const state = getLatest();
      const { activeGoalId } = state.crucible;
      if (!activeGoalId) {
        api.v1.log("[crucible] Build requested but no active goal");
        return;
      }

      const strategy = buildCrucibleBuildStrategy(getState, activeGoalId);
      dispatch(
        requestQueued({
          id: strategy.requestId,
          type: "crucibleBuild",
          targetId: activeGoalId,
        }),
      );
      dispatch(generationSubmitted(strategy));
    },
  );

  // Intent: Crucible Director Requested → queue Director assessment
  subscribeEffect(
    matchesAction(crucibleDirectorRequested),
    async (_action, { dispatch }) => {
      const strategy = buildCrucibleDirectorStrategy(getState);
      dispatch(
        requestQueued({
          id: strategy.requestId,
          type: "crucibleDirector",
          targetId: "director",
        }),
      );
      dispatch(generationSubmitted(strategy));
    },
  );

  /** Check if the Director should run before the next solver scene.
   *  Currently disabled — letting Solver/Builder work autonomously.
   *  Director infrastructure remains for manual invocation. */
  function needsDirector(): boolean {
    return false;
  }

  // Auto-chain continuation: interleaved Solver → Builder → (Director?) → Solver loop
  subscribeEffect(
    matchesAction(requestCompleted),
    async () => {
      await api.v1.timers.sleep(150);

      const state = getState();
      if (!state.crucible.autoChaining) return;
      if (state.runtime.activeRequest || state.runtime.queue.length > 0) return;

      const { activeGoalId } = state.crucible;
      if (!activeGoalId) return;

      const chain = state.crucible.chains[activeGoalId];
      if (!chain) return;

      const builderBehind =
        state.crucible.builder.lastProcessedSceneIndex < chain.scenes.length - 1
        && chain.scenes.length > 0;

      // --- Goal complete ---
      if (chain.complete) {
        if (builderBehind) {
          api.v1.log("[crucible] Goal complete, builder behind — catch-up");
          dispatch(crucibleBuildRequested());
          return;
        }
        dispatch(activeGoalAdvanced());
        const updated = getState();
        if (updated.crucible.activeGoalId) {
          api.v1.log(`[crucible] Advanced to goal ${updated.crucible.activeGoalId}`);
          dispatch(crucibleChainRequested());
        } else {
          api.v1.log("[crucible] All goals complete");
          dispatch(autoChainStopped());
        }
        return;
      }

      // --- Normal loop: Solver → Builder → (Director?) → Solver ---
      if (builderBehind) {
        api.v1.log(`[crucible] Builder behind — building`);
        dispatch(crucibleBuildRequested());
        return;
      }

      if (needsDirector()) {
        api.v1.log(`[crucible] Director assessment at scene ${chain.scenes.length}`);
        dispatch(crucibleDirectorRequested());
        return;
      }

      api.v1.log(`[crucible] Continuing solver — scene ${chain.scenes.length}`);
      dispatch(crucibleChainRequested());
    },
  );

  // Stop auto-chain on cancellation
  subscribeEffect(
    matchesAction(requestCancelled),
    (action) => {
      const state = getState();
      if (!state.crucible.autoChaining) return;

      const { requestId } = action.payload;
      if (
        state.runtime.activeRequest?.id === requestId &&
        (state.runtime.activeRequest?.type === "crucibleDirection" || state.runtime.activeRequest?.type === "crucibleChain" || state.runtime.activeRequest?.type === "crucibleGoal" || state.runtime.activeRequest?.type === "crucibleBuild")
      ) {
        dispatch(autoChainStopped());
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

  // Lorebook Sync: Item Added - imported from dulfsItemAdded action
  // Note: dulfsItemAdded is now dispatched from list.ts handler
  subscribeEffect(
    matchesAction(dulfsItemAdded),
    async (action) => {
      const { fieldId, item } = action.payload;
      const content =
        (await api.v1.storyStorage.get(`dulfs-item-${item.id}`)) || "";

      // Extract name from full content using field-specific parser
      const name = extractDulfsItemName(String(content), fieldId);

      const categoryId = await ensureCategory(fieldId);
      await api.v1.lorebook.createEntry({
        id: item.id,
        category: categoryId,
        displayName: name,
        keys: [], // Keys are generated separately via lorebook generation
        enabled: true,
      });
    },
  );

  // Lorebook Sync: Item Removed
  subscribeEffect(matchesAction(dulfsItemRemoved), async (action) => {
    const { fieldId, itemId } = action.payload;

    // Remove lorebook entry (same ID as item)
    await api.v1.lorebook.removeEntry(itemId);

    // Clean up storage
    await api.v1.storyStorage.set(`dulfs-item-${itemId}`, null);

    // Remove empty category
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
      // Clear lorebook entries and categories
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

      // Remove Erato marker entry (uncategorized, so not caught above)
      const allEntries = await api.v1.lorebook.entries();
      const marker = allEntries.find(
        (e) => e.displayName === SE_ERATO_MARKER_NAME,
      );
      if (marker) {
        await api.v1.lorebook.removeEntry(marker.id);
      }

      // Clear storage keys used by storageKey-based UI components
      // This prevents orphaned keys from polluting the user's story storage
      const allKeys = await api.v1.storyStorage.list();
      const patternsToRemove = [
        /^kse-field-/, // ATTG, Style field content
        /^kse-sync-/, // Sync checkbox states
        /^kse-section-/, // Collapsible section states
        /^draft-/, // Draft content (text fields, brainstorm messages)
        /^dulfs-item-/, // DULFS item content
        /^se-bs-input$/, // Brainstorm input
        /^cr-/, // Crucible (goals, scenes, sections, direction, etc.)
        /^lb-/, // Lorebook drafts
      ];

      for (const key of allKeys) {
        if (patternsToRemove.some((pattern) => pattern.test(key))) {
          await api.v1.storyStorage.remove(key);
        }
      }

      // Flush runtime queue so border selectors re-evaluate
      // (ATTG/Style check storyStorage which is now clean)
      dispatch(queueCleared());
    },
  );

  // Intent: Lorebook Content Generation (uses factory for JIT building)
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

      // Create factory that builds strategy at execution time
      const messageFactory = createLorebookContentFactory(
        getState,
        selectedEntryId,
      );

      dispatch(
        generationSubmitted({
          requestId,
          messageFactory,
          params: { model: "glm-4-6", max_tokens: 512 }, // Base params, factory can override
          target: { type: "lorebookContent", entryId: selectedEntryId },
          prefillBehavior: "trim",
        }),
      );
    },
  );

  // Intent: Lorebook Keys Generation (CRITICAL: uses factory to get fresh entry.text)
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

  // Intent: Lorebook Item Generation (queues both content + keys from DULFS list)
  subscribeEffect(
    matchesAction(uiLorebookItemGenerationRequested),
    async (action, { dispatch, getState }) => {
      const { entryId, contentRequestId, keysRequestId } = action.payload;

      // Queue BOTH items in store first for immediate visibility
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

      // Now dispatch generation requests (they'll skip re-queuing since already in queue)
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

      // Queue keys generation (JIT factory ensures fresh content is used)
      const keysPayload = await buildLorebookKeysPayload(getState, entryId, keysRequestId);
      dispatch(generationSubmitted(keysPayload));
    },
  );

  // Intent: Lorebook Refine (modify existing entry with natural language instructions)
  subscribeEffect(
    matchesAction(uiLorebookRefineRequested),
    async (action, { dispatch, getState }) => {
      const { requestId } = action.payload;
      const { selectedEntryId } = getState().ui.lorebook;

      if (!selectedEntryId) {
        api.v1.log("[effects] No lorebook entry selected for refinement");
        return;
      }

      // Create factory that fetches instructions at execution time
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
