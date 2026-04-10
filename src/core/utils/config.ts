const GLM_MODEL = "glm-4-6";
const XIALONG_MODEL = "xialong-v1";

export const XIALONG_LOREBOOK_STOPS = ["\n\n***", "\n\n[ Chapter", "\n\n[Chapter"];

export async function isXialongMode(): Promise<boolean> {
  return Boolean(await api.v1.config.get("xialong_mode"));
}

/**
 * Read the configured model. Returns xialong-v1 when Xialong Mode is on,
 * glm-4-6 otherwise.
 */
export async function getModel(): Promise<string> {
  return (await isXialongMode()) ? XIALONG_MODEL : GLM_MODEL;
}

/**
 * Build generation params adapted for the active model.
 * When Xialong Mode is on: removes min_p, adds top_k: 250, top_p: 0.95.
 * When off: passes base params through with glm-4-6 as the model.
 */
export async function buildModelParams(
  base: Omit<GenerationParams, "model">,
): Promise<GenerationParams> {
  const useXialong = await isXialongMode();
  const model = useXialong ? XIALONG_MODEL : GLM_MODEL;
  if (useXialong) {
    const { min_p: _min_p, ...rest } = base;
    return { model, top_k: 250, top_p: 0.95, ...rest };
  }
  return { model, ...base };
}

/**
 * Append a Xialong style guidance message immediately before the assistant
 * prefill. Only adds the message when Xialong Mode is active.
 */
export async function appendXialongStyleMessage(
  messages: Message[],
  styleBlock: string,
): Promise<void> {
  if (await isXialongMode()) {
    messages.push({ role: "user", content: styleBlock });
  }
}
