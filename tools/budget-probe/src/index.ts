// SE Budget Probe — answers two empirical questions for the v15 Engine design
// (docs/superpowers/specs/2026-08-12-engine-agentic-loop-design.md, §12 item 3):
//
//   1. Is the script's output-token budget debited by what a generation
//      RETURNS, or by what it REQUESTS (max_tokens)?
//   2. What does a generation refused for concurrency cost?
//
// It matters because the Engine's collision handling (§3.4) is optimistic —
// fire, and recover from a refusal. That is only sound if a refusal is cheap.
// If a refused request is charged its full max_tokens, then backoff-retry burns
// the bucket for nothing and the design needs a different strategy.
//
// This is a throwaway diagnostic. It is not Story Engine, shares no code with
// it, and deliberately uses `updateParts` (which Story Engine itself forbids)
// because a probe has no reason to carry a Preact runtime.
//
// Build:  npx nibs build tools/budget-probe
// Run:    load the built .naiscript into a scratch story, open the sidebar
//         panel, press the buttons top to bottom, read the log.

const MODEL = "glm-4-6";

/** Deliberately far larger than the reply this prompt can produce. The gap
 *  between max_tokens and tokens actually returned is the whole measurement. */
const MAX_TOKENS = 512;

/** Short, cheap, and bounded — expected to return well under 40 tokens. */
const PROMPT: Message[] = [
  { role: "user", content: "Count from one to ten in words, comma separated." },
];

const LOG_PART_ID = "probe-log";

const log: string[] = [];

function render(): void {
  void api.v1.ui.updateParts([
    { id: LOG_PART_ID, text: log.length ? log.join("\n") : "(no samples yet)" },
  ]);
}

function say(line: string): void {
  log.push(line);
  api.v1.log(line);
  render();
}

/** QuickJS errors do not serialise usefully by default. Pull whatever is
 *  there — the shape of a concurrency refusal is itself a finding (§12.3). */
function describeError(e: unknown): string {
  const parts: string[] = [String(e)];
  if (e && typeof e === "object") {
    for (const key of Object.getOwnPropertyNames(e)) {
      if (key === "stack") continue;
      const value = (e as Record<string, unknown>)[key];
      parts.push(`${key}=${String(value)}`);
    }
  }
  return parts.join(" | ");
}

/** Exact count of tokens delivered — no tokenizer needed. */
function tokensReturned(res: GenerationResponse): number {
  return res.choices.reduce((n, c) => n + (c.token_ids?.length ?? 0), 0);
}

function sample(label: string): number {
  const n = api.v1.script.getAllowedOutput();
  say(`[${label}] allowedOutput=${n} at t=${Date.now()}`);
  return n;
}

// ── Test A ──────────────────────────────────────────────────────────────────
// One successful generation, max_tokens deliberately >> the reply.
//   delta ≈ tokens returned  → debited on DELIVERY
//   delta ≈ MAX_TOKENS       → debited on REQUEST
async function testDeliveryVsRequest(): Promise<void> {
  say("\n=== Test A: single successful generation ===");
  const before = api.v1.script.getAllowedOutput();
  const t0 = Date.now();

  try {
    const res = await api.v1.generate(PROMPT, {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.7,
    });
    const after = api.v1.script.getAllowedOutput();
    const returned = tokensReturned(res);
    const delta = before - after;

    say(`requested=${MAX_TOKENS} returned=${returned}`);
    say(
      `before=${before} after=${after} delta=${delta} in ${Date.now() - t0}ms`,
    );
    say(
      delta > MAX_TOKENS * 0.8
        ? ">>> debited on REQUEST (delta tracks max_tokens)"
        : ">>> debited on DELIVERY (delta tracks tokens returned)",
    );
    say(`(text: ${JSON.stringify(res.choices[0]?.text ?? "")})`);
  } catch (e) {
    say(`FAILED unexpectedly: ${describeError(e)}`);
  }
}

// ── Test B ──────────────────────────────────────────────────────────────────
// Two generations fired without awaiting the first. One should be refused for
// concurrency.
//   delta ≈ returned by winner                → refusal is FREE
//   delta ≈ returned by winner + MAX_TOKENS   → refusal is CHARGED its request
async function testConcurrencyRefusalCost(): Promise<void> {
  say("\n=== Test B: two concurrent generations ===");
  const before = api.v1.script.getAllowedOutput();
  const t0 = Date.now();

  const params = { model: MODEL, max_tokens: MAX_TOKENS, temperature: 0.7 };
  const first = api.v1.generate(PROMPT, params);
  const second = api.v1.generate(PROMPT, params);

  const results = await Promise.allSettled([first, second]);
  const after = api.v1.script.getAllowedOutput();
  const delta = before - after;

  let returned = 0;
  let refused = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      const n = tokensReturned(r.value);
      returned += n;
      say(`request ${i + 1}: OK, returned=${n}`);
    } else {
      refused += 1;
      say(`request ${i + 1}: REFUSED — ${describeError(r.reason)}`);
    }
  });

  say(`before=${before} after=${after} delta=${delta} in ${Date.now() - t0}ms`);
  say(`total returned=${returned} refused=${refused}`);

  if (refused === 0) {
    say(">>> INCONCLUSIVE — both succeeded, no concurrency block hit");
  } else {
    const chargedEstimate = returned + refused * MAX_TOKENS;
    say(
      `free would be ~${returned}; charged would be ~${chargedEstimate}; actual ${delta}`,
    );
    say(
      Math.abs(delta - returned) < Math.abs(delta - chargedEstimate)
        ? ">>> refusal is FREE"
        : ">>> refusal is CHARGED its requested max_tokens",
    );
  }
}

// ── Panel ───────────────────────────────────────────────────────────────────

void api.v1.ui.register([
  api.v1.ui.extension.sidebarPanel({
    name: "Budget Probe",
    content: [
      api.v1.ui.part.column({
        content: [
          api.v1.ui.part.button({
            text: "Sample budget",
            callback: () => void sample("sample"),
            disabledWhileCallbackRunning: true,
          }),
          api.v1.ui.part.button({
            text: "A: single generation",
            callback: () => void testDeliveryVsRequest(),
            disabledWhileCallbackRunning: true,
          }),
          api.v1.ui.part.button({
            text: "B: two concurrent",
            callback: () => void testConcurrencyRefusalCost(),
            disabledWhileCallbackRunning: true,
          }),
          api.v1.ui.part.button({
            text: "Clear log",
            callback: () => {
              log.length = 0;
              render();
            },
          }),
          api.v1.ui.part.text({
            id: LOG_PART_ID,
            text: "(no samples yet)",
            noTemplate: true,
            style: { whiteSpace: "pre-wrap", fontFamily: "monospace" },
          }),
        ],
      }),
    ],
  }),
]);
