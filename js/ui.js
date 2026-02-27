import { state } from './state.js';
import { getCount, incrementCount } from './progress-db.js';

let _loadAndPlay;
const MASK_TEXT = '*****';

export function init({ loadAndPlay }) {
  _loadAndPlay = loadAndPlay;
}

export function applyMobileLayout() {
  // レイアウト調整はCSSメディアクエリで処理
}

function getSentenceCounterKey(trackKey, sentenceIdx) {
  return `imitation:${trackKey}:${sentenceIdx}`;
}

async function hydrateSentenceCount(trackKey, sentenceIdx, countEl) {
  const key = getSentenceCounterKey(trackKey, sentenceIdx);
  if (Object.prototype.hasOwnProperty.call(state.countMap, key)) {
    countEl.textContent = `${state.countMap[key]}回`;
    return;
  }
  const count = await getCount(key);
  state.countMap[key] = count;
  countEl.textContent = `${count}回`;
}

function createSentenceItem(track, seg, i) {
  const revealed = state.revealedState[state.trackIdx][i];

  const item = document.createElement('article');
  item.className = 'sentence-item' + (i === state.current ? ' active' : '');
  item.id = 'sent-' + i;
  item.onclick = (e) => {
    if (!e.target.closest('.script-btn') && !e.target.closest('.count-btn')) {
      _loadAndPlay(i);
    }
  };

  const numEl = document.createElement('span');
  numEl.className = 'sent-num';
  numEl.textContent = String(i + 1).padStart(2, '0');

  const textEl = document.createElement('p');
  textEl.className = 'sent-text' + (revealed ? '' : ' masked');
  textEl.id = 'text-' + i;
  textEl.textContent = revealed ? seg.transcript : MASK_TEXT;

  const scriptBtn = document.createElement('button');
  scriptBtn.className = 'script-btn' + (revealed ? ' on' : '');
  scriptBtn.type = 'button';
  scriptBtn.textContent = revealed ? 'Script ON' : 'Script';
  scriptBtn.onclick = (e) => {
    e.stopPropagation();
    toggleReveal(i);
  };

  const countWrap = document.createElement('div');
  countWrap.className = 'count-wrap';

  const countEl = document.createElement('span');
  countEl.className = 'count-chip';
  countEl.textContent = '0回';

  const countBtn = document.createElement('button');
  countBtn.className = 'count-btn';
  countBtn.type = 'button';
  countBtn.textContent = '+1';
  countBtn.onclick = async (e) => {
    e.stopPropagation();
    const key = getSentenceCounterKey(track.key, i);
    const next = await incrementCount(key);
    state.countMap[key] = next;
    countEl.textContent = `${next}回`;
  };

  countWrap.append(countEl, countBtn);
  item.append(numEl, textEl, scriptBtn, countWrap);

  hydrateSentenceCount(track.key, i, countEl);
  return item;
}

export function buildSentenceList() {
  const list = document.getElementById('sentenceList');
  list.innerHTML = '';

  const track = state.DATA[state.trackIdx];
  track.segments.forEach((seg, i) => {
    list.appendChild(createSentenceItem(track, seg, i));
  });
}

export function toggleReveal(i) {
  state.revealedState[state.trackIdx][i] = !state.revealedState[state.trackIdx][i];
  const revealed = state.revealedState[state.trackIdx][i];
  const seg = state.DATA[state.trackIdx].segments[i];

  const textEl = document.getElementById('text-' + i);
  textEl.className = 'sent-text' + (revealed ? '' : ' masked');
  textEl.textContent = revealed ? seg.transcript : MASK_TEXT;

  const btn = textEl.nextElementSibling;
  if (btn) {
    btn.classList.toggle('on', revealed);
    btn.textContent = revealed ? 'Script ON' : 'Script';
  }
}

function updateProgress() {
  const total = state.DATA[state.trackIdx].segments.length;
  const current = state.current + 1;
  const ratio = total > 0 ? (current / total) * 100 : 0;
  const progressFill = document.getElementById('sessionProgress');
  if (progressFill) progressFill.style.width = `${ratio}%`;

  const note = document.getElementById('progressNote');
  if (note) {
    if (ratio === 100) note.textContent = 'Complete';
    else if (ratio >= 70) note.textContent = 'Deep Focus';
    else if (ratio >= 35) note.textContent = 'On Rhythm';
    else note.textContent = 'Warm-up';
  }
}

export function updateUI() {
  const segs = state.DATA[state.trackIdx].segments;
  const current = String(state.current + 1).padStart(2, '0');
  const total = String(segs.length).padStart(2, '0');
  document.getElementById('trackName').textContent = state.DATA[state.trackIdx].label;
  document.getElementById('metaCount').textContent = `${segs.length} sentences`;
  document.getElementById('timeEl').textContent = current;
  document.getElementById('totalTime').textContent = total;
  const compactCounter = document.getElementById('compactCounter');
  if (compactCounter) compactCounter.textContent = `${current}/${total}`;

  document.querySelectorAll('.sentence-item').forEach((el, i) => {
    el.classList.toggle('active', i === state.current);
  });

  const activeEl = document.getElementById('sent-' + state.current);
  if (activeEl) activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });

  updateProgress();
}

export function setWave(on) {
  document.querySelectorAll('.wbar').forEach((b) => b.classList.toggle('active', on));
  document.getElementById('vinyl').classList.toggle('spinning', on);
}

export function selectTrack(i) {
  if (state.audio) {
    state.audio.pause();
    state.audio = null;
  }
  state.playing = false;
  setWave(false);
  state.trackIdx = i;
  state.current = 0;

  document.querySelectorAll('.track-tab').forEach((t, j) => t.classList.toggle('active', j === i));

  const playBtn = document.getElementById('playBtn');
  playBtn.textContent = '▶';
  playBtn.classList.remove('playing');

  buildSentenceList();
  updateUI();
}
