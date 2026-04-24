import { validateFeelConfig } from './feel.schema.js';
import { matchControllerProfile } from '../controllers/profiles/index.js';

export async function loadFeelConfig({ deviceName, fallbackUrl = '/maps/default-feel.json' } = {}) {
  let url = fallbackUrl;

  const profile = matchControllerProfile(deviceName, 'midi', {
    inputName: deviceName,
    outputName: deviceName,
  });
  if (profile && profile.assets && profile.assets.feelConfigPath) {
    url = profile.assets.feelConfigPath;
  }

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`[feel] failed to fetch ${url}: ${res.status}`);
  const cfg = await res.json();

  const errs = validateFeelConfig(cfg);
  if (errs.length) console.warn('[feel] config warnings:\n' + errs.map(e => ' - ' + e).join('\n'));

  // Minimal normalization & defaults
  cfg.device = String(cfg.device || cfg.deviceName || deviceName || 'UNKNOWN');
  cfg.deviceName = String(cfg.deviceName || cfg.device || deviceName || 'UNKNOWN');
  cfg.global = cfg.global || {};
  cfg.global.jog = { intervalMs: 10, rpm: 33.333, alpha: 0.125, beta: 0.0039, ...cfg.global.jog };
  cfg.global.enc = { step: 0.01, accel: 0.4, ...(cfg.global.enc || {}) };
  cfg.global.softTakeoverWindow ??= 0.04;

  cfg.controls ||= {};
  const jogControl = cfg.controls && cfg.controls.jog;
  if (jogControl && typeof jogControl === 'object') {
    jogControl.deltaCodec = String(jogControl.deltaCodec || jogControl.codec || 'relative7');
    jogControl.defaultLane = String(jogControl.defaultLane || 'wheel_side');
  }
  return cfg;
}
