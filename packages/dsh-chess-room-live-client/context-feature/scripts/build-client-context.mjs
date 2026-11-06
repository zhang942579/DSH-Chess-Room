import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
export const workRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const originalSha = 'ccf688e97774cd0fdd20b2edddb598adfcaa0125ac32ea1433078792a9c3403b';
const originalPrefixSha = 'd4ab70c6b1cf8a5de8497c2e81630ce7d47670ef025490ac0874c17377075b99';
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const uiImports = "import { createStagePreview, stageZh, stageEn, createLiveStage2, LIVE_RELEASE2, liveStageZh, liveStageEn, confirmedMoveMask, requestsQuiet } from './frozen-runtime.mjs';\nimport { createContextPicker, contextZh, contextEn, contextCss } from './context-picker.js';\n";
const pickerImport = "import { createContextSelectionController } from './context-selection.js';\n";
function removeOnce(source, expected) {
  if (!source.startsWith(expected)) throw new Error('Unexpected module imports; never import current stage drafts.');
  return source.slice(expected.length);
}
function stripExports(source, expectedCount) {
  let count = 0;
  const value = source.replace(/^export (function|const) /gm, (_, keyword) => { count++; return keyword + ' '; });
  if (count !== expectedCount || /^\s*(import|export)\s/m.test(value)) throw new Error('Unsupported module structure.');
  return value;
}
export function buildClient(root = workRoot) {
  const baseline = fs.readFileSync(path.join(root, 'baseline/client-1.2.0.js'));
  if (digest(baseline) !== originalSha) throw new Error('Exact published 1.2.0 baseline changed.');
  const prefix = fs.readFileSync(path.join(root, 'baseline/frozen-prefix.txt'), 'utf8');
  if (digest(prefix) !== originalPrefixSha || !baseline.toString('utf8').startsWith(prefix)) throw new Error('Frozen artwork/runtime prefix changed.');
  const exportedRuntime = '\nexport { createStagePreview, stageZh, stageEn, createLiveStage2, LIVE_RELEASE2, liveStageZh, liveStageEn, confirmedMoveMask, requestsQuiet };\n';
  if (fs.readFileSync(path.join(root, 'src/frozen-runtime.mjs'), 'utf8') !== prefix.slice('(() => {\n'.length) + exportedRuntime) throw new Error('Frozen runtime source diverged from baseline.');
  const controllerSource = fs.readFileSync(path.join(root, 'src/context-selection.js'), 'utf8');
  const pickerSource = fs.readFileSync(path.join(root, 'src/context-picker.js'), 'utf8');
  const uiSource = fs.readFileSync(path.join(root, 'src/client-context-source.js'), 'utf8');
  const controller = stripExports(controllerSource, 1);
  const picker = stripExports(removeOnce(pickerSource, pickerImport), 4);
  const ui = stripExports(removeOnce(uiSource, uiImports), 1);
  const suffix = `\n  // Isolated metadata-only context controls, client 1.2.1.\n` +
    `  const { createContextSelectionController } = (() => {\n${controller}\nreturn { createContextSelectionController };\n})();\n` +
    `  const { createContextPicker, contextZh, contextEn, contextCss } = (() => {\n${picker}\nreturn { createContextPicker, contextZh, contextEn, contextCss };\n})();\n` +
    `\n  // owned:client-context-source.js; frozen 1.2.0 presentation + requested UI delta only.\n${ui}\n` +
    '  window.__ModuleLoader__.load({ id: "@local/dsh-chess-room-live-client", factory });\n})();\n';
  const bundle = prefix + suffix;
  new vm.Script(bundle, { filename: 'client-context-121.js' });
  if (!bundle.startsWith(prefix)) throw new Error('Frozen prefix preservation failed.');
  for (const text of ['h(CharacterStageControls,', 'difficultySelect', 't("expressionGallery")', 't("characterNote")', 'playerColor, difficulty']) {
    if (ui.includes(text)) throw new Error('Unrequested control still mounted: ' + text);
  }
  if (!ui.includes('clientGeneration: "1.2.1"') || !ui.includes('ChessRoomWhaleMaidContext121') || !ui.includes('priority: -1211')) throw new Error('Cold generation metadata missing.');
  return { bundle, report: {
    format: 'dsh-chess-context-client-build-v1', clientVersion: '1.2.1', actorRuntimeVersion: '1.2.0',
    baselineSha256: originalSha, frozenPrefixSha256: originalPrefixSha, frozenPrefixBytes: Buffer.byteLength(prefix),
    bundleSha256: digest(bundle), bundleBytes: Buffer.byteLength(bundle),
    sourceSha256: { controller: digest(controllerSource), picker: digest(pickerSource), ui: digest(uiSource) },
    preservation: 'All baseline bytes before owned:fresh-client-source.js remain exact, including embedded assets, MotionDirector, actor renderer and accessibility lifecycle.',
    api: { endpoint: '/api/dsh-chess-room', catalog: 'contextCatalog', binding: 'bindContext', successResultField: 'state' },
    verificationLimit: 'Syntax and offline tests only. Parent must integrate Host1.2.0, refresh existing GUI and verify live rendering.'
  } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildClient();
  if (!process.argv.includes('--check')) {
    const index = process.argv.indexOf('--out');
    const out = path.resolve(workRoot, index < 0 ? 'dist/client-context-121.js' : process.argv[index + 1]);
    const relative = path.relative(workRoot, out);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Output must be a new file inside isolated work directory.');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (fs.existsSync(out) || fs.existsSync(out + '.build.json')) throw new Error('Refusing to overwrite an existing build; choose a new --out path.');
    fs.writeFileSync(out, result.bundle, { flag: 'wx' });
    fs.writeFileSync(out + '.build.json', JSON.stringify(result.report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ output: out, ...result.report }));
  } else console.log(JSON.stringify(result.report));
}
