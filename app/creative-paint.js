import { noise, smoothstep } from './biomes.js';
export const CREATIVE_PRESETS = {
  strata: { name: 'Canyon / mesa layers', colors: ['#813f30', '#bd7850', '#e1b783', '#f1d8a9'] },
  moss: { name: 'Moss & lichen', colors: ['#344c31', '#73824a', '#aba77d', '#65635c'] },
  volcanic: { name: 'Volcanic ash', colors: ['#292d30', '#4b4340', '#916449', '#c2b4a2'] },
};
export const parsePaintColor = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, c) => v + (b[c] - v) * t);
export function creativeColor(world, x, y, settings) {
  const colors = settings.colors, height = world.get(x, y), grain = noise(x * .33, y * .33);
  if (settings.kind === 'strata') {
    const tilt = settings.tilt * Math.PI / 180, direction = settings.angle * Math.PI / 180;
    // Geological layers stay anchored in world space across separate brush strokes.
    const elevation = (height - world.sea) * 1000 - (x * Math.cos(direction) + y * Math.sin(direction)) * Math.tan(tilt);
    const band = elevation / settings.thickness + (noise(x * .015, y * .015) - .5) * .24;
    const index = Math.floor(band), phase = band - index, wrap = i => ((i % colors.length) + colors.length) % colors.length;
    const color = mix(colors[wrap(index)], colors[wrap(index + 1)], smoothstep(.82, 1, phase));
    return color.map(v => v * (.96 + grain * .08));
  }
  const slope = Math.hypot(world.get(x - 1, y) - world.get(x + 1, y), world.get(x, y - 1) - world.get(x, y + 1)) * 50;
  const patch = noise(x / settings.thickness, y / settings.thickness);
  if (settings.kind === 'moss') {
    const green = mix(colors[0], colors[1], patch);
    return mix(mix(green, colors[2], smoothstep(.55, .82, grain) * .6), colors[3], smoothstep(.2, 1, slope));
  }
  const ash = mix(colors[0], colors[1], grain);
  return mix(ash, mix(colors[2], colors[3], patch), smoothstep(.42, .85, patch) * (1 - smoothstep(.2, 1.1, slope) * .7));
}
