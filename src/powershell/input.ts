import { randomUUID } from "node:crypto";
import { executePowerShell } from "./shell.js";
import type { PowerShellRuntimeOptions } from "./types.js";

/**
 * Desktop input injection ("computer use"). Mouse movement/clicks, keyboard
 * typing and key chords, and scrolling are performed on the Windows host by
 * generating a single PowerShell script that P/Invokes the Win32 `SendInput`
 * API via `Add-Type`. This mirrors the pure-PowerShell + .NET posture of
 * screenshot.ts — no native npm modules.
 *
 * Coordinates are absolute pixels in the **virtual desktop** space, the same
 * space `take_screenshot` captures, so a pixel the agent sees in a screenshot is
 * the pixel `SendInput` targets. The script declares Per-Monitor-V2 DPI
 * awareness so that correspondence holds on scaled/multi-monitor setups.
 *
 * Like screen capture, input injection needs an active interactive desktop; in a
 * non-interactive service (session 0) context it fails and the result carries
 * `success: false` with the error rather than throwing.
 */

/** Absolute virtual-desktop bounds, as reported by GetSystemMetrics. */
export type VirtualScreen = { x: number; y: number; width: number; height: number };

export type ScrollDirection = "up" | "down" | "left" | "right";

/** The discriminated set of input actions. Field requirements are enforced by the caller. */
export type ComputerAction =
  | { type: "mouse_move"; coordinate: [number, number] }
  | { type: "left_click"; coordinate: [number, number] }
  | { type: "right_click"; coordinate: [number, number] }
  | { type: "middle_click"; coordinate: [number, number] }
  | { type: "double_click"; coordinate: [number, number] }
  | { type: "left_mouse_down"; coordinate?: [number, number] }
  | { type: "left_mouse_up"; coordinate?: [number, number] }
  | { type: "type"; text: string }
  | { type: "key"; keys: string }
  | { type: "scroll"; direction: ScrollDirection; amount: number; coordinate?: [number, number] }
  | { type: "cursor_position" }
  | { type: "wait"; durationMs: number };

export type ComputerUseResult = {
  commandId: string;
  success: boolean;
  action: string;
  cursor?: { x: number; y: number };
  virtualScreen?: VirtualScreen;
  durationMs: number;
  error?: string;
};

/* --------------------------- Virtual-key mapping --------------------------- */

/** The modifier key names accepted in a chord, mapped to their virtual-key code. */
const MODIFIER_VK: Record<string, number> = {
  ctrl: 0x11,
  control: 0x11,
  alt: 0x12,
  shift: 0x10,
  win: 0x5b,
  super: 0x5b,
  cmd: 0x5b,
  meta: 0x5b
};

/** Named (non-character) keys accepted in a chord / key action. */
const NAMED_VK: Record<string, number> = {
  enter: 0x0d,
  return: 0x0d,
  tab: 0x09,
  esc: 0x1b,
  escape: 0x1b,
  space: 0x20,
  spacebar: 0x20,
  backspace: 0x08,
  delete: 0x2e,
  del: 0x2e,
  insert: 0x2d,
  home: 0x24,
  end: 0x23,
  pageup: 0x21,
  pagedown: 0x22,
  up: 0x26,
  down: 0x28,
  left: 0x25,
  right: 0x27,
  capslock: 0x14,
  printscreen: 0x2c,
  menu: 0x5d
};

/** Resolve a single key token (not a modifier) to its virtual-key code, or throw. */
export function keyTokenToVk(token: string): number {
  const t = token.trim().toLowerCase();
  if (!t) {
    throw new Error("Empty key token");
  }
  if (t in NAMED_VK) {
    return NAMED_VK[t];
  }
  // Function keys F1..F24.
  const fn = /^f([1-9]|1[0-9]|2[0-4])$/.exec(t);
  if (fn) {
    return 0x70 + (Number(fn[1]) - 1);
  }
  // Single character: letters and digits map to their uppercase char code.
  if (t.length === 1) {
    const code = t.toUpperCase().charCodeAt(0);
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x30 && code <= 0x39)) {
      return code;
    }
  }
  throw new Error(`Unknown key: ${JSON.stringify(token)}`);
}

/**
 * Parse a key chord like "ctrl+shift+a" or "Enter" into its modifier VKs and the
 * main key VK. Modifiers may appear in any order but must precede the key; the
 * last token is the key. Throws on an unknown token.
 */
export function parseKeyChord(keys: string): { modifiers: number[]; key: number } {
  const tokens = keys.split("+").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) {
    throw new Error("Empty key chord");
  }
  const modifiers: number[] = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const mod = tokens[i].toLowerCase();
    if (!(mod in MODIFIER_VK)) {
      throw new Error(`Expected a modifier (ctrl/alt/shift/win) but got ${JSON.stringify(tokens[i])}`);
    }
    modifiers.push(MODIFIER_VK[mod]);
  }
  const last = tokens[tokens.length - 1];
  // Allow a lone modifier ("shift") to be pressed as the key itself.
  const key = last.toLowerCase() in MODIFIER_VK ? MODIFIER_VK[last.toLowerCase()] : keyTokenToVk(last);
  return { modifiers, key };
}

/* ---------------------------- Coordinate model ----------------------------- */

/**
 * Normalize a virtual-desktop pixel to SendInput's 0..65535 absolute space. Pure
 * mirror of the formula the generated PowerShell uses at runtime (with live
 * metrics); exposed for unit testing and documentation.
 */
export function normalizeToAbsolute(
  x: number,
  y: number,
  vs: VirtualScreen
): { nx: number; ny: number } {
  const nx = Math.round(((x - vs.x) * 65535) / Math.max(1, vs.width - 1));
  const ny = Math.round(((y - vs.y) * 65535) / Math.max(1, vs.height - 1));
  return { nx, ny };
}

/* ------------------------------ Scroll model ------------------------------- */

const WHEEL_DELTA = 120;
/** MOUSEEVENTF flags for the wheel; sign of mouseData sets direction. */
const MOUSEEVENTF_WHEEL = 0x0800;
const MOUSEEVENTF_HWHEEL = 0x1000;

/** Wheel flag + unsigned 32-bit mouseData for a scroll direction/amount. */
export function scrollToWheel(direction: ScrollDirection, amount: number): { flag: number; data: number } {
  const magnitude = amount * WHEEL_DELTA;
  // Vertical: up positive, down negative. Horizontal: right positive, left negative.
  const signed =
    direction === "up" || direction === "right" ? magnitude : -magnitude;
  const flag = direction === "up" || direction === "down" ? MOUSEEVENTF_WHEEL : MOUSEEVENTF_HWHEEL;
  // SendInput's mouseData is a uint; encode negatives as unsigned 32-bit.
  return { flag, data: signed < 0 ? signed >>> 0 : signed };
}

/* --------------------------- PowerShell builders --------------------------- */

// The shared P/Invoke type block + helpers. Kept as a template so every action
// runs in one PowerShell invocation (the Add-Type compile cost is paid once).
const PREAMBLE = String.raw`
$ErrorActionPreference = 'Stop'
$src = @"
using System;
using System.Runtime.InteropServices;
public static class WBInput {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION U; }
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint n, INPUT[] pInputs, int cb);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr v);
}
"@
Add-Type -TypeDefinition $src
try { [void][WBInput]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch { }
$SIZE = [System.Runtime.InteropServices.Marshal]::SizeOf([System.Type][WBInput+INPUT])
function VS { @{ x = [WBInput]::GetSystemMetrics(76); y = [WBInput]::GetSystemMetrics(77); width = [WBInput]::GetSystemMetrics(78); height = [WBInput]::GetSystemMetrics(79) } }
function Send-Inputs([System.Collections.ArrayList]$list) {
  if ($list.Count -eq 0) { return }
  $arr = [WBInput+INPUT[]]$list.ToArray([WBInput+INPUT])
  [void][WBInput]::SendInput([uint32]$arr.Length, $arr, $SIZE)
}
function New-Mouse([int]$dx,[int]$dy,[uint32]$data,[uint32]$flags) {
  $i = New-Object WBInput+INPUT; $i.type = 0
  $mi = New-Object WBInput+MOUSEINPUT
  $mi.dx=$dx; $mi.dy=$dy; $mi.mouseData=$data; $mi.dwFlags=$flags; $mi.time=0; $mi.dwExtraInfo=[IntPtr]::Zero
  $u = New-Object WBInput+INPUTUNION; $u.mi = $mi; $i.U = $u; return $i
}
function New-Key([uint16]$vk,[uint16]$scan,[uint32]$flags) {
  $i = New-Object WBInput+INPUT; $i.type = 1
  $ki = New-Object WBInput+KEYBDINPUT
  $ki.wVk=$vk; $ki.wScan=$scan; $ki.dwFlags=$flags; $ki.time=0; $ki.dwExtraInfo=[IntPtr]::Zero
  $u = New-Object WBInput+INPUTUNION; $u.ki = $ki; $i.U = $u; return $i
}
function Move-To([int]$x,[int]$y) {
  $v = VS
  if ($x -lt $v.x -or $y -lt $v.y -or $x -ge ($v.x + $v.width) -or $y -ge ($v.y + $v.height)) {
    throw "coordinate ($x,$y) is outside the virtual screen"
  }
  $nx = [int][math]::Round((($x - $v.x) * 65535.0) / [math]::Max(1, $v.width - 1))
  $ny = [int][math]::Round((($y - $v.y) * 65535.0) / [math]::Max(1, $v.height - 1))
  $l = New-Object System.Collections.ArrayList
  [void]$l.Add((New-Mouse $nx $ny 0 ([uint32](0x0001 -bor 0x8000 -bor 0x4000))))
  Send-Inputs $l
}
`;

const MOUSE_BUTTON_FLAGS: Record<string, { down: number; up: number }> = {
  left: { down: 0x0002, up: 0x0004 },
  right: { down: 0x0008, up: 0x0010 },
  middle: { down: 0x0020, up: 0x0040 }
};

const REPORT = String.raw`
$p = New-Object WBInput+POINT
[void][WBInput]::GetCursorPos([ref]$p)
$out = @{ ok = $true; cursor = @{ x = $p.X; y = $p.Y }; virtualScreen = VS }
$out | ConvertTo-Json -Compress
`;

/** A PS snippet that clicks `button` after an optional move to (x,y). */
function clickSnippet(button: "left" | "right" | "middle", coordinate?: [number, number], double = false): string {
  const { down, up } = MOUSE_BUTTON_FLAGS[button];
  const lines: string[] = [];
  if (coordinate) {
    lines.push(`Move-To ${coordinate[0]} ${coordinate[1]}`);
  }
  lines.push("$l = New-Object System.Collections.ArrayList");
  const press = `[void]$l.Add((New-Mouse 0 0 0 ([uint32]${down}))); [void]$l.Add((New-Mouse 0 0 0 ([uint32]${up})))`;
  lines.push(press);
  if (double) {
    lines.push(press);
  }
  lines.push("Send-Inputs $l");
  return lines.join("\n");
}

/** Build the full PowerShell script for one action (preamble + action + report). */
export function buildActionScript(action: ComputerAction): string {
  let body = "";
  switch (action.type) {
    case "mouse_move":
      body = `Move-To ${action.coordinate[0]} ${action.coordinate[1]}`;
      break;
    case "left_click":
      body = clickSnippet("left", action.coordinate);
      break;
    case "right_click":
      body = clickSnippet("right", action.coordinate);
      break;
    case "middle_click":
      body = clickSnippet("middle", action.coordinate);
      break;
    case "double_click":
      body = clickSnippet("left", action.coordinate, true);
      break;
    case "left_mouse_down": {
      const move = action.coordinate ? `Move-To ${action.coordinate[0]} ${action.coordinate[1]}\n` : "";
      body = `${move}$l = New-Object System.Collections.ArrayList; [void]$l.Add((New-Mouse 0 0 0 ([uint32]0x0002))); Send-Inputs $l`;
      break;
    }
    case "left_mouse_up": {
      const move = action.coordinate ? `Move-To ${action.coordinate[0]} ${action.coordinate[1]}\n` : "";
      body = `${move}$l = New-Object System.Collections.ArrayList; [void]$l.Add((New-Mouse 0 0 0 ([uint32]0x0004))); Send-Inputs $l`;
      break;
    }
    case "type": {
      // Embed the text as UTF-16 code units so no PowerShell string escaping is
      // needed and any Unicode types verbatim (KEYEVENTF_UNICODE).
      const units = Array.from(action.text, (ch) => ch.charCodeAt(0));
      const arr = units.length ? `@(${units.join(",")})` : "@()";
      body = [
        `$units = ${arr}`,
        "$l = New-Object System.Collections.ArrayList",
        "foreach ($u in $units) {",
        "  [void]$l.Add((New-Key 0 ([uint16]$u) ([uint32]0x0004)))",
        "  [void]$l.Add((New-Key 0 ([uint16]$u) ([uint32](0x0004 -bor 0x0002))))",
        "}",
        "Send-Inputs $l"
      ].join("\n");
      break;
    }
    case "key": {
      const { modifiers, key } = parseKeyChord(action.keys);
      const lines = ["$l = New-Object System.Collections.ArrayList"];
      for (const vk of modifiers) {
        lines.push(`[void]$l.Add((New-Key ([uint16]${vk}) 0 0))`);
      }
      lines.push(`[void]$l.Add((New-Key ([uint16]${key}) 0 0))`);
      lines.push(`[void]$l.Add((New-Key ([uint16]${key}) 0 ([uint32]0x0002)))`);
      for (const vk of [...modifiers].reverse()) {
        lines.push(`[void]$l.Add((New-Key ([uint16]${vk}) 0 ([uint32]0x0002)))`);
      }
      lines.push("Send-Inputs $l");
      body = lines.join("\n");
      break;
    }
    case "scroll": {
      const { flag, data } = scrollToWheel(action.direction, action.amount);
      const move = action.coordinate ? `Move-To ${action.coordinate[0]} ${action.coordinate[1]}\n` : "";
      body = `${move}$l = New-Object System.Collections.ArrayList; [void]$l.Add((New-Mouse 0 0 ([uint32]${data}) ([uint32]${flag}))); Send-Inputs $l`;
      break;
    }
    case "cursor_position":
      body = "";
      break;
    case "wait":
      body = `Start-Sleep -Milliseconds ${Math.round(action.durationMs)}`;
      break;
  }
  return `${PREAMBLE}\n${body}\n${REPORT}`;
}

/* ------------------------------ Runtime entry ------------------------------ */

function parseReport(stdout: string): { cursor?: { x: number; y: number }; virtualScreen?: VirtualScreen } {
  const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
  if (!line) {
    return {};
  }
  try {
    const parsed = JSON.parse(line) as {
      cursor?: { x: number; y: number };
      virtualScreen?: VirtualScreen;
    };
    return { cursor: parsed.cursor, virtualScreen: parsed.virtualScreen };
  } catch {
    return {};
  }
}

/**
 * Perform a single computer-use action on the host. Composes one PowerShell
 * script and runs it through the shared runtime. A runtime failure (no
 * interactive desktop, out-of-bounds coordinate, injection error) yields
 * `success: false` with the PowerShell error, never a throw.
 */
export async function performComputerAction(
  runtime: PowerShellRuntimeOptions,
  action: ComputerAction,
  options: { timeoutMs?: number } = {}
): Promise<ComputerUseResult> {
  const commandId = randomUUID();
  let script: string;
  try {
    script = buildActionScript(action);
  } catch (error) {
    // A malformed key chord is caught here before any host interaction.
    return {
      commandId,
      success: false,
      action: action.type,
      durationMs: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  const result = await executePowerShell(runtime, { command: script, timeoutMs: options.timeoutMs });

  if (result.exitCode !== 0) {
    return {
      commandId,
      success: false,
      action: action.type,
      durationMs: result.durationMs,
      error: result.stderr.trim() || `Input injection failed with exit code ${result.exitCode}.`
    };
  }

  const { cursor, virtualScreen } = parseReport(result.stdout);
  return {
    commandId,
    success: true,
    action: action.type,
    cursor,
    virtualScreen,
    durationMs: result.durationMs
  };
}
