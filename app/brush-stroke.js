// Space dabs by distance, carrying the remainder across pointer events.
// Event frequency must not decide how much terrain a drag builds.
export class StrokePath {
  constructor(point, spacing) {
    this.last = { ...point }; this.spacing = Math.max(1, spacing); this.remaining = this.spacing;
  }
  move(point, emit) {
    const dx = point.x - this.last.x, dy = point.y - this.last.y, distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || !distance) return false;
    let spacing = this.spacing, travel = this.remaining;
    // Bound work on extreme pointer jumps in a zoomed-out, expanded world.
    if ((distance - travel) / spacing >= 160) { spacing = distance / 160; travel = spacing; }
    for (let count = 0; travel <= distance + 1e-8 && count < 160; travel += spacing, count++) {
      const t = Math.min(1, travel / distance);
      emit({ x: this.last.x + dx * t, y: this.last.y + dy * t });
    }
    this.remaining = Math.min(this.spacing, Math.max(1e-8, travel - distance)); this.last = { ...point }; return true;
  }
}

export function accumulatesWhileHeld(tool, mode) {
  return !['stamp', 'pan', 'scatter', 'place-object', 'erase-object'].includes(tool) && !(mode === 'blend' && ['raise', 'lower'].includes(tool));
}
