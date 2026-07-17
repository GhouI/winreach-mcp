import React from "react";
import { Composition } from "remotion";
import { TOTAL_FRAMES, WinReachDemo } from "./winreach-demo";

export function RemotionRoot() {
  return (
    <Composition
      id="WinReachDemo"
      component={WinReachDemo}
      durationInFrames={TOTAL_FRAMES}
      fps={30}
      width={1280}
      height={720}
    />
  );
}
