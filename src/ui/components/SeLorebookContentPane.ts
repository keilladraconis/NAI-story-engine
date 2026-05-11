/**
 * SeLorebookContentPane — Panel-modal lorebook editor for a managed entity.
 *
 * Opened via editHost.open() when a live entity card's label is clicked.
 * Provides full lorebook editing: content, keys, refine, and entity unbind.
 *
 * Dispatches uiLorebookEntrySelected on open/close to wire streaming updates.
 * Seeds CONTENT_DRAFT_RAW and KEYS_DRAFT_RAW from current lorebook entry.
 */

import { SuiComponent, type SuiComponentOptions } from "nai-simple-ui";
import { store } from "../../core/store";
import {
  uiLorebookEntrySelected,
  uiLorebookContentGenerationRequested,
  uiLorebookKeysGenerationRequested,
} from "../../core/store/slices/ui";
import { entityUnbound } from "../../core/store/slices/world";
import { IDS } from "../../ui/framework/ids";
import { StoreWatcher } from "../store-watcher";
import { SeGenRefinePair } from "./SeGenRefinePair";
import { SeGenerationIconButton } from "./SeGenerationButton";
import type { EditPaneHost } from "./SeContentWithTitlePane";

type Theme = { default: { self: { style: object } } };
type State = Record<string, never>;

export type SeLorebookContentPaneOptions = {
  entityId: string;
  editHost: EditPaneHost;
} & SuiComponentOptions<Theme, State>;

const S = {
  entryName: { "font-weight": "bold", "font-size": "0.95em", flex: "1" },
  lifecycleBadge: {
    "font-size": "11px",
    opacity: "0.5",
    "font-style": "italic",
    "flex-shrink": "0",
  },
  buttonRow: { gap: "8px", "margin-top": "4px" },
  contentInput: { "font-size": "13px", flex: "auto" },
  keysRow: { gap: "8px", "align-items": "center" },
  keysLabel: {
    "font-size": "12px",
    color: "rgba(255,255,255,0.6)",
    "white-space": "nowrap",
  },
  keysInput: { "font-size": "12px", flex: "1" },
  actionRow: { gap: "8px", "margin-top": "12px" },
  unbindBtn: {
    flex: "1",
    "font-size": "0.85em",
    padding: "4px 8px",
    opacity: "0.6",
  },
};

export class SeLorebookContentPane extends SuiComponent<
  Theme,
  State,
  SeLorebookContentPaneOptions,
  UIPartColumn
> {
  private readonly _watcher: StoreWatcher;
  private readonly _contentBtn: SeGenRefinePair;
  private readonly _keysBtn: SeGenerationIconButton;

  constructor(options: SeLorebookContentPaneOptions) {
    super(
      { state: {} as State, ...options },
      { default: { self: { style: {} } } },
    );

    this._watcher = new StoreWatcher();

    const { entityId } = options;
    const entity = store.getState().world.entitiesById[entityId];
    const entryId = entity?.lorebookEntryId ?? "";

    this._contentBtn = new SeGenRefinePair({
      id: IDS.LOREBOOK.GEN_CONTENT_BTN,
      fieldId: "lorebookContent",
      entryId,
      refineSourceText: async () => {
        const v = await api.v1.storyStorage.get(IDS.LOREBOOK.CONTENT_DRAFT_KEY);
        return typeof v === "string" ? v : "";
      },
      onGenerate: () => {
        if (!entryId) return;
        store.dispatch(
          uiLorebookContentGenerationRequested({
            requestId: IDS.LOREBOOK.entry(entryId).CONTENT_REQ,
          }),
        );
      },
    });

    this._keysBtn = new SeGenerationIconButton({
      id: IDS.LOREBOOK.GEN_KEYS_BTN,
      iconId: "zap",
      requestId: entryId ? IDS.LOREBOOK.entry(entryId).KEYS_REQ : undefined,
      onGenerate: () => {
        if (!entryId) return;
        store.dispatch(
          uiLorebookKeysGenerationRequested({
            requestId: IDS.LOREBOOK.entry(entryId).KEYS_REQ,
          }),
        );
      },
    });
  }

  async compose(): Promise<UIPartColumn> {
    const { entityId, editHost } = this.options;
    const L = IDS.LOREBOOK;

    this._watcher.dispose();

    const state = store.getState();
    const entity = state.world.entitiesById[entityId];
    const entryId = entity?.lorebookEntryId ?? "";

    if (entryId) {
      store.dispatch(uiLorebookEntrySelected({ entryId, categoryId: null }));
    }

    if (entryId) {
      const entry = await api.v1.lorebook.entry(entryId);
      await api.v1.storyStorage.set(L.CONTENT_DRAFT_RAW, entry?.text || "");
      await api.v1.storyStorage.set(
        L.KEYS_DRAFT_RAW,
        entry?.keys?.join(", ") || "",
      );
    }

    const [contentPart, keysPart] = await Promise.all([
      this._contentBtn.build(),
      this._keysBtn.build(),
    ]);

    const { column, row, text, button, multilineTextInput, textInput } =
      api.v1.ui.part;

    const _close = (): void => {
      store.dispatch(
        uiLorebookEntrySelected({ entryId: null, categoryId: null }),
      );
      editHost.close();
    };

    return column({
      id: this.id,
      style: { gap: "6px", flex: "1" },
      content: [
        // ── Header ─────────────────────────────────────────────────────
        row({
          style: {
            "align-items": "center",
            gap: "4px",
            "margin-bottom": "4px",
          },
          content: [
            button({
              id: `${this.id}-back`,
              text: "",
              iconId: "arrow-left" as IconId,
              callback: () => {
                _close();
              },
            }),
            text({
              id: L.ENTRY_NAME,
              text: `**${entity?.name ?? ""}**`,
              markdown: true,
              style: S.entryName,
            }),
          ],
        }),

        // ── Gen buttons ────────────────────────────────────────────────
        row({ style: S.buttonRow, content: [contentPart, keysPart] }),

        // ── Content textarea ───────────────────────────────────────────
        multilineTextInput({
          id: L.CONTENT_INPUT,
          initialValue: "",
          placeholder: "Lorebook content...",
          storageKey: `story:${L.CONTENT_DRAFT_KEY}`,
          style: S.contentInput,
          onChange: async (value: string) => {
            if (!entryId) return;
            const erato =
              (await api.v1.config.get("erato_compatibility")) || false;
            const withHeader =
              erato && !value.startsWith("----\n") ? "----\n" + value : value;
            await api.v1.lorebook.updateEntry(entryId, { text: withHeader });
          },
        }),

        // ── Keys ───────────────────────────────────────────────────────
        row({
          style: S.keysRow,
          content: [
            text({ text: "Keys:", style: S.keysLabel }),
            textInput({
              id: L.KEYS_INPUT,
              initialValue: "",
              placeholder: "comma, separated, keys",
              storageKey: `story:${L.KEYS_DRAFT_KEY}`,
              style: S.keysInput,
              onChange: async (value: string) => {
                if (!entryId) return;
                const keys = value
                  .split(",")
                  .map((k) => k.trim())
                  .filter((k) => k.length > 0);
                await api.v1.lorebook.updateEntry(entryId, { keys });
              },
            }),
          ],
        }),

        // ── Entity actions ─────────────────────────────────────────────
        row({
          style: S.actionRow,
          content: [
            button({
              id: L.UNBIND_BTN,
              text: "✕ Unbind",
              style: S.unbindBtn,
              callback: () => {
                const e = store.getState().world.entitiesById[entityId];
                if (e) {
                  store.dispatch(entityUnbound({ entityId }));
                  api.v1.ui.toast(`Unbound: ${e.name}`, { type: "success" });
                }
                _close();
              },
            }),
          ],
        }),
      ],
    });
  }
}
