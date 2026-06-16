import React from "react";
import { Composition } from "remotion";
import { TOTAL_FRAMES, WinBridgeDemo } from "./winbridge-demo";

export function RemotionRoot() {
  return (
    <Composition
      id="WinBridgeDemo"
      component={WinBridgeDemo}
      durationInFrames={TOTAL_FRAMES}
      fps={30}
      width={1280}
      height={720}
    />
  );
}
