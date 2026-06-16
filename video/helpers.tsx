import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  useCurrentFrame,
} from "remotion";
import { sceneBg } from "./theme";

// Premium "ease-out-expo" curve recommended by the Remotion docs for
// natural-feeling entrances. Used across all scene motion for consistency.
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

/**
 * A scene wrapper that fades + gently lifts its contents in at the start and
 * out at the end. This is what gives the video clean cross-dissolves between
 * sequential scenes instead of hard cuts. `length` is the scene's own
 * duration (local frames). Children are rendered against the shared bg.
 */
export const Scene: React.FC<{
  length: number;
  children: React.ReactNode;
  enter?: number;
  exit?: number;
}> = ({ length, children, enter = 16, exit = 16 }) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [0, enter, length - exit, length],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_IN_OUT }
  );

  const lift = interpolate(frame, [0, enter], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });

  return (
    <AbsoluteFill style={{ ...sceneBg, opacity }}>
      <AbsoluteFill style={{ transform: `translateY(${lift}px)` }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * Overlapping sequence: places a scene on the timeline starting at `from`,
 * for `durationInFrames`, but lets scenes overlap by `overlap` frames so the
 * outgoing fade of one scene and the incoming fade of the next cross-dissolve.
 */
export const SceneSeq: React.FC<{
  from: number;
  durationInFrames: number;
  children: React.ReactNode;
}> = ({ from, durationInFrames, children }) => (
  <Sequence from={from} durationInFrames={durationInFrames} layout="none">
    {children}
  </Sequence>
);

/** Reveal `text` character-by-character based on a local start frame + speed. */
export function useTyped(text: string, start: number, cps = 1.6) {
  const frame = useCurrentFrame();
  const shown = Math.max(0, Math.floor((frame - start) * cps));
  return text.slice(0, Math.min(text.length, shown));
}

/** True once `start` has passed; used to gate output lines / cursor. */
export function isAfter(frame: number, start: number) {
  return frame >= start;
}

/** Smooth eased fade-in for a single element over [a, b]. */
export function fadeIn(frame: number, a: number, b: number) {
  return interpolate(frame, [a, b], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
}

/** Eased rise + fade for entrances. Returns {opacity, translateY}. */
export function rise(frame: number, a: number, b: number, dist = 22) {
  const t = interpolate(frame, [a, b], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_OUT,
  });
  return { opacity: t, translateY: (1 - t) * dist };
}
