import { describe, it, expect } from "vitest";
import {
  buildPills,
  pillLabel,
  pillsFor,
} from "../../../src/core/chat-types/pills";
import type {
  ForgeActionRecord,
  ForgeSegment,
} from "../../../src/core/chat-types/types";

const act = (action: Partial<ForgeActionRecord>): ForgeSegment => ({
  kind: "action",
  action: { kind: "CREATE", status: "applied", ...action },
});
const prose = (text: string): ForgeSegment => ({ kind: "prose", text });

describe("pillLabel", () => {
  it.each([
    [{ kind: "CREATE", name: "Jimmy" }, 'create | "Jimmy"'],
    [{ kind: "REVISE", name: "Corin Vane" }, 'revise | "Corin Vane"'],
    [{ kind: "DELETE", name: "The Mill" }, 'delete | "The Mill"'],
    [{ kind: "THREAD", name: "Half the House" }, 'thread | "Half the House"'],
    [
      { kind: "RENAME", name: "Corin", newName: "Corin Vane" },
      'rename | "Corin" → "Corin Vane"',
    ],
    [{ kind: "UNKNOWN" }, "unrecognised"],
  ] as const)("labels %o", (action, label) => {
    expect(pillLabel({ status: "applied", ...action })).toBe(label);
  });
});

describe("pillsFor", () => {
  it("turns every run of text into a thinking pill where it sits", () => {
    const pills = pillsFor([
      prose("The sale is fact."),
      act({ name: "Hesper Vane" }),
      prose("One thread."),
      act({ kind: "THREAD", name: "Half the House" }),
      prose("Done."),
    ]);
    expect(pills.map((p) => p.label)).toEqual([
      "thinking",
      'create | "Hesper Vane"',
      "thinking",
      'thread | "Half the House"',
      "thinking",
    ]);
    expect(pills[0]).toMatchObject({
      tone: "thinking",
      body: [{ label: "", text: "The sale is fact." }],
    });
  });

  it("joins adjacent text into one pill and makes none for whitespace", () => {
    const pills = pillsFor([prose("One."), prose("  "), prose("Two.")]);
    expect(pills).toHaveLength(1);
    expect(pills[0].body[0].text).toBe("One.\nTwo.");
  });

  it("carries a command's body", () => {
    const body = [{ label: "Summary", text: "Keeps the lock." }];
    expect(pillsFor([act({ name: "Hesper Vane", body })])[0]).toEqual({
      label: 'create | "Hesper Vane"',
      tone: "applied",
      body,
    });
  });

  it("marks a rejected command and leads its body with the reason", () => {
    const pill = pillsFor([
      act({
        kind: "THREAD",
        name: "T",
        status: "rejected",
        reason: "Name a known element.",
        body: [{ label: "State", text: "x" }],
      }),
    ])[0];
    expect(pill.tone).toBe("rejected");
    expect(pill.body).toEqual([
      { label: "Not applied", text: "Name a known element." },
      { label: "State", text: "x" },
    ]);
  });

  it("marks an unrecognised line rejected", () => {
    const pill = pillsFor([
      {
        kind: "action",
        action: {
          kind: "UNKNOWN",
          status: "unrecognized",
          reason: "[THREAD x]",
        },
      },
    ])[0];
    expect(pill).toMatchObject({ label: "unrecognised", tone: "rejected" });
  });

  it("is one thinking pill for a reply that is all thinking", () => {
    expect(pillsFor([prose("Nothing new to record.")])).toHaveLength(1);
  });

  it("takes the unfinished tail of a streaming reply as thinking", () => {
    const pills = pillsFor([act({ name: "A" })], "and now", true);
    expect(pills.map((p) => p.label)).toEqual(['create | "A"', "thinking"]);
  });

  it("reads thinking… until the first command arrives", () => {
    expect(pillsFor([], "", true).map((p) => p.label)).toEqual(["thinking…"]);
    expect(pillsFor([], "So", true).map((p) => p.label)).toEqual(["thinking…"]);
    expect(pillsFor([prose("So.")], "", false)[0].label).toBe("thinking");
  });
});

describe("buildPills", () => {
  const settled = [prose("Settled."), act({ name: "A" })];

  it("prefers settled segments over the content", () => {
    const pills = buildPills('[CREATE CHARACTER "B" | x]', settled, false);
    expect(pills.map((p) => p.label)).toEqual(["thinking", 'create | "A"']);
  });

  it("reads thinking… for an all-thinking reply that is being generated", () => {
    expect(buildPills("So far", undefined, true).map((p) => p.label)).toEqual([
      "thinking…",
    ]);
  });

  it("reads thinking for the same reply once it is not being generated", () => {
    expect(buildPills("So far", undefined, false).map((p) => p.label)).toEqual([
      "thinking",
    ]);
  });

  const unsettled = 'Hm.\n[CREATE CHARACTER "Jimmy" | A boy.]';
  const notApplied = {
    label: "Not applied",
    text: "This turn did not finish, or the reply was edited after it ran.",
  };

  it("reads an unsettled command as not applied once the reply is not being generated", () => {
    const pills = buildPills(unsettled, undefined, false);
    expect(pills.map((p) => p.label)).toEqual(["thinking", 'create | "Jimmy"']);
    expect(pills[0].tone).toBe("thinking");
    expect(pills[1].tone).toBe("rejected");
    expect(pills[1].body).toEqual([
      notApplied,
      { label: "Type", text: "CHARACTER" },
      { label: "Summary", text: "A boy." },
    ]);
  });

  it("leaves a command provisional while the reply is being generated", () => {
    const pills = buildPills(unsettled, undefined, true);
    expect(pills[1]).toEqual({
      label: 'create | "Jimmy"',
      tone: "applied",
      body: [
        { label: "Type", text: "CHARACTER" },
        { label: "Summary", text: "A boy." },
      ],
    });
  });

  it("leaves settled segments as they were settled", () => {
    expect(buildPills(unsettled, settled, false)[1]).toEqual({
      label: 'create | "A"',
      tone: "applied",
      body: [],
    });
  });

  it("says once why an unsettled unrecognised line was not applied", () => {
    const pills = buildPills('[CREATE SYSTm "X" | d]', undefined, false);
    expect(pills).toEqual([
      {
        label: "unrecognised",
        tone: "rejected",
        body: [
          notApplied,
          { label: "Written", text: '[CREATE SYSTm "X" | d]' },
        ],
      },
    ]);
  });
});
