#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const dataPath = path.resolve(__dirname, '..', 'data', 'slash-data.json');

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

function buildBoundaries(sizes) {
  const boundaries = [];
  let cursor = 0;
  for (const size of sizes) {
    const start = cursor;
    const end = cursor + size;
    boundaries.push([start, end]);
    cursor = end;
  }
  return boundaries;
}

function groupByBoundaries(sentences, boundaries) {
  return boundaries.map(([start, end]) => sentences.slice(start, end).join(' ').trim());
}

function groupByRatio(sentences, boundaries, enCount) {
  if (!boundaries.length) return [];
  if (!sentences.length) return boundaries.map(() => '');

  const total = sentences.length;
  const raw = boundaries.map(([enStart, enEnd]) => {
    const start = Math.round((enStart / Math.max(enCount, 1)) * total);
    const end = Math.round((enEnd / Math.max(enCount, 1)) * total);
    return [start, end];
  });

  const normalized = [];
  let prev = 0;
  for (let i = 0; i < raw.length; i += 1) {
    let [start, end] = raw[i];
    start = Math.max(start, prev);
    end = Math.max(end, start);

    if (i === raw.length - 1) {
      end = total;
    } else {
      const remainingBuckets = raw.length - i - 1;
      const minEnd = start;
      const maxEnd = total - remainingBuckets;
      end = Math.min(Math.max(end, minEnd), maxEnd);
    }

    normalized.push([start, end]);
    prev = end;
  }

  const chunks = normalized.map(([start, end]) => sentences.slice(start, end).join(' ').trim());

  if (chunks.every((c) => !c) && sentences.length) {
    chunks[chunks.length - 1] = sentences.join(' ').trim();
  }

  return chunks;
}

function buildEntryChunks(entry) {
  const enSentences = splitEnglishSentences(entry.en || '');
  const slashSentences = splitEnglishSentences(entry.slash || '');
  const jaSentences = splitJapaneseSentences(entry.ja || '');

  const sizes = buildChunkSizes(enSentences.length || 1);
  const boundaries = buildBoundaries(sizes);

  const enChunks = groupByBoundaries(enSentences, boundaries);
  const slashChunks = groupByBoundaries(slashSentences, boundaries);
  const jaChunks = groupByRatio(jaSentences, boundaries, enSentences.length || 1);

  return enChunks.map((en, i) => ({
    en: en || '未登録',
    slash: slashChunks[i] || 'スラッシュ未登録',
    ja: jaChunks[i] || '日本語訳未登録'
  }));
}

function main() {
  const raw = fs.readFileSync(dataPath, 'utf8');
  const data = JSON.parse(raw);

  let updated = 0;
  for (const set of data.sets || []) {
    for (const entry of set.entries || []) {
      entry.chunks = buildEntryChunks(entry);
      updated += 1;
    }
  }

  fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`migrated entries: ${updated}`);
}

main();
