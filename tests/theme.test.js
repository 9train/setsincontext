import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

let importCounter = 0;

async function importFresh(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('test', String(++importCounter));
  return import(url.href);
}

class FakeStyle {
  setProperty(name, value) {
    this[name] = String(value);
  }

  getPropertyValue(name) {
    return this[name] || '';
  }

  removeProperty(name) {
    delete this[name];
  }
}

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.tokens = new Set();
  }

  add(...values) {
    values.forEach((value) => this.tokens.add(String(value)));
    this._sync();
  }

  remove(...values) {
    values.forEach((value) => this.tokens.delete(String(value)));
    this._sync();
  }

  contains(value) {
    return this.tokens.has(String(value));
  }

  toggle(value, force) {
    const token = String(value);
    if (force === true) {
      this.tokens.add(token);
      this._sync();
      return true;
    }
    if (force === false) {
      this.tokens.delete(token);
      this._sync();
      return false;
    }
    if (this.tokens.has(token)) this.tokens.delete(token);
    else this.tokens.add(token);
    this._sync();
    return this.tokens.has(token);
  }

  set(value) {
    this.tokens = new Set(String(value || '').split(/\s+/).filter(Boolean));
    this._sync();
  }

  toString() {
    return Array.from(this.tokens).join(' ');
  }

  _sync() {
    this.owner._className = this.toString();
  }
}

function parseSimpleSelector(selector) {
  const raw = String(selector || '').trim();
  const tagMatch = raw.match(/^[a-zA-Z0-9_-]+/);
  const idMatch = raw.match(/#([a-zA-Z0-9_-]+)/);
  const classMatches = [...raw.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((match) => match[1]);
  const attrMatches = [...raw.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)].map((match) => ({
    name: match[1],
    value: match[2],
  }));
  return {
    tag: tagMatch ? tagMatch[0].toLowerCase() : null,
    id: idMatch ? idMatch[1] : null,
    classes: classMatches,
    attrs: attrMatches,
  };
}

function matchesSimpleSelector(node, selector) {
  if (!node || !(node instanceof FakeElement)) return false;
  const parsed = parseSimpleSelector(selector);
  if (parsed.tag && node.tagName !== parsed.tag) return false;
  if (parsed.id && node.id !== parsed.id) return false;
  if (parsed.classes.some((cls) => !node.classList.contains(cls))) return false;
  return parsed.attrs.every(({ name, value }) => {
    if (name === 'id') return value == null ? !!node.id : node.id === value;
    if (name === 'class') return value == null ? !!node.className : node.className === value;
    if (name.startsWith('data-')) {
      const datasetKey = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      const current = node.dataset[datasetKey];
      return value == null ? current != null : String(current) === value;
    }
    const current = node.getAttribute(name);
    return value == null ? current != null : String(current) === value;
  });
}

function matchesSelectorChain(node, selector) {
  const parts = String(selector || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return false;

  let current = node;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    while (current && !matchesSimpleSelector(current, part)) current = current.parentNode;
    if (!current) return false;
    current = current.parentNode;
  }
  return true;
}

function collectDescendants(node, out = []) {
  (node.children || []).forEach((child) => {
    out.push(child);
    collectDescendants(child, out);
  });
  return out;
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function parseHtmlAttributes(attrText = '') {
  const attrs = [];
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of String(attrText || '').matchAll(pattern)) {
    attrs.push([match[1], match[2] ?? match[3] ?? match[4] ?? '']);
  }
  return attrs;
}

function assignInnerHtml(parent, html) {
  parent.children = [];
  parent._textContent = '';
  parent._innerHTML = String(html ?? '');

  const stack = [parent];
  const tokenPattern = /<!--[\s\S]*?-->|<\/([A-Za-z0-9:_-]+)\s*>|<([A-Za-z0-9:_-]+)\b([^<>]*?)(\/?)>|([^<]+)/g;

  for (const match of parent._innerHTML.matchAll(tokenPattern)) {
    if (match[1]) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    if (match[2]) {
      const tagName = match[2].toLowerCase();
      const el = parent.ownerDocument.createElement(tagName);
      parseHtmlAttributes(match[3] || '').forEach(([name, value]) => el.setAttribute(name, value));
      stack.at(-1).appendChild(el);
      if (match[4] !== '/' && !VOID_TAGS.has(tagName)) stack.push(el);
      continue;
    }

    const text = String(match[5] || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    stack.at(-1)._textContent += (stack.at(-1)._textContent ? ' ' : '') + text;
  }
}

class FakeElement {
  constructor(tagName = 'div', ownerDocument = null) {
    this.tagName = String(tagName || 'div').toLowerCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.children = [];
    this.dataset = {};
    this.style = new FakeStyle();
    this.classList = new FakeClassList(this);
    this._className = '';
    this._listeners = new Map();
    this._attrs = new Map();
    this._innerHTML = '';
    this._textContent = '';
    this.id = '';
    this.value = '';
    this.type = '';
    this.checked = false;
    this.disabled = false;
    this.open = false;
    this.files = [];
    this._rect = null;
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this.classList.set(value);
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value ?? '');
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    assignInnerHtml(this, value);
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.flat().forEach((child) => this.appendChild(child));
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  setAttribute(name, value) {
    const normalized = String(name);
    const nextValue = String(value);
    this._attrs.set(normalized, nextValue);
    if (normalized === 'id') this.id = nextValue;
    if (normalized === 'class') this.className = nextValue;
    if (normalized === 'style') this.style.cssText = nextValue;
    if (normalized === 'type') this.type = nextValue;
    if (normalized === 'value') this.value = nextValue;
    if (normalized === 'checked') this.checked = nextValue !== 'false';
    if (normalized === 'open') this.open = nextValue !== 'false';
    if (normalized.startsWith('data-')) {
      const datasetKey = normalized.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      this.dataset[datasetKey] = nextValue;
    }
  }

  getAttribute(name) {
    const normalized = String(name);
    if (normalized === 'id') return this.id || null;
    if (normalized === 'class') return this.className || null;
    if (normalized === 'type') return this.type || null;
    if (normalized === 'value') return this.value || null;
    if (normalized.startsWith('data-')) {
      const datasetKey = normalized.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      return this.dataset[datasetKey] ?? null;
    }
    return this._attrs.has(normalized) ? this._attrs.get(normalized) : null;
  }

  removeAttribute(name) {
    this._attrs.delete(String(name));
  }

  getBoundingClientRect() {
    const rect = this._rect || { left: 0, top: 0, width: 0, height: 0 };
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
    };
  }

  setBoundingClientRect(rect) {
    this._rect = {
      left: Number(rect?.left || 0),
      top: Number(rect?.top || 0),
      width: Number(rect?.width || 0),
      height: Number(rect?.height || 0),
    };
  }

  setPointerCapture() {}

  releasePointerCapture() {}

  get isConnected() {
    let current = this;
    while (current) {
      if (current === this.ownerDocument?.documentElement) return true;
      current = current.parentNode;
    }
    return false;
  }

  addEventListener(type, fn) {
    const listeners = this._listeners.get(type) || [];
    listeners.push(fn);
    this._listeners.set(type, listeners);
  }

  removeEventListener(type, fn) {
    const listeners = this._listeners.get(type) || [];
    this._listeners.set(type, listeners.filter((listener) => listener !== fn));
  }

  dispatchEvent(event) {
    const evt = event || {};
    evt.type = evt.type || 'event';
    evt.target = evt.target || this;
    evt.defaultPrevented = !!evt.defaultPrevented;
    evt.cancelBubble = !!evt.cancelBubble;
    evt.preventDefault ||= () => {
      evt.defaultPrevented = true;
    };
    evt.stopPropagation ||= () => {
      evt.cancelBubble = true;
    };
    evt.composedPath ||= () => {
      const path = [];
      let current = evt.target;
      while (current) {
        path.push(current);
        current = current.parentNode;
      }
      return path;
    };

    let current = this;
    while (current) {
      evt.currentTarget = current;
      const listeners = current._listeners?.get?.(evt.type) || [];
      listeners.forEach((listener) => listener(evt));
      if (evt.cancelBubble) break;
      current = current.parentNode;
    }
    return true;
  }

  closest(selector) {
    const selectors = String(selector || '').split(',').map((part) => part.trim()).filter(Boolean);
    let current = this;
    while (current) {
      if (selectors.some((part) => matchesSimpleSelector(current, part))) return current;
      current = current.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const selectors = String(selector || '').split(',').map((part) => part.trim()).filter(Boolean);
    const descendants = collectDescendants(this);
    return descendants.filter((node) => selectors.some((part) => matchesSelectorChain(node, part)));
  }

  scrollIntoView() {}
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement('html', this);
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
    this._listeners = new Map();
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.documentElement.parentNode = this;
  }

  createElement(tag) {
    return new FakeElement(tag, this);
  }

  getElementById(id) {
    return collectDescendants(this.documentElement).find((node) => node.id === id) || null;
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }

  addEventListener(type, fn) {
    const listeners = this._listeners.get(type) || [];
    listeners.push(fn);
    this._listeners.set(type, listeners);
  }

  removeEventListener(type, fn) {
    const listeners = this._listeners.get(type) || [];
    this._listeners.set(type, listeners.filter((listener) => listener !== fn));
  }

  dispatchEvent(event) {
    const evt = event || {};
    evt.type = evt.type || 'event';
    evt.target = evt.target || this;
    evt.currentTarget = this;
    const listeners = this._listeners.get(evt.type) || [];
    listeners.forEach((listener) => listener(evt));
    return true;
  }
}

function installThemeDom() {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    localStorage: globalThis.localStorage,
    Element: globalThis.Element,
  };

  const document = new FakeDocument();
  const storage = new Map();
  const localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    },
  };

  globalThis.document = document;
  globalThis.localStorage = localStorage;
  globalThis.Element = FakeElement;
  globalThis.window = {
    document,
    localStorage,
    alert() {},
    confirm() { return true; },
    prompt() { return null; },
  };

  return {
    document,
    localStorage,
    restore() {
      globalThis.document = previous.document;
      globalThis.window = previous.window;
      globalThis.localStorage = previous.localStorage;
      globalThis.Element = previous.Element;
    },
  };
}

function createBoardSvg(document, id = 'board-svg') {
  const svg = document.createElement('svg');
  svg.id = id;
  return svg;
}

function createThemeFixture(document) {
  const boardHost = document.createElement('section');
  boardHost.id = 'boardHost';
  const svg = createBoardSvg(document);

  const addNode = (tag, id) => {
    const node = document.createElement(tag);
    node.id = id;
    svg.appendChild(node);
    return node;
  };

  const fader = addNode('rect', 'slider_ch1');
  const pad = addNode('rect', 'pad_l_1');
  const hotcue = addNode('rect', 'hotcue_L');
  const jogRing = addNode('circle', 'jog_L_ring');
  const jogPlatter = addNode('circle', 'jog_L_platter');
  const jogTouch = addNode('circle', 'jog_L_touch');
  const play = addNode('circle', 'play_L');
  const loopIn = addNode('circle', 'loop_in_L');
  const load = addNode('rect', 'load_1');
  const browser = addNode('rect', 'browser_view');
  const cue = addNode('rect', 'headphone_cue_1');
  const beatFx = addNode('circle', 'beatfx_select');
  const beatFxKnob = addNode('g', 'beatfx_x5F_levels_x5F_knob');
  const masterLevel = addNode('g', 'master_level');
  const boothLevel = addNode('g', 'booth_level');
  const label = addNode('text', 'text190');

  boardHost.appendChild(svg);
  document.body.appendChild(boardHost);

  const mount = document.createElement('div');
  mount.id = 'launcherThemeMount';
  document.body.appendChild(mount);

  return {
    boardHost,
    mount,
    svg,
    fader,
    pad,
    hotcue,
    jogRing,
    jogPlatter,
    jogTouch,
    play,
    loopIn,
    load,
    browser,
    cue,
    beatFx,
    beatFxKnob,
    masterLevel,
    boothLevel,
    label,
  };
}

function click(node) {
  node.dispatchEvent({ type: 'click', target: node });
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

function changeColorInput(input, value) {
  input.value = value;
  input.dispatchEvent({ type: 'input', target: input });
  input.dispatchEvent({ type: 'change', target: input });
}

function changeRangeInput(input, value) {
  input.value = String(value);
  input.dispatchEvent({ type: 'input', target: input });
  input.dispatchEvent({ type: 'change', target: input });
}

function selectStudioTab(mount, key) {
  click(mount.querySelector(`[data-tab="${key}"]`));
}

function selectGroup(mount, key) {
  click(mount.querySelector(`.theme-group-choice[data-group-key="${key}"]`));
}

test('attachThemeDesigner enables grouped theming by default on the SVG root', async () => {
  const env = installThemeDom();
  try {
    const { attachThemeDesigner } = await importFresh('../src/theme.js');
    const { mount, svg, fader } = createThemeFixture(env.document);

    attachThemeDesigner({ mount, svgRoot: svg });

    assert.equal(svg.classList.contains('themed'), true);
    assert.equal(fader.classList.contains('g-fader'), true);
    assert.equal(mount.querySelector('.theme-studio') !== null, true);
    assert.equal(mount.querySelectorAll('.theme-color-tab').length, 4);
  } finally {
    env.restore();
  }
});

test('changing a group color updates the matching CSS variable on the SVG root', async () => {
  const env = installThemeDom();
  try {
    const { attachThemeDesigner } = await importFresh('../src/theme.js');
    const { mount, svg } = createThemeFixture(env.document);

    attachThemeDesigner({ mount, svgRoot: svg });

    selectGroup(mount, 'pad');
    const [hue, saturation, lightness] = mount.querySelectorAll('.theme-tone-slider');
    changeRangeInput(hue, 20);
    changeRangeInput(saturation, 100);
    changeRangeInput(lightness, 50);

    assert.equal(svg.style.getPropertyValue('--pad-stroke'), '#ff5500');
    assert.equal(svg.style.getPropertyValue('--pad-fill'), 'rgba(255, 85, 0, 0.86)');
  } finally {
    env.restore();
  }
});

test('theme writes follow the current #boardHost svg after the board rerenders', async () => {
  const env = installThemeDom();
  try {
    const { attachThemeDesigner, setVars } = await importFresh('../src/theme.js');
    const fixture = createThemeFixture(env.document);

    attachThemeDesigner({ mount: fixture.mount, svgRoot: fixture.svg });

    const nextSvg = createBoardSvg(env.document, 'board-svg-next');
    const nextPad = env.document.createElement('rect');
    nextPad.id = 'pad_l_1';
    nextSvg.appendChild(nextPad);

    fixture.svg.remove();
    fixture.boardHost.appendChild(nextSvg);

    setVars({
      'pad-fill': 'rgba(18, 52, 86, 0.86)',
      'pad-stroke': '#123456',
    });

    assert.equal(nextSvg.classList.contains('themed'), true);
    assert.equal(nextPad.classList.contains('g-pad'), true);
    assert.equal(nextSvg.style.getPropertyValue('--pad-stroke'), '#123456');
    assert.equal(nextSvg.style.getPropertyValue('--pad-fill'), 'rgba(18, 52, 86, 0.86)');
  } finally {
    env.restore();
  }
});

test('applyPreset updates root and SVG theme variables', async () => {
  const env = installThemeDom();
  try {
    const { attachThemeDesigner, applyPreset } = await importFresh('../src/theme.js');
    const { mount, svg } = createThemeFixture(env.document);

    attachThemeDesigner({ mount, svgRoot: svg });
    applyPreset('ocean-glow');

    assert.equal(env.document.documentElement.style.getPropertyValue('--bg'), '#07121b');
    assert.equal(env.document.documentElement.style.getPropertyValue('--lit'), '#6ee7ff');
    assert.equal(svg.style.getPropertyValue('--pad-stroke'), '#72f1d3');
    assert.equal(svg.style.getPropertyValue('--jog-ring-stroke'), '#7ee7ff');
    assert.equal(svg.style.getPropertyValue('--button-stroke'), '#7cc6ff');
  } finally {
    env.restore();
  }
});

test('saved custom scene appears after saving and can be applied', async () => {
  const env = installThemeDom();
  try {
    const { attachThemeDesigner, applyPreset, setVars, getVars } = await importFresh('../src/theme.js');
    const { mount, svg } = createThemeFixture(env.document);

    attachThemeDesigner({ mount, svgRoot: svg });
    setVars({ bg: '#123456', lit: '#fedcba', 'pad-stroke': '#c0ffee' });

    selectStudioTab(mount, 'themes');
    const nameInput = mount.querySelector('.theme-scene-name-input');
    nameInput.value = 'Deck Warmup';
    const saveButton = mount.querySelector('.theme-save-actions button');
    click(saveButton);

    const savedScenes = JSON.parse(env.localStorage.getItem('flx.theme.custom-scenes.v1'));
    assert.equal(savedScenes.length, 1);
    const savedSceneId = savedScenes[0].id;
    const savedSceneVars = savedScenes[0].vars;

    const savedCard = mount.querySelector(`[data-scene-id="${savedSceneId}"] .theme-scene-card-main`);
    assert.notEqual(savedCard, null);

    applyPreset('classic');
    click(savedCard);

    assert.equal(getVars().bg, '#123456');
    assert.equal(getVars().lit, '#fedcba');
    assert.equal(getVars()['pad-stroke'], '#c0ffee');
    assert.equal(savedSceneVars.bg, '#123456');
  } finally {
    env.restore();
  }
});

test('advanced raw controls stay collapsed by default', async () => {
  const env = installThemeDom();
  try {
    const { attachThemeDesigner } = await importFresh('../src/theme.js');
    const { mount, svg } = createThemeFixture(env.document);

    attachThemeDesigner({ mount, svgRoot: svg });

    const advanced = mount.querySelector('.theme-advanced-raw');
    assert.notEqual(advanced, null);
    assert.equal(advanced.open, false);
  } finally {
    env.restore();
  }
});

test('group rules classify legacy controls and new semantic theme families', async () => {
  const env = installThemeDom();
  try {
    const { attachThemeDesigner } = await importFresh('../src/theme.js');
    const fixture = createThemeFixture(env.document);

    attachThemeDesigner({ mount: fixture.mount, svgRoot: fixture.svg });

    assert.equal(fixture.fader.classList.contains('g-fader'), true);
    assert.equal(fixture.pad.classList.contains('g-pad'), true);
    assert.equal(fixture.hotcue.classList.contains('g-pad-mode'), true);
    assert.equal(fixture.jogRing.classList.contains('g-jog-ring'), true);
    assert.equal(fixture.jogPlatter.classList.contains('g-jog-platter'), true);
    assert.equal(fixture.jogTouch.classList.contains('g-jog-touch'), true);
    assert.equal(fixture.play.classList.contains('g-button'), true);
    assert.equal(fixture.play.classList.contains('g-transport-button'), true);
    assert.equal(fixture.loopIn.classList.contains('g-button'), true);
    assert.equal(fixture.loopIn.classList.contains('g-loop-button'), true);
    assert.equal(fixture.load.classList.contains('g-load-button'), true);
    assert.equal(fixture.browser.classList.contains('g-browser-button'), true);
    assert.equal(fixture.cue.classList.contains('g-mixer-button'), true);
    assert.equal(fixture.beatFx.classList.contains('g-fx-button'), true);
    assert.equal(fixture.beatFxKnob.classList.contains('g-knob'), true);
    assert.equal(fixture.masterLevel.classList.contains('g-knob'), true);
    assert.equal(fixture.boothLevel.classList.contains('g-knob'), true);
    assert.equal(fixture.label.classList.contains('g-label'), true);
  } finally {
    env.restore();
  }
});

test('jog wheels card is active and updates jog theme vars', async () => {
  const env = installThemeDom();
  try {
    const { attachThemeDesigner } = await importFresh('../src/theme.js');
    const { mount, svg } = createThemeFixture(env.document);

    attachThemeDesigner({ mount, svgRoot: svg });

    selectGroup(mount, 'jog');
    const jogButton = mount.querySelector('.theme-group-choice[data-group-key="jog"]');
    assert.notEqual(jogButton, null);
    assert.equal(jogButton.classList.contains('is-disabled'), false);

    const [hue, saturation, lightness] = mount.querySelectorAll('.theme-tone-slider');
    changeRangeInput(hue, 180);
    changeRangeInput(saturation, 100);
    changeRangeInput(lightness, 50);

    assert.equal(svg.style.getPropertyValue('--jog-ring-stroke'), '#00ffff');
    assert.equal(svg.style.getPropertyValue('--jog-ring-fill'), 'rgba(0, 255, 255, 0.9)');
    assert.equal(svg.style.getPropertyValue('--jog-indicator-fill'), '#00ffff');
  } finally {
    env.restore();
  }
});

test('whites tab applies a friendly white preset to the selected group', async () => {
  const env = installThemeDom();
  try {
    const { attachThemeDesigner } = await importFresh('../src/theme.js');
    const { mount, svg } = createThemeFixture(env.document);

    attachThemeDesigner({ mount, svgRoot: svg });

    selectGroup(mount, 'label');
    selectStudioTab(mount, 'whites');
    click(mount.querySelector('.theme-white-chip'));

    assert.equal(svg.style.getPropertyValue('--label-fill'), '#ffd5b4');
    assert.equal(JSON.parse(env.localStorage.getItem('flx.theme.recent-colors.v1'))[0], '#ffd5b4');
  } finally {
    env.restore();
  }
});

test('palette tab saves the current group color and persists it in localStorage', async () => {
  const env = installThemeDom();
  try {
    const { attachThemeDesigner } = await importFresh('../src/theme.js');
    const { mount, svg } = createThemeFixture(env.document);

    attachThemeDesigner({ mount, svgRoot: svg });

    selectGroup(mount, 'pad');
    const [hue, saturation, lightness] = mount.querySelectorAll('.theme-tone-slider');
    changeRangeInput(hue, 20);
    changeRangeInput(saturation, 100);
    changeRangeInput(lightness, 50);

    selectStudioTab(mount, 'palette');
    click(mount.querySelector('.theme-palette-actions button'));

    const savedPalette = JSON.parse(env.localStorage.getItem('flx.theme.saved-palette.v1'));
    assert.equal(savedPalette[0], '#ff5500');
    assert.equal(svg.style.getPropertyValue('--pad-stroke'), '#ff5500');
  } finally {
    env.restore();
  }
});

test('legacy saved scenes normalize newly added theme vars', async () => {
  const env = installThemeDom();
  try {
    env.localStorage.setItem('flx.theme.custom-scenes.v1', JSON.stringify([{
      id: 'scene-legacy',
      name: 'Legacy Scene',
      vars: {
        bg: '#123456',
        lit: '#abcdef',
        'pad-stroke': '#ff5500',
      },
      createdAt: 1,
    }]));

    const { attachThemeDesigner, getVars } = await importFresh('../src/theme.js');
    const { mount, svg } = createThemeFixture(env.document);

    attachThemeDesigner({ mount, svgRoot: svg });

    selectStudioTab(mount, 'themes');
    const savedCard = mount.querySelector('[data-scene-id="scene-legacy"] .theme-scene-card-main');
    click(savedCard);

    assert.equal(getVars().bg, '#123456');
    assert.equal(getVars()['jog-ring-stroke'], 'rgba(220, 214, 202, 0.18)');
    assert.equal(getVars()['browser-stroke'], 'rgba(220, 214, 202, 0.18)');
    assert.equal(getVars()['label-fill'], '#f3efe7');
  } finally {
    env.restore();
  }
});

test('themed SVG group rules use scoped !important paint overrides', async () => {
  const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

  assert.match(
    css,
    /#boardHost svg\.themed \.g-pad,\s*#boardHost svg\.themed \.g-pad \* \{\s*fill:[^;]+!important;\s*stroke:[^;]+!important;/s,
  );
  assert.match(
    css,
    /#boardHost svg\.themed \.g-jog-ring,\s*#boardHost svg\.themed \.g-jog-ring \* \{\s*fill:[^;]+!important;\s*stroke:[^;]+!important;/s,
  );
  assert.match(
    css,
    /#boardHost svg\.themed \.g-label,\s*#boardHost svg\.themed \.g-label \* \{\s*fill:[^;]+!important;\s*stroke:[^;]+!important;/s,
  );
});

test('theme audit flags inline paint when themed CSS would lose to authored SVG paint', async () => {
  const { auditSvgThemeCoverage } = await importFresh('../src/groups.js');
  const sampleSvg = `
    <svg>
      <rect id="pad_L_1" style="fill:#111111;stroke:#222222" />
    </svg>
  `;

  const blockedAudit = auditSvgThemeCoverage(sampleSvg, null, { themePaintWins: false });
  const safeAudit = auditSvgThemeCoverage(sampleSvg);

  assert.deepEqual(blockedAudit.paintBlockedIds, ['pad_L_1']);
  assert.equal(blockedAudit.reportById.pad_L_1.status, 'paint-blocked');
  assert.equal(safeAudit.inlinePaintIds.includes('pad_L_1'), true);
  assert.equal(safeAudit.paintBlockedIds.length, 0);
});

test('color wheel pointer positions map cleanly to top right bottom and left', async () => {
  const env = installThemeDom();
  try {
    const { attachThemeDesigner } = await importFresh('../src/theme.js');
    const { mount, svg } = createThemeFixture(env.document);

    attachThemeDesigner({ mount, svgRoot: svg });
    selectGroup(mount, 'pad');

    const wheelWrap = mount.querySelector('.theme-wheel-wrap');
    const hueSlider = mount.querySelector('.theme-tone-slider');
    wheelWrap.setBoundingClientRect({ left: 100, top: 50, width: 200, height: 200 });

    const cases = [
      { name: 'top', clientX: 200, clientY: 50, hue: '0', x: '100px', y: '20px' },
      { name: 'right', clientX: 300, clientY: 150, hue: '90', x: '180px', y: '100px' },
      { name: 'bottom', clientX: 200, clientY: 250, hue: '180', x: '100px', y: '180px' },
      { name: 'left', clientX: 100, clientY: 150, hue: '270', x: '20px', y: '100px' },
    ];

    for (const testCase of cases) {
      wheelWrap.dispatchEvent({
        type: 'pointerdown',
        target: wheelWrap,
        pointerId: 1,
        clientX: testCase.clientX,
        clientY: testCase.clientY,
      });
      wheelWrap.dispatchEvent({
        type: 'pointerup',
        target: wheelWrap,
        pointerId: 1,
        clientX: testCase.clientX,
        clientY: testCase.clientY,
      });
      await flushAsyncWork();

      assert.equal(hueSlider.value, testCase.hue, `${testCase.name} hue`);
      assert.equal(wheelWrap.style.getPropertyValue('--theme-wheel-x'), testCase.x, `${testCase.name} handle x`);
      assert.equal(wheelWrap.style.getPropertyValue('--theme-wheel-y'), testCase.y, `${testCase.name} handle y`);
    }
  } finally {
    env.restore();
  }
});

test('color wheel drag previews live and commits one recent color on pointerup', async () => {
  const env = installThemeDom();
  try {
    const { attachThemeDesigner } = await importFresh('../src/theme.js');
    const { mount, svg } = createThemeFixture(env.document);

    attachThemeDesigner({ mount, svgRoot: svg });
    selectGroup(mount, 'pad');

    const [, saturation, lightness] = mount.querySelectorAll('.theme-tone-slider');
    changeRangeInput(saturation, 100);
    changeRangeInput(lightness, 50);
    env.localStorage.removeItem('flx.theme.recent-colors.v1');

    const wheelWrap = mount.querySelector('.theme-wheel-wrap');
    wheelWrap.setBoundingClientRect({ left: 100, top: 50, width: 200, height: 200 });

    wheelWrap.dispatchEvent({
      type: 'pointerdown',
      target: wheelWrap,
      pointerId: 7,
      clientX: 200,
      clientY: 50,
    });
    await flushAsyncWork();
    assert.equal(env.localStorage.getItem('flx.theme.recent-colors.v1'), null);

    wheelWrap.dispatchEvent({
      type: 'pointermove',
      target: wheelWrap,
      pointerId: 7,
      clientX: 300,
      clientY: 150,
    });
    await flushAsyncWork();
    assert.equal(svg.style.getPropertyValue('--pad-stroke'), '#80ff00');

    wheelWrap.dispatchEvent({
      type: 'pointerup',
      target: wheelWrap,
      pointerId: 7,
      clientX: 200,
      clientY: 250,
    });
    await flushAsyncWork();

    const recents = JSON.parse(env.localStorage.getItem('flx.theme.recent-colors.v1'));
    assert.deepEqual(recents, ['#00ffff']);
    assert.equal(svg.style.getPropertyValue('--pad-stroke'), '#00ffff');
  } finally {
    env.restore();
  }
});

test('board svg audit leaves no suspicious ungrouped ids', async () => {
  const { auditSvgThemeCoverage } = await importFresh('../src/groups.js');
  const svgText = fs.readFileSync(new URL('../assets/board.svg', import.meta.url), 'utf8');
  const audit = auditSvgThemeCoverage(svgText);

  assert.equal(audit.ungroupedSuspiciousIds.length, 0);
  assert.equal(audit.paintBlockedIds.length, 0);
  assert.equal(audit.inlinePaintIds.length > 0, true);
  assert.equal(audit.idsByGroup['jog-ring'].includes('jog_L_ring'), true);
  assert.equal(audit.idsByGroup.label.includes('text190'), true);
  assert.equal(audit.reportById.Layer_1.status, 'ignored');
  assert.equal(audit.reportById.namedview144.reason, 'structural-node');
  assert.equal(audit.reportById.rect190.reason, 'definition-template');
});

test('launcher section cards open on the first click and keep the menu open', async () => {
  const env = installThemeDom();
  try {
    const { initLauncher } = await importFresh('../src/launcher.js');
    initLauncher();

    const fab = env.document.getElementById('fab');
    const sheet = env.document.getElementById('fabSheet');

    click(fab);
    await flushAsyncWork();
    click(sheet.querySelector('[data-open-section="theme"]'));
    await flushAsyncWork();

    assert.equal(sheet.classList.contains('open'), true);
    assert.equal(sheet.querySelector('.launcher-modal').classList.contains('open'), true);
    assert.equal(sheet.querySelector('.launcher-section[data-section="theme"]').classList.contains('open'), true);
  } finally {
    env.restore();
  }
});

test('launcher internal actions keep the menu open until the user closes it', async () => {
  const env = installThemeDom();
  try {
    const { initLauncher } = await importFresh('../src/launcher.js');
    let fitCalls = 0;
    let diagCalls = 0;

    initLauncher({
      actions: {
        async fit() {
          fitCalls += 1;
        },
        showDiag() {
          diagCalls += 1;
        },
      },
      getStatusSnapshot() {
        return {};
      },
    });

    const fab = env.document.getElementById('fab');
    const sheet = env.document.getElementById('fabSheet');

    click(fab);
    await flushAsyncWork();
    click(sheet.querySelector('[data-open-section="theme"]'));
    await flushAsyncWork();
    click(sheet.querySelector('#fit'));
    await flushAsyncWork();

    assert.equal(fitCalls, 1);
    assert.equal(sheet.classList.contains('open'), true);

    click(sheet.querySelector('[data-back-dashboard]'));
    await flushAsyncWork();
    click(sheet.querySelector('[data-open-section="status"]'));
    await flushAsyncWork();
    click(sheet.querySelector('[data-act="openDiagnosticsReview"]'));
    await flushAsyncWork();

    assert.equal(diagCalls, 1);
    assert.equal(sheet.classList.contains('open'), true);
  } finally {
    env.restore();
  }
});

test('launcher close button escape and outside click remain the intentional close paths', async () => {
  const env = installThemeDom();
  try {
    const { initLauncher } = await importFresh('../src/launcher.js');
    initLauncher();

    const fab = env.document.getElementById('fab');
    const sheet = env.document.getElementById('fabSheet');

    click(fab);
    await flushAsyncWork();
    click(sheet.querySelector('[data-close-sheet]'));
    await flushAsyncWork();
    assert.equal(sheet.classList.contains('open'), false);

    click(fab);
    await flushAsyncWork();
    env.document.dispatchEvent({ type: 'keydown', key: 'Escape', target: env.document.body });
    await flushAsyncWork();
    assert.equal(sheet.classList.contains('open'), false);

    click(fab);
    await flushAsyncWork();
    env.document.body.dispatchEvent({ type: 'click', target: env.document.body });
    await flushAsyncWork();
    assert.equal(sheet.classList.contains('open'), false);
  } finally {
    env.restore();
  }
});
