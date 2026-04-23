// src/recorder_ui.js
// Tiny timeline for FLXRec events + loop in/out + screen capture (.webm).

let ui, bar, inHandle, outHandle, playBtn, stopBtn, loopChk, capBtn, capStopBtn, durEl, speedSel;
let stream, rec, chunks = [];
let loopIn = 0, loopOut = 0, duration = 0;

function css() {
  const s = document.createElement('style');
  s.textContent = `
  #recbar-wrap {
    position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 99990;
    background:var(--panel-strong, rgba(24, 24, 21, .92));
    border:1px solid var(--panel-border, rgba(255,255,255,.1));
    color:var(--ink, #f3efe7);
    border-radius:var(--panel-radius, 24px);
    padding:10px 12px;
    box-shadow:0 14px 40px rgba(0,0,0,.32);
    backdrop-filter:var(--surface-blur, blur(24px));
    font: 12px/1.4 var(--font-ui, system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif);
  }
  #recbar-head { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
  #recbar { position:relative; height: 36px; background:rgba(255,255,255,.03); border:1px solid var(--panel-border, rgba(255,255,255,.1)); border-radius:16px; }
  .mark { position:absolute; top:0; bottom:0; width:2px; background:rgba(156,216,255,.38); }
  .handle { position:absolute; top:0; bottom:0; width:8px; background:var(--lit, #9cd8ff); box-shadow:0 0 14px rgba(156,216,255,.18); cursor:ew-resize; transform: translateX(-4px); }
  .range { position:absolute; top:0; bottom:0; background:rgba(156,216,255,.16); pointer-events:none; }
  #recbar-ctl { display:flex; align-items:center; gap:10px; margin-top:6px; }
  `;
  document.head.appendChild(s);
}

function buildUI() {
  if (ui) return;
  css();
  ui = document.createElement('div');
  ui.id = 'recbar-wrap';
  ui.innerHTML = `
    <div id="recbar-head">
      <strong>Recorder Timeline</strong>
      <span id="recbar-dur" style="opacity:.85">—</span>
      <label style="margin-left:auto;display:flex;align-items:center;gap:6px;">Speed
        <select id="recbar-speed">
          <option value="0.5">0.5×</option>
          <option value="0.75">0.75×</option>
          <option value="1" selected>1×</option>
          <option value="1.5">1.5×</option>
          <option value="2">2×</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:6px;">
        <input id="recbar-loop" type="checkbox" checked /> Loop
      </label>
      <button id="recbar-close">×</button>
    </div>
    <div id="recbar">
      <div class="range" id="recbar-range"></div>
      <div class="handle" id="recbar-in"  style="left:0%"></div>
      <div class="handle" id="recbar-out" style="left:100%"></div>
    </div>
    <div id="recbar-ctl">
      <button id="recbar-play">Play</button>
      <button id="recbar-stop">Stop</button>
      <button id="recbar-cap">Start Capture</button>
      <button id="recbar-cap-stop" disabled>Stop & Save</button>
    </div>
  `;
  document.body.appendChild(ui);
  bar = ui.querySelector('#recbar');
  inHandle = ui.querySelector('#recbar-in');
  outHandle = ui.querySelector('#recbar-out');
  playBtn = ui.querySelector('#recbar-play');
  stopBtn = ui.querySelector('#recbar-stop');
  loopChk = ui.querySelector('#recbar-loop');
  capBtn = ui.querySelector('#recbar-cap');
  capStopBtn = ui.querySelector('#recbar-cap-stop');
  durEl = ui.querySelector('#recbar-dur');
  speedSel = ui.querySelector('#recbar-speed');

  ui.querySelector('#recbar-close').onclick = () => ui.style.display = 'none';

  const rangeEl = ui.querySelector('#recbar-range');
  function updateRange() {
    rangeEl.style.left  = (loopIn * 100) + '%';
    rangeEl.style.right = ((1 - loopOut) * 100) + '%';
  }

  function dragHandle(h, setPct) {
    let moving = false;
    h.onmousedown = (e) => {
      moving = true; e.preventDefault();
      const rect = bar.getBoundingClientRect();
      const onMove = (ev) => {
        if (!moving) return;
        const pct = Math.min(1, Math.max(0, (ev.clientX - rect.left)/rect.width));
        setPct(pct);
        updateRange();
      };
      const onUp = () => { moving=false; window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp); };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };
  }
  dragHandle(inHandle,  p => { loopIn  = Math.min(p, loopOut); inHandle.style.left = (loopIn*100)+'%'; });
  dragHandle(outHandle, p => { loopOut = Math.max(p, loopIn); outHandle.style.left= (loopOut*100)+'%'; });

  playBtn.onclick = () => {
    import('./recorder.js').then(({ recorder:FLXRec })=>{
      const span = Math.max(0, loopOut - loopIn);
      if (span <= 0 || !FLXRec.events.length) return;
      const startMs = loopIn * duration;
      const endMs   = loopOut * duration;
      const subset  = FLXRec.events.filter(e => e.t >= startMs && e.t <= endMs);
      if (!subset.length) return;
      // Temporary play: reload a trimmed slice without carrying stale timing aliases.
      const temp = {
        speed: Number(speedSel.value || 1),
        events: subset.map((e, index) => ({
          seq: index + 1,
          t: e.t - startMs,
          capturedAt: e.capturedAt,
          sourceTimestamp: e.sourceTimestamp,
          replayInfo: e.replayInfo || e.info,
          event: e.event || e.logEvent,
        })),
      };
      FLXRec.stopPlayback?.();
      FLXRec.loadFromObject(temp);
      FLXRec.play({ speed: temp.speed, loop: loopChk.checked });
    });
  };
  stopBtn.onclick = () => import('./recorder.js').then(m=>m.recorder.stopPlayback());

  capBtn.onclick = async () => {
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 }, audio: false });
      rec = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });
      chunks = [];
      rec.ondataavailable = (e)=>{ if(e.data.size>0) chunks.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'flx6-take.webm';
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        stream.getTracks().forEach(t=>t.stop());
        stream = null; rec = null; chunks = [];
      };
      rec.start();
      capBtn.disabled = true; capStopBtn.disabled = false;
    } catch (e) {
      console.warn('Screen capture failed:', e);
    }
  };
  capStopBtn.onclick = () => {
    if (rec && rec.state !== 'inactive') rec.stop();
    capBtn.disabled = false; capStopBtn.disabled = true;
  };

  update();
  updateRange();
}

function fmt(ms){ const s=Math.round(ms/100)/10; return `${s}s`; }

function describeTimelineEvent(entry, index) {
  const logEvent = entry && (entry.event || entry.logEvent);
  if (logEvent && typeof logEvent === 'object') {
    return logEvent.summary || logEvent.recentSummary || `Event ${index + 1}`;
  }
  const info = entry && entry.info || {};
  const interaction = String(info.type || info.interaction || 'unknown').toUpperCase();
  const code = info.controller ?? info.d1 ?? '?';
  const channel = info.ch ?? '?';
  return `${interaction} ${channel}:${code}`;
}

function paintMarkers() {
  // clear existing marks
  bar.querySelectorAll('.mark').forEach(n=>n.remove());
  import('./recorder.js').then(({ recorder:FLXRec })=>{
    const ev = FLXRec.events;
    if (!ev.length) return;
    const dur = ev[ev.length-1].t || 0;
    ev.forEach((e, index)=>{
      const m = document.createElement('div');
      m.className = 'mark';
      m.style.left = ( (e.t/dur) * 100 ) + '%';
      const markerLabel = describeTimelineEvent(e, index);
      m.title = markerLabel;
      m.setAttribute('aria-label', markerLabel);
      bar.appendChild(m);
    });
  });
}

function update() {
  import('./recorder.js').then(({ recorder:FLXRec })=>{
    const ev = FLXRec.events;
    duration = ev.length ? (ev[ev.length-1].t || 0) : 0;
    if (duration <= 0) { durEl.textContent = '—'; loopIn = 0; loopOut = 1; }
    else {
      durEl.textContent = `duration: ${fmt(duration)}`;
      if (loopOut === 0) loopOut = 1;
    }
    inHandle.style.left  = (loopIn*100)+'%';
    outHandle.style.left = (loopOut*100)+'%';
    paintMarkers();
  });
}

export function show(){ buildUI(); ui.style.display='block'; update(); }
export function hide(){ if (ui) ui.style.display='none'; }
export function toggle(){ if (!ui || ui.style.display==='none') show(); else hide(); }
export function refresh(){ if (ui && ui.style.display!=='none') update(); }

if (typeof window!=='undefined') window.RECUI = { show, hide, toggle, refresh };
