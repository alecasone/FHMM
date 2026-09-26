// A true-size plan symbol plus a readable label; symbols never grow with the brush.
import { REFERENCE_TYPES as specs } from './cursor-scale.js';
export function drawCursorReference(ctx, x, y, zoom, rotation, kind) {
  const spec = specs[kind] || specs.house, width = spec.width * zoom, depth = spec.depth * zoom;
  ctx.save(); ctx.translate(x, y); ctx.lineWidth = 1;
  if (kind === 'house') {
    ctx.fillStyle = '#bb9171'; ctx.strokeStyle = '#e9dcc1'; ctx.fillRect(-width / 2, -depth / 2, width, depth); ctx.strokeRect(-width / 2, -depth / 2, width, depth);
    ctx.beginPath(); ctx.moveTo(0, -depth / 2); ctx.lineTo(0, depth / 2); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.ellipse(0, 0, width / 2, depth / 2, 0, 0, Math.PI * 2); ctx.fillStyle = kind === 'tree' ? '#8baa6e' : '#d8ded2'; ctx.fill(); ctx.strokeStyle = '#e3e6cd'; ctx.stroke();
  }
  ctx.rotate(-rotation);
  ctx.font = '11px Segoe UI, sans-serif';
  const textWidth = ctx.measureText(spec.label).width;
  ctx.fillStyle = '#18272de8'; ctx.fillRect(10, 10, textWidth + 12, 22);
  ctx.strokeStyle = '#83968088'; ctx.strokeRect(10, 10, textWidth + 12, 22);
  ctx.fillStyle = '#e1e8d8'; ctx.fillText(spec.label, 16, 25); ctx.restore();
}
