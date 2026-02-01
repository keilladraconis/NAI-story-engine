import { createEvents, defineComponent } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { FieldConfig, DulfsFieldID } from "../../../config/field-definitions";
import { dulfsItemAdded } from "../../../core/store/slices/story";
import { uiGenerationRequested } from "../../../core/store/slices/runtime";
import { GenerationButton } from "../GenerationButton";
import { ListItem } from "./ListItem";

export type ListFieldProps = FieldConfig;

const { row, text, column, button, collapsibleSection } = api.v1.ui.part;

type ListFieldEvents = {
  addItem(): void;
};

export const ListField = defineComponent<
  ListFieldProps,
  RootState,
  ReturnType<typeof createEvents<ListFieldProps, ListFieldEvents>>
>({
  id: (props) => `section-${props.id}`,
  events: createEvents<ListFieldProps, ListFieldEvents>(),

  styles: {
    description: {
      "font-style": "italic",
      opacity: 0.8,
      "margin-bottom": "8px",
    },
    itemsColumn: { gap: "4px" },
    actionsRow: { "margin-top": "8px", gap: "8px", "flex-wrap": "wrap" },
    standardButton: { padding: "4px 8px" },
  },

  describe(props) {
    const listGenId = `gen-list-${props.id}`;

    const genButton = GenerationButton.describe({
      id: `gen-btn-${listGenId}`,
      requestId: listGenId,
      label: "Generate Items",
      generateAction: uiGenerationRequested({
        id: listGenId,
        type: "list",
        targetId: props.id,
      }),
    }) as UIPart;

    return collapsibleSection({
      id: `section-${props.id}`,
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
          id: `items-col-${props.id}`,
          style: this.style?.("itemsColumn"),
          content: [], // Populated in onMount
        }),
        // Actions
        row({
          style: this.style?.("actionsRow"),
          content: [
            genButton,
            button({
              text: "Add Item",
              iconId: "plus",
              style: this.style?.("standardButton"),
              callback: () => this.events.addItem(props),
            }),
          ],
        }),
      ],
    });
  },

  onMount(props, ctx) {
    const { useSelector, dispatch } = ctx;

    const itemsColId = `items-col-${props.id}`;
    const boundItems = new Set<string>();

    // Event handlers
    this.events.attach({
      addItem: async (eventProps) => {
        const itemId = api.v1.uuid();
        await api.v1.storyStorage.set(`dulfs-item-${itemId}`, "");
        dispatch(
          dulfsItemAdded({
            fieldId: eventProps.id as DulfsFieldID,
            item: {
              id: itemId,
              fieldId: eventProps.id as DulfsFieldID,
            },
          }),
        );
      },
    });

    // Bind Category Gen Button
    const listGenId = `gen-list-${props.id}`;
    ctx.mount(GenerationButton, {
      id: `gen-btn-${listGenId}`,
      requestId: listGenId,
      label: "Generate Items",
      generateAction: uiGenerationRequested({
        id: listGenId,
        type: "list",
        targetId: props.id,
      }),
    });

    // Sync Items
    useSelector(
      (state) => state.story.dulfs[props.id as DulfsFieldID] || [],
      (list) => {
        // 1. Mount new items
        list.forEach((item) => {
          if (!boundItems.has(item.id)) {
            ctx.mount(ListItem, { config: props, item });
            boundItems.add(item.id);
          }
        });

        // 2. Re-render list structure
        api.v1.ui.updateParts([
          {
            id: itemsColId,
            content: list.map((item) =>
              ListItem.describe({ config: props, item }),
            ),
          },
        ]);
      },
    );
  },
});
