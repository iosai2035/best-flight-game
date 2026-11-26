// Kestrel Ridge — the entry program (Node 22, standard library only).
// It hands the game in: copies this repository's game/ and screenshots/
// beside this file into /output and writes /output/dossier.json, the
// summary the judge reads, using the vendored make.fun library.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for
// /output, so a local check is:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The program is deterministic: two runs write the same bytes, because it
// only copies files and lets buildDossier summarise them.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (from the kit's reference/gate.json): only
// text_max_bytes shapes the bytes; the rest refuse an entry the scorer
// would refuse — more than 4 screenshots or one over 256 KiB, more than
// 993 files in game/ or 48 MiB of game files in all, or a path under
// game/ over 1000 bytes. game/ counts beside /output's own 1000-entry
// cap, its screenshots/ and dossier.json.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// A one-line summary on stdout, so a local run shows what was handed in.
// Nothing here touches /output: the two grader runs stay byte-identical.
function countEntries(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countEntries(path);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}
const game = countEntries(join(out, 'game'));
console.log(
  `Kestrel Ridge: ${game.files} game files (${game.bytes} bytes), `
  + `${readdirSync(join(out, 'screenshots')).length} screenshots, `
  + `dossier ${Buffer.byteLength(dossier)} bytes -> ${out}`,
);
