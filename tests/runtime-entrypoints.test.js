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
    '/src/midi.js',
    '/src/board.js',
    '/src/bootstrap-host.js',
  ], 'host.html');
  assert.match(host, /<script\s+type=["']module["']>/);
  assert.match(host, /initSharedPageBoot\(\{\s*role:\s*['"]host['"]/);
  assert.match(host, /await\s+initBoard\(\{\s*hostId:\s*['"]boardHost['"]\s*\}\)/);
  assert.doesNotMatch(host, /\/src\/runtime\/host-page\.js/);
  assertIncludesNone(host, canonicalForbiddenImports, 'host.html');
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
