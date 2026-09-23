import { TILE } from './world.js';
import { DEFAULT_RENDER_DISTANCE, MIN_RENDER_DISTANCE, MAX_RENDER_DISTANCE, normalizeRenderDistance } from './terrain-window.js';

// Workspace preferences stay separate from saved terrain and undo history.
export function initWorkspaceUI(onRenderDistance) {
  const key = 'fmm-workspace-ui-v1';
  let preferences = {};
  try { const saved = JSON.parse(localStorage.getItem(key)); if (saved && typeof saved === 'object' && !Array.isArray(saved)) preferences = saved; } catch { /* Storage can be disabled. */ }
  if (!preferences.panels || typeof preferences.panels !== 'object' || Array.isArray(preferences.panels)) preferences.panels = {};
  const save = () => { try { localStorage.setItem(key, JSON.stringify(preferences)); } catch { /* Controls still work without storage. */ } };
  for (const sidebar of document.querySelectorAll('aside')) {
    const panels = [...sidebar.querySelectorAll('[data-panel]')];
    const button = sidebar.querySelector('[data-fold-panels]');
    const name = sidebar.classList.contains('left-sidebar') ? 'brush' : 'world';
    const anyOpen = () => panels.some(panel => panel.classList.contains('panel') && panel.open && !panel.hidden);
    const updateButton = () => {
      const expanded = anyOpen();
      button.textContent = expanded ? 'Collapse all' : 'Expand all';
      button.setAttribute('aria-label', `${button.textContent} ${name} panels`);
    };
    for (const panel of panels) {
      if (typeof preferences.panels[panel.id] === 'boolean') panel.open = preferences.panels[panel.id];
      panel.addEventListener('toggle', () => { preferences.panels[panel.id] = panel.open; save(); updateButton(); });
    }
    button.onclick = () => {
      const open = !anyOpen();
      for (const panel of panels) if (!panel.hidden) panel.open = open;
      updateButton();
    };
    updateButton();
  }
  const slider = document.querySelector('#render-distance'), output = document.querySelector('#render-distance-value');
  slider.min = MIN_RENDER_DISTANCE; slider.max = MAX_RENDER_DISTANCE;
  slider.value = normalizeRenderDistance(preferences.renderDistance ?? DEFAULT_RENDER_DISTANCE);
  const updateDistance = () => {
    const distance = normalizeRenderDistance(slider.value);
    output.textContent = `${(distance * TILE).toLocaleString()} samples`;
    slider.setAttribute('aria-valuetext', `${distance * TILE} samples around the 3D focus`);
    onRenderDistance(distance);
  };
  slider.addEventListener('input', () => { updateDistance(); preferences.renderDistance = +slider.value; save(); });
  updateDistance();
}
