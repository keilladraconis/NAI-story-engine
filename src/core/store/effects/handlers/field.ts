import { FieldID } from "../../../../config/field-definitions";
import { fieldUpdated } from "../../index";
import { applyFieldFilters, buildMemoryContent } from "../../../utils/filters";
import {
  GenerationHandlers,
  FieldTarget,
  StreamingContext,
  CompletionContext,
} from "../generation-handlers";
import { STORAGE_KEYS } from "../../../../ui/framework/ids";

export const fieldHandler: GenerationHandlers<FieldTarget> = {
  streaming(ctx: StreamingContext<FieldTarget>, _newText: string): void {
    // Plain text fields (ATTG, Style) stream to input value and storyStorage
    if (
      ctx.target.fieldId === FieldID.ATTG ||
      ctx.target.fieldId === FieldID.Style
    ) {
      const inputId = `input-${ctx.target.fieldId}`;
      const storageKey = STORAGE_KEYS.field(ctx.target.fieldId);
      api.v1.ui.updateParts([{ id: inputId, value: ctx.accumulatedText }]);
      api.v1.storyStorage.set(storageKey, ctx.accumulatedText);
    } else {
      // Standard fields stream to text display
      const uiId = `text-display-${ctx.target.fieldId}`;
      api.v1.ui.updateParts([{ id: uiId, text: ctx.accumulatedText }]);
    }
  },

  async completion(ctx: CompletionContext<FieldTarget>): Promise<void> {
    if (!ctx.accumulatedText) return;

    // Apply configured filters to the generated content
    const filteredText = applyFieldFilters(
      ctx.target.fieldId,
      ctx.accumulatedText,
    );

    // Plain text fields (ATTG, Style) save to storyStorage
    if (
      ctx.target.fieldId === FieldID.ATTG ||
      ctx.target.fieldId === FieldID.Style
    ) {
      const storageKey = STORAGE_KEYS.field(ctx.target.fieldId);
      await api.v1.storyStorage.set(storageKey, filteredText);

      // Update UI with filtered content
      const inputId = `input-${ctx.target.fieldId}`;
      api.v1.ui.updateParts([{ id: inputId, value: filteredText }]);

      // Trigger sync to Memory if enabled
      if (ctx.target.fieldId === FieldID.ATTG) {
        const syncEnabled = await api.v1.storyStorage.get(
          STORAGE_KEYS.SYNC_ATTG_MEMORY,
        );
        if (syncEnabled) {
          await api.v1.memory.set(await buildMemoryContent());
        }
      } else if (ctx.target.fieldId === FieldID.Style) {
        const syncEnabled = await api.v1.storyStorage.get(STORAGE_KEYS.SYNC_STYLE_MEMORY);
        if (syncEnabled) {
          await api.v1.memory.set(await buildMemoryContent());
        }
      }
    } else {
      // Standard fields dispatch to state and update UI with filtered content
      ctx.dispatch(
        fieldUpdated({
          fieldId: ctx.target.fieldId,
          content: filteredText,
        }),
      );
      const uiId = `text-display-${ctx.target.fieldId}`;
      api.v1.ui.updateParts([{ id: uiId, text: filteredText }]);
    }
  },
};
