/**
 * SeThreadEditPane — edit pane for a WorldGroup (Thread).
 *
 * Opened via labelCallback on the thread card.
 *
 * Shows:
 *   - Header: back, thread title, save
 *   - Title textInput
 *   - Summary multilineTextInput
 *   - Members section: SuiSectionedList of entity cards with SuiToggle for membership
 *
 * Title and summary are committed on Save.
 * Membership toggles dispatch entityGroupToggled immediately.
 */

import {
  SuiComponent,
  SuiCard,
  SuiSectionedList,
  SuiToggle,
  type SuiComponentOptions,
} from "nai-simple-ui";
import { store } from "../../core/store";
import {
  groupRenamed,
  groupSummaryUpdated,
  entityGroupToggled,
  uiThreadSummaryGenerationRequested,
} from "../../core/store";
import { WORLD_ENTRY_CATEGORIES } from "../../core/store/types";
import type { WorldEntity, WorldGroup } from "../../core/store/types";
import type { DulfsFieldID } from "../../config/field-definitions";
import { IDS, EDIT_PANE_TITLE, EDIT_PANE_CONTENT } from "../../ui/framework/ids";
import type { EditPaneHost } from "./SeContentWithTitlePane";
import { SeGenerationIconButton } from "./SeGenerationButton";

type Theme = { default: { self: { style: object } } };
type State = Record<string, never>;

export type SeThreadEditPaneOptions = {
  groupId: string;
  editHost: EditPaneHost;
} & SuiComponentOptions<Theme, State>;

const CATEGORY_LABEL: Record<string, string> = {
  dramatisPersonae: "Characters",
  universeSystems: "Systems",
  locations: "Locations",
  factions: "Factions",
  situationalDynamics: "Situations",
  topics: "Topics",
};

function buildEntitySections(
  listId: string,
  groupId: string,
  group: WorldGroup,
  entities: WorldEntity[],
): SuiSectionedList {
  const byCategory = new Map<DulfsFieldID, WorldEntity[]>();
  for (const entity of entities) {
    const bucket = byCategory.get(entity.categoryId) ?? [];
    bucket.push(entity);
    byCategory.set(entity.categoryId, bucket);
  }

  const sections = WORLD_ENTRY_CATEGORIES.flatMap((fieldId) => {
    const bucket = byCategory.get(fieldId);
    if (!bucket) return [];
    const children = bucket.map((entity) => {
      const isMember = group.entityIds.includes(entity.id);
      const isDraft = entity.lifecycle === "draft";
      const toggle = new SuiToggle({
        id: `${listId}-${entity.id}-toggle`,
        state: { on: isMember },
        callback: () => {
          store.dispatch(entityGroupToggled({ groupId, entityId: entity.id }));
        },
      });
      return new SuiCard({
        id: `${listId}-${entity.id}`,
        label: isDraft ? `${entity.name} (draft)` : entity.name,
        actions: [toggle],
      });
    });
    return [{ label: CATEGORY_LABEL[fieldId] ?? fieldId, children }];
  });

  return new SuiSectionedList({ id: listId, sections });
}

const S = {
  container: { gap: "6px", flex: "1", "justify-content": "flex-start" },
  header: { "align-items": "center", gap: "4px", "margin-bottom": "4px" },
  headerName: { flex: "1", "font-size": "0.95em", "font-weight": "bold" },
  saveBtn: { padding: "4px 12px", "flex-shrink": "0" },
  summaryInput: { height: "80px", "font-size": "0.85em", flex: "none" },
  membersLabel: {
    "font-size": "0.8em",
    "font-weight": "bold",
    "margin-top": "4px",
  },
} as const;

export class SeThreadEditPane extends SuiComponent<
  Theme,
  State,
  SeThreadEditPaneOptions,
  UIPartColumn
> {
  private readonly _summaryBtn: SeGenerationIconButton;

  constructor(options: SeThreadEditPaneOptions) {
    super(
      { state: {} as State, ...options },
      { default: { self: { style: {} } } },
    );

    const { groupId } = options;
    const summaryRequestId = `se-thread-summary-${groupId}`;
    const hasSummary = !!(
      store.getState().world.groups.find((g) => g.id === groupId)?.summary
    );
    this._summaryBtn = new SeGenerationIconButton({
      id: `${options.id}-thread-summary-gen`,
      iconId: "zap" as IconId,
      requestId: summaryRequestId,
      hasContent: hasSummary,
      onGenerate: () => {
        store.dispatch(
          uiThreadSummaryGenerationRequested({ groupId, requestId: summaryRequestId }),
        );
      },
    });
  }

  async compose(): Promise<UIPartColumn> {
    const { groupId, editHost } = this.options;
    const EP = IDS.EDIT_PANE;

    const state = store.getState();
    const group = state.world.groups.find((g) => g.id === groupId);
    const title = group?.title ?? "";
    const summary = group?.summary ?? "";

    // Seed storage keys so storageKey-bound inputs pick up current values
    await api.v1.storyStorage.set(EDIT_PANE_TITLE, title);
    await api.v1.storyStorage.set(EDIT_PANE_CONTENT, summary);

    const _save = (): void => {
      void (async () => {
        const newTitle = String(
          (await api.v1.storyStorage.get(EDIT_PANE_TITLE)) ?? "",
        ).trim();
        const newSummary = String(
          (await api.v1.storyStorage.get(EDIT_PANE_CONTENT)) ?? "",
        ).trim();
        if (newTitle) store.dispatch(groupRenamed({ groupId, title: newTitle }));
        store.dispatch(groupSummaryUpdated({ groupId, summary: newSummary }));
        editHost.close();
      })();
    };

    const { column, row, text, button, textInput, multilineTextInput } =
      api.v1.ui.part;

    const entitySectionsPart = await buildEntitySections(
      `${this.id}-entities`,
      groupId,
      group ?? { id: groupId, title: "", summary: "", entityIds: [] },
      state.world.entities,
    ).build();

    return column({
      id: this.id,
      style: S.container,
      content: [
        // Header
        row({
          style: S.header,
          content: [
            button({
              id: `${this.id}-back`,
              iconId: "arrow-left" as IconId,
              callback: () => {
                editHost.close();
              },
            }),
            text({
              text: `**${title || "New Thread"}**`,
              markdown: true,
              style: S.headerName,
            }),
            button({
              id: EP.SAVE_BTN,
              text: "Save",
              style: S.saveBtn,
              callback: () => {
                _save();
              },
            }),
          ],
        }),

        // Title
        textInput({
          id: EP.TITLE_INPUT,
          initialValue: title,
          placeholder: "Thread title…",
          storageKey: `story:${EDIT_PANE_TITLE}`,
          style: { "font-size": "0.85em" },
        }),

        // Summary
        row({
          style: { "align-items": "center", gap: "4px" },
          content: [
            text({ text: "Summary", style: { ...S.membersLabel, flex: "1" } }),
            await this._summaryBtn.build(),
          ],
        }),
        multilineTextInput({
          id: EP.CONTENT_INPUT,
          initialValue: summary,
          placeholder: "Describe this thread…",
          storageKey: `story:${EDIT_PANE_CONTENT}`,
          style: S.summaryInput,
        }),

        // Members
        text({ text: "Members", style: S.membersLabel }),
        entitySectionsPart,
      ],
    });
  }
}
