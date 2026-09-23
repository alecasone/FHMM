import { performance } from 'node:perf_hooks';
import { World, History, seedWorld, dab } from '../app/world.js';
const world = new World(); const start = performance.now(); seedWorld(world); console.log(`Starter world: ${(performance.now() - start).toFixed(0)} ms`);
for (const radius of [56, 240]) for (const tool of ['raise', 'smooth']) {
  const history = new History(world); const stroke = history.begin(tool); const t = performance.now();
  dab(world, stroke, 0, 0, { tool, radius, strength: .45 });
  console.log(`${tool}, radius ${radius}: ${(performance.now() - t).toFixed(1)} ms`);
}
