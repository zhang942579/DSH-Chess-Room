import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.resolve(root, '../dsh-chess-room-live-client/client.js');
const expected = 'ccf688e97774cd0fdd20b2edddb598adfcaa0125ac32ea1433078792a9c3403b';
const raw = fs.readFileSync(baselinePath);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
if (hash(raw) !== expected) throw new Error('Published 1.2.0 bundle hash mismatch; never substitute current stage sources.');
const bundle = raw.toString('utf8');
const marker = '  // owned:fresh-client-source.js\n';
const bootstrap = '  // fresh-client-bootstrap.js\n';
function once(value, oldText, newText) {
  const first = value.indexOf(oldText);
  if (first < 0 || value.indexOf(oldText, first + oldText.length) >= 0) throw new Error('Non-unique frozen UI anchor: ' + oldText.slice(0, 100));
  return value.slice(0, first) + newText + value.slice(first + oldText.length);
}
function all(value, oldText, newText, count) {
  if (value.split(oldText).length - 1 !== count) throw new Error('Unexpected occurrence count: ' + oldText);
  return value.split(oldText).join(newText);
}
const boundary = bundle.indexOf(marker), end = bundle.indexOf(bootstrap);
if (boundary < 0 || bundle.indexOf(marker, boundary + 1) >= 0 || end <= boundary) throw new Error('Frozen bundle boundaries changed.');
const prefix = bundle.slice(0, boundary);
let ui = bundle.slice(boundary + marker.length, end).trimStart();
ui = once(ui, 'function factory(require2) {', 'export function factory(require2) {');
ui = once(ui, 'const CharacterStagePreview = createStagePreview(React), { CharacterStageLive, CharacterStageControls } = createLiveStage2(React);',
  'const CharacterStagePreview = createStagePreview(React), { CharacterStageLive } = createLiveStage2(React);\n    const ContextPicker = createContextPicker(React);');
ui = all(ui, 'ChessRoomWhaleMaidLive120', 'ChessRoomWhaleMaidContext121', 2);
ui = all(ui, 'priority: -1201', 'priority: -1211', 2);
ui = once(ui, 'priority: -1202', 'priority: -1212');
ui = all(ui, 'dsh-chess-room-live-client-v1', 'dsh-chess-room-context-client-v121', 3);
ui = once(ui, '[difficulty, setDifficulty] = React.useState("normal"), ', '');
ui = once(ui, ', [previewExpression, setPreviewExpression] = React.useState(null)', '');
ui = once(ui, '            setDifficulty(state.game.difficulty);\n', '');
ui = once(ui, '              setPreviewExpression(null);\n', '');
ui = once(ui, 'shownExpression = previewExpression || expression', 'shownExpression = expression');
ui = once(ui, '        const difficultySelect = () => h("select", { value: difficulty, disabled: busy || !g, "aria-label": t("difficulty"), onChange: (event) => setDifficulty(event.target.value) }, ["easy", "normal", "hard"].map((value) => h("option", { key: value, value }, t(value))));\n', '');
ui = once(ui, 'h("label", null, t("difficulty"), difficultySelect()), ', '');
ui = once(ui, ', difficultySelect()))', '))');
ui = once(ui, 'void act("newGame", { playerColor, difficulty })', 'void act("newGame", { playerColor })');
ui = once(ui, 'game.difficulty || (', '(');
ui = once(ui, '["room", "records", "motionPreview"]', '["room", "records"]');
ui = once(ui, 'h("p", { className: "dcr-expression-caption" }, `${previewExpression ? `${t("preview")} \\xB7 ` : ""}${expressionLabel(shownExpression)}`),',
  'h("p", { className: "dcr-expression-caption" }, expressionLabel(shownExpression)),');
const galleryStart = '            h("details", { className: "dcr-expression-gallery", onToggle: (event) => {\n';
const galleryEnd = '            comments && !stageLocalQuiet ?';
const gs = ui.indexOf(galleryStart), ge = ui.indexOf(galleryEnd, gs);
if (gs < 0 || ge < gs || ui.indexOf(galleryStart, gs + 1) >= 0) throw new Error('Frozen gallery boundary changed.');
ui = ui.slice(0, gs) + ui.slice(ge);
ui = once(ui, '            comments && !stageLocalQuiet ? h("div", { className: "dcr-speech" }, lastComment?.text || t(g ? "characterReady" : "loading")) : null,\n            h("div", { className: "dcr-character-note" }, h("i", { className: "status-dot", "aria-hidden": true }), t("characterNote"))',
  '            comments && !stageLocalQuiet ? h("div", { className: "dcr-speech" }, lastComment?.text || t(g ? "characterReady" : "loading")) : null');
ui = once(ui, '          h(CharacterStageControls, { t, apiRef: stageApiRef, prefs: stagePrefs, onPrefs: setStagePrefs, visual: stageVisual, enabled: liveStageEnabled }),',
  '          h(ContextPicker, { snapshot: state, catalog: payload => rpc("contextCatalog", payload), bind: bindContext, t, busy, online: connected }),');
ui = once(ui, ', h("span", { className: "pill", "data-dcr-client-ready": "1.2.0" }, t("clientReady"))', '');
ui = all(ui, '"1.2.0"', '"1.2.1"', 2);
const localeAnchor = '    const expressions = Object.freeze(["idle", "thinking", "smug", "surprised", "troubled", "victory", "defeat"]);';
ui = once(ui, localeAnchor, '    Object.assign(zh, contextZh, {nextGame: "执子选择在新对局生效", clientReady: "棋室界面 1.2.1"});\n    Object.assign(en, contextEn, {nextGame: "Color applies to the next game", clientReady: "Chess room UI 1.2.1"});\n' + localeAnchor);
ui = once(ui, 'h("style", null, css)', 'h("style", null, css + contextCss)');
const bind = `        async function bindContext(selection) {
          const before = stateRef.current;
          if (lock.current || !before?.game || !alive.current) throw Object.assign(new Error("Room busy"), { code: "unavailable" });
          lock.current = true;
          setBusy(true);
          try {
            const game = before.game;
            const next = await rpc("bindContext", { gameId: game.id, version: game.version, turnIdentity: game.turnIdentity,
              requestId: crypto.randomUUID(), workspaceId: selection.workspaceId, sessionId: selection.sessionId });
            if (!alive.current || stateRef.current?.runtimeId !== before.runtimeId) throw Object.assign(new Error("Room changed"), { code: "stale" });
            accept(next);
            return stateRef.current;
          } catch (error) {
            if (alive.current && stateRef.current?.runtimeId === before.runtimeId) {
              try {
                const recovered = await rpc("state");
                if (alive.current && stateRef.current?.runtimeId === before.runtimeId) accept(recovered);
              } catch {}
            }
            throw error;
          } finally {
            lock.current = false;
            if (alive.current) setBusy(false);
          }
        }
`;
ui = once(ui, '        async function act(operation, extra = {}) {', bind + '        async function act(operation, extra = {}) {');
for (const forbidden of ['difficultySelect', 'setDifficulty(', 'h(CharacterStageControls,', 't("characterNote")', 't("expressionGallery")', 'previewExpression']) {
  if (ui.includes(forbidden)) throw new Error('Removed UI remains: ' + forbidden);
}
const imports = "import { createStagePreview, stageZh, stageEn, createLiveStage2, LIVE_RELEASE2, liveStageZh, liveStageEn, confirmedMoveMask, requestsQuiet } from './frozen-runtime.mjs';\nimport { createContextPicker, contextZh, contextEn, contextCss } from './context-picker.js';\n";
function writeNew(relative, bytes) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}
writeNew('baseline/client-1.2.0.js', raw);
writeNew('baseline/frozen-prefix.txt', prefix);
writeNew('src/frozen-runtime.mjs', prefix.slice('(() => {\n'.length) + '\nexport { createStagePreview, stageZh, stageEn, createLiveStage2, LIVE_RELEASE2, liveStageZh, liveStageEn, confirmedMoveMask, requestsQuiet };\n');
writeNew('src/client-context-source.js', imports + ui);
writeNew('baseline/freeze.json', JSON.stringify({ format: 'dsh-chess-frozen-client-v1', source: baselinePath, sourceSha256: expected,
  prefixSha256: hash(prefix), prefixBytes: Buffer.byteLength(prefix), boundary: marker.trim(), uiSource: 'src/client-context-source.js',
  sourcePolicy: 'Exact compiled installed 1.2.0 prefix; no stage1.3.0 source import or artwork mutation.' }, null, 2) + '\n');
console.log(JSON.stringify({ baselineSha256: expected, prefixSha256: hash(prefix), sourceCreated: 'src/client-context-source.js' }));
