/**
 * ul-geometry.mjs — the locked ul cloud-spirit geometry (see docs/ul-default.svg).
 * Shared by the palette/animation gallery and the birth animation so they never drift.
 *
 * Puff order matters: index 0 is the central puff (the "seed"); 1–5 the upper ring;
 * 6–8 the lower ring. Birth grows them in this order, center-out.
 */
export const WISPS = [
  [66, 80, 100, -1], [46, 64, 112, -1], [62, 76, 124, -1], // left  [x1,x2,y,dir]
  [220, 234, 100, 1], [236, 254, 112, 1], [224, 238, 124, 1], // right
];
export const INK = [
  [150, 100, 31], [110, 102, 20], [126, 86, 24], [150, 74, 30], [174, 86, 24],
  [190, 102, 20], [126, 116, 24], [150, 128, 30], [174, 116, 24],
];
export const BODY = [
  [150, 100, 26], [110, 102, 15], [126, 86, 19], [150, 74, 25], [174, 86, 19],
  [190, 102, 15], [126, 116, 19], [150, 128, 25], [174, 116, 19],
];
export const EYES = [[143, 108], [157, 108]];
export const ORIGIN = "150px 108px"; // cloud / blink / breath pivot
export const INK_COLOR = "#161310";
export const PAPER = "#ffffff";
