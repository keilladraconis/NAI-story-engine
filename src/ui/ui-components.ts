const { row, text, button, multilineTextInput } = api.v1.ui.part;

export const createHeaderWithToggle = (
  description: string,
  isEditMode: boolean,
  onToggle: () => void,
  generateButton?: UIPart,
): UIPart => {
  const buttons: UIPart[] = [
    button({
      text: isEditMode ? "Save" : "Edit",
      iconId: isEditMode ? "save" : "edit-3",
      callback: onToggle,
      style: { padding: "4px 8px" },
    }),
  ];

  if (generateButton) {
    buttons.push(generateButton);
  }

  return row({
    style: {
      "justify-content": "space-between",
      "align-items": "center",
      "margin-bottom": "8px",
      "flex-wrap": "wrap",
      gap: "4px",
    },
    content: [
      text({
        text: description,
        style: { "font-style": "italic", opacity: "0.8", "flex-shrink": "1" },
      }),
      row({
        style: { gap: "4px", "flex-wrap": "wrap" },
        content: buttons,
      }),
    ],
  });
};

export const calculateTextAreaHeight = (content: string): string => {
  const LINE_HEIGHT = 10;
  const CHARS_PER_LINE = 60;
  const PADDING = 24;
  const MIN_HEIGHT = 100;

  if (!content) return `${MIN_HEIGHT}px`;

  const lines = content.split("\n");
  let totalLines = 0;

  for (const line of lines) {
    if (line.length === 0) {
      totalLines += 1;
    } else {
      totalLines += Math.ceil(line.length / CHARS_PER_LINE);
    }
  }

  totalLines = Math.max(1, totalLines);
  const height = Math.max(MIN_HEIGHT, totalLines * LINE_HEIGHT + PADDING);
  return `${height}px`;
};

export const createToggleableContent = (
  isEditMode: boolean,
  content: string,
  placeholder: string,
  inputId: string | undefined, // ID for the input element
  onChange: (val: string) => void,
  style: any = {},
  textId?: string, // Add this
): UIPart => {
  if (isEditMode) {
    const autoHeight = calculateTextAreaHeight(content);
    return multilineTextInput({
      id: inputId,
      placeholder: placeholder,
      initialValue: content,
      onChange: onChange,
      style: {
        height: autoHeight,
        ...style,
      },
    });
  } else {
    // Process content to preserve line breaks in NovelAI's markdown renderer
    // Escape '[' to prevent markdown link reference definitions like '[Author]: ...' from hiding text
    const processedContent = (content || "_No content._")
      .replace(/\n/g, "  \n")
      .replace(/\[/g, "\\[");

    return text({
      id: textId, // Set the ID here
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
