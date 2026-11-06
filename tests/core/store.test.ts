import { describe, it, expect } from "vitest";
import {
  rootReducer,
  persistedLoaded,
  docAdded,
  docTextSet,
  docReviewed,
  issueDismissed,
  workshopTurnedOn,
  workshopTurnedOff,
  type RootState,
} from "../../src/core/store";
import { stageDone, missingKinds, openIssueCount } from "../../src/core/stages";
import { hashText } from "../../src/core/text";

const init = () => rootReducer(undefined, { type: "@@INIT" });
const apply = (
  state: RootState,
  ...actions: { type: string; payload?: unknown }[]
) => actions.reduce(rootReducer, state);

describe("persisted load", () => {
  it("fills fields a saved record predates", () => {
    const state = rootReducer(
      init(),
      persistedLoaded({
        canon: { brief: { premise: "Old" } } as unknown as RootState["canon"],
      }),
    );
    expect(state.canon.brief.premise).toBe("Old");
    expect(state.canon.brief.title).toBe("");
    expect(state.canon.docs).toEqual([]);
  });

  it("leaves runtime state alone", () => {
    const state = rootReducer(init(), persistedLoaded({}));
    expect(state.runtime).toEqual(init().runtime);
  });
});

describe("workshop", () => {
  it("forgets the boundary when it turns off", () => {
    const state = apply(
      init(),
      workshopTurnedOn({ boundary: 7 }),
      workshopTurnedOff(),
    );
    expect(state.workshop).toMatchObject({ on: false, boundary: null });
  });
});

describe("stages", () => {
  it("needs every interview field for the brief", () => {
    const state = init();
    expect(stageDone(state, "brief")).toBe(false);
    expect(
      stageDone(
        {
          ...state,
          canon: {
            ...state.canon,
            brief: {
              ...state.canon.brief,
              premise: "p",
              voice: "v",
              genre: "g",
              heat: "h",
              pace: "p",
              limits: "None",
              title: "t",
            },
          },
        },
        "brief",
      ),
    ).toBe(true);
  });

  it("finishes Talk when the interview is done, and starts there", () => {
    const state = init();
    expect(state.ui.stage).toBe("talk");
    expect(stageDone(state, "talk")).toBe(false);
  });

  it("lists the canon still needed, a dossier included", () => {
    expect(missingKinds(init())).toContain("dossier");
    expect(missingKinds(init())).toContain("geography");
  });

  it("counts only issues whose review is of the current text", () => {
    let state = apply(
      init(),
      docAdded({
        id: "a",
        kind: "geography",
        title: "Geography",
        text: "An island.",
      }),
      docReviewed({
        id: "a",
        review: {
          issues: [{ id: "i", kind: "contradiction", text: "x" }],
          textHash: hashText("An island."),
        },
      }),
    );
    expect(openIssueCount(state)).toBe(1);
    state = apply(state, issueDismissed({ docId: "a", issueId: "i" }));
    expect(openIssueCount(state)).toBe(0);
    state = apply(
      state,
      docReviewed({
        id: "a",
        review: {
          issues: [{ id: "j", kind: "invented", text: "y" }],
          textHash: hashText("An island."),
        },
      }),
      docTextSet({ id: "a", text: "A different island." }),
    );
    expect(openIssueCount(state)).toBe(0);
  });
});
