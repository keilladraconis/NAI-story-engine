/**
 * NovelAI Scripting API - Experimental
 *
 * Definitions in this file are gated behind the `experimentalScriptingApi`
 * user setting. They are not part of the public scripting API and may change
 * or be removed without notice.
 */

declare namespace api {
  namespace v1 {
    namespace editor {
      /**
       * Block or unblock the editor. While blocked, the user cannot edit the story and other
       * scripts cannot change the document or trigger generations. The blocking script is
       * unaffected and can keep editing and generating.
       * Only one script can block the editor at a time; blocking while another script holds
       * a block throws an error. A script's block is released automatically when it is unloaded.
       * @param blocked Whether the editor should be blocked
       * @param generating Whether the Send button should show the generation animation while blocked. Default false
       * @param onCancel Called when the user presses the cancel button shown with the generation animation. The block is not released automatically; call `editor.block(false)` to release it
       * @example
       * await api.v1.editor.block(true, true, async () => {
       *   // The user asked to cancel, stop working and unblock
       *   await api.v1.editor.block(false);
       * });
       * // ... make document changes, generate, etc. ...
       * await api.v1.editor.block(false);
       */
      function block(
        blocked: boolean,
        generating?: boolean,
        onCancel?: () => void,
      ): Promise<void>;
    }

    namespace document {
      /**
       * Group all document edits made inside the callback into a single undo step.
       * Without this, each edit (append, appendParagraph, updateParagraph, etc.) is its own
       * history step, which can be annoying to undo/redo when making multiple edits in a row.
       * @param callback Performs the document edits. May be async; it is awaited.
       * @example
       * await api.v1.document.transaction(async () => {
       *   await api.v1.generate(messages, params, (choices) => {
       *     api.v1.document.append(choices[0].text);
       *   });
       * });
       */
      function transaction(callback: () => void | Promise<void>): Promise<void>;
    }
  }
}
