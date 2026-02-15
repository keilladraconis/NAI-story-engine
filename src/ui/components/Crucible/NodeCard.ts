import { defineComponent } from "nai-act";
import { RootState } from "../../../core/store/types";

const { text, column } = api.v1.ui.part;

/**
 * NodeCard — PLACEHOLDER (v4 rewrite pending).
 * Replaced by GoalCard/BeatCard/ElementCard in v4 UI pass.
 */
export const NodeCard = defineComponent<Record<string, never>, RootState>({
  id: () => "cr-node-placeholder",

  build() {
    return column({
      content: [text({ text: "NodeCard placeholder — v4 UI rewrite pending" })],
    });
  },
});
