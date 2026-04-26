import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initHostThemePage } from '../src/runtime/host-theme-page.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, '..');

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

function createDocumentRef({
  mount = { id: 'launcherThemeMount' },
  svgRoot = { nodeName: 'svg' },
  includeRemoveEventListener = true,
} = {}) {
  const listeners = new Map();
  const calls = {
    getElementById: [],
    querySelector: [],
    addEventListener: [],
    removeEventListener: [],
  };

  const documentRef = {
    calls,
    getElementById(id) {
      calls.getElementById.push(id);
      return id === 'launcherThemeMount' ? mount : null;
    },
    querySelector(selector) {
      calls.querySelector.push(selector);
      return selector === '#boardHost svg' ? svgRoot : null;
    },
    addEventListener(type, handler) {
      calls.addEventListener.push({ type, handler });
      listeners.set(type, handler);
    },
    dispatch(type, event) {
      listeners.get(type)?.(event);
    },
    getListener(type) {
      return listeners.get(type) || null;
    },
  };

  if (includeRemoveEventListener) {
    documentRef.removeEventListener = (type, handler) => {
      calls.removeEventListener.push({ type, handler });
      if (listeners.get(type) === handler) listeners.delete(type);
    };
  }

  return documentRef;
}

function createWindowRef() {
  const calls = {
    addEventListener: [],
    removeEventListener: [],
  };

  return {
    calls,
    addEventListener(type, handler) {
      calls.addEventListener.push({ type, handler });
    },
    removeEventListener(type, handler) {
      calls.removeEventListener.push({ type, handler });
    },
  };
}

test('host theme page module exists and exports initHostThemePage', () => {
  const modulePath = path.join(REPO_ROOT, 'src/runtime/host-theme-page.js');
  const source = readRepoFile('src/runtime/host-theme-page.js');

  assert.equal(fs.existsSync(modulePath), true);
  assert.equal(typeof initHostThemePage, 'function');
  assert.match(source, /export\s+function\s+initHostThemePage\b/);
});

test('host theme page module stays dependency-injected and scoped away from runtime boot systems', () => {
  const source = readRepoFile('src/runtime/host-theme-page.js');

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
    '/src/theme.js',
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
});

test('host.html delegates host theme page wiring while keeping host boot ownership', () => {
  const host = readRepoFile('host.html');

  assert.match(host, /import\s+\{\s*initHostThemePage\s*\}\s+from\s+['"]\/src\/runtime\/host-theme-page\.js['"]/);
  assert.match(host, /const\s+hostThemePage\s*=\s*initHostThemePage\(\{[\s\S]*THEME,[\s\S]*documentRef:\s*document,[\s\S]*windowRef:\s*window,[\s\S]*getLauncher:\s*\(\)\s*=>\s*launcher,[\s\S]*\}\)/);
  assertIncludesAll(host, [
    '/src/theme.js',
    '/src/presets.js',
    '/src/launcher.js',
    'initLauncher({',
    'PRESETS.attachPresetUI(',
    'hostStatus.setLauncher(launcher)',
    'initHostStatusChrome(',
    'initHostControllerPipeline(',
    'initHostDraftMapSync(',
    'startHostMidiCapture(',
    'createHostLauncherActions(',
    'initHostToolsPage(',
    '/src/bootstrap-host.js',
  ], 'host.html');
  assert.match(host, /const\s+stageEl\s*=\s*document\.getElementById\('boardHost'\)/);
  assertIncludesNone(host, [
    'THEME.attachThemeDesigner({',
    "THEME.ensurePreset?.('instrument-dark')",
    "document.addEventListener('keydown', (e)=>",
    "launcher?.toggleSection('theme')",
  ], 'host.html');
});

test('initHostThemePage fails clearly without THEME.attachThemeDesigner', () => {
  assert.throws(
    () => initHostThemePage(),
    {
      name: 'TypeError',
      message: 'initHostThemePage requires THEME.attachThemeDesigner',
    },
  );
});

test('initHostThemePage attaches the theme designer with the existing host mount and SVG root', () => {
  const mount = { id: 'launcherThemeMount' };
  const svgRoot = { id: 'boardHostSvg' };
  const documentRef = createDocumentRef({ mount, svgRoot });
  const windowRef = createWindowRef();
  const themeDesignerResult = { id: 'theme-designer' };
  let attachOptions = null;
  const presetCalls = [];

  const result = initHostThemePage({
    THEME: {
      attachThemeDesigner(options) {
        attachOptions = options;
        return themeDesignerResult;
      },
      ensurePreset(name) {
        presetCalls.push(name);
      },
    },
    documentRef,
    windowRef,
  });

  assert.deepEqual(attachOptions, { mount, svgRoot });
  assert.deepEqual(presetCalls, ['instrument-dark']);
  assert.equal(result.themeDesignerResult, themeDesignerResult);
  assert.equal(typeof result.dispose, 'function');
  assert.equal(typeof result.toggleThemeSection, 'function');
  assert.deepEqual(documentRef.calls.getElementById, ['launcherThemeMount']);
  assert.deepEqual(documentRef.calls.querySelector, ['#boardHost svg']);
  assert.deepEqual(documentRef.calls.addEventListener.map((entry) => entry.type), ['keydown']);
  assert.deepEqual(windowRef.calls.addEventListener, []);
});

test('initHostThemePage tolerates a missing ensurePreset function', () => {
  const documentRef = createDocumentRef();

  assert.doesNotThrow(() => initHostThemePage({
    THEME: {
      attachThemeDesigner() {
        return { id: 'theme-designer' };
      },
    },
    documentRef,
  }));
});

test('initHostThemePage tolerates a missing launcher', () => {
  const documentRef = createDocumentRef();
  const result = initHostThemePage({
    THEME: {
      attachThemeDesigner() {
        return null;
      },
    },
    documentRef,
    getLauncher: () => null,
  });

  assert.doesNotThrow(() => result.toggleThemeSection());
  assert.doesNotThrow(() => documentRef.dispatch('keydown', { shiftKey: true, key: 't' }));
});

test('initHostThemePage hotkey toggles the theme section only for Shift+T without preventDefault', () => {
  const documentRef = createDocumentRef();
  const toggled = [];
  let prevented = 0;

  initHostThemePage({
    THEME: {
      attachThemeDesigner() {
        return null;
      },
    },
    documentRef,
    getLauncher: () => ({
      toggleSection(sectionKey) {
        toggled.push(sectionKey);
      },
    }),
  });

  documentRef.dispatch('keydown', {
    shiftKey: false,
    key: 't',
    preventDefault() {
      prevented += 1;
    },
  });
  documentRef.dispatch('keydown', {
    shiftKey: true,
    key: 'x',
    preventDefault() {
      prevented += 1;
    },
  });
  documentRef.dispatch('keydown', {
    shiftKey: true,
    key: 't',
    preventDefault() {
      prevented += 1;
    },
  });
  documentRef.dispatch('keydown', {
    shiftKey: true,
    key: 'T',
    preventDefault() {
      prevented += 1;
    },
  });

  assert.deepEqual(toggled, ['theme', 'theme']);
  assert.equal(prevented, 0);
});

test('initHostThemePage dispose removes the keydown listener when supported', () => {
  const documentRef = createDocumentRef();
  const result = initHostThemePage({
    THEME: {
      attachThemeDesigner() {
        return null;
      },
    },
    documentRef,
  });

  const listener = documentRef.getListener('keydown');
  assert.equal(typeof listener, 'function');

  result.dispose();

  assert.equal(documentRef.getListener('keydown'), null);
  assert.deepEqual(documentRef.calls.removeEventListener, [
    { type: 'keydown', handler: listener },
  ]);
});

test('initHostThemePage propagates attachThemeDesigner errors', () => {
  const error = new Error('theme attach failed');

  assert.throws(
    () => initHostThemePage({
      THEME: {
        attachThemeDesigner() {
          throw error;
        },
      },
      documentRef: createDocumentRef(),
    }),
    error,
  );
});
