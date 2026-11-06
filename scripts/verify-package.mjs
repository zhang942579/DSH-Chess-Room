import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = new URL('../dist/DSH-Chess-Room/', import.meta.url);
const integrity = JSON.parse(await readFile(new URL('package-integrity.json', root), 'utf8'));
for (const item of integrity.files) {
  if (!item.path || item.path.startsWith('/') || item.path.split('/').includes('..')) throw new Error('Unsafe package path');
  const bytes = await readFile(new URL(item.path, root));
  if (bytes.length !== item.bytes || createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new Error('Package integrity mismatch: ' + item.path);
}
for (const item of integrity.packages) {
  const pkgRoot = new URL(item.directory + '/', root);
  const pkg = JSON.parse(await readFile(new URL('package.json', pkgRoot), 'utf8'));
  for (const key of ['.', './client', './icon']) {
    const target = pkg.exports[key];
    if (typeof target !== 'string' || !(await stat(new URL(target, pkgRoot))).isFile()) throw new Error('Missing package export: ' + item.directory + '/' + key);
  }
  for (const legal of ['LICENSE', 'ASSET-LICENSE.md', 'THIRD_PARTY_NOTICES.md']) await stat(new URL(legal, pkgRoot));
}
const hostRoot = new URL('dsh-chess-room/', root);
const { apply } = await import(new URL('entry-v6.js', hostRoot));
const routes = [], cleanups = [];
apply({ connection: { fetch: { register(route) { routes.push(route); } } }, tools: { register() {} }, effect(fn) { cleanups.push(fn()); } });
for (const route of routes.filter(route => route.methods.includes('GET'))) {
  const result = await route.fetch();
  if (result.status !== 200 || !(await result.arrayBuffer()).byteLength) throw new Error('Packaged asset route failed: ' + route.path);
}
for (const cleanup of cleanups.reverse()) await cleanup?.();
let registration;
const bundle = await readFile(new URL('dsh-chess-room-live-client/client-context-121.js', root), 'utf8');
vm.runInNewContext(bundle, { window: { __ModuleLoader__: { load(definition) { registration = definition; } } } }, { timeout: 2000 });
if (registration?.id !== '@local/dsh-chess-room-live-client') throw new Error('Incorrect packaged Client module');
const client = registration.factory(name => {
  if (name !== 'react') throw new Error('Unexpected Client runtime dependency');
  return { createElement() { throw new Error('Packaging validation does not render substitute React'); } };
});
if (client.viewModel.clientGeneration !== '1.2.1' || client.viewModel.stageRelease !== '1.2.0') throw new Error('Packaged Client generation changed');
console.log(`Package verified: ${integrity.files.length} file hashes, ${routes.filter(route => route.methods.includes('GET')).length} real asset responses and native Client 1.2.1 factory. No live DSH session was modified.`);
