// /src/bootstrap-shared.js
// Small shared startup helpers for the canonical host/viewer pages.

import { getWSURL } from './roles.js';
import { getRuntimeApp } from './runtime/app-bridge.js';

export const OFFICIAL_WS_URL = 'wss://ws.setsoutofcontext.com';
const SESSION_META_KEYS = ['mode', 'visibility', 'sessionTitle', 'hostName'];

export function getBootRoom() {
  const qs = new URLSearchParams(location.search);
  return qs.get('room') || 'default';
}

export function getBootSessionMetadata() {
  const qs = new URLSearchParams(location.search);
  const metadata = {};
  for (const key of SESSION_META_KEYS) {
    const value = qs.get(key);
    if (value == null || value === '') continue;
    metadata[key] = value;
  }
  return metadata;
}

export function getBootAccessTokens() {
  const qs = new URLSearchParams(location.search);
  const accessToken = qs.get('access') || '';
  const hostAccessToken = qs.get('hostAccess') || '';

  return {
    accessToken: accessToken.trim() || null,
    hostAccessToken: hostAccessToken.trim() || null,
  };
}

export function resolveBootWSURL({ defaultWSURL } = {}) {
  const qs = new URLSearchParams(location.search);
  const url =
    qs.get('ws') ||
    ((typeof window !== 'undefined' && window.WS_URL && String(window.WS_URL)) || '') ||
    defaultWSURL ||
    getWSURL();

  try {
    if (typeof window !== 'undefined') window.WS_URL = url;
  } catch {}

  return url;
}

export function applyBootRole(role) {
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.add(role);
    document.body.dataset.role = role;
  }
  try {
    if (typeof window !== 'undefined') window.FLX_ROLE = role;
  } catch {}
  return role;
}

export function installWSStatus(statusId = 'wsStatus') {
  const runtimeApp = getRuntimeApp();
  const el = typeof document !== 'undefined' ? document.getElementById(statusId) : null;
  const setWSStatus = (status) => {
    if (el) el.textContent = 'WS: ' + status;
  };
  runtimeApp?.setWSStatusHandler(setWSStatus);
  return setWSStatus;
}

export function initSharedPageBoot({
  role,
  defaultWSURL = OFFICIAL_WS_URL,
  wsStatusId = 'wsStatus',
} = {}) {
  return {
    role: applyBootRole(role),
    wsURL: resolveBootWSURL({ defaultWSURL }),
    setWSStatus: installWSStatus(wsStatusId),
  };
}
