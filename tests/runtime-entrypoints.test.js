import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function assertIncludesAll(text, expected, label) {
  for (const item of expected) {
    assert.match(text, new RegExp(escapeRegExp(item)), `${label} should include ${item}`);
  }
}

function assertIncludesNone(text, forbidden, label) {
  for (const item of forbidden) {
    assert.doesNotMatch(text, new RegExp(escapeRegExp(item)), `${label} should not include ${item}`);
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const canonicalForbiddenImports = [
  '/src/main.js',
  '/src/wsClient.js',
  '/src/legacy/wsClient.js',
  '/src/host-midi.js',
];

test('host.html is the official host page inventory', () => {
  const host = readRepoFile('host.html');

  assertIncludesAll(host, [
    '/src/bootstrap-shared.js',
    '/src/runtime/app-bridge.js',
    '/src/runtime/host-session-page.js',
    '/src/private-invite-ui.js',
    '/src/runtime/host-probe.js',
    '/src/runtime/host-status-page.js',
    '/src/runtime/host-controller-pipeline.js',
    '/src/runtime/host-draft-map-sync.js',
    '/src/runtime/host-midi-capture.js',
    '/src/runtime/host-launcher-actions.js',
    '/src/runtime/host-theme-page.js',
    '/src/runtime/host-tools-page.js',
    '/src/midi.js',
    '/src/board.js',
    '/src/bootstrap-host.js',
  ], 'host.html');
  assert.match(host, /<script\s+type=["']module["']>/);
  assert.match(host, /initSharedPageBoot\(\{\s*role:\s*['"]host['"]/);
  assert.match(host, /await\s+initBoard\(\{\s*hostId:\s*['"]boardHost['"]\s*\}\)/);
  assert.match(host, /initHostControllerPipeline\(\{[\s\S]*runtimeApp,[\s\S]*boardConsume,[\s\S]*hostStatus,[\s\S]*\}\)/);
  assert.match(host, /initHostDraftMapSync\(\{[\s\S]*runtimeApp,[\s\S]*loadMappings,[\s\S]*\}\)/);
  assert.match(host, /startHostMidiCapture\(\{[\s\S]*runtimeApp,[\s\S]*hostStatus,[\s\S]*bootMIDIFromQuery,[\s\S]*\}\)/);
  assert.match(host, /initHostToolsPage\(\{[\s\S]*runtimeApp,[\s\S]*installJogRuntime,[\s\S]*installHostDebug,[\s\S]*\}\)/);
  assert.doesNotMatch(host, /function\s+normalizeInfo\b/);
  assert.doesNotMatch(host, /runtimeApp\.setNormalizer\(normalizeInfo\)/);
  assert.doesNotMatch(host, /function\s+pushMap\b/);
  assert.doesNotMatch(host, /setTimeout\(pushMap,\s*250\)/);
  assert.doesNotMatch(host, /window\.addEventListener\(['"]flx:map-updated['"],\s*pushMap\)/);
  assert.doesNotMatch(host, /runtimeApp\.getWSClient\(\)\?\.sendMap\(draftMapArray\)/);
  assert.doesNotMatch(host, /type:\s*['"]map:set['"]/);
  assert.doesNotMatch(host, /console\.log\(['"]\[MIDI\] starting init via bootMIDIFromQuery['"]\)/);
  assert.doesNotMatch(host, /const\s+handle\s*=\s*await\s+bootMIDIFromQuery\(\{/);
  assert.doesNotMatch(host, /runtimeApp\.consumeNormalizedInfo\(info\)/);
  assert.doesNotMatch(host, /runtimeApp\.setMIDIStatus\(s\)/);
  assert.doesNotMatch(host, /console\.log\(['"]\[MIDI\] init OK['"]\)/);
  assert.doesNotMatch(host, /console\.warn\(['"]\[MIDI\] init failed['"],\s*e\)/);
  assert.doesNotMatch(host, /runtimeApp\.setMIDIStatus\(['"]host: off['"]\)/);
  assert.doesNotMatch(host, /\/src\/runtime\/host-page\.js/);
  assertIncludesNone(host, canonicalForbiddenImports, 'host.html');
});

test('host session page module owns only extracted host session invite and probe page wiring', () => {
  const source = readRepoFile('src/runtime/host-session-page.js');
  const host = readRepoFile('host.html');
  const viewer = readRepoFile('viewer.html');

  assert.match(source, /export\s+function\s+initHostSessionPage\b/);
  assertIncludesNone(source, [
    '../midi.js',
    '../ws.js',
    '../board.js',
    '../recorder.js',
    '../recorder_ui.js',
    '../diag.js',
    '../wizard.js',
    '../editmode.js',
    '../launcher.js',
    '../host-debug.js',
    '../mapper.js',
    '../controllers/',
    '../theme.js',
    '../presets.js',
    '../private-invite-ui.js',
    './host-probe.js',
    '/src/private-invite-ui.js',
    '/src/runtime/host-probe.js',
  ], 'src/runtime/host-session-page.js');
  assertIncludesNone(source, [
    'bootMIDIFromQuery',
    'connectWS',
    'initBoard',
    'boardConsume',
    'loadMappings',
    'sendMap',
    'runtimeApp.setNormalizer',
    'runtimeApp.setInfoConsumer',
    'initLauncher',
    'createHostLauncherActions',
    'initHostToolsPage',
    'initHostThemePage',
  ], 'src/runtime/host-session-page.js');

  assert.match(host, /import\s+\{\s*initHostSessionPage\s*\}\s+from\s+['"]\/src\/runtime\/host-session-page\.js['"]/);
  assert.match(host, /import\s+\{\s*installPrivateInvitePanel\s*\}\s+from\s+['"]\/src\/private-invite-ui\.js['"]/);
  assert.match(host, /import\s+\{\s*installHostProbeOnFirstConnect\s*\}\s+from\s+['"]\/src\/runtime\/host-probe\.js['"]/);
  assert.match(host, /const\s+hostSessionPage\s*=\s*initHostSessionPage\(\{[\s\S]*runtimeApp,[\s\S]*installHostProbeOnFirstConnect,[\s\S]*installPrivateInvitePanel,[\s\S]*\}\)/);
  assertIncludesAll(host, [
    'initHostStatusChrome(',
    'initHostControllerPipeline(',
    'initHostDraftMapSync(',
    'startHostMidiCapture(',
    'createHostLauncherActions(',
    'initHostToolsPage(',
    'initHostThemePage(',
  ], 'host.html');
  assertIncludesNone(host, [
    'installHostProbeOnFirstConnect({ runtimeApp });',
    'installPrivateInvitePanel();',
    '/src/runtime/host-page.js',
  ], 'host.html');
  assertIncludesNone(viewer, [
    '/src/runtime/host-session-page.js',
  ], 'viewer.html');
});

test('host tools page module owns only extracted host jog and debug tool glue', () => {
  const source = readRepoFile('src/runtime/host-tools-page.js');
  const host = readRepoFile('host.html');
  const viewer = readRepoFile('viewer.html');

  assert.match(source, /export\s+function\s+initHostToolsPage\b/);
  assertIncludesNone(source, [
    '../midi.js',
    '../ws.js',
    '../recorder.js',
    '../recorder_ui.js',
    '../diag.js',
    '../wizard.js',
    '../editmode.js',
    '../launcher.js',
    '../mapper.js',
    '../controllers/',
  ], 'src/runtime/host-tools-page.js');
  assertIncludesNone(source, [
    'bootMIDIFromQuery',
    'connectWS',
    'initBoard',
    'boardConsume',
    'loadMappings',
    'sendMap',
    'runtimeApp.setNormalizer',
    'runtimeApp.setInfoConsumer',
    'initLauncher',
  ], 'src/runtime/host-tools-page.js');

  assert.match(host, /import\s+\{\s*initHostToolsPage\s*\}\s+from\s+['"]\/src\/runtime\/host-tools-page\.js['"]/);
  assert.match(host, /import\s+\{\s*installJogRuntime\s*\}\s+from\s+['"]\/src\/jog-runtime\.js['"]/);
  assert.match(host, /import\s+\{\s*installHostDebug\s*\}\s+from\s+['"]\/src\/host-debug\.js['"]/);
  assert.match(host, /const\s+hostTools\s*=\s*initHostToolsPage\(\{[\s\S]*runtimeApp,[\s\S]*documentRef:\s*document,[\s\S]*windowRef:\s*window,[\s\S]*boardHost:\s*stageEl,[\s\S]*getUnifiedMap,[\s\S]*installJogRuntime,[\s\S]*installHostDebug,[\s\S]*hostStatus,[\s\S]*\}\)/);
  assertIncludesNone(host, [
    'const Jog = installJogRuntime({',
    'exposeGlobalControls: true',
    'jogRuntime: Jog',
    "trigger: document.getElementById('openJogCalibration')",
    'consumeInfo: (info) => runtimeApp.consumeInfo(info)',
    'getWSClient: () => runtimeApp.getWSClient()',
    '/src/runtime/host-page.js',
  ], 'host.html');
  assertIncludesNone(viewer, [
    '/src/runtime/host-tools-page.js',
  ], 'viewer.html');
});

test('host MIDI capture module owns only host WebMIDI callback/status wiring', () => {
  const source = readRepoFile('src/runtime/host-midi-capture.js');
  const host = readRepoFile('host.html');

  assert.match(source, /export\s+async\s+function\s+startHostMidiCapture\b/);
  assertIncludesNone(source, [
    '../midi.js',
    '../ws.js',
    '../board.js',
    '../recorder.js',
    '../recorder_ui.js',
    '../diag.js',
    '../wizard.js',
    '../editmode.js',
    '../launcher.js',
    '../host-debug.js',
    '../mapper.js',
    '../controllers/',
  ], 'src/runtime/host-midi-capture.js');
  assert.doesNotMatch(source, /\binitBoard\b/);
  assert.doesNotMatch(source, /\bconnectWS\b/);
  assert.doesNotMatch(source, /\bboardConsume\b/);
  assert.doesNotMatch(source, /\bruntimeApp\.setNormalizer\b/);
  assert.doesNotMatch(source, /\bruntimeApp\.setInfoConsumer\b/);
  assert.doesNotMatch(source, /\bloadMappings\b/);
  assert.doesNotMatch(source, /\bsendMap\b/);
  assert.match(host, /import\s+\{\s*bootMIDIFromQuery\s*\}\s+from\s+['"]\/src\/midi\.js['"]/);
  assert.match(host, /import\s+\{\s*startHostMidiCapture\s*\}\s+from\s+['"]\/src\/runtime\/host-midi-capture\.js['"]/);
  assert.match(host, /startHostMidiCapture\(\{[\s\S]*bootMIDIFromQuery,[\s\S]*\}\)/);
  assert.doesNotMatch(host, /\/src\/runtime\/host-page\.js/);
});

test('host draft map sync module owns only provisional draft map metadata sync', () => {
  const source = readRepoFile('src/runtime/host-draft-map-sync.js');
  const host = readRepoFile('host.html');

  assert.match(source, /export\s+function\s+initHostDraftMapSync\b/);
  assert.match(source, /export\s+function\s+pushDraftMapMetadata\b/);
  assertIncludesNone(source, [
    '../midi.js',
    '../ws.js',
    '../board.js',
    '../recorder.js',
    '../recorder_ui.js',
    '../diag.js',
    '../wizard.js',
    '../editmode.js',
    '../launcher.js',
    '../host-debug.js',
    '../controllers/',
  ], 'src/runtime/host-draft-map-sync.js');
  assert.doesNotMatch(source, /\bbootMIDIFromQuery\b/);
  assert.doesNotMatch(source, /\bconnectWS\b/);
  assert.doesNotMatch(source, /\binitBoard\b/);
  assert.doesNotMatch(source, /\bboardConsume\b/);
  assert.doesNotMatch(source, /\bruntimeApp\.setNormalizer\b/);
  assert.doesNotMatch(source, /\bruntimeApp\.setInfoConsumer\b/);
  assert.doesNotMatch(source, /controllerTruth\s*:\s*true/);
  assert.doesNotMatch(source, /mapAuthority\s*:\s*['"]official['"]/);
  assert.doesNotMatch(source, /owner\s*:\s*['"]official['"]/);
  assert.match(host, /import\s+\{\s*loadMappings\s*\}\s+from\s+['"]\/src\/mapper\.js['"]/);
  assert.match(host, /initHostDraftMapSync\(\{[\s\S]*loadMappings,[\s\S]*\}\)/);
  assert.doesNotMatch(host, /function\s+pushMap\b/);
  assert.doesNotMatch(host, /\/src\/runtime\/host-page\.js/);
});

test('host controller pipeline module owns only normalized host info glue', () => {
  const source = readRepoFile('src/runtime/host-controller-pipeline.js');
  const host = readRepoFile('host.html');

  assert.match(source, /export\s+function\s+initHostControllerPipeline\b/);
  assert.match(source, /export\s+function\s+normalizeHostInfo\b/);
  assertIncludesNone(source, [
    '../midi.js',
    '../ws.js',
    '../board.js',
    '../recorder.js',
    '../recorder_ui.js',
    '../diag.js',
    '../wizard.js',
    '../editmode.js',
    '../launcher.js',
    '../host-debug.js',
    '../mapper.js',
  ], 'src/runtime/host-controller-pipeline.js');
  assert.doesNotMatch(source, /\bbootMIDIFromQuery\b/);
  assert.doesNotMatch(source, /\bconnectWS\b/);
  assert.doesNotMatch(source, /\binitBoard\b/);
  assert.doesNotMatch(source, /\bloadMappings\b/);
  assert.match(host, /import\s+\{\s*initBoard,\s*consumeInfo\s+as\s+boardConsume,\s*getUnifiedMap\s*\}\s+from\s+['"]\/src\/board\.js['"]/);
  assert.match(host, /initHostControllerPipeline\(\{[\s\S]*boardConsume,[\s\S]*\}\)/);
  assert.doesNotMatch(host, /runtimeApp\.setInfoConsumer\(\(info\)\s*=>\s*\{/);
  assert.doesNotMatch(host, /runtimeApp\.getWSClient\(\)\?\.isAlive\?\.\(\)/);
  assert.doesNotMatch(host, /runtimeApp\.getWSClient\(\)\.send\(info\)/);
});

test('host status page module owns only the extracted status chrome', () => {
  const hostStatusPage = readRepoFile('src/runtime/host-status-page.js');

  assert.match(hostStatusPage, /export\s+function\s+initHostStatusChrome\b/);
  assertIncludesAll(hostStatusPage, [
    '../host-status.js',
    'hostStatusChrome',
    'hostStatusPopover',
    'wsStatus',
    'midiStatus',
    'controllerStatus',
  ], 'src/runtime/host-status-page.js');
  assert.doesNotMatch(hostStatusPage, /\bconnectWS\b/);
  assert.doesNotMatch(hostStatusPage, /\bbootMIDIFromQuery\b/);
  assert.doesNotMatch(hostStatusPage, /\binitBoard\b/);
  assertIncludesNone(hostStatusPage, [
    '../ws.js',
    '../midi.js',
    '../board.js',
  ], 'src/runtime/host-status-page.js');
});

test('host launcher actions module owns only extracted launcher action glue', () => {
  const source = readRepoFile('src/runtime/host-launcher-actions.js');
  const host = readRepoFile('host.html');
  const viewer = readRepoFile('viewer.html');

  assert.match(source, /export\s+function\s+createHostLauncherActions\b/);
  assert.match(source, /export\s+function\s+getCurrentReplayPayload\b/);
  assert.match(source, /export\s+function\s+downloadReplayPayload\b/);
  assert.match(source, /export\s+function\s+loadSavedReplay\b/);
  assertIncludesNone(source, [
    '../midi.js',
    '../ws.js',
    '../board.js',
    '../diag.js',
    '../wizard.js',
    '../editmode.js',
    '../launcher.js',
    '../recorder.js',
    '../recorder_ui.js',
    '../theme.js',
    '../session-replay-library.js',
    '../host-debug.js',
    '../mapper.js',
    '../controllers/',
  ], 'src/runtime/host-launcher-actions.js');
  assertIncludesNone(source, [
    'initLauncher',
    'initBoard',
    'bootMIDIFromQuery',
    'connectWS',
    'boardConsume',
    'loadMappings',
    'sendMap',
    'runtimeApp.setNormalizer',
    'runtimeApp.setInfoConsumer',
  ], 'src/runtime/host-launcher-actions.js');

  assert.match(host, /from\s+['"]\/src\/runtime\/host-launcher-actions\.js['"]/);
  assert.match(host, /import\s+\{\s*initLauncher\s*\}\s+from\s+['"]\/src\/launcher\.js['"]/);
  assertIncludesAll(host, [
    '/src/recorder.js',
    '/src/recorder_ui.js',
    '/src/session-replay-library.js',
    '/src/diag.js',
    '/src/editmode.js',
    '/src/wizard.js',
    '/src/theme.js',
    '/src/presets.js',
    'createHostLauncherActions({',
    'getStatusSnapshot',
    'mountPresetUI',
    'hostStatus.setLauncher(launcher)',
  ], 'host.html');
  assertIncludesNone(host, [
    'function getCurrentReplayPayload',
    'function downloadReplayPayload',
    'function loadSavedReplay',
    'const launcherActions = {',
    '/src/runtime/host-page.js',
  ], 'host.html');

  assertIncludesAll(viewer, [
    '/src/runtime/viewer-page.js',
    '/src/bootstrap-viewer.js',
  ], 'viewer.html');
  assertIncludesNone(viewer, [
    '/src/runtime/host-launcher-actions.js',
  ], 'viewer.html');
});

test('host theme page module owns only extracted host theme wiring', () => {
  const source = readRepoFile('src/runtime/host-theme-page.js');
  const host = readRepoFile('host.html');
  const viewer = readRepoFile('viewer.html');

  assert.match(source, /export\s+function\s+initHostThemePage\b/);
  assertIncludesNone(source, [
    '../midi.js',
    '../ws.js',
    '../board.js',
    '../recorder.js',
    '../recorder_ui.js',
    '../diag.js',
    '../wizard.js',
    '../editmode.js',
    '../launcher.js',
    '../host-debug.js',
    '../mapper.js',
    '../controllers/',
    '../theme.js',
  ], 'src/runtime/host-theme-page.js');
  assertIncludesNone(source, [
    'bootMIDIFromQuery',
    'connectWS',
    'initBoard',
    'boardConsume',
    'loadMappings',
    'sendMap',
    'runtimeApp.setNormalizer',
    'runtimeApp.setInfoConsumer',
    'initLauncher',
    'createHostLauncherActions',
    'initHostToolsPage',
  ], 'src/runtime/host-theme-page.js');

  assert.match(host, /import\s+\{\s*initHostThemePage\s*\}\s+from\s+['"]\/src\/runtime\/host-theme-page\.js['"]/);
  assert.match(host, /const\s+hostThemePage\s*=\s*initHostThemePage\(\{[\s\S]*THEME,[\s\S]*documentRef:\s*document,[\s\S]*windowRef:\s*window,[\s\S]*getLauncher:\s*\(\)\s*=>\s*launcher,[\s\S]*\}\)/);
  assertIncludesAll(host, [
    '/src/theme.js',
    '/src/presets.js',
    '/src/launcher.js',
  ], 'host.html');
  assertIncludesNone(host, [
    'THEME.attachThemeDesigner({',
    "THEME.ensurePreset?.('instrument-dark')",
    "document.addEventListener('keydown', (e)=>",
    "launcher?.toggleSection('theme')",
    '/src/runtime/host-page.js',
  ], 'host.html');
  assertIncludesNone(viewer, [
    '/src/runtime/host-theme-page.js',
  ], 'viewer.html');
});

test('viewer.html is the official viewer page inventory', () => {
  const viewer = readRepoFile('viewer.html');

  assertIncludesAll(viewer, [
    '/src/runtime/viewer-page.js',
    '/src/bootstrap-viewer.js',
  ], 'viewer.html');
  assert.match(viewer, /initViewerPage\(\)/);
  assertIncludesNone(viewer, [
    '/src/bootstrap-shared.js',
    '/src/runtime/app-bridge.js',
    '/src/board.js',
    '/src/jog-runtime.js',
    '/src/theme.js',
  ], 'viewer.html');
  assertIncludesNone(viewer, canonicalForbiddenImports, 'viewer.html');
});

test('viewer page module owns viewer UI boot dependencies', () => {
  const viewerPage = readRepoFile('src/runtime/viewer-page.js');

  assertIncludesAll(viewerPage, [
    '../board.js',
    '../bootstrap-shared.js',
    '../jog-runtime.js',
    '../theme.js',
    './app-bridge.js',
  ], 'src/runtime/viewer-page.js');
  assert.match(viewerPage, /export\s+async\s+function\s+initViewerPage\b/);
  assert.doesNotMatch(viewerPage, /\bconnectWS\b/);
  assert.doesNotMatch(viewerPage, /(?:^|['"])\/?src\/ws\.js|['"]\.\.?\/ws\.js['"]/);
});

test('viewer websocket boot stays in bootstrap-viewer.js', () => {
  const viewer = readRepoFile('viewer.html');
  const bootstrapViewer = readRepoFile('src/bootstrap-viewer.js');

  assert.match(viewer, /<script\s+type=["']module["']\s+src=["']\/src\/bootstrap-viewer\.js["']><\/script>/);
  assertIncludesAll(bootstrapViewer, [
    './ws.js',
    './bootstrap-shared.js',
    './runtime/app-bridge.js',
    'connectWS',
    "const WS_ROLE = 'viewer'",
  ], 'src/bootstrap-viewer.js');
});

test('root index.html is only a launcher into host.html or viewer.html', () => {
  const index = readRepoFile('index.html');

  assertIncludesAll(index, ['host.html', 'viewer.html'], 'index.html');
  assertIncludesNone(index, [
    '/src/main.js',
    '/src/wsClient.js',
    '/src/board.js',
    '/src/midi.js',
    '/src/ws.js',
    '/src/bootstrap-host.js',
    '/src/bootstrap-viewer.js',
    'initBoard',
    'connectWS',
    'initWebMIDI',
  ], 'index.html');
  assert.match(index, /launcher|redirect/i);
});

test('legacy and compatibility entrypoints are labeled and not imported by canonical pages', () => {
  const host = readRepoFile('host.html');
  const viewer = readRepoFile('viewer.html');
  const rootIndex = readRepoFile('index.html');
  const publicIndex = readRepoFile('public/index.html');
  const main = readRepoFile('src/main.js');
  const wsClient = readRepoFile('src/wsClient.js');
  const legacyWsClient = readRepoFile('src/legacy/wsClient.js');
  const hostMidi = readRepoFile('src/host-midi.js');

  assert.match(main, /LEGACY\/DEMO ENTRYPOINT|legacy\/demo/i);
  assert.match(publicIndex, /LEGACY\/DEMO ENTRYPOINT|legacy\/demo/i);
  assert.notEqual(rootIndex, publicIndex);
  assert.match(wsClient, /LEGACY|DEMO|COMPAT/i);
  assert.match(legacyWsClient, /LEGACY|DEMO|COMPAT/i);
  assert.match(hostMidi, /legacy|alternate/i);

  assertIncludesNone(host, canonicalForbiddenImports, 'host.html');
  assertIncludesNone(viewer, canonicalForbiddenImports, 'viewer.html');
  assert.match(host, /\/src\/midi\.js/);
});

test('package scripts keep the browser runtime free of normal Node bridge scripts', () => {
  const pkg = JSON.parse(readRepoFile('package.json'));
  const scripts = pkg.scripts || {};

  assert.equal(scripts.start, 'node server/server.js');
  assert.equal(Object.hasOwn(scripts, 'ws-bridge'), false);
  assert.equal(Object.hasOwn(scripts, 'list-midi'), false);
  assert.equal(Object.hasOwn(scripts, 'list-hid'), false);
  assert.equal(Object.hasOwn(scripts, 'dev:list-midi'), true);
  assert.equal(Object.hasOwn(scripts, 'dev:list-hid'), true);
});

test('server imports legacy HID and MIDI bridge packages only when explicitly enabled', () => {
  const server = readRepoFile('server/server.js');

  assert.match(server, /if\s*\(\s*process\.env\.HID_ENABLED\s*===\s*['"]1['"]\s*\)\s*{/);
  assert.match(server, /await\s+import\(['"]\.\/hid\.js['"]\)/);
  assert.match(server, /if\s*\(\s*MIDI_INPUT\s*\)\s*{/);
  assert.match(server, /await\s+import\(['"]easymidi['"]\)/);
  assert.doesNotMatch(server, /import\s+\{\s*create\s+as\s+createHID\s*\}\s+from\s+['"]\.\/hid\.js['"]/);
  assert.doesNotMatch(server, /import\s+.*\s+from\s+['"]easymidi['"]/);
});

test('README documents the official runtime inventory and legacy labels', () => {
  const readme = readRepoFile('README.md');

  assertIncludesAll(readme, [
    'host.html',
    'viewer.html',
    'src/midi.js',
    'src/ws.js',
    'server/server.js',
    'src/controllers/',
    'pioneer-ddj-flx6',
  ], 'README.md');
  assert.match(readme, /DDJ-FLX6/);

  for (const legacyPath of [
    'src/main.js',
    'public/index.html',
    'src/wsClient.js',
    'src/legacy/wsClient.js',
    'src/host-midi.js',
  ]) {
    assert.match(readme, new RegExp(`${escapeRegExp(legacyPath)}[\\s\\S]{0,140}(legacy|demo|compat|alternate)|(?:legacy|demo|compat|alternate)[\\s\\S]{0,140}${escapeRegExp(legacyPath)}`, 'i'));
  }
});
