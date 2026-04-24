import test from 'node:test';
import assert from 'node:assert/strict';

import { installMockBrowser } from './browser-test-helpers.js';

let importCounter = 0;

async function importFresh(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('test', String(++importCounter));
  return import(url.href);
}

test('host probe helper waits for connected and fires once', async () => {
  const env = installMockBrowser();

  try {
    const [{ getRuntimeApp }, { installHostProbeOnFirstConnect }] = await Promise.all([
      importFresh('../src/runtime/app-bridge.js'),
      importFresh('../src/runtime/host-probe.js'),
    ]);

    const runtimeApp = getRuntimeApp();
    const statuses = [];
    const probeCalls = [];

    runtimeApp.setWSStatusHandler((status) => {
      statuses.push(status);
    });
    runtimeApp.setWSClient({
      probe(id) {
        probeCalls.push(id);
        return true;
      },
    });

    installHostProbeOnFirstConnect({ runtimeApp, probeId: 'probe-123' });

    runtimeApp.setWSStatus('connecting');
    assert.deepEqual(statuses, ['connecting']);
    assert.deepEqual(probeCalls, []);

    runtimeApp.setWSStatus('connected');
    assert.deepEqual(statuses, ['connecting', 'connected']);
    assert.deepEqual(probeCalls, ['probe-123']);

    runtimeApp.setWSStatus('connected');
    assert.deepEqual(statuses, ['connecting', 'connected', 'connected']);
    assert.deepEqual(probeCalls, ['probe-123']);
  } finally {
    env.restore();
  }
});

