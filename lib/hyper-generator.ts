/** HYPER GENERATOR
 * License: MIT; Credit to OccultSage for the original form and inspiration
 * Authors: Keilla
 * Version: 0.4.1
 */

/** Changes
 * hyperContextBuilder signature modified to receive enable_thinking boolean. Thoughts require a contentless assistant suffix on the messages.
 * hyperContextBuilder tail-slicing-appending removed. Causes issues with careful prompting and prefill.
 * Refactored `hyperGenerateWithRetry` in `lib/hyper-generator.ts` to use a loop-based approach with proper exponential backoff (`2^attempts * 1000` ms), replacing the recursive implementation.
 * Context sample removed.
 */

// ===== CONSTANTS =====

const DEFAULT_GENERATE_OPTIONS = {
  maxRetries: 5,
  maxTokens: 250,
  minTokens: 50,
  maxContinuations: 20,
  continuationPrompt:
    "Your response was cut off. Continue exactly where you stopped. Do not repeat any content, do not start over, do not repeat headers.",
};

const API_GENERATE_LIMIT = 1024;
const MIN_REMAINING_TOKENS = 25; // Do not continue generation below this number of tokens. Prevents repeated loops attempting to hit 8 tokens...

// ===== TYPES =====

export type HyperGenerationParams = Partial<GenerationParams> & {
  /**
   * Maximum output tokens. Can exceed the default limits imposed by api.v1.generate,
   * and will continue output until this is reached.
   */
  maxTokens: number;
  /** Set a minimum number of tokens to return. Used to evade spurious stoppage from the model. */
  minTokens: number;
  /** Max retry attempts for transient errors */
  maxRetries?: number;
  /** Max continuations for length cutoffs */
  maxContinuations?: number;
  /** Prompt to send for continuations */
  continuationPrompt?: string;
  /**
   * Callback invoked when waiting for token budget.
   * Called with (available, needed, time) before blocking on waitForAllowedOutput.
   */
  onBudgetWait?: OnBudgetWaitCallback;
  /**
   * Callback invoked when token budget becomes available after waiting.
   * Called with (available) after waitForAllowedOutput resolves.
   */
  onBudgetResume?: OnBudgetResumeCallback;
};

export interface OnBudgetWaitCallback {
  (available: number, needed: number, time: number): boolean | Promise<void>;
}

export interface OnBudgetResumeCallback {
  (available: number): void | Promise<void>;
}

// ===== ERROR HANDLING =====

class TransientError extends Error {}

function isTransientError(e: Error): boolean {
  hyperLog("Transient Error:", e.message);
  const msg =
    e instanceof Error
      ? e.message
      : e && typeof e === "object" && "message" in e
        ? String((e as { message: unknown }).message)
        : "";
  const lower = msg.toLowerCase();
  return (
    lower.includes("aborted") ||
    lower.includes("fetch") ||
    lower.includes("network") ||
    lower.includes("timeout")
  );
}
// == Utility

/**
 * Ensures sufficient output token budget before generation.
 * Waits if necessary, returns the effective max_tokens to use.
 *
 * @param requestedTokens The desired max_tokens
 * @param minTokens Minimum acceptable tokens (wait if below this)
 * @param logPrefix Prefix for log messages
 * @param onBudgetWait Optional callback invoked before waiting
 * @param onBudgetResume Optional callback invoked after waiting completes
 * @returns Effective max_tokens to use (may be less than requested but >= min)
 */
async function ensureOutputBudget(
  requestedTokens: number,
  onBudgetWait?: OnBudgetWaitCallback,
  onBudgetResume?: (available: number) => void | Promise<void>,
): Promise<number> {
  let available = api.v1.script.getAllowedOutput();

  if (available < requestedTokens) {
    hyperLog(
      `Insufficient output budget. Have ${available}, need ${requestedTokens}. Waiting...`,
    );
    const time = api.v1.script.getTimeUntilAllowedOutput(requestedTokens);
    await onBudgetWait?.(available, requestedTokens, time);
    await api.v1.script.waitForAllowedOutput(requestedTokens);
    available = api.v1.script.getAllowedOutput();
    hyperLog(`Budget available: ${available} tokens`);
    await onBudgetResume?.(available);
  }

  const effectiveTokens = Math.min(requestedTokens, available);
  if (effectiveTokens < requestedTokens) {
    hyperLog(
      `Using reduced budget: ${effectiveTokens} (requested ${requestedTokens})`,
    );
  }

  return effectiveTokens;
}

function sliceGenerateParams(params: HyperGenerationParams): GenerationParams {
  const {
    model,
    temperature,
    top_p,
    top_k,
    min_p,
    frequency_penalty,
    presence_penalty,
    stop,
    logit_bias,
    enable_thinking,
  } = params;
  return {
    model,
    temperature,
    top_p,
    top_k,
    min_p,
    frequency_penalty,
    presence_penalty,
    stop,
    logit_bias,
    enable_thinking,
  } as GenerationParams;
}

function hyperLog(...args: any[]) {
  api.v1.log("[hyperGenerate]", ...args);
}

/**
 * Strictly double every newline character.
 * This is required for GLM-4.6 compatibility as it tends to collapse single newlines
 * in certain prompt contexts, leading to merged blocks of text.
 */
export const fixSpacing = (text: string): string => {
  if (!text) return "";
  return text.replace(/\n/g, "\n\n").trim();
};

/**
 * hyperContextBuilder This function solves for needing to construct a context
 * optimal for token cache performance and instruction, while also providing the
 * 'continuation' context at the end of the message list such that the LLM
 * naturally continues the thread. The last rest message is always examined for
 * length. If it is less than 500 characters, then it is inserted at the end of
 * the messages array. If it is more, then it is split on a newline into two
 * messages. The proper prefix of rest is inserted at the 2nd position, while
 * the tail of rest is inserted at the end.
 *
 * @param system The system message. Always present at the top of the built context.
 * @param user The user message. Otherwise known as 'instruct' or sometimes 'prefill'. Appears 3rd from last.
 * @param assistant The assistant message, understood by LLM to be its own voice. Also sometimes thought of as 'prefill'. Appears 2nd from last.
 * @param rest All other messsages to include in context. Will be dynamically spliced into the context based on length and size of the content.
 * @param thinking Whether or not thinking-enabled prompt building is needed. Appends empty assistant.
 */
export function hyperContextBuilder(
  system: Message,
  user: Message,
  assistant: Message,
  rest: Message[],
  thinking: boolean = false,
): Message[] {
  const fix = (m: Message): Message => ({
    ...m,
    content: m.content ? fixSpacing(m.content) : m.content,
  });

  return [
    fix(system),
    ...rest.map(fix),
    fix(user),
    fix(assistant),
    ...(thinking ? [{ role: "assistant" as const }] : []), // If thinking, append an empty assistant, required to activate thoughts.
  ];
}

// ===== UI =====

export function createContinueModalCallback(
  signal: CancellationSignal,
): OnBudgetWaitCallback {
  return async (available, requestedTokens, time) =>
    await showContinueModal(available, requestedTokens, time, signal);
}

async function showContinueModal(
  available: number,
  requestedTokens: number,
  time: number,
  signal?: CancellationSignal,
) {
  const modal = await api.v1.ui.modal.open({
    title: "Generation Paused",
    size: "small",
    content: [
      api.v1.ui.part.text({
        text: `**Currently:** ${available}/${requestedTokens}\nMore tokens in ${time / 1000} seconds.`,
        markdown: true,
      }),
      api.v1.ui.part.text({
        text: "Generation limit reached. Continue?",
      }),
      api.v1.ui.part.row({
        content: [
          api.v1.ui.part.button({
            text: "Continue",
            callback: () => {
              modal.close();
            },
          }),
          api.v1.ui.part.button({
            text: "Stop",
            callback: () => {
              if (signal) signal.cancel();
              modal.close();
            },
          }),
        ],
        spacing: "space-between",
      }),
    ],
  });
}

// ===== MAIN GENERATION FUNCTION =====

/**
 * hyperGenerate is a wrapper aroun api.v1.generate that allows for a much
 * higher maximum number of tokens by utilizing a recursive retrying strategy.
 * Keeps on generating as long as user can keep plugging the continue button.
 * Also retries connection drops, output budgets, and spurious stop tokens.
 *
 * @param messages Messages expected by api.v1.generate
 * @param params api.v1.generate parameters extended with additional parameters to control hyper generation
 * @param callback Optional streaming callback. Accumulates GenerationChoice[0] and emits GenerationChoice[] when a newline is received.
 * @param behaviour "background" or "blocking".
 * @param signal Cancellation signal for stopping generation.
 * @returns A promise of an array of response strings.
 */
export async function hyperGenerate(
  messages: Message[],
  params: HyperGenerationParams,
  callback: (text: string, final: boolean) => void = () => {},
  behaviour?: "background" | "blocking",
  signal?: CancellationSignal,
): Promise<string> {
  const generationParams = await api.v1.generationParameters.get();
  const ensuredParams = {
    ...generationParams,
    ...DEFAULT_GENERATE_OPTIONS,
    ...params,
  };

  const choiceHandler =
    callback !== undefined
      ? (choices: GenerationChoice[], final: boolean): void =>
          callback(choices[0] ? choices[0].text : "", final)
      : undefined;

  // Find system message if present
  let systemMessage = messages.find((m) => m.role == "system");
  const { model, maxTokens, minTokens, maxContinuations, continuationPrompt } =
    ensuredParams;
  const systemMessageTokens = systemMessage?.content
    ? (await api.v1.tokenizer.encode(systemMessage.content, model)).length
    : 0;

  // Setup rollover helper for context management
  const modelMaxTokens = await api.v1.maxTokens(model);
  const rolloverHelper = api.v1.createRolloverHelper({
    maxTokens: modelMaxTokens - systemMessageTokens,
    rolloverTokens: 0,
    model: model,
  });

  // Add non-system messages to rollover
  const contextMessages = messages.filter(
    (m) => m.content != undefined && m.role != "system",
  ) as RolloverHelperContentObject[];
  await rolloverHelper.add(contextMessages);

  let remainingTokens = maxTokens;
  let remainingContinuations = maxContinuations;
  let accumulatedResponses: string[] = [];

  hyperLog(
    `beginning loop for ${remainingTokens} Tokens, ${remainingContinuations} Continuations.`,
  );

  while (
    remainingContinuations == maxContinuations ||
    (remainingTokens > MIN_REMAINING_TOKENS &&
      remainingContinuations > 0 &&
      !signal?.cancelled)
  ) {
    hyperLog(
      `... ${remainingTokens} Tokens, ${remainingContinuations} Continuations.`,
    );

    const context: Message[] = [];

    if (systemMessage) context.push(systemMessage);
    context.push(...(rolloverHelper.read() as unknown as Message[]));

    // If we are in a continuation, splice the continuation prompt before the last message.
    if (remainingContinuations < maxContinuations)
      context.splice(context.length - 2, 0, {
        role: "user" as const,
        content: continuationPrompt,
      });

    const response = await hyperGenerateWithRetry(
      context,
      {
        ...ensuredParams,
        maxTokens: remainingTokens,
      },
      choiceHandler,
      behaviour,
      signal,
    );

    // When generation is cancelled abruptly, choices could be empty.
    if (response.choices[0] == undefined) {
      hyperLog("Generation cancelled by signal, choices empty.");
      break;
    }
    const { text, finish_reason } = response.choices[0];
    const trimmedText = text.trim();
    const trimmedResponseTokens = await api.v1.tokenizer.encode(text, model);
    accumulatedResponses.push(trimmedText);

    remainingTokens -= trimmedResponseTokens.length;
    remainingContinuations--;
    const tokensGenerated = maxTokens - remainingTokens;

    // Check if we should stop
    if (finish_reason === "stop") {
      // Only stop early if we've generated at least minTokens
      if (tokensGenerated >= minTokens) {
        hyperLog(`Natural stop after ${tokensGenerated} tokens`);
        break;
      } else {
        hyperLog(
          `Stop received but only ${tokensGenerated}/${minTokens} tokens - continuing`,
        );
      }
    }

    await rolloverHelper.add({
      role: "assistant",
      content: trimmedText,
    });
  }
  hyperLog(`hyperGenerate finished.`);

  return accumulatedResponses.join("");
}

/**
 * Generate function that retries when there are transient errors.
 *
 * @param messages Messages expected by api.v1.generate
 * @param params api.v1.generate parameters extended with additional parameters to control hyper generation
 * @param callback Optional streaming callback. Emits paragraphs instead of individual tokens.
 * @param behaviour "background" or "blocking".
 * @param signal Cancellation signal for stopping generation.
 * @returns A Promise of an api.v1.generateResponse
 */
async function hyperGenerateWithRetry(
  messages: Message[],
  params: HyperGenerationParams,
  callback: (choices: GenerationChoice[], final: boolean) => void = () => {},
  behaviour?: "background" | "blocking",
  signal?: CancellationSignal,
): Promise<GenerationResponse> {
  const maxRetries = params.maxRetries ?? 5;
  let attempts = 0;

  while (true) {
    const max_tokens = await ensureOutputBudget(
      params.maxTokens
        ? Math.min(params.maxTokens, API_GENERATE_LIMIT)
        : API_GENERATE_LIMIT,
      params.onBudgetWait,
      params.onBudgetResume,
    );

    try {
      hyperLog(`Generating ${max_tokens} tokens...`);
      return await api.v1.generate(
        [...messages],
        {
          ...sliceGenerateParams(params),
          max_tokens,
        },
        callback,
        behaviour,
        signal,
      );
    } catch (e: any) {
      if (isTransientError(e) || /in progress/.test(e.message)) {
        attempts++;
        if (attempts > maxRetries) {
          throw new TransientError(
            `[generateWithRetry] Transient error encountered and retries exhausted after ${attempts} attempts.`,
          );
        }

        const delay = Math.pow(2, attempts) * 1000;
        hyperLog(
          `Transient error: ${e.message}. Retrying in ${delay}ms (Attempt ${attempts}/${maxRetries})...`,
        );
        await api.v1.timers.sleep(delay);
      } else {
        throw e;
      }
    }
  }
}
