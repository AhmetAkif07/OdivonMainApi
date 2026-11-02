// Downloads the RepDB flat illustrations used by the system exercise catalogue, recolors them to the
// Odivon palette and writes them to static/<EXERCISE_MEDIA_PREFIX>/ (committed, served by the Worker).
// Usage: node scripts/repdb-images.mjs
// The slug → RepDB id map and prefix are read from src/modules/gym/exercises/system-exercise-media.ts
// so the API and the files never drift apart. Changing the art? Bump the prefix version first.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { recolor } from './repdb-recolor.mjs';

const SOURCE = 'https://huggingface.co/datasets/RepDB/exercise-dataset/resolve/main/images/flat';
const MEDIA_FILE = resolve(import.meta.dirname, '../src/modules/gym/exercises/system-exercise-media.ts');

function readMedia() {
  const source = readFileSync(MEDIA_FILE, 'utf8');
  const prefix = source.match(/export const EXERCISE_MEDIA_PREFIX = '([^']+)'/)?.[1];
  if (!prefix) throw new Error(`EXERCISE_MEDIA_PREFIX bulunamadı: ${MEDIA_FILE}`);
  const files = [...source.matchAll(/^\s+'[a-z0-9-]+': \['([a-z0-9-]+)', '(pair|main)'\],/gm)].flatMap(([, id, kind]) =>
    kind === 'pair' ? [`${id}-start.webp`, `${id}-peak.webp`] : [`${id}-main.webp`],
  );
  return { prefix, files: [...new Set(files)] };
}

const media = readMedia();
const outDir = resolve(import.meta.dirname, '../static', media.prefix);
mkdirSync(outDir, { recursive: true });

console.log(`${media.files.length} görsel → static/${media.prefix}`);
let done = 0;
for (const file of media.files) {
  const response = await fetch(`${SOURCE}/${file}`);
  if (!response.ok) throw new Error(`${file} indirilemedi: HTTP ${response.status}`);
  writeFileSync(resolve(outDir, file), await recolor(Buffer.from(await response.arrayBuffer())));
  done += 1;
  if (done % 25 === 0 || done === media.files.length) console.log(`  ${done}/${media.files.length}`);
}
console.log('Tamam.');
