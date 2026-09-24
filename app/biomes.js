// Biome weights are a separate, sparse layer. Unpainted weight uses natural terrain.
export const BIOMES = [
  { id: 'grassland', name: 'Grassland', color: '#7d8d4e', low: [93, 109, 53], high: [135, 146, 83] },
  { id: 'forest', name: 'Forest', color: '#3e5c37', low: [39, 63, 34], high: [73, 95, 50] },
  { id: 'rainforest', name: 'Rainforest', color: '#2d6343', low: [27, 63, 39], high: [58, 94, 47] },
  { id: 'taiga', name: 'Taiga', color: '#516c58', low: [48, 70, 57], high: [80, 101, 74] },
  { id: 'savanna', name: 'Savanna', color: '#a69a57', low: [137, 127, 60], high: [180, 164, 90] },
  { id: 'desert', name: 'Desert', color: '#cbb17d', low: [179, 147, 95], high: [219, 194, 143] },
  { id: 'tundra', name: 'Tundra', color: '#999c80', low: [117, 123, 99], high: [158, 158, 128] },
  { id: 'wetland', name: 'Wetland', color: '#616a3e', low: [63, 78, 46], high: [108, 115, 64] },
  { id: 'rock', name: 'Rock', color: '#99948a', low: [105, 102, 93], high: [157, 150, 133] },
  { id: 'snow', name: 'Snow', color: '#e9f1f4', low: [202, 218, 225], high: [245, 248, 244] },
  { id: 'water', name: 'Water', color: '#347f96', low: [30, 79, 104], high: [68, 143, 161] },
];
export const BIOME_COUNT = BIOMES.length;
const clamp01 = n => Math.max(0, Math.min(1, n));
const blend = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, n) { const t = clamp01((n - a) / (b - a)); return t * t * (3 - 2 * t); }
function hash(x, y) { let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }
export function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smoothstep(0, 1, x - ix), fy = smoothstep(0, 1, y - iy);
  return blend(blend(hash(ix, iy), hash(ix + 1, iy), fx), blend(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy);
}
export function surfaceColor(height, sea, x, y, slope, paint, offset = 0, enabled = true) {
  const elevation = height - sea;
  const patch = noise(x * .026, y * .026), grain = hash(Math.floor(x), Math.floor(y));
  const variation = clamp01(patch * .75 + noise(x * .19, y * .19) * .25);
  const moist = noise(x * .008 + 31, y * .008 - 24);
  const cliff = smoothstep(.26, .95, slope);
  const alpine = smoothstep(.35, .64, elevation);
  const snowline = smoothstep(.64 + (patch - .5) * .09, .86, elevation) * (1 - cliff * .8);
  const coast = 1 - smoothstep(.002, .026, elevation);
  const rock = BIOMES[8], snow = BIOMES[9], weights = paint;
  const rgb = [0, 0, 0]; let coverage = 0;
  if (enabled && weights) for (let b = 0; b < BIOME_COUNT; b++) coverage += weights[offset + b];
  for (let c = 0; c < 3; c++) {
    const rockValue = blend(rock.low[c], rock.high[c], variation);
    let natural = blend(BIOMES[0].low[c], BIOMES[0].high[c], variation);
    natural = blend(natural, blend(BIOMES[1].low[c], BIOMES[1].high[c], variation), smoothstep(.38, .72, moist) * (1 - alpine));
    natural = blend(natural, blend(BIOMES[6].low[c], BIOMES[6].high[c], variation), alpine);
    natural = blend(natural, rockValue, cliff);
    natural = blend(natural, blend(snow.low[c], snow.high[c], .5 + variation * .5), snowline);
    natural = blend(natural, [182, 170, 127][c], coast * (1 - cliff * .7));
    let value = natural * Math.max(0, 1 - coverage / 255);
    if (enabled && weights) for (let b = 0; b < BIOME_COUNT; b++) {
      const weight = weights[offset + b]; if (!weight) continue;
      const biome = BIOMES[b];
      let painted = blend(biome.low[c], biome.high[c], b === 9 ? .5 + variation * .5 : variation);
      // Snow and vegetation follow the slope; painted water keeps its color on steep ground.
      if (b !== 8 && b !== 10) painted = blend(painted, rockValue, cliff * (b === 9 ? .82 : b === 5 ? .5 : .86));
      value += painted * weight / 255;
    }
    rgb[c] = Math.max(0, Math.min(255, value * (.965 + grain * .07)));
  }
  return rgb;
}
