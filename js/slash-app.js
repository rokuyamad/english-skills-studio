import { state } from './slash-state.js';
import { selectSet } from './slash-ui.js';

function splitEnglishSentences(text = '') {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const matches = normalized.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g);
  return (matches || []).map((s) => s.trim()).filter(Boolean);
}

function splitJapaneseSentences(text = '') {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const matches = normalized.match(/[^。！？]+[。！？]?/g);
  return (matches || []).map((s) => s.trim()).filter(Boolean);
}

function buildChunkSizes(sentenceCount) {
  if (sentenceCount <= 0) return [1];
  if (sentenceCount <= 3) return [sentenceCount];

  const sizes = [];
  let rest = sentenceCount;

  while (rest > 0) {
    if (rest === 4) {
      sizes.push(2, 2);
      break;
    }
    if (rest === 3) {
      sizes.push(3);
      break;
    }
    if (rest === 1) {
      sizes[sizes.length - 1] += 1;
      break;
    }
    sizes.push(2);
    rest -= 2;
  }

  return sizes;
}

function groupBySizes(sentences, sizes) {
  const groups = [];
  let cursor = 0;

  for (const size of sizes) {
    const chunk = sentences.slice(cursor, cursor + size).join(' ').trim();
    groups.push(chunk);
    cursor += size;
  }

  return groups;
}

function groupByChunkCount(sentences, chunkCount) {
  if (!chunkCount) return [];
  if (!sentences.length) return new Array(chunkCount).fill('');

  const result = [];
  let cursor = 0;
  const base = Math.floor(sentences.length / chunkCount);
  let remainder = sentences.length % chunkCount;

  for (let i = 0; i < chunkCount; i += 1) {
    const size = base + (remainder > 0 ? 1 : 0);
    const next = cursor + size;
    const piece = sentences.slice(cursor, next).join(' ').trim();
    result.push(piece);
    cursor = next;
    if (remainder > 0) remainder -= 1;
  }

  return result;
}

function buildEntryChunks(item) {
  const enSentences = splitEnglishSentences(item.en || '');
  const slashSentences = splitEnglishSentences(item.slash || '');
  const jaSentences = splitJapaneseSentences(item.ja || '');

  const sizes = buildChunkSizes(enSentences.length || 1);
  const enChunks = groupBySizes(enSentences, sizes);
  const chunkCount = enChunks.length;

  const slashChunks = groupByChunkCount(slashSentences, chunkCount);
  const jaChunks = groupByChunkCount(jaSentences, chunkCount);

  return enChunks.map((en, i) => ({
    en: en || '未登録',
    slash: slashChunks[i] || 'スラッシュ未登録',
    ja: jaChunks[i] || '日本語訳未登録'
  }));
}

function normalizeSets(raw) {
  if (Array.isArray(raw)) {
    return [
      {
        id: 'shadowing-mid-adv',
        label: 'シャドーイング（中上級）',
        entries: raw
      }
    ];
  }

  if (raw && Array.isArray(raw.sets)) {
    return raw.sets.map((set, i) => ({
      id: set.id || `set-${i + 1}`,
      label: set.label || `Set ${i + 1}`,
      entries: Array.isArray(set.entries) ? set.entries : []
    }));
  }

  return [];
}

fetch('data/slash-data.json')
  .then((r) => r.json())
  .then((d) => {
    state.DATA = d;
    const sets = normalizeSets(d);
    state.sets = sets.map((set) => ({
      ...set,
      entries: set.entries.map((item) => ({
        ...item,
        chunks: buildEntryChunks(item)
      }))
    }));

    if (!state.sets.length) return;
    selectSet(0);
  });
