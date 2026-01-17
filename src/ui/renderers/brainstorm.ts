import { RootState } from "../../core/store/types";
import { Dispatch } from "../../core/store";
import { FieldID } from "../../config/field-definitions";
import {
  fieldUpdated,
  generationCancelled,
  uiInputChanged,
  brainstormRemoveMessage,
  brainstormUpdateMessage,
  brainstormRetry,
  uiEditModeToggled,
  uiBrainstormSubmitUserMessage,
} from "../../core/store/actions";
import { calculateTextAreaHeight } from "../ui-components";

const { row, column, text, button, multilineTextInput } = api.v1.ui.part;
const { sidebarPanel } = api.v1.ui.extension;

export const renderBrainstormSidebar = (
  state: RootState,
  dispatch: Dispatch,
): UIExtensionSidebarPanel => {
  // Brainstorm logic uses FieldID.Brainstorm content/data
  const field = state.story.fields[FieldID.Brainstorm];
  // Safe cast (data could be partial)
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
  const inputId = "brainstorm-input";

  const handleSend = async () => {
    const finalContent = (await api.v1.storyStorage.get(inputId)) || "";
    if (!finalContent.trim()) return;

    dispatch(uiBrainstormSubmitUserMessage({ content: finalContent }));
  };

  const messageParts: UIPart[] = [];

  reversedMessages.forEach((msg, idx) => {
    // Fallback ID if message is old/legacy
    const msgId = msg.id || `legacy-${idx}`;
    const editKey = `brainstorm-message-${msgId}`;
    const isEditing = !!state.ui.editModes[editKey];
    const editValue = state.ui.inputs[editKey] ?? msg.content;

    messageParts.push(
      renderMessageBubble(
        msgId,
        msg.role,
        msg.content,
        isEditing,
        editValue,
        dispatch,
      ),
    );
  });

  const inputArea = column({
    content: [
      multilineTextInput({
        id: inputId,
        placeholder: "Type an idea...",
        storageKey: `story:${inputId}`,
        onSubmit: () => handleSend(),
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
              dispatch(
                fieldUpdated({
                  fieldId: FieldID.Brainstorm,
                  content: "",
                  data: { messages: [] },
                }),
              );
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
            callback: async () => {
              if (isGenerating || isQueued) {
                dispatch(generationCancelled({ requestId: genId }));
              } else {
                await handleSend();
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

const renderMessageBubble = (
  id: string,
  role: string,
  content: string,
  isEditing: boolean,
  editValue: string,
  dispatch: Dispatch,
): UIPart => {
  const isUser = role === "user";
  const bgColor = isUser
    ? "rgba(64, 156, 255, 0.2)"
    : "rgba(255, 255, 255, 0.05)";
  const align = isUser ? "flex-end" : "flex-start";
  const radius = isUser ? "12px 12px 0 12px" : "12px 12px 12px 0";

  const editKey = `brainstorm-message-${id}`;

  // Action Buttons
  const buttons = row({
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
            dispatch(
              brainstormUpdateMessage({ messageId: id, content: editValue }),
            );
            dispatch(uiEditModeToggled({ id: editKey }));
          } else {
            // Initialize input with current content
            dispatch(uiInputChanged({ id: editKey, value: content || "" }));
            dispatch(uiEditModeToggled({ id: editKey }));
          }
        },
      }),
      // Retry (if not editing)
      !isEditing
        ? button({
            iconId: "rotate-cw",
            style: { padding: "4px", height: "24px", width: "24px" },
            callback: () => {
              dispatch(brainstormRetry({ messageId: id }));
              // Logic for retry generation needs to be handled via Intent
              // For now assuming the retry reducer handles state cleanup
              // and we might need to trigger generation?
              // The reducer just slices the array. We need to trigger generation.
              // TODO: This should probably be an Intent Action "ui/brainstormRetryMessage"
            },
          })
        : null,
      // Delete (if not editing)
      !isEditing
        ? button({
            iconId: "trash",
            style: { padding: "4px", height: "24px", width: "24px" },
            callback: () => dispatch(brainstormRemoveMessage({ messageId: id })),
          })
        : null,
    ].filter(Boolean) as UIPart[],
  });

  const messageContent = isEditing
    ? multilineTextInput({
        id: editKey, // Stable ID for focus/state retention
        initialValue: String(editValue || ""),
        onChange: (val) =>
          dispatch(uiInputChanged({ id: editKey, value: val })),
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
          border: "none",
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
