// Keeps what a Build reply hides out of what it shows.
//
// The Build prompt tells the model that a hidden thing goes in a Thread's
// private segment and in no summary and no state. Measured, it puts the hidden
// thing in the private segment every time and, in about one run in five, in a
// summary as well. The private segment says what is hidden, so the code can
// hold every shown sentence against it.
//
// The comparison is by content words, not by meaning: a shown sentence is cut
// when it carries most of the words of one hidden sentence. A paraphrase in
// other words gets through, and so this lowers the odds the prompt leaves; it
// is not a proof. It errs toward keeping: a hidden sentence with fewer than
// MIN_WORDS content words is never matched, since two shared words are as often
// the furniture of the scene (a deed, a strongbox) as the secret about it.

const MIN_WORDS = 3;
const MIN_SHARE = 0.6;

const STOP = new Set(
  "about after again also been before being both could does done each even ever from have having here into just more most much must never only other over same should some such than that their them then there these they this those under very were what when where which while will with would your".split(
    " ",
  ),
);

function stem(word: string): string {
  const s = word.replace(/(ing|ed|s)$/, "").replace(/e$/, "");
  return s.length >= 3 ? s : word;
}

/** The words of `text` that say something: four letters or more, not a stop
 *  word and not part of a name, reduced to a rough stem. */
function contentWords(text: string, names: Set<string>): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w) && !names.has(w));
  return new Set(words.map(stem));
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** `shown` with every sentence that restates a hidden sentence taken out.
 *  `names` are the names of the World's elements: a sentence is not the same
 *  claim as another for being about the same people. */
export function withoutHidden(
  shown: string,
  hidden: string[],
  names: string[],
): { kept: string; cut: string } {
  const nameWords = new Set(
    names.flatMap((n) => n.toLowerCase().split(/[^a-z]+/)).filter(Boolean),
  );
  const secrets = hidden
    .flatMap(sentences)
    .map((s) => contentWords(s, nameWords))
    .filter((words) => words.size >= MIN_WORDS);
  if (secrets.length === 0) return { kept: shown, cut: "" };

  const kept: string[] = [];
  const cut: string[] = [];
  for (const sentence of sentences(shown)) {
    const said = contentWords(sentence, nameWords);
    const restates = secrets.some((secret) => {
      const shared = [...secret].filter((w) => said.has(w)).length;
      return shared >= MIN_WORDS && shared / secret.size >= MIN_SHARE;
    });
    (restates ? cut : kept).push(sentence);
  }
  return cut.length === 0
    ? { kept: shown, cut: "" }
    : { kept: kept.join(" "), cut: cut.join(" ") };
}

/** `held` kept whole, with each sentence of `offered` that does not restate
 *  one of its sentences added after it. For a record that may only grow. */
export function addingOnlyNew(
  held: string,
  offered: string,
  names: string[],
): string {
  const { kept } = withoutHidden(offered, [held], names);
  return [held.trim(), kept.trim()].filter(Boolean).join(" ");
}
