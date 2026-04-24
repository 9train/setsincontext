import {
  getBootAccessTokens,
  getBootRoom,
  getBootSessionMetadata,
} from './bootstrap-shared.js';

const INVITE_RETRY_MS = 1600;

function buildInviteEndpoint(room, hostAccessToken) {
  const url = new URL(`/api/sessions/${encodeURIComponent(room)}/invite`, window.location.origin);
  url.searchParams.set('hostAccess', hostAccessToken);
  return url.toString();
}

function resolveInviteURL(joinUrlPath) {
  try {
    return new URL(joinUrlPath, window.location.origin).toString();
  } catch {
    return '';
  }
}

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createPanelMarkup({
  tone = 'pending',
  room,
  title = '',
  inviteURL = '',
  statusText,
  canCopy = false,
}) {
  const safeTitle = escapeHTML(title || room);
  const safeRoom = escapeHTML(room);
  const safeInviteURL = escapeHTML(
    inviteURL || 'Waiting for the runtime to prepare the private viewer invite...',
  );
  const safeStatusText = escapeHTML(statusText);
  const hintText =
    tone === 'ready'
      ? 'Room key alone will be denied. Share this invite link with viewers instead.'
      : tone === 'error'
        ? safeStatusText
        : `${safeStatusText} Room key alone will be denied for this private session.`;

  return `
    <div class="private-invite-kicker">Private Viewer Invite</div>
    <strong class="private-invite-title">${safeTitle}</strong>
    <p class="private-invite-copy">${hintText}</p>
    <div class="private-invite-meta">
      <span>Room</span>
      <strong>${safeRoom}</strong>
    </div>
    <code class="private-invite-url">${safeInviteURL}</code>
    <div class="private-invite-actions">
      <button type="button" class="private-invite-copy-button" ${canCopy && inviteURL ? '' : 'disabled'}>
        Copy invite link
      </button>
      <span class="private-invite-status">${safeStatusText}</span>
    </div>
  `;
}

function renderPanel(panel, model) {
  panel.hidden = false;
  panel.classList.add('is-visible');
  panel.classList.toggle('is-ready', model.tone === 'ready');
  panel.classList.toggle('is-error', model.tone === 'error');
  panel.innerHTML = createPanelMarkup(model);

  const copyButton = panel.querySelector('.private-invite-copy-button');
  if (!copyButton || !model.inviteURL) return;

  copyButton.addEventListener('click', async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(model.inviteURL);
        const statusEl = panel.querySelector('.private-invite-status');
        if (statusEl) statusEl.textContent = 'Invite link copied.';
        return;
      }
    } catch {}

    const statusEl = panel.querySelector('.private-invite-status');
    if (statusEl) {
      statusEl.textContent = 'Clipboard is unavailable here. Copy the invite link manually.';
    }
  });
}

export function installPrivateInvitePanel() {
  const panel = document.getElementById('privateInvitePanel');
  if (!panel) return null;

  const room = getBootRoom();
  const { visibility } = getBootSessionMetadata();
  const { hostAccessToken } = getBootAccessTokens();

  if (visibility !== 'private') {
    panel.hidden = true;
    return null;
  }

  if (!hostAccessToken) {
    renderPanel(panel, {
      tone: 'error',
      room,
      statusText:
        'This host page was opened without a private host token. Start from the website host link again to reveal the private viewer invite.',
    });
    return null;
  }

  let stopped = false;
  let settled = false;

  async function pollInvite() {
    if (stopped || settled) return;

    renderPanel(panel, {
      tone: 'pending',
      room,
      statusText: 'Waiting for the host session to register with the runtime.',
    });

    try {
      const response = await fetch(buildInviteEndpoint(room, hostAccessToken));
      const payload = await response.json().catch(() => null);

      if (
        response.ok &&
        payload &&
        typeof payload === 'object' &&
        typeof payload.joinUrlPath === 'string'
      ) {
        settled = true;
        renderPanel(panel, {
          tone: 'ready',
          room,
          title: typeof payload.title === 'string' ? payload.title : '',
          inviteURL: resolveInviteURL(payload.joinUrlPath),
          statusText: 'Private invite ready to share.',
          canCopy: true,
        });
        return;
      }

      if (response.status === 403) {
        settled = true;
        renderPanel(panel, {
          tone: 'error',
          room,
          statusText:
            'This host page no longer has valid access to reveal the private viewer invite. Re-open the website-generated host link and try again.',
        });
        return;
      }
    } catch {
      renderPanel(panel, {
        tone: 'pending',
        room,
        statusText: 'Runtime connection hiccup while loading the private viewer invite. Retrying...',
      });
    }

    if (!stopped && !settled) {
      window.setTimeout(pollInvite, INVITE_RETRY_MS);
    }
  }

  void pollInvite();

  return {
    destroy() {
      stopped = true;
    },
  };
}
