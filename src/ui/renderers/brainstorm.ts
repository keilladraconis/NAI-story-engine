import { RootState } from "../../core/store/types";
import { dispatch } from "../../core/store";
import { FieldID } from "../../config/field-definitions";
import {
  fieldUpdated,
  generationRequested,
  generationCancelled,
  uiInputChanged,
  brainstormMessageDeleted,
  brainstormMessageEdited,
  brainstormRetry,
  uiEditModeToggled,
} from "../../core/store/actions";
import { calculateTextAreaHeight } from "../ui-components";

const { row, column, text, button, multilineTextInput } = api.v1.ui.part;
const { sidebarPanel } = api.v1.ui.extension;

export const renderBrainstormSidebar = (
  state: RootState,
): UIExtensionSidebarPanel => {
  // Brainstorm logic uses FieldID.Brainstorm content/data
  const field = state.story.fields[FieldID.Brainstorm];
  const messages: any[] = field?.data?.messages || [];

  // We reverse the chronological list for display with column-reverse
  const reversedMessages = [...messages].reverse();

  const genId = "gen-brainstorm";
  const request =
    state.runtime.queue.find((r) => r.id === genId) ||
    state.runtime.activeRequest;
  const isGenerating = !!request;
  const isQueued = state.runtime.queue.some((r) => r.id === genId);

  // Input state
  const inputKey = "brainstorm-input";
  const inputValue = state.ui.inputs[inputKey] || "";

  const messageParts: UIPart[] = [];

  // Streaming bubble (Active Generation)
  if (isGenerating && field?.content) {
    messageParts.push(
      renderMessageBubble("assistant", field.content, -1, false, ""),
    );
  }

  reversedMessages.forEach((msg, idx) => {
    const originalIndex = messages.length - 1 - idx;
    const editKey = `brainstorm-message-${originalIndex}`;
    const isEditing = !!state.ui.editModes[editKey];
    const editValue = state.ui.inputs[editKey] ?? msg.content;

    messageParts.push(
      renderMessageBubble(
        msg.role,
        msg.content,
        originalIndex,
        isEditing,
        editValue,
      ),
    );
  });

  const inputArea = column({
    content: [
      multilineTextInput({
        placeholder: "Type an idea...",
        initialValue: inputValue,
        onChange: (val) => dispatch(uiInputChanged(inputKey, val)),
        onSubmit: () => handleSend(inputValue),
        style: { "min-height": "60px", "max-height": "120px" },
        disabled: isGenerating,
      }),
      row({
        style: { gap: "8px", "margin-top": "8px" },
        content: [
          button({
            text: "Clear",
            style: { flex: 0.3 },
            callback: () => {
              dispatch(fieldUpdated(FieldID.Brainstorm, "", { messages: [] }));
            },
          }),
          button({
            text: isGenerating ? "Stop" : isQueued ? "Queued" : "Send",
            iconId: isGenerating ? "slash" : isQueued ? "clock" : "send",
            style: {
              flex: 0.7,
              "font-weight": "bold",
              "background-color": isGenerating ? "#ffcccc" : undefined,
            },
            callback: () => {
              if (isGenerating || isQueued) {
                dispatch(generationCancelled(genId));
              } else {
                handleSend(inputValue);
              }
            },
          }),
        ],
      }),
    ],
    style: {
      padding: "8px",
      "border-top": "1px solid rgba(128,128,128, 0.2)",
      "background-color": "rgba(0,0,0,0.2)",
    },
  });

  return sidebarPanel({
    id: "kse-brainstorm-sidebar",
    name: "Brainstorm",
    iconId: "cloud-lightning",
    content: [
      column({
        style: { height: "100%", "justify-content": "space-between" },
        content: [
          column({
            content: messageParts,
            style: {
              flex: 1,
              overflow: "auto",
              gap: "10px",
              padding: "8px",
              "padding-bottom": "20px",
              "flex-direction": "column-reverse",
              "justify-content": "flex-start",
            },
          }),
          inputArea,
        ],
      }),
    ],
  });
};

const handleSend = (text: string) => {
  if (!text.trim()) return;

  dispatch({
    type: "story/brainstormMessageAdded",
    payload: { role: "user", content: text },
  });
  dispatch(uiInputChanged("brainstorm-input", ""));
  dispatch(
    generationRequested({
      id: "gen-brainstorm",
      type: "brainstorm",
      targetId: FieldID.Brainstorm,
    }),
  );
};

const renderMessageBubble = (
  role: string,
  content: string,
  index: number,
  isEditing: boolean,
  editValue: string,
): UIPart => {
  const isUser = role === "user";
  const isStreaming = index === -1;
  const bgColor = isUser
    ? "rgba(64, 156, 255, 0.2)"
    : "rgba(255, 255, 255, 0.05)";
  const align = isUser ? "flex-end" : "flex-start";
  const radius = isUser ? "12px 12px 0 12px" : "12px 12px 12px 0";

  const editKey = `brainstorm-message-${index}`;

  // Action Buttons
  const buttons = !isStreaming
    ? row({
        style: {
          "margin-top": "5px",
          gap: "5px",
          "justify-content": "flex-end",
          opacity: 0.6,
        },
        content: [
          // Edit / Save
          button({
            iconId: isEditing ? "save" : "edit-3",
            style: { padding: "4px", height: "24px", width: "24px" },
            callback: () => {
              if (isEditing) {
                dispatch(brainstormMessageEdited(index, editValue));
                dispatch(uiEditModeToggled(editKey));
              } else {
                // Initialize input with current content
                dispatch(uiInputChanged(editKey, content || ""));
                dispatch(uiEditModeToggled(editKey));
              }
            },
          }),
          // Retry (if not editing)
          !isEditing
            ? button({
                iconId: "rotate-cw",
                style: { padding: "4px", height: "24px", width: "24px" },
                callback: () => {
                  dispatch(brainstormRetry(index));
                  dispatch(
                    generationRequested({
                      id: "gen-brainstorm",
                      type: "brainstorm",
                      targetId: FieldID.Brainstorm,
                    }),
                  );
                },
              })
            : null,
          // Delete (if not editing)
          !isEditing
            ? button({
                iconId: "trash",
                style: { padding: "4px", height: "24px", width: "24px" },
                callback: () => dispatch(brainstormMessageDeleted(index)),
              })
            : null,
        ].filter(Boolean) as UIPart[],
      })
    : null;

  const messageContent = isEditing
    ? multilineTextInput({
        id: editKey, // Stable ID for focus/state retention
        initialValue: String(editValue || ""),
        onChange: (val) => dispatch(uiInputChanged(editKey, val)),
        style: {
          "min-height": "40px",
          width: "100%",
          height: calculateTextAreaHeight(String(editValue || "")),
        },
      })
    : text({
        text: content,
        markdown: true,
        style: { "word-break": "break-word", "user-select": "text" },
      });

  return row({
    style: { "justify-content": align, width: "100%" },
    content: [
      column({
        style: {
          "background-color": bgColor,
          padding: "10px",
          "border-radius": radius,
          width: "85%",
          border: isStreaming ? "1px dashed #666" : "none",
        },
        content: [
          text({
            text: isUser ? "You" : "Brainstorm",
            style: {
              "font-size": "0.7em",
              opacity: 0.7,
              "margin-bottom": "2px",
            },
          }),
          messageContent,
          buttons,
        ].filter(Boolean) as UIPart[],
      }),
    ],
  });
};
