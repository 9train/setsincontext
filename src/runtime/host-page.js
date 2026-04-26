// Host page composition module. This wires existing host runtime modules together without owning controller truth, board rendering, WebMIDI internals, WebSocket boot, or tool internals.

import { initBoard, consumeInfo as boardConsume, getUnifiedMap } from '../board.js';
import { initSharedPageBoot } from '../bootstrap-shared.js';
import { installJogRuntime } from '../jog-runtime.js';
import { attachJogCalibrationModal } from '../jog-calibration-ui.js';
import { installHostDebug } from '../host-debug.js';
import { installPrivateInvitePanel } from '../private-invite-ui.js';
import { bootMIDIFromQuery } from '../midi.js';
import { initLauncher } from '../launcher.js';
import { loadMappings } from '../mapper.js';
import * as THEME from '../theme.js';
import * as PRESETS from '../presets.js';
import { recorder as FLXRec } from '../recorder.js';
import * as RECUI from '../recorder_ui.js';
import {
  createReplayDownloadFilename,
  sessionReplayLibrary,
} from '../session-replay-library.js';
import * as DIAG from '../diag.js';
import * as EDIT from '../editmode.js';
import * as WIZ from '../wizard.js';
import { getRuntimeApp } from './app-bridge.js';
import { installHostProbeOnFirstConnect } from './host-probe.js';
import { initHostSessionPage } from './host-session-page.js';
import { initHostStatusChrome } from './host-status-page.js';
import { initHostControllerPipeline } from './host-controller-pipeline.js';
import { initHostDraftMapSync } from './host-draft-map-sync.js';
import { startHostMidiCapture } from './host-midi-capture.js';
import { createHostLauncherActions } from './host-launcher-actions.js';
import { initHostThemePage } from './host-theme-page.js';
import { initHostToolsPage } from './host-tools-page.js';

const DEFAULT_DEPENDENCIES = {
  initBoard,
  boardConsume,
  getUnifiedMap,
  initSharedPageBoot,
  installJogRuntime,
  attachJogCalibrationModal,
  installHostDebug,
  installPrivateInvitePanel,
  bootMIDIFromQuery,
  initLauncher,
  loadMappings,
  THEME,
  PRESETS,
  FLXRec,
  RECUI,
  createReplayDownloadFilename,
  sessionReplayLibrary,
  DIAG,
  EDIT,
  WIZ,
  getRuntimeApp,
  installHostProbeOnFirstConnect,
  initHostSessionPage,
  initHostStatusChrome,
  initHostControllerPipeline,
  initHostDraftMapSync,
  startHostMidiCapture,
  createHostLauncherActions,
  initHostThemePage,
  initHostToolsPage,
};

function getDefaultDocument() {
  return typeof document !== 'undefined' ? document : null;
}

function getDefaultWindow() {
  return typeof window !== 'undefined' ? window : null;
}

function getSetTimeoutRef(options, win) {
  if (typeof options.setTimeoutRef === 'function') return options.setTimeoutRef;
  if (win && typeof win.setTimeout === 'function') return win.setTimeout.bind(win);
  if (typeof setTimeout === 'function') return setTimeout;
  return null;
}

function getURLRef(options) {
  if (options.URLRef) return options.URLRef;
  if (typeof URL !== 'undefined') return URL;
  return null;
}

export async function initHostPage(options = {}) {
  const doc = options.documentRef || getDefaultDocument();
  const win = options.windowRef || getDefaultWindow();
  const deps = {
    ...DEFAULT_DEPENDENCIES,
    ...(options.dependencies || {}),
  };
  const setTimeoutRef = getSetTimeoutRef(options, win);
  const URLRef = getURLRef(options);

  deps.initSharedPageBoot({ role: 'host', wsStatusId: '__hostBootStatus' });
  const runtimeApp = deps.getRuntimeApp();
  const hostSessionPage = deps.initHostSessionPage({
    runtimeApp,
    installHostProbeOnFirstConnect: deps.installHostProbeOnFirstConnect,
    installPrivateInvitePanel: deps.installPrivateInvitePanel,
  });

  await deps.initBoard({ hostId: 'boardHost' });

  const hostStatus = deps.initHostStatusChrome({ runtimeApp, document: doc });
  let launcher = null;

  const hostControllerPipeline = deps.initHostControllerPipeline({
    runtimeApp,
    boardConsume: deps.boardConsume,
    hostStatus,
  });

  const draftMapSync = deps.initHostDraftMapSync({
    runtimeApp,
    loadMappings: deps.loadMappings,
    windowRef: win,
    setTimeoutRef,
  });

  const midiHandle = await deps.startHostMidiCapture({
    runtimeApp,
    hostStatus,
    bootMIDIFromQuery: deps.bootMIDIFromQuery,
  });

  const stageEl = doc?.getElementById?.('boardHost') || null;
  const launcherActions = deps.createHostLauncherActions({
    DIAG: deps.DIAG,
    RECUI: deps.RECUI,
    WIZ: deps.WIZ,
    EDIT: deps.EDIT,
    THEME: deps.THEME,
    FLXRec: deps.FLXRec,
    runtimeApp,
    sessionReplayLibrary: deps.sessionReplayLibrary,
    createReplayDownloadFilename: deps.createReplayDownloadFilename,
    stageEl,
    documentRef: doc,
    URLRef,
    setTimeoutRef,
    getLauncher: () => launcher,
  });

  launcher = deps.initLauncher({
    actions: launcherActions,
    getStatusSnapshot: () => {
      const latestSnapshot = runtimeApp?.getRecentDebuggerSnapshots?.()?.[0] || null;
      return {
        ...hostStatus.getStatusSnapshot(),
        lastAction: latestSnapshot?.recentSummary || null,
      };
    },
    mountPresetUI: (el) => deps.PRESETS.attachPresetUI(el),
  });

  hostStatus.setLauncher(launcher);

  const hostThemePage = deps.initHostThemePage({
    THEME: deps.THEME,
    documentRef: doc,
    windowRef: win,
    getLauncher: () => launcher,
  });

  const hostTools = deps.initHostToolsPage({
    runtimeApp,
    documentRef: doc,
    windowRef: win,
    boardHost: stageEl,
    getUnifiedMap: deps.getUnifiedMap,
    installJogRuntime: deps.installJogRuntime,
    attachJogCalibrationModal: deps.attachJogCalibrationModal,
    installHostDebug: deps.installHostDebug,
    hostStatus,
  });

  return {
    runtimeApp,
    hostSessionPage,
    hostStatus,
    hostControllerPipeline,
    draftMapSync,
    midiHandle,
    launcherActions,
    launcher,
    hostThemePage,
    hostTools,
  };
}
