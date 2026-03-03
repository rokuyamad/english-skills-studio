#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const dataPath = path.resolve(__dirname, '..', 'data', 'slash-data.json');

function normalize(text = '') {
  return text
    .toLowerCase()
    .replace(/[\u2019\u2018]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/\s([,.!?;:])/g, '$1')
    .trim();
}

function normalizeSlash(text = '') {
  return normalize(text.replace(/\s*\/\s*/g, ' '));
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exitCode = 1;
}

function main() {
  const raw = fs.readFileSync(dataPath, 'utf8');
  const data = JSON.parse(raw);

  for (const set of data.sets || []) {
    for (const entry of set.entries || []) {
      const name = `${set.id}/${entry.id}`;
      if (!Array.isArray(entry.chunks) || entry.chunks.length === 0) {
        fail(`${name}: missing chunks`);
        continue;
      }

      let hasInvalidChunk = false;
      for (let i = 0; i < entry.chunks.length; i += 1) {
        const chunk = entry.chunks[i] || {};
        if (!chunk.en || !String(chunk.en).trim()) {
          fail(`${name}: empty chunks[${i}].en`);
          hasInvalidChunk = true;
        }
        if (!chunk.slash || !String(chunk.slash).trim()) {
          fail(`${name}: empty chunks[${i}].slash`);
          hasInvalidChunk = true;
        }
        if (!chunk.ja || !String(chunk.ja).trim()) {
          fail(`${name}: empty chunks[${i}].ja`);
          hasInvalidChunk = true;
        }
      }
      if (hasInvalidChunk) continue;

      const rootEn = normalize(entry.en || '');
      const rootSlashToEn = normalizeSlash(entry.slash || '');
      const chunkEn = normalize(entry.chunks.map((c) => c.en).join(' '));
      const chunkSlashToEn = normalizeSlash(entry.chunks.map((c) => c.slash).join(' '));
      const chunkJa = normalize(entry.chunks.map((c) => c.ja).join(' '));

      if (rootEn !== chunkEn) {
        fail(`${name}: chunks.en does not reconstruct entry.en`);
      }
      if (rootEn !== rootSlashToEn) {
        fail(`${name}: entry.slash does not align with entry.en`);
      }
      if (rootEn !== chunkSlashToEn) {
        fail(`${name}: chunks.slash does not align with entry.en`);
      }
      if (!chunkJa) {
        fail(`${name}: chunks.ja joined is empty`);
      }
    }
  }

  if (!process.exitCode) {
    console.log('OK: slash chunks are valid');
  }
}

main();
