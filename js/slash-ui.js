import { state } from './slash-state.js';
import { getCount, incrementCount, saveOrder } from './progress-db.js';
import { enableSidebarDnD } from './sidebar-sortable.js';

let detachSetDnD = null;

function initializeEntryState(entries) {
  state.entryOpen = entries.map((_, i) => i === 0);
  state.slashVisible = entries.map((entry) => new Array(entry.chunks.length).fill(false));
  state.jaVisible = entries.map((entry) => new Array(entry.chunks.length).fill(false));
}

export function selectSet(setIdx) {
  state.currentSetIdx = setIdx;
  state.entries = state.sets[setIdx].entries;
  initializeEntryState(state.entries);
  renderSetList();
  renderList();
}

export function renderSetList() {
  const list = document.getElementById('setList');
  list.innerHTML = '';

  state.sets.forEach((set, i) => {
    const btn = document.createElement('button');
    btn.className = `set-btn sortable-item${i === state.currentSetIdx ? ' active' : ''}`;
    btn.type = 'button';
    btn.dataset.setId = set.id;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = set.label;
    btn.appendChild(labelSpan);

    const practiced = set.entries.filter((entry, entryIdx) => {
      const key = `slash:${set.id}:${entry.id || `entry-${entryIdx}`}`;
      return (state.countMap[key] || 0) > 0;
    }).length;
    const badge = document.createElement('span');
    badge.className = 'set-progress-badge';
    badge.id = `set-badge-${set.id}`;
    badge.textContent = `${practiced}/${set.entries.length}`;
    badge.style.display = practiced > 0 ? '' : 'none';
    btn.appendChild(badge);

    btn.addEventListener('click', () => selectSet(i));
    list.appendChild(btn);
  });

  if (detachSetDnD) detachSetDnD();
  detachSetDnD = enableSidebarDnD({
    container: list,
    itemSelector: '.set-btn',
    getId: (el) => el.dataset.setId || '',
    onReorder: async (orderedIds) => {
      const currentId = state.sets[state.currentSetIdx]?.id;
      const map = new Map(state.sets.map((set) => [set.id, set]));
      const next = [];

      orderedIds.forEach((id) => {
        const set = map.get(id);
        if (!set) return;
        next.push(set);
        map.delete(id);
      });
      map.forEach((set) => next.push(set));

      state.sets = next;
      state.currentSetIdx = Math.max(
        0,
        state.sets.findIndex((set) => set.id === currentId)
      );
      state.entries = state.sets[state.currentSetIdx]?.entries || [];
      if (state.entryOpen.length !== state.entries.length) {
        initializeEntryState(state.entries);
      }
      await saveOrder('slash', orderedIds);
      renderSetList();
      renderList();
    }
  });
}

function toggleEntry(entryIdx) {
  state.entryOpen[entryIdx] = !state.entryOpen[entryIdx];
  const body = document.getElementById(`entry-body-${entryIdx}`);
  const btn = document.getElementById(`entry-toggle-${entryIdx}`);
  body.classList.toggle('hidden', !state.entryOpen[entryIdx]);
  btn.textContent = state.entryOpen[entryIdx] ? '閉じる' : '開く';
}

function toggleSlash(entryIdx, chunkIdx) {
  state.slashVisible[entryIdx][chunkIdx] = !state.slashVisible[entryIdx][chunkIdx];
  const panel = document.getElementById(`slash-${entryIdx}-${chunkIdx}`);
  const btn = document.getElementById(`btn-slash-${entryIdx}-${chunkIdx}`);
  panel.classList.toggle('hidden', !state.slashVisible[entryIdx][chunkIdx]);
  btn.classList.toggle('on', state.slashVisible[entryIdx][chunkIdx]);
}

function toggleJa(entryIdx, chunkIdx) {
  state.jaVisible[entryIdx][chunkIdx] = !state.jaVisible[entryIdx][chunkIdx];
  const panel = document.getElementById(`ja-${entryIdx}-${chunkIdx}`);
  const btn = document.getElementById(`btn-ja-${entryIdx}-${chunkIdx}`);
  panel.classList.toggle('hidden', !state.jaVisible[entryIdx][chunkIdx]);
  btn.classList.toggle('on', state.jaVisible[entryIdx][chunkIdx]);
}

function buildChunk(entryIdx, chunkIdx, chunk) {
  const block = document.createElement('section');
  block.className = 'chunk-card';

  const head = document.createElement('div');
  head.className = 'chunk-head';

  const label = document.createElement('span');
  label.className = 'chunk-label';
  label.textContent = `Chunk ${String(chunkIdx + 1).padStart(2, '0')}`;

  const actions = document.createElement('div');
  actions.className = 'actions';

  const slashBtn = document.createElement('button');
  slashBtn.id = `btn-slash-${entryIdx}-${chunkIdx}`;
  slashBtn.className = 'toggle-btn';
  slashBtn.textContent = 'Slash';
  slashBtn.addEventListener('click', () => toggleSlash(entryIdx, chunkIdx));

  const jaBtn = document.createElement('button');
  jaBtn.id = `btn-ja-${entryIdx}-${chunkIdx}`;
  jaBtn.className = 'toggle-btn';
  jaBtn.textContent = 'JP';
  jaBtn.addEventListener('click', () => toggleJa(entryIdx, chunkIdx));

  actions.appendChild(slashBtn);
  actions.appendChild(jaBtn);

  head.appendChild(label);
  head.appendChild(actions);

  const base = document.createElement('p');
  base.className = 'base-text';
  base.textContent = chunk.en;

  const slash = document.createElement('p');
  slash.id = `slash-${entryIdx}-${chunkIdx}`;
  slash.className = 'slash-text hidden';
  slash.textContent = chunk.slash;

  const ja = document.createElement('p');
  ja.id = `ja-${entryIdx}-${chunkIdx}`;
  ja.className = 'ja-text hidden';
  ja.textContent = chunk.ja;

  block.appendChild(head);
  block.appendChild(base);
  block.appendChild(slash);
  block.appendChild(ja);

  return block;
}

function buildEntryCounterKey(setId, entryId, entryIdx) {
  const safeEntryId = entryId || `entry-${entryIdx}`;
  return `slash:${setId}:${safeEntryId}`;
}

function refreshCurrentSetBadge() {
  const set = state.sets[state.currentSetIdx];
  if (!set) return;
  const badgeEl = document.getElementById(`set-badge-${set.id}`);
  if (!badgeEl) return;
  const practiced = set.entries.filter((entry, entryIdx) => {
    const key = `slash:${set.id}:${entry.id || `entry-${entryIdx}`}`;
    return (state.countMap[key] || 0) > 0;
  }).length;
  badgeEl.textContent = `${practiced}/${set.entries.length}`;
  badgeEl.style.display = practiced > 0 ? '' : 'none';
}

async function hydrateEntryCount(counterKey, countEl) {
  if (Object.prototype.hasOwnProperty.call(state.countMap, counterKey)) {
    countEl.textContent = `${state.countMap[counterKey]}回`;
    return;
  }
  const count = await getCount(counterKey);
  state.countMap[counterKey] = count;
  countEl.textContent = `${count}回`;
  refreshCurrentSetBadge();
}

export function renderList() {
  const list = document.getElementById('readingList');
  list.innerHTML = '';
  const currentSet = state.sets[state.currentSetIdx];
  document.getElementById('setName').textContent = currentSet.label;

  state.entries.forEach((entry, entryIdx) => {
    const card = document.createElement('article');
    card.className = 'reading-card';

    const head = document.createElement('div');
    head.className = 'reading-head';

    const title = document.createElement('h2');
    title.className = 'reading-title';
    title.textContent = `${String(entryIdx + 1).padStart(2, '0')}. ${entry.title}`;

    const meta = document.createElement('div');
    meta.className = 'entry-meta';

    const chunkCount = document.createElement('span');
    chunkCount.className = 'chunk-count';
    chunkCount.textContent = `${entry.chunks.length} chunks`;

    const countWrap = document.createElement('div');
    countWrap.className = 'count-wrap';

    const countChip = document.createElement('span');
    countChip.className = 'count-chip';
    countChip.textContent = '0回';

    const countBtn = document.createElement('button');
    countBtn.className = 'count-btn';
    countBtn.type = 'button';
    countBtn.textContent = '+1';
    countBtn.addEventListener('click', async () => {
      const key = buildEntryCounterKey(currentSet.id, entry.id, entryIdx);
      const next = await incrementCount(key);
      state.countMap[key] = next;
      countChip.textContent = `${next}回`;
    });

    countWrap.append(countChip, countBtn);

    const entryBtn = document.createElement('button');
    entryBtn.id = `entry-toggle-${entryIdx}`;
    entryBtn.className = 'entry-toggle-btn';
    entryBtn.textContent = state.entryOpen[entryIdx] ? '閉じる' : '開く';
    entryBtn.addEventListener('click', () => toggleEntry(entryIdx));

    meta.appendChild(chunkCount);
    meta.appendChild(countWrap);
    meta.appendChild(entryBtn);

    head.appendChild(title);
    head.appendChild(meta);

    const body = document.createElement('div');
    body.id = `entry-body-${entryIdx}`;
    body.className = `entry-body${state.entryOpen[entryIdx] ? '' : ' hidden'}`;

    entry.chunks.forEach((chunk, chunkIdx) => {
      body.appendChild(buildChunk(entryIdx, chunkIdx, chunk));
    });

    card.appendChild(head);
    card.appendChild(body);
    list.appendChild(card);

    const counterKey = buildEntryCounterKey(currentSet.id, entry.id, entryIdx);
    hydrateEntryCount(counterKey, countChip);
  });

  const totalChunks = state.entries.reduce((sum, entry) => sum + entry.chunks.length, 0);
  document.getElementById('metaCount').textContent = `${state.entries.length} entries / ${totalChunks} chunks`;
}
