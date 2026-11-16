// Startup: load the story's records, start the GLM queue, register the editor
// hooks, and mount the surfaces. NovelAI takes extensions in ONE register call;
// a second call replaces the first.

import { store, lorebookEntrySelected } from "../core/store";
import { loadPersisted, savePersisted } from "../core/store/persistence";
import { startGlm } from "../core/engine/glm";
import { enableJournal } from "../core/engine/journal";
import {
  registerWorkshopHooks,
  saveDraft,
  setWorkshopOn,
  stopWriting,
  writeDraft,
} from "../core/workshop/workshop";
import { redraw, setWidgetContent } from "../core/workshop/page";
import { saveLabel, targetLabel } from "../core/workshop/targets";
import { Sidebar } from "./sidebar/Sidebar";
import { JournalPanel } from "./panels/journal/JournalPanel";
import { LorebookPanel } from "./lorebook/LorebookPanel";

const { sidebarPanel, scriptPanel, lorebookPanel, toolbarButton } =
  api.v1.ui.extension;

/** A jsx part that fills its container and lets the tree inside scroll. */
function fillingJsx(id: string, render_: (elem: unknown) => void): UIPart {
  return api.v1.ui.part.jsx({
    id,
    style: {
      display: "grid",
      gridTemplateRows: "minmax(0, 1fr)",
      height: "100%",
      minHeight: "0",
    },
    onMount: (elem) => {
      const el = elem as { style: Record<string, string> };
      el.style.height = "100%";
      el.style.minHeight = "0";
      render_(elem);
    },
  });
}

function buildSidebar(): UIExtension {
  return sidebarPanel({
    id: "se-sidebar",
    name: "Story Engine",
    iconId: "lightning",
    content: [
      api.v1.ui.part.container({
        style: {
          display: "grid",
          gridTemplateRows: "minmax(0, 1fr)",
          height: "100%",
          minHeight: "0",
        },
        content: [
          fillingJsx("se-sidebar-root", (el) => render(h(Sidebar, null), el)),
        ],
      }),
    ],
  });
}

// ── The workshop's toolbar buttons ──────────────────────────────────────────
// While Workshop Sends are on, buttons sit in the toolbar above the editor:
// save the draft (or stop a Draft run), keep writing a draft that stalled
// short of its end (hidden while a run is going), and turn the workshop off.
// Everything else about a draft is chosen from the sidebar.

const SAVE_ID = "se-save-draft";
const OFF_ID = "se-workshop-off";
const KEEP_ID = "se-keep-writing";

function toolbar(): UIExtension[] {
  const state = store.getState();
  const writing = state.runtime.autoDraft;
  return [
    toolbarButton({
      id: SAVE_ID,
      text: writing ? "Stop writing" : saveLabel(state, state.workshop.target),
      iconId: writing ? "stop-circle" : "save",
      callback: () => {
        if (store.getState().runtime.autoDraft) stopWriting();
        else void saveDraft();
      },
    }),
    toolbarButton({
      id: KEEP_ID,
      text: "Keep writing",
      iconId: "play",
      // Continues the draft as it stands, with the direction it was started on.
      // A few Sends at a time: a nudge past a stall, not an unattended run.
      callback: () =>
        void writeDraft(store.getState().workshop.target, undefined, false, 3),
    }),
    toolbarButton({
      id: OFF_ID,
      text: "Workshop off",
      iconId: "power",
      callback: () => void setWorkshopOn(false),
    }),
  ];
}

/** Show the buttons, with labels for the current target, or take them away. */
function syncToolbar(): void {
  const { workshop, runtime } = store.getState();
  if (!workshop.on) {
    void api.v1.ui.remove([SAVE_ID, KEEP_ID, OFF_ID]);
    return;
  }
  const buttons = toolbar() as (UIExtension & { id: string })[];
  if (runtime.autoDraft) {
    void api.v1.ui
      .remove([KEEP_ID])
      .then(() => api.v1.ui.update(buttons.filter((b) => b.id !== KEEP_ID)));
    return;
  }
  // A re-added button goes to the end: take Workshop off away too and add
  // both back, so Keep writing never trades places with it.
  void api.v1.ui
    .remove([KEEP_ID, OFF_ID])
    .then(() => api.v1.ui.update(buttons));
}

/**
 * The divider's label, on a line of its own above the draft: what is being
 * drafted, that it is not story yet, and the button that saves it.
 */
function DividerLabel() {
  const state = store.getState();
  const target = state.workshop.target;
  return h(
    "div",
    {
      style: {
        display: "block",
        padding: "2px 0 4px",
        fontSize: "0.8em",
        opacity: 0.8,
      },
    },
    `Story Engine draft · ${targetLabel(state, target)} · not part of the story. Edit it, then press ${saveLabel(state, target)} above the editor.`,
  );
}

/** The divider widget's content, rebuilt on every redraw so labels follow the target. */
function dividerContent(): UIPart[] {
  return [
    api.v1.ui.part.jsx({ onMount: (el) => render(h(DividerLabel, null), el) }),
  ];
}

export async function start(): Promise<void> {
  api.v1.permissions.request([
    "storyEdit",
    "lorebookEdit",
    "documentEdit",
    "editorDecorations",
  ]);

  startGlm();
  await loadPersisted(store);
  savePersisted(store);
  registerWorkshopHooks();
  setWidgetContent(dividerContent);

  api.v1.hooks.register("onLorebookEntrySelected", ({ entryId }) => {
    store.dispatch(lorebookEntrySelected({ entryId: entryId ?? null }));
  });

  const extensions: UIExtension[] = [
    buildSidebar(),
    ...(store.getState().workshop.on ? toolbar() : []),
    lorebookPanel({
      id: "se-lorebook",
      name: "Story Engine",
      content: [
        api.v1.ui.part.jsx({
          id: "se-lorebook-root",
          onMount: (el) => render(h(LorebookPanel, null), el),
        }),
      ],
    }),
  ];
  if (await api.v1.config.get("generation_journal")) {
    api.v1.permissions.request(["clipboardWrite"]);
    enableJournal();
    extensions.push(
      scriptPanel({
        id: "se-journal",
        name: "Generation Journal",
        content: [
          api.v1.ui.part.jsx({
            id: "se-journal-root",
            onMount: (el) => render(h(JournalPanel, null), el),
          }),
        ],
      }),
    );
  }
  await api.v1.ui.register(extensions);

  store.subscribeSelector(
    (s) =>
      `${s.workshop.on}|${s.runtime.autoDraft}|${saveLabel(s, s.workshop.target)}`,
    syncToolbar,
  );

  // Widgets and markers do not survive a reload.
  if (store.getState().workshop.on) await redraw();
}
