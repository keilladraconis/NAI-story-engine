import { Component } from "../../../../lib/nai-act";
import { RootState } from "../../../core/store/types";
import { FieldConfig } from "../../../config/field-definitions";
import { TextField } from "./TextField";
import { ListField } from "./ListField";

export interface FieldProps {
  config: FieldConfig;
}

export const Field: Component<FieldProps, RootState> = {
  id: (props) => `field-wrapper-${props.config.id}`,

  describe(props, state) {
    if (props.config.layout === "list") {
      return ListField.describe(props, state);
    }
    return TextField.describe(props, state);
  },

  bind(tools, props) {
    // Delegate binding to the specific implementation
    if (props.config.layout === "list") {
      // We can't easily delegate 'bind' dynamically if the component structure changes at runtime.
      // But config.layout is static.
      ListField.bind(tools, props);
    } else {
      TextField.bind(tools, props);
    }
  },
};
