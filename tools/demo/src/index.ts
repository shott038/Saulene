/**
 * @saulene/demo — watch a whole ul lifetime, top to bottom, in seconds.
 *
 * Usage:
 *   pnpm demo [--seed N] [--mode aligned|mismatched|both] [--fast]
 *
 * Deterministic + offline: no LLM, no API key, no clock. Same seed → same life.
 */

import { ASPECTS, type Aspect, type Soul, type Stage, projectMbti } from "@saulene/core";
import { render, spriteParams } from "@saulene/renderer";
import {
  type BreakEvent,
  type Trajectory,
  type TrajectorySnapshot,
  block,
  describeBirth,
  entropyFromInt,
  lifetime,
  narrate,
  script,
} from "@saulene/simulator";

// ── CLI args ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function argVal(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const SEED = Number.parseInt(argVal("--seed") ?? "42", 10);
const MODE = (argVal("--mode") ?? "both") as "aligned" | "mismatched" | "both";
const FAST = argv.includes("--fast");

const DELAY_BEAT = FAST ? 0 : 120;
const DELAY_STAGE = FAST ? 0 : 400;

// ── Terminal rasterizer (ported from scripts/ul-geometry.mjs + ul-terminal.mjs) ──

type RGB = { r: number; g: number; b: number };
type Grid = { w: number; h: number; px: (RGB | null)[][] };

// Geometry constants (locked ul shape — from scripts/ul-geometry.mjs)
const WISPS: readonly [number, number, number][] = [
  [66, 80, 100],
  [46, 64, 112],
  [62, 76, 124],
  [220, 234, 100],
  [236, 254, 112],
  [224, 238, 124],
];
const INK: readonly [number, number, number][] = [
  [150, 100, 31],
  [110, 102, 20],
  [126, 86, 24],
  [150, 74, 25],
  [174, 86, 24],
  [190, 102, 20],
  [126, 116, 24],
  [150, 128, 30],
  [174, 116, 24],
];
const BODY: readonly [number, number, number][] = [
  [150, 100, 26],
  [110, 102, 15],
  [126, 86, 19],
  [150, 74, 25],
  [174, 86, 19],
  [190, 102, 15],
  [126, 116, 19],
  [150, 128, 25],
  [174, 116, 19],
];
const EYES: readonly [number, number][] = [
  [143, 108],
  [157, 108],
];

// Crop window around the cloud (matches ul-terminal.mjs)
const X0 = 58;
const X1 = 242;
const Y0 = 40;
const Y1 = 162;

function hslRgb(h: number, s: number, l: number): RGB {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255),
  };
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function inAny(circles: readonly [number, number, number][], sx: number, sy: number): boolean {
  return circles.some(([cx, cy, r]) => (sx - cx) ** 2 + (sy - cy) ** 2 <= r * r);
}

function nearWisp(sx: number, sy: number, tol: number): boolean {
  return WISPS.some(([x1, x2, y]) => Math.abs(sy - y) <= tol && sx >= x1 - tol && sx <= x2 + tol);
}

function rasterize(palRgb: RGB, cols: number): Grid {
  const ps = (X1 - X0) / cols;
  const rows = Math.round((Y1 - Y0) / ps);
  const er = ps * 0.6 + 1.6;
  const INKC: RGB = { r: 22, g: 19, b: 16 };

  const px: (RGB | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    const sy = Y0 + (r + 0.5) * ps;
    const line: (RGB | null)[] = [];
    for (let c = 0; c < cols; c++) {
      const sx = X0 + (c + 0.5) * ps;
      let col: RGB | null = null;
      if (EYES.some(([ex, ey]) => (sx - ex) ** 2 + (sy - ey) ** 2 <= er * er)) col = INKC;
      else if (inAny(BODY, sx, sy)) col = palRgb;
      else if (inAny(INK, sx, sy)) col = INKC;
      else if (nearWisp(sx, sy, ps * 0.5)) col = INKC;
      line.push(col);
    }
    px.push(line);
  }
  return { w: cols, h: rows, px };
}

const ESC_RESET = "\x1b[0m";

function toAnsi(grid: Grid, indent = ""): string {
  const { w, h, px } = grid;
  let out = "";
  for (let r = 0; r < h; r += 2) {
    out += indent;
    for (let c = 0; c < w; c++) {
      const top = px[r]?.[c] ?? null;
      const bot = r + 1 < h ? (px[r + 1]?.[c] ?? null) : null;
      if (!top && !bot) {
        out += " ";
      } else if (top && bot) {
        out += `\x1b[38;2;${top.r};${top.g};${top.b}m\x1b[48;2;${bot.r};${bot.g};${bot.b}m▀${ESC_RESET}`;
      } else if (top) {
        out += `\x1b[38;2;${top.r};${top.g};${top.b}m▀${ESC_RESET}`;
      } else if (bot) {
        out += `\x1b[38;2;${bot.r};${bot.g};${bot.b}m▄${ESC_RESET}`;
      }
    }
    out += "\n";
  }
  return out;
}

// Cols for each stage — grows as the ul matures, shrinks slightly in old age
const STAGE_COLS: Record<Stage, number> = {
  childhood: 16,
  adolescence: 22,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  early_adulthood: 28,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  old_adulthood: 24,
} satisfies Record<Stage, number>;

function renderSprite(soul: Soul, indent = "  "): string {
  const sp = spriteParams(soul);
  const palRgb = hslRgb(sp.hue, sp.saturation, sp.lightness);
  // Slightly dim in old age
  const pal =
    sp.stage === "old_adulthood" ? mixRgb(palRgb, { r: 180, g: 180, b: 180 }, 0.22) : palRgb;
  const cols = STAGE_COLS[sp.stage];
  return toAnsi(rasterize(pal, cols), indent);
}

// ── Pretty printing ───────────────────────────────────────────────────────────

const W = 60;
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const MAGENTA = "\x1b[35m";

function hr(char = "─", width = W): string {
  return char.repeat(width);
}

function banner(text: string): void {
  const pad = Math.max(0, Math.floor((W - text.length - 2) / 2));
  const lp = " ".repeat(pad);
  const rp = " ".repeat(W - text.length - 2 - pad);
  process.stdout.write(
    `\n${BOLD}╔${hr("═")}╗\n║${lp} ${text} ${rp}║\n╚${hr("═")}╝${ESC_RESET}\n\n`,
  );
}

function stageBanner(stage: Stage, sessionRange: string): void {
  const labels: Record<Stage, string> = {
    childhood: "CHILDHOOD",
    adolescence: "ADOLESCENCE",
    // eslint-disable-next-line @typescript-eslint/naming-convention
    early_adulthood: "EARLY ADULTHOOD",
    // eslint-disable-next-line @typescript-eslint/naming-convention
    old_adulthood: "OLD ADULTHOOD",
  } satisfies Record<Stage, string>;
  const label = labels[stage];
  const suffix = ` · sessions ${sessionRange}`;
  const fill = Math.max(2, W - label.length - suffix.length - 4);
  process.stdout.write(`\n${CYAN}${BOLD}── ${label}${suffix} ${"─".repeat(fill)}${ESC_RESET}\n`);
}

function f2(x: number): string {
  return x.toFixed(2);
}

function bar(v: number, width = 10): string {
  const filled = Math.round(v * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  return new Promise((r) => setTimeout(r, ms));
}

function printAspectVector(v: Record<Aspect, number>, highlight: readonly Aspect[] = []): void {
  const sorted = [...ASPECTS].sort((a, b) => v[b] - v[a]);
  for (const a of sorted) {
    const val = v[a];
    const hi = highlight.includes(a);
    const color = hi ? YELLOW : DIM;
    process.stdout.write(`  ${color}${a.padEnd(16)}${bar(val, 12)} ${f2(val)}${ESC_RESET}\n`);
  }
}

function wrapText(text: string, maxLen: number): string[] {
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine.trim() === "") {
      out.push("");
      continue;
    }
    const words = rawLine.split(" ");
    let cur = "";
    for (const w of words) {
      if (cur.length + w.length + (cur ? 1 : 0) > maxLen) {
        if (cur) out.push(cur);
        cur = w;
      } else {
        cur = cur ? `${cur} ${w}` : w;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

function printVoiceBlock(soul: Soul): void {
  const { text } = render(soul);
  const INNER = W - 6; // inner content width
  const excerpt = text.slice(0, 480);
  const lines = wrapText(excerpt, INNER);
  if (excerpt.length < text.length) lines.push("…");

  process.stdout.write(`  ${DIM}┌${"─".repeat(W - 4)}┐${ESC_RESET}\n`);
  for (const l of lines) {
    process.stdout.write(`  ${DIM}│${ESC_RESET} ${l.padEnd(INNER)} ${DIM}│${ESC_RESET}\n`);
  }
  process.stdout.write(`  ${DIM}└${"─".repeat(W - 4)}┘${ESC_RESET}\n`);
}

// ── Script generation ─────────────────────────────────────────────────────────

// Sessions needed to cross each stage band with some cushion:
//   MP_STEP_CAP = 3 (sig=1.0 → 3 MP/session)
//   childhood ends ~100 MP   → 34 sessions
//   adolescence ends ~250 MP → 50 sessions
//   early_adulthood ends ~500 MP → 84 sessions
//   old_adulthood: +40 sessions for a full arc
const CHILDHOOD_SESSIONS = 35;
const ADOLESCENCE_SESSIONS = 52;
const ADULT_SESSIONS = 86;
const OLD_SESSIONS = 40;

function buildScript(birth: Soul, mode: "aligned" | "mismatched"): ReturnType<typeof script> {
  // Sort aspects by birth disposition
  const sorted = [...ASPECTS].sort((a, b) => birth.v[b] - birth.v[a]);
  const top3 = sorted.slice(0, 3) as Aspect[];
  const bottom3 = sorted.slice(-3) as Aspect[];

  const aspects = mode === "aligned" ? top3 : bottom3;
  const fit = mode === "aligned" ? 0.8 : -0.75;

  return script(
    // Childhood: lower significance, exploratory
    block({ aspects, practice: 0.6, fit: fit * 0.7, significance: 0.9, count: CHILDHOOD_SESSIONS }),
    // Adolescence: ramping up, peak tension
    block({ aspects, practice: 0.85, fit, significance: 0.95, count: ADOLESCENCE_SESSIONS }),
    // Early adulthood: heavy grind or deep alignment
    block({ aspects, practice: 0.95, fit, significance: 1.0, count: ADULT_SESSIONS }),
    // Old age: settling, still consistent
    block({ aspects, practice: 0.7, fit: fit * 0.9, significance: 0.85, count: OLD_SESSIONS }),
  );
}

// ── Stage checkpoint rendering ────────────────────────────────────────────────

function soulAtSnapshot(birth: Soul, snap: TrajectorySnapshot): Soul {
  return { ...birth, v: snap.v, mp: snap.mp };
}

function printCheckpoint(
  snap: TrajectorySnapshot,
  birth: Soul,
  prevV: Record<Aspect, number> | null,
): void {
  const soul = soulAtSnapshot(birth, snap);
  const sp = spriteParams(soul);

  // Sprite
  process.stdout.write(renderSprite(soul));

  // MBTI + MP
  const mbti = snap.mbti;
  const stageLabel = snap.stage.replace("_", " ");
  process.stdout.write(
    `  ${BOLD}${mbti}${ESC_RESET}  ${DIM}${stageLabel} · MP ${snap.mp.toFixed(0)} · hue ${sp.hue.toFixed(0)}°${ESC_RESET}\n`,
  );

  // Top 3 most-moved aspects vs birth (or vs previous checkpoint)
  if (prevV) {
    const diffs = ASPECTS.map((a) => ({ a, d: Math.abs(snap.v[a] - (prevV[a] ?? 0)) }))
      .filter((x) => x.d > 0.005)
      .sort((x, y) => y.d - x.d)
      .slice(0, 5);
    if (diffs.length > 0) {
      process.stdout.write(`  ${DIM}drift since last stage:${ESC_RESET}\n`);
      for (const { a } of diffs) {
        const delta = snap.v[a] - (prevV[a] ?? 0);
        const dir = delta > 0 ? `${GREEN}▲` : `${RED}▼`;
        const sign = delta > 0 ? "+" : "";
        process.stdout.write(
          `    ${dir}${ESC_RESET} ${a.padEnd(16)} ${f2(prevV[a] ?? 0)} → ${f2(snap.v[a])}  (${sign}${f2(delta)})\n`,
        );
      }
    }
  }

  // Voice block
  process.stdout.write(`\n  ${DIM}voice floor:${ESC_RESET}\n`);
  printVoiceBlock(soul);
}

function printBreak(br: BreakEvent): void {
  process.stdout.write(
    `\n  ${BOLD}${YELLOW}⚡ RUPTURE${ESC_RESET}  ` +
      `${br.aspect}  tension ${f2(br.tensionAtBreak)}  ` +
      `v ${f2(br.vBefore)} → ${f2(br.vAfter)}  ` +
      `s ${f2(br.sBefore)} → ${f2(br.sAfter)}  ` +
      `(${br.stage.replace("_", " ")})\n`,
  );
}

// ── Main demo runner ──────────────────────────────────────────────────────────

async function runLife(
  mode: "aligned" | "mismatched",
  label: string,
  birth: Soul,
  traj: Trajectory,
): Promise<void> {
  banner(`${label} · ${mode} · seed ${SEED}`);

  // Birth readout
  process.stdout.write(`${BOLD}BIRTH${ESC_RESET}\n`);
  process.stdout.write(`  ${describeBirth(birth)}\n\n`);
  process.stdout.write(renderSprite(birth));
  process.stdout.write(`\n  ${DIM}birth aspects:${ESC_RESET}\n`);

  // Highlight the aspects this life will exercise
  const sorted = [...ASPECTS].sort((a, b) => birth.v[b] - birth.v[a]);
  const highlight =
    mode === "aligned" ? (sorted.slice(0, 3) as Aspect[]) : (sorted.slice(-3) as Aspect[]);
  printAspectVector(birth.v, highlight);
  process.stdout.write(
    `\n  ${DIM}${mode === "aligned" ? "This life reinforces" : "This life grinds against"} ` +
      `${highlight.join(", ")}${ESC_RESET}\n`,
  );

  process.stdout.write(`\n  ${DIM}voice floor at birth:${ESC_RESET}\n`);
  printVoiceBlock(birth);

  await sleep(DELAY_STAGE);

  // Pre-compute stage boundaries for accurate session-range labels
  const stageBoundaries = new Map<Stage, { first: number; last: number }>();
  for (const snap of traj.snapshots) {
    const b = stageBoundaries.get(snap.stage);
    if (!b) stageBoundaries.set(snap.stage, { first: snap.session + 1, last: snap.session + 1 });
    else b.last = snap.session + 1;
  }
  const rangeLabel = (stage: Stage): string => {
    const b = stageBoundaries.get(stage);
    return b ? `${b.first}–${b.last}` : "?";
  };

  // Walk the trajectory, printing stage banners and checkpoints
  let currentStage: Stage = "childhood";
  let prevCheckpointV: Record<Aspect, number> | null = birth.v;
  let stageFirstSnap: TrajectorySnapshot | null = null;

  const breaksBySession = new Map<number, BreakEvent[]>();
  for (const br of traj.breaks) {
    const list = breaksBySession.get(br.session) ?? [];
    list.push(br);
    breaksBySession.set(br.session, list);
  }

  stageBanner("childhood", rangeLabel("childhood"));
  stageFirstSnap = null;

  for (const snap of traj.snapshots) {
    // Print any breaks for this session
    const sessionBreaks = breaksBySession.get(snap.session) ?? [];
    for (const br of sessionBreaks) {
      await sleep(DELAY_BEAT);
      printBreak(br);
    }

    if (snap.stage !== currentStage) {
      // Closing previous stage: print checkpoint at the last snapshot of the old stage
      if (stageFirstSnap !== null) {
        process.stdout.write("\n");
        printCheckpoint(stageFirstSnap, birth, prevCheckpointV);
        prevCheckpointV = { ...stageFirstSnap.v };
      }

      await sleep(DELAY_STAGE);

      stageBanner(snap.stage, rangeLabel(snap.stage));
      currentStage = snap.stage;
      stageFirstSnap = snap;
    } else if (stageFirstSnap === null) {
      stageFirstSnap = snap;
    } else {
      stageFirstSnap = snap;
    }
  }

  // Final stage checkpoint
  if (stageFirstSnap !== null) {
    process.stdout.write("\n");
    printCheckpoint(stageFirstSnap, birth, prevCheckpointV);
  }

  await sleep(DELAY_STAGE);

  // Neglect-death
  process.stdout.write(`\n${BOLD}${RED}── NEGLECT-DEATH ${"─".repeat(W - 18)}${ESC_RESET}\n`);
  await sleep(DELAY_BEAT * 2);
  process.stdout.write("\n  91 days of silence.\n");
  await sleep(DELAY_BEAT);
  process.stdout.write("  The ul stops responding. The cloud disperses.\n");
  await sleep(DELAY_BEAT);
  process.stdout.write(`  ${DIM}Set points, drift, ruptures — all of it fades.${ESC_RESET}\n`);
  await sleep(DELAY_BEAT);
  process.stdout.write(
    `  Final MBTI: ${BOLD}${traj.final ? projectMbti(traj.final.v) : "unknown"}${ESC_RESET}` +
      `  Born: ${BOLD}${projectMbti(birth.v)}${ESC_RESET}` +
      `  ${birth.v !== traj.final.v && projectMbti(birth.v) !== projectMbti(traj.final.v) ? `${YELLOW}identity shifted${ESC_RESET}` : `${GREEN}identity held${ESC_RESET}`}\n`,
  );
  await sleep(DELAY_BEAT);
  process.stdout.write(
    `  Breaks: ${traj.breaks.length}  ` +
      `Sessions: ${traj.snapshots.length}  ` +
      `Final MP: ${traj.final.mp.toFixed(0)}\n`,
  );

  // Narration
  await sleep(DELAY_STAGE);
  process.stdout.write(`\n${BOLD}── NARRATION ${"─".repeat(W - 14)}${ESC_RESET}\n\n`);

  const contested = [...ASPECTS]
    .sort((a, b) => Math.abs(traj.final.v[b] - birth.v[b]) - Math.abs(traj.final.v[a] - birth.v[a]))
    .slice(0, 5) as Aspect[];

  const narration = narrate(traj, { title: `${mode} life`, contested });
  for (const line of narration.split("\n")) {
    process.stdout.write(`${line}\n`);
    await sleep(DELAY_BEAT / 3);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const entropy = entropyFromInt(SEED);

  // Build one "aligned" birth to use for both (same seed → same birth)
  const alignedScript = buildScript({ v: {} } as Soul, "aligned");

  // We need to run lifetime to get the birth soul first, so we do a dry-run
  const dryTraj = lifetime(entropy, []);
  const birth = dryTraj.birth;

  const modes: Array<"aligned" | "mismatched"> =
    MODE === "both" ? ["aligned", "mismatched"] : [MODE];

  for (const mode of modes) {
    const sc = buildScript(birth, mode);
    const traj = lifetime(entropy, sc);
    const label = "UL LIFECYCLE DEMO";
    await runLife(mode, label, birth, traj);

    if (MODE === "both" && mode === "aligned") {
      process.stdout.write(`\n${MAGENTA}${"═".repeat(W)}${ESC_RESET}\n`);
      process.stdout.write(
        `${MAGENTA}  same seed, different grind — watch the divergence${ESC_RESET}\n`,
      );
      process.stdout.write(`${MAGENTA}${"═".repeat(W)}${ESC_RESET}\n`);
      await sleep(DELAY_STAGE * 1.5);
    }
  }

  // Comparison summary when running both
  if (MODE === "both") {
    process.stdout.write(`\n${BOLD}${"═".repeat(W)}${ESC_RESET}\n`);
    process.stdout.write(`${BOLD}  DIVERGENCE SUMMARY · seed ${SEED}${ESC_RESET}\n`);
    process.stdout.write(`${BOLD}${"═".repeat(W)}${ESC_RESET}\n\n`);

    const alignedT = lifetime(entropy, buildScript(birth, "aligned"));
    const mismatchedT = lifetime(entropy, buildScript(birth, "mismatched"));

    process.stdout.write(
      `  Born:        ${BOLD}${projectMbti(birth.v)}${ESC_RESET}  (${birth.sex}, ${birth.stubbornness < 0.5 ? "clay" : "stubborn"})\n`,
    );
    process.stdout.write(
      `  Aligned:     ${BOLD}${GREEN}${projectMbti(alignedT.final.v)}${ESC_RESET}  (${alignedT.breaks.length} ruptures)\n`,
    );
    process.stdout.write(
      `  Mismatched:  ${BOLD}${RED}${projectMbti(mismatchedT.final.v)}${ESC_RESET}  (${mismatchedT.breaks.length} ruptures)\n`,
    );
    process.stdout.write("\n  Most-drifted aspects:\n");

    for (const a of ASPECTS) {
      const alDelta = alignedT.final.v[a] - birth.v[a];
      const msDelta = mismatchedT.final.v[a] - birth.v[a];
      if (Math.abs(alDelta - msDelta) > 0.04) {
        const alDir = alDelta > 0 ? `${GREEN}▲` : `${RED}▼`;
        const msDir = msDelta > 0 ? `${GREEN}▲` : `${RED}▼`;
        process.stdout.write(
          `    ${a.padEnd(16)} aligned ${alDir}${ESC_RESET}${f2(alDelta).padStart(6)}  mismatched ${msDir}${ESC_RESET}${f2(msDelta).padStart(6)}\n`,
        );
      }
    }

    process.stdout.write("\n");
  }
}

main().catch((e) => {
  process.stderr.write(`demo error: ${String(e)}\n`);
  process.exit(1);
});
