import { RootState } from "../../core/store/types";
import { dispatch } from "../../core/store";
import { FieldID } from "../../config/field-definitions";
import { fieldUpdated, generationRequested, generationCancelled, uiInputChanged } from "../../core/store/actions";
import { calculateTextAreaHeight } from "../ui-components";

const { row, column, text, button, multilineTextInput } = api.v1.ui.part;
const { sidebarPanel } = api.v1.ui.extension;

export const renderBrainstormSidebar = (state: RootState): UIExtensionSidebarPanel => {
    // Brainstorm logic uses FieldID.Brainstorm content/data
    const field = state.story.fields[FieldID.Brainstorm];
    const messages: any[] = field?.data?.messages || []; // Assuming we store messages in data
    
    // Reverse for display (newest at bottom of UI which is top of reversed list?)
    // Actually, UI usually renders top-down. If we want newest at bottom, we render normally but scroll to bottom?
    // Or we use column-reverse and render newest first in list?
    // Original code: `flex-direction: column-reverse`.
    // And `reversedHistory` was `history.reverse()`.
    // So messages[0] is oldest. reversed[0] is newest.
    // If column-reverse: First child is at bottom.
    // So if we want Newest at Bottom, we should have Newest as First Child? No, column-reverse puts last child at top?
    // "column-reverse: The main-start and main-end lines are swapped... The flex items are laid out in reverse order."
    // So child 0 is at bottom. Child N is at top.
    // If we want Newest at Bottom, we want Newest to be Child 0.
    // So we need list to be [Newest, ..., Oldest].
    // So we reverse the chronological list.
    const reversedMessages = [...messages].reverse();

    const genId = "gen-brainstorm";
    const request = state.runtime.queue.find(r => r.id === genId) || state.runtime.activeRequest;
    const isGenerating = !!request;
    const isQueued = state.runtime.queue.some(r => r.id === genId);

    // Input state
    const inputKey = "brainstorm-input";
    const inputValue = state.ui.inputs[inputKey] || "";

    const messageParts: UIPart[] = [];

    // Streaming bubble (Active Generation)
    // If generating, where is the buffer?
    // We dispatched `fieldUpdated` to `FieldID.Brainstorm`.
    // But `fieldUpdated` usually updates `content`. Brainstorm uses `data.messages`.
    // We need a specific handling for Brainstorm streaming.
    // OR, we use `content` as buffer?
    // Let's assume `content` holds the streaming buffer for Brainstorm, and on completion we append to messages.
    if (isGenerating && field?.content) {
        messageParts.push(renderMessageBubble("assistant", field.content, -1, true));
    }

    reversedMessages.forEach((msg, idx) => {
        // Original index is needed for edit/delete
        const originalIndex = messages.length - 1 - idx;
        messageParts.push(renderMessageBubble(msg.role, msg.content, originalIndex));
    });

    const inputArea = column({
        content: [
            multilineTextInput({
                placeholder: "Type an idea...",
                initialValue: inputValue,
                onChange: (val) => dispatch(uiInputChanged(inputKey, val)),
                onSubmit: () => handleSend(inputValue),
                style: { "min-height": "60px", "max-height": "120px" },
                disabled: isGenerating
            }),
            row({
                style: { gap: "8px", "margin-top": "8px" },
                content: [
                    button({
                        text: "Clear",
                        style: { flex: 0.3 },
                        callback: () => {
                             dispatch(fieldUpdated(FieldID.Brainstorm, "", { messages: [] }));
                        }
                    }),
                    button({
                        text: isGenerating ? "Stop" : (isQueued ? "Queued" : "Send"),
                        iconId: isGenerating ? "slash" : (isQueued ? "clock" : "send"),
                        style: { flex: 0.7, "font-weight": "bold", "background-color": isGenerating ? "#ffcccc" : undefined },
                        callback: () => {
                            if (isGenerating || isQueued) {
                                dispatch(generationCancelled(genId));
                            } else {
                                handleSend(inputValue);
                            }
                        }
                    })
                ]
            })
        ],
        style: {
             padding: "8px",
             "border-top": "1px solid rgba(128,128,128, 0.2)",
             "background-color": "rgba(0,0,0,0.2)"
        }
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
                            "justify-content": "flex-start"
                        }
                    }),
                    inputArea
                ]
            })
        ]
    });
};

const handleSend = (text: string) => {
    if (!text.trim()) return;
    
    // 1. Add User Message
    // Need to get current messages first? We can't easily do `state.story...` inside callback without `getState`.
    // But `dispatch` doesn't give access to state.
    // Solution: We need a specialized action `BRAINSTORM_ADD_MESSAGE`.
    // Or we use a Thunk? "No thunks, just simple actions".
    // We can use `fieldUpdated` but we need the old list.
    // This is where `StoryManager` was useful.
    // I should create a specific action `story/brainstormMessageAdded`.
    dispatch({ type: 'story/brainstormMessageAdded', payload: { role: 'user', content: text } });
    
    // 2. Clear Input
    dispatch(uiInputChanged("brainstorm-input", ""));
    
    // 3. Trigger Generation
    dispatch(generationRequested({
        id: "gen-brainstorm",
        type: 'brainstorm', // This type needs to be handled in strategies
        targetId: FieldID.Brainstorm
    }));
};

const renderMessageBubble = (role: string, content: string, index: number, isStreaming = false): UIPart => {
    const isUser = role === "user";
    const bgColor = isUser ? "rgba(64, 156, 255, 0.2)" : "rgba(255, 255, 255, 0.05)";
    const align = isUser ? "flex-end" : "flex-start";
    const radius = isUser ? "12px 12px 0 12px" : "12px 12px 12px 0";

    return row({
        style: { "justify-content": align, width: "100%" },
        content: [
            column({
                style: {
                    "background-color": bgColor,
                    padding: "10px",
                    "border-radius": radius,
                    "max-width": "85%",
                    border: isStreaming ? "1px dashed #666" : "none"
                },
                content: [
                    text({
                        text: isUser ? "You" : "Brainstorm",
                        style: { "font-size": "0.7em", opacity: 0.7, "margin-bottom": "2px" }
                    }),
                    text({
                        text: content, // Markdown needed?
                        markdown: true,
                        style: { "word-break": "break-word" }
                    })
                ]
            })
        ]
    });
};
