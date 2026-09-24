const cache = new WeakMap();
let roundStamp;

export function brushPreviewStamp(mask) {
  if (mask && cache.has(mask)) return cache.get(mask);
  if (!mask && roundStamp) return roundStamp;
  const size = mask?.size ?? 128;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const context = canvas.getContext('2d'), image = context.createImageData(size, size), data = image.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x / (size - 1) - .5) * 2, dy = (y / (size - 1) - .5) * 2, distance2 = dx * dx + dy * dy;
    const falloff = distance2 < 1 ? (1 - distance2) ** 2 : 0;
    const source = mask ? mask.data[y * size + x] / 65535 : 1;
    const alpha = Math.round(255 * falloff * source), i = (y * size + x) * 4;
    data[i] = 174; data[i + 1] = 222; data[i + 2] = 194; data[i + 3] = alpha;
  }
  context.putImageData(image, 0, 0);
  if (mask) cache.set(mask, canvas); else roundStamp = canvas;
  return canvas;
}