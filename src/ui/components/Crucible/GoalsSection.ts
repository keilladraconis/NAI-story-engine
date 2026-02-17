import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";
import {
  goalAdded,
  goalsCleared,
  goalStarred,
  goalsConfirmed,
  crucibleStopRequested,
} from "../../../core/store/slices/crucible";
import { requestQueued } from "../../../core/store/slices/runtime";
import { generationSubmitted } from "../../../core/store/slices/ui";
import { buildCrucibleGoalStrategy } from "../../../core/utils/crucible-strategy";
import { IDS } from "../../framework/ids";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";
import { GenerationButton } from "../GenerationButton";
import { GoalCard } from "./GoalCard";
import { SceneCard } from "./SceneCard";
import { parseTag, formatTagsWithEmoji, stripSceneTag } from "../../../core/utils/tag-parser";
import {
  NAI_WARNING,
} from "../../colors";

const { row, column, button, collapsibleSection, sliderInput } = api.v1.ui.part;

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
    const sceneCardCache = new Map<string, UIPart>();

    const goalTitle = (goalText: string): string =>
      parseTag(goalText, "GOAL")?.slice(0, 40) || goalText.slice(0, 40) || "New goal";

    const ensureSceneCard = (goalId: string, sceneIndex: number, sceneText: string): UIPart => {
      const cacheKey = `${goalId}:${sceneIndex}`;
      if (!sceneCardCache.has(cacheKey)) {
        const { part } = ctx.render(SceneCard, { goalId, sceneIndex });
        sceneCardCache.set(cacheKey, part);
        api.v1.storyStorage.set(`cr-scene-${goalId}-${sceneIndex}`, sceneText);
      }
      return sceneCardCache.get(cacheKey)!;
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
            // Track chaining/building/director requests for this goal
            const crucibleTypes = new Set(["crucibleChain", "crucibleBuild", "crucibleDirector"]);
            if (s.runtime.activeRequest && crucibleTypes.has(s.runtime.activeRequest.type)) {
              return s.runtime.activeRequest.id;
            }
            const queued = s.runtime.queue.find(
              (q) => crucibleTypes.has(q.type),
            );
            return queued?.id;
          },
          isDisabledFromProjection: () => false,
          onCancel: () => dispatch(crucibleStopRequested()),
          onGenerate: () => {
            // Deselect all goals, then select only this one and start building
            const s = ctx.getState();
            for (const g of s.crucible.goals) {
              if (g.starred && g.id !== goalId) {
                dispatch(goalStarred({ goalId: g.id }));
              }
            }
            const goal = s.crucible.goals.find((g) => g.id === goalId);
            if (goal && !goal.starred) {
              dispatch(goalStarred({ goalId }));
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

      // Build scene cards (newest first)
      const chain = ctx.getState().crucible.chains[goalId];
      const sceneParts: UIPart[] = [];
      if (chain) {
        for (let i = chain.scenes.length - 1; i >= 0; i--) {
          sceneParts.push(ensureSceneCard(goalId, i, chain.scenes[i].text));
        }
      }

      return collapsibleSection({
        id: CR.GOAL_SECTION(goalId),
        title: goalText ? goalTitle(goalText) : "Generating...",
        storageKey: `story:cr-goal-section-${goalId}`,
        style: { overflow: "visible" },
        content: [
          ensureBuildBtn(goalId),
          ...sceneParts,
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

    // --- Reactive: rebuild goal list on add/remove/text/scene changes ---

    const rebuildGoalsList = (): void => {
      const st = ctx.getState();
      const currentGoals = st.crucible.goals;

      if (currentGoals.length === 0) {
        goalCardCache.clear();
        buildBtnCache.clear();
        sceneCardCache.clear();
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
      for (const [key] of sceneCardCache) {
        const goalId = key.split(":")[0];
        if (!currentIds.has(goalId)) sceneCardCache.delete(key);
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

      // Update view text for goal cards + scene cards
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
        for (let i = 0; i < chain.scenes.length; i++) {
          const sceneDisplay = formatTagsWithEmoji(stripSceneTag(chain.scenes[i].text))
            .replace(/\n/g, "  \n").replace(/</g, "\\<");
          api.v1.ui.updateParts([
            { id: `${CR.scene(goal.id, i).TEXT}-view`, text: sceneDisplay },
          ]);
        }
      }
    };

    // Rebuild on goal add/remove/text changes OR scene count changes
    useSelector(
      (s) => {
        const parts: string[] = [];
        for (const g of s.crucible.goals) {
          const sceneCount = s.crucible.chains[g.id]?.scenes.length ?? 0;
          parts.push(`${g.id}:${g.text}:${sceneCount}`);
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
                dispatch(goalAdded({ goal: { id: goalId, text: "", starred: false } }));
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
        sliderInput({
          id: CR.SCENE_BUDGET_SLIDER,
          label: "Scenes per Goal",
          min: 3,
          max: 15,
          step: 1,
          defaultValue: 5,
          preventDecimal: true,
          storageKey: "story:cr-scene-budget",
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
