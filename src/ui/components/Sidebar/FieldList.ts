import { Component } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { FIELD_CONFIGS, FieldID } from "../../../config/field-definitions";
import { TextField } from "../Fields/TextField";
import { ListField } from "../Fields/ListField";

const { column } = api.v1.ui.part;

export const FieldList: Component<{}, RootState> = {
  id: () => "kse-field-list",
  events: undefined,

  describe() {
    // Filter fields
    const visibleFields = FIELD_CONFIGS.filter(
      (c) => !c.hidden && c.id !== FieldID.WorldSnapshot,
    );

    return column({
      id: "kse-field-list",
      style: { gap: "8px" },
      content: visibleFields.map((config) => {
        if (config.layout === "list") {
          return ListField.describe(config);
        }
        return TextField.describe(config);
      }),
    });
  },

  onMount(_, ctx) {
    const visibleFields = FIELD_CONFIGS.filter(
      (c) => !c.hidden && c.id !== FieldID.WorldSnapshot,
    );

    visibleFields.forEach((config) => {
      if (config.layout === "list") {
        ctx.mount(ListField, config);
      } else {
        ctx.mount(TextField, config);
      }
    });
  },
};
