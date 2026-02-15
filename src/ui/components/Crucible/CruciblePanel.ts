import { defineComponent } from "nai-act";
import {
  RootState,
  CruciblePhase,
} from "../../../core/store/types";
import {
  crucibleCommitted,
  crucibleReset,
  crucibleStopRequested,
  crucibleIntentRequested,
  crucibleGoalsRequested,
  goalAdded,
  goalRemoved,
  goalsCleared,
  goalsConfirmed,
  goalToggled,
  goalTextUpdated,
  checkpointCleared,
  crucibleChainRequested,
  crucibleMergeRequested,
  autoChainStarted,
  beatRejected,
} from "../../../core/store/slices/crucible";
import { IDS } from "../../framework/ids";
import { GenerationButton } from "../GenerationButton";
import { BudgetFeedback } from "../BudgetFeedback";
import { EditableText } from "../EditableText";
import { ButtonWithConfirmation } from "../ButtonWithConfirmation";
import { parseTag, formatTagsWithEmoji } from "../../../core/utils/tag-parser";
import {
  NAI_HEADER,
  NAI_WARNING,
  NAI_DARK_BACKGROUND,
  NAI_PARAGRAPH,
  STATUS_COMPLETE,
  STATUS_GENERATING,
} from "../../colors";

const { text, row, column, button, multilineTextInput } = api.v1.ui.part;

const CR = IDS.CRUCIBLE;

// --- Phase labels ---
const PHASE_LABELS: Record<CruciblePhase, string> = {
  idle: "Ready",
  goals: "Goal Selection",
  chaining: "Backward Chaining",
  merging: "World Merge",
  reviewing: "Review World",
  populating: "Populating DULFS",
};

/** Format intent prose for display: only apply emoji to [TAGS], rest is natural prose. */
function formatForDisplay(raw: string): string {
  // Only transform [TAGS] — rest is prose, not tagged
  const display = raw.replace(/\[TAGS\]/g, "\uD83C\uDFF7\uFE0F");
  return display.replace(/\n/g, "  \n").replace(/</g, "\\<");
}

export const CruciblePanel = defineComponent<undefined, RootState>({
  id: () => CR.WINDOW_ROOT,

  styles: {
    root: {
      padding: "10px",
      gap: "8px",
    },
    headerRow: {
      "justify-content": "space-between",
      "align-items": "center",
      gap: "6px",
    },
    title: {
      "font-size": "1.1em",
      "font-weight": "bold",
      color: NAI_HEADER,
    },
    phaseTag: {
      "font-size": "0.75em",
      padding: "2px 8px",
      "border-radius": "10px",
      "background-color": "rgba(255,255,255,0.08)",
      color: NAI_PARAGRAPH,
    },
    statusText: {
      "font-size": "0.8em",
      opacity: "0.7",
      "min-height": "1.2em",
    },
    section: {
      gap: "4px",
    },
    sectionTitle: {
      "font-size": "0.85em",
      "font-weight": "bold",
      opacity: "0.9",
    },
    goalCard: {
      padding: "6px 8px",
      "border-radius": "4px",
      "background-color": "rgba(255,255,255,0.04)",
      "border-left": "3px solid rgba(245,243,194,0.5)",
      gap: "2px",
      cursor: "pointer",
    },
    goalCardDeselected: {
      padding: "6px 8px",
      "border-radius": "4px",
      "background-color": "rgba(255,255,255,0.02)",
      "border-left": "3px solid rgba(128,128,128,0.3)",
      gap: "2px",
      cursor: "pointer",
      opacity: "0.5",
    },
    goalText: {
      "font-size": "0.85em",
      "white-space": "pre-wrap",
      "word-break": "break-word",
    },
    goalTextHidden: {
      display: "none",
    },
    goalInput: {
      "min-height": "80px",
      width: "100%",
      "font-size": "0.85em",
    },
    goalInputHidden: {
      "min-height": "80px",
      width: "100%",
      "font-size": "0.85em",
      display: "none",
    },
    goalBtnRow: {
      gap: "2px",
      "align-items": "center",
    },
    goalBtn: {
      padding: "2px 6px",
      "font-size": "0.8em",
    },
    goalBtnHidden: {
      padding: "2px 6px",
      "font-size": "0.8em",
      display: "none",
    },
    buttonRow: {
      gap: "6px",
      "flex-wrap": "wrap",
    },
    btn: {
      padding: "5px 10px",
      "font-size": "0.8em",
    },
    btnPrimary: {
      padding: "5px 10px",
      "font-size": "0.8em",
      "background-color": NAI_HEADER,
      color: NAI_DARK_BACKGROUND,
      "font-weight": "bold",
    },
    btnDanger: {
      padding: "5px 10px",
      "font-size": "0.8em",
      color: NAI_WARNING,
    },
    checkpointBox: {
      padding: "8px",
      "border-radius": "4px",
      "background-color": "rgba(255,147,147,0.1)",
      "border-left": "3px solid " + NAI_WARNING,
      gap: "4px",
    },
    checkpointText: {
      "font-size": "0.8em",
      color: NAI_WARNING,
    },
    hidden: { display: "none" },
    streamText: {
      "font-size": "0.85em",
      "white-space": "pre-wrap",
      "word-break": "break-word",
      opacity: "0.8",
      "min-height": "1.2em",
    },
    beatCard: {
      padding: "4px 8px",
      "border-radius": "3px",
      "background-color": "rgba(255,255,255,0.03)",
      "border-left": "2px solid rgba(120,144,156,0.5)",
      gap: "2px",
    },
    beatText: {
      "font-size": "0.8em",
      "white-space": "pre-wrap",
    },
    constraintOpen: {
      "font-size": "0.75em",
      color: STATUS_GENERATING,
    },
    constraintResolved: {
      "font-size": "0.75em",
      color: STATUS_COMPLETE,
      opacity: "0.5",
    },
    chainLabel: {
      "font-size": "0.8em",
      opacity: "0.8",
    },
    mergedCard: {
      padding: "6px 8px",
      "border-radius": "4px",
      "background-color": "rgba(255,255,255,0.04)",
      "border-left": "3px solid rgba(129,212,250,0.5)",
      gap: "2px",
    },
    mergedName: {
      "font-size": "0.85em",
      "font-weight": "bold",
    },
    mergedType: {
      "font-size": "0.7em",
      opacity: "0.6",
      "text-transform": "uppercase",
    },
    mergedText: {
      "font-size": "0.8em",
      "white-space": "pre-wrap",
      opacity: "0.85",
    },
    divider: {
      "border-top": "1px solid rgba(255,255,255,0.08)",
      margin: "4px 0",
    },
  },

  build(_props, ctx) {
    const { dispatch, useSelector } = ctx;
    const state = ctx.getState();

    // --- Generation Buttons ---
    const { part: intentBtnPart } = ctx.render(GenerationButton, {
      id: CR.INTENT_BTN,
      label: "\u26A1",
      variant: "button",
      generateAction: crucibleIntentRequested(),
      stateProjection: (s: RootState) => ({
        activeType: s.runtime.activeRequest?.type,
        queueTypes: s.runtime.queue.map((q) => q.type),
      }),
      requestIdFromProjection: () => {
        const s = ctx.getState();
        if (s.runtime.activeRequest?.type === "crucibleIntent") return s.runtime.activeRequest.id;
        const queued = s.runtime.queue.find((q) => q.type === "crucibleIntent");
        return queued?.id;
      },
      isDisabledFromProjection: (proj: any) =>
        proj.activeType === "crucibleChain" || proj.activeType === "crucibleMerge" || proj.activeType === "crucibleGoal",
    });

    const { part: goalsBtnPart } = ctx.render(GenerationButton, {
      id: CR.GOALS_BTN,
      label: "\u26A1",
      variant: "button",
      generateAction: crucibleGoalsRequested(),
      stateProjection: (s: RootState) => ({
        activeType: s.runtime.activeRequest?.type,
        queueTypes: s.runtime.queue.map((q) => q.type),
      }),
      requestIdFromProjection: () => {
        const s = ctx.getState();
        if (s.runtime.activeRequest?.type === "crucibleGoal") return s.runtime.activeRequest.id;
        const queued = s.runtime.queue.find((q) => q.type === "crucibleGoal");
        return queued?.id;
      },
      isDisabledFromProjection: (proj: any) =>
        proj.activeType === "crucibleChain" || proj.activeType === "crucibleMerge" || proj.activeType === "crucibleIntent",
    });

    const { part: budgetPart } = ctx.render(BudgetFeedback, { id: "cr-budget" });

    // --- EditableText for Intent ---
    const { part: intentEditablePart } = ctx.render(EditableText, {
      id: CR.INTENT_TEXT,
      storageKey: "cr-intent",
      placeholder: "The story explores... [TAGS] tag1, tag2, tag3",
    });

    // --- ButtonWithConfirmation for Clear Goals (icon-only) ---
    const { part: clearGoalsPart } = ctx.render(ButtonWithConfirmation, {
      id: CR.CLEAR_GOALS_BTN,
      label: "",
      iconId: "trash",
      confirmLabel: "Clear all goals?",
      buttonStyle: this.style?.("btnDanger"),
      onConfirm: () => dispatch(goalsCleared()),
    });

    // --- Reactive UI updates ---

    // Phase display
    useSelector(
      (s) => s.crucible.phase,
      (phase) => {
        api.v1.ui.updateParts([
          { id: CR.PHASE_TEXT, text: PHASE_LABELS[phase] || phase },
        ]);
      },
    );

    // Status text
    useSelector(
      (s) => ({
        phase: s.crucible.phase,
        activeGoalId: s.crucible.activeGoalId,
        goals: s.crucible.goals,
        chains: s.crucible.chains,
        autoChaining: s.crucible.autoChaining,
      }),
      (slice) => {
        let statusText = "";
        if (slice.phase === "idle") {
          statusText = "Write or derive intent, then generate goals.";
        } else if (slice.phase === "goals") {
          const selected = slice.goals.filter((g) => g.selected).length;
          statusText = `${selected}/${slice.goals.length} goals selected.`;
        } else if (slice.phase === "chaining") {
          const goal = slice.goals.find((g) => g.id === slice.activeGoalId);
          const chain = slice.activeGoalId ? slice.chains[slice.activeGoalId] : null;
          const beats = chain?.beats.length || 0;
          const open = chain?.openConstraints.length || 0;
          const goalText = goal ? (parseTag(goal.text, "GOAL") || goal.text.slice(0, 40)) : "...";
          const auto = slice.autoChaining ? " (auto)" : "";
          statusText = `Chaining: "${goalText.slice(0, 40)}" \u2014 ${beats} beats, ${open} open${auto}`;
        } else if (slice.phase === "merging") {
          statusText = "Merging world elements across goals...";
        } else if (slice.phase === "reviewing") {
          statusText = "Review the merged world. Commit to populate DULFS.";
        } else if (slice.phase === "populating") {
          statusText = "Elements exported to Story Engine.";
        }
        api.v1.ui.updateParts([{ id: CR.STATUS_TEXT, text: statusText }]);
      },
    );

    // Track which goals are in edit mode (persists across selector rebuilds)
    const editingGoals = new Set<string>();

    // Goals list
    useSelector(
      (s) => s.crucible.goals,
      async (goals) => {

        if (goals.length === 0) {
          api.v1.ui.updateParts([
            { id: CR.GOALS_LIST, style: this.style?.("hidden") },
          ]);
          return;
        }

        // Seed storyStorage for editable goals
        for (const goal of goals) {
          if (goal.text) {
            await api.v1.storyStorage.set(`cr-goal-${goal.id}`, goal.text);
          }
        }

        const goalParts = goals.map((goal) => {
          const ids = CR.goal(goal.id);
          const isEmpty = !goal.text.trim();
          const isEditing = editingGoals.has(goal.id);
          const displayText = isEmpty
            ? "_Generating..._"
            : formatTagsWithEmoji(goal.text).replace(/\n/g, "  \n").replace(/</g, "\\<");

          const beginEdit = async (): Promise<void> => {
            editingGoals.add(goal.id);
            const currentText = String(
              (await api.v1.storyStorage.get(`cr-goal-${goal.id}`)) || "",
            );
            const lines = Math.max((currentText.match(/\n/g) || []).length + 1, 4);
            const height = `${Math.min(lines * 18, 300)}px`;
            api.v1.ui.updateParts([
              { id: ids.TEXT, style: this.style?.("goalTextHidden") },
              { id: ids.INPUT, style: { ...this.style?.("goalInput"), "min-height": height } },
              { id: ids.EDIT_BTN, style: this.style?.("goalBtnHidden") },
              { id: ids.SAVE_BTN, style: this.style?.("goalBtn") },
            ]);
          };

          const saveEdit = async (): Promise<void> => {
            editingGoals.delete(goal.id);
            const content = String(
              (await api.v1.storyStorage.get(`cr-goal-${goal.id}`)) || "",
            );
            dispatch(goalTextUpdated({ goalId: goal.id, text: content }));
            api.v1.ui.updateParts([
              { id: ids.TEXT, style: this.style?.("goalText") },
              { id: ids.INPUT, style: this.style?.("goalInputHidden") },
              { id: ids.EDIT_BTN, style: this.style?.("goalBtn") },
              { id: ids.SAVE_BTN, style: this.style?.("goalBtnHidden") },
            ]);
          };

          return column({
            id: ids.ROOT,
            style: goal.selected
              ? this.style?.("goalCard")
              : this.style?.("goalCardDeselected"),
            content: [
              row({
                style: { "justify-content": "flex-end", gap: "2px" },
                content: [
                  ...(!isEmpty ? [
                    button({
                      id: ids.EDIT_BTN,
                      text: "\u270F\uFE0F",
                      style: isEditing ? this.style?.("goalBtnHidden") : this.style?.("goalBtn"),
                      callback: beginEdit,
                    }),
                    button({
                      id: ids.SAVE_BTN,
                      text: "\uD83D\uDCBE",
                      style: isEditing ? this.style?.("goalBtn") : this.style?.("goalBtnHidden"),
                      callback: saveEdit,
                    }),
                  ] : []),
                  button({
                    id: ids.FAV_BTN,
                    text: goal.selected ? "\u2764\uFE0F" : "\uD83E\uDD0D",
                    style: this.style?.("goalBtn"),
                    callback: () => dispatch(goalToggled({ goalId: goal.id })),
                  }),
                  button({
                    id: ids.DEL_BTN,
                    text: "\uD83D\uDDD1\uFE0F",
                    style: this.style?.("goalBtn"),
                    callback: () => dispatch(goalRemoved({ goalId: goal.id })),
                  }),
                ],
              }),
              text({
                id: ids.TEXT,
                text: displayText,
                markdown: true,
                style: isEditing ? this.style?.("goalTextHidden") : this.style?.("goalText"),
              }),
              multilineTextInput({
                id: ids.INPUT,
                initialValue: "",
                placeholder: "[GOAL] ...\n[STAKES] ...\n[THEME] ...",
                storageKey: `story:cr-goal-${goal.id}`,
                style: isEditing ? this.style?.("goalInput") : this.style?.("goalInputHidden"),
              }),
            ],
          });
        });

        api.v1.ui.updateParts([
          { id: CR.GOALS_LIST, style: { display: "flex" }, content: goalParts },
        ]);
      },
    );

    // Intent display — seed storyStorage for EditableText, always visible
    useSelector(
      (s) => s.crucible.intent,
      async (intent) => {
        if (!intent) return;

        // Seed storyStorage for EditableText
        await api.v1.storyStorage.set("cr-intent", intent);

        // Update the EditableText view with emoji-formatted display
        api.v1.ui.updateParts([
          { id: `${CR.INTENT_TEXT}-view`, text: formatForDisplay(intent) },
        ]);
      },
    );

    // Checkpoint display
    useSelector(
      (s) => s.crucible.checkpointReason,
      (reason) => {
        if (reason) {
          api.v1.ui.updateParts([
            { id: CR.CHECKPOINT_ROW, style: this.style?.("checkpointBox") },
            { id: CR.CHECKPOINT_TEXT, text: reason },
          ]);
        } else {
          api.v1.ui.updateParts([
            { id: CR.CHECKPOINT_ROW, style: this.style?.("hidden") },
          ]);
        }
      },
    );

    // Beats display (for active chain)
    useSelector(
      (s) => {
        const { activeGoalId, chains } = s.crucible;
        const chain = activeGoalId ? chains[activeGoalId] : null;
        return {
          beats: chain?.beats || [],
          open: chain?.openConstraints || [],
          resolved: chain?.resolvedConstraints || [],
          elements: chain?.worldElements,
          complete: chain?.complete || false,
          activeGoalId,
        };
      },
      (slice) => {
        // Beats
        if (slice.beats.length === 0) {
          api.v1.ui.updateParts([
            { id: CR.BEATS_LIST, style: this.style?.("hidden") },
          ]);
        } else {
          const beatParts = slice.beats.map((beat, i) => {
            const scene = parseTag(beat.text, "SCENE") || beat.text.split("\n")[0] || "Beat";
            return column({
              style: this.style?.("beatCard"),
              content: [
                text({
                  text: `Beat ${i + 1}: ${scene}`,
                  style: this.style?.("beatText"),
                }),
              ],
            });
          }).reverse();

          api.v1.ui.updateParts([
            { id: CR.BEATS_LIST, style: { display: "flex" }, content: beatParts },
          ]);
        }

        // Constraints
        const constraintParts = [
          ...slice.open.map((c) =>
            text({
              text: `\u25CB ${c.description}`,
              style: this.style?.("constraintOpen"),
            }),
          ),
          ...slice.resolved.slice(-5).map((c) =>
            text({
              text: `\u25CF ${c.description} (${c.status === "groundState" ? "ground state" : "resolved"})`,
              style: this.style?.("constraintResolved"),
            }),
          ),
        ];
        if (constraintParts.length > 0) {
          api.v1.ui.updateParts([
            { id: CR.CONSTRAINTS_LIST, style: { display: "flex" }, content: constraintParts },
          ]);
        } else {
          api.v1.ui.updateParts([
            { id: CR.CONSTRAINTS_LIST, style: this.style?.("hidden") },
          ]);
        }

        // World elements summary
        if (slice.elements) {
          const counts: string[] = [];
          if (slice.elements.characters.length) counts.push(`${slice.elements.characters.length} chars`);
          if (slice.elements.locations.length) counts.push(`${slice.elements.locations.length} locs`);
          if (slice.elements.factions.length) counts.push(`${slice.elements.factions.length} factions`);
          if (slice.elements.systems.length) counts.push(`${slice.elements.systems.length} systems`);
          if (slice.elements.situations.length) counts.push(`${slice.elements.situations.length} situations`);
          const summary = counts.length > 0 ? `Elements: ${counts.join(", ")}` : "";
          api.v1.ui.updateParts([
            {
              id: CR.ELEMENTS_LIST,
              text: summary,
              style: summary ? this.style?.("chainLabel") : this.style?.("hidden"),
            },
          ]);
        }
      },
    );

    // Merged world display
    useSelector(
      (s) => s.crucible.mergedWorld,
      (mergedWorld) => {
        if (!mergedWorld || mergedWorld.elements.length === 0) {
          api.v1.ui.updateParts([
            { id: CR.MERGED_LIST, style: this.style?.("hidden") },
          ]);
          return;
        }

        const elementParts = mergedWorld.elements.map((el) => {
          const description = parseTag(el.text, "DESCRIPTION") || "";
          const purpose = parseTag(el.text, "PURPOSE") || "";

          return column({
            style: this.style?.("mergedCard"),
            content: [
              row({
                style: { gap: "6px", "align-items": "center" },
                content: [
                  text({ text: el.name, style: this.style?.("mergedName") }),
                  text({ text: el.type, style: this.style?.("mergedType") }),
                ],
              }),
              text({ text: description, style: this.style?.("mergedText") }),
              purpose ? text({
                text: `Purpose: ${purpose}`,
                style: { ...this.style?.("mergedText"), opacity: "0.6", "font-style": "italic" },
              }) : text({ text: "" }),
            ],
          });
        });

        api.v1.ui.updateParts([
          { id: CR.MERGED_LIST, style: { display: "flex" }, content: elementParts },
        ]);
      },
    );

    // Action buttons visibility by phase
    useSelector(
      (s) => ({
        phase: s.crucible.phase,
        hasGoals: s.crucible.goals.length > 0,
        hasSelectedGoals: s.crucible.goals.some((g) => g.selected),
        autoChaining: s.crucible.autoChaining,
        hasMergedWorld: s.crucible.mergedWorld !== null,
        isGenerating: s.runtime.activeRequest !== null,
      }),
      (slice) => {
        const { phase } = slice;
        const canAct = !slice.isGenerating;
        const preChaining = phase === "idle" || phase === "goals";

        // Intent derive button: visible when not generating and not in chaining+
        api.v1.ui.updateParts([
          {
            id: `${CR.INTENT_BTN}`,
            style: preChaining ? { display: "flex" } : { display: "none" },
          },
        ]);

        // Goal management header: visible in idle and goals phases
        api.v1.ui.updateParts([
          {
            id: "cr-goal-controls",
            style: preChaining ? { display: "flex" } : { display: "none" },
          },
        ]);

        // Confirm Goals button: visible in goals phase with selected goals
        api.v1.ui.updateParts([
          {
            id: "cr-confirm-goals-btn",
            style: phase === "goals" && slice.hasSelectedGoals && canAct
              ? this.style?.("btnPrimary")
              : this.style?.("hidden"),
          },
        ]);

        // Chain controls
        api.v1.ui.updateParts([
          {
            id: "cr-chain-row",
            style: phase === "chaining" ? { display: "flex" } : { display: "none" },
          },
        ]);

        // Commit button: visible in reviewing
        api.v1.ui.updateParts([
          {
            id: CR.COMMIT_BTN,
            style: phase === "reviewing" && slice.hasMergedWorld
              ? this.style?.("btnPrimary")
              : this.style?.("hidden"),
          },
        ]);

        // Stop button: visible during active generation
        api.v1.ui.updateParts([
          {
            id: CR.STOP_BTN,
            style: slice.isGenerating
              ? this.style?.("btnDanger")
              : this.style?.("hidden"),
          },
        ]);

        // Stream text: visible only for chain/merge (not goals — they stream into cards)
        api.v1.ui.updateParts([
          {
            id: CR.STREAM_TEXT,
            style: (phase === "chaining" || phase === "merging")
              ? this.style?.("streamText")
              : this.style?.("hidden"),
          },
        ]);
      },
    );

    // --- Build initial UI tree ---
    return column({
      id: CR.WINDOW_ROOT,
      style: this.style?.("root"),
      content: [
        // Header
        row({
          style: this.style?.("headerRow"),
          content: [
            text({ text: "Crucible", style: this.style?.("title") }),
            text({
              id: CR.PHASE_TEXT,
              text: PHASE_LABELS[state.crucible.phase],
              style: this.style?.("phaseTag"),
            }),
            button({
              id: CR.RESET_BTN,
              text: "Reset",
              style: this.style?.("btn"),
              callback: () => dispatch(crucibleReset()),
            }),
          ],
        }),

        // Status
        text({
          id: CR.STATUS_TEXT,
          text: "Write or generate intent, then generate goals.",
          style: this.style?.("statusText"),
        }),

        // Budget feedback
        budgetPart,

        // Checkpoint alert
        column({
          id: CR.CHECKPOINT_ROW,
          style: state.crucible.checkpointReason
            ? this.style?.("checkpointBox")
            : this.style?.("hidden"),
          content: [
            text({
              id: CR.CHECKPOINT_TEXT,
              text: state.crucible.checkpointReason || "",
              style: this.style?.("checkpointText"),
            }),
            row({
              style: { gap: "6px" },
              content: [
                button({
                  text: "Continue",
                  style: this.style?.("btnPrimary"),
                  callback: () => dispatch(checkpointCleared()),
                }),
                button({
                  text: "Reject Beat",
                  style: this.style?.("btnDanger"),
                  callback: () => {
                    const s = ctx.getState();
                    if (s.crucible.activeGoalId) {
                      dispatch(beatRejected({ goalId: s.crucible.activeGoalId }));
                      dispatch(checkpointCleared());
                    }
                  },
                }),
              ],
            }),
          ],
        }),

        // --- Intent Section (always visible) ---
        row({ style: this.style?.("divider"), content: [] }),
        row({
          style: { ...this.style?.("headerRow"), gap: "6px" },
          content: [
            text({ text: "**Intent**", style: this.style?.("sectionTitle"), markdown: true }),
            intentBtnPart,
          ],
        }),
        intentEditablePart,

        // --- Goals Section ---
        row({ style: this.style?.("divider"), content: [] }),
        row({
          id: "cr-goal-controls",
          style: { ...this.style?.("headerRow"), gap: "6px" },
          content: [
            text({ text: "**Goals**", style: this.style?.("sectionTitle"), markdown: true }),
            goalsBtnPart,
            clearGoalsPart,
          ],
        }),

        // Goals list (populated reactively)
        column({
          id: CR.GOALS_LIST,
          style: state.crucible.goals.length > 0
            ? this.style?.("section")
            : this.style?.("hidden"),
          content: [],
        }),

        // + Goal button (at bottom, always accessible)
        button({
          id: CR.ADD_GOAL_BTN,
          text: "+ Goal",
          style: this.style?.("btn"),
          callback: () => {
            dispatch(goalAdded({
              goal: { id: api.v1.uuid(), text: "[GOAL] New goal\n[STAKES] \n[THEME] \n[EMOTIONAL ARC] \n[TERMINAL CONDITION] ", selected: true },
            }));
          },
        }),

        // Confirm Goals & Start Chaining
        button({
          id: "cr-confirm-goals-btn",
          text: "Confirm Goals & Start Chaining",
          style: state.crucible.phase === "goals"
            ? this.style?.("btnPrimary")
            : this.style?.("hidden"),
          callback: () => dispatch(goalsConfirmed()),
        }),

        // Streaming text (for chain/merge generation output only)
        text({
          id: CR.STREAM_TEXT,
          text: "",
          markdown: true,
          style: this.style?.("hidden"),
        }),

        // --- Chaining Section ---
        row({
          id: "cr-chain-row",
          style: state.crucible.phase === "chaining"
            ? this.style?.("buttonRow")
            : this.style?.("hidden"),
          content: [
            button({
              text: "Step",
              style: this.style?.("btn"),
              callback: () => dispatch(crucibleChainRequested()),
            }),
            button({
              text: "Auto-Chain",
              style: this.style?.("btnPrimary"),
              callback: () => {
                dispatch(autoChainStarted());
                dispatch(crucibleChainRequested());
              },
            }),
            button({
              text: "Merge World",
              style: this.style?.("btn"),
              callback: () => dispatch(crucibleMergeRequested()),
            }),
          ],
        }),

        // Stop button
        button({
          id: CR.STOP_BTN,
          text: "Stop",
          style: this.style?.("hidden"),
          callback: () => dispatch(crucibleStopRequested()),
        }),

        // Beats list (populated reactively)
        column({
          id: CR.BEATS_LIST,
          style: this.style?.("hidden"),
          content: [],
        }),

        // Constraints list
        column({
          id: CR.CONSTRAINTS_LIST,
          style: this.style?.("hidden"),
          content: [],
        }),

        // Elements summary
        text({
          id: CR.ELEMENTS_LIST,
          text: "",
          style: this.style?.("hidden"),
        }),

        // Merged world list (populated reactively)
        column({
          id: CR.MERGED_LIST,
          style: this.style?.("hidden"),
          content: [],
        }),

        // Commit button
        button({
          id: CR.COMMIT_BTN,
          text: "Commit to Story Engine",
          style: this.style?.("hidden"),
          callback: () => dispatch(crucibleCommitted()),
        }),
      ],
    });
  },
});
