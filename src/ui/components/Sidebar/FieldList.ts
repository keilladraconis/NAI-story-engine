import { defineComponent, BindContext } from "nai-act";
import { RootState } from "../../../core/store/types";
import { FIELD_CONFIGS } from "../../../config/field-definitions";
import { TextField } from "../Fields/TextField";
import { ListField } from "../Fields/ListField";

const { column } = api.v1.ui.part;

export const FieldList = defineComponent({
  id: () => "kse-field-list",

  build(_props: {}, ctx: BindContext<RootState>) {
    const visibleFields = FIELD_CONFIGS.filter((c) => !c.hidden);

    const children = visibleFields.map((config) => {
      if (config.layout === "list") {
        const { part } = ctx.render(ListField, config);
        return part;
      }
      const { part } = ctx.render(TextField, config);
      return part;
    });

    return column({
      id: "kse-field-list",
      style: { gap: "8px" },
      content: children,
    });
  },
});
