import { Store, matchesAction } from "../../../lib/nai-store";
import {
  RootState,
  BrainstormMessage,
  GenerationStrategy,
  AppDispatch,
} from "./types";
import { GenX } from "../../../lib/gen-x";
import { registerSegaEffects } from "./effects/sega";
import {
  uiBrainstormSubmitUserMessage,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
  messageAdded,
  messageUpdated,
  generationSubmitted,
  uiCancelRequest,
  requestsSynced,
  requestQueued,
  stateUpdated,
  uiBrainstormMessageEditBegin,
  uiBrainstormMessageEditEnd,
  editingMessageIdSet,
  uiBrainstormRetryGeneration,
  pruneHistory,
  uiGenerationRequested,
  dulfsItemRemoved,
  storyCleared,
  uiLorebookContentGenerationRequested,
  uiLorebookKeysGenerationRequested,
  uiLorebookItemGenerationRequested,
  uiLorebookRefineRequested,
  requestCancelled,
  requestCompleted,
} from "./index";
import {
  createLorebookContentFactory,
  createLorebookKeysFactory,
  createLorebookRefineFactory,
} from "../utils/lorebook-strategy";
import {
  buildBrainstormStrategy,
  buildCanonStrategy,
  buildDulfsListStrategy,
  buildATTGStrategy,
  buildStyleStrategy,
  extractDulfsItemName,
} from "../utils/context-builder";
import { IDS } from "../../ui/framework/ids";
import {
  DulfsFieldID,
  FieldID,
  FIELD_CONFIGS,
} from "../../config/field-definitions";
import { getHandler } from "./effects/generation-handlers";

// Lorebook sync constants
const SE_CATEGORY_PREFIX = "SE: ";

// Helper: Find or create a category for a DULFS field
async function ensureCategory(fieldId: DulfsFieldID): Promise<string> {
  const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
  const name = `${SE_CATEGORY_PREFIX}${config?.label || fieldId}`;

  const categories = await api.v1.lorebook.categories();
  const existing = categories.find((c) => c.name === name);
  if (existing) return existing.id;

  return api.v1.lorebook.createCategory({
    id: api.v1.uuid(),
    name,
    enabled: true,
    settings: {
      entryHeader: "----"
    }
  });
}

// Helper: Find a category for a DULFS field (returns null if not found)
async function findCategory(fieldId: DulfsFieldID): Promise<string | null> {
  const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
  const name = `${SE_CATEGORY_PREFIX}${config?.label || fieldId}`;
  const categories = await api.v1.lorebook.categories();
  return categories.find((c) => c.name === name)?.id || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Generation Effect Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the prefix text for resumption scenarios
 */
function resolvePrefix(
  strategy: GenerationStrategy,
  getState: () => RootState,
): string {
  const { prefixBehavior, assistantPrefill, target, messages } = strategy;

  if (prefixBehavior !== "keep") return "";

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
    api.v1.log(`[resolvePrefix] lorebookKeys: prefixBehavior=${prefixBehavior}, assistantPrefill="${assistantPrefill}"`);
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
    (action) => action.type === uiBrainstormMessageEditEnd().type,
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
    (action) => action.type === uiBrainstormSubmitUserMessage().type,
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
      let accumulatedText = resolvePrefix(strategy, getState);

      // 2. Determine what to pass to GenX: factory or messages
      const messagesOrFactory = messageFactory || messages;
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
        await genX.generate(
          messagesOrFactory,
          { ...params, taskId: requestId },
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
      } catch (error: any) {
        api.v1.log(`[effects] Generation error for ${requestId}:`, error);
        generationSucceeded = false;
      }

      // 6. Check cancellation and dispatch completion
      const wasCancelled = checkCancellation(requestId, getState);
      if (wasCancelled) {
        api.v1.log(`[effects] Generation was cancelled for ${requestId}`);
        generationSucceeded = false;
      } else if (generationSucceeded) {
        api.v1.log(
          `[effects] Generation completed successfully for ${requestId}`,
        );
        dispatch(requestCompleted({ requestId }));
      }

      // 7. Run completion handler
      await handler.completion({
        target,
        getState,
        accumulatedText,
        generationSucceeded,
        dispatch,
        originalContent: rollbackState.content,
        originalKeys: rollbackState.keys,
      });

      // 8. Show toast notification for Story Engine generations
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

  // Intent: Sync GenX State
  subscribeEffect(
    matchesAction(stateUpdated),
    async (_action, { dispatch, getState }) => {
      const state = getState();
      const { queue, activeRequest } = state.runtime;
      const allRequests = [...queue];
      if (activeRequest) allRequests.push(activeRequest);

      // If we have no requests tracking, nothing to sync (unless we want to clear ghosts?)
      // If GenX has nothing, and we have requests, they might be done.
      if (allRequests.length === 0) return;

      const newQueue: typeof queue = [];
      let newActive: typeof activeRequest = null;

      for (const req of allRequests) {
        const status = genX.getTaskStatus(req.id);
        if (status === "processing") {
          newActive = req;
        } else if (status === "queued") {
          newQueue.push(req);
        } else {
          // 'not_found' in GenX - keep in queue if it was queued in store
          // This handles items pending submission (not yet in GenX) and
          // prevents race conditions when multiple items are queued together
          if (req.status === "queued") {
            newQueue.push(req);
          }
          // If it was processing (activeRequest) and is now not_found, it completed - drop it
        }
      }

      // Check if changed
      const currentQueueIds = queue.map((r) => r.id).join(",");
      const newQueueIds = newQueue.map((r) => r.id).join(",");
      const currentActiveId = activeRequest?.id;
      const newActiveId = newActive?.id;

      if (currentQueueIds !== newQueueIds || currentActiveId !== newActiveId) {
        dispatch(requestsSynced({ queue: newQueue, activeRequest: newActive }));
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
      genX.cancelCurrent();
    }
  });

  // Intent: Cancellation (global - cancels current task)
  subscribeEffect(
    (action) => action.type === uiRequestCancellation().type,
    (_action, { dispatch, getState }) => {
      // Mark the active request as cancelled
      const activeRequest = getState().runtime.activeRequest;
      if (activeRequest) {
        dispatch(requestCancelled({ requestId: activeRequest.id }));
      }

      genX.cancelCurrent();
    },
  );

  // Intent: User Presence
  subscribeEffect(
    (action) => action.type === uiUserPresenceConfirmed().type,
    () => {
      genX.userInteraction();
    },
  );

  // Save Story Effect (Autosave)
  subscribeEffect(
    (action) =>
      action.type.startsWith("story/") || action.type.startsWith("brainstorm/"),
    async (action, { getState }) => {
      if (action.type === "story/loadRequested") return; // Don't save on load trigger
      try {
        // We save the 'story' slice.
        // Do we save 'brainstorm' slice?
        // Legacy saved the whole story state which included brainstorm messages.
        // Here they are separate. We should persist both.
        // We can use 'kse-story-data' for story and 'kse-brainstorm-data' for brainstorm?
        // Or combine them into one object for storage.
        const state = getState();
        const persistData = {
          story: state.story,
          brainstorm: state.brainstorm,
        };
        // Debouncing? NAIStore doesn't debounce.
        // Ideally we debounce. For now, fire and forget (NovelAI storage handles some key-based debounce? No)
        // We'll just save. It's local storage usually.
        api.v1.storyStorage.set("kse-persist", persistData);
      } catch (e) {
        /* ignore */
      }
    },
  );

  // Lorebook Sync: Item Added - imported from dulfsItemAdded action
  // Note: dulfsItemAdded is now dispatched from list.ts handler
  subscribeEffect(
    (action) => action.type === "story/dulfsItemAdded",
    async (action: any) => {
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
    (action) => action.type === storyCleared().type,
    async () => {
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
      ];

      for (const key of allKeys) {
        if (patternsToRemove.some((pattern) => pattern.test(key))) {
          await api.v1.storyStorage.remove(key);
        }
      }
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
          prefixBehavior: "trim",
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

      // Get entry displayName for prefill (entry name should be first key)
      const entry = await api.v1.lorebook.entry(selectedEntryId);
      const displayName = entry?.displayName || "Unnamed Entry";

      // Factory fetches entry.text at execution time, not now
      const messageFactory = createLorebookKeysFactory(selectedEntryId);

      dispatch(
        generationSubmitted({
          requestId,
          messageFactory,
          params: { model: "glm-4-6", max_tokens: 64 }, // Base params, factory can override
          target: { type: "lorebookKeys", entryId: selectedEntryId },
          prefixBehavior: "keep", // Keep prefill (entry name) as first key
          assistantPrefill: `${displayName}, `,
        }),
      );
    },
  );

  // Intent: Lorebook Item Generation (queues both content + keys from DULFS list)
  subscribeEffect(
    matchesAction(uiLorebookItemGenerationRequested),
    async (action, { dispatch, getState }) => {
      const { entryId, contentRequestId, keysRequestId } = action.payload;

      // Get entry displayName for keys prefill
      const entry = await api.v1.lorebook.entry(entryId);
      const displayName = entry?.displayName || "Unnamed Entry";

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
          prefixBehavior: "trim",
        }),
      );

      // Queue keys generation (JIT factory ensures fresh content is used)
      const keysFactory = createLorebookKeysFactory(entryId);
      dispatch(
        generationSubmitted({
          requestId: keysRequestId,
          messageFactory: keysFactory,
          params: { model: "glm-4-6", max_tokens: 64 },
          target: { type: "lorebookKeys", entryId },
          prefixBehavior: "keep", // Keep prefill (entry name) as first key
          assistantPrefill: `${displayName}, `,
        }),
      );
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
        selectedEntryId,
        getInstructions,
      );

      dispatch(
        generationSubmitted({
          requestId,
          messageFactory,
          params: { model: "glm-4-6", max_tokens: 700 },
          target: { type: "lorebookRefine", entryId: selectedEntryId },
          prefixBehavior: "trim",
        }),
      );
    },
  );
}
