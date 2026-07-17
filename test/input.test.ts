import { describe, expect, it } from "vitest";
import {
  buildActionScript,
  keyTokenToVk,
  normalizeToAbsolute,
  parseKeyChord,
  scrollToWheel
} from "../src/powershell/input.js";

describe("normalizeToAbsolute", () => {
  const vs = { x: 0, y: 0, width: 1920, height: 1080 };

  it("maps the origin to 0 and the far corner to 65535", () => {
    expect(normalizeToAbsolute(0, 0, vs)).toEqual({ nx: 0, ny: 0 });
    expect(normalizeToAbsolute(1919, 1079, vs)).toEqual({ nx: 65535, ny: 65535 });
  });

  it("maps the centre near the midpoint", () => {
    const { nx, ny } = normalizeToAbsolute(960, 540, vs);
    expect(nx).toBeGreaterThan(32000);
    expect(nx).toBeLessThan(33000);
    expect(ny).toBeGreaterThan(32000);
    expect(ny).toBeLessThan(33000);
  });

  it("handles a negative virtual-screen origin (secondary monitor left of primary)", () => {
    const multi = { x: -1920, y: 0, width: 3840, height: 1080 };
    expect(normalizeToAbsolute(-1920, 0, multi).nx).toBe(0);
    expect(normalizeToAbsolute(1919, 0, multi).nx).toBe(65535);
  });
});

describe("scrollToWheel", () => {
  it("uses the vertical wheel with signed magnitude", () => {
    expect(scrollToWheel("up", 3)).toEqual({ flag: 0x0800, data: 360 });
    // Down is negative, encoded as unsigned 32-bit.
    expect(scrollToWheel("down", 3)).toEqual({ flag: 0x0800, data: (-360 >>> 0) });
  });

  it("uses the horizontal wheel for left/right", () => {
    expect(scrollToWheel("right", 1)).toEqual({ flag: 0x1000, data: 120 });
    expect(scrollToWheel("left", 1)).toEqual({ flag: 0x1000, data: (-120 >>> 0) });
  });
});

describe("keyTokenToVk", () => {
  it("maps letters and digits to their char code", () => {
    expect(keyTokenToVk("a")).toBe(0x41);
    expect(keyTokenToVk("Z")).toBe(0x5a);
    expect(keyTokenToVk("5")).toBe(0x35);
  });

  it("maps named keys and function keys", () => {
    expect(keyTokenToVk("enter")).toBe(0x0d);
    expect(keyTokenToVk("Escape")).toBe(0x1b);
    expect(keyTokenToVk("f1")).toBe(0x70);
    expect(keyTokenToVk("F24")).toBe(0x87);
  });

  it("throws on an unknown key", () => {
    expect(() => keyTokenToVk("@")).toThrow(/Unknown key/);
    expect(() => keyTokenToVk("notakey")).toThrow(/Unknown key/);
  });
});

describe("parseKeyChord", () => {
  it("parses modifiers and the final key", () => {
    expect(parseKeyChord("ctrl+shift+a")).toEqual({ modifiers: [0x11, 0x10], key: 0x41 });
    expect(parseKeyChord("alt+F4")).toEqual({ modifiers: [0x12], key: 0x73 });
  });

  it("parses a lone key with no modifiers", () => {
    expect(parseKeyChord("Enter")).toEqual({ modifiers: [], key: 0x0d });
  });

  it("rejects a non-modifier in modifier position and an empty chord", () => {
    expect(() => parseKeyChord("a+b")).toThrow(/Expected a modifier/);
    expect(() => parseKeyChord("")).toThrow(/Empty key chord/);
    expect(() => parseKeyChord("ctrl+boguskey")).toThrow(/Unknown key/);
  });
});

describe("buildActionScript", () => {
  it("always declares SendInput, DPI awareness, and reports cursor + bounds", () => {
    const s = buildActionScript({ type: "cursor_position" });
    expect(s).toContain("SendInput");
    expect(s).toContain("SetProcessDpiAwarenessContext");
    expect(s).toContain("GetCursorPos");
    expect(s).toContain("virtualScreen");
  });

  it("moves via Move-To with the given coordinate", () => {
    expect(buildActionScript({ type: "mouse_move", coordinate: [1440, 810] })).toContain("Move-To 1440 810");
  });

  it("types via the Unicode flag with the text's code units", () => {
    const s = buildActionScript({ type: "type", text: "hi" });
    expect(s).toContain("@(104,105)"); // 'h','i'
    expect(s).toContain("0x0004"); // KEYEVENTF_UNICODE
  });

  it("presses a chord with modifier down/up and key up", () => {
    const s = buildActionScript({ type: "key", keys: "ctrl+c" });
    expect(s).toContain("New-Key ([uint16]17)"); // VK_CONTROL down
    expect(s).toContain("New-Key ([uint16]67)"); // 'c'
    expect(s).toContain("0x0002"); // KEYEVENTF_KEYUP
  });

  it("scrolls with the vertical wheel flag", () => {
    const s = buildActionScript({ type: "scroll", direction: "down", amount: 2 });
    expect(s).toContain("2048"); // MOUSEEVENTF_WHEEL (0x0800) emitted in decimal
  });

  it("double_click emits two press/release pairs", () => {
    const s = buildActionScript({ type: "double_click", coordinate: [10, 20] });
    // left button down flag (0x0002 -> decimal 2) appears once per click.
    const downs = s.split("([uint32]2)").length - 1;
    expect(downs).toBeGreaterThanOrEqual(2);
  });
});
