/**
 * MoveModal — batch reassignment for live entities.
 *
 * Stepper: [←] [editable batch name input] [→]
 * Arrows cycle through existing batches; user can also type a new name freely.
 * On confirm: matching batch → moves entity there; no match → creates new batch.
 */

import { RootState, AppDispatch } from "../../core/store/types";
import { batchCreated, entityMoved } from "../../core/store/slices/world";

const { row, text, button, textInput } = api.v1.ui.part;

const MOVE_INPUT_KEY = "se-move-modal-batch";

const STEPPER_BTN = { padding: "4px 10px", "flex-shrink": "0" };
const ACTION_BTN = { padding: "4px 12px" };

export interface MoveModalCtx {
  getState: () => RootState;
  dispatch: AppDispatch;
}

export async function openMoveModal(entityId: string, ctx: MoveModalCtx): Promise<void> {
  const entity = ctx.getState().world.entities.find((e) => e.id === entityId);
  if (!entity) return;

  const batches = ctx.getState().world.batches;
  let cycleIndex = batches.findIndex((b) => b.id === entity.batchId);
  if (cycleIndex === -1) cycleIndex = 0;

  // Seed storyStorage with current batch name so the input shows it on open
  const currentBatchName = batches[cycleIndex]?.name ?? "";
  await api.v1.storyStorage.set(MOVE_INPUT_KEY, currentBatchName);

  const modal = await api.v1.ui.modal.open({
    title: `Move: ${entity.name}`,
    size: "small",
    content: [text({ text: "Loading..." })],
  });

  async function rebuild(): Promise<void> {
    if (modal.isClosed()) return;

    const currentBatches = ctx.getState().world.batches;
    const cycleName = currentBatches[cycleIndex]?.name ?? "";

    const content: UIPart[] = [
      row({
        style: { gap: "6px", "align-items": "center", "margin-bottom": "10px" },
        content: [
          button({
            id: "se-move-modal-prev",
            iconId: "chevron-left",
            style: STEPPER_BTN,
            callback: () => {
              if (currentBatches.length === 0) return;
              cycleIndex = (cycleIndex - 1 + currentBatches.length) % currentBatches.length;
              void (async () => {
                await api.v1.storyStorage.set(MOVE_INPUT_KEY, currentBatches[cycleIndex]?.name ?? "");
                await rebuild();
              })();
            },
          }),
          textInput({
            id: "se-move-modal-input",
            storageKey: `story:${MOVE_INPUT_KEY}`,
            initialValue: cycleName,
            placeholder: "Batch name…",
            style: { flex: "1" },
          }),
          button({
            id: "se-move-modal-next",
            iconId: "chevron-right",
            style: STEPPER_BTN,
            callback: () => {
              if (currentBatches.length === 0) return;
              cycleIndex = (cycleIndex + 1) % currentBatches.length;
              void (async () => {
                await api.v1.storyStorage.set(MOVE_INPUT_KEY, currentBatches[cycleIndex]?.name ?? "");
                await rebuild();
              })();
            },
          }),
        ],
      }),
      row({
        style: { gap: "8px", "justify-content": "flex-end" },
        content: [
          button({
            id: "se-move-modal-move",
            text: "Move",
            style: ACTION_BTN,
            callback: () => {
              void (async () => {
                const targetName = String(
                  (await api.v1.storyStorage.get(MOVE_INPUT_KEY)) ?? "",
                ).trim();
                if (!targetName) return;

                const state = ctx.getState();
                const sourceBatch = state.world.batches.find((b) => b.id === entity!.batchId);
                if (targetName.toLowerCase() === sourceBatch?.name.toLowerCase()) {
                  modal.close();
                  return;
                }

                let targetBatch = state.world.batches.find(
                  (b) => b.name.toLowerCase() === targetName.toLowerCase(),
                );

                if (!targetBatch) {
                  const newBatchId = api.v1.uuid();
                  ctx.dispatch(
                    batchCreated({ batch: { id: newBatchId, name: targetName, entityIds: [] } }),
                  );
                  targetBatch = { id: newBatchId, name: targetName, entityIds: [] };
                }

                ctx.dispatch(entityMoved({ entityId, targetBatchId: targetBatch.id }));
                await api.v1.storyStorage.remove(MOVE_INPUT_KEY);
                modal.close();
              })();
            },
          }),
          button({
            id: "se-move-modal-cancel",
            text: "Cancel",
            style: ACTION_BTN,
            callback: () => {
              void api.v1.storyStorage.remove(MOVE_INPUT_KEY).then(() => modal.close());
            },
          }),
        ],
      }),
    ];

    await modal.update({ content });
  }

  await rebuild();

  modal.closed.then(() => {
    void api.v1.storyStorage.remove(MOVE_INPUT_KEY);
  });
}
