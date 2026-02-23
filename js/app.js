import { state } from './state.js';
import * as player from './player.js';
import * as ui from './ui.js';
import { requireAuthOrRedirect, setupTopbarAuth } from './auth-ui.js';
import { initMobileTopbar } from './mobile-topbar.js';

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
  setupTopbarAuth();

  // コントロールボタン
  document.getElementById('playBtn').addEventListener('click', player.togglePlay);
  document.getElementById('prevBtn').addEventListener('click', player.prev);
  document.getElementById('nextBtn').addEventListener('click', player.next);
  document.getElementById('repeatBtn').addEventListener('click', player.toggleRepeat);

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

  // データ読み込み
  fetch('data/data.json')
    .then(r => r.json())
    .then(d => {
      state.DATA = d;
      const tabsEl = document.getElementById('trackTabs');
      state.DATA.forEach((t, i) => {
        const btn = document.createElement('button');
        btn.className = 'track-tab' + (i === 0 ? ' active' : '');
        btn.textContent = t.label;
        btn.addEventListener('click', () => ui.selectTrack(i));
        tabsEl.appendChild(btn);
        state.revealedState[i] = new Array(t.segments.length).fill(false);
      });
      ui.selectTrack(0);
    });
}

bootstrap();
