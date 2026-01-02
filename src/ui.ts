import { Chat } from "./chat";

const { part, update, extension } = api.v1.ui;
const { get, set } = api.v1.storyStorage;

const INPUT_ID = "kse-engine-chat-input";
const SIDEBAR_ID = "kse-sidebar";

// Colors
const NAI_YELLOW = "rgb(245, 243, 194)";
const NAI_NAVY = "rgb(19, 21, 44)";

// Basic UI helper wrappers
const column = (...content: UIPart[]) =>
  part.column({ content, style: { width: "100%" } });
const row = (...content: UIPart[]) => part.row({ content });
const box = (...content: UIPart[]) => part.box({ content });
const text = (text: string) => part.text({ text });
const textMarkdown = (text: string) =>
  part.text({
    text,
    markdown: true,
    style: {
      "user-select": "text",
      "-webkit-user-select": "text",
      width: "100%",
    },
  });

const button = (
  text: string = "",
  callback: () => void | undefined,
  iconId: IconId | undefined,
  { disabled }: Partial<UIPartButton> = {},
) => part.button({ text, callback, disabled, iconId });

const toggleButton = (
  text: string = "",
  callback: () => void,
  iconId: IconId | undefined,
  toggled: boolean,
) =>
  part.button({
    text,
    callback,
    iconId,
    style: toggled
      ? {
          "background-color": NAI_YELLOW,
          color: NAI_NAVY,
        }
      : {},
  });

/**
 * createMessageBubble injects double-newlines because it improves how NAI
 * formats markdown. Specifically, if the AI should output `Foo\n----` it would
 * by default produce a `<h1>Foo</h1>` but if we instead do `Foo\n\n----` we get
 * `<p>Foo</p><hr>`.
 */
const createMessageBubble = (message: Message): UIPart =>
  message.role == "user"
    ? box(textMarkdown(message.content?.replaceAll("\n", "\n\n") || ""))
    : textMarkdown(message.content?.replaceAll("\n", "\n\n") || "");

type RadioOption = {
  id: string;
  text: string;
  icon?: IconId;
};

// RadioGroup implements a radio button group.
class RadioGroup {
  onSwitch = (_text: string) => {};
  onAutoCheckbox = (_value: boolean) => {};

  handleSwitch = (current: string, next: string) => {
    if (current == next) return;
    this.onSwitch(next);
  };

  handleAutoCheckbox = (value: boolean) => this.onAutoCheckbox(value);

  render = (selected: string, semiAutomatic: boolean, options: RadioOption[]) =>
    row(
      ...options.map((o) =>
        toggleButton(
          o.text,
          () => this.handleSwitch(selected, o.id),
          o.icon,
          o.id == selected,
        ),
      ),
      part.checkboxInput({
        initialValue: semiAutomatic,
        label: "Auto",
        onChange: this.handleAutoCheckbox,
      }),
    );
}

// I want this button here to do triple duty. 1. sending obviously. While generating it should turn into a red X and trigger cancellation..
// 2. If we hit a wait event, it should turn blue or something and become like, the spinning circle.
// 3. Ok clicked the blue circle. Now it should become a clock and include the seconds remaining until generation continues.
class SendButton {
  isInteractionWaiting = false;

  onSend = () => {};
  onCancel = () => {};

  setInteractionWaiting() {
    this.isInteractionWaiting = true;
  }

  handleContinue = () => {
    this.isInteractionWaiting = false;
  };
  handleSend = () => {
    this.isInteractionWaiting = false;
    this.onSend();
  };
  handleCancel = () => {
    this.isInteractionWaiting = false;
    this.onCancel();
  };

  render = (isGenerating: boolean, waitTime: number) => {
    if (isGenerating) {
      if (this.isInteractionWaiting) {
        return {
          ...button("", this.handleContinue, "fast-forward"),
          ...{ style: { color: NAI_YELLOW } },
        };
      } else if (waitTime > 0) {
        return {
          ...button(waitTime.toString(), () => {}, "time"),
          ...{
            style: { "flex-direction": "column", "justify-content": "center" },
          },
        };
      } else {
        return button("", this.handleCancel, "x");
      }
    } else {
      return button("", this.handleSend, "send");
    }
  };
}

// ChatUI is a set of pure functions.
export class ChatUI {
  // Hooks
  onSendMessage = (_text: string) => {};
  onCancel = () => {};
  onClear = () => {};
  onAgentSelect = (_value: string) => {};
  onAuto = (_value: boolean) => {};

  // Handlers
  handleSendMessage = () =>
    get(INPUT_ID).then((text) =>
      set(INPUT_ID, "").then(() => this.onSendMessage(text)),
    );

  handleBudgetWait = () => this.sendButton.setInteractionWaiting();

  handleCancel = () => this.onCancel();

  handleAgentSelect = (value: string) => this.onAgentSelect(value);

  handleAuto = (value: boolean) => this.onAuto(value);

  // Helpers
  sidebar = extension.sidebarPanel({
    id: SIDEBAR_ID,
    name: "Story Chat",
    content: [],
  }) as UIExtensionSidebarPanel & { id: string };

  // Functions

  // subcomponents
  agentModeSelector = new RadioGroup();
  sendButton = new SendButton();

  constructor() {
    this.sendButton.onSend = this.handleSendMessage;
    this.sendButton.onCancel = this.handleCancel;
    this.agentModeSelector.onAutoCheckbox = this.handleAuto;
    this.agentModeSelector.onSwitch = this.handleAgentSelect;
  }

  render({
    messages,
    isGenerating,
    waitTime,
    agent: { slug: role },
    agents,
    autoMode: autoMode,
  }: Chat) {
    return update([
      {
        ...this.sidebar,
        content: [
          {
            ...column(
              {
                ...column(
                  ...messages
                    .filter((m) => m.role != "system")
                    .map(createMessageBubble)
                    .reverse(),
                ),
                ...{
                  style: {
                    flex: "1 1 auto",
                    "min-height": 0,
                    "overflow-y": "auto",
                    display: "flex",
                    "flex-direction": "column-reverse",
                    "justify-content": "flex-start",
                  },
                },
              },
              {
                ...column(
                  this.agentModeSelector.render(
                    role,
                    autoMode,
                    agents.map((a) => ({
                      id: a.slug,
                      icon: a.icon,
                      text: "", //a.title(),
                    })),
                  ),
                  row(
                    part.multilineTextInput({
                      storageKey: `story:${INPUT_ID}`,
                      placeholder: "Type your story idea or question here...",
                      onSubmit: this.handleSendMessage,
                    }),
                    row(
                      this.sendButton.render(isGenerating, waitTime),
                      button("", this.onClear, "trash"),
                    ),
                  ),
                ),
                ...{
                  style: {
                    flex: "0 0 auto",
                    "padding-bottom": "env(safe-area-inset-bottom)",
                  },
                },
              },
            ),
            ...{
              style: {
                height: "100%",
                "min-height": 0,
                "justify-content": "flex-start",
              },
            }, // Ensure we fill the whole column and get our own scroller
          },
        ],
      },
    ]);
  }
}

export class EngineUI {
  // Constants
  static SIDEBAR_ID = "kse-engine-sidebar";

  // Properties
  synopsisId: string;

  constructor(synopsisId: string) {
    this.synopsisId = synopsisId;
  }

  // Components
  sidebar = extension.sidebarPanel({
    id: EngineUI.SIDEBAR_ID,
    name: "Story Engine",
    content: [
      part.multilineTextInput({
        storageKey: `story:${this!.synopsisId}`,
        placeholder: "Write your story idea or synopsis here...",
      }),
    ],
  }) as UIExtensionSidebarPanel & { id: string };
}
