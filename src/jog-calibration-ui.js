const SIDE_LABELS = Object.freeze({
  left: 'Left',
  right: 'Right',
});

const MODE_LABELS = Object.freeze({
  normal: 'Normal',
  vinyl: 'Vinyl',
  jog_cutter: 'Jog Cutter',
});

const SURFACE_LABELS = Object.freeze({
  side: 'Side Platter',
  top_touch: 'Top Touched Platter',
});

function createElement(tag, {
  className = '',
  text = null,
  type = null,
  attrs = null,
} = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  if (type) el.type = type;
  if (attrs && typeof attrs === 'object') {
    Object.entries(attrs).forEach(([key, value]) => {
      if (value == null) return;
      el.setAttribute(key, String(value));
    });
  }
  return el;
}

function sideToRuntimeSelection(side) {
  if (side === 'left') return 'L';
  if (side === 'right') return 'R';
  return null;
}

function getSelectedSideKeys(side) {
  if (side === 'left') return ['left'];
  if (side === 'right') return ['right'];
  return [];
}

function getInstructionText(side, surface) {
  if (surface === 'top_touch') {
    return `Keep one finger on the ${SIDE_LABELS[side].toLowerCase()} jog top touch surface, rotate exactly one full clockwise turn, then stop.`;
  }
  return `Rotate the ${SIDE_LABELS[side].toLowerCase()} jog from the side platter exactly one full clockwise turn, then stop.`;
}

function getListeningText(side, mode, surface) {
  return `Listening for ${SIDE_LABELS[side]} / ${MODE_LABELS[mode]} / ${SURFACE_LABELS[surface]} jog motion. ${getInstructionText(side, surface)}`;
}

function formatCalibrationEntry(entry) {
  const sideLabel = SIDE_LABELS[entry.side] || entry.side;
  const modeLabel = MODE_LABELS[entry.mode] || entry.mode;
  const surfaceLabel = SURFACE_LABELS[entry.surface] || entry.surface;
  const ticks = entry.ticksPerTurn;
  const degrees = entry.visualDegreesPerTick;
  return `${sideLabel} / ${modeLabel} / ${surfaceLabel}: 1 full turn measured as ${ticks} ticks (${degrees} visual degrees per tick).`;
}

function formatCurrentPreference(sideKey, mode, surface, entry) {
  return `${SIDE_LABELS[sideKey] || sideKey} ${MODE_LABELS[mode] || mode} ${SURFACE_LABELS[surface] || surface}: ${entry.ticksPerTurn} ticks per turn (${entry.visualDegreesPerTick} degrees per tick).`;
}

function resolveSavedCalibrationEntry(jogRuntime, side, mode, surface) {
  const selection = {
    side: sideToRuntimeSelection(side),
    mode,
    surface,
  };

  const directEntry = jogRuntime.getCalibrationPreference?.(selection);
  if (directEntry) return directEntry;

  const preferences = jogRuntime.getCalibrationPreferences?.();
  const modePreferences = preferences
    && preferences.jog
    && preferences.jog[side]
    && preferences.jog[side][mode];

  if (!modePreferences || typeof modePreferences !== 'object') return null;
  if (typeof modePreferences.ticksPerTurn === 'number') return modePreferences;
  return modePreferences[surface] || modePreferences.default || null;
}

export function attachJogCalibrationModal({
  jogRuntime,
  trigger = null,
  mount = document.body,
  controllerId = 'ddj-flx6',
} = {}) {
  if (!jogRuntime || !mount || typeof mount.appendChild !== 'function') return null;

  const state = {
    open: false,
    phase: 'setup',
    side: 'left',
    mode: 'normal',
    surface: 'side',
    summary: null,
    preview: null,
    notice: '',
  };

  const overlay = createElement('div', {
    className: 'jog-calibration-modal',
    attrs: { 'aria-hidden': 'true' },
  });
  overlay.hidden = true;
  const panel = createElement('section', {
    className: 'jog-calibration-panel',
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Jog Calibration' },
  });
  overlay.appendChild(panel);

  const header = createElement('div', { className: 'jog-calibration-header' });
  const titleWrap = createElement('div', { className: 'jog-calibration-title-wrap' });
  titleWrap.appendChild(createElement('strong', { text: 'Jog Calibration', className: 'jog-calibration-title' }));
  titleWrap.appendChild(createElement('div', {
    text: 'Measure one physical full rotation without touching official mappings or canonical controller truth.',
    className: 'jog-calibration-subtitle',
  }));
  const closeButton = createElement('button', {
    type: 'button',
    text: 'Close',
    className: 'jog-calibration-close',
  });
  header.appendChild(titleWrap);
  header.appendChild(closeButton);
  panel.appendChild(header);

  const body = createElement('div', { className: 'jog-calibration-body' });
  panel.appendChild(body);

  const sideGroup = createElement('div', { className: 'jog-calibration-group' });
  sideGroup.appendChild(createElement('div', {
    text: '1. Choose jog side',
    className: 'jog-calibration-label',
  }));
  const sideOptions = createElement('div', { className: 'jog-calibration-options' });
  const sideButtons = {};
  ['left', 'right'].forEach((side) => {
    const button = createElement('button', {
      type: 'button',
      text: SIDE_LABELS[side],
      className: 'jog-calibration-option',
    });
    button.addEventListener('click', () => {
      if (state.phase === 'listening') return;
      state.side = side;
      state.notice = '';
      render();
    });
    sideButtons[side] = button;
    sideOptions.appendChild(button);
  });
  sideGroup.appendChild(sideOptions);
  body.appendChild(sideGroup);

  const modeGroup = createElement('div', { className: 'jog-calibration-group' });
  modeGroup.appendChild(createElement('div', {
    text: '2. Choose calibration mode',
    className: 'jog-calibration-label',
  }));
  const modeOptions = createElement('div', { className: 'jog-calibration-options' });
  const modeButtons = {};
  ['normal', 'vinyl', 'jog_cutter'].forEach((mode) => {
    const button = createElement('button', {
      type: 'button',
      text: MODE_LABELS[mode],
      className: 'jog-calibration-option',
    });
    button.addEventListener('click', () => {
      if (state.phase === 'listening') return;
      state.mode = mode;
      state.notice = '';
      render();
    });
    modeButtons[mode] = button;
    modeOptions.appendChild(button);
  });
  modeGroup.appendChild(modeOptions);
  body.appendChild(modeGroup);

  const surfaceGroup = createElement('div', { className: 'jog-calibration-group' });
  surfaceGroup.appendChild(createElement('div', {
    text: '3. Choose jog surface',
    className: 'jog-calibration-label',
  }));
  const surfaceOptions = createElement('div', { className: 'jog-calibration-options' });
  const surfaceButtons = {};
  ['side', 'top_touch'].forEach((surface) => {
    const button = createElement('button', {
      type: 'button',
      text: SURFACE_LABELS[surface],
      className: 'jog-calibration-option',
    });
    button.addEventListener('click', () => {
      if (state.phase === 'listening') return;
      state.surface = surface;
      state.notice = '';
      render();
    });
    surfaceButtons[surface] = button;
    surfaceOptions.appendChild(button);
  });
  surfaceGroup.appendChild(surfaceOptions);
  body.appendChild(surfaceGroup);

  const instructions = createElement('div', { className: 'jog-calibration-instructions' });
  body.appendChild(instructions);

  const savedState = createElement('div', { className: 'jog-calibration-current' });
  body.appendChild(savedState);

  const status = createElement('div', { className: 'jog-calibration-status' });
  body.appendChild(status);

  const results = createElement('div', { className: 'jog-calibration-results' });
  body.appendChild(results);

  const actions = createElement('div', { className: 'jog-calibration-actions' });
  const startButton = createElement('button', {
    type: 'button',
    text: 'Start',
    className: 'jog-calibration-primary',
  });
  const doneButton = createElement('button', {
    type: 'button',
    text: 'Done',
    className: 'jog-calibration-primary',
  });
  const saveButton = createElement('button', {
    type: 'button',
    text: 'Save Calibration',
    className: 'jog-calibration-primary',
  });
  const retryButton = createElement('button', {
    type: 'button',
    text: 'Try Again',
    className: 'jog-calibration-secondary',
  });
  const resetButton = createElement('button', {
    type: 'button',
    text: 'Reset to Default',
    className: 'jog-calibration-secondary',
  });
  const cancelButton = createElement('button', {
    type: 'button',
    text: 'Cancel',
    className: 'jog-calibration-secondary',
  });

  [startButton, doneButton, saveButton, retryButton, resetButton, cancelButton].forEach((button) => {
    actions.appendChild(button);
  });
  panel.appendChild(actions);

  function syncOpenState() {
    overlay.classList.toggle('is-open', state.open);
    overlay.setAttribute('aria-hidden', state.open ? 'false' : 'true');
    overlay.hidden = !state.open;
  }

  function close() {
    if (state.phase === 'listening') {
      jogRuntime.cancelCalibration?.();
    }
    state.open = false;
    state.phase = 'setup';
    state.summary = null;
    state.preview = null;
    state.notice = '';
    syncOpenState();
  }

  function open() {
    state.open = true;
    render();
    syncOpenState();
  }

  function renderSavedPreferenceState() {
    savedState.textContent = '';
    const entry = resolveSavedCalibrationEntry(jogRuntime, state.side, state.mode, state.surface);
    if (!entry) return;
    savedState.textContent = `Current saved feel: ${formatCurrentPreference(state.side, state.mode, state.surface, entry)}`;
  }

  function renderResults() {
    results.textContent = '';
    const previewEntries = state.preview && Array.isArray(state.preview.entries)
      ? state.preview.entries
      : [];
    const summaryWarning = state.summary && state.summary.warning ? state.summary.warning : '';

    if (state.phase === 'result' && previewEntries.length) {
      previewEntries.forEach((entry) => {
        results.appendChild(createElement('div', {
          className: 'jog-calibration-result-line',
          text: formatCalibrationEntry(entry),
        }));
        if (entry.note) {
          results.appendChild(createElement('div', {
            className: 'jog-calibration-result-note',
            text: entry.note,
          }));
        }
      });

      const missingSides = getSelectedSideKeys(state.side)
        .filter((sideKey) => !previewEntries.some((entry) => entry.side === sideKey && entry.surface === state.surface));
      if (missingSides.length) {
        results.appendChild(createElement('div', {
          className: 'jog-calibration-result-note',
          text: `No usable ${missingSides.join(' / ')} jog samples were captured for ${MODE_LABELS[state.mode]} / ${SURFACE_LABELS[state.surface]}.`,
        }));
      }
      return;
    }

    if (state.phase === 'result' && summaryWarning) {
      results.appendChild(createElement('div', {
        className: 'jog-calibration-result-note',
        text: summaryWarning,
      }));
    }
  }

  function render() {
    if (!state.open) return;

    instructions.textContent = `4. ${getInstructionText(state.side, state.surface)}`;

    Object.entries(sideButtons).forEach(([side, button]) => {
      button.classList.toggle('is-selected', state.side === side);
      button.disabled = state.phase === 'listening';
    });

    Object.entries(modeButtons).forEach(([mode, button]) => {
      button.classList.toggle('is-selected', state.mode === mode);
      button.disabled = state.phase === 'listening';
    });

    Object.entries(surfaceButtons).forEach(([surface, button]) => {
      button.classList.toggle('is-selected', state.surface === surface);
      button.disabled = state.phase === 'listening';
    });

    renderSavedPreferenceState();

    if (state.phase === 'listening') {
      status.textContent = getListeningText(state.side, state.mode, state.surface);
    } else if (state.notice) {
      status.textContent = state.notice;
    } else if (state.phase === 'result') {
      const hasPreviewEntries = !!(state.preview && Array.isArray(state.preview.entries) && state.preview.entries.length);
      const summaryWarning = state.summary && state.summary.warning ? state.summary.warning : '';
      status.textContent = hasPreviewEntries
        ? `Calibration result ready for ${SIDE_LABELS[state.side]} / ${MODE_LABELS[state.mode]} / ${SURFACE_LABELS[state.surface]}. Save it to apply the measured full-turn ticks to that selection.`
        : (summaryWarning || `No usable jog samples were captured for ${SIDE_LABELS[state.side]} / ${MODE_LABELS[state.mode]} / ${SURFACE_LABELS[state.surface]}.`);
    } else {
      status.textContent = 'Start listening only when the FLX6 is ready and you are about to rotate the selected jog wheel.';
    }

    renderResults();

    startButton.hidden = state.phase !== 'setup';
    doneButton.hidden = state.phase !== 'listening';
    saveButton.hidden = state.phase !== 'result';
    retryButton.hidden = state.phase !== 'result';
    resetButton.hidden = false;
    saveButton.disabled = !(state.preview && Array.isArray(state.preview.entries) && state.preview.entries.length);
  }

  function beginCalibration() {
    state.summary = null;
    state.preview = null;
    state.notice = '';
    state.phase = 'listening';
    jogRuntime.startCalibration?.(sideToRuntimeSelection(state.side), {
      mode: state.mode,
      surface: state.surface,
    });
    render();
  }

  function finishCalibration() {
    state.summary = jogRuntime.stopCalibration?.() || null;
    state.preview = jogRuntime.previewCalibration?.(state.summary, {
      mode: state.mode,
      surface: state.surface,
      controllerId,
    }) || null;
    state.phase = 'result';
    render();
  }

  function saveCalibration() {
    if (!state.summary) return;
    const saved = jogRuntime.saveCalibration?.(state.summary, {
      mode: state.mode,
      surface: state.surface,
      controllerId,
    });
    state.preview = saved && saved.preview ? saved.preview : state.preview;
    state.notice = `Calibration saved for ${SIDE_LABELS[state.side]} / ${MODE_LABELS[state.mode]} / ${SURFACE_LABELS[state.surface]}. Visual jog sensitivity now uses the measured full-turn ticks for that selection.`;
    state.phase = 'setup';
    render();
  }

  function resetCalibration() {
    if (state.phase === 'listening') {
      jogRuntime.cancelCalibration?.();
    }
    jogRuntime.resetCalibrationPreference?.({
      side: sideToRuntimeSelection(state.side),
      mode: state.mode,
      surface: state.surface,
    });
    state.summary = null;
    state.preview = null;
    state.phase = 'setup';
    state.notice = `Calibration reset for ${SIDE_LABELS[state.side]} / ${MODE_LABELS[state.mode]} / ${SURFACE_LABELS[state.surface]}. Visual jog sensitivity is back on the default runtime feel for that selection.`;
    render();
  }

  closeButton.addEventListener('click', close);
  startButton.addEventListener('click', beginCalibration);
  doneButton.addEventListener('click', finishCalibration);
  saveButton.addEventListener('click', saveCalibration);
  retryButton.addEventListener('click', beginCalibration);
  resetButton.addEventListener('click', resetCalibration);
  cancelButton.addEventListener('click', close);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  document.addEventListener('keydown', (event) => {
    if (!state.open || event.key !== 'Escape') return;
    close();
  });

  if (trigger && typeof trigger.addEventListener === 'function') {
    trigger.addEventListener('click', open);
  }

  mount.appendChild(overlay);
  syncOpenState();

  return {
    open,
    close,
    overlay,
  };
}
