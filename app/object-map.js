import { objectType } from './objects.js';

// Top-down canopy symbols share the 3D models' position, footprint and rotation.
export function drawMapObjects(ctx, world, px, py, zoom, bounds) {
  if (!world.objectsVisible) return;
  for (const o of world.objects) {
    const type = objectType(o.type), footprint = type.radius * o.scale, rocky = type.category === 'Rocks' || o.type === 'sandstone';
    if (o.x + footprint < bounds.minX || o.x - footprint > bounds.maxX || o.y + footprint < bounds.minY || o.y - footprint > bounds.maxY || !world.inside(o.x, o.y) || world.sample(o.x, o.y) <= world.sea + .002) continue;
    const x = px(o.x), y = py(o.y), size = Math.max(.85, footprint * zoom);
    ctx.save(); ctx.translate(x, y); ctx.rotate(o.rotation);
    ctx.beginPath(); ctx.arc(size * .3, size * .35, size * 1.05, 0, Math.PI * 2); ctx.fillStyle = '#142a2570'; ctx.fill();
    ctx.beginPath();
    if (['palm', 'fern', 'grass', 'reeds', 'flowers', 'dead', 'cactus'].includes(type.symbol)) {
      const count = type.symbol === 'cactus' ? 4 : type.symbol === 'dead' ? 5 : 8;
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count, reach = size * (i % 2 ? .85 : 1);
        const x = Math.cos(angle) * reach, y = Math.sin(angle) * reach;
        ctx.beginPath(); ctx.moveTo(0, 0);
        if (['dead', 'reeds', 'grass', 'flowers', 'cactus'].includes(type.symbol)) {
          ctx.lineTo(x, y); ctx.strokeStyle = type.symbol === 'flowers' ? '#758b4c' : type.color;
          ctx.lineWidth = Math.max(.65, size * (type.symbol === 'cactus' ? .3 : .1)); ctx.stroke();
          if (type.symbol === 'flowers') { ctx.beginPath(); ctx.arc(x, y, Math.max(.5, size * .18), 0, Math.PI * 2); ctx.fillStyle = i % 2 ? '#e8d39c' : type.color; ctx.fill(); }
        } else {
          ctx.quadraticCurveTo(x * .35 - y * .25, y * .35 + x * .25, x, y);
          ctx.quadraticCurveTo(x * .35 + y * .25, y * .35 - x * .25, 0, 0);
          ctx.fillStyle = type.color; ctx.fill();
        }
      }
      ctx.restore(); continue;
    }
    const corners = type.symbol === 'conifer' ? 16 : rocky ? 7 : 18;
    for (let i = 0; i < corners; i++) {
      const a = i / corners * Math.PI * 2;
      const r = size * (type.symbol === 'conifer' ? (i % 2 ? .64 : 1) : rocky ? (.85 + Math.sin(i * 7) * .15) : (.91 + Math.cos(a * 6) * .09));
      if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fillStyle = type.color; ctx.fill(); ctx.strokeStyle = '#203c2eaa'; ctx.lineWidth = Math.min(1, size * .16); ctx.stroke();
    if (size > 2) { ctx.beginPath(); ctx.arc(-size * .2, -size * .2, size * .45, 0, Math.PI * 2); ctx.fillStyle = rocky ? '#e0dcc750' : '#bad07840'; ctx.fill(); }
    ctx.restore();
  }
}
