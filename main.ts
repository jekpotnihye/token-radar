// Entrypoint for the token-radar-01 entry.
//
// Takes the sealed DefiLlama snapshot, scores its protocols through the
// radar model in ./lib/model.ts, and writes out the ranked board, the
// dashboard data script, the dashboard files, the screenshots, and the
// dossier the house judge reads. Running it twice over the same inputs
// produces identical bytes.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  boardIssue,
  buildRadar,
  dataScript,
  parseSnapshot,
} from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

type Options = { input: string; output: string };

// Screenshot file names: a letter, digit, or underscore first, then
// letters, digits, dots, underscores, or hyphens, 1 to 128 chars total.
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function readOptions(argv: string[]): Options {
  let input = '/input';
  let output = process.env.MAKEFUN_OUTPUT_DIR ?? '';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);
    if (flag !== '--input' && flag !== '--output') continue;
    let value = inline;
    if (value === undefined) {
      value = argv[i + 1];
      if (value === undefined) {
        console.error(`token-radar: ${flag} needs a value`);
        process.exit(2);
      }
      i += 1;
    }
    if (flag === '--input') input = value;
    else output = value;
  }
  if (output === '') output = '/output';
  return { input, output };
}

// Counts a value that may be an array (use its length) or a plain
// number (use it as-is); anything else counts as zero.
function sizeOf(value: unknown): number {
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.length;
  return 0;
}

// Copies the visible regular files of one directory into another and
// returns the names copied, in directory order.
function copyVisibleFiles(fromDir: string, toDir: string): string[] {
  const copied: string[] = [];
  for (const entry of readdirSync(fromDir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    copyFileSync(join(fromDir, entry.name), join(toDir, entry.name));
    copied.push(entry.name);
  }
  return copied;
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const { input, output } = readOptions(process.argv.slice(2));
  const snapshotPath = input.endsWith('.json')
    ? input
    : join(input, 'snapshot.json');
  if (!existsSync(snapshotPath)) {
    console.error(
      `token-radar: no snapshot at ${snapshotPath}; pass --input <snapshot.json or directory> or mount the sealed /input`,
    );
    process.exit(2);
  }

  const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue) {
    console.error(`token-radar: board rejected: ${issue}`);
    process.exit(1);
  }

  mkdirSync(output, { recursive: true });
  const dashboardOut = join(output, 'dashboard');
  const shotsOut = join(output, 'screenshots');
  mkdirSync(dashboardOut, { recursive: true });
  mkdirSync(shotsOut, { recursive: true });

  const boardPath = join(output, 'board.json');
  const dataPath = join(output, 'data.js');
  const dossierPath = join(output, 'dossier.json');

  writeFileSync(boardPath, `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(dataPath, dataScript(radar));

  const dashboardNames = copyVisibleFiles(join(here, 'dashboard'), dashboardOut);
  const shotNames = copyVisibleFiles(join(here, 'screenshots'), shotsOut);
  if (shotNames.length < 3) {
    console.error(
      `token-radar: need at least 3 screenshots, found ${shotNames.length}`,
    );
    process.exit(1);
  }
  for (const name of shotNames) {
    if (!SHOT_NAME.test(name)) {
      console.error(`token-radar: bad screenshot name: ${name}`);
      process.exit(1);
    }
  }

  // buildDossier hands back the finished dossier bytes (a Buffer);
  // write them out untouched. Anything else gets serialised as JSON.
  const dossier = buildDossier(output, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  if (typeof dossier === 'string' || dossier instanceof Uint8Array) {
    writeFileSync(dossierPath, dossier);
  } else if (dossier !== null && dossier !== undefined) {
    writeFileSync(dossierPath, JSON.stringify(dossier));
  }

  const snapFields = snapshot as unknown as Record<string, unknown>;
  const radarFields = radar as unknown as Record<string, unknown>;
  const protocolCount = sizeOf(snapFields.protocols);
  const watchlistCount = sizeOf(snapFields.watchlist);
  const earlyCount = sizeOf(radarFields.early_size ?? radarFields.early);
  const liveCount = sizeOf(
    radarFields.live_size ?? radarFields.live ?? radarFields.liveSetAside,
  );
  console.log(
    `token-radar: read ${protocolCount} protocols (${watchlistCount} watchlist); scored ${board.length} rows, ${earlyCount} early and ${liveCount} live set aside`,
  );
  console.log(
    `token-radar: files out: ${boardPath}, ${dataPath}, ${dashboardOut} with ${dashboardNames.length} files, ${shotsOut} with ${shotNames.length} images, ${dossierPath}`,
  );
}

main();
