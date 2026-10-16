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

function wordsOfNames(names: string[]): Set<string> {
  return new Set(
    names.flatMap((n) => n.toLowerCase().split(/[^a-z]+/)).filter(Boolean),
  );
}

/** The hidden sentences long enough to match, as their content words. */
function secretsOf(hidden: string[], nameWords: Set<string>): Set<string>[] {
  return hidden
    .flatMap(sentences)
    .map((s) => contentWords(s, nameWords))
    .filter((words) => words.size >= MIN_WORDS);
}

function restatesOne(
  sentence: string,
  secrets: Set<string>[],
  nameWords: Set<string>,
): boolean {
  const said = contentWords(sentence, nameWords);
  return secrets.some((secret) => {
    const shared = [...secret].filter((w) => said.has(w)).length;
    return shared >= MIN_WORDS && shared / secret.size >= MIN_SHARE;
  });
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
  const nameWords = wordsOfNames(names);
  const secrets = secretsOf(hidden, nameWords);
  if (secrets.length === 0) return { kept: shown, cut: "" };

  const kept: string[] = [];
  const cut: string[] = [];
  for (const sentence of sentences(shown)) {
    (restatesOne(sentence, secrets, nameWords) ? cut : kept).push(sentence);
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

/** The first word of `title` that only the hidden text says: in `hidden` and
 *  not in `shown`, names aside. A title is shown like a state, and one word is
 *  enough there: "The Deed and the Flour" over a notice hidden in the flour had
 *  the story model write a sack heavier than it should be. Null when clean. */
export function hiddenWordIn(
  title: string,
  hidden: string[],
  shown: string,
  names: string[],
): string | null {
  const nameWords = wordsOfNames(names);
  const secret = new Set(
    hidden.flatMap((h) => [...contentWords(h, nameWords)]),
  );
  const said = contentWords(shown, nameWords);
  for (const word of contentWords(title, nameWords)) {
    if (secret.has(word) && !said.has(word)) return word;
  }
  return null;
}

/** Whether some sentence of `text` restates a sentence of `hidden`, or null
 *  when no hidden sentence is long enough to tell. */
export function restatesHidden(
  text: string,
  hidden: string,
  names: string[],
): boolean | null {
  const nameWords = wordsOfNames(names);
  const secrets = secretsOf([hidden], nameWords);
  if (secrets.length === 0) return null;
  return sentences(text).some((s) => restatesOne(s, secrets, nameWords));
}
