/**
 * @saulene/plugin — statusline brick (public surface)
 *
 * Exports the runtime StatusLine class + the birth animation + low-level
 * rasterizer/director primitives for testing and custom integrations.
 */

export { StatusLine } from "./statusline.js";
export type { StatusLineOpts, DirectorEvent } from "./statusline.js";

export { AnimDirector } from "./director.js";
export type { AnimFrame } from "./director.js";

export { compose, colorsFromParams, pixelGridToAnsi, CHAR_ROWS } from "./rasterizer.js";
export type { RgbColor, PixelGrid, RasterizerColors, OverlayFlags } from "./rasterizer.js";

export { birthFrames, renderBirthFrame, playBirth } from "./birth.js";
export type { BirthFrame } from "./birth.js";
