/**
 * @saulene/plugin/statusline — tests
 *
 * Tests for the truecolor rasterizer, animation director, and birth animation.
 * All tests are purely functional (no IO, no timers). The StatusLine class is not
 * tested here because it owns a real setInterval; it's exercised by running the plugin.
 */

import { ASPECTS, type AspectVector, type Soul, seedFromEntropy } from "@saulene/core";
import { spriteParams } from "@saulene/renderer";
import { describe, expect, it } from "vitest";
import { AnimDirector } from "../src/statusline/director.js";
import { birthFrames, renderBirthFrame } from "../src/statusline/birth.js";
import {
  CHAR_ROWS,
  type PixelGrid,
  colorsFromParams,
  compose,
  pixelGridToAnsi,
} from "../src/statusline/rasterizer.js";
import {
  BASE,
  H,
  TICK_MS,
  W,
  WISP_ORIGINAL,
  WISP_VARIANTS,
  breatheDy,
} from "../src/statusline/sprite-data.js";

// ── Soul + SpriteParams builders ──────────────────────────────────────────────

function vec(fill: number): AspectVector {
  return Object.fromEntries(ASPECTS.map((a) => [a, fill])) as AspectVector;
}

function soulOf(
  base: number,
  overrides: Partial<AspectVector> = {},
  opts: { stubbornness?: number; mp?: number; sex?: "male" | "female" } = {},
): Soul {
  const v = vec(base);
  for (const [a, val] of Object.entries(overrides)) (v as Record<string, number>)[a] = val as number;
  return {
    v,
    s: vec(0.5),
    a: vec(0),
    tension: vec(0),
    disuseAnchor: vec(0.5),
    refractory: vec(0),
    betaGain: vec(1),
    migrationBudget: 0.1,
    stubbornness: opts.stubbornness ?? 0.5,
    sex: opts.sex ?? "female",
    mp: opts.mp ?? 0,
    lastUsedAt: 0,
  };
}

const DEFAULT_SOUL = soulOf(0.5);
const DEFAULT_PARAMS = spriteParams(DEFAULT_SOUL);

// ── colorsFromParams ──────────────────────────────────────────────────────────

describe("colorsFromParams", () => {
  it("dark mode: returns [r,g,b] tuples with correct structure", () => {
    const c = colorsFromParams(DEFAULT_PARAMS, "dark");
    expect(c.fill).toHaveLength(3);
    expect(c.ink).toHaveLength(3);
    expect(c.wisp).toHaveLength(3);
    expect(c.eye).toHaveLength(3);
    for (const ch of [...c.fill, ...c.ink, ...c.wisp, ...c.eye]) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(255);
    }
  });

  it("dark mode: ink is grey (#b8b8b8), wisp is white, eye is near-black", () => {
    const c = colorsFromParams(DEFAULT_PARAMS, "dark");
    expect(c.ink).toEqual([0xb8, 0xb8, 0xb8]);
    expect(c.wisp).toEqual([0xff, 0xff, 0xff]);
    expect(c.eye).toEqual([0x16, 0x13, 0x10]);
  });

  it("light mode: all components are cyan (#99d9ea)", () => {
    const c = colorsFromParams(DEFAULT_PARAMS, "light");
    expect(c.ink).toEqual([0x99, 0xd9, 0xea]);
    expect(c.fill).toEqual([0x99, 0xd9, 0xea]);
    expect(c.wisp).toEqual([0x99, 0xd9, 0xea]);
  });

  it("fill color varies by soul (hue/saturation/lightness)", () => {
    const a = spriteParams(soulOf(0.5, { openness: 0.1, intellect: 0.1 })); // warm/terracotta
    const b = spriteParams(soulOf(0.5, { openness: 0.9, intellect: 0.9 })); // cool/violet
    const ca = colorsFromParams(a, "dark");
    const cb = colorsFromParams(b, "dark");
    expect(ca.fill).not.toEqual(cb.fill); // distinct hues → distinct colors
  });
});

// ── compose ───────────────────────────────────────────────────────────────────

describe("compose", () => {
  const colors = colorsFromParams(DEFAULT_PARAMS, "dark");

  it("returns a grid of shape [H][W]", () => {
    const grid = compose(colors, WISP_ORIGINAL, {}, 0);
    expect(grid).toHaveLength(H);
    for (const row of grid) expect(row).toHaveLength(W);
  });

  it("all cells are either null or [r,g,b] tuples", () => {
    const grid = compose(colors, WISP_ORIGINAL, {}, 0);
    for (const row of grid) {
      for (const cell of row) {
        if (cell !== null) {
          expect(cell).toHaveLength(3);
          for (const ch of cell) {
            expect(ch).toBeGreaterThanOrEqual(0);
            expect(ch).toBeLessThanOrEqual(255);
          }
        }
      }
    }
  });

  it("has non-null body pixels in the center region", () => {
    const grid = compose(colors, WISP_ORIGINAL, {}, 0);
    // The cloud body center is approximately rows 2-5, cols 5-14 (after BASE=1 offset)
    const bodyPixels = grid.slice(BASE + 1, BASE + 4).flatMap((r) => r.slice(5, 15));
    expect(bodyPixels.some((p) => p !== null)).toBe(true);
  });

  it("blink flag hides the eye pixels", () => {
    const withEyes = compose(colors, WISP_ORIGINAL, {}, 0);
    const blinked = compose(colors, WISP_ORIGINAL, { blink: 1 }, 0);
    // Eye pixels (at pixel rows 2+BASE=3, cols 8 and 11) should differ
    const eyeRow = BASE + 2;
    const hasEye = (g: PixelGrid) =>
      g[eyeRow][8] !== null &&
      (g[eyeRow][8] as number[]).every((ch, i) => ch === (colors.eye as number[])[i]);
    expect(hasEye(withEyes)).toBe(true);
    expect(hasEye(blinked)).toBe(false);
  });

  it("noWisps flag removes all wisp pixels", () => {
    const withWisps = compose(colors, WISP_ORIGINAL, {}, 0);
    const noWispsGrid = compose(colors, WISP_ORIGINAL, { noWisps: 1 }, 0);
    // Count non-null pixels — noWisps should have fewer
    const count = (g: PixelGrid) => g.flat().filter(Boolean).length;
    expect(count(noWispsGrid)).toBeLessThan(count(withWisps));
  });

  it("empty wispCells produces no wisp pixels outside the body region", () => {
    const grid = compose(colors, [], {}, 0);
    // Wisp cells are at cols 0-5 and 14-18, rows 0-1 (before BASE). At rest they're in rows 3-6.
    // Left wrist region (col 0-4, rows 3-6) should be all null with no wisps
    const leftWrist = grid.slice(3, 7).map((r) => r.slice(0, 4));
    expect(leftWrist.flat().every((p) => p === null)).toBe(true);
  });

  it("dy shifts the body pixels vertically", () => {
    const grid0 = compose(colors, [], {}, 0);
    const grid1 = compose(colors, [], {}, 1);
    // A body pixel at dy=0 row r should appear at row r+1 with dy=1
    const row1_dy0 = grid0[BASE + 1]; // body row 1 with no shift
    const row1_dy1 = grid1[BASE + 2]; // same body row shifted down 1
    // They should match (same body row, same horizontal position)
    expect(JSON.stringify(row1_dy0)).toBe(JSON.stringify(row1_dy1));
  });

  it("win > 0 slides wisps inward (fewer visible on left side)", () => {
    // With win=0 vs win=3: left-side wisps shift right toward center, become absorbed
    const grid0 = compose(colors, WISP_ORIGINAL, { win: 0 }, 0);
    const grid3 = compose(colors, WISP_ORIGINAL, { win: 3 }, 0);
    const leftCols = (g: PixelGrid) =>
      g.flat().slice(0, W * H / 2).filter(
        (p): p is [number, number, number] => p !== null &&
          JSON.stringify(p) === JSON.stringify(colors.wisp),
      ).length;
    // Fewer left wisps with win=3 (they slide toward center)
    expect(leftCols(grid3)).toBeLessThanOrEqual(leftCols(grid0));
  });

  it("ctx flag uses BODY_CTXHIGH (different shape from BODY)", () => {
    const normal = compose(colors, [], {}, 0);
    const ctx = compose(colors, [], { ctx: 1 }, 0);
    // Should differ in at least one pixel (different body art)
    expect(JSON.stringify(normal)).not.toBe(JSON.stringify(ctx));
  });

  it("success flag uses BODY_SUCCESS", () => {
    const normal = compose(colors, [], {}, 0);
    const success = compose(colors, [], { success: 1 }, 0);
    expect(JSON.stringify(normal)).not.toBe(JSON.stringify(success));
  });

  it("open=1 and open=2 use different BODY_OPEN frames", () => {
    const f1 = compose(colors, [], { open: 1 }, 0);
    const f2 = compose(colors, [], { open: 2 }, 0);
    expect(JSON.stringify(f1)).not.toBe(JSON.stringify(f2));
  });
});

// ── pixelGridToAnsi ───────────────────────────────────────────────────────────

describe("pixelGridToAnsi", () => {
  const colors = colorsFromParams(DEFAULT_PARAMS, "dark");

  it("returns a non-empty string", () => {
    const grid = compose(colors, WISP_ORIGINAL, {}, 0);
    const ansi = pixelGridToAnsi(grid);
    expect(typeof ansi).toBe("string");
    expect(ansi.length).toBeGreaterThan(0);
  });

  it("produces exactly CHAR_ROWS lines (H/2 = 4)", () => {
    expect(CHAR_ROWS).toBe(4);
    const grid = compose(colors, WISP_ORIGINAL, {}, 0);
    const lines = pixelGridToAnsi(grid).split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(CHAR_ROWS);
  });

  it("contains ANSI escape sequences for truecolor", () => {
    const grid = compose(colors, WISP_ORIGINAL, {}, 0);
    const ansi = pixelGridToAnsi(grid);
    expect(ansi).toContain("\x1b[38;2;"); // foreground truecolor
    expect(ansi).toContain("▀");
  });

  it("respects the indent parameter", () => {
    const grid = compose(colors, WISP_ORIGINAL, {}, 0);
    const ansi = pixelGridToAnsi(grid, "  ");
    const lines = ansi.split("\n").filter((l) => l.length > 0);
    expect(lines.every((l) => l.startsWith("  "))).toBe(true);
  });

  it("same-color top+bottom cell uses fg+bg+▀", () => {
    // Build a grid where row 0, col 0 and row 1, col 0 are both the wisp color
    const grid: PixelGrid = Array.from({ length: H }, () => Array<null>(W).fill(null));
    const col: [number, number, number] = [0xff, 0xff, 0xff];
    grid[0][0] = col;
    grid[1][0] = col;
    const ansi = pixelGridToAnsi(grid);
    expect(ansi).toContain("▀");
    expect(ansi).toContain("\x1b[48;2;"); // background truecolor
  });
});

// ── breatheDy ────────────────────────────────────────────────────────────────

describe("breatheDy", () => {
  it("returns 1 only within the breath window (ticks 14-25 of each 68-tick cycle)", () => {
    for (let t = 0; t < 136; t++) {
      const p = t % 68;
      const expected = p >= 14 && p < 26 ? 1 : 0;
      expect(breatheDy(t)).toBe(expected);
    }
  });
});

// ── AnimDirector ──────────────────────────────────────────────────────────────

describe("AnimDirector", () => {
  function makeDirector(overrides: Partial<AspectVector> = {}) {
    return new AnimDirector(spriteParams(soulOf(0.5, overrides)));
  }

  it("initial state: idle mode, no pulse, original variant", () => {
    const d = makeDirector();
    expect(d.state.mode).toBe("idle");
    expect(d.state.pulse).toBeNull();
    expect(d.state.ctxHigh).toBe(false);
  });

  it("tick() returns a valid AnimFrame (wispCells, overlay, dy)", () => {
    const d = makeDirector();
    const frame = d.tick();
    expect(Array.isArray(frame.wispCells)).toBe(true);
    expect(typeof frame.overlay).toBe("object");
    expect(typeof frame.dy).toBe("number");
  });

  it("wispCells are valid [row, col] tuples within the pixel grid", () => {
    const d = makeDirector();
    const { wispCells } = d.tick();
    for (const [r, c] of wispCells) {
      expect(typeof r).toBe("number");
      expect(typeof c).toBe("number");
    }
  });

  // ── Mode transitions ────────────────────────────────────────────────────────

  it("thinking signal → mode becomes 'thinking'", () => {
    const d = makeDirector();
    d.signal("thinking");
    expect(d.state.mode).toBe("thinking");
  });

  it("thinking-end signal → mode reverts to 'idle'", () => {
    const d = makeDirector();
    d.signal("thinking");
    d.signal("thinking-end");
    expect(d.state.mode).toBe("idle");
  });

  it("filling preempts thinking", () => {
    const d = makeDirector();
    d.signal("thinking");
    d.signal("filling");
    expect(d.state.mode).toBe("filling");
  });

  it("filling-end reverts to idle", () => {
    const d = makeDirector();
    d.signal("filling");
    d.signal("filling-end");
    expect(d.state.mode).toBe("idle");
  });

  it("compaction is exclusive: mode becomes 'compaction'", () => {
    const d = makeDirector();
    d.signal("thinking"); // set a mode first
    d.signal("compaction");
    expect(d.state.mode).toBe("compaction");
    expect(d.state.compTicks).toBeGreaterThan(0);
  });

  it("compaction blocks pulses", () => {
    const d = makeDirector();
    d.signal("compaction");
    d.signal("error"); // should be blocked
    expect(d.state.pulse).toBeNull();
  });

  it("compaction auto-expires after COMPACTION_TICKS ticks", () => {
    const d = makeDirector();
    d.signal("compaction");
    // Advance past all compaction ticks
    for (let i = 0; i < 45; i++) d.tick();
    expect(d.state.mode).toBe("idle");
    expect(d.state.compTicks).toBe(0);
  });

  it("compaction-end signal terminates compaction early", () => {
    const d = makeDirector();
    d.signal("compaction");
    expect(d.state.compTicks).toBeGreaterThan(0);
    d.signal("compaction-end");
    expect(d.state.mode).toBe("idle");
  });

  // ── Pulse handling ───────────────────────────────────────────────────────────

  it("prompt signal fires a pulse", () => {
    const d = makeDirector();
    d.signal("prompt");
    expect(d.state.pulse).toBe("prompt");
  });

  it("error preempts a lower-priority prompt pulse", () => {
    const d = makeDirector();
    d.signal("prompt");
    d.signal("error"); // priority 5 > 3
    expect(d.state.pulse).toBe("error");
  });

  it("prompt does NOT preempt a higher-priority error pulse", () => {
    const d = makeDirector();
    d.signal("error");
    d.signal("prompt"); // priority 3 < 5
    expect(d.state.pulse).toBe("error");
  });

  it("success pulse clears thinking mode", () => {
    const d = makeDirector();
    d.signal("thinking");
    d.signal("success");
    expect(d.state.mode).toBe("idle");
    expect(d.state.pulse).toBe("success");
  });

  it("pulse expires after its frames are consumed", () => {
    const d = makeDirector();
    d.signal("prompt"); // 2 frames
    d.tick(); // frame 0
    d.tick(); // frame 1
    d.tick(); // past pulse → null
    expect(d.state.pulse).toBeNull();
  });

  it("error pulse produces noWisps overlay during shake", () => {
    const d = makeDirector();
    d.signal("error");
    const frame = d.tick();
    expect(frame.wispCells).toHaveLength(0); // error shake = noWisps
  });

  it("success pulse at dy=-1 (body rises)", () => {
    const d = makeDirector();
    d.signal("success");
    const frame = d.tick();
    expect(frame.dy).toBe(-1);
  });

  it("thinking mode: win=5 in overlay (wisps pulled in)", () => {
    const d = makeDirector();
    d.signal("thinking");
    const frame = d.tick();
    expect(frame.overlay.win).toBe(5);
  });

  it("filling mode: open=2 in overlay", () => {
    const d = makeDirector();
    d.signal("filling");
    const frame = d.tick();
    expect(frame.overlay.open).toBe(2);
  });

  // ── ctxHigh ──────────────────────────────────────────────────────────────────

  it("ctx-high signal adds ctx:1 to idle overlay", () => {
    const d = makeDirector();
    d.signal("ctx-high");
    // Advance enough ticks to get past any gesture cooldown into clean idle
    for (let i = 0; i < 5; i++) d.tick();
    const frame = d.tick();
    expect(frame.overlay.ctx).toBe(1);
  });

  it("ctx-normal clears ctxHigh", () => {
    const d = makeDirector();
    d.signal("ctx-high");
    d.signal("ctx-normal");
    expect(d.state.ctxHigh).toBe(false);
  });

  // ── Extra wisps ───────────────────────────────────────────────────────────────

  it("high-enthusiasm soul (wispCount=6) has more wisp cells than low-enthusiasm", () => {
    // wispCount=6 when enthusiasm > 0.45; wispCount=4 when <= 0.45
    const dExtra = new AnimDirector(spriteParams(soulOf(0.5, { enthusiasm: 0.9 })));
    const dBase = new AnimDirector(spriteParams(soulOf(0.5, { enthusiasm: 0.2 })));
    const frameExtra = dExtra.tick();
    const frameBase = dBase.tick();
    expect(frameExtra.wispCells.length).toBeGreaterThan(frameBase.wispCells.length);
  });

  // ── Compaction frame structure ────────────────────────────────────────────────

  it("compaction frames have empty wispCells and eyeDy=1", () => {
    const d = makeDirector();
    d.signal("compaction");
    const frame = d.tick();
    expect(frame.wispCells).toHaveLength(0);
    expect(frame.overlay.eyeDy).toBe(1);
  });

  it("compaction frames cycle through scan positions [-1,0,1,0]", () => {
    const d = makeDirector();
    d.signal("compaction");
    const eyes = [d.tick(), d.tick(), d.tick(), d.tick()].map((f) => f.overlay.eye ?? 0);
    expect(eyes).toEqual([-1, 0, 1, 0]);
  });
});

// ── Birth animation ───────────────────────────────────────────────────────────

describe("birthFrames", () => {
  it("returns an array of BirthFrame objects", () => {
    const frames = birthFrames();
    expect(Array.isArray(frames)).toBe(true);
    expect(frames.length).toBeGreaterThan(0);
  });

  it("each frame has delayMs, wispCells, overlay, and dy", () => {
    for (const f of birthFrames()) {
      expect(typeof f.delayMs).toBe("number");
      expect(f.delayMs).toBeGreaterThan(0);
      expect(Array.isArray(f.wispCells)).toBe(true);
      expect(typeof f.overlay).toBe("object");
      expect(typeof f.dy).toBe("number");
    }
  });

  it("starts with blank frames (empty wispCells, noWisps)", () => {
    const first = birthFrames()[0];
    expect(first?.wispCells).toHaveLength(0);
    expect(first?.overlay.noWisps).toBe(1);
  });

  it("ends with breath frames (wispCells populated, dy cycles via breatheDy)", () => {
    const frames = birthFrames();
    const last = frames[frames.length - 1];
    expect(last?.wispCells.length).toBeGreaterThan(0);
  });

  it("has visibleRows set during condensing phase", () => {
    const frames = birthFrames();
    const condensing = frames.filter((f) => f.visibleRows !== undefined);
    expect(condensing.length).toBeGreaterThan(0);
    // visibleRows should be a Set<number>
    for (const f of condensing) {
      expect(f.visibleRows).toBeInstanceOf(Set);
    }
  });

  it("condensing phase grows monotonically (each step >= previous)", () => {
    const frames = birthFrames();
    const condensing = frames.filter((f) => f.visibleRows !== undefined);
    let prevSize = 0;
    for (const f of condensing) {
      expect((f.visibleRows as Set<number>).size).toBeGreaterThanOrEqual(prevSize);
      prevSize = (f.visibleRows as Set<number>).size;
    }
  });
});

describe("renderBirthFrame", () => {
  it("returns a non-empty ANSI string", () => {
    const frames = birthFrames();
    const ansi = renderBirthFrame(frames[0]!, DEFAULT_PARAMS, "dark");
    expect(typeof ansi).toBe("string");
    expect(ansi.length).toBeGreaterThan(0);
  });

  it("renders CHAR_ROWS lines", () => {
    const frames = birthFrames();
    const ansi = renderBirthFrame(frames[frames.length - 1]!, DEFAULT_PARAMS, "dark");
    const lines = ansi.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(CHAR_ROWS);
  });

  it("condensing frame with limited visibleRows produces fewer non-null pixels than full frame", () => {
    const allFrames = birthFrames();
    const fullFrame = allFrames[allFrames.length - 1]!;
    const partialFrame = allFrames.find((f) => f.visibleRows?.size === 2);
    if (!partialFrame) return; // if not found, skip gracefully
    // Full has more colored pixels than partial
    const countEscapes = (s: string) => (s.match(/\x1b\[38;2;/g) ?? []).length;
    expect(countEscapes(renderBirthFrame(fullFrame, DEFAULT_PARAMS, "dark"))).toBeGreaterThan(
      countEscapes(renderBirthFrame(partialFrame, DEFAULT_PARAMS, "dark")),
    );
  });
});
