import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const suites = [
  new URL('../packages/dsh-chess-room/tests/', import.meta.url),
  new URL('../packages/dsh-chess-room-live-client/context-feature/tests/', import.meta.url),
];
for (const directory of suites) {
  const files = readdirSync(directory).filter(name => /\.test\.(m?js)$/.test(name));
  const result = spawnSync(process.execPath, ['--test', ...files], { cwd: fileURLToPath(directory), stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
