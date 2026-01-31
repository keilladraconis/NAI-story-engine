import { Store } from "../../../lib/nai-store";
import { RootState, BrainstormMessage } from "./types";
import { GenX } from "../../../lib/gen-x";
import {
  uiBrainstormSubmitUserMessage,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
  messageAdded,
  messageUpdated,
  uiRequestGeneration,
  uiCancelRequest,
  requestsSynced,
  requestQueued,
  stateUpdated,
  uiBrainstormMessageEditBegin,
  uiBrainstormMessageEditEnd,
  editingMessageIdSet,
  uiBrainstormRetryGeneration,
  pruneHistory,
  generationRequested,
  fieldUpdated,
  dulfsItemAdded,
  dulfsItemRemoved,
  storyCleared,
  lorebookContentGenerationRequested,
  lorebookKeysGenerationRequested,
  lorebookItemGenerationRequested,
  requestCancelled,
  cancelledRequestCleared,
} from "./index";
import {
  createLorebookContentFactory,
  createLorebookKeysFactory,
} from "../utils/lorebook-strategy";
import {
  buildBrainstormStrategy,
  buildStoryPromptStrategy,
  buildDulfsListStrategy,
  buildATTGStrategy,
  buildStyleStrategy,
} from "../utils/context-builder";
import { IDS } from "../../ui/framework/ids";
import {
  DulfsFieldID,
  FieldID,
  FIELD_CONFIGS,
} from "../../config/field-definitions";

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
  });
}

// Helper: Find a category for a DULFS field (returns null if not found)
async function findCategory(fieldId: DulfsFieldID): Promise<string | null> {
  const config = FIELD_CONFIGS.find((c) => c.id === fieldId);
  const name = `${SE_CATEGORY_PREFIX}${config?.label || fieldId}`;
  const categories = await api.v1.lorebook.categories();
  return categories.find((c) => c.name === name)?.id || null;
}

export function registerEffects(store: Store<RootState>, genX: GenX) {
  const { subscribeEffect } = store;

  // Intent: Brainstorm Edit Begin
  subscribeEffect(
    (action) => action.type === uiBrainstormMessageEditBegin({} as any).type,
    async (action, { dispatch, getState }) => {
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
    async (_action, { dispatch, getState }) => {
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

      // Request Generation
      const state = getState();
      const strategy = await buildBrainstormStrategy(state, assistantId);
      dispatch(uiRequestGeneration(strategy));
    },
  );

  // Intent: Brainstorm Retry
  subscribeEffect(
    (action) => action.type === uiBrainstormRetryGeneration({} as any).type,
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

      const strategy = await buildBrainstormStrategy(state, assistantId);
      dispatch(uiRequestGeneration(strategy));
    },
  );

  // Intent: Field/List Generation
  subscribeEffect(
    (action) => action.type === generationRequested({} as any).type,
    async (action, { dispatch, getState }) => {
      const { id: requestId, type, targetId } = action.payload;
      const state = getState();

      if (type === "field") {
        // Single field (e.g., StoryPrompt) or DULFS item (format: "fieldId:itemId")
        if (targetId.includes(":")) {
          // DULFS item content generation (skip for now per requirements)
          return;
        }

        let strategy;
        if (targetId === FieldID.StoryPrompt) {
          strategy = await buildStoryPromptStrategy(state, targetId);
        } else if (targetId === FieldID.ATTG) {
          strategy = await buildATTGStrategy(state);
        } else if (targetId === FieldID.Style) {
          strategy = await buildStyleStrategy(state);
        } else {
          api.v1.log(
            `[effects] No generation strategy found for field: ${targetId}`,
          );
          return;
        }

        strategy.requestId = requestId; // Use store's ID for queue tracking
        dispatch(uiRequestGeneration(strategy));
      } else if (type === "list") {
        // DULFS list generation (generate names)
        const strategy = await buildDulfsListStrategy(state, targetId);
        strategy.requestId = requestId; // Use store's ID for queue tracking
        dispatch(uiRequestGeneration(strategy));
      }
      // "brainstorm" type is handled via separate submit/retry effects
    },
  );

  // Intent: GenX Generation
  subscribeEffect(
    (action) => action.type === uiRequestGeneration({} as any).type, // Match type only
    async (action, { dispatch, getState }) => {
      const strategy = action.payload;
      const {
        requestId,
        messages,
        messageFactory,
        params,
        target,
        prefixBehavior,
      } = strategy;

      let accumulatedText = "";

      // Handle Prefix (Resumption)
      if (prefixBehavior === "keep" && messages) {
        const state = getState();
        if (target.type === "brainstorm") {
          const message = state.brainstorm.messages.find(
            (m) => m.id === target.messageId,
          );
          if (message) accumulatedText = message.content;
        } else if (target.type === "field") {
          // Use assistant prefill from messages
          const lastMsg = messages[messages.length - 1];
          if (lastMsg?.role === "assistant" && lastMsg.content) {
            accumulatedText = lastMsg.content;
          }
        }
      }

      // Determine what to pass to GenX: factory or messages
      const messagesOrFactory = messageFactory || messages;
      if (!messagesOrFactory) {
        api.v1.log("Generation failed: no messages or factory provided");
        return;
      }

      // Add lorebook requests to queue for button state tracking
      if (target.type === "lorebookContent" || target.type === "lorebookKeys") {
        dispatch(
          requestQueued({
            id: requestId,
            type: target.type,
            targetId: target.entryId,
          }),
        );
      }

      // For lorebook generation, capture original content for rollback on cancellation
      let originalLorebookContent = "";
      let originalLorebookKeys = "";
      if (target.type === "lorebookContent" || target.type === "lorebookKeys") {
        const entry = await api.v1.lorebook.entry(target.entryId);
        if (entry) {
          originalLorebookContent = entry.text || "";
          originalLorebookKeys = entry.keys?.join(", ") || "";
        }
      }

      let generationSucceeded = false;

      try {
        await genX.generate(
          messagesOrFactory,
          { ...params, taskId: requestId }, // Pass requestId to GenX
          (choices, _final) => {
            const text = choices[0]?.text || "";
            if (text) {
              accumulatedText += text;

              if (target.type === "brainstorm") {
                // Stream to UI
                const uiId = IDS.BRAINSTORM.message(target.messageId).TEXT;
                api.v1.ui.updateParts([{ id: uiId, text: accumulatedText }]);
              } else if (target.type === "field") {
                // Plain text fields (ATTG, Style) stream to input value and storyStorage
                if (
                  target.fieldId === FieldID.ATTG ||
                  target.fieldId === FieldID.Style
                ) {
                  const inputId = `input-${target.fieldId}`;
                  const storageKey = `kse-field-${target.fieldId}`;
                  api.v1.ui.updateParts([
                    { id: inputId, value: accumulatedText },
                  ]);
                  api.v1.storyStorage.set(storageKey, accumulatedText);
                } else {
                  // Standard fields stream to text display
                  const uiId = `text-display-${target.fieldId}`;
                  api.v1.ui.updateParts([{ id: uiId, text: accumulatedText }]);
                }
              } else if (target.type === "lorebookContent") {
                // Stream to storageKey - UI auto-updates via binding
                const currentSelected = getState().ui.lorebook.selectedEntryId;
                if (target.entryId === currentSelected) {
                  api.v1.storyStorage.set(
                    IDS.LOREBOOK.CONTENT_DRAFT_RAW,
                    accumulatedText,
                  );
                }
              } else if (target.type === "lorebookKeys") {
                // Stream to storageKey - UI auto-updates via binding
                const currentSelected = getState().ui.lorebook.selectedEntryId;
                if (target.entryId === currentSelected) {
                  api.v1.storyStorage.set(
                    IDS.LOREBOOK.KEYS_DRAFT_RAW,
                    accumulatedText,
                  );
                }
              }
              // List streaming is not displayed (parsed at the end)
            }
          },
          "background",
          await api.v1.createCancellationSignal(),
        );

        // Generation finished (but may have been cancelled)
        generationSucceeded = true;
      } catch (error: any) {
        api.v1.log(`[effects] Generation error for ${requestId}:`, error);
        generationSucceeded = false;
      }

      // Check if this request was cancelled (user clicked cancel button)
      const wasCancelled =
        getState().runtime.cancelledRequestIds.includes(requestId);
      if (wasCancelled) {
        api.v1.log(`[effects] Generation was cancelled for ${requestId}`);
        generationSucceeded = false;
        // Clear the cancelled flag
        dispatch(cancelledRequestCleared({ requestId }));
      } else if (generationSucceeded) {
        api.v1.log(
          `[effects] Generation completed successfully for ${requestId}`,
        );
      }

      // Handle completion based on success/failure
      if (target.type === "brainstorm" && accumulatedText) {
        dispatch(
          messageUpdated({
            id: target.messageId,
            content: accumulatedText,
          }),
        );
      } else if (target.type === "field" && accumulatedText) {
        // Plain text fields (ATTG, Style) save to storyStorage
        if (
          target.fieldId === FieldID.ATTG ||
          target.fieldId === FieldID.Style
        ) {
          const storageKey = `kse-field-${target.fieldId}`;
          await api.v1.storyStorage.set(storageKey, accumulatedText);

          // Trigger sync to Memory / Author's Note if enabled
          if (target.fieldId === FieldID.ATTG) {
            const syncEnabled = await api.v1.storyStorage.get(
              "kse-sync-attg-memory",
            );
            if (syncEnabled) {
              await api.v1.memory.set(accumulatedText);
            }
          } else if (target.fieldId === FieldID.Style) {
            const syncEnabled =
              await api.v1.storyStorage.get("kse-sync-style-an");
            if (syncEnabled) {
              await api.v1.an.set(accumulatedText);
            }
          }
        } else {
          // Standard fields dispatch to state
          dispatch(
            fieldUpdated({
              fieldId: target.fieldId,
              content: accumulatedText,
            }),
          );
        }
      } else if (target.type === "list" && accumulatedText) {
        // Parse generated list and create DULFS items (names only)
        const lines = accumulatedText.split("\n").filter((l) => l.trim());
        for (const line of lines) {
          // Strip bullets, numbers, dashes, and extract clean name
          const match = line.match(/^[\s\-*+•\d.)\]]*(.+)$/);
          if (match) {
            const name = match[1]
              .trim()
              .replace(/^[:\-–—]\s*/, "") // Strip leading colons/dashes
              .replace(/[:\-–—].*$/, "") // Strip trailing descriptions
              .trim();

            if (name) {
              const itemId = api.v1.uuid();

              // Store only the name in storyStorage
              await api.v1.storyStorage.set(`dulfs-item-${itemId}`, name);

              // Dispatch minimal item
              dispatch(
                dulfsItemAdded({
                  fieldId: target.fieldId as DulfsFieldID,
                  item: {
                    id: itemId,
                    fieldId: target.fieldId as DulfsFieldID,
                  },
                }),
              );
            }
          }
        }
      } else if (target.type === "lorebookContent") {
        const currentSelected = getState().ui.lorebook.selectedEntryId;

        if (generationSucceeded && accumulatedText) {
          // Clean output: strip leading delimiter if present
          let cleanedContent = accumulatedText;
          if (cleanedContent.startsWith("----")) {
            cleanedContent = cleanedContent.slice(4).trimStart();
          }

          // Update lorebook entry with generated content
          await api.v1.lorebook.updateEntry(target.entryId, {
            text: cleanedContent,
          });

          // Update draft with cleaned content if viewing this entry
          // (storageKey binding auto-updates UI)
          if (target.entryId === currentSelected) {
            await api.v1.storyStorage.set(
              IDS.LOREBOOK.CONTENT_DRAFT_RAW,
              cleanedContent,
            );
          }
        } else {
          // Cancelled or failed: restore draft to original content if viewing this entry
          // (storageKey binding auto-updates UI)
          if (target.entryId === currentSelected) {
            await api.v1.storyStorage.set(
              IDS.LOREBOOK.CONTENT_DRAFT_RAW,
              originalLorebookContent,
            );
          }
        }
      } else if (target.type === "lorebookKeys") {
        const currentSelected = getState().ui.lorebook.selectedEntryId;

        if (generationSucceeded && accumulatedText) {
          // Parse comma-separated keys
          const keys = accumulatedText
            .split(",")
            .map((k) => k.trim())
            .filter((k) => k.length > 0 && k.length < 50); // Filter invalid keys

          // Update lorebook entry with generated keys
          await api.v1.lorebook.updateEntry(target.entryId, { keys });

          // Update draft with parsed keys if viewing this entry
          // (storageKey binding auto-updates UI)
          if (target.entryId === currentSelected) {
            const keysStr = keys.join(", ");
            await api.v1.storyStorage.set(IDS.LOREBOOK.KEYS_DRAFT_RAW, keysStr);
          }
        } else {
          // Cancelled or failed: restore draft to original keys if viewing this entry
          // (storageKey binding auto-updates UI)
          if (target.entryId === currentSelected) {
            await api.v1.storyStorage.set(
              IDS.LOREBOOK.KEYS_DRAFT_RAW,
              originalLorebookKeys,
            );
          }
        }
      }
    },
  );

  // Intent: Sync GenX State
  subscribeEffect(
    (action) => action.type === stateUpdated({} as any).type,
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
        if (status === "queued") {
          newQueue.push(req);
        } else if (status === "processing") {
          newActive = req;
        }
        // else 'not_found' -> drop
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
  subscribeEffect(
    (action) => action.type === uiCancelRequest({} as any).type,
    (action, { dispatch }) => {
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
    },
  );

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

  // Lorebook Sync: Item Added
  subscribeEffect(
    (action) => action.type === dulfsItemAdded({} as any).type,
    async (action) => {
      const { fieldId, item } = action.payload;
      const name =
        (await api.v1.storyStorage.get(`dulfs-item-${item.id}`)) || "";

      const categoryId = await ensureCategory(fieldId);
      await api.v1.lorebook.createEntry({
        id: item.id,
        category: categoryId,
        displayName: String(name),
        keys: String(name) ? [String(name)] : [],
        enabled: true,
      });
    },
  );

  // Lorebook Sync: Item Removed
  subscribeEffect(
    (action) => action.type === dulfsItemRemoved({} as any).type,
    async (action) => {
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
    },
  );

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
        /^dulfs-summary-draft-/, // DULFS summary drafts
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
    (action) =>
      action.type === lorebookContentGenerationRequested({} as any).type,
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
        uiRequestGeneration({
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
    (action) => action.type === lorebookKeysGenerationRequested({} as any).type,
    async (action, { dispatch, getState }) => {
      const { requestId } = action.payload;
      const { selectedEntryId } = getState().ui.lorebook;

      if (!selectedEntryId) {
        api.v1.log("[effects] No lorebook entry selected for keys generation");
        return;
      }

      // Factory fetches entry.text at execution time, not now
      const messageFactory = createLorebookKeysFactory(selectedEntryId);

      dispatch(
        uiRequestGeneration({
          requestId,
          messageFactory,
          params: { model: "glm-4-6", max_tokens: 64 }, // Base params, factory can override
          target: { type: "lorebookKeys", entryId: selectedEntryId },
          prefixBehavior: "trim",
        }),
      );
    },
  );

  // Intent: Lorebook Item Generation (queues both content + keys from DULFS list)
  subscribeEffect(
    (action) => action.type === lorebookItemGenerationRequested({} as any).type,
    async (action, { dispatch, getState }) => {
      const { entryId, contentRequestId, keysRequestId } = action.payload;

      // Queue content generation
      const contentFactory = createLorebookContentFactory(getState, entryId);
      dispatch(
        uiRequestGeneration({
          requestId: contentRequestId,
          messageFactory: contentFactory,
          params: { model: "glm-4-6", max_tokens: 512 },
          target: { type: "lorebookContent", entryId },
          prefixBehavior: "trim",
        }),
      );

      // Queue keys generation (will execute after content due to JIT factory)
      const keysFactory = createLorebookKeysFactory(entryId);
      dispatch(
        uiRequestGeneration({
          requestId: keysRequestId,
          messageFactory: keysFactory,
          params: { model: "glm-4-6", max_tokens: 64 },
          target: { type: "lorebookKeys", entryId },
          prefixBehavior: "trim",
        }),
      );
    },
  );
}
