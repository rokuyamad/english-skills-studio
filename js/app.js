import { state } from './state.js';
import * as player from './player.js';
import * as ui from './ui.js';
import { requireAuthOrRedirect, setupTopbarAuth } from './auth-ui.js';
import { initMobileTopbar } from './mobile-topbar.js';
import { enableSidebarDnD } from './sidebar-sortable.js';
import { getOrder, initProgressDb, saveOrder } from './progress-db.js';

let detachTrackDnD = null;

function initPlayerCompactToggle() {
  const playerBar = document.querySelector('.player-bar');
  const toggleBtn = document.getElementById('playerCompactToggle');
  if (!playerBar || !toggleBtn) return;

  const mediaQuery = window.matchMedia('(max-width: 640px)');
  const storageKey = 'playerCompact';
  let preferredCompact = localStorage.getItem(storageKey) === '1';

  const applyCompactState = () => {
    const isCompact = mediaQuery.matches && preferredCompact;
    playerBar.classList.toggle('compact', isCompact);
    document.body.classList.toggle('player-compact', isCompact);
    toggleBtn.setAttribute('aria-expanded', String(!isCompact));
    toggleBtn.setAttribute('aria-label', isCompact ? 'プレイヤーを展開' : 'プレイヤーをコンパクト表示');
    toggleBtn.textContent = isCompact ? '⌃' : '⌄';
    player.syncRepeatButtonLabel();
  };

  toggleBtn.addEventListener('click', () => {
    preferredCompact = !preferredCompact;
    localStorage.setItem(storageKey, preferredCompact ? '1' : '0');
    applyCompactState();
  });

  const onMediaChange = () => applyCompactState();
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', onMediaChange);
  } else if (typeof mediaQuery.addListener === 'function') {
    mediaQuery.addListener(onMediaChange);
  }

  applyCompactState();
}

function applyTrackOrder(data, revealedState, orderedIds) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) {
    return { data, revealedState };
  }

  const map = new Map();
  data.forEach((track, idx) => {
    map.set(track.key, { track, revealed: revealedState[idx] || [] });
  });

  const nextData = [];
  const nextRevealed = [];

  orderedIds.forEach((id) => {
    const item = map.get(id);
    if (!item) return;
    nextData.push(item.track);
    nextRevealed.push(item.revealed);
    map.delete(id);
  });

  map.forEach((item) => {
    nextData.push(item.track);
    nextRevealed.push(item.revealed);
  });

  return { data: nextData, revealedState: nextRevealed };
}

function renderTrackTabs() {
  const tabsEl = document.getElementById('trackTabs');
  tabsEl.innerHTML = '';

  state.DATA.forEach((track, i) => {
    const btn = document.createElement('button');
    btn.className = 'track-tab sortable-item' + (i === state.trackIdx ? ' active' : '');
    btn.type = 'button';
    btn.textContent = track.label;
    btn.dataset.setId = track.key;
    btn.addEventListener('click', () => ui.selectTrack(i));
    tabsEl.appendChild(btn);
  });

  if (detachTrackDnD) detachTrackDnD();
  detachTrackDnD = enableSidebarDnD({
    container: tabsEl,
    itemSelector: '.track-tab',
    getId: (el) => el.dataset.setId || '',
    onReorder: async (orderedIds) => {
      const currentKey = state.DATA[state.trackIdx]?.key;
      const ordered = applyTrackOrder(state.DATA, state.revealedState, orderedIds);
      state.DATA = ordered.data;
      state.revealedState = ordered.revealedState;
      state.trackIdx = Math.max(
        0,
        state.DATA.findIndex((track) => track.key === currentKey)
      );

      await saveOrder('imitation', orderedIds);
      renderTrackTabs();
      ui.updateUI();
    }
  });
}

async function bootstrap() {
  const isAuthenticated = await requireAuthOrRedirect();
  if (!isAuthenticated) return;

  // 循環依存を init コールバックで解決
  player.init({ setWave: ui.setWave, updateUI: ui.updateUI });
  ui.init({ loadAndPlay: player.loadAndPlay });

  // Wave bars (PC only)
  const waveRow = document.getElementById('waveRow');
  for (let i = 0; i < 26; i++) {
    const b = document.createElement('div');
    b.className = 'wbar';
    b.style.height = (6 + Math.random() * 16) + 'px';
    b.style.setProperty('--s', (0.35 + Math.random() * 0.45).toFixed(2) + 's');
    b.style.animationDelay = (Math.random() * 0.3).toFixed(2) + 's';
    waveRow.appendChild(b);
  }

  // モバイルレイアウト
  ui.applyMobileLayout();
  window.addEventListener('resize', ui.applyMobileLayout);
  initMobileTopbar();
  initPlayerCompactToggle();
  setupTopbarAuth();

  // サイドバー折りたたみトグル
  const sidebarToggleBtn = document.getElementById('sidebarToggle');
  const layoutEl = document.querySelector('.layout');
  if (sidebarToggleBtn && layoutEl) {
    if (localStorage.getItem('sidebarCollapsed') === '1') {
      layoutEl.classList.add('sidebar-collapsed');
      sidebarToggleBtn.textContent = '›';
    }
    sidebarToggleBtn.addEventListener('click', () => {
      const isCollapsed = layoutEl.classList.toggle('sidebar-collapsed');
      sidebarToggleBtn.textContent = isCollapsed ? '›' : '‹';
      localStorage.setItem('sidebarCollapsed', isCollapsed ? '1' : '0');
    });
  }

  // コントロールボタン
  document.getElementById('playBtn').addEventListener('click', player.togglePlay);
  document.getElementById('prevBtn').addEventListener('click', player.prev);
  document.getElementById('nextBtn').addEventListener('click', player.next);
  document.getElementById('repeatBtn').addEventListener('click', player.toggleRepeat);
  player.syncRepeatButtonLabel();

  // 速度ボタン
  document.querySelectorAll('.spd-btn').forEach(btn => {
    btn.addEventListener('click', () => player.setSpeed(parseFloat(btn.dataset.speed), btn));
  });

  // キーボード操作
  document.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); player.togglePlay(); }
    if (e.code === 'ArrowRight') player.next();
    if (e.code === 'ArrowLeft') player.prev();
  });

  await initProgressDb();

  // データ読み込み
  const response = await fetch('data/data.json');
  const rawData = await response.json();
  const tracks = Array.isArray(rawData) ? rawData : [];

  const revealed = tracks.map((track) => new Array(track.segments.length).fill(false));
  const savedOrder = await getOrder('imitation');
  const ordered = applyTrackOrder(tracks, revealed, savedOrder);
  state.DATA = ordered.data;
  state.revealedState = ordered.revealedState;
  state.trackIdx = 0;

  renderTrackTabs();
  ui.selectTrack(0);
}

bootstrap();
