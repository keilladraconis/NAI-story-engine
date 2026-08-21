// The Engine section — the only way to switch the Engine on.
//
// The three settings behind it used to be `project.yaml` entries, which
// `api.v1.config` can only read; they now live in Story Engine's own storage,
// per story (see `src/core/engine/settings.ts`). This section is what writes
// them.
//
// Three rules hold this file together, and each of them has cost this project a
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
//   3. **Typing dispatches nothing.** The number fields draft locally on
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
  DELAY_MS_MAX,
  DELAY_MS_MIN,
  MIN_PROSE_MAX,
  MIN_PROSE_MIN,
  normalizeEngineSettings,
  writeEngineSettings,
  type EngineSettings,
} from "../../../core/engine/settings";
import { SP, T } from "../../style";
import { SectionHeader } from "./SectionHeader";
import {
  resolveTypedSetting,
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

/** One labelled number field. The label, the input and the note under it are one
 *  unit so the two fields cannot drift apart, and so neither can reach for its
 *  own idea of how to commit. */
function NumberField(props: {
  label: string;
  help: string;
  value: string;
  min: number;
  max: number;
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
  const [delayDraft, setDelayDraft] = useState(String(settings.delayMs));
  const [proseDraft, setProseDraft] = useState(String(settings.minProse));

  // The drafts follow the store, which moves under this form twice: the startup
  // read lands a tick after mount, and each commit's own dispatch comes back
  // through here carrying the clamped number. That second path is what makes
  // "what you see is what is stored" true for a value that was clamped.
  useEffect(() => setDelayDraft(String(settings.delayMs)), [settings.delayMs]);
  useEffect(
    () => setProseDraft(String(settings.minProse)),
    [settings.minProse],
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
    show(String(resolveTypedSetting(settings, field, draft)[field]));
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

        <span style={{ fontSize: "0.85em", opacity: 0.8 }}>
          On, the Engine wakes a few seconds after each generation, reads
          whatever prose has appeared since it last looked, and records what
          your story has made wrong, left hanging, or settled. That list goes to
          the script log, and that is where it stops — it does not touch your
          lorebook, your entities or your Threads. Each pass spends one small
          generation from the same output budget as everything else, and skips
          itself when there is nothing new to read. Prose you type yourself
          wakes nothing, so use the ⚡ on the Engine HUD to run a pass on the
          spot.
        </span>

        <NumberField
          label="Delay (ms)"
          help={`How long after a generation starts the Engine looks. ${DELAY_MS_MIN}–${DELAY_MS_MAX}.`}
          value={delayDraft}
          min={DELAY_MS_MIN}
          max={DELAY_MS_MAX}
          onInput={setDelayDraft}
          onCommit={() => commit("delayMs", delayDraft, setDelayDraft)}
        />

        <NumberField
          label="Minimum new paragraphs"
          help={`How much new prose is worth a pass. Below this the Engine keeps counting and waits. ${MIN_PROSE_MIN}–${MIN_PROSE_MAX}.`}
          value={proseDraft}
          min={MIN_PROSE_MIN}
          max={MIN_PROSE_MAX}
          onInput={setProseDraft}
          onCommit={() => commit("minProse", proseDraft, setProseDraft)}
        />

        <span style={HELP_STYLE}>
          Both take effect on the next generation. A number outside its range is
          clamped, and one that is not a number at all leaves the setting alone
          — either way the number left in the box is the number in use.
        </span>
      </div>
    </div>
  );
}
