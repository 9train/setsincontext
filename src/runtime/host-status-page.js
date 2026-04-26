import {
  createHostControllerStatusState,
  applyMidiStatusToControllerState,
  absorbControllerRuntimeInfo,
  describeHostControllerStatus,
  describeHostMIDIStatus,
  describeHostWSStatus,
  getHostStatusHealthState,
} from '../host-status.js';

export function initHostStatusChrome(options = {}) {
  const runtimeApp = options.runtimeApp || {};
  const doc = options.document || document;

  const hostStatusChromeEl = doc.getElementById('hostStatusChrome');
  const hostStatusPopoverEl = doc.getElementById('hostStatusPopover');
  const hostStatusButtonEl = doc.getElementById('hostStatusButton');
  const wsStatusEl = doc.getElementById('wsStatus');
  const midiStatusEl = doc.getElementById('midiStatus');
  const controllerStatusEl = doc.getElementById('controllerStatus');
  const hostControllerStatus = createHostControllerStatusState();
  const hostCopy = Object.freeze({
    label: 'HOST',
    title: 'FLX6 Controller Studio',
    detail: 'Official profile truth stays front-and-center. Tools stay reachable without crowding the stage.',
  });
  const statusModels = {
    hostLink: describeHostWSStatus(runtimeApp.getWSStatus?.()),
    midiLane: describeHostMIDIStatus(runtimeApp.getMIDIStatus?.()),
    controllerPath: describeHostControllerStatus(hostControllerStatus),
  };
  let activeStatusPopover = null;
  let launcher = null;

  function ensureStatusButton(el, label, { showDot = true } = {}) {
    if (!el || el.__statusButtonReady) return el;
    el.type = 'button';
    el.classList.add('host-status-button');
    el.setAttribute('aria-haspopup', 'dialog');
    el.setAttribute('aria-controls', 'hostStatusPopover');
    const dotEl = doc.createElement('span');
    dotEl.className = 'host-status-dot';
    dotEl.setAttribute('aria-hidden', 'true');
    const labelEl = doc.createElement('span');
    labelEl.className = 'host-status-label';
    el.innerHTML = '';
    if (showDot) el.appendChild(dotEl);
    el.appendChild(labelEl);
    el.__statusButtonReady = true;
    el.__statusDotEl = dotEl;
    el.__statusLabelEl = labelEl;
    labelEl.textContent = label;
    return el;
  }

  function buildStatusButtonTitle(label, model) {
    if (!model) return label;
    return [label, model.summary, model.detail].filter(Boolean).join(' | ');
  }

  function renderStatusButton(el, label, model, { showDot = true, modeButton = false, active = false } = {}) {
    const button = ensureStatusButton(el, label, { showDot });
    if (!button) return;
    button.classList.toggle('host-mode-button', modeButton);
    button.classList.toggle('is-open', active);
    button.classList.remove('is-ok', 'is-bad');
    if (!modeButton) {
      button.classList.add(getHostStatusHealthState(model) === 'ok' ? 'is-ok' : 'is-bad');
    }
    if (button.__statusLabelEl) button.__statusLabelEl.textContent = label;
    if (button.__statusDotEl) button.__statusDotEl.hidden = !showDot;
    button.setAttribute('aria-expanded', active ? 'true' : 'false');
    button.title = modeButton ? `${label} | ${hostCopy.title}` : buildStatusButtonTitle(label, model);
  }

  function describeActivePopover() {
    if (activeStatusPopover === 'host') {
      return {
        label: hostCopy.label,
        title: hostCopy.title,
        detail: hostCopy.detail,
        health: null,
      };
    }

    if (activeStatusPopover === 'hostLink') {
      return {
        label: 'Host Link',
        title: statusModels.hostLink?.summary || 'Host Link',
        detail: statusModels.hostLink?.detail || '',
        health: getHostStatusHealthState(statusModels.hostLink),
      };
    }

    if (activeStatusPopover === 'midiLane') {
      return {
        label: 'MIDI Lane',
        title: statusModels.midiLane?.summary || 'MIDI Lane',
        detail: statusModels.midiLane?.detail || '',
        health: getHostStatusHealthState(statusModels.midiLane),
      };
    }

    if (activeStatusPopover === 'controllerPath') {
      return {
        label: 'Controller Path',
        title: statusModels.controllerPath?.summary || 'Controller Path',
        detail: statusModels.controllerPath?.detail || '',
        health: getHostStatusHealthState(statusModels.controllerPath),
      };
    }

    return null;
  }

  function renderStatusPopover() {
    if (!hostStatusPopoverEl) return;
    const popover = describeActivePopover();
    hostStatusPopoverEl.innerHTML = '';
    hostStatusPopoverEl.classList.remove('open', 'is-ok', 'is-bad');

    if (!popover) {
      hostStatusPopoverEl.hidden = true;
      hostStatusPopoverEl.setAttribute('aria-hidden', 'true');
      return;
    }

    if (popover.health === 'ok') hostStatusPopoverEl.classList.add('is-ok');
    if (popover.health === 'bad') hostStatusPopoverEl.classList.add('is-bad');

    const kickerEl = doc.createElement('div');
    kickerEl.className = 'host-status-popover-kicker';
    kickerEl.textContent = popover.label;
    const titleEl = doc.createElement('strong');
    titleEl.className = 'host-status-popover-title';
    titleEl.textContent = popover.title;
    hostStatusPopoverEl.appendChild(kickerEl);
    hostStatusPopoverEl.appendChild(titleEl);

    if (popover.detail) {
      const detailEl = doc.createElement('p');
      detailEl.className = 'host-status-popover-detail';
      detailEl.textContent = popover.detail;
      hostStatusPopoverEl.appendChild(detailEl);
    }

    hostStatusPopoverEl.hidden = false;
    hostStatusPopoverEl.classList.add('open');
    hostStatusPopoverEl.setAttribute('aria-hidden', 'false');
  }

  function renderStatusChrome() {
    renderStatusButton(hostStatusButtonEl, 'HOST', null, {
      showDot: false,
      modeButton: true,
      active: activeStatusPopover === 'host',
    });
    renderStatusButton(wsStatusEl, 'Host Link', statusModels.hostLink, {
      active: activeStatusPopover === 'hostLink',
    });
    renderStatusButton(midiStatusEl, 'MIDI Lane', statusModels.midiLane, {
      active: activeStatusPopover === 'midiLane',
    });
    renderStatusButton(controllerStatusEl, 'Controller Path', statusModels.controllerPath, {
      active: activeStatusPopover === 'controllerPath',
    });
    renderStatusPopover();
  }

  function closeStatusPopover() {
    if (!activeStatusPopover) return;
    activeStatusPopover = null;
    renderStatusChrome();
  }

  function toggleStatusPopover(key) {
    activeStatusPopover = activeStatusPopover === key ? null : key;
    renderStatusChrome();
  }

  function renderWSStatus(status) {
    statusModels.hostLink = describeHostWSStatus(status);
    renderStatusChrome();
    launcher?.refresh?.();
  }

  function renderMIDIStatus(status) {
    statusModels.midiLane = describeHostMIDIStatus(status);
    renderStatusChrome();
    launcher?.refresh?.();
  }

  function renderControllerStatus() {
    statusModels.controllerPath = describeHostControllerStatus(hostControllerStatus);
    renderStatusChrome();
    runtimeApp.setControllerRuntime?.(hostControllerStatus);
    launcher?.refresh?.();
  }

  function noteControllerDetails(details) {
    absorbControllerRuntimeInfo(hostControllerStatus, details);
    renderControllerStatus();
  }

  const setMIDIStatus = (s) => {
    renderMIDIStatus(s);
    applyMidiStatusToControllerState(hostControllerStatus, s);
    renderControllerStatus();
  };
  const setWSStatus = (status) => {
    renderWSStatus(status);
  };

  [
    [hostStatusButtonEl, 'host'],
    [wsStatusEl, 'hostLink'],
    [midiStatusEl, 'midiLane'],
    [controllerStatusEl, 'controllerPath'],
  ].forEach(([button, key]) => {
    button?.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleStatusPopover(key);
    });
  });

  doc.addEventListener('click', (event) => {
    if (!activeStatusPopover) return;
    if (hostStatusChromeEl?.contains(event.target)) return;
    closeStatusPopover();
  });
  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeStatusPopover();
  });

  function refresh() {
    renderStatusChrome();
    launcher?.refresh?.();
  }

  function setLauncher(nextLauncher) {
    launcher = nextLauncher || null;
    launcher?.refresh?.();
    return launcher;
  }

  function getStatusSnapshot() {
    statusModels.hostLink = describeHostWSStatus(runtimeApp.getWSStatus?.());
    statusModels.midiLane = describeHostMIDIStatus(runtimeApp.getMIDIStatus?.());
    statusModels.controllerPath = describeHostControllerStatus(hostControllerStatus);
    return {
      hostLink: statusModels.hostLink,
      midiLane: statusModels.midiLane,
      controllerPath: statusModels.controllerPath,
    };
  }

  renderStatusChrome();
  runtimeApp.setWSStatusHandler?.(setWSStatus);
  runtimeApp.setMIDIStatusHandler?.(setMIDIStatus);
  renderWSStatus(runtimeApp.getWSStatus?.());
  renderMIDIStatus(runtimeApp.getMIDIStatus?.());
  renderControllerStatus();

  return {
    noteControllerDetails,
    refresh,
    setLauncher,
    getControllerStatusState: () => hostControllerStatus,
    getStatusSnapshot,
  };
}
