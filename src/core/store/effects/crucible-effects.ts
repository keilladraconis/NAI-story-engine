import { Store, matchesAction } from "nai-store";
import { RootState, AppDispatch } from "../types";
import { GenX } from "nai-gen-x";
import {
  crucibleShapeRequested,
  crucibleDirectionRequested,
  crucibleTensionsRequested,
  crucibleBuildPassRequested,
  crucibleStopRequested,
  crucibleCastRequested,
  crucibleReset,
  tensionRemoved,
  requestCancelled,
  generationSubmitted,
  requestQueued,
  phaseTransitioned,
  castCompleted,
  dulfsItemAdded,
  updateShape,
  directionSet,
  persistedDataLoaded,
  buildPassCompleted,
} from "../index";
import {
  buildCrucibleShapeStrategy,
  buildCrucibleDirectionStrategy,
  buildCrucibleTensionStrategy,
} from "../../utils/crucible-strategy";
import { buildBuildPassStrategy } from "../../utils/crucible-build-strategy";
import { extractDulfsItemName } from "../../utils/context-builder";
import { ensureCategory } from "./lorebook-sync";
import { IDS, STORAGE_KEYS } from "../../../ui/framework/ids";
import { flushActiveEditor } from "../../../ui/framework/editable-draft";

export function registerCrucibleEffects(
  subscribeEffect: Store<RootState>["subscribeEffect"],
  dispatch: AppDispatch,
  getState: () => RootState,
  genX: GenX,
): void {
  // --- Section collapse/expand helpers ---
  const SECTION_KEYS = {
    shape: STORAGE_KEYS.CR_SHAPE_COLLAPSED,
    direction: STORAGE_KEYS.CR_DIRECTION_COLLAPSED,
    tensions: STORAGE_KEYS.CR_TENSIONS_COLLAPSED,
  } as const;

  const setCollapsed = async (section: "shape" | "direction" | "tensions", collapsed: boolean) => {
    await api.v1.storyStorage.set(SECTION_KEYS[section], collapsed);
  };

  // Expand the first empty section, collapse everything else
  const applySectionFocus = async () => {
    const s = getState();
    const hasShape = !!s.crucible.shape;
    const hasDirection = !!s.crucible.direction;
    const hasTensions = s.crucible.tensions.length > 0;

    if (!hasShape) {
      await setCollapsed("shape", false);
      await setCollapsed("direction", true);
      await setCollapsed("tensions", true);
    } else if (!hasDirection) {
      await setCollapsed("shape", true);
      await setCollapsed("direction", false);
      await setCollapsed("tensions", true);
    } else if (!hasTensions) {
      await setCollapsed("shape", true);
      await setCollapsed("direction", true);
      await setCollapsed("tensions", false);
    } else {
      await setCollapsed("shape", true);
      await setCollapsed("direction", true);
      await setCollapsed("tensions", true);
    }
  };

  // After persisted data loads, sync storage keys to match loaded state
  subscribeEffect(matchesAction(persistedDataLoaded), applySectionFocus);

  // Shape completes → expand Direction
  subscribeEffect(
    matchesAction(updateShape),
    () => {
      setCollapsed("direction", false);
    },
  );

  // Direction completes → expand Tensions
  subscribeEffect(
    matchesAction(directionSet),
    () => {
      setCollapsed("tensions", false);
    },
  );

  // Intent: Shape Requested → queue shape generation
  subscribeEffect(
    matchesAction(crucibleShapeRequested),
    async () => {
      const prefillName = String((await api.v1.storyStorage.get(STORAGE_KEYS.CR_SHAPE_NAME)) || "").trim() || undefined;
      const strategy = buildCrucibleShapeStrategy(getState, prefillName);
      dispatch(requestQueued({ id: strategy.requestId, type: "crucibleShape", targetId: "crucible" }));
      dispatch(generationSubmitted(strategy));
    },
  );

  // Intent: Crucible Direction Requested → collapse Shape, queue direction
  subscribeEffect(
    matchesAction(crucibleDirectionRequested),
    async () => {
      setCollapsed("shape", true);

      const directionStrategy = buildCrucibleDirectionStrategy(getState);
      dispatch(requestQueued({ id: directionStrategy.requestId, type: "crucibleDirection", targetId: "crucible" }));
      dispatch(generationSubmitted(directionStrategy));
    },
  );

  // Intent: Crucible Tensions Requested → flush editor, queue tension generation
  subscribeEffect(
    matchesAction(crucibleTensionsRequested),
    async () => {
      await flushActiveEditor();

      // Collapse Shape & Direction — tensions are the focus now
      setCollapsed("shape", true);
      setCollapsed("direction", true);

      dispatch(phaseTransitioned({ phase: "tensions" }));

      const strategy = buildCrucibleTensionStrategy(getState);
      dispatch(requestQueued({ id: strategy.requestId, type: "crucibleTension", targetId: "crucible" }));
      dispatch(generationSubmitted(strategy));
    },
  );

  // Intent: Build Pass Requested → read guidance, queue build pass strategy
  subscribeEffect(
    matchesAction(crucibleBuildPassRequested),
    async () => {
      await flushActiveEditor();

      const state = getState();
      const acceptedTensions = state.crucible.tensions.filter((t) => t.accepted);
      if (acceptedTensions.length === 0) {
        api.v1.log("[crucible] Build pass requested but no tensions accepted");
        return;
      }

      // Determine pass number
      const passNumber = state.crucible.passes.length + 1;

      // Read guidance from storage input
      const guidance = String((await api.v1.storyStorage.get(STORAGE_KEYS.CR_BUILD_GUIDANCE)) || "").trim();

      // Transition to building phase on first pass only
      if (passNumber === 1) {
        // Collapse tensions section
        setCollapsed("tensions", true);
        dispatch(phaseTransitioned({ phase: "building" }));
      }

      // Clear guidance input after reading
      await api.v1.storyStorage.set(STORAGE_KEYS.CR_BUILD_GUIDANCE, "");

      const strategy = buildBuildPassStrategy(getState, passNumber, guidance);
      dispatch(requestQueued({ id: strategy.requestId, type: "crucibleBuildPass", targetId: "crucible" }));
      dispatch(generationSubmitted(strategy));
    },
  );

  // Build pass completed → update UI (NO auto-continuation — user-controlled)
  subscribeEffect(
    matchesAction(buildPassCompleted),
    (action) => {
      const { passNumber, commandLog } = action.payload;
      api.v1.log(`[crucible] Build pass ${passNumber} complete: ${commandLog.length} commands`);
    },
  );

  // Intent: Crucible Stop → cancel active and queued crucible requests
  subscribeEffect(
    matchesAction(crucibleStopRequested),
    (_action, { getState: getLatest }) => {
      const state = getLatest();
      const crucibleTypes = new Set([
        "crucibleShape", "crucibleDirection",
        "crucibleTension", "crucibleBuildPass",
      ]);

      // Cancel all queued crucible requests first
      for (const req of state.runtime.queue) {
        if (crucibleTypes.has(req.type)) {
          dispatch(requestCancelled({ requestId: req.id }));
          genX.cancelQueued(req.id);
        }
      }

      // Cancel the active request
      const activeRequest = state.runtime.activeRequest;
      if (activeRequest && crucibleTypes.has(activeRequest.type)) {
        dispatch(requestCancelled({ requestId: activeRequest.id }));
        genX.cancelAll();
      }
    },
  );

  // Intent: Crucible Reset → clean up cr- storyStorage keys, re-focus on Shape
  subscribeEffect(
    matchesAction(crucibleReset),
    async () => {
      const allKeys = await api.v1.storyStorage.list();
      for (const key of allKeys) {
        if (key.startsWith("cr-")) {
          await api.v1.storyStorage.remove(key);
        }
      }

      api.v1.ui.updateParts([
        { id: `${IDS.CRUCIBLE.DIRECTION_TEXT}-view`, text: "" },
      ]);

      // State is now empty — expand Shape, collapse others
      await applySectionFocus();
    },
  );

  // Intent: Tension Removed → clean up tension storyStorage keys
  subscribeEffect(
    matchesAction(tensionRemoved),
    async (action) => {
      const { tensionId } = action.payload;
      const allKeys = await api.v1.storyStorage.list();
      for (const key of allKeys) {
        if (key === `cr-tension-${tensionId}`) {
          await api.v1.storyStorage.remove(key);
        }
      }
    },
  );

  // Intent: Crucible Cast → write elements to World Entries
  subscribeEffect(
    matchesAction(crucibleCastRequested),
    async (_action, { getState: getLatest }) => {
      const state = getLatest();
      const { elements } = state.crucible;
      if (elements.length === 0) {
        api.v1.log("[crucible] Cast requested but no elements");
        api.v1.ui.toast("No world elements to cast", { type: "info" });
        return;
      }

      // Pre-create categories sequentially to avoid races in concurrent dulfsItemAdded handlers
      const uniqueFieldIds = [...new Set(elements.map((el) => el.fieldId))];
      for (const fieldId of uniqueFieldIds) {
        await ensureCategory(fieldId);
      }

      let created = 0;
      let updated = 0;
      for (const el of elements) {
        const content = el.content ? `${el.name}: ${el.content}` : el.name;
        const existingItem = getLatest().story.dulfs[el.fieldId]?.find((item) => item.id === el.id);

        await api.v1.storyStorage.set(STORAGE_KEYS.dulfsItem(el.id), content);
        if (existingItem) {
          // Upsert: sync lorebook display name to match updated content
          const name = extractDulfsItemName(content, el.fieldId);
          await api.v1.lorebook.updateEntry(el.id, { displayName: name });
          updated++;
        } else {
          dispatch(dulfsItemAdded({ fieldId: el.fieldId, item: { id: el.id, fieldId: el.fieldId } }));
          created++;
        }
      }

      dispatch(castCompleted());
      const parts = [created && `${created} created`, updated && `${updated} updated`].filter(Boolean);
      const msg = parts.join(", ") || "no changes";
      api.v1.log(`[crucible] Cast to World Entries: ${msg}`);
      api.v1.ui.toast(`Cast to World Entries: ${msg}`, { type: "success" });
    },
  );
}
