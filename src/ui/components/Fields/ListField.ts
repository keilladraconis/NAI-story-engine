import { defineComponent } from "../../../../lib/nai-act";
import { matchesAction } from "../../../../lib/nai-store";
import { RootState, DulfsItem } from "../../../core/store/types";
import { FieldConfig, DulfsFieldID } from "../../../config/field-definitions";
import { dulfsItemAdded } from "../../../core/store/slices/story";
import {
  uiGenerationRequested,
  requestCompleted,
} from "../../../core/store/slices/runtime";
import { GenerationButton } from "../GenerationButton";
import { ListItem, contentMinHeight, inputStyle } from "./ListItem";
import {
  STATUS_EMPTY,
  STATUS_GENERATING,
  STATUS_QUEUED,
  STATUS_COMPLETE,
} from "../../colors";

export type ListFieldProps = FieldConfig;

const { row, text, column, button, collapsibleSection } = api.v1.ui.part;

/**
 * Count how many items have lorebook content.
 */
async function countLorebookEntries(
  items: DulfsItem[],
): Promise<{ withContent: number; total: number }> {
  let withContent = 0;
  for (const item of items) {
    const entry = await api.v1.lorebook.entry(item.id);
    if (entry?.text?.trim()) {
      withContent++;
    }
  }
  return { withContent, total: items.length };
}

export const ListField = defineComponent<ListFieldProps, RootState>({
  id: (props) => `section-${props.id}`,

  styles: {
    description: {
      "font-style": "italic",
      opacity: 0.8,
      "margin-bottom": "8px",
    },
    itemsColumn: { gap: "4px" },
    actionsRow: { "margin-top": "8px", gap: "8px", "flex-wrap": "wrap" },
    standardButton: { padding: "4px 8px" },
    borderEmpty: { "border-left": `3px solid ${STATUS_EMPTY}` },
    borderQueued: { "border-left": `3px solid ${STATUS_QUEUED}` },
    borderGenerating: { "border-left": `3px solid ${STATUS_GENERATING}` },
    borderComplete: { "border-left": `3px solid ${STATUS_COMPLETE}` },
  },

  build(props, ctx) {
    const { useSelector, dispatch } = ctx;

    const sectionId = `section-${props.id}`;
    const itemsColId = `items-col-${props.id}`;
    const listGenId = `gen-list-${props.id}`;
    const itemParts = new Map<string, { part: UIPart; unmount: () => void }>();

    // Helper to resize all item textareas based on stored content
    const updateItemHeights = async (list: DulfsItem[]) => {
      const updates = await Promise.all(
        list.map(async (item) => {
          const content = String(
            (await api.v1.storyStorage.get(`dulfs-item-${item.id}`)) || "",
          );
          return {
            id: `content-input-${item.id}`,
            style: inputStyle(contentMinHeight(content)),
          };
        }),
      );
      if (updates.length > 0) {
        api.v1.ui.updateParts(updates);
      }
    };

    // Helper to update section title with lorebook count
    const updateTitleWithCount = async (list: DulfsItem[]) => {
      if (list.length === 0) {
        api.v1.ui.updateParts([{ id: sectionId, title: props.label }]);
        return;
      }
      const { withContent, total } = await countLorebookEntries(list);
      const title = `${props.label} (${withContent}/${total})`;
      api.v1.ui.updateParts([{ id: sectionId, title }]);
    };

    const addItem = async () => {
      const itemId = api.v1.uuid();
      await api.v1.storyStorage.set(`dulfs-item-${itemId}`, "");
      dispatch(
        dulfsItemAdded({
          fieldId: props.id as DulfsFieldID,
          item: {
            id: itemId,
            fieldId: props.id as DulfsFieldID,
          },
        }),
      );
    };

    // Render Category Gen Button
    const { part: genBtnPart } = ctx.render(GenerationButton, {
      id: `gen-btn-${listGenId}`,
      requestId: listGenId,
      label: "Generate Items",
      generateAction: uiGenerationRequested({
        id: listGenId,
        type: "list",
        targetId: props.id,
      }),
    });

    // Section border status tracking
    type SectionStatus = "empty" | "queued" | "generating" | "complete";
    const borderStyleMap: Record<SectionStatus, string> = {
      empty: "borderEmpty",
      queued: "borderQueued",
      generating: "borderGenerating",
      complete: "borderComplete",
    };

    useSelector(
      (state) => ({
        activeRequest: state.runtime.activeRequest,
        queueIds: state.runtime.queue
          .filter((q) => q.status === "queued")
          .map((q) => q.id),
        items: state.story.dulfs[props.id as DulfsFieldID] || [],
      }),
      ({ activeRequest, queueIds, items }) => {
        // Collect all request IDs for this category
        const allRequestIds = [listGenId];
        for (const item of items) {
          allRequestIds.push(`lb-item-${item.id}-content`);
          allRequestIds.push(`lb-item-${item.id}-keys`);
        }

        const activeId =
          activeRequest &&
          activeRequest.status !== "completed" &&
          activeRequest.status !== "cancelled"
            ? activeRequest.id
            : undefined;

        let status: SectionStatus;
        if (allRequestIds.some((id) => id === activeId))
          status = "generating";
        else if (allRequestIds.some((id) => queueIds.includes(id)))
          status = "queued";
        else if (items.length > 0) status = "complete";
        else status = "empty";

        api.v1.ui.updateParts([
          { id: sectionId, style: this.style?.(borderStyleMap[status]) },
        ]);
      },
    );

    // Read initial items
    const initialItems =
      ctx.getState().story.dulfs[props.id as DulfsFieldID] || [];

    // Mount initial items
    for (const item of initialItems) {
      itemParts.set(item.id, ctx.render(ListItem, { config: props, item }));
    }

    // Initialize display state (selectors only fire on future changes)
    api.v1.ui.updateParts([{
      id: sectionId,
      style: this.style?.(borderStyleMap[initialItems.length > 0 ? "complete" : "empty"]),
    }]);
    updateTitleWithCount(initialItems);

    // Sync Items on future changes
    useSelector(
      (state) => state.story.dulfs[props.id as DulfsFieldID] || [],
      async (list) => {
        // Mount new items
        for (const item of list) {
          if (!itemParts.has(item.id)) {
            itemParts.set(
              item.id,
              ctx.render(ListItem, { config: props, item }),
            );
          }
        }

        // Unmount removed items
        for (const [id] of itemParts) {
          if (!list.some((item) => item.id === id)) {
            itemParts.get(id)!.unmount();
            itemParts.delete(id);
          }
        }

        // Update container content
        api.v1.ui.updateParts([
          {
            id: itemsColId,
            content: list.map((item) => itemParts.get(item.id)!.part),
          },
        ]);

        // Resize textareas after re-render replaces the subtree
        await updateItemHeights(list);

        // Update title with lorebook count
        await updateTitleWithCount(list);
      },
    );

    // Refresh count + heights when lorebook content is generated for items in this category
    ctx.useEffect(
      matchesAction(requestCompleted),
      async (_action, { getState }) => {
        const list = getState().story.dulfs[props.id as DulfsFieldID] || [];
        await updateItemHeights(list);
        await updateTitleWithCount(list);
      },
    );

    return collapsibleSection({
      id: sectionId,
      title: props.label,
      iconId: props.icon,
      storageKey: `story:kse-section-${props.id}`,
      content: [
        text({
          text: props.description,
          style: this.style?.("description"),
        }),
        // Items List
        column({
          id: itemsColId,
          style: this.style?.("itemsColumn"),
          content: initialItems.map((item) => itemParts.get(item.id)!.part),
        }),
        // Actions
        row({
          style: this.style?.("actionsRow"),
          content: [
            genBtnPart,
            button({
              text: "Add Item",
              iconId: "plus",
              style: this.style?.("standardButton"),
              callback: addItem,
            }),
          ],
        }),
      ],
    });
  },
});
