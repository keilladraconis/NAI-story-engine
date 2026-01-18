import { RootState } from "../../core/store/types";
import { Dispatch, Store } from "../../core/store"; // Import Store
import { FieldID } from "../../config/field-definitions";
import {
  fieldUpdated,
  brainstormRemoveMessage,
  uiBrainstormRetry,
  uiBrainstormEditMessage,
  uiBrainstormSaveMessageEdit,
  uiBrainstormSubmitRequest,
  uiRequestCancellation,
} from "../../core/store/actions";
import { calculateTextAreaHeight } from "../ui-components";
import { createGenerationButton, mountGenerationButton } from "../components/generation-button"; // Import mount

const { row, column, text, button, multilineTextInput } = api.v1.ui.part;
const { sidebarPanel } = api.v1.ui.extension;

export const setupBrainstormButton = (store: Store<RootState>) => {
  return mountGenerationButton(store, "brainstorm-send-btn", {
    label: "Send",
    onClick: () => store.dispatch(uiBrainstormSubmitRequest()),
    onCancel: () => store.dispatch(uiRequestCancellation()), // Dispatch intent
    onContinue: () => store.dispatch(uiBrainstormSubmitRequest()),
  });
};

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
  // const isQueued = state.runtime.queue.some((r) => r.id === genId);

  // Input state
  const inputId = "brainstorm-input";

  const handleSend = () => {
    dispatch(uiBrainstormSubmitRequest());
  };

  const messageParts: UIPart[] = [];

  reversedMessages.forEach((msg, idx) => {
    // Fallback ID if message is old/legacy
    const msgId = msg.id || `legacy-${idx}`;
    const isEditing = state.ui.brainstormEditingMessageId === msgId;

    messageParts.push(
      renderMessageBubble(msgId, msg.role, msg.content, isEditing, dispatch),
    );
  });

  const sendButton = createGenerationButton(
    "brainstorm-send-btn",
    state.runtime.genx,
    {
      label: "Send",
      onClick: handleSend,
      onCancel: () => dispatch(uiRequestCancellation()),
      onContinue: () => {
        // Trigger manual continue hook if needed, but GenX listens to onGenerationRequested
        handleSend();
      },
    },
  );

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
          // Wrap in a container to apply flex style if needed, or pass style to button
          // createGenerationButton returns a button, but we might want to override style?
          // The current impl has hardcoded styles. We might want to pass style props later.
          // For now, let's just use it.
          // Wait, createGenerationButton applies its own style.
          // The previous button had `flex: 0.7`.
          // We can wrap it in a column/row if we want specific layout or assume the component handles it.
          // But UIPart doesn't support "className".
          // I should add `style` to `GenerationButtonProps` or merged it.
          // For now, I'll hack it by modifying the returned part if possible, or better, update the component.
          // Let's just update the component to accept style overrides?
          // I'll leave it as is for now, it has some padding. It won't flex 0.7 though.
          sendButton,
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
  dispatch: Dispatch,
): UIPart => {
  const isUser = role === "user";
  const bgColor = isUser
    ? "rgba(64, 156, 255, 0.2)"
    : "rgba(255, 255, 255, 0.05)";
  const align = isUser ? "flex-end" : "flex-start";
  const radius = isUser ? "12px 12px 0 12px" : "12px 12px 12px 0";

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
            dispatch(uiBrainstormSaveMessageEdit({ messageId: id }));
          } else {
            // Initiate edit mode -> will trigger effect to set storage and dispatch ui started
            dispatch(uiBrainstormEditMessage({ messageId: id, content }));
          }
        },
      }),
      // Retry (if not editing)
      !isEditing
        ? button({
            iconId: "rotate-cw",
            style: { padding: "4px", height: "24px", width: "24px" },
            callback: () => {
              dispatch(uiBrainstormRetry({ messageId: id }));
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
        id: `brainstorm-edit-${id}`,
        // Bind to storage key as requested.
        // NOTE: The effect 'brainstormEditMessage' populates this key initially.
        storageKey: `story:brainstorm-edit-${id}`,
        // We do NOT use onChange here as per requirements.
        style: {
          "min-height": "40px",
          width: "100%",
          // Calculate height based on initial content (best effort, as we don't track live value here)
          height: calculateTextAreaHeight(content),
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