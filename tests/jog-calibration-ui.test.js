import test from 'node:test';
import assert from 'node:assert/strict';

import { attachJogCalibrationModal } from '../src/jog-calibration-ui.js';
import { installMockBrowser } from './browser-test-helpers.js';

function findElementByText(root, text) {
  if (!root) return null;
  if (root.textContent === text) return root;
  const children = Array.isArray(root.children) ? root.children : [];
  for (const child of children) {
    const found = findElementByText(child, text);
    if (found) return found;
  }
  return null;
}

function collectText(root) {
  if (!root) return '';
  const children = Array.isArray(root.children) ? root.children : [];
  return [root.textContent, ...children.map((child) => collectText(child))]
    .filter(Boolean)
    .join('\n');
}

test('jog calibration modal opens from the UI trigger and drives the runtime save/reset flow', () => {
  const env = installMockBrowser();
  const calls = [];
  const summary = {
    mode: 'vinyl',
    surface: 'top_touch',
    lanes: [
      {
        side: 'L',
        lane: 'scratch',
        mode: 'vinyl',
        surface: 'top_touch',
        eventCount: 1,
        totalDelta: 120,
        totalAbsDelta: 120,
      },
    ],
  };
  const preview = {
    controllerId: 'ddj-flx6',
    mode: 'vinyl',
    surface: 'top_touch',
    entries: [
      {
        side: 'left',
        mode: 'vinyl',
        surface: 'top_touch',
        ticksPerTurn: 120,
        visualDegreesPerTick: 3,
        eventCount: 1,
        totalDelta: 120,
        totalAbsDelta: 120,
        laneCount: 1,
        note: null,
        updatedAt: 2000,
      },
    ],
  };

  const jogRuntime = {
    startCalibration(side, options) {
      calls.push(['start', side, options]);
      return { active: true };
    },
    stopCalibration() {
      calls.push(['stop']);
      return summary;
    },
    previewCalibration(summary, options) {
      calls.push(['preview', summary, options]);
      return preview;
    },
    saveCalibration(summary, options) {
      calls.push(['save', summary, options]);
      return { preview };
    },
    resetCalibrationPreference(options) {
      calls.push(['reset', options]);
      return { controllerId: 'ddj-flx6', jog: { left: {}, right: {} } };
    },
    cancelCalibration() {
      calls.push(['cancel']);
    },
    getCalibrationPreferences() {
      return {
        jog: {
          left: {
            vinyl: {
              ticksPerTurn: 110,
              visualDegreesPerTick: 3.2727,
            },
          },
          right: {},
        },
      };
    },
  };

  try {
    const trigger = env.document.createElement('button');
    env.document.body.appendChild(trigger);

    const modal = attachJogCalibrationModal({ jogRuntime, trigger });
    assert.ok(modal);
    assert.equal(modal.overlay.hidden, true);
    assert.equal(modal.overlay.getAttribute('aria-hidden'), 'true');
    assert.equal(modal.overlay.classList.contains('is-open'), false);

    trigger.dispatchEvent(new CustomEvent('click'));
    assert.equal(modal.overlay.hidden, false);
    assert.equal(modal.overlay.getAttribute('aria-hidden'), 'false');
    assert.equal(modal.overlay.classList.contains('is-open'), true);

    findElementByText(modal.overlay, 'Vinyl').dispatchEvent(new CustomEvent('click'));
    findElementByText(modal.overlay, 'Top Touched Platter').dispatchEvent(new CustomEvent('click'));
    findElementByText(modal.overlay, 'Start').dispatchEvent(new CustomEvent('click'));
    findElementByText(modal.overlay, 'Done').dispatchEvent(new CustomEvent('click'));
    findElementByText(modal.overlay, 'Save Calibration').dispatchEvent(new CustomEvent('click'));
    findElementByText(modal.overlay, 'Reset to Default').dispatchEvent(new CustomEvent('click'));

    assert.deepEqual(calls[0], ['start', 'L', { mode: 'vinyl', surface: 'top_touch' }]);
    assert.equal(calls[1][0], 'stop');
    assert.deepEqual(calls[2], ['preview', summary, { mode: 'vinyl', surface: 'top_touch', controllerId: 'ddj-flx6' }]);
    assert.deepEqual(calls[3], ['save', summary, { mode: 'vinyl', surface: 'top_touch', controllerId: 'ddj-flx6' }]);
    assert.deepEqual(calls[4], ['reset', { side: 'L', mode: 'vinyl', surface: 'top_touch' }]);
  } finally {
    env.restore();
  }
});

test('jog calibration modal closes cleanly after opening', () => {
  const env = installMockBrowser();

  try {
    const trigger = env.document.createElement('button');
    env.document.body.appendChild(trigger);

    const modal = attachJogCalibrationModal({
      jogRuntime: {
        cancelCalibration() {},
      },
      trigger,
    });

    assert.equal(modal.overlay.hidden, true);
    trigger.dispatchEvent(new CustomEvent('click'));
    assert.equal(modal.overlay.hidden, false);

    findElementByText(modal.overlay, 'Close').dispatchEvent(new CustomEvent('click'));
    assert.equal(modal.overlay.hidden, true);
    assert.equal(modal.overlay.getAttribute('aria-hidden'), 'true');
    assert.equal(modal.overlay.classList.contains('is-open'), false);
  } finally {
    env.restore();
  }
});

test('jog calibration modal shows a clear selected mode mismatch warning instead of success text', () => {
  const env = installMockBrowser();
  const summary = {
    mode: 'normal',
    surface: 'side',
    warning: 'Calibration is tracking normal, so jog lane scratch was ignored.',
    lanes: [],
  };
  const preview = {
    controllerId: 'ddj-flx6',
    mode: 'normal',
    surface: 'side',
    entries: [],
  };

  try {
    const trigger = env.document.createElement('button');
    env.document.body.appendChild(trigger);

    const modal = attachJogCalibrationModal({
      jogRuntime: {
        startCalibration() {
          return { active: true };
        },
        stopCalibration() {
          return summary;
        },
        previewCalibration() {
          return preview;
        },
        cancelCalibration() {},
        getCalibrationPreferences() {
          return { jog: { left: {}, right: {} } };
        },
      },
      trigger,
    });

    trigger.dispatchEvent(new CustomEvent('click'));
    findElementByText(modal.overlay, 'Start').dispatchEvent(new CustomEvent('click'));
    findElementByText(modal.overlay, 'Done').dispatchEvent(new CustomEvent('click'));

    const text = collectText(modal.overlay);
    assert.match(text, /tracking normal/i);
    assert.doesNotMatch(text, /Calibration result ready for Left \/ Normal \/ Side Platter/i);
  } finally {
    env.restore();
  }
});
