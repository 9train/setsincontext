// src/launcher.js
// Shared host launcher dashboard + section shell.

const SECTION_DEFS = Object.freeze([
  {
    key: 'status',
    title: 'Status Dashboard',
    subtitle: 'Host link, MIDI lane, controller path, and the latest safe action summary.',
    icon: 'ST',
    cardCopy: 'See whether the relay, MIDI lane, and official controller path are healthy before diving deeper.',
  },
  {
    key: 'theme',
    title: 'Theme & Appearance',
    subtitle: 'Frame the board cleanly for coaching, recording, and presentation without losing theme controls.',
    icon: 'TH',
    cardCopy: 'Fit, fill, transparency, colorful scenes, and group styling all live together here.',
  },
  {
    key: 'recording',
    title: 'Recording & Timeline',
    subtitle: 'Capture, replay, save, and inspect performances without moving away from the host surface.',
    icon: 'RC',
    cardCopy: 'Recorder controls stay grouped with timeline access so capture flows are easier to teach.',
  },
  {
    key: 'diagnostics',
    title: 'Diagnostics',
    subtitle: 'Review the truth chain from raw MIDI to normalized targets and board output when trust matters.',
    icon: 'DG',
    cardCopy: 'Open the live debugger panel and keep deeper technical cleanup tucked behind a disclosure.',
  },
  {
    key: 'mapping',
    title: 'Calibration & Mapping',
    subtitle: 'Keep jog feel tuning and draft-first mapping tools together without touching controller truth.',
    icon: 'MP',
    cardCopy: 'Calibration adjusts visual feel, while mapping tools stay explicitly draft-first and reviewable.',
  },
  {
    key: 'tools',
    title: 'Tools / Advanced',
    subtitle: 'Keep presets and supporting utility actions reachable without turning the menu into a wall of controls.',
    icon: 'TL',
    cardCopy: 'Preset save/load stays available, while higher-risk or technical controls remain secondary.',
  },
]);

function isFormField(target) {
  const el = target instanceof Element ? target : null;
  if (!el) return false;
  return !!el.closest('input, select, textarea, [contenteditable="true"]');
}

function getSectionDef(key) {
  return SECTION_DEFS.find((section) => section.key === key) || SECTION_DEFS[0];
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtReplayDuration(ms) {
  const seconds = Math.max(0, Number(ms) || 0) / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const mins = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${rest}`;
}

function renderStatusItem(label, model = {}, suffix = '') {
  const item = document.createElement('div');
  item.className = 'launcher-status-item';
  item.dataset.tone = model.tone || 'unknown';

  const labelEl = document.createElement('div');
  labelEl.className = 'launcher-status-label';
  labelEl.textContent = label;

  const summaryEl = document.createElement('div');
  summaryEl.className = 'launcher-status-summary';
  summaryEl.textContent = model.summary || 'Unknown';

  const detailEl = document.createElement('div');
  detailEl.className = 'launcher-status-detail';
  detailEl.textContent = [model.detail, suffix].filter(Boolean).join(' ');

  item.append(labelEl, summaryEl, detailEl);
  return item;
}

export function initLauncher({
  actions = {},
  mountPresetUI,
  getStatusSnapshot = null,
} = {}) {
  const fab = document.createElement('button');
  fab.id = 'fab';
  fab.type = 'button';
  fab.title = 'Menu';
  fab.textContent = 'Menu';

  const sheet = document.createElement('div');
  sheet.id = 'fabSheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'false');
  sheet.setAttribute('aria-labelledby', 'launcherSheetTitle');
  sheet.innerHTML = `
    <div class="launcher-dashboard-view">
      <div class="launcher-sheet-header">
        <div class="launcher-sheet-copy">
          <span class="launcher-sheet-kicker">Host Menu</span>
          <strong id="launcherSheetTitle">Controller Dashboard</strong>
          <span>Open one tool family at a time and keep the stage clear.</span>
        </div>
        <button type="button" class="launcher-close" data-close-sheet>Close</button>
      </div>
      <div class="launcher-dashboard" aria-label="Launcher sections"></div>
    </div>

    <div class="launcher-modal" aria-hidden="true">
      <div class="launcher-modal-header">
        <button type="button" class="launcher-back" data-back-dashboard>Back</button>
        <div class="launcher-modal-copy">
          <span class="launcher-sheet-kicker">Host Menu</span>
          <strong id="launcherModalTitle"></strong>
          <span id="launcherModalSubtitle"></span>
        </div>
        <button type="button" class="launcher-close" data-close-sheet>Close</button>
      </div>
      <div class="launcher-modal-body">
        <section class="launcher-section" data-section="status">
          <article class="launcher-card">
            <div class="launcher-card-title">Runtime status</div>
            <div class="launcher-card-copy">The host should be easy to trust at a glance before you open deeper tooling.</div>
            <div class="launcher-status-grid" id="launcherStatusGrid"></div>
          </article>
          <article class="launcher-card">
            <div class="launcher-card-title">Last action</div>
            <div class="launcher-card-copy" id="launcherLastAction">No recent controller action has been captured yet.</div>
          </article>
          <article class="launcher-card">
            <div class="launcher-card-title">Deeper review</div>
            <div class="launcher-card-copy">Diagnostics show raw input -> normalized target -> board target -> deck/mode context.</div>
            <div class="launcher-action-row">
              <button type="button" data-act="openDiagnosticsReview">Open Diagnostics</button>
            </div>
          </article>
        </section>

        <section class="launcher-section" data-section="theme">
          <article class="launcher-card">
            <div class="launcher-card-title">Board framing</div>
            <div class="launcher-card-copy">Keep the controller readable for OBS, screenshares, or side-by-side teaching.</div>
            <div class="launcher-action-row">
              <button type="button" id="fit" data-act="fit">Fit</button>
              <button type="button" id="fill" data-act="fill">Fill</button>
              <button type="button" id="toggleBG" data-act="toggleBG">Transparent</button>
            </div>
          </article>
          <article class="launcher-card">
            <div class="launcher-card-title">Theme Studio</div>
            <div class="launcher-card-copy">Scene cards, friendly board groups, recent colors, and saved looks stay here. Advanced raw controls are tucked underneath when you need them.</div>
            <div id="launcherThemeMount" class="launcher-theme-mount"></div>
          </article>
        </section>

        <section class="launcher-section" data-section="recording">
          <article class="launcher-card">
            <div class="launcher-card-title">Capture controls</div>
            <div class="launcher-card-copy">Capture live sessions, replay them, or move JSON recordings in and out without leaving the host.</div>
            <div class="launcher-action-row">
              <button type="button" id="recStart" data-act="recStart">Start Recording</button>
              <button type="button" id="recStop" data-act="recStop">Stop Recording</button>
              <button type="button" id="recPlay" data-act="recPlay">Replay</button>
              <button type="button" id="recDownload" data-act="recDownload">Download JSON</button>
            </div>
            <label class="launcher-file-row">
              <span>Name replay</span>
              <input id="recName" type="text" autocomplete="off" placeholder="Practice take" />
            </label>
            <div class="launcher-action-row">
              <button type="button" id="recSaveLocal" data-act="recSaveLocal">Save to this browser</button>
            </div>
            <label id="recLoadWrap" class="launcher-file-row">
              <span>Load JSON</span>
              <input id="recLoad" type="file" accept="application/json" />
            </label>
          </article>
          <article class="launcher-card">
            <div class="launcher-card-title">Saved replays</div>
            <div class="launcher-card-copy">Local browser replay memory stays on this device and can be exported as JSON when needed.</div>
            <div id="savedReplayList" class="launcher-saved-replay-list" aria-live="polite"></div>
          </article>
          <article class="launcher-card">
            <div class="launcher-card-title">Timeline</div>
            <div class="launcher-card-copy">Open the timeline overlay for looping, visual event review, and screen capture controls.</div>
            <div class="launcher-action-row">
              <button type="button" data-act="showTimeline">Open Timeline</button>
            </div>
          </article>
        </section>

        <section class="launcher-section" data-section="diagnostics">
          <article class="launcher-card">
            <div class="launcher-card-title">Live diagnostics</div>
            <div class="launcher-card-copy">Use the debugger panel when you need the actual truth chain, not a guessed fallback summary.</div>
            <div class="launcher-action-row">
              <button type="button" id="launcherDiagToggle"></button>
            </div>
          </article>
          <article class="launcher-card">
            <div class="launcher-card-title">Truth-chain guide</div>
            <div class="launcher-card-copy">Diagnostics follow raw MIDI -> normalized target -> board target -> deck/mode context so you can verify where meaning was assigned.</div>
          </article>
          <details class="launcher-advanced">
            <summary>Advanced</summary>
            <div class="launcher-advanced-body">
              <article class="launcher-card">
                <div class="launcher-card-title">Debugger history</div>
                <div class="launcher-card-copy">Clear recent debugger snapshots without changing the underlying diagnostics panel implementation.</div>
                <div class="launcher-action-row">
                  <button type="button" id="launcherDiagClear" data-act="clearDiag">Clear Diagnostics</button>
                </div>
              </article>
            </div>
          </details>
        </section>

        <section class="launcher-section" data-section="mapping">
          <article class="launcher-card">
            <div class="launcher-card-title">Jog calibration</div>
            <div class="launcher-card-copy">Calibration only adjusts visual feel. It does not rewrite official mappings or canonical controller targets.</div>
            <div class="launcher-action-row">
              <button type="button" id="openJogCalibration">Jog Calibration</button>
            </div>
          </article>
          <article class="launcher-card">
            <div class="launcher-card-title">Edit Mode</div>
            <div class="launcher-card-copy">Edit Mode is the single draft-first path for learning and reviewing mappings. Open the debugger and use "Edit / Learn This Surface" to bridge a selected board surface here.</div>
            <div class="launcher-action-row">
              <button type="button" id="launcherEditToggle"></button>
            </div>
          </article>
          <details class="launcher-advanced">
            <summary>Advanced</summary>
            <div class="launcher-advanced-body">
              <article class="launcher-card">
                <div class="launcher-card-title">Legacy Mapping Wizard</div>
                <div class="launcher-card-copy">Kept for compatibility while Edit Mode becomes the single path. Prefer Edit Mode for draft-first learn capture.</div>
                <div class="launcher-action-row">
                  <button type="button" data-act="showWizard">Open Legacy Mapping Wizard</button>
                </div>
              </article>
            </div>
          </details>
        </section>

        <section class="launcher-section" data-section="tools">
          <article class="launcher-card">
            <div class="launcher-card-title">Presets</div>
            <div class="launcher-card-copy">Preset save/load keeps theme, learned mappings, and knob config bundled into reviewable JSON.</div>
            <div id="launcherPresetMount" class="launcher-preset-mount"></div>
          </article>
        </section>
      </div>
    </div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(sheet);

  const dashboardView = sheet.querySelector('.launcher-dashboard-view');
  const dashboard = sheet.querySelector('.launcher-dashboard');
  const modal = sheet.querySelector('.launcher-modal');
  const modalTitle = sheet.querySelector('#launcherModalTitle');
  const modalSubtitle = sheet.querySelector('#launcherModalSubtitle');
  const statusGrid = sheet.querySelector('#launcherStatusGrid');
  const lastActionEl = sheet.querySelector('#launcherLastAction');
  const diagToggleBtn = sheet.querySelector('#launcherDiagToggle');
  const diagClearBtn = sheet.querySelector('#launcherDiagClear');
  const editToggleBtn = sheet.querySelector('#launcherEditToggle');
  const recLoadInput = sheet.querySelector('#recLoad');
  const recNameInput = sheet.querySelector('#recName');
  const savedReplayList = sheet.querySelector('#savedReplayList');
  const presetMount = sheet.querySelector('#launcherPresetMount');
  const sectionEls = new Map(
    [...sheet.querySelectorAll('.launcher-section')].map((section) => [section.dataset.section, section]),
  );
  let currentSection = null;
  let internalClickInFlight = false;

  dashboard.innerHTML = SECTION_DEFS.map((section) => `
    <button type="button" class="launcher-section-card" data-open-section="${section.key}">
      <span class="launcher-section-card-icon" aria-hidden="true">${section.icon}</span>
      <span class="launcher-section-card-copy">
        <strong>${section.title}</strong>
        <span>${section.cardCopy}</span>
      </span>
      <span class="launcher-section-card-chevron" aria-hidden="true">></span>
    </button>
  `).join('');

  function refreshStatusSection() {
    if (!statusGrid) return;
    const snapshot = typeof getStatusSnapshot === 'function' ? getStatusSnapshot() || {} : {};
    const items = [
      ['Host Link', snapshot.hostLink],
      ['MIDI Lane', snapshot.midiLane],
      ['Controller Path', snapshot.controllerPath],
    ];
    statusGrid.innerHTML = '';
    items.forEach(([label, model]) => {
      statusGrid.appendChild(renderStatusItem(label, model || {}));
    });
    lastActionEl.textContent = snapshot.lastAction || 'No recent controller action has been captured yet.';
  }

  function refreshDiagnosticsSection() {
    const diagOpen = typeof actions.isDiagOpen === 'function' ? !!actions.isDiagOpen() : false;
    diagToggleBtn.textContent = diagOpen ? 'Close Live Diagnostics' : 'Open Live Diagnostics';
    diagToggleBtn.dataset.act = diagOpen ? 'hideDiag' : 'showDiag';
    diagClearBtn.classList.toggle('hidden', typeof actions.clearDiag !== 'function');
  }

  function refreshMappingSection() {
    const editOpen = typeof actions.isEditOpen === 'function' ? !!actions.isEditOpen() : false;
    editToggleBtn.textContent = editOpen ? 'Close Edit Mode' : 'Open Edit Mode';
    editToggleBtn.dataset.act = editOpen ? 'hideEdit' : 'showEdit';
  }

  function refreshRecordingSection() {
    if (!savedReplayList) return;
    const list = typeof actions.listSavedReplays === 'function' ? actions.listSavedReplays() || [] : [];
    if (!list.length) {
      savedReplayList.innerHTML = '<div class="launcher-card-copy">No saved replays in this browser yet.</div>';
      return;
    }
    savedReplayList.innerHTML = list.map((record) => {
      const replayId = escapeHtml(record.replayId);
      const name = escapeHtml(record.name || record.title || 'Untitled replay');
      const bits = [
        record.eventCount != null ? `${Number(record.eventCount) || 0} events` : null,
        record.durationMs != null ? fmtReplayDuration(record.durationMs) : null,
        record.room ? `room ${record.room}` : null,
        record.hostName ? `host ${record.hostName}` : null,
      ].filter(Boolean).map(escapeHtml).join(' · ');
      return `
        <div class="launcher-saved-replay" data-replay-id="${replayId}">
          <div class="launcher-saved-replay-copy">
            <strong>${name}</strong>
            <span>${bits || 'Replay'}</span>
          </div>
          <div class="launcher-action-row">
            <button type="button" data-replay-action="load" data-replay-id="${replayId}">Load</button>
            <button type="button" data-replay-action="play" data-replay-id="${replayId}">Play</button>
            <button type="button" data-replay-action="download" data-replay-id="${replayId}">Download</button>
            <button type="button" data-replay-action="delete" data-replay-id="${replayId}">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function refreshVisibleSection() {
    refreshStatusSection();
    refreshDiagnosticsSection();
    refreshMappingSection();
    refreshRecordingSection();
  }

  function showDashboard() {
    currentSection = null;
    dashboardView.classList.remove('hidden');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    sectionEls.forEach((section) => section.classList.remove('open'));
  }

  function openSection(key) {
    const def = getSectionDef(key);
    const section = sectionEls.get(def.key);
    if (!section) return;

    currentSection = def.key;
    modalTitle.textContent = def.title;
    modalSubtitle.textContent = def.subtitle;
    dashboardView.classList.add('hidden');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    sectionEls.forEach((panel, panelKey) => {
      panel.classList.toggle('open', panelKey === def.key);
    });
    refreshVisibleSection();
  }

  function openSheet() {
    sheet.classList.add('open');
    refreshVisibleSection();
  }

  function closeSheet() {
    sheet.classList.remove('open');
    showDashboard();
  }

  function toggleSheet() {
    if (sheet.classList.contains('open')) closeSheet();
    else openSheet();
  }

  function toggleSection(key) {
    if (!sheet.classList.contains('open')) {
      openSheet();
      openSection(key);
      return;
    }
    openSection(key);
  }

  async function invokeAction(name, detail = {}) {
    if (!name) return;

    if (name === 'openDiagnosticsReview') {
      if (typeof actions.showDiag === 'function') actions.showDiag();
      else actions.toggleDiag?.();
      refreshVisibleSection();
      return;
    }

    const fn = actions[name];
    if (typeof fn !== 'function') return;
    await fn(detail);
    refreshVisibleSection();
  }

  async function invokeReplayAction(name, replayId) {
    if (!name || !replayId) return;
    const actionMap = {
      load: 'recLoadSaved',
      play: 'recPlaySaved',
      download: 'recDownloadSaved',
      delete: 'recDeleteSaved',
    };
    const fn = actions[actionMap[name]];
    if (typeof fn !== 'function') return;
    await fn(replayId);
    refreshVisibleSection();
  }

  function isEventInsideLauncher(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (path.includes(fab) || path.includes(sheet)) return true;
    const target = event?.target;
    if (!target || typeof target !== 'object') return false;
    return target === fab || fab.contains(target) || sheet.contains(target);
  }

  fab.addEventListener('click', () => {
    internalClickInFlight = true;
    toggleSheet();
  });

  document.addEventListener('click', (event) => {
    if (!sheet.classList.contains('open')) {
      internalClickInFlight = false;
      return;
    }
    if (internalClickInFlight || isEventInsideLauncher(event)) {
      internalClickInFlight = false;
      return;
    }
    internalClickInFlight = false;
    closeSheet();
  });

  document.addEventListener('keydown', (event) => {
    if (isFormField(event.target)) return;
    if (event.key.toLowerCase() === 'm') {
      toggleSheet();
      return;
    }
    if (event.key === 'Escape' && sheet.classList.contains('open')) {
      closeSheet();
    }
  });

  sheet.addEventListener('click', async (event) => {
    internalClickInFlight = true;

    const openTrigger = event.target.closest('[data-open-section]');
    if (openTrigger) {
      openSection(openTrigger.getAttribute('data-open-section'));
      return;
    }

    const closeTrigger = event.target.closest('[data-close-sheet]');
    if (closeTrigger) {
      closeSheet();
      return;
    }

    const backTrigger = event.target.closest('[data-back-dashboard]');
    if (backTrigger) {
      showDashboard();
      return;
    }

    const presetTrigger = event.target.closest('[data-theme-preset]');
    if (presetTrigger) {
      await actions.applyThemePreset?.(presetTrigger.getAttribute('data-theme-preset'));
      return;
    }

    const actionTrigger = event.target.closest('[data-act]');
    if (actionTrigger) {
      await invokeAction(actionTrigger.getAttribute('data-act'), {
        name: recNameInput?.value || '',
      });
      return;
    }

    const replayTrigger = event.target.closest('[data-replay-action]');
    if (replayTrigger) {
      await invokeReplayAction(
        replayTrigger.getAttribute('data-replay-action'),
        replayTrigger.getAttribute('data-replay-id'),
      );
    }
  });

  recLoadInput?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await actions.recLoadText?.(text);
    event.target.value = '';
  });

  if (presetMount && typeof mountPresetUI === 'function') {
    mountPresetUI(presetMount);
  }

  showDashboard();

  return {
    open: openSheet,
    close: closeSheet,
    openSection,
    toggleSection,
    showDashboard,
    refresh: refreshVisibleSection,
  };
}
