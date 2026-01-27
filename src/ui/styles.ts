// Factory functions for styled UI parts to ensure style consistency
// and correct merging during updates.

import { mergeStyles } from "../../lib/nai-act";

const {
  button,
  column,
  row,
  text,
  collapsibleSection,
  multilineTextInput,
  textInput,
} = api.v1.ui.part;

// Type helpers
type PartProps<T> = Omit<T, "type">;

// --- Styles Definition ---
export const Styles = {
  iconButton: {
    width: "24px",
    padding: "4px",
  },
  standardButton: {
    padding: "4px 8px",
  },
  fieldHeaderRow: {
    "justify-content": "space-between",
    "align-items": "center",
    "margin-bottom": "8px",
    "flex-wrap": "wrap",
    gap: "4px",
  },
  summaryBox: {
    "margin-bottom": "12px",
    "background-color": "rgba(128, 128, 128, 0.05)",
    padding: "8px",
    "border-radius": "4px",
    gap: "4px",
  },
  textArea: {
    "min-height": "60px",
  },
  textInput: {
    padding: "4px",
  },
  itemColumn: {
    "margin-bottom": "8px",
    border: "1px solid rgba(128, 128, 128, 0.1)",
    "border-radius": "4px",
    padding: "4px",
    gap: "4px",
  },
  contentText: {
    padding: "0 4px",
    opacity: 0.8,
  },
};

// --- Creation Factories ---

export const IconButton = (props: PartProps<UIPartButton>) => {
  return button({
    ...props,
    style: mergeStyles(Styles.iconButton, props.style),
  });
};

export const StandardButton = (props: PartProps<UIPartButton>) => {
  return button({
    ...props,
    style: mergeStyles(Styles.standardButton, props.style),
  });
};

export const FieldHeaderRow = (props: PartProps<UIPartRow>) => {
  return row({
    ...props,
    style: mergeStyles(Styles.fieldHeaderRow, props.style),
  });
};

export const SummaryBox = (props: PartProps<UIPartColumn>) => {
  return column({
    ...props,
    style: mergeStyles(Styles.summaryBox, props.style),
  });
};

export const StyledTextArea = (props: PartProps<UIPartMultilineTextInput>) => {
  return multilineTextInput({
    ...props,
    style: mergeStyles(Styles.textArea, props.style),
  });
};
export const SummaryInput = StyledTextArea;

export const StyledTextInput = (props: PartProps<UIPartTextInput>) => {
  return textInput({
    ...props,
    style: mergeStyles(Styles.textInput, props.style),
  });
};

export const StyledCollapsibleSection = (
  props: PartProps<UIPartCollapsibleSection>,
) => {
  return collapsibleSection(props);
};

export const ItemColumn = (props: PartProps<UIPartColumn>) => {
  return column({
    ...props,
    style: mergeStyles(Styles.itemColumn, props.style),
  });
};

export const ContentText = (props: PartProps<UIPartText>) => {
  return text({
    ...props,
    style: mergeStyles(Styles.contentText, props.style),
  });
};
