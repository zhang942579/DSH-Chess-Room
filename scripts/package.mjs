import { mkdir, readdir, readFile, writeFile, stat, copyFile, realpath, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'dist', 'DSH-Chess-Room');
const ignore = new Set(['node_modules', '.git', 'tests', 'tools', 'scripts', 'docs', 'baseline', 'backups', 'deliverables', '__pycache__']);
await mkdir(path.join(root, 'dist'), { recursive: true });
const realRoot = await realpath(root), realDist = await realpath(path.join(root, 'dist'));
if (path.dirname(realDist) !== realRoot || path.dirname(out) !== path.join(root, 'dist') || path.basename(out) !== 'DSH-Chess-Room') throw new Error('Unsafe generated-package target');
// Rebuild only this verified, generated output directory; source packages are elsewhere.
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
async function copyTree(source, target, selected = false) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (ignore.has(entry.name) || /\.(?:log|tmp|pyc)$/.test(entry.name)) continue;
    if (entry.isSymbolicLink()) throw new Error('Unexpected package symlink');
    const src = path.join(source, entry.name), dst = path.join(target, entry.name);
    if (entry.isDirectory()) await copyTree(src, dst, selected);
    else if (!selected || /\.(?:js|mjs|json|yml|yaml|svg|md)$/.test(entry.name) || entry.name === 'LICENSE') await copyFile(src, dst);
  }
}
const manifest = { release: '1.2.1-open.1', host: '1.2.0', client: '1.2.1', packages: [], files: [] };
for (const name of ['dsh-chess-room', 'dsh-chess-room-live-client']) {
  const source = path.join(root, 'packages', name), target = path.join(out, name);
  await mkdir(target, { recursive: true });
  const entryFiles = name === 'dsh-chess-room' ? ['entry-v6.js', 'client-v5.js'] : ['index-context-121.js', 'client-context-121.js', 'asset-origin.json'];
  for (const file of [...entryFiles, 'package.json', 'cordis.patch.yml', 'icon.svg', 'README.md']) await copyFile(path.join(source, file), path.join(target, file));
  await copyTree(path.join(source, 'locale'), path.join(target, 'locale'));
  if (name === 'dsh-chess-room') {
    await copyTree(path.join(source, 'host'), path.join(target, 'host'));
    await copyTree(path.join(source, 'vendor'), path.join(target, 'vendor'));
    await copyTree(path.join(source, 'assets', 'stage'), path.join(target, 'assets', 'stage'));
    const expressions = path.join(target, 'assets', 'expressions');
    await mkdir(expressions, { recursive: true });
    for (const file of await readdir(path.join(source, 'assets', 'expressions'))) {
      if (/\.(?:png|webp)$/.test(file) && !file.startsWith('source')) await copyFile(path.join(source, 'assets', 'expressions', file), path.join(expressions, file));
    }
  } else {
    // Frozen baseline, editable context source and old Client are repository-only.
    // Current Client includes all dedicated action PNGs as self-contained image data.
  }
  for (const legal of ['LICENSE', 'ASSET-LICENSE.md', 'THIRD_PARTY_NOTICES.md']) await copyFile(path.join(root, legal), path.join(target, legal));
  const pkg = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
  pkg.files = [...entryFiles, ...(name === 'dsh-chess-room' ? ['host', 'assets', 'vendor'] : []), 'locale', 'icon.svg', 'cordis.patch.yml', 'README.md', 'LICENSE', 'ASSET-LICENSE.md', 'THIRD_PARTY_NOTICES.md'];
  delete pkg.scripts;
  await writeFile(path.join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  manifest.packages.push({ directory: name, name: pkg.name, version: pkg.version });
}
for (const name of ['README.md', 'LICENSE', 'ASSET-LICENSE.md', 'THIRD_PARTY_NOTICES.md']) await copyFile(path.join(root, name), path.join(out, name));
await copyTree(path.join(root, 'docs'), path.join(out, 'docs'));
async function hashes(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) await hashes(file);
    else if (item.name !== 'package-integrity.json') {
      const bytes = await readFile(file);
      manifest.files.push({ path: path.relative(out, file).split(path.sep).join('/'), bytes: (await stat(file)).size, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
}
await hashes(out);
await writeFile(path.join(out, 'package-integrity.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Packaged ${manifest.packages.length} DSH bundles and ${manifest.files.length} files at ${out}.`);
