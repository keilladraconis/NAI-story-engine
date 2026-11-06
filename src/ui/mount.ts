// Startup: load the story's records, start the GLM queue, register the editor
// hooks, and mount the surfaces. NovelAI takes extensions in ONE register call;
// a second call replaces the first.

import { store, lorebookEntrySelected } from "../core/store";
import { loadPersisted, savePersisted } from "../core/store/persistence";
import { startGlm } from "../core/engine/glm";
import { enableJournal } from "../core/engine/journal";
import { registerWorkshopHooks, saveDraft } from "../core/workshop/workshop";
import { redraw, setWidgetContent } from "../core/workshop/page";
import { targetLabel } from "../core/workshop/targets";
import { Sidebar } from "./sidebar/Sidebar";
import { WorkshopPanel, currentSaveLabel } from "./panel/WorkshopPanel";
import { JournalPanel } from "./panels/journal/JournalPanel";
import { LorebookPanel } from "./lorebook/LorebookPanel";

const { sidebarPanel, scriptPanel, lorebookPanel } = api.v1.ui.extension;

const PANEL_ID = "se-workshop-panel";

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

/** The panel's name carries the workshop state, so it reads even collapsed. */
function panelName(): string {
  return store.getState().workshop.on
    ? "Story Engine · Workshop on"
    : "Story Engine";
}

/**
 * The script panel. Renaming it means sending the whole extension again:
 * `ui.update([{ id, name }])` removed the panel in the probe.
 */
function buildPanel(): UIExtensionScriptPanel & { id: string } {
  const panel = scriptPanel({
    id: PANEL_ID,
    name: panelName(),
    content: [
      api.v1.ui.part.jsx({
        id: "se-panel-root",
        onMount: (el) => render(h(WorkshopPanel, null), el),
      }),
    ],
  });
  return { ...panel, id: PANEL_ID };
}

function DividerSave() {
  return h(
    "button",
    {
      onClick: () => void saveDraft(),
      style: {
        minHeight: "36px",
        padding: "0 12px",
        cursor: "pointer",
        fontWeight: "bold",
      },
    },
    currentSaveLabel(),
  );
}

/** The divider widget's content, rebuilt on every redraw so labels follow the target. */
function dividerContent(): UIPart[] {
  const state = store.getState();
  return [
    api.v1.ui.part.text({
      text: `Story Engine draft · ${targetLabel(state, state.workshop.target)} · not part of the story`,
      noTemplate: true,
    }),
    api.v1.ui.part.jsx({ onMount: (el) => render(h(DividerSave, null), el) }),
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
    buildPanel(),
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
    (s) => s.workshop.on,
    () => void api.v1.ui.update([buildPanel()]),
  );

  // Widgets and markers do not survive a reload.
  if (store.getState().workshop.on) await redraw();
}
