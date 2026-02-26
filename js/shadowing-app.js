import { state } from './shadowing-state.js';
import { selectSet } from './shadowing-ui.js';
import { requireAuthOrRedirect, setupTopbarAuth } from './auth-ui.js';
import { initMobileTopbar } from './mobile-topbar.js';
import { getOrder, initProgressDb } from './progress-db.js';

function normalizeSets(raw) {
  if (Array.isArray(raw)) {
    return [
      {
        id: 'shadowing-set-1',
        label: 'Shadowing',
        entries: raw
      }
    ];
  }

  if (raw && Array.isArray(raw.sets)) {
    return raw.sets.map((set, idx) => ({
      id: set.id || `shadowing-set-${idx + 1}`,
      label: set.label || `Set ${idx + 1}`,
      entries: Array.isArray(set.entries) ? set.entries : []
    }));
  }

  return [];
}

function applySetOrder(sets, orderedIds) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) return sets;

  const map = new Map(sets.map((set) => [set.id, set]));
  const next = [];

  orderedIds.forEach((id) => {
    const set = map.get(id);
    if (!set) return;
    next.push(set);
    map.delete(id);
  });

  map.forEach((set) => next.push(set));
  return next;
}

function initSidebarToggle() {
  const toggleBtn = document.getElementById('sidebarToggle');
  const layout = document.querySelector('.layout');
  if (!toggleBtn || !layout) return;

  const collapsed = localStorage.getItem('sidebarCollapsed') === '1';
  if (collapsed) {
    layout.classList.add('sidebar-collapsed');
    toggleBtn.textContent = '›';
  }

  toggleBtn.addEventListener('click', () => {
    const isCollapsed = layout.classList.toggle('sidebar-collapsed');
    toggleBtn.textContent = isCollapsed ? '›' : '‹';
    localStorage.setItem('sidebarCollapsed', isCollapsed ? '1' : '0');
  });
}

async function bootstrap() {
  const isAuthenticated = await requireAuthOrRedirect();
  if (!isAuthenticated) return;
  initMobileTopbar();
  setupTopbarAuth();
  initSidebarToggle();
  await initProgressDb();

  try {
    const response = await fetch('data/shadowing-data.json');
    const data = await response.json();
    state.DATA = data;
    const sets = normalizeSets(data);
    const orderedIds = await getOrder('shadowing');
    state.sets = applySetOrder(sets, orderedIds);
    if (!state.sets.length) return;
    selectSet(0);
  } catch (e) {
    console.error(e);
    const el = document.getElementById('metaCount');
    if (el) el.textContent = 'data load error';
  }
}

bootstrap();
