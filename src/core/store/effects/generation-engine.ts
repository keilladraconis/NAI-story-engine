import { Store, matchesAction } from "nai-store";
import {
  RootState,
  GenerationStrategy,
  GenerationRequest,
  AppDispatch,
} from "../types";
import { currentMessages } from "../slices/brainstorm";
import { GenX, MessageFactory } from "nai-gen-x";
import {
  uiGenerationRequested,
  generationSubmitted,
  uiCancelRequest,
  uiRequestCancellation,
  uiUserPresenceConfirmed,
  requestQueued,
  requestCancelled,
  requestCompleted,
} from "../index";
import {
  buildCanonStrategy,
  buildATTGStrategy,
  buildStyleStrategy,
  buildDulfsListStrategy,
  buildBootstrapStrategy,
} from "../../utils/context-builder";
import { FieldID, FIELD_CONFIGS } from "../../../config/field-definitions";
import { getHandler } from "./generation-handlers";
import { recordEntry, JournalEntry } from "../../generation-journal";
import { getModel } from "../../utils/config";

// ─────────────────────────────────────────────────────────────────────────────
// Private Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a strategy target to the { type, targetId } needed for requestQueued.
 * Used to register continuation tasks in the runtime so the UI can track them.
 */
function targetToQueueEntry(target: GenerationStrategy["target"]): {
  type: GenerationRequest["type"];
  targetId: string;
} {
  switch (target.type) {
    case "brainstorm":
      return { type: "brainstorm", targetId: target.messageId };
    case "brainstormChatTitle":
      return {
        type: "brainstormChatTitle",
        targetId: String(target.chatIndex),
      };
    case "field":
      return { type: "field", targetId: target.fieldId };
    case "list":
      return { type: "list", targetId: target.fieldId };
    case "lorebookContent":
      return { type: "lorebookContent", targetId: target.entryId };
    case "lorebookKeys":
      return { type: "lorebookKeys", targetId: target.entryId };
    case "lorebookRefine":
      return { type: "lorebookRefine", targetId: target.entryId };
    case "bootstrap":
      return { type: "bootstrap", targetId: "" };
    case "forge":
      return { type: "forge", targetId: target.batchId };
    case "foundation":
      return { type: "foundation", targetId: target.field };
  }
  // Unreachable — satisfies noImplicitReturns for exhaustive switch
  throw new Error(`Unhandled target type: ${(target as any).type}`);
}

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

  if (target.type === "forge") {
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
export function cacheLabel(target: GenerationStrategy["target"]) {
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
    case "forge":
      return `forge:${target.batchId.slice(0, 8)}`;
    case "brainstormChatTitle":
      return `brainstorm-title:${target.chatIndex}`;
    case "foundation":
      return `foundation:${target.field}`;
    case "tension":
      return `tension:${target.tensionId.slice(0, 8)}`;
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
// Registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerGenerationEngineEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
  genX: GenX,
): void {
  // Intent: Field/List Generation
  subscribeEffect(matchesAction(uiGenerationRequested), async (action) => {
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
  });

  // Intent: GenX Generation (using handler map pattern)
  subscribeEffect(matchesAction(generationSubmitted), async (action) => {
    const strategy = action.payload;
    const { requestId, messages, messageFactory, params, target } = strategy;

    let accumulatedText = resolvePrefill(strategy, getState);
    const apiParams = { ...params };

    // Resolved messages captured via closure for potential continuation calls
    let resolvedMessages: Message[] | undefined;
    let pendingUncached = 0;

    let messagesInput: Message[] | MessageFactory;
    if (messageFactory) {
      // Wrap factory to capture resolved messages and instrument cache at JIT time
      messagesInput = async () => {
        const result = await messageFactory();
        resolvedMessages = result.messages;
        if (result.params) Object.assign(apiParams, result.params);
        const uncached = await api.v1.script.countUncachedInputTokens(
          result.messages,
          await getModel(),
        );
        pendingUncached = uncached;
        api.v1.log(
          `[cache] ${cacheLabel(target)}: ${uncached} uncached tokens`,
        );
        return result;
      };
    } else if (messages) {
      resolvedMessages = messages;
      const uncached = await api.v1.script.countUncachedInputTokens(
        messages,
        await getModel(),
      );
      pendingUncached = uncached;
      api.v1.log(`[cache] ${cacheLabel(target)}: ${uncached} uncached tokens`);
      messagesInput = messages;
    } else {
      api.v1.log("Generation failed: no messages or factory provided");
      return;
    }

    queueLorebookRequestIfNeeded(target, requestId, getState, dispatch);

    const rollbackState = await captureRollbackState(target);

    const handler = getHandler(target.type);
    let generationSucceeded = false;

    const onStream = (choices: GenerationChoice[], _final: boolean) => {
      const text = choices[0]?.text || "";
      if (text) {
        accumulatedText += text;
        handler.streaming({ target, getState, accumulatedText }, text);
      }
    };

    try {
      const result = await genX.generate(
        messagesInput,
        { ...apiParams, taskId: requestId },
        onStream,
        "background",
        await api.v1.createCancellationSignal(),
      );

      generationSucceeded = true;

      // Continuation: extend output when truncated by token limit
      if (strategy.continuation && resolvedMessages) {
        let calls = 1;
        const maxCalls = strategy.continuation.maxCalls;
        let finishReason = result.choices?.[0]?.finish_reason;
        api.v1.log(
          `[continuation] finish_reason="${finishReason}" after call 1/${maxCalls}`,
        );

        const isTruncated = (r: string | undefined) =>
          r === "length" || r === "max_tokens";

        const queueEntry = targetToQueueEntry(target);

        while (calls < maxCalls && isTruncated(finishReason)) {
          if (checkCancellation(requestId, getState)) break;

          const contTaskId = `${requestId}-cont-${calls}`;
          api.v1.log(
            `[continuation] Call ${calls + 1}/${maxCalls}, extending output...`,
          );

          // Register in runtime so onTaskStarted → requestActivated can track it
          // and UI buttons (stateProjection) see a live request of the same type.
          dispatch(requestQueued({ id: contTaskId, ...queueEntry }));

          const lastMsg = resolvedMessages[resolvedMessages.length - 1];
          const baseMessages =
            lastMsg?.role === "assistant"
              ? resolvedMessages.slice(0, -1)
              : resolvedMessages;
          const continuationMessages: Message[] = [
            ...baseMessages,
            { role: "assistant", content: accumulatedText },
          ];

          const contResult = await genX.generate(
            continuationMessages,
            { ...apiParams, taskId: contTaskId, max_tokens: 1024 },
            onStream,
            "background",
            await api.v1.createCancellationSignal(),
          );

          dispatch(requestCompleted({ requestId: contTaskId }));
          finishReason = contResult.choices?.[0]?.finish_reason;
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

    // Trim leading whitespace from model output (prevents double-space artifacts after prefill)
    accumulatedText = accumulatedText.replace(/^\s+/, "");

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

    // Record to generation journal
    if (resolvedMessages) {
      const journalEntry: JournalEntry = {
        id: requestId,
        timestamp: Date.now(),
        label: cacheLabel(target),
        messages: resolvedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        params: apiParams,
        response: accumulatedText,
        uncachedTokens: pendingUncached,
        success: generationSucceeded,
      };
      recordEntry(journalEntry).catch(() => {});
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
        const fieldConfig = FIELD_CONFIGS.find((c) => c.id === target.fieldId);
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
  });

  // Intent: Specific Cancellation
  subscribeEffect(matchesAction(uiCancelRequest), (action) => {
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
    (_action, { getState: getLatest }) => {
      const activeRequest = getLatest().runtime.activeRequest;
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
}
