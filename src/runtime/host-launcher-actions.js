// Host launcher action factory. This module wires injected host tools into launcher actions without owning launcher rendering, recorder internals, diagnostics internals, or controller runtime behavior.

export function getCurrentReplayPayload({ FLXRec } = {}) {
  return JSON.parse(FLXRec.exportJSON());
}

export function downloadReplayPayload({
  payload,
  filename = 'session-replay.json',
  documentRef = globalThis.document,
  URLRef = globalThis.URL,
} = {}) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URLRef.createObjectURL(blob);
  const a = documentRef.createElement('a');
  a.download = filename;
  a.href = url;
  documentRef.body.appendChild(a);
  a.click();
  a.remove();
  URLRef.revokeObjectURL(url);
}

export function loadSavedReplay({
  replayId,
  sessionReplayLibrary,
  FLXRec,
  RECUI,
} = {}) {
  const record = sessionReplayLibrary.loadReplay(replayId);
  if (!record) return null;
  FLXRec.loadFromObject(record.payload);
  RECUI.refresh();
  return record;
}

export function createHostLauncherActions({
  DIAG,
  RECUI,
  WIZ,
  EDIT,
  THEME,
  FLXRec,
  runtimeApp,
  sessionReplayLibrary,
  createReplayDownloadFilename,
  stageEl,
  documentRef = globalThis.document,
  URLRef = globalThis.URL,
  setTimeoutRef = globalThis.setTimeout,
  getLauncher = () => null,
} = {}) {
  return {
    // Panels
    toggleDiag:     () => DIAG.toggle(),
    showDiag:       () => DIAG.show(),
    hideDiag:       () => DIAG.hide(),
    isDiagOpen:     () => DIAG.isOpen?.() ?? false,
    toggleTimeline: () => RECUI.toggle(),
    showTimeline:   () => RECUI.show(),
    hideTimeline:   () => RECUI.hide?.(),
    toggleWizard:   () => WIZ.toggle(),
    showWizard:     () => (typeof WIZ.show === 'function' ? WIZ.show() : WIZ.toggle()),
    toggleEdit:     () => EDIT.toggle(),
    showEdit:       () => (typeof EDIT.show === 'function' ? EDIT.show() : EDIT.toggle()),
    hideEdit:       () => (typeof EDIT.hide === 'function' ? EDIT.hide() : EDIT.toggle()),
    isEditOpen:     () => EDIT.isOpen?.() ?? EDIT.onState?.() ?? false,
    clearDiag:      () => runtimeApp.clearRecentDebuggerSnapshots?.(),
    // Theme + view
    toggleTheme:    () => getLauncher()?.toggleSection('theme'),
    applyThemePreset: (name) => THEME.applyPreset?.(name),
    fit:            () => stageEl.classList.remove('fill'),
    fill:           () => stageEl.classList.add('fill'),
    toggleBG:       () => documentRef.body.classList.toggle('transparent'),
    // Recorder
    recStart:       () => { FLXRec.start(); setTimeoutRef(()=>RECUI.refresh(), 50); },
    recStop:        () => { FLXRec.stop();  RECUI.refresh(); },
    recPlay:        () => FLXRec.play({ speed: 1.0, loop: false }),
    recDownload:    () => FLXRec.download('take.json'),
    recSaveLocal:   ({ name } = {}) => sessionReplayLibrary.saveReplay({ name, payload: getCurrentReplayPayload({ FLXRec }) }),
    recLoadText:    async (text) => { await FLXRec.loadFromText(text); RECUI.refresh(); },
    listSavedReplays: () => sessionReplayLibrary.listReplays(),
    recLoadSaved:   (replayId) => loadSavedReplay({ replayId, sessionReplayLibrary, FLXRec, RECUI }),
    recPlaySaved:   (replayId) => {
      const record = loadSavedReplay({ replayId, sessionReplayLibrary, FLXRec, RECUI });
      if (record) FLXRec.play({ speed: 1.0, loop: false });
    },
    recDownloadSaved: (replayId) => {
      const record = sessionReplayLibrary.loadReplay(replayId);
      if (record) {
        downloadReplayPayload({
          payload: record.payload,
          filename: createReplayDownloadFilename(record),
          documentRef,
          URLRef,
        });
      }
    },
    recDeleteSaved: (replayId) => sessionReplayLibrary.deleteReplay(replayId),
  };
}
