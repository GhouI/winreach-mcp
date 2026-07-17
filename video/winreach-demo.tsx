import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { sceneBg } from "./theme";
import { Scene } from "./helpers";
import {
  SceneComputerUse,
  SceneConnect,
  SceneEnd,
  SceneHook,
  ScenePowerShell,
  SceneSecurity,
} from "./scenes";

// Scene durations in frames @ 30fps. Scenes crossfade by OVERLAP frames via a
// negative Series offset, so each scene's exit fade dissolves into the next
// scene's entrance (no hard cuts). One idea per scene, clear begin→middle→end.
const OVERLAP = 15;
const HOOK = 130; // 1 · positioning line
const CONNECT = 155; // 2 · agent connects over HTTP
const POWERSHELL = 165; // 3 · remote PowerShell
const COMPUTER = 220; // 4 · computer use (standout)
const SECURITY = 140; // 5 · security beat
const END = 140; // 6 · end card

// Total = sum(durations) - OVERLAP * (scenes - 1).
export const TOTAL_FRAMES =
  HOOK + CONNECT + POWERSHELL + COMPUTER + SECURITY + END - OVERLAP * 5;

export function WinReachDemo() {
  return (
    <AbsoluteFill style={sceneBg}>
      <Series>
        <Series.Sequence durationInFrames={HOOK} layout="none">
          <Scene length={HOOK}>
            <SceneHook />
          </Scene>
        </Series.Sequence>

        <Series.Sequence durationInFrames={CONNECT} offset={-OVERLAP} layout="none">
          <Scene length={CONNECT}>
            <SceneConnect />
          </Scene>
        </Series.Sequence>

        <Series.Sequence durationInFrames={POWERSHELL} offset={-OVERLAP} layout="none">
          <Scene length={POWERSHELL}>
            <ScenePowerShell />
          </Scene>
        </Series.Sequence>

        <Series.Sequence durationInFrames={COMPUTER} offset={-OVERLAP} layout="none">
          <Scene length={COMPUTER}>
            <SceneComputerUse />
          </Scene>
        </Series.Sequence>

        <Series.Sequence durationInFrames={SECURITY} offset={-OVERLAP} layout="none">
          <Scene length={SECURITY}>
            <SceneSecurity />
          </Scene>
        </Series.Sequence>

        <Series.Sequence durationInFrames={END} offset={-OVERLAP} layout="none">
          <Scene length={END} exit={24}>
            <SceneEnd />
          </Scene>
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
}
