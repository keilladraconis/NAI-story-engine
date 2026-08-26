// The Engine section on the Engine tab — the only way to switch the Engine on.
//
// The settings live in Story Engine's own storage, per story (see
// `src/core/engine/settings.ts`), because `api.v1.config` can only be read and a
// control that cannot write its own setting is not a control. This section is
// what writes them — every one of them.
//
// **One mount.** Mounted twice, the two copies would be two independent write
// queues over one record: `save` reads the store, edits and writes, so a toggle
// on one and a number committed on the other interleave and lose a field.
//
// **The On/Off toggle is the first thing inside the collapsible.** It briefly
// sat above the section header, on the theory that a collapsed section should
// still show whether the Engine was running. That read as an anomaly — a bare
// toggle with nothing naming what it switched on. Under the "Engine" header the
// label does that work, and the toggle leads the settings it governs.
//
// **The notes are short on purpose.** Every control here used to carry a
// paragraph, and seven paragraphs is a wall that buries the controls it means
// to explain. What belongs on screen is what a writer needs to answer "what
// does this do, and what may I type"; the reasoning behind each bound lives in
// `settings.ts`, next to the bound. A numeric setting with no field here is reachable
// only by hand-editing storyStorage, which is the presentation these settings
// left `project.yaml` to escape; `NUMERIC_SETTINGS` is the list, and
// `engine-settings-source.test.ts` counts the fields against it.
//
// Four rules hold this file together, and each of them has cost this project a
// bug:
//
//   1. **Every commit dispatches `engineSettingsChanged` straight after
//      `writeEngineSettings`.** The HUD and this form both render from the
//      store, and nothing else re-reads the slot until the next generation. Skip
//      the dispatch and the writer flips the toggle while the HUD goes on
//      insisting "Off — the Engine is not running" — commit `5f71191`, from the
//      other direction.
//   2. **What is dispatched is what is stored.** `writeEngineSettings` clamps on
//      the way in, so the form clamps first (through the same
//      `normalizeEngineSettings`) and dispatches, displays and stores that one
//      value. Dispatch what was typed instead and the form shows one number
//      while the loop uses another.
//   3. **A box may speak a different unit than storage keeps.** The delay is
//      typed and shown in seconds and stored in milliseconds; the condense
//      threshold is typed in paragraphs and stored in characters. Every
//      conversion in both directions goes through `engine-settings-model.ts` —
//      `resolveTypedSetting` on the way in, `draftFor` on the way out, and
//      `toTyped` for the bounds in the label's help and the input's own
//      `min`/`max`. Nothing here divides or multiplies by anything itself; a
//      conversion applied in one direction only is a box that shows a number
//      the loop is not using.
//   4. **Typing dispatches nothing.** The number fields draft locally on
//      `onInput` (never `onChange`, which fires on blur and leaves anything
//      reading before it a keystroke behind) and commit when the field loses
//      focus. A dispatch per keystroke is reducer overhead for a value nobody
//      has finished typing.
//
// The commits queue rather than refuse each other. Blurring a number field and
// clicking the toggle in one motion is two commits a few milliseconds apart,
// and both of them are the writer's: a re-entry guard that dropped the second
// would eat the toggle press, and one that let both through against the same
// stale snapshot would write the pre-blur delay back over the one just typed.
// Chaining them, and computing each from the store at the moment it runs, is
// what makes both land.

import { useSlice } from "../../bridge";
import { store, engineSettingsChanged } from "../../../core/store";
import {
  CONDENSE_AT_CHARS_MAX,
  CONDENSE_AT_CHARS_MIN,
  DELAY_MS_MAX,
  DELAY_MS_MIN,
  MIN_PROSE_MAX,
  MIN_PROSE_MIN,
  THREAD_CAP_MAX,
  THREAD_CAP_MIN,
  normalizeEngineSettings,
  writeEngineSettings,
  type EngineSettings,
} from "../../../core/engine/settings";
import {
  CREATIVE_MODELS,
  type CreativeModel,
} from "../../../core/utils/config";
import { SP, T } from "../../style";
import { SectionHeader } from "../../components/SectionHeader";
import {
  draftFor,
  resolveTypedSetting,
  toTyped,
  type NumericSetting,
} from "./engine-settings-model";
import { ToggleLeft, ToggleRight } from "nai:icons/feather";

const ICON_SIZE = 18;

const FIELD_STYLE = {
  background: T.bg,
  color: T.text,
  fontFamily: T.fontDefault,
  border: `1px solid ${T.bg3}`,
  padding: SP.sm,
  width: "7em",
} as const;

const HELP_STYLE = { fontSize: "0.8em", opacity: 0.7 } as const;

/** The creative-model picker.
 *
 *  A row of buttons rather than a `<select>`: each model needs a line of prose
 *  under it saying who can use it, and a native option list has nowhere to put
 *  one. There is no API that reports which models a subscription covers, so
 *  Xialong cannot be greyed out for a writer without Opus — the note is the only
 *  honest signal available.
 *
 *  Every model is mounted and `background`/`color` mark the chosen one. Nothing
 *  is swapped for anything at a fixed position: this section re-renders from a
 *  store subscription, and a component whose *type* changes there leaves the old
 *  element behind (CLAUDE.md). */
function ModelPicker(props: {
  value: CreativeModel;
  onPick: (model: CreativeModel) => void;
}): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
      <span style={{ fontFamily: T.fontDefault }}>Creative model</span>
      <div style={{ display: "flex", gap: SP.sm, flexWrap: "wrap" }}>
        {CREATIVE_MODELS.map((model) => (
          <button
            key={model.id}
            onClick={() => props.onPick(model.id)}
            title={model.note}
            style={{
              background: props.value === model.id ? T.bg3 : "none",
              color: props.value === model.id ? T.textHeadings : T.textDisabled,
              border: `1px solid ${T.bg3}`,
              fontFamily: T.fontDefault,
              fontWeight: props.value === model.id ? "bold" : "normal",
              padding: SP.sm,
              cursor: "pointer",
            }}
          >
            {model.label}
          </button>
        ))}
      </div>
      <span style={HELP_STYLE}>
        {CREATIVE_MODELS.find((model) => model.id === props.value)?.note} Keys
        and summaries always run on GLM.
      </span>
    </div>
  );
}

/** One labelled number field. The label, the input and the note under it are one
 *  unit so the two fields cannot drift apart, and so neither can reach for its
 *  own idea of how to commit. */
function NumberField(props: {
  label: string;
  help: string;
  value: string;
  min: number;
  max: number;
  /** The stepper's increment. `"any"` on the delay and the condense threshold,
   *  because seconds and paragraphs are both fractional and a step of 1 would
   *  mark 4.5 invalid in a field that accepts it. The commit path does the real
   *  work either way — these attributes clamp nothing typed. */
  step: string;
  onInput: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.xs }}>
      <label style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
        <span style={{ flex: 1 }}>{props.label}</span>
        <input
          type="number"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          // onInput, never onChange: `change` only fires when the field
          // commits — i.e. on blur — so anything reading this state before then
          // would be a keystroke behind. Drafting is all this does; the commit
          // is onBlur.
          onInput={(e) => props.onInput(e.target.value ?? "")}
          onBlur={props.onCommit}
          style={FIELD_STYLE}
        />
      </label>
      <span style={HELP_STYLE}>{props.help}</span>
    </div>
  );
}

export function EngineSettings() {
  // The store, not a storyStorage read: the startup read, every pass and the
  // generation hook all keep this object current, and a component cannot await.
  // The slice returns the same object when a re-read changed nothing, so
  // identity comparison is enough to subscribe with.
  const settings = useSlice((s) => s.engine.settings);

  const [open, setOpen] = useState(false);
  const [delayDraft, setDelayDraft] = useState(draftFor(settings, "delayMs"));
  const [proseDraft, setProseDraft] = useState(draftFor(settings, "minProse"));
  const [capDraft, setCapDraft] = useState(draftFor(settings, "threadCap"));
  const [condenseDraft, setCondenseDraft] = useState(
    draftFor(settings, "condenseAtChars"),
  );

  // The drafts follow the store, which moves under this form twice: the startup
  // read lands a tick after mount, and each commit's own dispatch comes back
  // through here carrying the clamped number. That second path is what makes
  // "what you see is what is stored" true for a value that was clamped.
  useEffect(
    () => setDelayDraft(draftFor(settings, "delayMs")),
    [settings.delayMs],
  );
  useEffect(
    () => setProseDraft(draftFor(settings, "minProse")),
    [settings.minProse],
  );
  useEffect(
    () => setCapDraft(draftFor(settings, "threadCap")),
    [settings.threadCap],
  );
  useEffect(
    () => setCondenseDraft(draftFor(settings, "condenseAtChars")),
    [settings.condenseAtChars],
  );

  // Commits run one at a time, in order, each computed from the store as it is
  // when its turn comes. `then(run, run)` rather than `then(run)`: a failed
  // write must not leave every later commit queued behind a rejected promise.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const save = (next: (current: EngineSettings) => EngineSettings): void => {
    const run = async (): Promise<void> => {
      const normalized = normalizeEngineSettings(
        next(store.getState().engine.settings),
      );
      await writeEngineSettings(normalized);
      // Immediately, and with the SAME normalised object that was stored. See
      // rules 1 and 2 at the top of this file.
      store.dispatch(engineSettingsChanged(normalized));
    };
    queueRef.current = queueRef.current.then(run, run);
  };

  const commit = (
    field: NumericSetting,
    draft: string,
    show: (value: string) => void,
  ): void => {
    // Shown before the write lands, and shown even when the write is a no-op —
    // a field left holding "abc" or an out-of-range number after the value it
    // set is neither is the one thing this form must never do.
    show(draftFor(resolveTypedSetting(settings, field, draft), field));
    save((current) => resolveTypedSetting(current, field, draft));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SP.md }}>
      <SectionHeader
        label="Engine"
        open={open}
        onToggle={() => setOpen(!open)}
      />

      <div
        style={{
          display: open ? "flex" : "none",
          flexDirection: "column",
          gap: SP.md,
          background: T.bg2,
          color: T.text,
          fontFamily: T.fontDefault,
          padding: SP.md,
        }}
      >
        <button
          onClick={() =>
            save((current) => ({ ...current, enabled: !current.enabled }))
          }
          title="Switch the Engine on or off for this story"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: SP.sm,
            alignSelf: "flex-start",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: settings.enabled ? T.textHeadings : T.textDisabled,
            fontFamily: T.fontDefault,
            fontWeight: "bold",
            padding: 0,
          }}
        >
          {/* Both states mounted, `display` picks: swapping one component type
              for another at a fixed position leaves the old svg behind when the
              re-render arrives from a store subscription, which is every render
              this section does. */}
          <ToggleRight
            size={ICON_SIZE}
            style={{ display: settings.enabled ? "inline-flex" : "none" }}
          />
          <ToggleLeft
            size={ICON_SIZE}
            style={{ display: settings.enabled ? "none" : "inline-flex" }}
          />
          {settings.enabled ? "On" : "Off"}
        </button>

        <span style={HELP_STYLE}>
          Reads the prose you have written since it last looked, then updates
          the World: rewriting an entity’s lorebook entry, opening or retiring a
          Thread, condensing an entry that has sprawled. It rewrites entries in
          place and keeps no copy — export your lorebook first if the exact
          wording matters. Typing wakes nothing; use ⚡ on the HUD to run a pass
          by hand.
        </span>

        <ModelPicker
          value={settings.creativeModel}
          onPick={(creativeModel) =>
            save((current) => ({ ...current, creativeModel }))
          }
        />

        <NumberField
          label="Delay (seconds)"
          help={`How long after a generation the Engine looks. ${toTyped("delayMs", DELAY_MS_MIN)}–${toTyped("delayMs", DELAY_MS_MAX)}.`}
          value={delayDraft}
          min={toTyped("delayMs", DELAY_MS_MIN)}
          max={toTyped("delayMs", DELAY_MS_MAX)}
          step="any"
          onInput={setDelayDraft}
          onCommit={() => commit("delayMs", delayDraft, setDelayDraft)}
        />

        <NumberField
          label="Minimum new paragraphs"
          help={`New paragraphs needed before a pass runs. ${MIN_PROSE_MIN}–${MIN_PROSE_MAX}.`}
          value={proseDraft}
          min={MIN_PROSE_MIN}
          max={MIN_PROSE_MAX}
          step="1"
          onInput={setProseDraft}
          onCommit={() => commit("minProse", proseDraft, setProseDraft)}
        />

        <NumberField
          label="Thread limit"
          help={`How many Threads this story may hold. At the limit a new one displaces the weakest instead of adding. ${THREAD_CAP_MIN}–${THREAD_CAP_MAX}.`}
          value={capDraft}
          min={THREAD_CAP_MIN}
          max={THREAD_CAP_MAX}
          step="1"
          onInput={setCapDraft}
          onCommit={() => commit("threadCap", capDraft, setCapDraft)}
        />

        <NumberField
          label="Condense entries over (paragraphs)"
          help={`Paragraphs an entry may reach before the Engine rewrites it tighter. Condensing can lose a detail, so raise it to leave entries alone. ${toTyped("condenseAtChars", CONDENSE_AT_CHARS_MIN)}–${toTyped("condenseAtChars", CONDENSE_AT_CHARS_MAX)}.`}
          value={condenseDraft}
          min={toTyped("condenseAtChars", CONDENSE_AT_CHARS_MIN)}
          max={toTyped("condenseAtChars", CONDENSE_AT_CHARS_MAX)}
          step="any"
          onInput={setCondenseDraft}
          onCommit={() =>
            commit("condenseAtChars", condenseDraft, setCondenseDraft)
          }
        />

        <span style={HELP_STYLE}>
          Changes take effect on the next generation. Out-of-range numbers are
          clamped; the number left in the box is the number in use.
        </span>
      </div>
    </div>
  );
}
