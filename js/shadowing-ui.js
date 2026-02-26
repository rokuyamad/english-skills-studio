import { state } from './shadowing-state.js';
import { enableSidebarDnD } from './sidebar-sortable.js';
import { getCount, incrementCount, saveOrder } from './progress-db.js';

const setListEl = document.getElementById('setList');
const setNameEl = document.getElementById('setName');
const metaCountEl = document.getElementById('metaCount');
const shadowingListEl = document.getElementById('shadowingList');
let detachSetDnD = null;

function toEmbedUrl(url = '') {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '');
      return `https://www.youtube.com/embed/${id}?rel=0`;
    }
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}?rel=0`;
    }
  } catch (_) {
    return '';
  }
  return '';
}

function renderSetList() {
  if (!setListEl) return;
  setListEl.innerHTML = '';

  state.sets.forEach((set, idx) => {
    const btn = document.createElement('button');
    btn.className = `set-btn sortable-item${idx === state.currentSetIdx ? ' active' : ''}`;
    btn.type = 'button';
    btn.dataset.setId = set.id;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = set.label;
    btn.appendChild(labelSpan);

    const practiced = set.entries.filter((entry, entryIdx) => {
      const key = `shadowing:${set.id}:${entry.id || `entry-${entryIdx}`}`;
      return (state.countMap[key] || 0) > 0;
    }).length;
    const badge = document.createElement('span');
    badge.className = 'set-progress-badge';
    badge.id = `set-badge-${set.id}`;
    badge.textContent = `${practiced}/${set.entries.length}`;
    badge.style.display = practiced > 0 ? '' : 'none';
    btn.appendChild(badge);

    btn.addEventListener('click', () => selectSet(idx));
    setListEl.appendChild(btn);
  });

  if (detachSetDnD) detachSetDnD();
  detachSetDnD = enableSidebarDnD({
    container: setListEl,
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
      const currentSet = state.sets[state.currentSetIdx];
      if (currentSet) {
        state.entries = currentSet.entries || [];
        if (setNameEl) setNameEl.textContent = currentSet.label || 'Shadowing';
        if (metaCountEl) metaCountEl.textContent = `${state.entries.length} videos`;
      }
      await saveOrder('shadowing', orderedIds);
      renderSetList();
    }
  });
}

function buildEntryCounterKey(setId, entryId, entryIdx) {
  const safeEntryId = entryId || `entry-${entryIdx}`;
  return `shadowing:${setId}:${safeEntryId}`;
}

function refreshCurrentSetBadge() {
  const set = state.sets[state.currentSetIdx];
  if (!set) return;
  const badgeEl = document.getElementById(`set-badge-${set.id}`);
  if (!badgeEl) return;
  const practiced = set.entries.filter((entry, entryIdx) => {
    const key = `shadowing:${set.id}:${entry.id || `entry-${entryIdx}`}`;
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

function renderEntries() {
  if (!shadowingListEl) return;
  shadowingListEl.innerHTML = '';
  const currentSet = state.sets[state.currentSetIdx];

  state.entries.forEach((entry, idx) => {
    const card = document.createElement('article');
    card.className = 'shadowing-card';

    const title = document.createElement('h3');
    title.className = 'shadowing-title';
    title.textContent = `${idx + 1}. ${entry.title}`;

    const meta = document.createElement('div');
    meta.className = 'shadowing-meta';
    meta.textContent = `WPM: ${entry.wpm ?? '-'}`;

    const actions = document.createElement('div');
    actions.className = 'shadowing-actions';

    const openInYoutube = document.createElement('a');
    openInYoutube.className = 'yt-link';
    openInYoutube.href = entry.youtubeUrl;
    openInYoutube.target = '_blank';
    openInYoutube.rel = 'noopener noreferrer';
    openInYoutube.textContent = 'YouTubeで開く';

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
      const key = buildEntryCounterKey(currentSet.id, entry.id, idx);
      const next = await incrementCount(key);
      state.countMap[key] = next;
      countChip.textContent = `${next}回`;
    });

    countWrap.append(countChip, countBtn);

    const toggle = document.createElement('button');
    const isOpen = Boolean(state.openMap[entry.id]);
    toggle.className = `toggle-btn${isOpen ? ' on' : ''}`;
    toggle.type = 'button';
    toggle.textContent = isOpen ? '埋め込みを閉じる' : '埋め込みを表示';

    const body = document.createElement('div');
    body.className = `shadowing-body${isOpen ? '' : ' hidden'}`;

    const embedUrl = toEmbedUrl(entry.youtubeUrl);
    if (embedUrl) {
      const iframe = document.createElement('iframe');
      iframe.className = 'shadowing-iframe';
      iframe.src = embedUrl;
      iframe.title = `${entry.title} - YouTube`;
      iframe.loading = 'lazy';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allowFullscreen = true;
      body.appendChild(iframe);
    }

    toggle.addEventListener('click', () => {
      state.openMap[entry.id] = !state.openMap[entry.id];
      renderEntries();
    });

    actions.append(openInYoutube, countWrap, toggle);
    card.append(title, meta, actions, body);
    shadowingListEl.appendChild(card);

    const counterKey = buildEntryCounterKey(currentSet.id, entry.id, idx);
    hydrateEntryCount(counterKey, countChip);
  });
}

export function selectSet(setIdx) {
  state.currentSetIdx = setIdx;
  const set = state.sets[setIdx];
  if (!set) return;

  state.entries = set.entries || [];
  state.openMap = {};

  if (setNameEl) setNameEl.textContent = set.label || 'Shadowing';
  if (metaCountEl) metaCountEl.textContent = `${state.entries.length} videos`;

  renderSetList();
  renderEntries();
}
