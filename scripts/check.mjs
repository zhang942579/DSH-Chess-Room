import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateAiAssets } from '../packages/dsh-chess-room/scripts/validate-ai-manifest.mjs';

const root = new URL('../', import.meta.url);
const excluded = new Set(['.git', 'node_modules', 'dist', '__pycache__']);
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['openai-secret', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['personal-absolute-path', /(?:[A-Za-z]:[\\/](?:Users|Work)[\\/]|\/Users\/|\/home\/[^\s/]+\/)/],
];
const findings = []; let files = 0;
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isSymbolicLink()) throw new Error('Public source cannot contain symlinks: ' + fileURLToPath(url));
    if (entry.isDirectory()) { await walk(url); continue; }
    files++;
    const info = await stat(url);
    if (info.size >= 95 * 1024 * 1024) findings.push({ file: fileURLToPath(url), kind: 'github-file-size' });
    if (entry.name === '.env' || /\.(?:pem|pfx|key)$/.test(entry.name)) findings.push({ file: fileURLToPath(url), kind: 'sensitive-file' });
    if (!/\.(?:js|mjs|py|json|md|yml|yaml|txt)$/.test(entry.name)) continue;
    const content = await readFile(url, 'utf8');
    for (const [kind, pattern] of rules) if (pattern.test(content)) findings.push({ file: fileURLToPath(url), kind });
    if (/agent-zjy\.openai\.azure\.com/.test(content)) findings.push({ file: fileURLToPath(url), kind: 'private-generation-endpoint' });
  }
}
await walk(root);
if (findings.length) { console.error(JSON.stringify(findings, null, 2)); process.exit(1); }
const assetDirectory = new URL('../packages/dsh-chess-room/assets/actions-ai-v1/', import.meta.url);
const metadata = JSON.parse(await readFile(new URL('manifest.json', assetDirectory), 'utf8'));
const assets = await validateAiAssets(metadata, fileURLToPath(assetDirectory));
console.log(`Public-source scan passed: ${files} files; ${assets.verified.size} action PNGs verified. Matches never print secret values.`);
