import { FieldID } from "../../config/field-definitions";
import { RootState } from "../store/types";

/**
 * Inserts Canon content as an instruct block at the end of the document.
 * @returns true if successful, false if Canon is empty
 */
export async function bootstrapFromCanon(state: RootState): Promise<boolean> {
  const canon = state.story.fields[FieldID.Canon]?.content?.trim();

  if (!canon) {
    return false;
  }

  await api.v1.document.appendParagraph({
    text: canon,
    source: "instruction",
  });

  return true;
}
