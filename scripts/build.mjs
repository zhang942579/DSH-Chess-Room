import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildClient } from '../packages/dsh-chess-room-live-client/context-feature/scripts/build-client-context.mjs';

// The published 1.2.0 actor prefix is a checked, self-contained source module.
// Rebuilding the 1.2.1 UI does not invoke the paused 1.3.0 artwork tools.
const { bundle, report } = buildClient();
const target = new URL('../packages/dsh-chess-room-live-client/client-context-121.js', import.meta.url);
const current = await readFile(target, 'utf8');
if (current !== bundle) await writeFile(target, bundle);
console.log(`Built Client ${report.clientVersion}: ${report.bundleBytes} bytes; frozen actor ${report.actorRuntimeVersion} preserved.`);
console.log(`SHA256 ${report.bundleSha256}`);
console.log(`Output ${fileURLToPath(target)}`);
