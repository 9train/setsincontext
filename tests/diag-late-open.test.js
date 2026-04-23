import test from 'node:test';
import assert from 'node:assert/strict';

import { installMockBrowser } from './browser-test-helpers.js';

let importCounter = 0;

async function importFresh(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('test', String(++importCounter));
  return import(url.href);
}

function createDebuggerInfo() {
  return {
    type: 'noteon',
    ch: 1,
    d1: 11,
    d2: 127,
    value: 127,
    timestamp: 123,
    mappingId: 'deck.left.transport.play.main.press',
    canonicalTarget: 'deck.left.transport.play',
    matchedBinding: {
      id: 'deck.left.transport.play.main.press',
      canonicalTarget: 'deck.left.transport.play',
      rawTarget: 'play_L',
    },
    semantic: {
      family: 'transport',
      action: 'press',
      meaning: 'transport.play',
      truthStatus: 'official',
      canonicalTarget: 'deck.left.transport.play',
    },
    _boardRender: {
      targetId: 'play_L',
      authority: 'official-render',
      ownership: 'official',
      source: 'official-binding',
      truthStatus: 'official',
      compatibility: false,
      blocked: false,
      applied: true,
      outcome: 'updated',
      detail: 'test-applied',
    },
  };
}

function collectText(node) {
  const parts = [];

  function walk(current) {
    if (!current || typeof current !== 'object') return;
    if (current.textContent) parts.push(current.textContent);
    if (Array.isArray(current.children)) {
      current.children.forEach((child) => walk(child));
    }
  }

  walk(node);
  return parts;
}

test('diagnostics opened late still render runtime-owned recent live history', async () => {
  const env = installMockBrowser();
  let diag = null;

  try {
    const [{ getRuntimeApp }, diagModule] = await Promise.all([
      importFresh('../src/runtime/app-bridge.js'),
      importFresh('../src/diag.js'),
    ]);
    diag = diagModule;
    const runtimeApp = getRuntimeApp();

    runtimeApp.setWSStatus('connected');
    runtimeApp.setMIDIStatus('ready');
    runtimeApp.setControllerRuntime({
      midiStatus: 'ready',
      ready: true,
      deviceName: 'Pioneer DDJ-FLX6',
      profileId: 'pioneer-ddj-flx6',
      profileLabel: 'Pioneer DDJ-FLX6',
      transport: 'midi',
      lastEventAt: 123,
    });
    runtimeApp.consumeInfo(createDebuggerInfo());

    assert.equal(runtimeApp.getRecentDebuggerSnapshots().length, 1);

    diag.show();

    const root = env.window.document.body.children.find((child) => child && child.id === 'diagRoot');
    assert.ok(root);
    assert.equal(root.classList.contains('open'), true);

    const renderedText = collectText(root);
    assert.ok(renderedText.some((text) => text.includes('Recent Live Inputs')));
    assert.ok(renderedText.some((text) => text.includes('Latest live event: NOTEON noteon:1:11 -> Play L -> play_L')));
    assert.ok(renderedText.some((text) => text.includes('Play L -> play_L')));
  } finally {
    try { diag?.hide(); } catch {}
    env.restore();
  }
});
