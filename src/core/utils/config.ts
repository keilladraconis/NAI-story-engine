const DEFAULT_MODEL = "glm-4-6";

/**
 * Read the configured model from project.yaml config.
 * Falls back to glm-4-6 if not set.
 */
export async function getModel(): Promise<string> {
  return String((await api.v1.config.get("model")) || DEFAULT_MODEL);
}
