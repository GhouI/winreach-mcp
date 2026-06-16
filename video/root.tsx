import React from "react";
import { Composition } from "remotion";
import { WinBridgeDemo } from "./winbridge-demo";

export function RemotionRoot() {
  return (
    <Composition
      id="WinBridgeDemo"
      component={WinBridgeDemo}
      durationInFrames={450}
      fps={30}
      width={1280}
      height={720}
    />
  );
}
