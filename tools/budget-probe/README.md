# SE Budget Probe

A throwaway diagnostic for the v15 Engine design. It is **not** Story Engine —
separate project, separate script id, no shared code.

## What it answers

The Engine's collision handling
([design §3.4](../../docs/superpowers/specs/2026-08-12-engine-agentic-loop-design.md))
is optimistic: fire the request, and if the backend refuses it for concurrency,
swallow the error and keep the intent queued. That is only sound if a refusal is
cheap. Two questions decide it:

1. **Is the output-token budget debited by what a generation returns, or by what
   it requests?** The budget is managed client-side through the script runtime's
   own API surface, so "you are charged for `max_tokens` whether or not you get
   them" is a live possibility.
2. **What does a refused generation cost?** If a refusal is charged its full
   `max_tokens`, then backoff-retry burns the bucket for nothing, and §3.4 needs
   a different strategy — most likely a hard local gate rather than optimistic
   recovery.

## Running it

```
npx nibs build tools/budget-probe
```

Load `tools/budget-probe/dist/budget-probe.naiscript` into a **scratch story**
(it spends output budget and deliberately provokes errors), open the sidebar
panel, and press the buttons top to bottom.

Bucket replenishment is gated on recent user interaction, and pressing a button
counts — so the readings drift upward between samples. Use **Sample budget** a
few times first to see the refill rate before interpreting any delta.

## Reading the output

**Test A — single generation.** `max_tokens` is 512 against a prompt that should
return well under 40 tokens.

| observation             | meaning             |
| ----------------------- | ------------------- |
| delta ≈ tokens returned | debited on delivery |
| delta ≈ 512             | debited on request  |

**Test B — two concurrent generations.** Fires two without awaiting the first,
so one should be refused.

| observation                           | meaning                                           |
| ------------------------------------- | ------------------------------------------------- |
| delta ≈ tokens returned by the winner | refusal is free — §3.4 stands                     |
| delta ≈ winner + 512                  | refusal is charged its request — §3.4 must change |
| both succeeded                        | inconclusive; no block was hit, try again         |

Test B also prints the refused request's error with its own properties
enumerated. That text is the other half of the finding: the Engine needs to tell
a concurrency refusal apart from every other generation failure, and it should
key on something structured rather than matching an error string.

## Caveats

- Timing is wall-clock and replenishment is continuous, so treat small deltas as
  noise. `MAX_TOKENS` is set high specifically so the two hypotheses differ by
  hundreds of tokens rather than a handful.
- If Test B reports both requests succeeding, the concurrency gate did not
  engage — the two calls may have been serialised locally. Re-run; if it never
  blocks, the gate may not apply to two requests from the same script, and the
  test needs a story-editor generation racing a script one instead.
