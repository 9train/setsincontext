import test from 'node:test';
import assert from 'node:assert/strict';

import { installMockBrowser } from './browser-test-helpers.js';

let importCounter = 0;

async function importFresh(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('test', String(++importCounter));
  return import(url.href);
}

function createDebuggerInfo(index) {
  return {
    type: 'noteon',
    ch: 1,
    d1: index,
    d2: 127,
    value: 127,
    timestamp: 100 + index,
    mappingId: `deck.left.pad.${index}.main.press`,
    canonicalTarget: `deck.left.pad.${index}`,
    matchedBinding: {
      id: `deck.left.pad.${index}.main.press`,
      canonicalTarget: `deck.left.pad.${index}`,
      rawTarget: `pad_L_${index}`,
    },
    semantic: {
      family: 'pad',
      action: 'trigger',
      meaning: `deck.left.pad.${index}.trigger`,
      truthStatus: 'official',
      canonicalTarget: `deck.left.pad.${index}`,
    },
  };
}

test('runtime bridge preserves legacy window shims while routing through explicit handlers', async () => {
  const env = installMockBrowser();
  const consumed = [];
  const wsStatuses = [];
  const controllerRuntimeSeen = [];
  const afterTapSeen = [];
  const legacyLearnSeen = [];
  const bridgeLearnSeen = [];
  const legacyMonitorSeen = [];
  const bridgeMonitorSeen = [];

  env.window.consumeInfo = (info) => {
    consumed.push(info);
    return 'consumed';
  };
  env.window.setWSStatus = (status) => {
    wsStatuses.push(status);
  };
  env.window.FLX_LEARN_HOOK = (info) => {
    legacyLearnSeen.push(info);
  };
  env.window.FLX_MONITOR_HOOK = (info) => {
    legacyMonitorSeen.push(info);
  };

  try {
    const { getRuntimeApp } = await importFresh('../src/runtime/app-bridge.js');
    const runtimeApp = getRuntimeApp();
    const pendingLearn = runtimeApp.waitForNextLearnInput({ timeoutMs: 50 });

    runtimeApp.addConsumeTap('test-after', (info, result) => {
      afterTapSeen.push({ info, result });
    }, { phase: 'after' });
    runtimeApp.addLearnListener('test-learn', (info) => {
      bridgeLearnSeen.push(info);
    });
    runtimeApp.addMonitorListener('test-monitor', (info) => {
      bridgeMonitorSeen.push(info);
    });
    runtimeApp.addControllerRuntimeListener('test-controller-runtime', (details) => {
      controllerRuntimeSeen.push(details);
    });

    const result = env.window.consumeInfo({ type: 'cc', value: 64 });
    env.window.setWSStatus('connected');
    runtimeApp.setControllerRuntime({
      ready: true,
      deviceName: 'Pioneer DDJ-FLX6',
      profileId: 'pioneer-ddj-flx6',
      profileLabel: 'Pioneer DDJ-FLX6',
      transport: 'midi',
      lastEventAt: 123,
    });
    runtimeApp.emitLearnInput({ type: 'noteon', d1: 11, d2: 127 });
    runtimeApp.emitMonitorInput({ type: 'cc', controller: 23, value: 64 });

    assert.equal(result, 'consumed');
    assert.deepEqual(consumed, [{ type: 'cc', value: 64 }]);
    assert.deepEqual(afterTapSeen, [{
      info: { type: 'cc', value: 64 },
      result: 'consumed',
    }]);
    assert.deepEqual(wsStatuses, ['connected']);
    assert.equal(runtimeApp.getWSStatus(), 'connected');
    assert.deepEqual(controllerRuntimeSeen, [{
      midiStatus: null,
      ready: true,
      deviceName: 'Pioneer DDJ-FLX6',
      profileId: 'pioneer-ddj-flx6',
      profileLabel: 'Pioneer DDJ-FLX6',
      transport: 'midi',
      lastEventAt: 123,
    }]);
    assert.deepEqual(runtimeApp.getControllerRuntime(), {
      midiStatus: null,
      ready: true,
      deviceName: 'Pioneer DDJ-FLX6',
      profileId: 'pioneer-ddj-flx6',
      profileLabel: 'Pioneer DDJ-FLX6',
      transport: 'midi',
      lastEventAt: 123,
    });
    assert.deepEqual(await pendingLearn, { type: 'noteon', d1: 11, d2: 127 });
    assert.deepEqual(legacyLearnSeen, [{ type: 'noteon', d1: 11, d2: 127 }]);
    assert.deepEqual(bridgeLearnSeen, [{ type: 'noteon', d1: 11, d2: 127 }]);
    assert.deepEqual(legacyMonitorSeen, [{ type: 'cc', controller: 23, value: 64 }]);
    assert.deepEqual(bridgeMonitorSeen, [{ type: 'cc', controller: 23, value: 64 }]);
    assert.equal(env.window.FLXRuntime, runtimeApp);
  } finally {
    env.restore();
  }
});

test('runtime bridge keeps bounded recent debugger history even before diagnostics subscribe', async () => {
  const env = installMockBrowser();
  const historySeen = [];

  try {
    const { getRuntimeApp } = await importFresh('../src/runtime/app-bridge.js');
    const runtimeApp = getRuntimeApp();

    runtimeApp.setInfoConsumer((info) => {
      info._boardRender = {
        targetId: `pad_L_${info.d1}`,
        authority: 'official-render',
        ownership: 'official',
        source: 'official-binding',
        truthStatus: 'official',
        compatibility: false,
        blocked: false,
        applied: true,
        outcome: 'updated',
        detail: 'test-applied',
      };
      return info;
    });
    runtimeApp.setWSStatus('connected');
    runtimeApp.setControllerRuntime({
      ready: true,
      deviceName: 'Pioneer DDJ-FLX6',
      profileId: 'pioneer-ddj-flx6',
      profileLabel: 'Pioneer DDJ-FLX6',
      transport: 'midi',
      lastEventAt: 123,
    });
    runtimeApp.setRelayRuntime({
      role: 'viewer',
      room: 'debug-room',
      url: 'ws://localhost:8787',
    });
    runtimeApp.setRecorderStatus({
      available: true,
      installed: true,
      state: 'ready',
      eventCount: 0,
      logSchema: 'flx-recorder-log/v3',
    });
    runtimeApp.addRecentDebuggerHistoryListener('test-recent-debugger-history', (snapshot, history) => {
      historySeen.push({ snapshot, history });
    });

    for (let index = 1; index <= 30; index++) {
      runtimeApp.consumeInfo(createDebuggerInfo(index));
    }

    const snapshots = runtimeApp.getRecentDebuggerSnapshots();
    assert.equal(snapshots.length, 24);
    assert.equal(snapshots[0].raw.key, 'noteon:1:30');
    assert.equal(snapshots[0].device.name, 'Pioneer DDJ-FLX6');
    assert.equal(snapshots[0].device.profileLabel, 'Pioneer DDJ-FLX6');
    assert.equal(snapshots[0].render.targetId, 'pad_L_30');
    assert.equal(snapshots[0].debugTransaction.relay.role, 'viewer');
    assert.equal(snapshots[0].debugTransaction.relay.status, 'connected');
    assert.equal(snapshots[0].debugTransaction.recorder.state, 'ready');
    assert.equal(snapshots[snapshots.length - 1].raw.key, 'noteon:1:7');
    assert.equal(historySeen.length, 30);
    assert.equal(historySeen[0].history.length, 1);
    assert.equal(historySeen[historySeen.length - 1].history.length, 24);
    assert.equal(historySeen[historySeen.length - 1].snapshot.raw.key, 'noteon:1:30');

    runtimeApp.clearRecentDebuggerSnapshots();

    assert.deepEqual(runtimeApp.getRecentDebuggerSnapshots(), []);
    assert.equal(historySeen[historySeen.length - 1].snapshot, null);
    assert.deepEqual(historySeen[historySeen.length - 1].history, []);
  } finally {
    env.restore();
  }
});
