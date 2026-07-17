import React from "react";
import { Composition, Still } from "remotion";
import { TOTAL_FRAMES, WinReachDemo } from "./winreach-demo";
import {
  LINKEDIN_TOTAL,
  WinReachLinkedIn,
  WinReachLinkedInCover,
} from "./linkedin";

export function RemotionRoot() {
  return (
    <>
      {/* 16:9 README demo */}
      <Composition
        id="WinReachDemo"
        component={WinReachDemo}
        durationInFrames={TOTAL_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* 4:5 vertical LinkedIn cut */}
      <Composition
        id="WinReachLinkedIn"
        component={WinReachLinkedIn}
        durationInFrames={LINKEDIN_TOTAL}
        fps={30}
        width={1080}
        height={1350}
      />

      {/* Custom LinkedIn cover (still) */}
      <Still
        id="WinReachLinkedInCover"
        component={WinReachLinkedInCover}
        width={1080}
        height={1350}
      />
    </>
  );
}
