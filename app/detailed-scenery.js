import * as THREE from 'three';

// Deterministic shapes share one instanced mesh per species/season/lifecycle.
export function detailedTree(type, part, season, lifecycle) {
  if (!['pine', 'oak', 'spruce', 'birch', 'willow', 'autumn', 'dead-tree', 'shrub'].includes(type)) return false;
  const evergreen = type === 'pine' || type === 'spruce', shrub = type === 'shrub';
  const dead = lifecycle === 'dead' || type === 'dead-tree';
  const bare = dead || (season === 'winter' && !evergreen);
  const height = shrub ? 3.3 : type === 'birch' ? 15 : evergreen ? 19 : 13;
  const spread = shrub ? 1.8 : type === 'willow' ? 4.5 : type === 'birch' ? 2 : evergreen ? 2.4 : 3.5;
  const bark = type === 'birch' && !dead ? '#d5d3c4' : dead ? '#887964' : '#73553c';
  const palettes = { spring: ['#789d51', '#92ad63', '#557d42'], summer: ['#3f6b42', '#61854b', '#789452'], fall: ['#c29143', '#b45b32', '#d5a24b'], winter: ['#38594d', '#4c6a5a', '#657e6b'] };
  const leaves = evergreen && season === 'fall' ? palettes.summer : palettes[season];
  function stem(a, b, radius, tip = radius * .42, color = bark) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const geo = new THREE.CylinderGeometry(tip, radius, delta.length(), 8);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    const center = start.add(end).multiplyScalar(.5);
    part(geo, color, center.x, center.y, center.z);
  }
  function tuft(x, y, z, radius, i, sx = 1, sy = .8, sz = 1) {
    part(new THREE.IcosahedronGeometry(radius, 1), leaves[i % 3], x, y, z, sx, sy, sz);
    if (season === 'winter') part(new THREE.IcosahedronGeometry(radius * .9, 1), '#dce5e1', x, y + radius * .38, z, sx, .2, sz);
    if (season === 'spring' && !evergreen && i % 4 === 0) part(new THREE.IcosahedronGeometry(radius * .26, 1), '#e4c4bb', x + radius * .5, y + radius * .5, z, 1, .65, 1);
  }
  stem([0, -.3, 0], [.2, height * .55, .1], shrub ? .18 : type === 'birch' ? .48 : .88);
  stem([.2, height * .55, .1], [-.1, height, 0], shrub ? .08 : .36, .035);
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4, r = shrub ? .7 : 1.8;
    stem([Math.cos(a) * r, .02, Math.sin(a) * r], [0, shrub ? .4 : 1.6, 0], shrub ? .07 : .25, shrub ? .09 : .4);
  }
  if (type === 'birch') for (let i = 1; i < 10; i++) part(new THREE.CylinderGeometry(.43 - i * .016, .45 - i * .016, .12, 8), '#5d6058', .06, i * 1.1, .02);
  const branches = lifecycle === 'sapling' ? 8 : evergreen ? 20 : shrub ? 10 : 16;
  for (let i = 0; i < branches; i++) {
    const a = i * 2.39996, t = i / branches;
    const y = evergreen ? height * (.22 + t * .66) : height * (.4 + t * .47);
    const reach = spread * (evergreen ? 1 - t * .78 : .55 + Math.sin(t * Math.PI) * .45);
    const x = Math.cos(a) * reach, z = Math.sin(a) * reach, tipY = y + (evergreen ? .6 : 1.4);
    stem([.1, y, 0], [x * .65, tipY, z * .65], shrub ? .08 : .18 * (1 - t * .65));
    stem([x * .65, tipY, z * .65], [x, tipY + .4, z], shrub ? .035 : .065, .015);
    for (const sign of [-1, 1]) {
      const fx = x + Math.cos(a + sign * .6) * reach * .25, fz = z + Math.sin(a + sign * .6) * reach * .25;
      stem([x * .65, tipY, z * .65], [fx, tipY + .8, fz], shrub ? .025 : .045, .01);
      if (!bare) {
        const radius = evergreen ? .7 + (1 - t) * .55 : shrub ? .72 : type === 'birch' ? 1.15 : 1.5;
        tuft(fx, tipY + .5, fz, radius, i, evergreen ? 1.25 : 1, type === 'willow' ? 1.65 : evergreen ? .5 : .8, 1);
        if (type === 'willow') stem([fx, tipY, fz], [fx * 1.06, tipY - 3, fz * 1.06], .025, .01);
      } else if (season === 'winter' && !dead && i % 3 === 0) stem([x * .2, tipY + .12, z * .2], [x * .85, tipY + .3, z * .85], .07, .025, '#d7dfda');
    }
  }
  if (!bare) tuft(-.1, height, 0, evergreen ? .7 : shrub ? 1 : 1.8, 1, 1, evergreen ? 1.7 : 1, 1);
  return true;
}
