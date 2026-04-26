import { initBoard, consumeInfo as boardConsume, getUnifiedMap } from '../board.js';
import { initSharedPageBoot } from '../bootstrap-shared.js';
import { installJogRuntime } from '../jog-runtime.js';
import * as THEME from '../theme.js';
import { getRuntimeApp } from './app-bridge.js';

export async function initViewerPage(options = {}) {
  const doc = options.document || document;

  initSharedPageBoot({ role: 'viewer' });
  const runtimeApp = getRuntimeApp();

  await initBoard({ hostId: 'boardHost' });

  const stage = doc.getElementById('boardHost');
  const wsStatusEl = doc.getElementById('wsStatus');
  const midiStatusEl = doc.getElementById('midiStatus');
  const lastActionEl = doc.getElementById('lastAction');
  const fitBtn = doc.getElementById('fit');
  const fillBtn = doc.getElementById('fill');
  const bgBtn = doc.getElementById('toggleBG');
  const themePresetBtn = doc.getElementById('themePreset');
  const themeToggleBtn = doc.getElementById('themeToggle');

  try {
    THEME.attachThemeDesigner?.({
      mount: doc.createElement('div'),
      svgRoot: doc.querySelector('#boardHost svg'),
    });
    THEME.ensurePreset?.('instrument-dark');
  } catch {}

  let viewerPreset = 'instrument-dark';
  try {
    const currentTheme = THEME.getVars?.() || {};
    if (String(currentTheme.bg || '').toLowerCase() === '#0b1020') {
      viewerPreset = 'classic';
    }
  } catch {}

  function formatStatus(prefix, status) {
    const text = String(status || 'waiting').replace(/_/g, ' ');
    return `${prefix}: ${text}`;
  }

  function describeLastAction(info) {
    if (!info || typeof info !== 'object') return '';
    const parts = [
      info.semanticLabel,
      info.meaningLabel,
      info.mappingId,
      info.canonicalTarget,
      info.__flxDebugTarget,
      info.type && info.controller != null ? `${String(info.type).toUpperCase()} ${info.controller}` : null,
      info.type && info.d1 != null ? `${String(info.type).toUpperCase()} ${info.d1}` : null,
    ].filter(Boolean);
    return parts[0] || '';
  }

  function updateLastAction(info) {
    const next = describeLastAction(info);
    if (!next) return;
    lastActionEl.textContent = `Last action: ${next}`;
    lastActionEl.hidden = false;
    lastActionEl.classList.remove('hidden');
  }

  runtimeApp.setInfoConsumer((info) => {
    updateLastAction(info);
    return boardConsume(info);
  });

  runtimeApp.setWSStatusHandler((status) => {
    wsStatusEl.textContent = formatStatus('Host link', status);
  });
  runtimeApp.setMIDIStatusHandler((status) => {
    midiStatusEl.textContent = formatStatus('Viewer lane', status);
  });
  runtimeApp.setMIDIStatus('viewer');

  wsStatusEl.textContent = formatStatus('Host link', runtimeApp.getWSStatus());
  midiStatusEl.textContent = formatStatus('Viewer lane', runtimeApp.getMIDIStatus() || 'viewer');

  if (fitBtn) fitBtn.onclick = () => stage.classList.remove('fill');
  if (fillBtn) fillBtn.onclick = () => stage.classList.add('fill');
  if (bgBtn) bgBtn.onclick = () => doc.body.classList.toggle('transparent');
  if (themePresetBtn) {
    themePresetBtn.onclick = () => {
      viewerPreset = viewerPreset === 'instrument-dark' ? 'classic' : 'instrument-dark';
      THEME.applyPreset?.(viewerPreset);
    };
  }
  if (themeToggleBtn) {
    themeToggleBtn.onclick = () => THEME.toggle?.();
  }

  installJogRuntime({
    getUnifiedMap: () => getUnifiedMap?.() || [],
    exposeGlobalControls: true,
  });
}
