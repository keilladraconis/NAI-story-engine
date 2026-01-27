import { Component } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { FIELD_CONFIGS } from "../../../config/field-definitions";
import { Field } from "../Fields/Field";

const { column } = api.v1.ui.part;

export const FieldList: Component<{}, RootState> = {
  id: () => "kse-field-list",

  describe(_, state) {
    const children = FIELD_CONFIGS.filter((c) => !c.hidden).map(
      (config) => Field.describe({ config }, state) as UIPart,
    );

    return column({
      id: "kse-field-list",
      style: { gap: "8px" },
      content: children,
    });
  },

  bind(tools, _props) {
    // Bind each field individually
    FIELD_CONFIGS.filter((c) => !c.hidden).forEach((config) => {
      Field.bind(tools, { config });
    });
  },
};
