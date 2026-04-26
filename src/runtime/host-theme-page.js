// Host page theme wiring. This module wires injected theme/launcher dependencies into host.html without owning theme internals, launcher rendering, board rendering, MIDI boot, or WebSocket boot.

function getDefaultDocument() {
  return typeof document !== 'undefined' ? document : null;
}

function getDefaultWindow() {
  return typeof window !== 'undefined' ? window : null;
}

export function initHostThemePage({
  THEME,
  documentRef = getDefaultDocument(),
  windowRef = getDefaultWindow(),
  getLauncher = () => null,
} = {}) {
  if (!THEME || typeof THEME.attachThemeDesigner !== 'function') {
    throw new TypeError('initHostThemePage requires THEME.attachThemeDesigner');
  }

  const themeDesignerResult = THEME.attachThemeDesigner({
    mount: documentRef?.getElementById?.('launcherThemeMount') || null,
    svgRoot: documentRef?.querySelector?.('#boardHost svg') || null,
  });

  THEME.ensurePreset?.('instrument-dark');

  function toggleThemeSection() {
    getLauncher?.()?.toggleSection?.('theme');
  }

  function onKeyDown(event) {
    if (event?.shiftKey && String(event.key || '').toLowerCase() === 't') {
      toggleThemeSection();
    }
  }

  documentRef?.addEventListener?.('keydown', onKeyDown);

  return {
    dispose() {
      documentRef?.removeEventListener?.('keydown', onKeyDown);
    },
    toggleThemeSection,
    themeDesignerResult,
  };
}
