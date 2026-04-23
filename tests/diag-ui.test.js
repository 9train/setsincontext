import test from 'node:test';
import assert from 'node:assert/strict';

import { setBoardSvgRoot } from '../src/board/state.js';
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

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  if (Array.isArray(node.children)) {
    node.children.forEach((child) => walk(child, visit));
  }
}

function collectText(node) {
  const parts = [];
  walk(node, (current) => {
    if (current.textContent) parts.push(current.textContent);
  });
  return parts;
}

function findNode(root, predicate) {
  let match = null;
  walk(root, (node) => {
    if (!match && predicate(node)) match = node;
  });
  return match;
}

function createBoardFixture(document) {
  const svgRoot = document.createElement('svg');
  svgRoot.setAttribute('id', 'board');

  const play = document.createElement('g');
  play.setAttribute('id', 'play_L');

  const cue = document.createElement('g');
  cue.setAttribute('id', 'cue_L');

  svgRoot.appendChild(play);
  svgRoot.appendChild(cue);

  svgRoot.getElementById = (id) => findNode(svgRoot, (node) => node && typeof node.getAttribute === 'function' && node.getAttribute('id') === id);

  return { svgRoot, play, cue };
}

test('diagnostics default to Basic, keep the Advanced trace, and let hover help coexist with board pinning', async () => {
  const env = installMockBrowser();
  let diag = null;

  try {
    const [{ getRuntimeApp }, diagModule] = await Promise.all([
      importFresh('../src/runtime/app-bridge.js'),
      importFresh('../src/diag.js'),
    ]);
    diag = diagModule;

    const runtimeApp = getRuntimeApp();
    runtimeApp.consumeInfo(createDebuggerInfo());

    const { svgRoot, play, cue } = createBoardFixture(env.document);
    setBoardSvgRoot(svgRoot);

    diag.show();

    const root = findNode(env.document.body, (node) => node && node.id === 'diagRoot');
    const basicTab = findNode(root, (node) => node && node.dataset && node.dataset.tab === 'basic');
    const advancedTab = findNode(root, (node) => node && node.dataset && node.dataset.tab === 'advanced');
    const basicPanel = findNode(root, (node) => node && node.dataset && node.dataset.tabPanel === 'basic');
    const advancedPanel = findNode(root, (node) => node && node.dataset && node.dataset.tabPanel === 'advanced');
    const hoverToggle = findNode(root, (node) => node && node.dataset && node.dataset.hoverExplainToggle === 'true');

    assert.ok(root);
    assert.ok(basicTab);
    assert.ok(advancedTab);
    assert.ok(hoverToggle);
    assert.equal(basicTab.classList.contains('is-selected'), true);
    assert.equal(advancedTab.classList.contains('is-selected'), false);
    assert.equal(basicPanel.style.display, 'flex');
    assert.equal(advancedPanel.style.display, 'none');

    advancedTab.dispatchEvent({ type: 'click', target: advancedTab });

    assert.equal(basicTab.classList.contains('is-selected'), false);
    assert.equal(advancedTab.classList.contains('is-selected'), true);
    assert.equal(advancedPanel.style.display, 'flex');
    assert.ok(collectText(root).some((text) => text.includes('Technical Trace')));

    basicTab.dispatchEvent({ type: 'click', target: basicTab });
    hoverToggle.dispatchEvent({ type: 'click', target: hoverToggle });

    assert.match(hoverToggle.textContent, /On/);

    env.document.dispatchEvent({
      type: 'mouseover',
      target: play,
      clientX: 80,
      clientY: 90,
    });

    const hoverCard = findNode(env.document.body, (node) => node && node.id === 'diagHoverCard');
    assert.ok(hoverCard);
    assert.ok(collectText(hoverCard).some((text) => text.includes('PLAY / PAUSE')));
    assert.ok(collectText(hoverCard).some((text) => text.includes('Starts or stops the song on this deck.')));

    env.document.dispatchEvent({ type: 'click', target: cue });

    assert.ok(collectText(root).some((text) => text.includes('Jumps back to a saved starting point.')));
  } finally {
    try { setBoardSvgRoot(null); } catch {}
    try { diag?.hide(); } catch {}
    env.restore();
  }
});
