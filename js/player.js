import { state } from './state.js';

let _setWave, _updateUI;

export function init({ setWave, updateUI }) {
  _setWave = setWave;
  _updateUI = updateUI;
}

export function loadAndPlay(idx) {
  if(state.audio) { state.audio.pause(); state.audio = null; }
  state.current = idx;
  _updateUI();
  const key = state.DATA[state.trackIdx].key;
  const src = 'audio/segments/' + key + '/' + String(state.current).padStart(2,'0') + '.mp3';
  state.audio = new Audio(src);
  state.audio.playbackRate = state.speed;
  state.audio.onended = () => {
    _setWave(false); state.playing = false;
    const playBtn = document.getElementById('playBtn');
    playBtn.textContent = '▶';
    playBtn.classList.remove('playing');
    const n = state.DATA[state.trackIdx].segments.length;
    if(state.repeat) setTimeout(() => loadAndPlay(state.current), 0);
    else if(state.current < n-1) setTimeout(() => loadAndPlay(state.current+1), 0);
  };
  state.audio.play().catch(e => console.log(e));
  state.playing = true;
  _setWave(true);
  const playBtn = document.getElementById('playBtn');
  playBtn.textContent = '⏸';
  playBtn.classList.add('playing');
}

export function togglePlay() {
  if(state.playing) {
    state.audio.pause(); state.playing = false; _setWave(false);
    const playBtn = document.getElementById('playBtn');
    playBtn.textContent = '▶';
    playBtn.classList.remove('playing');
  } else {
    if(state.audio && state.audio.paused) {
      state.audio.play(); state.playing = true; _setWave(true);
      const playBtn = document.getElementById('playBtn');
      playBtn.textContent = '⏸';
      playBtn.classList.add('playing');
    } else loadAndPlay(state.current);
  }
}

export function prev() {
  if(state.current > 0) loadAndPlay(state.current - 1);
}

export function next() {
  const n = state.DATA[state.trackIdx].segments.length;
  if(state.current < n-1) loadAndPlay(state.current + 1);
}

export function toggleRepeat() {
  state.repeat = !state.repeat;
  syncRepeatButtonLabel();
}

function isPlayerCompact() {
  const playerBar = document.querySelector('.player-bar');
  return Boolean(playerBar && playerBar.classList.contains('compact'));
}

export function syncRepeatButtonLabel() {
  const btn = document.getElementById('repeatBtn');
  if (!btn) return;
  btn.textContent = isPlayerCompact() ? '↺' : (state.repeat ? '↺ ON' : '↺ OFF');
  btn.classList.toggle('on', state.repeat);
  btn.setAttribute('aria-pressed', state.repeat ? 'true' : 'false');
}

export function setSpeed(s, el) {
  state.speed = s;
  if(state.audio) state.audio.playbackRate = s;
  document.querySelectorAll('.spd-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
}
