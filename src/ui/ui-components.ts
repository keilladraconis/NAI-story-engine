const { row, text, button, multilineTextInput } = api.v1.ui.part;

export const createHeaderWithToggle = (
  description: string,
  isEditMode: boolean,
  onToggle: () => void,
): UIPart => {
  return row({
    style: {
      "justify-content": "space-between",
      "align-items": "center",
      "margin-bottom": "8px",
    },
    content: [
      text({
        text: description,
        style: { "font-style": "italic", opacity: "0.8" },
      }),
      button({
        text: isEditMode ? "Preview" : "Edit",
        iconId: isEditMode ? "eye" : "edit-3",
        callback: onToggle,
      }),
    ],
  });
};

export const createToggleableContent = (
  isEditMode: boolean,
  content: string,
  placeholder: string,
  storageKey: string | undefined, // undefined for wand content (handled by session)
  onChange: (val: string) => void,
  style: any = {},
): UIPart => {
  if (isEditMode) {
    return multilineTextInput({
      id: storageKey ? `input-${storageKey}` : undefined, // Ensure ID if needed, or rely on internal logic
      placeholder: placeholder,
      initialValue: content,
      storageKey: storageKey,
      onChange: onChange,
      style: style,
    });
  } else {
    return text({
      text: content || "_No content._",
      markdown: true,
      style: {
        "white-space": "pre-wrap",
        padding: "8px",
        border: "1px solid rgba(128, 128, 128, 0.2)",
        "border-radius": "4px",
        "min-height": "100px",
        ...style,
      },
    });
  }
};
