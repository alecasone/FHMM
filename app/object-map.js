import { objectType } from './objects.js';

// Top-down canopy symbols share the 3D models' position, footprint and rotation.
export function drawMapObjects(ctx, world, px, py, zoom, bounds) {
  if (!world.objectsVisible) return;
  for (const o of world.objects) {
    const type = objectType(o.type), footprint = type.radius * o.scale;
    if (o.x + footprint < bounds.minX || o.x - footprint > bounds.maxX || o.y + footprint < bounds.minY || o.y - footprint > bounds.maxY || !world.inside(o.x, o.y) || world.sample(o.x, o.y) <= world.sea + .002) continue;
    const x = px(o.x), y = py(o.y), size = Math.max(.85, footprint * zoom);
    ctx.save(); ctx.translate(x, y); ctx.rotate(o.rotation);
    ctx.beginPath(); ctx.arc(size * .3, size * .35, size * 1.05, 0, Math.PI * 2); ctx.fillStyle = '#142a2570'; ctx.fill();
    ctx.beginPath();
    const corners = o.type === 'pine' ? 16 : o.type === 'rock' ? 7 : 18;
    for (let i = 0; i < corners; i++) {
      const a = i / corners * Math.PI * 2;
      const r = size * (o.type === 'pine' ? (i % 2 ? .64 : 1) : o.type === 'rock' ? (.85 + Math.sin(i * 7) * .15) : (.91 + Math.cos(a * 6) * .09));
      if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fillStyle = type.color; ctx.fill(); ctx.strokeStyle = '#203c2eaa'; ctx.lineWidth = Math.min(1, size * .16); ctx.stroke();
    if (size > 2) { ctx.beginPath(); ctx.arc(-size * .2, -size * .2, size * .45, 0, Math.PI * 2); ctx.fillStyle = o.type === 'rock' ? '#e0dcc750' : '#bad07840'; ctx.fill(); }
    ctx.restore();
  }
}
