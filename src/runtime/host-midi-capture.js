// Host-page WebMIDI capture wrapper. Canonical browser MIDI behavior remains in src/midi.js; this module only wires host page callbacks/status.

export async function startHostMidiCapture({
  runtimeApp,
  hostStatus,
  bootMIDIFromQuery,
  consoleRef = console,
} = {}) {
  if (typeof bootMIDIFromQuery !== 'function') {
    throw new TypeError('startHostMidiCapture requires bootMIDIFromQuery');
  }

  try {
    consoleRef?.log?.('[MIDI] starting init via bootMIDIFromQuery');
    const handle = await bootMIDIFromQuery({
      onInfo(info) {
        try {
          runtimeApp?.consumeNormalizedInfo?.(info);
        } catch {}
      },
      onStatus(status) {
        try {
          runtimeApp?.setMIDIStatus?.(status);
        } catch {}
      },
    });
    const deviceInfo = handle?.getDeviceInfo?.() || {};

    hostStatus?.noteControllerDetails?.({
      ...deviceInfo,
      deviceName: deviceInfo.inputName || deviceInfo.name || handle?.input || null,
      ready: !!handle?.input,
    });

    consoleRef?.log?.('[MIDI] init OK');
    return handle;
  } catch (error) {
    consoleRef?.warn?.('[MIDI] init failed', error);
    try {
      runtimeApp?.setMIDIStatus?.('host: off');
    } catch {}
    return null;
  }
}
