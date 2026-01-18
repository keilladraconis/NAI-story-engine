import { Store } from "../../../core/store";
import { RootState, BrainstormMessage } from "../../../core/store/types";
import { FieldID } from "../../../config/field-definitions";
import { mount, unmount } from "../../../../lib/nai-act";
import { List } from "../../components/Brainstorm/List";
import { Input } from "../../components/Brainstorm/Input";
import { Message } from "../../components/Brainstorm/Message";
import { BrainstormActions } from "../../components/Brainstorm/types";
import { IDS } from "../../framework/ids";

import {
  uiBrainstormSubmitUserMessage,
  fieldUpdated,
  uiRequestCancellation,
  uiBrainstormEditMessage,
  uiBrainstormSaveMessageEdit,
  uiBrainstormRetry,
  brainstormRemoveMessage,
} from "../../../core/store/actions";

const { column } = api.v1.ui.part;
const { sidebarPanel } = api.v1.ui.extension;

export class BrainstormManager {
  private store: Store<RootState>;
  private actions: BrainstormActions;
  private mountedMessageIds: Set<string> = new Set();
  private isMounted = false;
  private unsubscribeMessages: (() => void) | null = null;

  constructor(store: Store<RootState>) {
    this.store = store;
    this.actions = this.createActions();
  }

  // --- Initialization ---

  public register(): UIExtensionSidebarPanel {
    // Initial Render
    const state = this.store.getState();
    return this.renderPanel(state);
  }

  public mount() {
    if (this.isMounted) return;
    this.isMounted = true;

    // 1. Mount Static Components
    this.mountInput();

    // 2. Mount Dynamic Components (Messages)
    const state = this.store.getState();
    this.mountMessages(this.getMessages(state));

    // 3. Subscribe to Message List (Structure)
    this.unsubscribeMessages = this.store.subscribeSelector(
      (state) => this.getMessages(state),
      (messages) => {
        // Full Refresh on Structural Change
        this.refresh(messages);
      },
    );
  }

  public unmount() {
    if (!this.isMounted) return;
    this.isMounted = false;

    if (this.unsubscribeMessages) {
      this.unsubscribeMessages();
      this.unsubscribeMessages = null;
    }

    this.unmountMessages();
    this.unmountInput();
  }

  // --- Logic ---

  private refresh(messages: BrainstormMessage[]) {
    // 1. Unmount everything
    this.unmountMessages();
    this.unmountInput();

    // 2. Re-render Structure
    const state = this.store.getState();
    const panel = this.renderPanel(state);

    // 3. Apply Update (Destructive)
    // Ensure panel has ID for update
    if (panel.id) {
      api.v1.ui.update([panel as UIExtension & { id: string }]);
    }

    // 4. Mount everything
    this.mountInput();
    this.mountMessages(messages);
  }

  private renderPanel(state: RootState): UIExtensionSidebarPanel {
    const messages = this.getMessages(state);

    const listPart = List.describe({
      initialMessages: messages,
      actions: this.actions,
    });

    const inputPart = Input.describe({
      actions: this.actions,
    });

    return sidebarPanel({
      id: "kse-brainstorm-sidebar",
      name: "Brainstorm",
      iconId: "cloud-lightning",
      content: [
        column({
          id: IDS.BRAINSTORM.ROOT,
          style: { height: "100%", "justify-content": "space-between" },
          content: [listPart, inputPart],
        }),
      ],
    });
  }

  // --- Component Lifecycle Helpers ---

  private mountInput() {
    try {
      mount(Input, { actions: this.actions }, this.store);
    } catch (e) {
      // Ignore if already mounted
    }
  }

  private unmountInput() {
    unmount(Input, { actions: this.actions });
  }

  private mountMessages(messages: BrainstormMessage[]) {
    messages.forEach((msg) => {
      try {
        mount(Message, { message: msg, actions: this.actions }, this.store);
        this.mountedMessageIds.add(msg.id);
      } catch (e) {
        // Ignore errors
      }
    });
  }

  private unmountMessages() {
    this.mountedMessageIds.forEach((id) => {
      // Reconstruct props for unmount ID generation
      unmount(Message, {
        message: { id, role: "user", content: "" },
        actions: this.actions,
      });
    });
    this.mountedMessageIds.clear();
  }

  // --- State Helpers ---

  private getMessages(state: RootState): BrainstormMessage[] {
    const field = state.story.fields[FieldID.Brainstorm];
    return (field?.data?.messages || []) as BrainstormMessage[];
  }

  private createActions(): BrainstormActions {
    const dispatch = this.store.dispatch;
    return {
      onSubmit: () => dispatch(uiBrainstormSubmitUserMessage()),
      onClear: () =>
        dispatch(
          fieldUpdated({
            fieldId: FieldID.Brainstorm,
            content: "",
            data: { messages: [] },
          }),
        ),
      onEdit: (msgId) =>
        dispatch(uiBrainstormEditMessage({ messageId: msgId })),
      onSave: (msgId) =>
        dispatch(uiBrainstormSaveMessageEdit({ messageId: msgId })),
      onRetry: (msgId) => dispatch(uiBrainstormRetry({ messageId: msgId })),
      onDelete: (msgId) =>
        dispatch(brainstormRemoveMessage({ messageId: msgId })),
      onCancelRequest: () => dispatch(uiRequestCancellation()),
    };
  }
}
