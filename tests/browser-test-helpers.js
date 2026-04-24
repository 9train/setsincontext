export function installMockBrowser({
  elementIds = [],
  fetchImpl,
  locationSearch = '',
  navigatorImpl,
  locationHref,
  WebSocketImpl,
} = {}) {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    fetch: globalThis.fetch,
    CustomEvent: globalThis.CustomEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    WebSocket: globalThis.WebSocket,
    navigatorDescriptor,
    locationDescriptor,
  };

  function createClassList() {
    const tokens = new Set();
    return {
      add(...values) {
        values.forEach((value) => tokens.add(String(value)));
      },
      remove(...values) {
        values.forEach((value) => tokens.delete(String(value)));
      },
      contains(value) {
        return tokens.has(String(value));
      },
      toggle(value, force) {
        const token = String(value);
        if (force === true) {
          tokens.add(token);
          return true;
        }
        if (force === false) {
          tokens.delete(token);
          return false;
        }
        if (tokens.has(token)) {
          tokens.delete(token);
          return false;
        }
        tokens.add(token);
        return true;
      },
      toString() {
        return Array.from(tokens).join(' ');
      },
    };
  }

  class FakeElement {
    constructor(id) {
      this.id = id;
      this.style = {
        removeProperty(name) {
          delete this[name];
        },
      };
      this.children = [];
      this.parentNode = null;
      this.classList = createClassList();
      this.dataset = {};
      this._attrs = new Map();
      this._listeners = new Map();
      this._innerHTML = '';
      this._textContent = '';
    }

    setAttribute(name, value) {
      this._attrs.set(name, String(value));
    }

    getAttribute(name) {
      return this._attrs.has(name) ? this._attrs.get(name) : null;
    }

    getBBox() {
      return { x: 0, y: 0, width: 100, height: 100 };
    }

    set textContent(value) {
      this._textContent = String(value ?? '');
    }

    get textContent() {
      return this._textContent;
    }

    set innerHTML(value) {
      this._innerHTML = String(value ?? '');
      this.children = [];
      this._textContent = '';
    }

    get innerHTML() {
      return this._innerHTML;
    }

    appendChild(child) {
      if (child && typeof child === 'object') {
        child.parentNode = this;
      }
      this.children.push(child);
      return child;
    }

    remove() {
      if (!this.parentNode || !Array.isArray(this.parentNode.children)) return;
      const index = this.parentNode.children.indexOf(this);
      if (index >= 0) this.parentNode.children.splice(index, 1);
      this.parentNode = null;
    }

    contains(node) {
      if (!node) return false;
      if (node === this) return true;
      return this.children.some((child) => child && typeof child.contains === 'function' && child.contains(node));
    }

    querySelector() {
      return null;
    }

    querySelectorAll() {
      return [];
    }

    addEventListener(type, fn) {
      const arr = this._listeners.get(type) || [];
      arr.push(fn);
      this._listeners.set(type, arr);
    }

    removeEventListener(type, fn) {
      const arr = this._listeners.get(type) || [];
      this._listeners.set(type, arr.filter((entry) => entry !== fn));
    }

    dispatchEvent(event) {
      const arr = this._listeners.get(event.type) || [];
      for (const fn of arr) fn(event);
      return true;
    }
  }

  const elements = Object.fromEntries(elementIds.map((id) => [id, new FakeElement(id)]));
  const listeners = new Map();
  const documentListeners = new Map();
  const dispatchedEvents = [];
  const href =
    locationHref ||
    `http://localhost/${locationSearch ? (locationSearch.startsWith('?') ? locationSearch : `?${locationSearch}`) : ''}`;
  const locationObj = new URL(href);
  const windowObj = {
    consumeInfo: (info) => info,
    addEventListener(type, fn) {
      const arr = listeners.get(type) || [];
      arr.push(fn);
      listeners.set(type, arr);
    },
    removeEventListener(type, fn) {
      const arr = listeners.get(type) || [];
      listeners.set(type, arr.filter((x) => x !== fn));
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event);
      const arr = listeners.get(event.type) || [];
      for (const fn of arr) fn(event);
      return true;
    },
    location: locationObj,
  };
  windowObj.window = windowObj;

  const documentObj = {
    getElementById(id) {
      return elements[id] || null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement(tag) {
      return new FakeElement(tag);
    },
    addEventListener(type, fn) {
      const arr = documentListeners.get(type) || [];
      arr.push(fn);
      documentListeners.set(type, arr);
    },
    removeEventListener(type, fn) {
      const arr = documentListeners.get(type) || [];
      documentListeners.set(type, arr.filter((entry) => entry !== fn));
    },
    dispatchEvent(event) {
      const arr = documentListeners.get(event.type) || [];
      for (const fn of arr) fn(event);
      return true;
    },
    head: new FakeElement('head'),
    body: new FakeElement('body'),
  };
  windowObj.document = documentObj;

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

  class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  let rafId = 1;
  let rafQueue = [];
  function requestAnimationFrame(cb) {
    const id = rafId++;
    rafQueue.push({ id, cb });
    return id;
  }
  function cancelAnimationFrame(id) {
    rafQueue = rafQueue.filter((item) => item.id !== id);
  }

  let timerId = 1;
  let now = 0;
  let timerQueue = [];

  function sortTimers() {
    timerQueue.sort((a, b) => (a.time - b.time) || (a.id - b.id));
  }

  function setTimeoutMock(cb, delay = 0) {
    const id = timerId++;
    timerQueue.push({ id, cb, time: now + Math.max(0, Number(delay) || 0), type: 'timeout', active: true });
    return id;
  }
  function clearTimeoutMock(id) {
    const timer = timerQueue.find((item) => item.id === id);
    if (timer) timer.active = false;
  }

  function setIntervalMock(cb, delay = 0) {
    const id = timerId++;
    timerQueue.push({
      id,
      cb,
      time: now + Math.max(0, Number(delay) || 0),
      type: 'interval',
      interval: Math.max(0, Number(delay) || 0),
      active: true,
    });
    return id;
  }

  function clearIntervalMock(id) {
    const timer = timerQueue.find((item) => item.id === id);
    if (timer) timer.active = false;
  }

  globalThis.window = windowObj;
  globalThis.document = documentObj;
  globalThis.localStorage = localStorage;
  globalThis.fetch = fetchImpl || (async () => ({ ok: false, json: async () => null }));
  globalThis.CustomEvent = CustomEvent;
  globalThis.requestAnimationFrame = requestAnimationFrame;
  globalThis.cancelAnimationFrame = cancelAnimationFrame;
  globalThis.setTimeout = setTimeoutMock;
  globalThis.clearTimeout = clearTimeoutMock;
  globalThis.setInterval = setIntervalMock;
  globalThis.clearInterval = clearIntervalMock;
  globalThis.WebSocket = WebSocketImpl;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: navigatorImpl,
  });
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    writable: true,
    value: locationObj,
  });

  async function runNextAnimationFrame() {
    const next = rafQueue.shift();
    if (next) await next.cb();
  }

  async function runAnimationFrames(count = 1) {
    for (let i = 0; i < count; i++) {
      await runNextAnimationFrame();
    }
  }

  async function runNextTimeout() {
    sortTimers();
    const nextIndex = timerQueue.findIndex((item) => item.type === 'timeout' && item.active);
    if (nextIndex === -1) return;
    const [next] = timerQueue.splice(nextIndex, 1);
    now = Math.max(now, next.time);
    await next.cb();
  }

  async function runAllTimeouts(limit = 10) {
    let remaining = limit;
    while (remaining-- > 0) {
      sortTimers();
      const nextTimeout = timerQueue.find((item) => item.type === 'timeout' && item.active);
      if (!nextTimeout) break;
      await runNextTimeout();
    }
  }

  async function advanceTimersBy(ms, limit = 100) {
    const target = now + Math.max(0, Number(ms) || 0);
    let remaining = limit;
    while (remaining-- > 0) {
      sortTimers();
      const next = timerQueue[0];
      if (!next) break;
      if (!next.active) {
        timerQueue.shift();
        continue;
      }
      if (next.time > target) break;

      timerQueue.shift();
      now = next.time;
      await next.cb();

      if (next.type === 'interval' && next.active) {
        next.time = now + next.interval;
        timerQueue.push(next);
      }
    }
    now = target;
  }

  function restore() {
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.localStorage = previous.localStorage;
    globalThis.fetch = previous.fetch;
    globalThis.CustomEvent = previous.CustomEvent;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.setTimeout = previous.setTimeout;
    globalThis.clearTimeout = previous.clearTimeout;
    globalThis.setInterval = previous.setInterval;
    globalThis.clearInterval = previous.clearInterval;
    globalThis.WebSocket = previous.WebSocket;
    if (previous.navigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', previous.navigatorDescriptor);
    } else {
      delete globalThis.navigator;
    }
    if (previous.locationDescriptor) {
      Object.defineProperty(globalThis, 'location', previous.locationDescriptor);
    } else {
      delete globalThis.location;
    }
  }

  return {
    window: windowObj,
    document: documentObj,
    elements,
    dispatchedEvents,
    localStorage,
    storage,
    runAnimationFrames,
    runAllTimeouts,
    advanceTimersBy,
    restore,
  };
}
