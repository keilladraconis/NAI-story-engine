// The sidebar panel: header, stage tabs, and the open stage. Every stage stays
// mounted and toggles `display`, so switching tabs keeps each stage's local
// state (a half-typed instruction) and never swaps component types in place.

import type { StageId } from "../../core/store";
import { STAGES } from "../../core/stages";
import { useSlice } from "../bridge";
import { T } from "../style";
import { Header } from "../header/Header";
import { StageTabs } from "./StageTabs";
import { TalkStage } from "./stages/TalkStage";
import { BriefStage } from "./stages/BriefStage";
import { VignettesStage } from "./stages/VignettesStage";
import { NowStage } from "./stages/NowStage";
import { CanonStage } from "./stages/CanonStage";
import { CastStage } from "./stages/CastStage";
import { DistillStage } from "./stages/DistillStage";

const BODIES: Record<StageId, () => preact.VNode> = {
  talk: TalkStage,
  brief: BriefStage,
  vignettes: VignettesStage,
  now: NowStage,
  canon: CanonStage,
  cast: CastStage,
  distill: DistillStage,
};

export function Sidebar() {
  const stage = useSlice((s) => s.ui.stage);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        color: T.text,
        fontFamily: T.fontDefault,
      }}
    >
      <Header />
      <StageTabs />
      {STAGES.map(({ id }) => {
        const Body = BODIES[id];
        return (
          <div
            key={id}
            style={{
              display: id === stage ? "flex" : "none",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
            }}
          >
            <Body />
          </div>
        );
      })}
    </div>
  );
}
