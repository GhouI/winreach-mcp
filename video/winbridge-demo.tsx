import React from "react";
import { AbsoluteFill } from "remotion";
import { sceneBg } from "./theme";
import { Scene, SceneSeq } from "./helpers";
import { SceneCommand, ScenePayoff, SceneProblem, SceneSolution } from "./scenes";

// Scene durations (in frames @ 30fps). Scenes overlap by OVERLAP frames so the
// outgoing fade of one cross-dissolves into the incoming fade of the next.
const OVERLAP = 14;
const D1 = 110; // Problem
const D2 = 130; // Solution pipeline
const D3 = 180; // One command (hero terminal)
const D4 = 165; // Payoff

const start2 = D1 - OVERLAP;
const start3 = start2 + D2 - OVERLAP;
const start4 = start3 + D3 - OVERLAP;

export const TOTAL_FRAMES = start4 + D4;

export function WinBridgeDemo() {
  return (
    <AbsoluteFill style={sceneBg}>
      <SceneSeq from={0} durationInFrames={D1}>
        <Scene length={D1}>
          <SceneProblem />
        </Scene>
      </SceneSeq>

      <SceneSeq from={start2} durationInFrames={D2}>
        <Scene length={D2}>
          <SceneSolution />
        </Scene>
      </SceneSeq>

      <SceneSeq from={start3} durationInFrames={D3}>
        <Scene length={D3}>
          <SceneCommand />
        </Scene>
      </SceneSeq>

      <SceneSeq from={start4} durationInFrames={D4}>
        <Scene length={D4} exit={20}>
          <ScenePayoff />
        </Scene>
      </SceneSeq>
    </AbsoluteFill>
  );
}
