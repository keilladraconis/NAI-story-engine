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
  inputId: string | undefined, // ID for the input element
  onChange: (val: string) => void,
  style: any = {},
): UIPart => {
  if (isEditMode) {
    return multilineTextInput({
      id: inputId,
      placeholder: placeholder,
      initialValue: content,
      onChange: onChange,
      style: style,
    });
  } else {
    // Process content to preserve line breaks in NovelAI's markdown renderer
    // Escape '[' to prevent markdown link reference definitions like '[Author]: ...' from hiding text
    const processedContent = (content || "_No content._")
        .replace(/\n/g, "  \n")
        .replace(/\[/g, "\\[");

    return text({
      text: processedContent,
      markdown: true,
      style: {
        padding: "8px",
        border: "1px solid rgba(128, 128, 128, 0.2)",
        "border-radius": "4px",
        "min-height": "100px",
        "user-select": "text",
        ...style,
      },
    });
  }
};

export interface GenerateButtonState {
  isRunning: boolean;
  budgetState?: "waiting_for_user" | "waiting_for_timer" | "normal";
}

export const createResponsiveGenerateButton = (
  id: string,
  state: GenerateButtonState,
  actions: {
    onStart: () => void;
    onCancel: () => void;
    onContinue?: () => void; // For budget warning
  },
  label: string = "Generate",
): UIPart => {
  if (state.budgetState === "waiting_for_user") {
    return button({
      id: `${id}-continue`,
      text: "⚠️ Continue",
      style: {
        "background-color": "#fff3cd",
        color: "#856404",
        "font-weight": "bold",
      },
      callback: () => {
        if (actions.onContinue) actions.onContinue();
      },
    });
  }

  if (state.budgetState === "waiting_for_timer") {
    return button({
      id: `${id}-wait`,
      text: "⏳ Refilling...",
      style: {
        "background-color": "#e2e3e5",
        color: "#383d41",
      },
      callback: () => {
        // Allow canceling the wait
        actions.onCancel();
      },
    });
  }

  if (state.isRunning) {
    return button({
      id: `${id}-cancel`,
      text: "🚫 Cancel",
      style: {
        "font-weight": "bold",
        "background-color": "#ffcccc",
        color: "red",
      },
      callback: () => actions.onCancel(),
    });
  }

  return button({
    id: `${id}-ignite`,
    text: `⚡ ${label}`,
    style: { "font-weight": "bold" },
    callback: () => actions.onStart(),
  });
};
