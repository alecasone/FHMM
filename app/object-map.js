import { objectLife, objectSeason, lifeScale, isLivingType, mapVariantColor } from './object-variants.js';
import { objectType } from './objects.js';

const winterBareTypes = new Set(['oak', 'autumn', 'birch', 'willow', 'shrub']);
const radialSymbols = new Set(['palm', 'fern', 'grass', 'reeds', 'flowers', 'dead', 'cactus']);
const lineSymbols = new Set(['dead', 'reeds', 'grass', 'flowers', 'cactus']);

// Top-down canopy symbols share the 3D models' position, footprint and rotation.
export function drawMapObjects(ctx, world, px, py, zoom, bounds) {
  if (!world.objectsVisible) return;
  for (const o of world.objects) {
    const base = objectType(o.type), footprint = base.radius * o.scale * lifeScale(o);
    if (o.x + footprint < bounds.minX || o.x - footprint > bounds.maxX || o.y + footprint < bounds.minY || o.y - footprint > bounds.maxY || !world.inside(o.x, o.y) || world.sample(o.x, o.y) <= world.sea + .002) continue;
    const bare = isLivingType(o.type) && (objectLife(o) === 'dead' || (objectSeason(o) === 'winter' && winterBareTypes.has(o.type)));
    const color = mapVariantColor(o, base.color), symbol = bare ? 'dead' : base.symbol, rocky = base.category === 'Rocks' || o.type === 'sandstone';
    const x = px(o.x), y = py(o.y), size = Math.max(.85, footprint * zoom);
    ctx.save(); ctx.translate(x, y); ctx.rotate(o.rotation);
    ctx.beginPath(); ctx.arc(size * .3, size * .35, size * 1.05, 0, Math.PI * 2); ctx.fillStyle = '#142a2570'; ctx.fill();
    ctx.beginPath();
    if (radialSymbols.has(symbol)) {
      const count = symbol === 'cactus' ? 4 : symbol === 'dead' ? 5 : 8;
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count, reach = size * (i % 2 ? .85 : 1);
        const x = Math.cos(angle) * reach, y = Math.sin(angle) * reach;
        ctx.beginPath(); ctx.moveTo(0, 0);
        if (lineSymbols.has(symbol)) {
          ctx.lineTo(x, y); ctx.strokeStyle = symbol === 'flowers' ? '#758b4c' : color;
          ctx.lineWidth = Math.max(.65, size * (symbol === 'cactus' ? .3 : .1)); ctx.stroke();
          if (symbol === 'flowers') { ctx.beginPath(); ctx.arc(x, y, Math.max(.5, size * .18), 0, Math.PI * 2); ctx.fillStyle = i % 2 ? '#e8d39c' : color; ctx.fill(); }
        } else {
          ctx.quadraticCurveTo(x * .35 - y * .25, y * .35 + x * .25, x, y);
          ctx.quadraticCurveTo(x * .35 + y * .25, y * .35 - x * .25, 0, 0);
          ctx.fillStyle = color; ctx.fill();
        }
      }
      ctx.restore(); continue;
    }
    const corners = symbol === 'conifer' ? 16 : rocky ? 7 : 18;
    for (let i = 0; i < corners; i++) {
      const a = i / corners * Math.PI * 2;
      const r = size * (symbol === 'conifer' ? (i % 2 ? .64 : 1) : rocky ? (.85 + Math.sin(i * 7) * .15) : (.91 + Math.cos(a * 6) * .09));
      if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#203c2eaa'; ctx.lineWidth = Math.min(1, size * .16); ctx.stroke();
    if (size > 2) { ctx.beginPath(); ctx.arc(-size * .2, -size * .2, size * .45, 0, Math.PI * 2); ctx.fillStyle = rocky ? '#e0dcc750' : '#bad07840'; ctx.fill(); }
    ctx.restore();
  }
}
