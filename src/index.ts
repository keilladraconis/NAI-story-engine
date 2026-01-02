// Scenario Engine

import { Chat } from "./chat";
import { ChatUI, EngineUI } from "./ui";

// Helpers
const log = api.v1.log;
const SYNOPSIS_ID = "kse-synopsis";

(async () => {
  try {
    const ui = new ChatUI();
    const engineUI = new EngineUI(SYNOPSIS_ID);
    const chat = new Chat(SYNOPSIS_ID);
    await chat.load();

    // Wiring the UI to the Chat state
    ui.onSendMessage = chat.handleSendMessage;
    ui.onClear = chat.handleClear;
    ui.onCancel = chat.handleCancel;
    ui.onAgentSelect = chat.handleAgentSwitch;
    ui.onAuto = chat.handleAuto;
    chat.onUpdate = ui.render.bind(ui);
    chat.onBudgetWait = async () => ui.handleBudgetWait();

    api.v1.ui.register([ui.sidebar, engineUI.sidebar]);

    ui.render(chat);
  } catch (e) {
    log("Startup error:", e);
  }
})();
