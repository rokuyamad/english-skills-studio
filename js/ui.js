import { state } from './state.js';
import { getCount, incrementCount } from './progress-db.js';

let _loadAndPlay;
const MASK_TEXT = '*****';

export function init({ loadAndPlay }) {
  _loadAndPlay = loadAndPlay;
}

export function applyMobileLayout() {
  // 新レイアウトではCSSのみで対応するためDOM操作不要
}

export function buildSentenceList() {
  const list = document.getElementById('sentenceList');
  list.innerHTML = '';
  const track = state.DATA[state.trackIdx];
  track.segments.forEach((seg, i) => {
    const revealed = state.revealedState[state.trackIdx][i];
    const div = document.createElement('div');
    div.className = 'sentence-item' + (i === state.current ? ' active' : '');
    div.id = 'sent-' + i;
    div.onclick = (e) => {
      if (!e.target.closest('.script-btn') && !e.target.closest('.count-btn')) _loadAndPlay(i);
    };

    const numEl = document.createElement('span');
    numEl.className = 'sent-num';
    numEl.textContent = String(i+1).padStart(2,'0');

    const textEl = document.createElement('span');
    textEl.className = 'sent-text' + (revealed ? '' : ' masked');
    textEl.id = 'text-' + i;
    textEl.textContent = revealed ? seg.transcript : MASK_TEXT;

    const scriptBtn = document.createElement('button');
    scriptBtn.className = 'script-btn' + (revealed ? ' on' : '');
    scriptBtn.textContent = 'Script';
    scriptBtn.onclick = (e) => { e.stopPropagation(); toggleReveal(i); };

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

    countWrap.appendChild(countEl);
    countWrap.appendChild(countBtn);

    div.appendChild(numEl);
    div.appendChild(textEl);
    div.appendChild(scriptBtn);
    div.appendChild(countWrap);
    list.appendChild(div);

    hydrateSentenceCount(track.key, i, countEl);
  });
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

export function toggleReveal(i) {
  state.revealedState[state.trackIdx][i] = !state.revealedState[state.trackIdx][i];
  const revealed = state.revealedState[state.trackIdx][i];
  const seg = state.DATA[state.trackIdx].segments[i];
  const textEl = document.getElementById('text-' + i);
  textEl.className = 'sent-text' + (revealed ? '' : ' masked');
  textEl.textContent = revealed ? seg.transcript : MASK_TEXT;
  textEl.nextElementSibling.classList.toggle('on', revealed);
}

export function updateUI() {
  const segs = state.DATA[state.trackIdx].segments;
  document.getElementById('trackName').textContent = state.DATA[state.trackIdx].label;
  document.getElementById('metaCount').textContent = segs.length + ' sentences';
  document.getElementById('timeEl').textContent = String(state.current+1).padStart(2,'0');
  document.getElementById('totalTime').textContent = String(segs.length).padStart(2,'0');
  document.querySelectorAll('.sentence-item').forEach((el,i) => el.classList.toggle('active', i === state.current));
  const activeEl = document.getElementById('sent-' + state.current);
  if(activeEl) activeEl.scrollIntoView({block:'nearest', behavior:'smooth'});
}

export function setWave(on) {
  document.querySelectorAll('.wbar').forEach(b => b.classList.toggle('active', on));
  document.getElementById('vinyl').classList.toggle('spinning', on);
}

export function selectTrack(i) {
  if(state.audio) { state.audio.pause(); state.audio = null; }
  state.playing = false; setWave(false);
  state.trackIdx = i; state.current = 0;
  document.querySelectorAll('.track-tab').forEach((t,j) => t.classList.toggle('active', j === i));
  const playBtn = document.getElementById('playBtn');
  playBtn.textContent = '▶';
  playBtn.classList.remove('playing');
  const key = state.DATA[i].key;
  document.getElementById('jacketBg').style.backgroundImage = `url('images/${key}.jpg')`;
  buildSentenceList(); updateUI();
}
