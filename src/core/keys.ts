// storyStorage keys. Story-scoped on purpose: undo and branching move the page,
// never the canon, so a draft undone after a save comes back onto the page while
// its record stays (saving again overwrites it).

export const STORAGE_KEYS = {
  /** Brief, vignettes, starting point, canon documents, cast review. */
  CANON: "se-canon",
  /** Workshop Sends switch, boundary, drafting target. */
  WORKSHOP: "se-workshop",
  /** Per-target distill records and whether the opening is kept. */
  DISTILL: "se-distill",
  /** The facilitator transcript. */
  CHAT: "se-chat",
} as const;

/** The one lorebook category Story Engine writes into. */
export const SCENARIO_CATEGORY = "SE: Scenario";
