// Depth is stored in terrain units (1 unit = 1,000 m); controls use meters.
export const DEFAULT_WATER_STYLE = Object.freeze({ shallow: '#79dcd0', deep: '#07152f', depth: 180, curve: .65 });
export function validateWaterStyle(style) {
  if (!style || typeof style !== 'object' || Array.isArray(style) ||
    Object.keys(style).some(key => !['shallow', 'deep', 'depth', 'curve'].includes(key)) ||
    !/^#[0-9a-f]{6}$/i.test(style.shallow) || !/^#[0-9a-f]{6}$/i.test(style.deep) ||
    !Number.isFinite(style.depth) || style.depth < 5 || style.depth > 2000 ||
    !Number.isFinite(style.curve) || style.curve < .2 || style.curve > 3) throw new Error('Invalid water color settings');
}
const palettes = new WeakMap();
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
export function waterColor(depth, style = DEFAULT_WATER_STYLE, tint = null, offset = 0) {
  let palette = palettes.get(style);
  if (!palette) { palette = [rgb(style.shallow), rgb(style.deep)]; palettes.set(style, palette); }
  const t = Math.pow(Math.max(0, Math.min(1, depth * 1000 / style.depth)), style.curve);
  const alpha = (tint?.[offset + 3] ?? 0) / 255;
  return palette[0].map((value, c) => {
    const natural = value + (palette[1][c] - value) * t;
    // Regional color remains visible in deep water, while retaining a strong depth cue.
    return natural * (1 - alpha) + (tint?.[offset + c] ?? 0) * (1 - t * .84) * alpha;
  });
}
