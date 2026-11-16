import { describe, it, expect } from "vitest";
import {
  spiral,
  spiralScores,
  SPIRAL_PARAGRAPH,
} from "../../src/core/workshop/spiral";

// The shape of a run that went round in circles (a test draft, paraphrased).
const SPIRAL =
  "She swallowed the berry and waited for the next. Life was good. Life was very, very good. " +
  "He was so good to her. So very, very good. She would reward him later. He would like that. " +
  "Of course he would. She was perfect. This was perfect. The most perfect moment of all. " +
  "She was a queen. She was his world. She was a happy, happy queen. Truly. Yes. " +
  "She let her eyes close. She was perfect. And she knew it. And so did he. Perfect. ";

// Scene prose that runs long: description in whole, varied sentences.
const HEALTHY =
  "The kitchen smelled of rain-damp paper bags and the sharp green of cut stems, and Nick moved between " +
  "the counter and the fridge with the unhurried care of a man who had done this a hundred times. " +
  "A carton of cream went onto the top shelf, beside the jar of honey he kept for her smoothies. " +
  "Outside, a Pidgey argued with the gutter, its complaints rising over the low hum of the refrigerator. " +
  "Cecile watched from the sofa, chin resting on the armrest, following each item as it left the bag. " +
  "Flour, two loaves, a net of oranges that rolled when he set them down, then a paper sack she knew by its weight. " +
  "Her tail twitched once against the cushions before she could stop it, a small betrayal she hoped he missed. " +
  "He did not look up; he was frowning at a receipt, lips moving as he added something under his breath. " +
  "Rain ticked against the window above the sink, and somewhere down the street a delivery van reversed, beeping. " +
  "The radio on the windowsill murmured a weather report nobody was listening to, promising more of the same until Thursday. " +
  "When he finally folded the empty bags and tucked them under the sink, the room went quiet enough to hear the clock. " +
  "Only then did he glance toward the sofa, eyebrows raised, as though he had just remembered she was there. " +
  "Cecile lifted her head with exaggerated slowness, letting the lamplight catch the green along her throat. " +
  "Whatever he meant to say about the berries, she intended to hear it from the most flattering possible angle. " +
  "Across the room the kettle began to tick as it cooled, and the smell of oranges drifted over from the counter. " +
  "Nick cleared his throat, set the paper sack down between them, and waited to see whether she would ask. ";

describe("spiral", () => {
  it("leaves a paragraph shorter than a spiral alone", () => {
    expect(spiral(SPIRAL.slice(0, SPIRAL_PARAGRAPH - 1))).toBeNull();
  });

  it("catches a beat restated in ever shorter sentences", () => {
    const draft = "An opening paragraph.\n" + SPIRAL.repeat(5);
    expect(spiral(draft)?.spiralling).toBe(true);
  });

  it("lets long description through", () => {
    const draft = "An opening paragraph.\n" + HEALTHY;
    const scores = spiralScores(HEALTHY.slice(-1000));
    expect(scores.sentenceLength).toBeGreaterThan(35);
    expect(scores.repeatedStarts).toBeLessThanOrEqual(0.15);
    expect(scores.recycledWords).toBeLessThanOrEqual(0.1);
    expect(spiral(draft)?.spiralling).toBe(false);
  });
});
