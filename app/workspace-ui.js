import { TILE } from './world.js';
import { DEFAULT_RENDER_DISTANCE, MIN_RENDER_DISTANCE, maximumRenderDistance, normalizeRenderDistance } from './terrain-window.js';

// Workspace preferences stay separate from saved terrain and undo history.
export function initWorkspaceUI(onRenderDistance, getBounds) {
  const key = 'fmm-workspace-ui-v1';
  let preferences = {};
  try { const saved = JSON.parse(localStorage.getItem(key)); if (saved && typeof saved === 'object' && !Array.isArray(saved)) preferences = saved; } catch { /* Storage can be disabled. */ }
  if (!preferences.panels || typeof preferences.panels !== 'object' || Array.isArray(preferences.panels)) preferences.panels = {};
  const save = () => { try { localStorage.setItem(key, JSON.stringify(preferences)); } catch { /* Controls still work without storage. */ } };
  if (!preferences.hiddenMenus || typeof preferences.hiddenMenus !== 'object' || Array.isArray(preferences.hiddenMenus)) preferences.hiddenMenus = {};
  const menus = [
    { name: 'left', region: document.querySelector('#menu-left'), button: document.querySelector('#toggle-left-menu'), openArrow: '<', closedArrow: '>' },
    { name: 'right', region: document.querySelector('#menu-right'), button: document.querySelector('#toggle-right-menu'), openArrow: '>', closedArrow: '<' },
    { name: 'top', region: document.querySelector('#menu-topbar'), button: document.querySelector('#toggle-top-menu'), openArrow: '⌃', closedArrow: '⌄' },
  ];
  const positionTabs = () => {
    const area = document.querySelector('main').getBoundingClientRect(), header = menus[2].region.getBoundingClientRect();
    const middle = Math.max(75, Math.min(window.innerHeight - 65, area.top + area.height / 2));
    menus[0].button.style.left = Math.max(0, area.left) + 'px';
    menus[1].button.style.right = Math.max(0, window.innerWidth - area.right) + 'px';
    for (const menu of menus.slice(0, 2)) menu.button.style.top = middle + 'px';
    menus[2].button.style.top = Math.max(0, header.bottom) + 'px';
  };
  let tabFrame;
  const scheduleTabs = () => {
    if (tabFrame) return;
    tabFrame = requestAnimationFrame(() => { tabFrame = null; positionTabs(); });
  };
  const applyMenu = menu => {
    const hidden = preferences.hiddenMenus[menu.name] === true;
    menu.region.hidden = hidden;
    document.body.classList.toggle('menu-' + menu.name + '-hidden', hidden);
    menu.button.textContent = hidden ? menu.closedArrow : menu.openArrow;
    menu.button.setAttribute('aria-expanded', String(!hidden));
    const label = (hidden ? 'Show ' : 'Hide ') + menu.name + ' menu';
    menu.button.setAttribute('aria-label', label); menu.button.title = label;
    scheduleTabs();
  };
  for (const menu of menus) {
    applyMenu(menu);
    menu.button.onclick = () => {
      preferences.hiddenMenus[menu.name] = !menu.region.hidden;
      applyMenu(menu); save();
    };
  }
  // The canvases already observe their parent sizes; keep the tabs at those same edges.
  const menuObserver = new ResizeObserver(scheduleTabs);
  menuObserver.observe(document.querySelector('main'));
  menuObserver.observe(menus[2].region);
  window.addEventListener('resize', scheduleTabs);
  window.addEventListener('scroll', scheduleTabs, { passive: true });
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
  slider.min = MIN_RENDER_DISTANCE;
  let fullMap = preferences.fullMap === true, lastSignature;
  const updateDistance = () => {
    const bounds = getBounds(), maximum = maximumRenderDistance(bounds);
    const distance = fullMap ? maximum : normalizeRenderDistance(slider.value, maximum);
    slider.value = distance;
    const samples = (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY);
    output.textContent = distance === maximum ? 'Entire map · ' + samples.toLocaleString() + ' samples' : (distance * TILE).toLocaleString() + ' sample radius';
    slider.setAttribute('aria-valuetext', output.textContent);
    onRenderDistance(distance);
  };
  const sync = () => {
    const bounds = getBounds(), signature = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].join();
    if (signature === lastSignature) return;
    lastSignature = signature; slider.max = maximumRenderDistance(bounds);
    slider.value = normalizeRenderDistance(preferences.renderDistance ?? DEFAULT_RENDER_DISTANCE, +slider.max);
    updateDistance();
  };
  slider.addEventListener('input', () => { fullMap = +slider.value === +slider.max; updateDistance(); preferences.fullMap = fullMap; preferences.renderDistance = +slider.value; save(); });
  sync();
  return sync;
}
