import { state } from './shadowing-state.js';

const setListEl = document.getElementById('setList');
const setNameEl = document.getElementById('setName');
const metaCountEl = document.getElementById('metaCount');
const shadowingListEl = document.getElementById('shadowingList');

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
    btn.className = `set-btn${idx === state.currentSetIdx ? ' active' : ''}`;
    btn.type = 'button';
    btn.textContent = set.label;
    btn.addEventListener('click', () => selectSet(idx));
    setListEl.appendChild(btn);
  });
}

function renderEntries() {
  if (!shadowingListEl) return;
  shadowingListEl.innerHTML = '';

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

    actions.append(openInYoutube, toggle);
    card.append(title, meta, actions, body);
    shadowingListEl.appendChild(card);
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
