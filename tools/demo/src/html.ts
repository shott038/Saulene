/**
 * @saulene/demo — HTML lifecycle visualizer
 *
 * Generates a self-contained HTML page visualizing a whole ul life:
 *   - Colored cloud sprite at birth + each life stage (watches it morph)
 *   - Aspect-drift chart with rupture markers + stage bands
 *   - Birth/death readouts with MBTI track
 *
 * Prototype of the future gallery's "ul detail page" — sprite→SVG and drift-chart
 * rendering can be lifted to the website later with minimal changes.
 *
 * Usage:
 *   pnpm demo:html [--seed N] [--mode aligned|mismatched|both]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ASPECTS, type Aspect, type Soul, type Stage, projectMbti } from "@saulene/core";
import { spriteParams } from "@saulene/renderer";
import {
  type BreakEvent,
  type Trajectory,
  type TrajectorySnapshot,
  block,
  describeBirth,
  entropyFromInt,
  lifetime,
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

// ── Lifecycle script builder (same as demo/index.ts) ─────────────────────────

const CHILDHOOD_SESSIONS = 35;
const ADOLESCENCE_SESSIONS = 52;
const ADULT_SESSIONS = 86;
const OLD_SESSIONS = 40;

function buildScript(birth: Soul, mode: "aligned" | "mismatched"): ReturnType<typeof script> {
  const sorted = [...ASPECTS].sort((a, b) => birth.v[b] - birth.v[a]);
  const top3 = sorted.slice(0, 3) as Aspect[];
  const bottom3 = sorted.slice(-3) as Aspect[];
  const aspects = mode === "aligned" ? top3 : bottom3;
  const fit = mode === "aligned" ? 0.8 : -0.75;
  return script(
    block({ aspects, practice: 0.6, fit: fit * 0.7, significance: 0.9, count: CHILDHOOD_SESSIONS }),
    block({ aspects, practice: 0.85, fit, significance: 0.95, count: ADOLESCENCE_SESSIONS }),
    block({ aspects, practice: 0.95, fit, significance: 1.0, count: ADULT_SESSIONS }),
    block({ aspects, practice: 0.7, fit: fit * 0.9, significance: 0.85, count: OLD_SESSIONS }),
  );
}

function soulAtSnap(birth: Soul, snap: TrajectorySnapshot): Soul {
  return { ...birth, v: snap.v, mp: snap.mp };
}

// ── Sprite geometry (ported from tools/demo/src/index.ts) ─────────────────────

type RGB = { r: number; g: number; b: number };
type Grid = { w: number; h: number; px: (RGB | null)[][] };

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
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
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

const STAGE_COLS: Record<Stage, number> = {
  childhood: 16,
  adolescence: 22,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  early_adulthood: 28,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  old_adulthood: 24,
} satisfies Record<Stage, number>;

// ── Sprite → inline SVG ───────────────────────────────────────────────────────

function spriteToSvg(soul: Soul, cellPx = 7): string {
  const sp = spriteParams(soul);
  const palRgb = hslRgb(sp.hue, sp.saturation, sp.lightness);
  const pal =
    sp.stage === "old_adulthood" ? mixRgb(palRgb, { r: 160, g: 155, b: 165 }, 0.25) : palRgb;
  const cols = STAGE_COLS[sp.stage];
  const grid = rasterize(pal, cols);
  const w = grid.w * cellPx;
  const h = grid.h * cellPx;
  let rects = "";
  for (let r = 0; r < grid.h; r++) {
    for (let c = 0; c < grid.w; c++) {
      const cell = grid.px[r]?.[c] ?? null;
      if (cell) {
        rects += `<rect x="${c * cellPx}" y="${r * cellPx}" width="${cellPx}" height="${cellPx}" fill="rgb(${cell.r},${cell.g},${cell.b})"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="image-rendering:pixelated;display:block">${rects}</svg>`;
}

// ── Aspect colors + design tokens ────────────────────────────────────────────

const ASPECT_COLORS: Record<Aspect, string> = {
  openness: "#a78bfa",
  intellect: "#60a5fa",
  industriousness: "#34d399",
  orderliness: "#2dd4bf",
  enthusiasm: "#fbbf24",
  assertiveness: "#f97316",
  compassion: "#f472b6",
  politeness: "#86efac",
  withdrawal: "#94a3b8",
  volatility: "#ef4444",
};

const STAGE_COLORS: Record<Stage, string> = {
  childhood: "rgba(96,165,250,0.09)",
  adolescence: "rgba(251,191,36,0.08)",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  early_adulthood: "rgba(52,211,153,0.08)",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  old_adulthood: "rgba(167,139,250,0.09)",
};

const STAGE_LABEL_COLORS: Record<Stage, string> = {
  childhood: "#60a5fa",
  adolescence: "#fbbf24",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  early_adulthood: "#34d399",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  old_adulthood: "#a78bfa",
};

const STAGE_NAMES: Record<Stage, string> = {
  childhood: "Childhood",
  adolescence: "Adolescence",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  early_adulthood: "Early Adulthood",
  // eslint-disable-next-line @typescript-eslint/naming-convention
  old_adulthood: "Old Adulthood",
};

// ── Stage checkpoints from trajectory ────────────────────────────────────────

interface StageCheckpoint {
  label: string;
  stage: Stage;
  snap: TrajectorySnapshot | null; // null = birth
  soul: Soul;
}

function stageCheckpoints(birth: Soul, traj: Trajectory): StageCheckpoint[] {
  const stages: Stage[] = ["childhood", "adolescence", "early_adulthood", "old_adulthood"];
  const lastByStage = new Map<Stage, TrajectorySnapshot>();
  for (const s of traj.snapshots) {
    lastByStage.set(s.stage, s);
  }
  const points: StageCheckpoint[] = [
    { label: "Birth", stage: "childhood", snap: null, soul: birth },
  ];
  for (const stage of stages) {
    const snap = lastByStage.get(stage);
    if (snap) {
      points.push({
        label: STAGE_NAMES[stage],
        stage,
        snap,
        soul: soulAtSnap(birth, snap),
      });
    }
  }
  return points;
}

// ── Aspect drift chart (SVG) ──────────────────────────────────────────────────

function buildDriftChart(birth: Soul, traj: Trajectory): string {
  const SVG_W = 960;
  const SVG_H = 300;
  const ML = 52; // margin left
  const MR = 20; // margin right
  const MT = 20; // margin top
  const MB = 56; // margin bottom (for stage track + MBTI labels)
  const PW = SVG_W - ML - MR; // plot width
  const PH = SVG_H - MT - MB; // plot height

  const allSnaps = traj.snapshots;
  const maxSession = allSnaps.length; // sessions 0-indexed, birth at x=0

  function xOf(session: number): number {
    return ML + (session / maxSession) * PW;
  }
  function yOf(value: number): number {
    return MT + (1 - value) * PH;
  }

  // Stage bounds (in session-space; birth=0, snaps=1..)
  const stageBounds = new Map<Stage, { first: number; last: number }>();
  for (const s of allSnaps) {
    const b = stageBounds.get(s.stage);
    const sess = s.session + 1; // offset by 1 since birth is at 0
    if (!b) stageBounds.set(s.stage, { first: sess, last: sess });
    else b.last = sess;
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">`;

  // Stage bands
  for (const [stage, bounds] of stageBounds) {
    const x1 = xOf(bounds.first - 1);
    const x2 = xOf(bounds.last);
    const color = STAGE_COLORS[stage];
    svg += `<rect x="${x1.toFixed(1)}" y="${MT}" width="${(x2 - x1).toFixed(1)}" height="${PH}" fill="${color}"/>`;
  }

  // Grid lines (y=0.25, 0.5, 0.75)
  for (const v of [0.25, 0.5, 0.75]) {
    const y = yOf(v).toFixed(1);
    svg += `<line x1="${ML}" y1="${y}" x2="${ML + PW}" y2="${y}" stroke="#1e1e2e" stroke-width="1"/>`;
    svg += `<text x="${(ML - 6).toFixed(1)}" y="${(yOf(v) + 4).toFixed(1)}" text-anchor="end" font-family="monospace" font-size="10" fill="#4a4a6a">${v.toFixed(2)}</text>`;
  }
  // y=0 and y=1 labels
  svg += `<text x="${(ML - 6).toFixed(1)}" y="${(MT + 4).toFixed(1)}" text-anchor="end" font-family="monospace" font-size="10" fill="#4a4a6a">1.00</text>`;
  svg += `<text x="${(ML - 6).toFixed(1)}" y="${(MT + PH + 4).toFixed(1)}" text-anchor="end" font-family="monospace" font-size="10" fill="#4a4a6a">0.00</text>`;

  // Aspect lines
  for (const aspect of ASPECTS) {
    const color = ASPECT_COLORS[aspect];
    // Build points: birth at x=0, then each snapshot
    const pts: string[] = [];
    pts.push(`${xOf(0).toFixed(1)},${yOf(birth.v[aspect]).toFixed(1)}`);
    for (const s of allSnaps) {
      pts.push(`${xOf(s.session + 1).toFixed(1)},${yOf(s.v[aspect]).toFixed(1)}`);
    }
    svg += `<polyline points="${pts.join(" ")}" stroke="${color}" stroke-width="1.4" fill="none" opacity="0.85" stroke-linejoin="round"/>`;
  }

  // Rupture markers (vertical dashed lines)
  for (const br of traj.breaks) {
    const x = xOf(br.session + 1);
    const color = ASPECT_COLORS[br.aspect];
    svg += `<line x1="${x.toFixed(1)}" y1="${MT}" x2="${x.toFixed(1)}" y2="${MT + PH}" stroke="${color}" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.7"/>`;
    // Diamond at the break value
    const y = yOf(br.vBefore);
    svg += `<polygon points="${x.toFixed(1)},${(y - 5).toFixed(1)} ${(x + 4).toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${(y + 5).toFixed(1)} ${(x - 4).toFixed(1)},${y.toFixed(1)}" fill="${color}" opacity="0.9"/>`;
  }

  // Axis lines
  svg += `<line x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + PH}" stroke="#2e2e4e" stroke-width="1.5"/>`;
  svg += `<line x1="${ML}" y1="${MT + PH}" x2="${ML + PW}" y2="${MT + PH}" stroke="#2e2e4e" stroke-width="1.5"/>`;

  // Stage label strip (colored text below x-axis, above MBTI track)
  const stageOrder: Stage[] = ["childhood", "adolescence", "early_adulthood", "old_adulthood"];
  for (const stage of stageOrder) {
    const bounds = stageBounds.get(stage);
    if (!bounds) continue;
    const x1 = xOf(bounds.first - 1);
    const x2 = xOf(bounds.last);
    const cx = (x1 + x2) / 2;
    const y = MT + PH + 14;
    const color = STAGE_LABEL_COLORS[stage];
    svg += `<text x="${cx.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="10" fill="${color}" letter-spacing="0.05em">${STAGE_NAMES[stage].toUpperCase()}</text>`;
    // Tick at start of stage
    const tx = xOf(bounds.first - 1);
    svg += `<line x1="${tx.toFixed(1)}" y1="${(MT + PH).toFixed(1)}" x2="${tx.toFixed(1)}" y2="${(MT + PH + 5).toFixed(1)}" stroke="#2e2e4e" stroke-width="1"/>`;
  }

  // MBTI track: show at key transitions (birth + stage ends)
  const mbtiTrackY = MT + PH + 36;
  // Birth MBTI
  svg += `<text x="${xOf(0).toFixed(1)}" y="${mbtiTrackY.toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="11" fill="#6b64c8" font-weight="bold">${projectMbti(birth.v)}</text>`;
  // MBTI at each stage end
  let prevMbti = projectMbti(birth.v);
  for (const stage of stageOrder) {
    const bounds = stageBounds.get(stage);
    if (!bounds) continue;
    const snap = allSnaps[bounds.last - 1];
    if (!snap) continue;
    const mbti = snap.mbti;
    if (mbti !== prevMbti || stage === "old_adulthood") {
      const x = xOf(bounds.last);
      const changed = mbti !== prevMbti;
      const color = changed ? "#ef4444" : "#6b64c8";
      svg += `<text x="${x.toFixed(1)}" y="${mbtiTrackY.toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="11" fill="${color}" font-weight="bold">${mbti}</text>`;
      prevMbti = mbti;
    }
  }

  svg += "</svg>";
  return svg;
}

// ── Aspect legend ────────────────────────────────────────────────────────────

function buildLegend(): string {
  const chips = ASPECTS.map((a) => {
    const color = ASPECT_COLORS[a];
    return `<span class="chip" style="--c:${color}"><span class="dot" style="background:${color}"></span>${a}</span>`;
  }).join("");
  return `<div class="legend">${chips}</div>`;
}

// ── Sprite timeline ───────────────────────────────────────────────────────────

function buildSpriteTimeline(birth: Soul, traj: Trajectory): string {
  const checkpoints = stageCheckpoints(birth, traj);
  const items = checkpoints
    .map((cp, i) => {
      const svg = spriteToSvg(cp.soul);
      const mbti = cp.snap ? cp.snap.mbti : projectMbti(birth.v);
      const mp = cp.snap ? `MP ${cp.snap.mp.toFixed(0)}` : "MP 0";
      const color = STAGE_LABEL_COLORS[cp.stage];
      const cell = `<div class="sprite-cell">
        <div class="sprite-art">${svg}</div>
        <div class="sprite-label">
          <span class="sprite-stage" style="color:${color}">${cp.label === "Birth" ? "BIRTH" : STAGE_NAMES[cp.stage].toUpperCase()}</span>
          <span class="sprite-mbti">${mbti}</span>
          <span class="sprite-mp">${mp}</span>
        </div>
      </div>`;
      const arrow = i < checkpoints.length - 1 ? `<div class="timeline-arrow">&#8594;</div>` : "";
      return cell + arrow;
    })
    .join("");

  return `<div class="sprite-timeline">${items}</div>`;
}

// ── Birth readout ─────────────────────────────────────────────────────────────

function buildBirthReadout(birth: Soul, mode: "aligned" | "mismatched"): string {
  const sorted = [...ASPECTS].sort((a, b) => birth.v[b] - birth.v[a]);
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3);
  const stubbornness =
    birth.stubbornness < 0.34 ? "clay" : birth.stubbornness < 0.67 ? "mixed" : "stubborn";
  const mbti = projectMbti(birth.v);
  const modeLabel =
    mode === "aligned"
      ? "aligned grind (reinforces nature)"
      : "mismatched grind (grinds against nature)";
  const modeColor = mode === "aligned" ? "#34d399" : "#ef4444";

  const aspectBars = sorted
    .map((a) => {
      const val = birth.v[a];
      const pct = (val * 100).toFixed(0);
      const color = ASPECT_COLORS[a];
      const isTop3 = top3.includes(a);
      const isBot3 = bottom3.includes(a);
      const marker = isTop3 ? "↑" : isBot3 ? "↓" : " ";
      return `<div class="aspect-row">
        <span class="aspect-name" style="color:${color}">${a}</span>
        <div class="aspect-bar-track"><div class="aspect-bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <span class="aspect-val">${val.toFixed(2)}</span>
        <span class="aspect-marker" style="color:${color}">${marker}</span>
      </div>`;
    })
    .join("");

  return `<div class="birth-readout">
    <div class="readout-header">
      <div class="readout-mbti">${mbti}</div>
      <div class="readout-meta">
        <span class="meta-sex">${birth.sex}</span>
        <span class="meta-temperament">${stubbornness}</span>
        <span class="meta-mode" style="color:${modeColor}">${modeLabel}</span>
      </div>
      <div class="readout-birth-desc">${describeBirth(birth)}</div>
    </div>
    <div class="aspect-grid">${aspectBars}</div>
  </div>`;
}

// ── Death readout ─────────────────────────────────────────────────────────────

function buildDeathReadout(birth: Soul, traj: Trajectory): string {
  const finalMbti = projectMbti(traj.final.v);
  const birthMbti = projectMbti(birth.v);
  const held = finalMbti === birthMbti;
  const mbtiNote = held
    ? `<span style="color:#34d399">identity held — ${finalMbti}</span>`
    : `<span style="color:#ef4444">flipped ${birthMbti} → ${finalMbti}</span>`;
  const sessions = traj.snapshots.length;
  const finalMp = traj.final.mp.toFixed(0);
  const breaks = traj.breaks.length;

  const breakList =
    traj.breaks.length > 0
      ? traj.breaks
          .map((br) => {
            const color = ASPECT_COLORS[br.aspect];
            return `<span class="break-item" style="border-color:${color}40;color:${color}">⚡ ${br.aspect} · ${STAGE_NAMES[br.stage]} · t=${br.tensionAtBreak.toFixed(2)}</span>`;
          })
          .join("")
      : `<span style="color:#4a4a6a">no ruptures — the life held</span>`;

  return `<div class="death-readout">
    <div class="death-header">
      <span class="death-title">NEGLECT-DEATH</span>
      <span class="death-silence">91 days of silence — the cloud disperses</span>
    </div>
    <div class="death-stats">
      <div class="stat"><span class="stat-label">Final MBTI</span><span class="stat-val">${mbtiNote}</span></div>
      <div class="stat"><span class="stat-label">Sessions</span><span class="stat-val">${sessions}</span></div>
      <div class="stat"><span class="stat-label">Final MP</span><span class="stat-val">${finalMp}</span></div>
      <div class="stat"><span class="stat-label">Ruptures</span><span class="stat-val">${breaks}</span></div>
    </div>
    <div class="break-list">${breakList}</div>
  </div>`;
}

// ── Life section (sprite + chart + death) ────────────────────────────────────

function buildLifeSection(
  birth: Soul,
  traj: Trajectory,
  mode: "aligned" | "mismatched",
  seed: number,
): string {
  const modeLabel = mode === "aligned" ? "ALIGNED" : "MISMATCHED";
  const modeColor = mode === "aligned" ? "#34d399" : "#ef4444";
  const chart = buildDriftChart(birth, traj);
  const timeline = buildSpriteTimeline(birth, traj);
  const legend = buildLegend();
  const death = buildDeathReadout(birth, traj);

  return `<section class="life-section">
    <div class="section-header">
      <span class="section-mode" style="color:${modeColor}">${modeLabel}</span>
      <span class="section-seed">seed ${seed}</span>
    </div>
    <div class="section-birth-bar">${buildBirthReadout(birth, mode)}</div>
    <h3 class="subsection-title">Sprite Evolution</h3>
    ${timeline}
    <h3 class="subsection-title">Aspect Drift — ${traj.snapshots.length} sessions · ${traj.breaks.length} ruptures</h3>
    <div class="chart-wrap">${chart}</div>
    ${legend}
    ${death}
  </section>`;
}

// ── Divergence summary ────────────────────────────────────────────────────────

function buildDivergenceSummary(
  birth: Soul,
  alignedT: Trajectory,
  mismatchedT: Trajectory,
): string {
  const birthMbti = projectMbti(birth.v);
  const alignedMbti = projectMbti(alignedT.final.v);
  const mismatchedMbti = projectMbti(mismatchedT.final.v);

  const rows = ASPECTS.filter((a) => {
    const alDelta = alignedT.final.v[a] - birth.v[a];
    const msDelta = mismatchedT.final.v[a] - birth.v[a];
    return Math.abs(alDelta - msDelta) > 0.04;
  })
    .sort((a, b) => {
      const diffA = Math.abs(
        alignedT.final.v[a] - birth.v[a] - (mismatchedT.final.v[a] - birth.v[a]),
      );
      const diffB = Math.abs(
        alignedT.final.v[b] - birth.v[b] - (mismatchedT.final.v[b] - birth.v[b]),
      );
      return diffB - diffA;
    })
    .map((a) => {
      const color = ASPECT_COLORS[a];
      const alDelta = alignedT.final.v[a] - birth.v[a];
      const msDelta = mismatchedT.final.v[a] - birth.v[a];
      const alSign = alDelta >= 0 ? "+" : "";
      const msSign = msDelta >= 0 ? "+" : "";
      const alColor = alDelta >= 0 ? "#34d399" : "#ef4444";
      const msColor = msDelta >= 0 ? "#34d399" : "#ef4444";
      return `<tr>
        <td style="color:${color}">${a}</td>
        <td style="color:${alColor}">${alSign}${alDelta.toFixed(3)}</td>
        <td style="color:${msColor}">${msSign}${msDelta.toFixed(3)}</td>
        <td style="color:#6b64c8">${Math.abs(alDelta - msDelta).toFixed(3)}</td>
      </tr>`;
    })
    .join("");

  return `<section class="divergence-section">
    <h2 class="divergence-title">DIVERGENCE · same seed, different grind</h2>
    <div class="divergence-summary">
      <div class="div-stat">
        <span class="div-label">Born</span>
        <span class="div-val" style="color:#6b64c8">${birthMbti}</span>
        <span class="div-meta">${birth.sex} · ${birth.stubbornness < 0.5 ? "clay" : "stubborn"}</span>
      </div>
      <div class="div-stat">
        <span class="div-label">Aligned →</span>
        <span class="div-val" style="color:#34d399">${alignedMbti}</span>
        <span class="div-meta">${alignedT.breaks.length} ruptures</span>
      </div>
      <div class="div-stat">
        <span class="div-label">Mismatched →</span>
        <span class="div-val" style="color:#ef4444">${mismatchedMbti}</span>
        <span class="div-meta">${mismatchedT.breaks.length} ruptures</span>
      </div>
    </div>
    ${
      rows
        ? `<table class="divergence-table">
      <thead><tr><th>aspect</th><th>aligned Δ</th><th>mismatched Δ</th><th>divergence</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
        : ""
    }
  </section>`;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #07070f;
    --surface: #0f0f1c;
    --surface2: #13132a;
    --border: #1e1e38;
    --text: #cdd6f4;
    --subtext: #585876;
    --accent: #6b64c8;
    --radius: 8px;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif;
    font-size: 14px;
    line-height: 1.6;
    padding: 32px 24px 80px;
    max-width: 1100px;
    margin: 0 auto;
  }

  /* ── Page header ── */
  .page-header {
    margin-bottom: 40px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 24px;
  }
  .page-title {
    font-size: 11px;
    letter-spacing: 0.18em;
    color: var(--subtext);
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .page-seed {
    font-size: 28px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.02em;
  }
  .page-seed span {
    color: var(--accent);
  }

  /* ── Life section ── */
  .life-section {
    margin-bottom: 60px;
    padding: 28px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .section-header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 20px;
  }
  .section-mode {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }
  .section-seed {
    font-size: 11px;
    color: var(--subtext);
    font-family: monospace;
  }
  .subsection-title {
    font-size: 11px;
    letter-spacing: 0.12em;
    color: var(--subtext);
    text-transform: uppercase;
    margin: 28px 0 14px;
  }

  /* ── Birth readout ── */
  .birth-readout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    padding: 16px;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-bottom: 4px;
  }
  .readout-mbti {
    font-size: 32px;
    font-weight: 800;
    color: var(--accent);
    font-family: monospace;
    letter-spacing: -0.02em;
    line-height: 1;
    margin-bottom: 6px;
  }
  .readout-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 6px;
  }
  .meta-sex, .meta-temperament {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 99px;
    border: 1px solid var(--border);
    color: var(--subtext);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .meta-mode {
    font-size: 11px;
    font-style: italic;
    color: var(--subtext);
  }
  .readout-birth-desc {
    font-size: 12px;
    color: var(--subtext);
    font-family: monospace;
    margin-top: 4px;
  }
  .aspect-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .aspect-row {
    display: grid;
    grid-template-columns: 110px 1fr 42px 16px;
    align-items: center;
    gap: 6px;
  }
  .aspect-name {
    font-family: monospace;
    font-size: 11px;
    text-align: right;
  }
  .aspect-bar-track {
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
  }
  .aspect-bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s;
  }
  .aspect-val {
    font-family: monospace;
    font-size: 10px;
    color: var(--subtext);
    text-align: right;
  }
  .aspect-marker {
    font-size: 10px;
    text-align: center;
  }

  /* ── Sprite timeline ── */
  .sprite-timeline {
    display: flex;
    align-items: flex-end;
    gap: 0;
    overflow-x: auto;
    padding: 12px 0;
  }
  .sprite-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 10px;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 6px;
    min-width: 90px;
  }
  .sprite-art {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    min-height: 80px;
  }
  .sprite-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .sprite-stage {
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 700;
  }
  .sprite-mbti {
    font-family: monospace;
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
  }
  .sprite-mp {
    font-family: monospace;
    font-size: 9px;
    color: var(--subtext);
  }
  .timeline-arrow {
    font-size: 18px;
    color: var(--border);
    padding: 0 4px;
    align-self: center;
    margin-bottom: 30px;
    flex-shrink: 0;
  }

  /* ── Chart ── */
  .chart-wrap {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 0 4px;
    overflow-x: auto;
  }
  .chart-wrap svg {
    display: block;
    min-width: 600px;
  }

  /* ── Legend ── */
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
    margin-bottom: 4px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: monospace;
    font-size: 10px;
    color: var(--subtext);
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface2);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* ── Death readout ── */
  .death-readout {
    margin-top: 28px;
    padding: 16px;
    background: var(--surface2);
    border: 1px solid #2a1010;
    border-radius: 6px;
  }
  .death-header {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-bottom: 14px;
  }
  .death-title {
    font-size: 11px;
    letter-spacing: 0.14em;
    color: #ef4444;
    text-transform: uppercase;
    font-weight: 700;
  }
  .death-silence {
    font-size: 12px;
    color: var(--subtext);
    font-style: italic;
  }
  .death-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    margin-bottom: 12px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .stat-label {
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--subtext);
  }
  .stat-val {
    font-family: monospace;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .break-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .break-item {
    font-family: monospace;
    font-size: 10px;
    padding: 3px 8px;
    border: 1px solid;
    border-radius: 4px;
    background: #0d0d1a;
  }

  /* ── Divergence section ── */
  .divergence-section {
    padding: 28px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-top: 12px;
  }
  .divergence-title {
    font-size: 11px;
    letter-spacing: 0.15em;
    color: var(--subtext);
    text-transform: uppercase;
    margin-bottom: 20px;
  }
  .divergence-summary {
    display: flex;
    gap: 32px;
    flex-wrap: wrap;
    margin-bottom: 24px;
  }
  .div-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .div-label {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--subtext);
  }
  .div-val {
    font-family: monospace;
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .div-meta {
    font-size: 11px;
    color: var(--subtext);
    font-family: monospace;
  }
  .divergence-table {
    width: 100%;
    border-collapse: collapse;
    font-family: monospace;
    font-size: 11px;
  }
  .divergence-table th {
    text-align: left;
    padding: 4px 10px;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--subtext);
    border-bottom: 1px solid var(--border);
  }
  .divergence-table td {
    padding: 5px 10px;
    border-bottom: 1px solid #10101c;
  }
  .divergence-table tr:last-child td {
    border-bottom: none;
  }
`;

// ── Full page builder ─────────────────────────────────────────────────────────

function buildPage(mode: "aligned" | "mismatched" | "both", seed: number): string {
  const entropy = entropyFromInt(seed);
  const dryTraj = lifetime(entropy, []);
  const birth = dryTraj.birth;

  const modes: Array<"aligned" | "mismatched"> =
    mode === "both" ? ["aligned", "mismatched"] : [mode];

  const trajectories = modes.map((m) => ({
    mode: m,
    traj: lifetime(entropy, buildScript(birth, m)),
  }));

  const sections = trajectories
    .map(({ mode: m, traj }) => buildLifeSection(birth, traj, m, seed))
    .join("\n");

  const alignedTraj = trajectories[0]?.traj;
  const mismatchedTraj = trajectories[1]?.traj;
  const divergence =
    mode === "both" && alignedTraj && mismatchedTraj
      ? buildDivergenceSummary(birth, alignedTraj, mismatchedTraj)
      : "";

  const modeTitle =
    mode === "both"
      ? "Aligned &amp; Mismatched"
      : mode === "aligned"
        ? "Aligned Life"
        : "Mismatched Life";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ul lifecycle · seed ${seed}</title>
  <style>${CSS}</style>
</head>
<body>
  <header class="page-header">
    <div class="page-title">ul lifecycle visualizer · ${modeTitle}</div>
    <div class="page-seed">seed <span>${seed}</span></div>
  </header>
  ${sections}
  ${divergence}
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "out");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "lifecycle.html");

const html = buildPage(MODE, SEED);
writeFileSync(outPath, html, "utf8");

const absPath = outPath.startsWith("/") ? outPath : join(process.cwd(), outPath);
process.stdout.write(`\nLifecycle HTML written to:\n  ${absPath}\n\n`);
process.stdout.write(`Open with:\n  open "${absPath}"\n\n`);
