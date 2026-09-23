// A failure in one viewport must not stop input, recovery, or the other viewport.
export function renderViews(views, onError) {
  for (const [name, view] of views) {
    if (!view || view.failed) continue;
    try { view.draw(); } catch (error) { view.failed = true; onError(name, error); }
  }
}
