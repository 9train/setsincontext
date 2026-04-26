import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createHostLauncherActions,
  downloadReplayPayload,
  getCurrentReplayPayload,
  loadSavedReplay,
} from '../src/runtime/host-launcher-actions.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');

const EXPECTED_ACTION_KEYS = [
  'toggleDiag',
  'showDiag',
  'hideDiag',
  'isDiagOpen',
  'toggleTimeline',
  'showTimeline',
  'hideTimeline',
  'toggleWizard',
  'showWizard',
  'toggleEdit',
  'showEdit',
  'hideEdit',
  'isEditOpen',
  'clearDiag',
  'toggleTheme',
  'applyThemePreset',
  'fit',
  'fill',
  'toggleBG',
  'recStart',
  'recStop',
  'recPlay',
  'recDownload',
  'recSaveLocal',
  'recLoadText',
  'listSavedReplays',
  'recLoadSaved',
  'recPlaySaved',
  'recDownloadSaved',
  'recDeleteSaved',
];

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function createClassList() {
  const values = new Set();
  return {
    values,
    add(value) {
      values.add(value);
    },
    remove(value) {
      values.delete(value);
    },
    toggle(value) {
      if (values.has(value)) {
        values.delete(value);
        return false;
      }
      values.add(value);
      return true;
    },
    contains(value) {
      return values.has(value);
    },
  };
}

function createDownloadDom() {
  const anchors = [];
  const body = {
    appendChild(node) {
      anchors.push(node);
      node.parentNode = body;
      return node;
    },
  };
  return {
    anchors,
    documentRef: {
      body,
      createElement(tag) {
        assert.equal(tag, 'a');
        return {
          download: '',
          href: '',
          clickCalls: 0,
          removed: false,
          click() {
            this.clickCalls += 1;
          },
          remove() {
            this.removed = true;
          },
        };
      },
    },
  };
}

function createURLRef() {
  const urls = [];
  const revoked = [];
  return {
    urls,
    revoked,
    URLRef: {
      createObjectURL(blob) {
        urls.push(blob);
        return `blob:test-${urls.length}`;
      },
      revokeObjectURL(url) {
        revoked.push(url);
      },
    },
  };
}

function createMinimalDeps(overrides = {}) {
  return {
    DIAG: {
      toggle() {},
      show() {},
      hide() {},
    },
    RECUI: {
      toggle() {},
      show() {},
      refresh() {},
    },
    WIZ: {
      toggle() {},
    },
    EDIT: {
      toggle() {},
    },
    THEME: {},
    FLXRec: {
      exportJSON: () => '{"events":[]}',
      start() {},
      stop() {},
      play() {},
      download() {},
      loadFromObject() {},
      loadFromText: async () => {},
    },
    runtimeApp: {},
    sessionReplayLibrary: {
      saveReplay() {},
      loadReplay() {
        return null;
      },
      listReplays() {
        return [];
      },
      deleteReplay() {},
    },
    createReplayDownloadFilename: () => 'session-replay.json',
    stageEl: {
      classList: createClassList(),
    },
    documentRef: {
      body: {
        classList: createClassList(),
        appendChild() {},
      },
      createElement() {
        return { click() {}, remove() {} };
      },
    },
    URLRef: {
      createObjectURL: () => 'blob:test',
      revokeObjectURL() {},
    },
    setTimeoutRef(fn) {
      fn();
    },
    getLauncher: () => null,
    ...overrides,
  };
}

test('host launcher actions module exists and exports the action factory helpers', () => {
  const modulePath = path.join(REPO_ROOT, 'src/runtime/host-launcher-actions.js');
  const source = readRepoFile('src/runtime/host-launcher-actions.js');

  assert.equal(fs.existsSync(modulePath), true);
  assert.equal(typeof createHostLauncherActions, 'function');
  assert.equal(typeof getCurrentReplayPayload, 'function');
  assert.equal(typeof downloadReplayPayload, 'function');
  assert.equal(typeof loadSavedReplay, 'function');
  assert.match(source, /export\s+function\s+createHostLauncherActions\b/);
  assert.match(source, /export\s+function\s+getCurrentReplayPayload\b/);
  assert.match(source, /export\s+function\s+downloadReplayPayload\b/);
  assert.match(source, /export\s+function\s+loadSavedReplay\b/);
});

test('host launcher actions module stays dependency-injected and away from runtime boot systems', () => {
  const source = readRepoFile('src/runtime/host-launcher-actions.js');

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
});

test('host-page.js delegates launcher actions while host.html stays thin', () => {
  const hostPage = readRepoFile('src/runtime/host-page.js');
  const host = readRepoFile('host.html');

  assertIncludesAll(hostPage, [
    './host-launcher-actions.js',
    '../launcher.js',
    '../recorder.js',
    '../recorder_ui.js',
    '../session-replay-library.js',
    '../diag.js',
    '../editmode.js',
    '../wizard.js',
    '../theme.js',
    '../presets.js',
    'createHostLauncherActions',
    'initLauncher',
    'hostStatus.setLauncher(launcher)',
    'getStatusSnapshot',
    'mountPresetUI',
    'boardHost',
  ], 'src/runtime/host-page.js');

  assertIncludesNone(hostPage, [
    'function getCurrentReplayPayload',
    'function downloadReplayPayload',
    'function loadSavedReplay',
    'const launcherActions = {',
  ], 'src/runtime/host-page.js');
  assertIncludesAll(host, [
    '/src/runtime/host-page.js',
    '/src/bootstrap-host.js',
  ], 'host.html');
});

test('getCurrentReplayPayload parses FLXRec.exportJSON output', () => {
  const payload = getCurrentReplayPayload({
    FLXRec: {
      exportJSON: () => '{"events":[1]}',
    },
  });

  assert.deepEqual(payload, { events: [1] });
});

test('downloadReplayPayload creates a JSON blob and clicks a download anchor', async () => {
  const { anchors, documentRef } = createDownloadDom();
  const { urls, revoked, URLRef } = createURLRef();

  downloadReplayPayload({
    payload: { events: [1] },
    filename: 'take-one.json',
    documentRef,
    URLRef,
  });

  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].download, 'take-one.json');
  assert.equal(anchors[0].href, 'blob:test-1');
  assert.equal(anchors[0].clickCalls, 1);
  assert.equal(anchors[0].removed, true);
  assert.equal(revoked[0], 'blob:test-1');
  assert.equal(await urls[0].text(), JSON.stringify({ events: [1] }, null, 2));
  assert.equal(urls[0].type, 'application/json');
});

test('loadSavedReplay loads replay payload and refreshes the recorder UI', () => {
  const calls = [];
  const record = { replayId: 'r1', payload: { events: [] } };
  const result = loadSavedReplay({
    replayId: 'r1',
    sessionReplayLibrary: {
      loadReplay: (replayId) => {
        calls.push(['loadReplay', replayId]);
        return record;
      },
    },
    FLXRec: {
      loadFromObject: (payload) => calls.push(['loadFromObject', payload]),
    },
    RECUI: {
      refresh: () => calls.push(['refresh']),
    },
  });

  assert.equal(result, record);
  assert.deepEqual(calls, [
    ['loadReplay', 'r1'],
    ['loadFromObject', record.payload],
    ['refresh'],
  ]);
});

test('loadSavedReplay returns null and skips recorder work when the record is missing', () => {
  const calls = [];
  const result = loadSavedReplay({
    replayId: 'missing',
    sessionReplayLibrary: {
      loadReplay: (replayId) => {
        calls.push(['loadReplay', replayId]);
        return null;
      },
    },
    FLXRec: {
      loadFromObject: () => calls.push(['loadFromObject']),
    },
    RECUI: {
      refresh: () => calls.push(['refresh']),
    },
  });

  assert.equal(result, null);
  assert.deepEqual(calls, [['loadReplay', 'missing']]);
});

test('createHostLauncherActions returns all expected action keys', () => {
  const actions = createHostLauncherActions(createMinimalDeps());

  assert.deepEqual(Object.keys(actions).sort(), [...EXPECTED_ACTION_KEYS].sort());
});

test('diagnostics actions call injected DIAG methods and clear runtime snapshots optionally', () => {
  const calls = [];
  const actions = createHostLauncherActions(createMinimalDeps({
    DIAG: {
      toggle: () => calls.push('toggle'),
      show: () => calls.push('show'),
      hide: () => calls.push('hide'),
      isOpen: () => {
        calls.push('isOpen');
        return true;
      },
    },
    runtimeApp: {
      clearRecentDebuggerSnapshots: () => calls.push('clearRecentDebuggerSnapshots'),
    },
  }));

  actions.toggleDiag();
  actions.showDiag();
  actions.hideDiag();
  assert.equal(actions.isDiagOpen(), true);
  actions.clearDiag();

  assert.deepEqual(calls, ['toggle', 'show', 'hide', 'isOpen', 'clearRecentDebuggerSnapshots']);
});

test('recorder actions call injected FLXRec and RECUI methods', async () => {
  const calls = [];
  const actions = createHostLauncherActions(createMinimalDeps({
    FLXRec: {
      exportJSON: () => '{"events":[2]}',
      start: () => calls.push(['start']),
      stop: () => calls.push(['stop']),
      play: (options) => calls.push(['play', options]),
      download: (filename) => calls.push(['download', filename]),
      loadFromText: async (text) => calls.push(['loadFromText', text]),
      loadFromObject: (payload) => calls.push(['loadFromObject', payload]),
    },
    RECUI: {
      toggle: () => calls.push(['toggleTimeline']),
      show: () => calls.push(['showTimeline']),
      hide: () => calls.push(['hideTimeline']),
      refresh: () => calls.push(['refresh']),
    },
    sessionReplayLibrary: {
      saveReplay: (record) => {
        calls.push(['saveReplay', record]);
        return { replayId: 'saved' };
      },
      loadReplay: () => null,
      listReplays: () => [{ replayId: 'saved' }],
      deleteReplay: (replayId) => calls.push(['deleteReplay', replayId]),
    },
    setTimeoutRef: (fn) => fn(),
  }));

  actions.toggleTimeline();
  actions.showTimeline();
  actions.hideTimeline();
  actions.recStart();
  actions.recStop();
  actions.recPlay();
  actions.recDownload();
  actions.recSaveLocal({ name: 'Practice' });
  await actions.recLoadText('{"events":[]}');
  assert.deepEqual(actions.listSavedReplays(), [{ replayId: 'saved' }]);
  actions.recDeleteSaved('saved');

  assert.deepEqual(calls, [
    ['toggleTimeline'],
    ['showTimeline'],
    ['hideTimeline'],
    ['start'],
    ['refresh'],
    ['stop'],
    ['refresh'],
    ['play', { speed: 1.0, loop: false }],
    ['download', 'take.json'],
    ['saveReplay', { name: 'Practice', payload: { events: [2] } }],
    ['loadFromText', '{"events":[]}'],
    ['refresh'],
    ['deleteReplay', 'saved'],
  ]);
});

test('recStart uses injected setTimeoutRef with delay 50 and refreshes when the callback runs', () => {
  const calls = [];
  let timeoutCallback = null;
  let timeoutDelay = null;
  const actions = createHostLauncherActions(createMinimalDeps({
    FLXRec: {
      exportJSON: () => '{"events":[]}',
      start: () => calls.push('start'),
      stop() {},
      play() {},
      download() {},
      loadFromObject() {},
      loadFromText: async () => {},
    },
    RECUI: {
      toggle() {},
      show() {},
      refresh: () => calls.push('refresh'),
    },
    setTimeoutRef: (fn, delay) => {
      timeoutCallback = fn;
      timeoutDelay = delay;
    },
  }));

  actions.recStart();
  assert.deepEqual(calls, ['start']);
  assert.equal(timeoutDelay, 50);

  timeoutCallback();
  assert.deepEqual(calls, ['start', 'refresh']);
});

test('theme and view actions use injected THEME, stageEl, documentRef, and getLauncher', () => {
  const calls = [];
  const stageClassList = createClassList();
  const bodyClassList = createClassList();
  const actions = createHostLauncherActions(createMinimalDeps({
    THEME: {
      applyPreset: (name) => calls.push(['applyPreset', name]),
    },
    stageEl: {
      classList: stageClassList,
    },
    documentRef: {
      body: {
        classList: bodyClassList,
        appendChild() {},
      },
      createElement() {
        return { click() {}, remove() {} };
      },
    },
    getLauncher: () => ({
      toggleSection: (section) => calls.push(['toggleSection', section]),
    }),
  }));

  stageClassList.add('fill');
  actions.toggleTheme();
  actions.applyThemePreset('instrument-dark');
  actions.fit();
  assert.equal(stageClassList.contains('fill'), false);
  actions.fill();
  assert.equal(stageClassList.contains('fill'), true);
  actions.toggleBG();
  assert.equal(bodyClassList.contains('transparent'), true);

  assert.deepEqual(calls, [
    ['toggleSection', 'theme'],
    ['applyPreset', 'instrument-dark'],
  ]);
});

test('saved replay actions use injected replay library and download filename helper', () => {
  const calls = [];
  const record = { replayId: 'r1', name: 'Warmup', payload: { events: [] } };
  const { anchors, documentRef } = createDownloadDom();
  const { revoked, URLRef } = createURLRef();
  const actions = createHostLauncherActions(createMinimalDeps({
    FLXRec: {
      exportJSON: () => '{"events":[3]}',
      start() {},
      stop() {},
      play: (options) => calls.push(['play', options]),
      download() {},
      loadFromObject: (payload) => calls.push(['loadFromObject', payload]),
      loadFromText: async () => {},
    },
    RECUI: {
      toggle() {},
      show() {},
      refresh: () => calls.push(['refresh']),
    },
    sessionReplayLibrary: {
      saveReplay: (payload) => {
        calls.push(['saveReplay', payload]);
        return record;
      },
      loadReplay: (replayId) => {
        calls.push(['loadReplay', replayId]);
        return record;
      },
      listReplays: () => {
        calls.push(['listReplays']);
        return [record];
      },
      deleteReplay: (replayId) => {
        calls.push(['deleteReplay', replayId]);
        return true;
      },
    },
    createReplayDownloadFilename: (entry) => {
      calls.push(['createReplayDownloadFilename', entry]);
      return 'warmup.json';
    },
    documentRef,
    URLRef,
  }));

  assert.equal(actions.recSaveLocal({ name: 'Warmup' }), record);
  assert.deepEqual(actions.listSavedReplays(), [record]);
  assert.equal(actions.recLoadSaved('r1'), record);
  actions.recPlaySaved('r1');
  actions.recDownloadSaved('r1');
  assert.equal(actions.recDeleteSaved('r1'), true);

  assert.equal(anchors[0].download, 'warmup.json');
  assert.equal(revoked[0], 'blob:test-1');
  assert.deepEqual(calls, [
    ['saveReplay', { name: 'Warmup', payload: { events: [3] } }],
    ['listReplays'],
    ['loadReplay', 'r1'],
    ['loadFromObject', record.payload],
    ['refresh'],
    ['loadReplay', 'r1'],
    ['loadFromObject', record.payload],
    ['refresh'],
    ['play', { speed: 1.0, loop: false }],
    ['loadReplay', 'r1'],
    ['createReplayDownloadFilename', record],
    ['deleteReplay', 'r1'],
  ]);
});

test('optional launcher action methods keep existing optional-chaining fallback behavior', () => {
  const calls = [];
  const actions = createHostLauncherActions(createMinimalDeps({
    DIAG: {
      toggle() {},
      show() {},
      hide() {},
    },
    RECUI: {
      toggle() {},
      show() {},
      refresh() {},
    },
    WIZ: {
      toggle: () => calls.push('wizard-toggle'),
    },
    EDIT: {
      toggle: () => calls.push('edit-toggle'),
    },
    THEME: {},
    runtimeApp: {},
    getLauncher: () => null,
  }));

  assert.equal(actions.isDiagOpen(), false);
  assert.doesNotThrow(() => actions.hideTimeline());
  assert.doesNotThrow(() => actions.clearDiag());
  assert.doesNotThrow(() => actions.toggleTheme());
  assert.doesNotThrow(() => actions.applyThemePreset('instrument-dark'));
  actions.showWizard();
  actions.showEdit();
  actions.hideEdit();
  assert.equal(actions.isEditOpen(), false);
  assert.deepEqual(calls, ['wizard-toggle', 'edit-toggle', 'edit-toggle']);
});
