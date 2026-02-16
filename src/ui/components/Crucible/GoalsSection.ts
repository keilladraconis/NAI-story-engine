import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  goalAdded,
  goalsCleared,
  goalToggled,
  goalsConfirmed,
} from "../../../core/store/slices/crucible";
import { requestQueued } from "../../../core/store/slices/runtime";
import { generationSubmitted } from "../../../core/store/slices/ui";
import { buildCrucibleGoalStrategy } from "../../../core/utils/crucible-strategy";
import { IDS } from "../../framework/ids";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";
import { GenerationButton } from "../GenerationButton";
import { GoalCard } from "./GoalCard";
import { BeatCard } from "./BeatCard";
import { parseTag, formatTagsWithEmoji } from "../../../core/utils/tag-parser";
import {
  NAI_WARNING,
} from "../../colors";

const { row, column, button, collapsibleSection } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

export const GoalsSection = defineComponent<undefined, RootState>({
  id: () => "cr-goals-section",

  styles: {
    headerRow: {
      "justify-content": "space-between",
      "align-items": "center",
      gap: "6px",
    },
    goalsList: {
      gap: "6px",
    },
    btn: {
      padding: "5px 10px",
      "font-size": "0.8em",
    },
    btnDanger: {
      padding: "5px 10px",
      "font-size": "0.8em",
      color: NAI_WARNING,
    },
    hidden: { display: "none" },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const state = ctx.getState();
    const { goals, autoChaining: initialAutoChaining } = state.crucible;

    const { part: clearGoalsPart } = ctx.render(ButtonWithConfirmation, {
      id: CR.CLEAR_GOALS_BTN,
      label: "",
      iconId: "trash",
      confirmLabel: "Clear all goals?",
      buttonStyle: this.style?.("btnDanger"),
      onConfirm: () => dispatch(goalsCleared()),
    });

    // --- Per-goal section cache ---
    const goalCardCache = new Map<string, UIPart>();
    const buildBtnCache = new Map<string, UIPart>();
    const beatCardCache = new Map<string, UIPart>();

    const goalTitle = (goalText: string): string =>
      parseTag(goalText, "GOAL")?.slice(0, 40) || goalText.slice(0, 40) || "New goal";

    const ensureBeatCard = (goalId: string, beatIndex: number, beatText: string): UIPart => {
      const cacheKey = `${goalId}:${beatIndex}`;
      if (!beatCardCache.has(cacheKey)) {
        const { part } = ctx.render(BeatCard, { goalId, beatIndex });
        beatCardCache.set(cacheKey, part);
        api.v1.storyStorage.set(`cr-beat-${goalId}-${beatIndex}`, beatText);
      }
      return beatCardCache.get(cacheKey)!;
    };

    const ensureBuildBtn = (goalId: string): UIPart => {
      if (!buildBtnCache.has(goalId)) {
        const ids = CR.goal(goalId);
        const { part } = ctx.render(GenerationButton, {
          id: ids.BUILD_BTN,
          label: "Build World",
          variant: "button",
          stateProjection: (s: RootState) => ({
            activeType: s.runtime.activeRequest?.type,
            activeTargetId: s.runtime.activeRequest?.targetId,
            queueLen: s.runtime.queue.length,
          }),
          requestIdFromProjection: () => {
            const s = ctx.getState();
            // Track chaining/building requests for this goal
            if (s.runtime.activeRequest?.targetId === goalId &&
                (s.runtime.activeRequest.type === "crucibleChain" || s.runtime.activeRequest.type === "crucibleBuild")) {
              return s.runtime.activeRequest.id;
            }
            const queued = s.runtime.queue.find(
              (q) => q.targetId === goalId && (q.type === "crucibleChain" || q.type === "crucibleBuild"),
            );
            return queued?.id;
          },
          isDisabledFromProjection: () => false,
          onGenerate: () => {
            // Deselect all goals, then select only this one and start building
            const s = ctx.getState();
            for (const g of s.crucible.goals) {
              if (g.selected && g.id !== goalId) {
                dispatch(goalToggled({ goalId: g.id }));
              }
            }
            const goal = s.crucible.goals.find((g) => g.id === goalId);
            if (goal && !goal.selected) {
              dispatch(goalToggled({ goalId }));
            }
            dispatch(goalsConfirmed());
          },
        });
        buildBtnCache.set(goalId, part);
      }
      return buildBtnCache.get(goalId)!;
    };

    const buildGoalSection = (goalId: string, goalText: string): UIPart => {
      // Ensure GoalCard exists
      if (!goalCardCache.has(goalId)) {
        const { part } = ctx.render(GoalCard, { goalId });
        goalCardCache.set(goalId, part);
      }

      // Build beat cards (newest first)
      const chain = ctx.getState().crucible.chains[goalId];
      const beatParts: UIPart[] = [];
      if (chain) {
        for (let i = chain.beats.length - 1; i >= 0; i--) {
          beatParts.push(ensureBeatCard(goalId, i, chain.beats[i].text));
        }
      }

      return collapsibleSection({
        id: CR.GOAL_SECTION(goalId),
        title: goalText ? goalTitle(goalText) : "Generating...",
        storageKey: `story:cr-goal-section-${goalId}`,
        style: { overflow: "visible" },
        content: [
          ensureBuildBtn(goalId),
          ...beatParts,
          goalCardCache.get(goalId)!,
        ],
      });
    };

    // --- Build initial state ---

    for (const goal of goals) {
      if (goal.text) {
        api.v1.storyStorage.set(`cr-goal-${goal.id}`, goal.text);
      }
    }

    const hasGoals = goals.length > 0;
    const initialGoalSections = goals.map((g) => buildGoalSection(g.id, g.text));

    // --- Reactive: rebuild goal list on add/remove/text/beat changes ---

    const rebuildGoalsList = (): void => {
      const st = ctx.getState();
      const currentGoals = st.crucible.goals;

      if (currentGoals.length === 0) {
        goalCardCache.clear();
        buildBtnCache.clear();
        beatCardCache.clear();
        api.v1.ui.updateParts([
          { id: CR.GOALS_LIST, style: this.style?.("hidden") },
        ]);
        return;
      }

      // Clean up removed goals
      const currentIds = new Set(currentGoals.map((g) => g.id));
      for (const [id] of goalCardCache) {
        if (!currentIds.has(id)) {
          goalCardCache.delete(id);
          buildBtnCache.delete(id);
        }
      }
      for (const [key] of beatCardCache) {
        const goalId = key.split(":")[0];
        if (!currentIds.has(goalId)) beatCardCache.delete(key);
      }

      // Seed storyStorage + auto-expand new goals
      for (const goal of currentGoals) {
        if (goal.text) {
          api.v1.storyStorage.set(`cr-goal-${goal.id}`, goal.text);
        }
        if (!goalCardCache.has(goal.id)) {
          api.v1.storyStorage.set(`cr-goal-section-${goal.id}`, "");
        }
      }

      // Rebuild sections
      const sections = currentGoals.map((g) => buildGoalSection(g.id, g.text));

      api.v1.ui.updateParts([
        { id: CR.GOALS_LIST, style: this.style?.("goalsList"), content: sections },
      ]);

      // Update view text for goal cards + beat cards
      for (const goal of currentGoals) {
        const viewId = `${CR.goal(goal.id).TEXT}-view`;
        if (goal.text) {
          const display = formatTagsWithEmoji(goal.text)
            .replace(/\n/g, "  \n").replace(/</g, "\\<");
          api.v1.ui.updateParts([{ id: viewId, text: display }]);
        } else {
          api.v1.ui.updateParts([{ id: viewId, text: "_Generating..._" }]);
        }

        const chain = st.crucible.chains[goal.id];
        if (!chain) continue;
        for (let i = 0; i < chain.beats.length; i++) {
          const beatDisplay = formatTagsWithEmoji(chain.beats[i].text)
            .replace(/\n/g, "  \n").replace(/</g, "\\<");
          api.v1.ui.updateParts([
            { id: `${CR.beat(goal.id, i).TEXT}-view`, text: beatDisplay },
          ]);
        }
      }
    };

    // Rebuild on goal add/remove/text changes OR beat count changes
    useSelector(
      (s) => {
        const parts: string[] = [];
        for (const g of s.crucible.goals) {
          const beatCount = s.crucible.chains[g.id]?.beats.length ?? 0;
          parts.push(`${g.id}:${g.text}:${beatCount}`);
        }
        return parts.join("\0");
      },
      () => rebuildGoalsList(),
    );

    // Expand active goal's section during chaining/building, collapse others
    useSelector(
      (s) => s.crucible.activeGoalId,
      (activeGoalId) => {
        const st = ctx.getState();
        for (const goal of st.crucible.goals) {
          api.v1.storyStorage.set(
            `cr-goal-section-${goal.id}`,
            goal.id === activeGoalId ? "" : "true",
          );
        }
      },
    );

    // Update Build World label: "Resume" when paused (has chain but not auto-chaining)
    useSelector(
      (s) => ({
        autoChaining: s.crucible.autoChaining,
        activeGoalId: s.crucible.activeGoalId,
        chainKeys: Object.keys(s.crucible.chains).join(","),
      }),
      () => {
        const st = ctx.getState();
        for (const goal of st.crucible.goals) {
          const hasChain = st.crucible.chains[goal.id] != null;
          const paused = hasChain && !st.crucible.autoChaining;
          const label = paused ? "Resume" : "Build World";
          api.v1.ui.updateParts([
            { id: CR.goal(goal.id).BUILD_BTN, text: label },
          ]);
        }
      },
    );

    // Goal controls visibility: hidden when actively auto-chaining
    useSelector(
      (s) => s.crucible.autoChaining,
      (autoChaining) => {
        api.v1.ui.updateParts([
          {
            id: "cr-goal-controls",
            style: this.style?.("headerRow", autoChaining && "hidden"),
          },
        ]);
      },
    );

    return column({
      id: "cr-goals-section",
      style: { gap: "6px" },
      content: [
        row({
          id: "cr-goal-controls",
          style: this.style?.("headerRow", initialAutoChaining && "hidden"),
          content: [
            button({
              id: CR.ADD_GOAL_BTN,
              text: "+ Goal",
              style: this.style?.("btn"),
              callback: () => {
                const goalId = api.v1.uuid();
                dispatch(goalAdded({ goal: { id: goalId, text: "", selected: false } }));
                const strategy = buildCrucibleGoalStrategy(ctx.getState, goalId);
                dispatch(requestQueued({
                  id: strategy.requestId,
                  type: "crucibleGoal",
                  targetId: goalId,
                }));
                dispatch(generationSubmitted(strategy));
              },
            }),
            clearGoalsPart,
          ],
        }),
        column({
          id: CR.GOALS_LIST,
          style: hasGoals
            ? this.style?.("goalsList")
            : this.style?.("hidden"),
          content: initialGoalSections,
        }),
      ],
    });
  },
});
