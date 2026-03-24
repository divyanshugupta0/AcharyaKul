/* ═══════════════════════════════════════════════════════
   AcharyaKul Teacher – Live Studio (Zoom-like)
   ═══════════════════════════════════════════════════════ */

const socket = io({ transports: ['websocket', 'polling'] });

// ── Tab routing ─────────────────────────────────────────
const tabs = Array.from(document.querySelectorAll('.side-btn'));
const topLinks = Array.from(document.querySelectorAll('.top-link'));
const panels = Array.from(document.querySelectorAll('.panel'));
const jumpBtns = Array.from(document.querySelectorAll('[data-jump]'));

function setActiveTab(name) {
  tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  topLinks.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  panels.forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  document.body.classList.toggle('studio-full', name === 'studio');
}
tabs.forEach(b => b.addEventListener('click', () => setActiveTab(b.dataset.tab)));
topLinks.forEach(b => b.addEventListener('click', () => setActiveTab(b.dataset.tab)));
jumpBtns.forEach(b => b.addEventListener('click', () => setActiveTab(b.dataset.jump)));

// ── Gate / Auth ──────────────────────────────────────────
const gate = document.getElementById('teacherGate');
const shell = document.getElementById('teacherShell');
const teacherIdInput = document.getElementById('teacherIdInput');
const teacherIdBtn = document.getElementById('teacherIdBtn');
const teacherIdLabel = document.getElementById('teacherIdLabel');
const changeTeacher = document.getElementById('changeTeacher');
const logoutBtn = document.getElementById('logoutBtn');
const topbarAvatar = document.getElementById('topbarAvatar');
const topbarNameEl = document.getElementById('topbarName');
const teacherLiveLabel = document.getElementById('teacherLiveLabel');
const mobileLiveLabel = document.getElementById('mobileLiveLabel');

let teacherId = localStorage.getItem('olms-teacher-id') || '';

function openGate() { gate.classList.add('show'); shell.style.display = 'none'; }
function closeGate() { gate.classList.remove('show'); shell.style.display = ''; }

function setTeacherId(id) {
  teacherId = id.trim();
  if (!teacherId) { openGate(); return; }
  localStorage.setItem('olms-teacher-id', teacherId);
  teacherIdLabel.textContent = `ID: ${teacherId}`;
  if (topbarAvatar) topbarAvatar.textContent = teacherId.slice(0, 2).toUpperCase();
  if (topbarNameEl) topbarNameEl.textContent = teacherId;
  closeGate();
  loadAll().catch(() => { });
}

teacherIdBtn.addEventListener('click', () => setTeacherId(teacherIdInput.value));
teacherIdInput.addEventListener('keydown', e => { if (e.key === 'Enter') setTeacherId(teacherIdInput.value); });
changeTeacher.addEventListener('click', () => { localStorage.removeItem('olms-teacher-id'); teacherIdInput.value = ''; openGate(); });
if (logoutBtn) logoutBtn.addEventListener('click', () => { localStorage.removeItem('olms-teacher-id'); location.reload(); });

// ── Mobile sidebar ───────────────────────────────────────
const hamburgerBtn = document.getElementById('hamburgerBtn');
const sidebar = document.querySelector('.sidebar');
let sidebarOverlay = null;

function createOverlay() {
  if (sidebarOverlay) return;
  sidebarOverlay = document.createElement('div');
  sidebarOverlay.className = 'sidebar-overlay';
  document.body.appendChild(sidebarOverlay);
  sidebarOverlay.addEventListener('click', closeSidebar);
}
function openSidebar() { createOverlay(); sidebar.classList.add('open'); sidebarOverlay.classList.add('show'); }
function closeSidebar() { sidebar.classList.remove('open'); if (sidebarOverlay) sidebarOverlay.classList.remove('show'); }
if (hamburgerBtn) hamburgerBtn.addEventListener('click', () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar());

// ── Helpers ──────────────────────────────────────────────
function escapeHtml(v) {
  return String(v || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function formatShortTime(v) {
  if (!v) return '--';
  const d = new Date(v);
  return isNaN(d) ? '--' : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
function headers() { return { 'Content-Type': 'application/json', 'x-teacher-id': teacherId }; }
async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ── Toast ─────────────────────────────────────────────────
const toastArea = document.getElementById('toastArea');
function showToast(msg, type = '') {
  if (!toastArea) return;
  const t = document.createElement('div');
  t.className = `toast${type ? ' ' + type : ''}`;
  t.textContent = msg;
  toastArea.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── RTC config ───────────────────────────────────────────
const rtcConfig = { iceServers: [] };
let rtcReady = null;
async function loadRtcConfig() {
  if (rtcReady) return rtcReady;
  rtcReady = fetch('/rtc-config').then(r => r.json()).then(d => {
    if (d && Array.isArray(d.iceServers)) rtcConfig.iceServers = d.iceServers;
  }).catch(() => { });
  return rtcReady;
}

// ── Stream & peer state ──────────────────────────────────
let cameraStream = null;
let screenStream = null;
let liveStream = null;
let pipCameraStream = null;
let liveOn = false;
let liveClassId = '';
let micEnabled = true;
let camEnabled = true;
let streamMode = 'camera'; // 'camera' | 'screen'
let sessionStart = null;
let timerInterval = null;
let mediaRecorder = null;
let recordChunks = [];
let wbActive = false;
let wbDrawing = false;
let wbTool = 'pen';

const peers = new Map(); // studentId → RTCPeerConnection
const participants = new Map(); // studentId → { name, handRaised }

// ── DOM elements ─────────────────────────────────────────
const teacherVideo = document.getElementById('teacherVideo');
const pipCamera = document.getElementById('pipCamera');
const canvasPlaceholder = document.getElementById('canvasPlaceholder');
const liveToggle = document.getElementById('liveToggle');
const liveToggleLabel = document.getElementById('liveToggleLabel');
const screenShareToggle = document.getElementById('screenShareToggle');
const screenShareIcon = document.getElementById('screenShareIcon');
const screenShareLabel = document.getElementById('screenShareLabel');
const micBtn = document.getElementById('micBtn');
const micIcon = document.getElementById('micIcon');
const camBtn = document.getElementById('camBtn');
const camIcon = document.getElementById('camIcon');
const liveStatus = document.getElementById('liveStatus');
const liveClassSelect = document.getElementById('liveClassSelect');
const classModeSelect = document.getElementById('classModeSelect');
const classModeStatus = document.getElementById('classModeStatus');
const modeButtons = Array.from(document.querySelectorAll('.mode-btn'));
const participantList = document.getElementById('participantList');
const participantCount = document.getElementById('participantCount');
const studentTiles = document.getElementById('studentTiles');
const studioClassName = document.getElementById('studioClassName');
const raisedHandsSection = document.getElementById('raisedHandsSection');
const raisedHandList = document.getElementById('raisedHandList');
const toggleHostPanel = document.getElementById('toggleHostPanel');
const recBadge = document.getElementById('recBadge');
const recordBtn = document.getElementById('recordBtn');
const recordIcon = document.getElementById('recordIcon');
const recordLabel = document.getElementById('recordLabel');
const sessionTimer = document.getElementById('sessionTimer');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const wbToggleBtn = document.getElementById('wbToggleBtn');
const wbToolbar = document.getElementById('wbToolbar');
const whiteboardCanvas = document.getElementById('whiteboardCanvas');
const wbPen = document.getElementById('wbPen');
const wbEraser = document.getElementById('wbEraser');
const wbClear = document.getElementById('wbClear');
const wbColor = document.getElementById('wbColor');
const wbSize = document.getElementById('wbSize');
const chatTabBtn = document.getElementById('chatTabBtn');
const studentsTabBtn = document.getElementById('studentsTabBtn');
const chatBody = document.getElementById('chatBody');
const studentsBody = document.getElementById('studentsBody');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const chatToggleBtn = document.getElementById('chatToggleBtn');
const studioPanelAside = document.getElementById('studioPanelAside');
const endCallBtn = document.getElementById('endCallBtn');
const netLabel = document.getElementById('netLabel');
const netBars = [document.getElementById('nb1'), document.getElementById('nb2'), document.getElementById('nb3'), document.getElementById('nb4')];

// ── Placeholder toggle ───────────────────────────────────
function updatePlaceholder() {
  const has = teacherVideo && teacherVideo.srcObject;
  canvasPlaceholder.classList.toggle('hidden', !!has);
}
if (teacherVideo) {
  teacherVideo.addEventListener('loadedmetadata', updatePlaceholder);
  teacherVideo.addEventListener('emptied', updatePlaceholder);
}

// ── Session timer ────────────────────────────────────────
function startTimer() {
  sessionStart = Date.now();
  sessionTimer.classList.remove('hidden');
  timerInterval = setInterval(() => {
    const s = Math.floor((Date.now() - sessionStart) / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    sessionTimer.textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }, 1000);
}
function stopTimer() {
  clearInterval(timerInterval);
  sessionTimer.classList.add('hidden');
  sessionTimer.textContent = '00:00';
}

// ── Network quality ──────────────────────────────────────
let netPollInterval = null;
async function pollNetworkQuality() {
  if (!peers.size) { setNetQuality(4); return; }
  let rtt = 0, count = 0;
  for (const pc of peers.values()) {
    try {
      const stats = await pc.getStats();
      stats.forEach(s => {
        if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.currentRoundTripTime != null) {
          rtt += s.currentRoundTripTime * 1000; count++;
        }
      });
    } catch (_) { }
  }
  if (!count) { setNetQuality(4); return; }
  const avg = rtt / count;
  if (avg < 80) setNetQuality(4, 'active');
  else if (avg < 150) setNetQuality(3, 'warn');
  else if (avg < 300) setNetQuality(2, 'warn');
  else setNetQuality(1, 'bad');
}
function setNetQuality(bars, cls = 'active') {
  const labels = ['Poor', 'Weak', 'Fair', 'Good', 'Excellent'];
  netBars.forEach((b, i) => {
    b.className = 'net-bar' + (i < bars ? ' ' + cls : '');
  });
  if (netLabel) netLabel.textContent = labels[bars] || 'Good';
}

// ── Adaptive bitrate for rough networks ──────────────────
async function applyAdaptiveBitrate(pc) {
  try {
    const senders = pc.getSenders();
    for (const sender of senders) {
      if (!sender.track) continue;
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) {
        params.encodings = [{}];
      }
      if (sender.track.kind === 'video') {
        // Progressive quality tiers
        params.encodings[0].maxBitrate = 800000;  // 800 kbps max
        params.encodings[0].scaleResolutionDownBy = 1;
        params.encodings[0].priority = 'high';
      } else if (sender.track.kind === 'audio') {
        params.encodings[0].maxBitrate = 64000;
        params.encodings[0].priority = 'high';
        params.encodings[0].networkPriority = 'high';
      }
      await sender.setParameters(params).catch(() => { });
    }
  } catch (_) { }
}

// ── Camera / Mic ─────────────────────────────────────────
async function startCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 }
    });
    return cameraStream;
  } catch (e) {
    showToast('Camera/mic permission denied.', 'error');
    return null;
  }
}
function stopCamera() {
  cameraStream?.getTracks().forEach(t => t.stop());
  cameraStream = null;
}

// ── Screen share ─────────────────────────────────────────
async function startScreen() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always', frameRate: { ideal: 15 } },
      audio: true
    });
    const merged = new MediaStream();
    const vid = screenStream.getVideoTracks()[0];
    if (vid) { merged.addTrack(vid); vid.onended = () => stopScreenShare(false); }

    if (!cameraStream) await startCamera();
    const mic = cameraStream?.getAudioTracks()[0];
    const scra = screenStream.getAudioTracks()[0];
    if (scra && mic) {
      const ctx = new AudioContext();
      const dst = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(new MediaStream([scra])).connect(dst);
      ctx.createMediaStreamSource(new MediaStream([mic])).connect(dst);
      merged.addTrack(dst.stream.getAudioTracks()[0]);
    } else if (mic) merged.addTrack(mic);
    else if (scra) merged.addTrack(scra);

    // PiP camera
    if (cameraStream) {
      pipCameraStream = new MediaStream(cameraStream.getVideoTracks());
      pipCamera.srcObject = pipCameraStream;
      pipCamera.classList.remove('hidden');
    }
    return merged;
  } catch (e) {
    showToast('Screen share cancelled.', 'warning');
    return null;
  }
}
function stopScreenShare(autoResume) {
  screenStream?.getTracks().forEach(t => t.stop());
  screenStream = null;
  pipCamera.classList.add('hidden');
  pipCamera.srcObject = null;
  screenShareToggle.classList.remove('screen-active');
  screenShareIcon.textContent = 'screen_share';
  screenShareLabel.textContent = 'Share Screen';
  streamMode = 'camera';
  if (liveOn && autoResume !== false) {
    if (cameraStream) setLiveStream(cameraStream, 'camera');
    else startCamera().then(s => s && setLiveStream(s, 'camera'));
  }
}

// ── Live stream management ───────────────────────────────
function setLiveStream(stream, mode) {
  liveStream = stream; streamMode = mode;
  teacherVideo.srcObject = stream;
  updatePlaceholder();
  if (!liveOn) return;
  peers.forEach(async pc => {
    for (const track of stream.getTracks()) {
      const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
      if (sender) await sender.replaceTrack(track).catch(() => { });
      else pc.addTrack(track, stream);
    }
    applyAdaptiveBitrate(pc);
  });
}

// ── Peer connection factory ──────────────────────────────
async function createOfferPeer(studentId) {
  await loadRtcConfig();
  const pc = new RTCPeerConnection({
    ...rtcConfig,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 10
  });
  liveStream.getTracks().forEach(t => pc.addTrack(t, liveStream));
  applyAdaptiveBitrate(pc);

  pc.onicecandidate = ev => {
    if (ev.candidate)
      socket.emit('ice-candidate', { to: studentId, candidate: ev.candidate, classId: liveClassId });
  };
  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected'].includes(pc.connectionState)) {
      peers.delete(studentId);
      removeParticipant(studentId);
    }
  };
  peers.set(studentId, pc);

  const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
  await pc.setLocalDescription(offer);
  socket.emit('offer', { to: studentId, sdp: offer, classId: liveClassId });
}

function closePeers() { peers.forEach(p => p.close()); peers.clear(); }

// ── Participant management ───────────────────────────────
function addParticipant(id, name) {
  participants.set(id, { name: name || id, handRaised: false });
  renderParticipants();
}
function removeParticipant(id) {
  participants.delete(id);
  const tile = document.getElementById(`tile-${id}`);
  tile?.remove();
  renderParticipants();
}
function renderParticipants() {
  const count = participants.size;
  participantCount.textContent = count;
  if (!count) {
    participantList.innerHTML = '<div class="status">No learners yet.</div>';
    raisedHandsSection.classList.add('hidden');
    return;
  }
  participantList.innerHTML = '';
  let hands = 0;
  participants.forEach((p, id) => {
    const el = document.createElement('div');
    el.className = 'participant-item';
    el.innerHTML = `
      <div class="participant-avatar">${p.name.slice(0, 2).toUpperCase()}</div>
      <div class="participant-name">${escapeHtml(p.name)}</div>
      ${p.handRaised ? '<span class="hand-badge">✋</span>' : ''}`;
    participantList.appendChild(el);
    if (p.handRaised) hands++;
  });
  if (hands) {
    raisedHandsSection.classList.remove('hidden');
    raisedHandList.innerHTML = '';
    participants.forEach((p, id) => {
      if (!p.handRaised) return;
      const el = document.createElement('div');
      el.style.cssText = 'font-size:12px;color:#ffb300;padding:3px 0;';
      el.textContent = `✋ ${p.name}`;
      raisedHandList.appendChild(el);
    });
  } else raisedHandsSection.classList.add('hidden');
}

// ── LiveStatus UI ────────────────────────────────────────
function setLiveStatusUI(on) {
  liveOn = on;
  liveToggle.classList.toggle('active-live', on);
  liveToggleLabel.textContent = on ? 'Stop Live' : 'Start Live';
  liveStatus.textContent = on ? (streamMode === 'screen' ? 'Sharing screen' : 'Live now') : 'Camera off';
  liveStatus.classList.toggle('on', on);
  const pill = on ? `⬤ LIVE: ${getClassName(liveClassId)}` : '⬤ Offline';
  teacherLiveLabel.textContent = pill;
  teacherLiveLabel.classList.toggle('on', on);
  if (mobileLiveLabel) { mobileLiveLabel.textContent = pill; mobileLiveLabel.classList.toggle('on', on); }
  if (studioClassName) studioClassName.textContent = on ? getClassName(liveClassId) : '-- No Class Selected --';
}

// ── Start / Stop live ────────────────────────────────────
async function startLive() {
  const classId = liveClassSelect.value;
  if (!classId) { showToast('Select a class first.', 'warning'); return; }
  await loadRtcConfig();
  let stream = cameraStream || await startCamera();
  if (!stream) return;
  liveClassId = classId;
  setLiveStream(stream, 'camera');
  setLiveStatusUI(true);
  socket.emit('teacher-join', { classId, teacherId });
  startTimer();
  netPollInterval = setInterval(pollNetworkQuality, 5000);
  setNetQuality(4);
  showToast('You are live! 🎙️', 'success');
}

async function stopLive() {
  setLiveStatusUI(false);
  socket.emit('teacher-leave', { classId: liveClassId });
  closePeers();
  if (screenStream) stopScreenShare(false);
  stopCamera();
  if (teacherVideo) teacherVideo.srcObject = null;
  if (pipCamera) { pipCamera.srcObject = null; pipCamera.classList.add('hidden'); }
  liveStream = null; liveClassId = '';
  participants.clear();
  renderParticipants();
  updatePlaceholder();
  stopTimer();
  clearInterval(netPollInterval);
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  showToast('Session ended.', '');
}

liveToggle.addEventListener('click', () => liveOn ? stopLive() : startLive());
if (endCallBtn) endCallBtn.addEventListener('click', () => { if (liveOn) stopLive(); });

// ── Mic toggle ───────────────────────────────────────────
micBtn.addEventListener('click', () => {
  micEnabled = !micEnabled;
  const tracks = liveStream?.getAudioTracks() || cameraStream?.getAudioTracks() || [];
  tracks.forEach(t => t.enabled = micEnabled);
  micIcon.textContent = micEnabled ? 'mic' : 'mic_off';
  micBtn.classList.toggle('muted', !micEnabled);
  showToast(micEnabled ? 'Mic on' : 'Mic muted', micEnabled ? 'success' : 'warning');
});

// ── Camera toggle ─────────────────────────────────────────
camBtn.addEventListener('click', () => {
  camEnabled = !camEnabled;
  const tracks = cameraStream?.getVideoTracks() || liveStream?.getVideoTracks() || [];
  tracks.forEach(t => t.enabled = camEnabled);
  camIcon.textContent = camEnabled ? 'videocam' : 'videocam_off';
  camBtn.classList.toggle('muted', !camEnabled);
  showToast(camEnabled ? 'Camera on' : 'Camera off', camEnabled ? 'success' : 'warning');
});

// ── Screen share ─────────────────────────────────────────
screenShareToggle.addEventListener('click', async () => {
  if (streamMode === 'screen') {
    stopScreenShare(true);
    return;
  }
  if (!liveOn) {
    const classId = liveClassSelect.value;
    if (!classId) { showToast('Select a class first.', 'warning'); return; }
    await loadRtcConfig();
    const stream = await startScreen();
    if (!stream) return;
    liveClassId = classId;
    setLiveStream(stream, 'screen');
    setLiveStatusUI(true);
    socket.emit('teacher-join', { classId, teacherId });
    startTimer();
    netPollInterval = setInterval(pollNetworkQuality, 5000);
  } else {
    const stream = await startScreen();
    if (!stream) return;
    setLiveStream(stream, 'screen');
  }
  streamMode = 'screen';
  screenShareIcon.textContent = 'stop_screen_share';
  screenShareLabel.textContent = 'Stop Share';
  screenShareToggle.classList.add('screen-active');
  liveStatus.textContent = 'Sharing screen';
  showToast('Screen sharing started', 'success');
});

// ── Whiteboard ────────────────────────────────────────────
let wbCtx = null;
wbToggleBtn.addEventListener('click', () => {
  wbActive = !wbActive;
  whiteboardCanvas.classList.toggle('hidden', !wbActive);
  wbToolbar.classList.toggle('hidden', !wbActive);
  wbToggleBtn.classList.toggle('wb-active', wbActive);
  if (wbActive && !wbCtx) initWhiteboard();
});
function initWhiteboard() {
  const resize = () => {
    const stage = document.getElementById('videoStage');
    whiteboardCanvas.width = stage.offsetWidth;
    whiteboardCanvas.height = stage.offsetHeight;
  };
  resize();
  new ResizeObserver(resize).observe(document.getElementById('videoStage'));
  wbCtx = whiteboardCanvas.getContext('2d');
  wbCtx.lineCap = 'round';
  wbCtx.lineJoin = 'round';

  whiteboardCanvas.addEventListener('pointerdown', e => {
    wbDrawing = true;
    wbCtx.beginPath();
    wbCtx.moveTo(e.offsetX, e.offsetY);
    e.preventDefault();
  });
  whiteboardCanvas.addEventListener('pointermove', e => {
    if (!wbDrawing) return;
    if (wbTool === 'eraser') {
      wbCtx.clearRect(e.offsetX - 15, e.offsetY - 15, 30, 30);
    } else {
      wbCtx.strokeStyle = wbColor.value;
      wbCtx.lineWidth = Number(wbSize.value);
      wbCtx.lineTo(e.offsetX, e.offsetY);
      wbCtx.stroke();
    }
    e.preventDefault();
  });
  whiteboardCanvas.addEventListener('pointerup', () => { wbDrawing = false; });
  whiteboardCanvas.addEventListener('pointerleave', () => { wbDrawing = false; });
}
wbPen.addEventListener('click', () => {
  wbTool = 'pen'; wbPen.classList.add('active'); wbEraser.classList.remove('active');
});
wbEraser.addEventListener('click', () => {
  wbTool = 'eraser'; wbEraser.classList.add('active'); wbPen.classList.remove('active');
});
wbClear.addEventListener('click', () => {
  if (wbCtx) wbCtx.clearRect(0, 0, whiteboardCanvas.width, whiteboardCanvas.height);
});

// ── Recording ─────────────────────────────────────────────
recordBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    recordBtn.classList.remove('rec-active');
    recordIcon.textContent = 'fiber_manual_record';
    recordLabel.textContent = 'Record';
    recBadge.classList.add('hidden');
    showToast('Recording saved.', 'success');
    return;
  }
  if (!liveStream) { showToast('Start live first.', 'warning'); return; }
  recordChunks = [];
  try {
    mediaRecorder = new MediaRecorder(liveStream, { mimeType: 'video/webm;codecs=vp9,opus' });
  } catch (_) {
    try { mediaRecorder = new MediaRecorder(liveStream); } catch (e2) {
      showToast('Recording not supported.', 'error'); return;
    }
  }
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `AK-Session-${Date.now()}.webm`; a.click();
    URL.revokeObjectURL(url);
  };
  mediaRecorder.start(1000);
  recordBtn.classList.add('rec-active');
  recordIcon.textContent = 'stop_circle';
  recordLabel.textContent = 'Stop Rec';
  recBadge.classList.remove('hidden');
  showToast('Recording started 🔴', '');
});

// ── Fullscreen ────────────────────────────────────────────
fullscreenBtn.addEventListener('click', () => {
  const el = document.getElementById('tab-studio');
  if (!document.fullscreenElement) el.requestFullscreen?.();
  else document.exitFullscreen?.();
});
document.addEventListener('fullscreenchange', () => {
  fullscreenBtn.querySelector('.material-symbols-outlined').textContent =
    document.fullscreenElement ? 'fullscreen_exit' : 'fullscreen';
});

// ── Toggle side panel ─────────────────────────────────────
toggleHostPanel.addEventListener('click', () => {
  document.body.classList.toggle('host-collapsed');
});

// ── Chat tab toggle ───────────────────────────────────────
chatToggleBtn?.addEventListener('click', () => {
  studioPanelAside.classList.toggle('mobile-open');
});
chatTabBtn?.addEventListener('click', () => {
  chatTabBtn.classList.add('active'); studentsTabBtn.classList.remove('active');
  chatBody.classList.remove('hidden'); studentsBody.classList.add('hidden');
});
studentsTabBtn?.addEventListener('click', () => {
  studentsTabBtn.classList.add('active'); chatTabBtn.classList.remove('active');
  studentsBody.classList.remove('hidden'); chatBody.classList.add('hidden');
  renderStudentsTab();
});

function renderStudentsTab() {
  if (!studentsBody) return;
  studentsBody.innerHTML = participants.size
    ? [...participants.values()].map(p =>
      `<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--studio-text)">
          <div class="participant-avatar">${p.name.slice(0, 2).toUpperCase()}</div>
          ${escapeHtml(p.name)}${p.handRaised ? ' ✋' : ''}
        </div>`
    ).join('')
    : '<div class="status">No connected students.</div>';
}

// ── Chat messaging ────────────────────────────────────────
function appendChatMsg(name, text, isSelf) {
  const el = document.createElement('div');
  el.className = `chat-message${isSelf ? ' chat-msg-self' : ''}`;
  el.innerHTML = `
    <div class="chat-msg-header">
      <span class="chat-msg-name">${escapeHtml(name)}</span>
      <span class="chat-msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
    <div class="chat-msg-text">${escapeHtml(text)}</div>`;
  if (chatBody.querySelector('.status')) chatBody.innerHTML = '';
  chatBody.appendChild(el);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function sendChat() {
  const text = chatInput?.value?.trim();
  if (!text || !liveOn) {
    if (!liveOn) showToast('Start live to send messages.', 'warning');
    return;
  }
  socket.emit('teacher-chat', { classId: liveClassId, teacherId, text });
  appendChatMsg(`${teacherId} (you)`, text, true);
  chatInput.value = '';
}
chatSendBtn?.addEventListener('click', sendChat);
chatInput?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });

// ── Socket events ─────────────────────────────────────────
socket.on('student-join', async (payload = {}) => {
  if (!liveOn || payload.classId !== liveClassId || !liveStream) return;
  const name = payload.studentName || payload.studentId;
  addParticipant(payload.studentId, name);
  try { await createOfferPeer(payload.studentId); }
  catch (e) { console.error('Offer failed', e); }
});

socket.on('answer', async (payload = {}) => {
  const pc = peers.get(payload.from);
  if (!pc || payload.classId !== liveClassId) return;
  try { await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp)); }
  catch (e) { console.error('Answer error', e); }
});

socket.on('ice-candidate', async (payload = {}) => {
  const pc = peers.get(payload.from);
  if (!pc || payload.classId !== liveClassId) return;
  try { if (payload.candidate) await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); }
  catch (_) { }
});

socket.on('student-left', payload => {
  const pc = peers.get(payload.studentId);
  pc?.close(); peers.delete(payload.studentId);
  removeParticipant(payload.studentId);
  const tile = document.getElementById(`tile-${payload.studentId}`);
  tile?.remove();
});

socket.on('teacher-replaced', payload => {
  if (payload.classId === liveClassId) { stopLive(); showToast('Session taken over by another instance.', 'warning'); }
});

socket.on('student-chat', payload => {
  if (payload.classId !== liveClassId) return;
  appendChatMsg(payload.name || 'Student', payload.text, false);
  // Switch to chat tab if on students tab
});

socket.on('student-hand', payload => {
  if (payload.classId !== liveClassId) return;
  const p = participants.get(payload.studentId);
  if (p) { p.handRaised = !p.handRaised; renderParticipants(); }
  showToast(`✋ ${payload.name || 'Student'} raised hand`, '');
});

// ── Class mode ────────────────────────────────────────────
classModeSelect.addEventListener('change', updateModeButtons);
modeButtons.forEach(btn => btn.addEventListener('click', async () => {
  const classId = classModeSelect.value;
  if (!classId) { classModeStatus.textContent = 'Select a class first.'; return; }
  classModeStatus.textContent = 'Updating...';
  try {
    const r = await fetch('/class-mode', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ classId, mode: btn.dataset.mode })
    });
    const d = await r.json();
    if (!r.ok) { classModeStatus.textContent = d.error; return; }
    classes = classes.map(c => c.id === classId ? d.class : c);
    updateModeButtons();
    showToast('Mode updated', 'success');
  } catch (_) { classModeStatus.textContent = 'Network error.'; }
}));
function updateModeButtons() {
  const sel = classModeSelect.value;
  const cls = classes.find(c => c.id === sel);
  const mode = cls?.mode || null;
  modeButtons.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  classModeStatus.textContent = cls
    ? `Mode: ${mode === 'human' ? 'Live Teacher' : 'AI Teaching'}`
    : 'Pick a class to update mode.';
}

liveClassSelect.addEventListener('change', () => {
  if (liveOn) { showToast('Stop live before switching class.', 'warning'); liveClassSelect.value = liveClassId; return; }
  const cls = classes.find(c => c.id === liveClassSelect.value);
  if (studioClassName) studioClassName.textContent = cls ? cls.subject : '-- No Class Selected --';
});

// ── Data loading ──────────────────────────────────────────
let classes = [], quizzes = [], assignments = [], quizSubmissions = [], assignmentSubmissions = [];
let teacherQuiz = [], teacherAssign = [];

async function loadClasses() {
  try {
    const d = await fetchJson('/classes', { headers: headers() });
    classes = d.classes || [];
    document.getElementById('heroClassCount').textContent = classes.length;
    renderClassOptions(); renderClasses();
  } catch (_) { document.getElementById('classList').innerHTML = '<div class="status">Unable to load classes.</div>'; }
}
async function loadQuizzes() {
  try {
    const d = await fetchJson('/quizzes?role=teacher', { headers: headers() });
    quizzes = d.quizzes || [];
    document.getElementById('heroQuizCount').textContent = quizzes.length;
    renderQuizzes();
  } catch (_) { }
}
async function loadAssignments() {
  try {
    const d = await fetchJson('/assignments', { headers: headers() });
    assignments = d.assignments || [];
    document.getElementById('heroAssignmentCount').textContent = assignments.length;
    renderAssignments();
  } catch (_) { }
}
async function loadSubmissions() {
  const p = new URLSearchParams({ limit: '500' });
  const rng = document.getElementById('submissionRange')?.value;
  if (rng) p.set('start', new Date(Date.now() - Number(rng) * 86400000).toISOString());
  const [qr, ar] = await Promise.allSettled([
    fetchJson(`/quiz-submissions?${p}`),
    fetchJson(`/assignment-submissions?${p}`)
  ]);
  quizSubmissions = qr.status === 'fulfilled' ? qr.value.submissions || [] : [];
  assignmentSubmissions = ar.status === 'fulfilled' ? ar.value.submissions || [] : [];
  buildTeacherLists(); updateHeroInsights(); renderSubmissions(); renderOverview();
  const lu = document.getElementById('lastUpdated');
  if (lu) lu.textContent = `Last updated: ${new Date().toLocaleString()}`;
}

function buildTeacherLists() {
  const qm = new Map(quizzes.map(q => [q.id, q]));
  teacherQuiz = quizSubmissions.filter(s => (s.answers || []).some(a => qm.has(a.quizId)));
  const am = new Map(assignments.map(a => [a.id, a]));
  teacherAssign = assignmentSubmissions.filter(s => am.has(s.assignmentId));
}
function updateHeroInsights() {
  const tot = teacherQuiz.reduce((a, s) => a + Number(s.total || 0), 0);
  const sc = teacherQuiz.reduce((a, s) => a + Number(s.score || 0), 0);
  document.getElementById('heroQuizSubmissions').textContent = teacherQuiz.length;
  document.getElementById('heroAssignmentSubmissions').textContent = teacherAssign.length;
  document.getElementById('heroAvgScore').textContent = tot ? Math.round(sc / tot * 100) + '%' : '0%';
  const studs = new Set([...teacherQuiz.map(s => s.studentName), ...teacherAssign.map(s => s.studentName)].filter(Boolean));
  document.getElementById('heroActiveLearners').textContent = studs.size;
}

function getClassName(id) {
  if (!id || id === 'all') return 'All classes';
  return classes.find(c => c.id === id)?.subject || 'Unknown';
}

function renderClassOptions() {
  const selects = ['classModeSelect', 'quizClass', 'assignmentClass', 'quizClassFilter', 'assignmentClassFilter', 'submissionClassFilter'];
  selects.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  liveClassSelect.innerHTML = '<option value="">Select class</option>';
  document.getElementById('quizClass').innerHTML = '<option value="all">All classes</option>';
  document.getElementById('assignmentClass').innerHTML = '<option value="all">All classes</option>';
  ['quizClassFilter', 'assignmentClassFilter', 'submissionClassFilter'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = '<option value="">All classes</option>';
  });
  if (!classes.length) { classModeSelect.innerHTML = '<option value="">No classes</option>'; return; }
  classes.forEach(c => {
    ['classModeSelect', 'quizClass', 'assignmentClass', 'quizClassFilter', 'assignmentClassFilter', 'submissionClassFilter'].forEach(id => {
      const el = document.getElementById(id); if (!el) return;
      const opt = document.createElement('option'); opt.value = c.id; opt.textContent = c.subject; el.appendChild(opt);
    });
    const lo = document.createElement('option'); lo.value = c.id; lo.textContent = c.subject; liveClassSelect.appendChild(lo);
  });
  if (liveClassId) liveClassSelect.value = liveClassId;
  updateModeButtons();
}

function renderClasses() {
  const el = document.getElementById('classList');
  if (!el) return;
  const s = document.getElementById('classSearch')?.value.trim().toLowerCase() || '';
  const f = s ? classes.filter(c => (`${c.subject} ${c.description}`).toLowerCase().includes(s)) : classes;
  el.innerHTML = f.length ? f.map(c => `<div class="library-item"><h4>${escapeHtml(c.subject)}</h4><p>${escapeHtml(c.description || 'No description.')}</p><span class="badge">Mode: ${c.mode === 'human' ? 'Live' : 'AI'}</span></div>`).join('') : '<div class="status">No classes.</div>';
}
function renderQuizzes() {
  const el = document.getElementById('quizList'); if (!el) return;
  const s = document.getElementById('quizSearch')?.value.trim().toLowerCase() || '';
  const cf = document.getElementById('quizClassFilter')?.value || '';
  let f = quizzes.filter(q => (!s || q.question.toLowerCase().includes(s)) && (!cf || (q.classId || 'all') === cf));
  el.innerHTML = f.length ? f.map(q => `<div class="library-item"><h4>${escapeHtml(q.question)}</h4><span class="badge">${escapeHtml(getClassName(q.classId))}</span></div>`).join('') : '<div class="status">No quizzes.</div>';
}
function renderAssignments() {
  const el = document.getElementById('assignmentList'); if (!el) return;
  const s = document.getElementById('assignmentSearch')?.value.trim().toLowerCase() || '';
  const cf = document.getElementById('assignmentClassFilter')?.value || '';
  let f = assignments.filter(a => (!s || (`${a.title} ${a.description}`).toLowerCase().includes(s)) && (!cf || (a.classId || 'all') === cf));
  el.innerHTML = f.length ? f.map(a => `<div class="library-item"><h4>${escapeHtml(a.title)}</h4><p>${escapeHtml(a.description || 'No description.')}</p><span class="badge">${escapeHtml(getClassName(a.classId))}</span></div>`).join('') : '<div class="status">No assignments.</div>';
}

function renderSnapshot() {
  const cls = classes.find(c => c.id === liveClassId) || classes[0] || null;
  ['snapshotClass', 'snapshotNext', 'snapshotMode', 'snapshotSchedule', 'snapshotStudents'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = '--';
  });
  if (!cls) return;
  document.getElementById('snapshotClass').textContent = cls.subject;
  document.getElementById('snapshotNext').textContent = cls.nextSession || 'TBA';
  document.getElementById('snapshotMode').textContent = cls.mode === 'human' ? 'Live Teacher' : 'AI Teaching';
  document.getElementById('snapshotSchedule').textContent = cls.scheduleNotes || 'Not published';
  document.getElementById('snapshotStudents').textContent = '—';
}
function renderActivity() {
  const el = document.getElementById('activityList'); if (!el) return;
  const items = [
    ...classes.map(c => ({ time: c.createdAt, label: `Class created: ${c.subject}` })),
    ...quizzes.map(q => ({ time: q.createdAt, label: `Quiz: ${q.question}` })),
    ...assignments.map(a => ({ time: a.createdAt, label: `Assignment: ${a.title}` })),
    ...teacherQuiz.map(s => ({ time: s.submittedAt, label: `Quiz submitted by ${s.studentName}` })),
    ...teacherAssign.map(s => ({ time: s.submittedAt, label: `Assignment submitted by ${s.studentName}` })),
  ].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0)).slice(0, 8);
  el.innerHTML = items.length ? items.map(i => `<div class="activity-item"><div>${escapeHtml(i.label)}</div><div class="activity-time">${formatShortTime(i.time)}</div></div>`).join('') : '<div class="status">No recent activity.</div>';
}
function renderNextSteps() {
  const el = document.getElementById('nextSteps'); if (!el) return;
  const tasks = [];
  if (!classes.length) tasks.push('Create your first class to onboard students.');
  if (classes.length && !quizzes.length) tasks.push('Publish a quiz to check understanding.');
  if (classes.length && !assignments.length) tasks.push('Create an assignment for deeper practice.');
  if (!tasks.length) tasks.push('Everything is running. Review submissions for insights.');
  el.innerHTML = tasks.map(t => `<div class="task-item">${escapeHtml(t)}</div>`).join('');
}
function renderOverview() { renderSnapshot(); renderActivity(); renderNextSteps(); }

function renderSubmissions() {
  const qm = new Map(quizzes.map(q => [q.id, q]));
  const am = new Map(assignments.map(a => [a.id, a]));
  const qs = document.getElementById('quizSubmissionList');
  const as = document.getElementById('assignmentSubmissionList');
  const qm2 = document.getElementById('quizSubmissionMeta');
  const am2 = document.getElementById('assignmentSubmissionMeta');
  if (qs) {
    qm2.textContent = `${teacherQuiz.length} submissions`;
    qs.innerHTML = teacherQuiz.slice(0, 12).map(s => {
      const answers = (s.answers || []).map(a => {
        const q = qm.get(a.quizId); if (!q) return '';
        const ok = a.answerIndex === q.correctIndex;
        return `<div class="detail-row"><span class="detail-pill ${ok ? 'good' : 'bad'}">${ok ? '✓' : '✗'}</span><span>${escapeHtml(q.question.slice(0, 60))}</span></div>`;
      }).join('');
      return `<div class="submission-item"><div class="submission-score">Score: ${s.score}/${s.total}</div><div class="submission-detail">Student: ${escapeHtml(s.studentName || '?')}</div><div class="submission-detail">${formatShortTime(s.submittedAt)}</div><details><summary class="submission-detail">Answers</summary>${answers || '—'}</details></div>`;
    }).join('') || '<div class="status">No quiz submissions.</div>';
  }
  if (as) {
    am2.textContent = `${teacherAssign.length} submissions`;
    as.innerHTML = teacherAssign.slice(0, 12).map(s => {
      const a = am.get(s.assignmentId);
      const preview = (s.answer || '').slice(0, 120);
      return `<div class="submission-item"><div class="submission-score">${escapeHtml(a ? a.title : 'Assignment')}</div><div class="submission-detail">Student: ${escapeHtml(s.studentName || '?')}</div><div class="submission-detail">${formatShortTime(s.submittedAt)}</div><div class="submission-detail">${escapeHtml(preview)}${s.answer?.length > 120 ? '…' : ''}</div></div>`;
    }).join('') || '<div class="status">No assignment submissions.</div>';
  }
}

// ── Form submissions ──────────────────────────────────────
document.getElementById('classForm').addEventListener('submit', async e => {
  e.preventDefault();
  const st = document.getElementById('classStatus');
  st.textContent = 'Creating...';
  try {
    const r = await fetch('/class', {
      method: 'POST', headers: headers(), body: JSON.stringify({
        subject: document.getElementById('classSubject').value.trim(),
        description: document.getElementById('classDesc').value.trim(),
        nextSession: document.getElementById('classNext').value.trim(),
        scheduleNotes: document.getElementById('classSchedule').value.trim(),
        upcomingSessions: document.getElementById('classUpcoming').value.split('\n').map(l => l.trim()).filter(Boolean)
      })
    });
    const d = await r.json();
    if (!r.ok) { st.textContent = d.error; return; }
    st.textContent = 'Class created!';
    e.target.reset(); loadClasses(); showToast('Class created ✓', 'success');
  } catch (_) { st.textContent = 'Network error.'; }
});

function createQuestionBlock(idx) {
  const div = document.createElement('div'); div.className = 'question-card'; div.dataset.index = idx;
  div.innerHTML = `<div class="question-header"><div class="question-title">Question ${idx + 1}</div><button type="button" class="remove-question ghost-btn">Remove</button></div>
    <textarea class="question-text" rows="2" placeholder="Type the question"></textarea>
    <div class="options-grid">
      <input class="option-input" type="text" placeholder="Option 1"/><input class="option-input" type="text" placeholder="Option 2"/>
      <input class="option-input" type="text" placeholder="Option 3"/><input class="option-input" type="text" placeholder="Option 4"/>
    </div>
    <label>Correct Answer</label>
    <select class="correct-select"><option value="0">Option 1</option><option value="1">Option 2</option><option value="2">Option 3</option><option value="3">Option 4</option></select>`;
  div.querySelector('.remove-question').addEventListener('click', () => { div.remove(); updateQNums(); });
  return div;
}
function updateQNums() {
  document.querySelectorAll('.question-card').forEach((c, i) => {
    c.dataset.index = i; const t = c.querySelector('.question-title'); if (t) t.textContent = `Question ${i + 1}`;
  });
}
document.getElementById('addQuestion').addEventListener('click', () => {
  const ql = document.getElementById('questionList');
  ql.appendChild(createQuestionBlock(ql.querySelectorAll('.question-card').length));
});
document.getElementById('quizForm').addEventListener('submit', async e => {
  e.preventDefault();
  const st = document.getElementById('quizStatus');
  const classId = document.getElementById('quizClass').value;
  const cards = Array.from(document.getElementById('questionList').querySelectorAll('.question-card'));
  if (!cards.length) { st.textContent = 'Add at least one question.'; return; }
  const qs = cards.map(c => ({
    question: c.querySelector('.question-text').value.trim(),
    options: Array.from(c.querySelectorAll('.option-input')).map(i => i.value.trim()),
    correctIndex: Number(c.querySelector('.correct-select').value)
  }));
  if (qs.some(q => !q.question || q.options.some(o => !o))) { st.textContent = 'Fill all fields.'; return; }
  st.textContent = 'Publishing...';
  try {
    const resps = await Promise.all(qs.map(q => fetch('/quiz', { method: 'POST', headers: headers(), body: JSON.stringify({ ...q, classId }) })));
    if (resps.some(r => !r.ok)) { st.textContent = 'Some failed.'; return; }
    st.textContent = `Published ${qs.length} question(s).`;
    e.target.reset(); document.getElementById('questionList').innerHTML = '';
    createQuestionBlock(0) && document.getElementById('questionList').appendChild(createQuestionBlock(0));
    loadQuizzes(); showToast('Quiz published ✓', 'success');
  } catch (_) { st.textContent = 'Network error.'; }
});
document.getElementById('assignmentForm').addEventListener('submit', async e => {
  e.preventDefault();
  const st = document.getElementById('assignmentStatus');
  st.textContent = 'Publishing...';
  try {
    const r = await fetch('/assignment', {
      method: 'POST', headers: headers(), body: JSON.stringify({
        title: document.getElementById('assignmentTitle').value.trim(),
        description: document.getElementById('assignmentDesc').value.trim(),
        classId: document.getElementById('assignmentClass').value
      })
    });
    const d = await r.json();
    if (!r.ok) { st.textContent = d.error; return; }
    st.textContent = 'Assignment published!';
    e.target.reset(); loadAssignments(); showToast('Assignment published ✓', 'success');
  } catch (_) { st.textContent = 'Network error.'; }
});

// ── Filter events ─────────────────────────────────────────
document.getElementById('classSearch')?.addEventListener('input', renderClasses);
document.getElementById('quizSearch')?.addEventListener('input', renderQuizzes);
document.getElementById('assignmentSearch')?.addEventListener('input', renderAssignments);
document.getElementById('quizClassFilter')?.addEventListener('change', renderQuizzes);
document.getElementById('assignmentClassFilter')?.addEventListener('change', renderAssignments);
document.getElementById('submissionSearch')?.addEventListener('input', renderSubmissions);
document.getElementById('submissionClassFilter')?.addEventListener('change', renderSubmissions);
document.getElementById('submissionRange')?.addEventListener('change', () => loadSubmissions().catch(() => { }));
document.getElementById('refreshSubmissions')?.addEventListener('click', () => loadSubmissions().catch(() => { }));

// ── loadAll & boot ────────────────────────────────────────
async function loadAll() {
  await loadRtcConfig();
  await loadClasses();
  await Promise.allSettled([loadQuizzes(), loadAssignments(), loadSubmissions()]);
  updateHeroInsights(); renderOverview();
}

// Add first question block
document.getElementById('questionList').appendChild(createQuestionBlock(0));
updatePlaceholder();

if (!teacherId) openGate();
else setTeacherId(teacherId);
