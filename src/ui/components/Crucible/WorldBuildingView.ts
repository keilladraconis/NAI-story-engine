import { defineComponent } from "nai-act";
import { mergeStyles } from "nai-act";
import { RootState, CrucibleGoal, CrucibleChain } from "../../../core/store/types";
import { IDS } from "../../framework/ids";
import { parseTag, formatTagsWithEmoji } from "../../../core/utils/tag-parser";
import { BeatCard } from "./BeatCard";
import {
  STATUS_COMPLETE,
  STATUS_GENERATING,
} from "../../colors";

const { text, column, collapsibleSection } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

export const WorldBuildingView = defineComponent<undefined, RootState>({
  id: () => "cr-world-building-view",

  styles: {
    hidden: { display: "none" },
    root: {
      gap: "8px",
    },
    goalProgress: {
      gap: "2px",
    },
    goalLine: {
      "font-size": "0.8em",
      "white-space": "nowrap",
      overflow: "hidden",
      "text-overflow": "ellipsis",
    },
    streamContainer: {
      gap: "4px",
    },
    streamText: {
      "font-size": "0.85em",
      "white-space": "pre-wrap",
      "word-break": "break-word",
      opacity: "0.8",
      "min-height": "1.2em",
      "user-select": "text",
    },
    beatSections: {
      gap: "6px",
    },
  },

  build(_props, ctx) {
    const { useSelector } = ctx;
    const state = ctx.getState();
    const { phase, goals, chains, activeGoalId } = state.crucible;
    const visible = phase === "chaining" || phase === "building";
    const selectedGoals = goals.filter((g) => g.selected);

    // Cache rendered BeatCard parts to avoid re-rendering existing beats
    const beatCardCache = new Map<string, UIPart>();

    // --- Shared helpers ---

    const buildProgressLine = (
      goal: CrucibleGoal,
      chain: CrucibleChain | undefined,
      currentActiveGoalId: string | null,
    ): UIPart => {
      const goalName = parseTag(goal.text, "GOAL")?.slice(0, 50) || goal.text.slice(0, 50) || "...";
      const isActive = goal.id === currentActiveGoalId;
      const isComplete = chain?.complete || false;

      let icon: string;
      let color: string;
      if (isComplete) {
        icon = "\u2705";
        color = STATUS_COMPLETE;
      } else if (isActive) {
        icon = "\uD83C\uDFAF";
        color = STATUS_GENERATING;
      } else {
        icon = "\u23F3";
        color = "inherit";
      }

      const suffix = isComplete ? "complete" : isActive ? "building..." : "waiting";

      return text({
        text: `${icon} ${goalName} \u2014 ${suffix}`,
        style: mergeStyles(this.style?.("goalLine"), { color }),
      });
    };

    const ensureBeatCard = (goalId: string, beatIndex: number, beatText: string): UIPart => {
      const cacheKey = `${goalId}:${beatIndex}`;
      if (!beatCardCache.has(cacheKey)) {
        const { part } = ctx.render(BeatCard, { goalId, beatIndex });
        beatCardCache.set(cacheKey, part);
        // Seed storyStorage so EditableText has content
        api.v1.storyStorage.set(`cr-beat-${goalId}-${beatIndex}`, beatText);
      }
      return beatCardCache.get(cacheKey)!;
    };

    const buildBeatSections = (
      selGoals: CrucibleGoal[],
      allChains: Record<string, CrucibleChain>,
    ): UIPart[] => {
      const sections: UIPart[] = [];
      for (const goal of selGoals) {
        const chain = allChains[goal.id];
        if (!chain || chain.beats.length === 0) continue;

        const goalName = parseTag(goal.text, "GOAL")?.slice(0, 40) || "Goal";
        const beatParts: UIPart[] = [];
        for (let i = chain.beats.length - 1; i >= 0; i--) {
          beatParts.push(ensureBeatCard(goal.id, i, chain.beats[i].text));
        }

        sections.push(
          collapsibleSection({
            id: CR.GOAL_SECTION(goal.id),
            title: goalName,
            storageKey: `story:cr-goal-section-${goal.id}`,
            content: beatParts,
          }),
        );
      }
      return sections;
    };

    // --- Build initial state from ctx.getState() ---

    const initialProgressParts = visible
      ? selectedGoals.map((g) => buildProgressLine(g, chains[g.id], activeGoalId))
      : [];

    const initialBeatSections = visible
      ? buildBeatSections(selectedGoals, chains)
      : [];

    // --- Selectors for subsequent updates ---

    // Visibility + goal progress updates
    useSelector(
      (s) => ({
        phase: s.crucible.phase,
        goals: s.crucible.goals.filter((g) => g.selected),
        chains: s.crucible.chains,
        activeGoalId: s.crucible.activeGoalId,
      }),
      (slice) => {
        const vis = slice.phase === "chaining" || slice.phase === "building";
        api.v1.ui.updateParts([
          { id: "cr-world-building-view", style: this.style?.("root", !vis && "hidden") },
        ]);
        if (!vis) return;

        const progressParts = slice.goals.map((g) =>
          buildProgressLine(g, slice.chains[g.id], slice.activeGoalId),
        );

        api.v1.ui.updateParts([
          { id: "cr-goal-progress", style: this.style?.("goalProgress"), content: progressParts },
        ]);
      },
    );

    // Per-goal beat sections — rebuild when beats are added
    useSelector(
      (s) => {
        const selected = s.crucible.goals.filter((g) => g.selected);
        return selected.map((g) => {
          const chain = s.crucible.chains[g.id];
          return `${g.id}:${chain?.beats.length ?? 0}`;
        }).join("\0");
      },
      () => {
        const st = ctx.getState();
        const sel = st.crucible.goals.filter((g) => g.selected);
        const sections = buildBeatSections(sel, st.crucible.chains);

        api.v1.ui.updateParts([
          {
            id: "cr-beat-sections",
            style: this.style?.("beatSections", sections.length === 0 && "hidden"),
            content: sections,
          },
        ]);

        // Update view text for all beat cards (needed for newly rendered ones)
        for (const goal of sel) {
          const chain = st.crucible.chains[goal.id];
          if (!chain) continue;
          for (let i = 0; i < chain.beats.length; i++) {
            const display = formatTagsWithEmoji(chain.beats[i].text)
              .replace(/\n/g, "  \n").replace(/</g, "\\<");
            api.v1.ui.updateParts([
              { id: `${CR.beat(goal.id, i).TEXT}-view`, text: display },
            ]);
          }
        }
      },
    );

    // Stream container visibility by phase
    useSelector(
      (s) => s.crucible.phase,
      (p) => {
        const vis = p === "chaining" || p === "building";
        api.v1.ui.updateParts([
          { id: CR.STREAM_CONTAINER, style: this.style?.("streamContainer", !vis && "hidden") },
          { id: CR.STREAM_TEXT, style: this.style?.("streamText", !vis && "hidden") },
        ]);
      },
    );

    return column({
      id: "cr-world-building-view",
      style: this.style?.("root", !visible && "hidden"),
      content: [
        column({
          id: "cr-goal-progress",
          style: this.style?.("goalProgress"),
          content: initialProgressParts,
        }),
        column({
          id: "cr-beat-sections",
          style: this.style?.("beatSections", initialBeatSections.length === 0 && "hidden"),
          content: initialBeatSections,
        }),
        column({
          id: CR.STREAM_CONTAINER,
          style: this.style?.("streamContainer", !visible && "hidden"),
          content: [
            text({
              id: CR.STREAM_TEXT,
              text: "",
              markdown: true,
              style: this.style?.("streamText", !visible && "hidden"),
            }),
          ],
        }),
      ],
    });
  },
});
