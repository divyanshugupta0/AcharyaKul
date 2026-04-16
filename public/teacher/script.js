/* Teacher portal */

const socket = io({ transports: ['websocket', 'polling'], autoConnect: false });

const tabs = Array.from(document.querySelectorAll('.side-btn'));
const topLinks = Array.from(document.querySelectorAll('.top-link'));
const panels = Array.from(document.querySelectorAll('.panel'));
const jumpBtns = Array.from(document.querySelectorAll('[data-jump]'));

const gate = document.getElementById('teacherGate');
const shell = document.getElementById('teacherShell');
const goToAccessPage = document.getElementById('goToAccessPage');
const teacherIdLabel = document.getElementById('teacherIdLabel');
const changeTeacher = document.getElementById('changeTeacher');
const logoutBtn = document.getElementById('logoutBtn');
const topbarAvatar = document.getElementById('topbarAvatar');
const topbarNameEl = document.getElementById('topbarName');
const teacherLiveLabel = document.getElementById('teacherLiveLabel');
const mobileLiveLabel = document.getElementById('mobileLiveLabel');
const toastArea = document.getElementById('toastArea');

const hamburgerBtn = document.getElementById('hamburgerBtn');
const sidebar = document.querySelector('.sidebar');
let sidebarOverlay = null;

const teacherVideo = document.getElementById('teacherVideo');
const videoStage = document.getElementById('videoStage');
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
const studioStage = document.getElementById('studioStage');
const studioClassName = document.getElementById('studioClassName');
const raisedHandsSection = document.getElementById('raisedHandsSection');
const raisedHandList = document.getElementById('raisedHandList');
const sideSessionState = document.getElementById('sideSessionState');
const sideStreamMode = document.getElementById('sideStreamMode');
const sideParticipantCount = document.getElementById('sideParticipantCount');
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
const studioBackdrop = document.getElementById('studioBackdrop');
const endCallBtn = document.getElementById('endCallBtn');
const netLabel = document.getElementById('netLabel');
const netBars = [document.getElementById('nb1'), document.getElementById('nb2'), document.getElementById('nb3'), document.getElementById('nb4')];
const stageModeChip = document.getElementById('stageModeChip');
const stageAudienceChip = document.getElementById('stageAudienceChip');
const stageAssistChip = document.getElementById('stageAssistChip');
const stageHintLine = document.getElementById('stageHintLine');
const layoutButtons = Array.from(document.querySelectorAll('.layout-btn'));
const reactionsBtn = document.getElementById('reactionsBtn');
const reactionsPopup = document.getElementById('reactionsPopup');
const reactionOverlay = document.getElementById('reactionOverlay');
const reactionButtons = Array.from(document.querySelectorAll('.reaction-emoji'));

const aiTeachCard = document.getElementById('aiTeachCard');
const aiTeachToggleBtn = document.getElementById('aiTeachToggleBtn');
const aiTopicInput = document.getElementById('aiTopicInput');
const aiContextInput = document.getElementById('aiContextInput');
const aiLanguageSelect = document.getElementById('aiLanguageSelect');
const aiVoiceSelect = document.getElementById('aiVoiceSelect');
const aiSpeechRate = document.getElementById('aiSpeechRate');
const aiSpeechPitch = document.getElementById('aiSpeechPitch');
const aiTeachStartBtn = document.getElementById('aiTeachStartBtn');
const aiTeachStopBtn = document.getElementById('aiTeachStopBtn');
const aiTeachPauseBtn = document.getElementById('aiTeachPauseBtn');
const aiPauseIcon = document.getElementById('aiPauseIcon');
const aiPauseLabel = document.getElementById('aiPauseLabel');
const aiStatusDot = document.getElementById('aiStatusDot');
const aiStatusText = document.getElementById('aiStatusText');
const aiTranscriptContainer = document.getElementById('aiTranscriptContainer');
const aiTranscript = document.getElementById('aiTranscript');
const examsList = document.getElementById('examsList');

let teacherId = '';
let accessLost = false;
let sessionUser = null;
let rtcReady = null;
let cameraStream = null;
let screenStream = null;
let liveStream = null;
let pipCameraStream = null;
let liveOn = false;
let liveClassId = '';
let micEnabled = true;
let camEnabled = true;
let streamMode = 'camera';
let sessionStart = null;
let timerInterval = null;
let mediaRecorder = null;
let recordChunks = [];
let wbActive = false;
let wbDrawing = false;
let wbTool = 'pen';
let netPollInterval = null;
let aiTeaching = false;
let aiPaused = false;
let aiAbortController = null;
let aiTranscriptItems = [];

const rtcConfig = { iceServers: [] };
const peers = new Map();
const participants = new Map();
let classes = [];
let quizzes = [];
let assignments = [];
let quizSubmissions = [];
let assignmentSubmissions = [];
let teacherQuiz = [];
let teacherAssign = [];

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function formatShortTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function showToast(message, type = '') {
  if (!toastArea) return;
  const toast = document.createElement('div');
  toast.className = `toast${type ? ` ${type}` : ''}`;
  toast.textContent = message;
  toastArea.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3500);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchJson(url, options) {
  return window.olmsAuth.fetchJson(url, options);
}

async function postJson(url, body, extraOptions) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(((extraOptions && extraOptions.headers) || {})) },
    body: JSON.stringify(body),
    ...(extraOptions || {})
  });
}

async function handleAccessLoss(message) {
  if (accessLost) return;
  accessLost = true;
  showToast(message || 'Your session ended. Please sign in again.', 'warning');
  await window.olmsAuth.handleAccessLoss(message, '/teacher/');
}

async function connectSocket() {
  socket.auth = {
    token: await window.olmsAuth.getIdToken(),
    sessionId: window.olmsAuth.getDeviceSessionId()
  };
  if (!socket.connected) socket.connect();
}

async function loadRtcConfig() {
  if (rtcReady) return rtcReady;
  rtcReady = fetchJson('/rtc-config').then((payload) => {
    if (payload && Array.isArray(payload.iceServers)) rtcConfig.iceServers = payload.iceServers;
  }).catch(() => { });
  return rtcReady;
}

function openGate() {
  if (gate) gate.classList.add('show');
  if (shell) shell.style.display = 'none';
}

function closeGate() {
  if (gate) gate.classList.remove('show');
  if (shell) shell.style.display = '';
}

function updateTeacherIdentity(user) {
  sessionUser = user;
  teacherId = user.displayName || user.email || user.uid || 'Teacher';
  if (teacherIdLabel) teacherIdLabel.textContent = `ID: ${teacherId}`;
  if (topbarAvatar) topbarAvatar.textContent = teacherId.slice(0, 2).toUpperCase();
  if (topbarNameEl) topbarNameEl.textContent = teacherId;
}

function createOverlay() {
  if (sidebarOverlay || !document.body) return;
  sidebarOverlay = document.createElement('div');
  sidebarOverlay.className = 'sidebar-overlay';
  document.body.appendChild(sidebarOverlay);
  sidebarOverlay.addEventListener('click', closeSidebar);
}

function openSidebar() {
  if (!sidebar) return;
  createOverlay();
  sidebar.classList.add('open');
  if (sidebarOverlay) sidebarOverlay.classList.add('show');
}

function closeSidebar() {
  if (!sidebar) return;
  sidebar.classList.remove('open');
  if (sidebarOverlay) sidebarOverlay.classList.remove('show');
}

function setChatView(view) {
  if (!chatBody || !studentsBody || !chatTabBtn || !studentsTabBtn) return;
  const showingStudents = view === 'students';
  chatTabBtn.classList.toggle('active', !showingStudents);
  studentsTabBtn.classList.toggle('active', showingStudents);
  chatBody.classList.toggle('hidden', showingStudents);
  studentsBody.classList.toggle('hidden', !showingStudents);
  if (showingStudents) renderStudentsTab();
}

function isCompactStudioViewport() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function isStudioPanelOpen() {
  if (!studioPanelAside) return false;
  return isCompactStudioViewport() ? studioPanelAside.classList.contains('mobile-open') : !document.body.classList.contains('host-collapsed');
}

function syncStudioBackdropState(isOpen = false) {
  if (!studioBackdrop) return;
  studioBackdrop.classList.toggle('panel-visible', Boolean(isOpen) && isCompactStudioViewport());
}

function setStudioPanelOpen(open, tabName) {
  if (!studioPanelAside) return;
  const shouldOpen = Boolean(open);
  if (tabName === 'students') setChatView('students');
  if (tabName === 'chat') setChatView('chat');
  if (isCompactStudioViewport()) {
    studioPanelAside.classList.toggle('mobile-open', shouldOpen);
    document.body.classList.remove('host-collapsed');
    syncStudioBackdropState(shouldOpen);
    return;
  }
  studioPanelAside.classList.remove('mobile-open');
  document.body.classList.toggle('host-collapsed', !shouldOpen);
  syncStudioBackdropState(false);
}

function setStageLayout(layout) {
  if (!studioStage) return;
  const nextLayout = layout === 'grid' ? 'grid' : 'focus';
  studioStage.dataset.layout = nextLayout;
  layoutButtons.forEach((button) => {
    const active = button.dataset.layout === nextLayout;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function toggleReactionsPopup(forceOpen) {
  if (!reactionsPopup) return;
  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : reactionsPopup.classList.contains('hidden');
  reactionsPopup.classList.toggle('hidden', !shouldOpen);
  if (reactionsBtn) reactionsBtn.setAttribute('aria-expanded', String(shouldOpen));
}

function spawnReaction(emoji) {
  if (!reactionOverlay || !emoji) return;
  const reaction = document.createElement('span');
  reaction.className = 'reaction-float';
  reaction.textContent = emoji;
  reaction.style.left = `${10 + Math.random() * 72}%`;
  reaction.style.animationDuration = `${1.9 + Math.random() * 0.8}s`;
  reactionOverlay.appendChild(reaction);
  window.setTimeout(() => reaction.remove(), 2600);
}

function updatePlaceholder() {
  const hasStream = Boolean(teacherVideo && teacherVideo.srcObject && (teacherVideo.srcObject.active || teacherVideo.srcObject.getTracks().length));
  if (canvasPlaceholder) canvasPlaceholder.classList.toggle('hidden', hasStream || wbActive);
}

function getSelectedStudioClassId() {
  return liveClassId || liveClassSelect?.value || classModeSelect?.value || '';
}

function getSelectedStudioClass() {
  const selectedId = getSelectedStudioClassId();
  return classes.find((item) => item.id === selectedId) || null;
}

function getClassName(id) {
  if (!id || id === 'all') return 'All classes';
  return classes.find((item) => item.id === id)?.subject || 'Unknown';
}

function setStudioChip(element, icon, text) {
  if (!element) return;
  const iconElement = element.querySelector('.material-symbols-outlined');
  const textElement = element.querySelector('.quick-pill-copy');
  if (iconElement) iconElement.textContent = icon;
  if (textElement) textElement.textContent = text;
}

function getTeachingModeLabel() {
  return getSelectedStudioClass()?.mode === 'ai' ? 'AI teaching' : 'Manual teaching';
}

function getStreamLabel() {
  if (wbActive) return 'Whiteboard';
  if (streamMode === 'screen') return 'Screen';
  return camEnabled ? 'Camera' : 'Camera off';
}

function renderStudentTiles() {
  if (!studentTiles) return;
  if (!participants.size) {
    studentTiles.innerHTML = '<div class="student-tile empty">Learner tiles will appear here when students join your room.</div>';
    return;
  }
  studentTiles.innerHTML = '';
  participants.forEach((participant, id) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `student-tile${participant.handRaised ? ' hand-up' : ''}`;
    tile.id = `tile-${id}`;
    tile.innerHTML = `<div class="tile-avatar">${escapeHtml(participant.name.slice(0, 2).toUpperCase())}</div><div class="tile-meta"><div class="tile-name">${escapeHtml(participant.name)}</div><div class="tile-state">${participant.handRaised ? 'Hand raised' : (liveOn ? 'Connected' : 'Waiting')}</div></div>`;
    tile.addEventListener('click', () => showToast(participant.handRaised ? `${participant.name} raised a hand.` : participant.name));
    studentTiles.appendChild(tile);
  });
}

function syncStudioMeta() {
  const currentClass = getSelectedStudioClass();
  const participantTotal = participants.size;
  const streamLabel = getStreamLabel();
  const learnerCopy = participantTotal ? `${participantTotal} learner${participantTotal === 1 ? '' : 's'} connected` : (liveOn ? 'Waiting for learners' : '0 learners waiting');
  setStudioChip(stageModeChip, wbActive ? 'draw' : (streamMode === 'screen' ? 'present_to_all' : (camEnabled ? 'videocam' : 'videocam_off')), liveOn ? `${streamLabel} live` : `${streamLabel} ready`);
  setStudioChip(stageAudienceChip, 'groups', learnerCopy);
  setStudioChip(stageAssistChip, currentClass?.mode === 'ai' ? 'smart_toy' : 'school', getTeachingModeLabel());
  if (sideSessionState) sideSessionState.textContent = liveOn ? 'Live' : 'Offline';
  if (sideStreamMode) sideStreamMode.textContent = streamLabel;
  if (sideParticipantCount) sideParticipantCount.textContent = String(participantTotal);
  if (stageHintLine) {
    if (currentClass && liveOn) stageHintLine.innerHTML = `Broadcasting <strong>${escapeHtml(currentClass.subject)}</strong>. Switch scenes, chat, or guide learners live.`;
    else if (currentClass) stageHintLine.innerHTML = `Selected <strong>${escapeHtml(currentClass.subject)}</strong>. Choose the mode, preview your setup, then press <strong>Go Live</strong>.`;
    else stageHintLine.innerHTML = 'Select a class, check the teaching mode, then press <strong>Go Live</strong>.';
  }
  if (videoStage) {
    videoStage.classList.toggle('stage-live', liveOn);
    videoStage.classList.toggle('stage-screen', streamMode === 'screen');
    videoStage.classList.toggle('stage-board', wbActive);
  }
  updatePlaceholder();
}

function setActiveTab(name) {
  tabs.forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
  topLinks.forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
  panels.forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${name}`));
  document.body.classList.toggle('studio-full', name === 'studio');
  closeSidebar();
  if (isCompactStudioViewport()) setStudioPanelOpen(false);
  toggleReactionsPopup(false);
}

tabs.forEach((button) => button.addEventListener('click', () => setActiveTab(button.dataset.tab)));
topLinks.forEach((button) => button.addEventListener('click', () => setActiveTab(button.dataset.tab)));
jumpBtns.forEach((button) => button.addEventListener('click', () => setActiveTab(button.dataset.jump)));

if (goToAccessPage) goToAccessPage.addEventListener('click', () => window.olmsAuth.redirectToLogin('/teacher/'));
if (changeTeacher) changeTeacher.addEventListener('click', async () => { await window.olmsAuth.signOut(); window.olmsAuth.redirectToLogin('/teacher/'); });
if (logoutBtn) logoutBtn.addEventListener('click', async () => { await window.olmsAuth.signOut(); window.olmsAuth.redirectToLogin('/teacher/'); });
if (hamburgerBtn) hamburgerBtn.addEventListener('click', () => { if (sidebar?.classList.contains('open')) closeSidebar(); else openSidebar(); });
if (teacherVideo) {
  teacherVideo.addEventListener('loadedmetadata', updatePlaceholder);
  teacherVideo.addEventListener('emptied', updatePlaceholder);
}
layoutButtons.forEach((button) => button.addEventListener('click', () => { setStageLayout(button.dataset.layout); showToast(`Stage layout: ${button.dataset.layout === 'grid' ? 'Grid' : 'Focus'}.`); }));
if (reactionsBtn) reactionsBtn.addEventListener('click', (event) => { event.stopPropagation(); toggleReactionsPopup(); });
reactionButtons.forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); spawnReaction(button.dataset.emoji || button.textContent.trim()); toggleReactionsPopup(false); showToast('Reaction sent.', 'success'); }));
if (toggleHostPanel) toggleHostPanel.addEventListener('click', () => { if (isCompactStudioViewport()) setStudioPanelOpen(!isStudioPanelOpen(), 'students'); else setStudioPanelOpen(document.body.classList.contains('host-collapsed')); });
if (chatToggleBtn) chatToggleBtn.addEventListener('click', () => { if (isCompactStudioViewport() && isStudioPanelOpen() && chatTabBtn?.classList.contains('active')) setStudioPanelOpen(false); else setStudioPanelOpen(true, 'chat'); });
if (chatTabBtn) chatTabBtn.addEventListener('click', () => setChatView('chat'));
if (studentsTabBtn) studentsTabBtn.addEventListener('click', () => setChatView('students'));
if (studioBackdrop) studioBackdrop.addEventListener('click', () => { toggleReactionsPopup(false); setStudioPanelOpen(false); });
document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Node)) return;
  const menuButton = target instanceof Element ? target.closest('[data-quiz-menu]') : null;
  const menuAction = target instanceof Element ? target.closest('[data-quiz-action]') : null;

  if (menuButton) {
    event.stopPropagation();
    toggleQuizMenu(menuButton.getAttribute('data-quiz-menu') || '');
    return;
  }

  if (menuAction) {
    event.stopPropagation();
    const quizId = menuAction.getAttribute('data-quiz-id') || '';
    const action = menuAction.getAttribute('data-quiz-action') || '';
    if (action === 'edit') editQuizExam(quizId);
    else if (action === 'republish') republishQuizExam(quizId);
    else if (action === 'delete') deleteQuizExam(quizId);
    return;
  }

  if (reactionsPopup && !reactionsPopup.classList.contains('hidden') && !reactionsPopup.contains(target) && !reactionsBtn?.contains(target)) toggleReactionsPopup(false);
  closeQuizMenus();
});
document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'Escape') {
    toggleReactionsPopup(false);
    closeQuizMenus();
    if (isCompactStudioViewport() && isStudioPanelOpen()) { setStudioPanelOpen(false); event.preventDefault(); }
    return;
  }
  const tagName = event.target?.tagName;
  if (event.target?.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;
  const shortcuts = { m: micBtn, v: camBtn, b: wbToggleBtn, c: chatToggleBtn, g: liveToggle, p: toggleHostPanel, r: reactionsBtn };
  const control = shortcuts[event.key.toLowerCase()];
  if (!control) return;
  control.click();
  event.preventDefault();
});
window.addEventListener('resize', () => { if (!isCompactStudioViewport()) studioPanelAside?.classList.remove('mobile-open'); syncStudioBackdropState(isStudioPanelOpen()); toggleReactionsPopup(false); });
setStageLayout(studioStage?.dataset.layout || 'focus');
setChatView('chat');
syncStudioMeta();
function startTimer() {
  sessionStart = Date.now();
  if (sessionTimer) sessionTimer.classList.remove('hidden');
  timerInterval = window.setInterval(() => {
    const totalSeconds = Math.floor((Date.now() - sessionStart) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (sessionTimer) sessionTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, 1000);
}

function stopTimer() {
  window.clearInterval(timerInterval);
  if (sessionTimer) {
    sessionTimer.classList.add('hidden');
    sessionTimer.textContent = '00:00';
  }
}

function setNetQuality(bars, className = 'active') {
  const labels = ['Poor', 'Weak', 'Fair', 'Good', 'Excellent'];
  netBars.forEach((bar, index) => { if (bar) bar.className = `net-bar${index < bars ? ` ${className}` : ''}`; });
  if (netLabel) netLabel.textContent = labels[bars] || 'Good';
}

async function pollNetworkQuality() {
  if (!peers.size) { setNetQuality(4); return; }
  let rttTotal = 0;
  let count = 0;
  for (const peerConnection of peers.values()) {
    try {
      const stats = await peerConnection.getStats();
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.currentRoundTripTime != null) {
          rttTotal += report.currentRoundTripTime * 1000;
          count += 1;
        }
      });
    } catch (_) { }
  }
  if (!count) { setNetQuality(4); return; }
  const average = rttTotal / count;
  if (average < 80) setNetQuality(4, 'active');
  else if (average < 150) setNetQuality(3, 'warn');
  else if (average < 300) setNetQuality(2, 'warn');
  else setNetQuality(1, 'bad');
}

async function applyAdaptiveBitrate(peerConnection) {
  try {
    for (const sender of peerConnection.getSenders()) {
      if (!sender.track) continue;
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      if (sender.track.kind === 'video') {
        params.encodings[0].maxBitrate = 800000;
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

async function startCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 }
    });
    return cameraStream;
  } catch (_) {
    showToast('Camera or mic permission was denied.', 'error');
    return null;
  }
}

function stopCamera() {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
}

async function startScreen() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always', frameRate: { ideal: 15 } }, audio: true });
    const mergedStream = new MediaStream();
    const videoTrack = screenStream.getVideoTracks()[0];
    if (videoTrack) {
      mergedStream.addTrack(videoTrack);
      videoTrack.onended = () => stopScreenShare(false);
    }
    if (!cameraStream) await startCamera();
    const micTrack = cameraStream?.getAudioTracks()[0];
    const screenAudioTrack = screenStream.getAudioTracks()[0];
    if (screenAudioTrack && micTrack) {
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      audioContext.createMediaStreamSource(new MediaStream([screenAudioTrack])).connect(destination);
      audioContext.createMediaStreamSource(new MediaStream([micTrack])).connect(destination);
      mergedStream.addTrack(destination.stream.getAudioTracks()[0]);
    } else if (micTrack) mergedStream.addTrack(micTrack);
    else if (screenAudioTrack) mergedStream.addTrack(screenAudioTrack);
    if (cameraStream && pipCamera) {
      pipCameraStream = new MediaStream(cameraStream.getVideoTracks());
      pipCamera.srcObject = pipCameraStream;
      pipCamera.classList.remove('hidden');
    }
    return mergedStream;
  } catch (_) {
    showToast('Screen share was cancelled.', 'warning');
    return null;
  }
}

function stopScreenShare(autoResume) {
  screenStream?.getTracks().forEach((track) => track.stop());
  screenStream = null;
  if (pipCamera) {
    pipCamera.classList.add('hidden');
    pipCamera.srcObject = null;
  }
  if (screenShareToggle) screenShareToggle.classList.remove('screen-active');
  if (screenShareIcon) screenShareIcon.textContent = 'screen_share';
  if (screenShareLabel) screenShareLabel.textContent = 'Screen';
  streamMode = 'camera';
  if (liveOn && autoResume !== false) {
    if (cameraStream) setLiveStream(cameraStream, 'camera');
    else startCamera().then((stream) => stream && setLiveStream(stream, 'camera'));
  }
  syncStudioMeta();
}

function setLiveStream(stream, mode) {
  liveStream = stream;
  streamMode = mode;
  if (teacherVideo) teacherVideo.srcObject = stream;
  updatePlaceholder();
  syncStudioMeta();
  if (!liveOn) return;
  peers.forEach(async (peerConnection) => {
    for (const track of stream.getTracks()) {
      const sender = peerConnection.getSenders().find((item) => item.track?.kind === track.kind);
      if (sender) await sender.replaceTrack(track).catch(() => { });
      else peerConnection.addTrack(track, stream);
    }
    applyAdaptiveBitrate(peerConnection);
  });
}

async function createOfferPeer(studentId) {
  await loadRtcConfig();
  const peerConnection = new RTCPeerConnection({ ...rtcConfig, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require', iceCandidatePoolSize: 10 });
  liveStream.getTracks().forEach((track) => peerConnection.addTrack(track, liveStream));
  applyAdaptiveBitrate(peerConnection);
  peerConnection.onicecandidate = (event) => { if (event.candidate) socket.emit('ice-candidate', { to: studentId, candidate: event.candidate, classId: liveClassId }); };
  peerConnection.onconnectionstatechange = () => {
    if (['failed', 'disconnected'].includes(peerConnection.connectionState)) {
      peers.delete(studentId);
      removeParticipant(studentId);
    }
  };
  peers.set(studentId, peerConnection);
  const offer = await peerConnection.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
  await peerConnection.setLocalDescription(offer);
  socket.emit('offer', { to: studentId, sdp: offer, classId: liveClassId });
}

function closePeers() {
  peers.forEach((peerConnection) => peerConnection.close());
  peers.clear();
}

function renderStudentsTab() {
  if (!studentsBody) return;
  studentsBody.innerHTML = participants.size
    ? [...participants.values()].map((participant) => `<div class="participant-item${participant.handRaised ? ' hand-up' : ''}"><div class="participant-avatar">${escapeHtml(participant.name.slice(0, 2).toUpperCase())}</div><div class="participant-meta"><div class="participant-name">${escapeHtml(participant.name)}</div><div class="participant-status">${participant.handRaised ? 'Hand raised' : (liveOn ? 'Connected' : 'Waiting')}</div></div></div>`).join('')
    : '<div class="status">No connected students.</div>';
}

function addParticipant(id, name) {
  participants.set(id, { name: name || id, handRaised: false });
  renderParticipants();
}

function removeParticipant(id) {
  participants.delete(id);
  document.getElementById(`tile-${id}`)?.remove();
  renderParticipants();
}

function renderParticipants() {
  const count = participants.size;
  if (participantCount) participantCount.textContent = String(count);
  if (sideParticipantCount) sideParticipantCount.textContent = String(count);
  if (!count) {
    if (participantList) participantList.innerHTML = '<div class="status">No learners yet.</div>';
    if (raisedHandsSection) raisedHandsSection.classList.add('hidden');
    if (raisedHandList) raisedHandList.innerHTML = '';
    renderStudentTiles();
    renderStudentsTab();
    syncStudioMeta();
    return;
  }
  if (participantList) participantList.innerHTML = '';
  let hands = 0;
  participants.forEach((participant) => {
    const row = document.createElement('div');
    row.className = `participant-item${participant.handRaised ? ' hand-up' : ''}`;
    row.innerHTML = `<div class="participant-avatar">${escapeHtml(participant.name.slice(0, 2).toUpperCase())}</div><div class="participant-meta"><div class="participant-name">${escapeHtml(participant.name)}</div><div class="participant-status">${participant.handRaised ? 'Needs attention' : (liveOn ? 'Connected' : 'Waiting')}</div></div>${participant.handRaised ? '<span class="hand-badge">Hand</span>' : ''}`;
    participantList?.appendChild(row);
    if (participant.handRaised) hands += 1;
  });
  if (hands && raisedHandsSection && raisedHandList) {
    raisedHandsSection.classList.remove('hidden');
    raisedHandList.innerHTML = '';
    participants.forEach((participant) => {
      if (!participant.handRaised) return;
      const item = document.createElement('div');
      item.textContent = `${participant.name} is waiting to speak.`;
      raisedHandList.appendChild(item);
    });
  } else if (raisedHandsSection) raisedHandsSection.classList.add('hidden');
  renderStudentTiles();
  renderStudentsTab();
  syncStudioMeta();
}

function setLiveStatusUI(on) {
  liveOn = on;
  document.body.classList.toggle('live-active', on);
  if (liveToggle) liveToggle.classList.toggle('active-live', on);
  if (liveToggleLabel) liveToggleLabel.textContent = on ? 'Stop Live' : 'Go Live';
  if (liveStatus) {
    liveStatus.textContent = on ? (streamMode === 'screen' ? 'Sharing screen' : 'Live now') : 'Camera off';
    liveStatus.classList.toggle('on', on);
  }
  const pillText = on ? `LIVE: ${getClassName(liveClassId)}` : 'Offline';
  if (teacherLiveLabel) { teacherLiveLabel.textContent = pillText; teacherLiveLabel.classList.toggle('on', on); }
  if (mobileLiveLabel) { mobileLiveLabel.textContent = pillText; mobileLiveLabel.classList.toggle('on', on); }
  if (studioClassName) studioClassName.textContent = on ? getClassName(liveClassId) : (getSelectedStudioClass()?.subject || '-- No Class Selected --');
  syncStudioMeta();
}

async function startLive() {
  const classId = liveClassSelect?.value;
  if (!classId) { showToast('Select a class first.', 'warning'); return; }
  await connectSocket();
  await loadRtcConfig();
  const stream = cameraStream || await startCamera();
  if (!stream) return;
  liveClassId = classId;
  setLiveStream(stream, 'camera');
  setLiveStatusUI(true);
  socket.emit('teacher-join', { classId });
  startTimer();
  window.clearInterval(netPollInterval);
  netPollInterval = window.setInterval(pollNetworkQuality, 5000);
  setNetQuality(4);
  showToast('You are live.', 'success');
}

async function stopLive() {
  if (aiTeaching) stopAiTeaching(false);
  setLiveStatusUI(false);
  socket.emit('teacher-leave', { classId: liveClassId });
  closePeers();
  if (screenStream) stopScreenShare(false);
  stopCamera();
  if (teacherVideo) teacherVideo.srcObject = null;
  if (pipCamera) { pipCamera.srcObject = null; pipCamera.classList.add('hidden'); }
  liveStream = null;
  liveClassId = '';
  participants.clear();
  setChatView('chat');
  setStudioPanelOpen(true);
  toggleReactionsPopup(false);
  renderParticipants();
  updatePlaceholder();
  stopTimer();
  window.clearInterval(netPollInterval);
  netPollInterval = null;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  showToast('Session ended.');
}

if (liveToggle) liveToggle.addEventListener('click', () => (liveOn ? stopLive() : startLive()));
if (endCallBtn) endCallBtn.addEventListener('click', () => { if (liveOn) stopLive(); });
if (micBtn) micBtn.addEventListener('click', () => {
  micEnabled = !micEnabled;
  (liveStream?.getAudioTracks() || cameraStream?.getAudioTracks() || []).forEach((track) => { track.enabled = micEnabled; });
  if (micIcon) micIcon.textContent = micEnabled ? 'mic' : 'mic_off';
  micBtn.classList.toggle('muted', !micEnabled);
  syncStudioMeta();
  showToast(micEnabled ? 'Mic on' : 'Mic muted', micEnabled ? 'success' : 'warning');
});
if (camBtn) camBtn.addEventListener('click', () => {
  camEnabled = !camEnabled;
  (cameraStream?.getVideoTracks() || liveStream?.getVideoTracks() || []).forEach((track) => { track.enabled = camEnabled; });
  if (camIcon) camIcon.textContent = camEnabled ? 'videocam' : 'videocam_off';
  camBtn.classList.toggle('muted', !camEnabled);
  syncStudioMeta();
  showToast(camEnabled ? 'Camera on' : 'Camera off', camEnabled ? 'success' : 'warning');
});
if (screenShareToggle) screenShareToggle.addEventListener('click', async () => {
  if (streamMode === 'screen') { stopScreenShare(true); return; }
  if (!liveOn) {
    const classId = liveClassSelect?.value;
    if (!classId) { showToast('Select a class first.', 'warning'); return; }
    await connectSocket();
    await loadRtcConfig();
    const stream = await startScreen();
    if (!stream) return;
    liveClassId = classId;
    setLiveStream(stream, 'screen');
    setLiveStatusUI(true);
    socket.emit('teacher-join', { classId });
    startTimer();
    window.clearInterval(netPollInterval);
    netPollInterval = window.setInterval(pollNetworkQuality, 5000);
  } else {
    const stream = await startScreen();
    if (!stream) return;
    setLiveStream(stream, 'screen');
  }
  streamMode = 'screen';
  if (screenShareIcon) screenShareIcon.textContent = 'stop_screen_share';
  if (screenShareLabel) screenShareLabel.textContent = 'Stop Share';
  screenShareToggle.classList.add('screen-active');
  if (liveStatus) liveStatus.textContent = 'Sharing screen';
  syncStudioMeta();
  showToast('Screen sharing started.', 'success');
});

let wbCtx = null;
if (wbToggleBtn) wbToggleBtn.addEventListener('click', () => {
  wbActive = !wbActive;
  if (whiteboardCanvas) whiteboardCanvas.classList.toggle('hidden', !wbActive);
  if (wbToolbar) wbToolbar.classList.toggle('hidden', !wbActive);
  wbToggleBtn.classList.toggle('wb-active', wbActive);
  if (wbActive && !wbCtx) initWhiteboard();
  syncStudioMeta();
  showToast(wbActive ? 'Whiteboard opened.' : 'Whiteboard hidden.', wbActive ? 'success' : '');
});
function initWhiteboard() {
  if (!whiteboardCanvas || !videoStage) return;
  const resizeCanvas = () => { whiteboardCanvas.width = videoStage.offsetWidth; whiteboardCanvas.height = videoStage.offsetHeight; };
  resizeCanvas();
  new ResizeObserver(resizeCanvas).observe(videoStage);
  wbCtx = whiteboardCanvas.getContext('2d');
  wbCtx.lineCap = 'round';
  wbCtx.lineJoin = 'round';
  whiteboardCanvas.addEventListener('pointerdown', (event) => { wbDrawing = true; wbCtx.beginPath(); wbCtx.moveTo(event.offsetX, event.offsetY); event.preventDefault(); });
  whiteboardCanvas.addEventListener('pointermove', (event) => {
    if (!wbDrawing) return;
    if (wbTool === 'eraser') wbCtx.clearRect(event.offsetX - 15, event.offsetY - 15, 30, 30);
    else {
      wbCtx.strokeStyle = wbColor?.value || '#ffffff';
      wbCtx.lineWidth = Number(wbSize?.value || 4);
      wbCtx.lineTo(event.offsetX, event.offsetY);
      wbCtx.stroke();
    }
    event.preventDefault();
  });
  whiteboardCanvas.addEventListener('pointerup', () => { wbDrawing = false; });
  whiteboardCanvas.addEventListener('pointerleave', () => { wbDrawing = false; });
}
if (wbPen) wbPen.addEventListener('click', () => { wbTool = 'pen'; wbPen.classList.add('active'); wbEraser?.classList.remove('active'); });
if (wbEraser) wbEraser.addEventListener('click', () => { wbTool = 'eraser'; wbEraser.classList.add('active'); wbPen?.classList.remove('active'); });
if (wbClear) wbClear.addEventListener('click', () => { if (wbCtx && whiteboardCanvas) wbCtx.clearRect(0, 0, whiteboardCanvas.width, whiteboardCanvas.height); });

if (recordBtn) recordBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    recordBtn.classList.remove('rec-active');
    if (recordIcon) recordIcon.textContent = 'fiber_manual_record';
    if (recordLabel) recordLabel.textContent = 'Record';
    if (recBadge) recBadge.classList.add('hidden');
    showToast('Recording saved.', 'success');
    return;
  }
  if (!liveStream) { showToast('Start live first.', 'warning'); return; }
  recordChunks = [];
  try { mediaRecorder = new MediaRecorder(liveStream, { mimeType: 'video/webm;codecs=vp9,opus' }); }
  catch (_) {
    try { mediaRecorder = new MediaRecorder(liveStream); }
    catch (_) { showToast('Recording is not supported here.', 'error'); return; }
  }
  mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) recordChunks.push(event.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `AK-Session-${Date.now()}.webm`;
    link.click();
    URL.revokeObjectURL(url);
  };
  mediaRecorder.start(1000);
  recordBtn.classList.add('rec-active');
  if (recordIcon) recordIcon.textContent = 'stop_circle';
  if (recordLabel) recordLabel.textContent = 'Stop Rec';
  if (recBadge) recBadge.classList.remove('hidden');
  showToast('Recording started.');
});
if (fullscreenBtn) fullscreenBtn.addEventListener('click', () => { const studioPanel = document.getElementById('tab-studio'); if (!document.fullscreenElement) studioPanel?.requestFullscreen?.(); else document.exitFullscreen?.(); });
document.addEventListener('fullscreenchange', () => { const icon = fullscreenBtn?.querySelector('.material-symbols-outlined'); if (icon) icon.textContent = document.fullscreenElement ? 'fullscreen_exit' : 'fullscreen'; });

function appendChatMsg(name, text, isSelf) {
  if (!chatBody) return;
  const message = document.createElement('div');
  message.className = `chat-message${isSelf ? ' chat-msg-self' : ''}`;
  message.innerHTML = `<div class="chat-msg-header"><span class="chat-msg-name">${escapeHtml(name)}</span><span class="chat-msg-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><div class="chat-msg-text">${escapeHtml(text)}</div>`;
  if (chatBody.querySelector('.status')) chatBody.innerHTML = '';
  chatBody.appendChild(message);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function sendChat() {
  const text = chatInput?.value?.trim();
  if (!text || !liveOn) { if (!liveOn) showToast('Start live to send messages.', 'warning'); return; }
  socket.emit('teacher-chat', { classId: liveClassId, text });
  appendChatMsg(`${teacherId} (you)`, text, true);
  if (chatInput) chatInput.value = '';
}
if (chatSendBtn) chatSendBtn.addEventListener('click', sendChat);
if (chatInput) chatInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChat(); } });

socket.on('connect', () => { accessLost = false; });
socket.on('connect_error', (error) => {
  const code = error && error.data ? error.data.code : '';
  if (code === 'session_invalidated' || code === 'missing_device_session' || code === 'missing_token') { handleAccessLoss(error.message); return; }
  showToast(error.message || 'Live connection failed.', 'error');
});
socket.on('app-error', (payload = {}) => {
  if (payload.code === 'session_invalidated' || payload.code === 'missing_device_session' || payload.code === 'missing_token') { handleAccessLoss(payload.message); return; }
  if (payload.message) showToast(payload.message, 'error');
});
socket.on('student-join', async (payload = {}) => {
  if (!liveOn || payload.classId !== liveClassId || !liveStream) return;
  addParticipant(payload.studentId, payload.studentName || payload.studentId);
  try { await createOfferPeer(payload.studentId); } catch (error) { console.error('Offer failed:', error); }
});
socket.on('answer', async (payload = {}) => {
  const peerConnection = peers.get(payload.from);
  if (!peerConnection || payload.classId !== liveClassId) return;
  try { await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp)); } catch (error) { console.error('Answer error:', error); }
});
socket.on('ice-candidate', async (payload = {}) => {
  const peerConnection = peers.get(payload.from);
  if (!peerConnection || payload.classId !== liveClassId) return;
  try { if (payload.candidate) await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch (_) { }
});
socket.on('student-left', (payload = {}) => {
  const peerConnection = peers.get(payload.studentId);
  peerConnection?.close();
  peers.delete(payload.studentId);
  removeParticipant(payload.studentId);
});
socket.on('teacher-replaced', (payload = {}) => {
  if (payload.classId === liveClassId) { stopLive(); showToast('This live room was opened somewhere else.', 'warning'); }
});
socket.on('student-chat', (payload = {}) => {
  if (payload.classId !== liveClassId) return;
  appendChatMsg(payload.name || 'Student', payload.text, false);
  setChatView('chat');
});
socket.on('student-hand', (payload = {}) => {
  if (payload.classId !== liveClassId) return;
  const participant = participants.get(payload.studentId);
  if (participant) { participant.handRaised = Boolean(payload.handRaised); renderParticipants(); }
  showToast(payload.handRaised ? `${payload.name || 'A student'} raised a hand.` : `${payload.name || 'A student'} lowered their hand.`);
});

function updateModeButtons() {
  const selectedId = classModeSelect?.value || liveClassSelect?.value || '';
  const currentClass = classes.find((item) => item.id === selectedId) || null;
  const mode = currentClass?.mode || 'human';
  modeButtons.forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  if (classModeStatus) classModeStatus.textContent = currentClass ? `Mode: ${mode === 'human' ? 'Live Teacher' : 'AI Teaching'}` : 'Pick a class to update mode.';
  if (!liveOn && liveClassSelect && classModeSelect && classModeSelect.value) liveClassSelect.value = classModeSelect.value;
  syncStudioMeta();
}
if (classModeSelect) classModeSelect.addEventListener('change', () => { if (!liveOn && liveClassSelect) liveClassSelect.value = classModeSelect.value; updateModeButtons(); });
modeButtons.forEach((button) => button.addEventListener('click', async () => {
  const classId = classModeSelect?.value;
  if (!classId) { if (classModeStatus) classModeStatus.textContent = 'Select a class first.'; return; }
  if (classModeStatus) classModeStatus.textContent = 'Updating...';
  try {
    const payload = await postJson('/class-mode', { classId, mode: button.dataset.mode });
    classes = classes.map((item) => (item.id === classId ? payload.class : item));
    if (!liveOn && liveClassSelect) liveClassSelect.value = classId;
    updateModeButtons();
    showToast('Mode updated.', 'success');
  } catch (error) {
    if (classModeStatus) classModeStatus.textContent = error.message || 'Network error.';
  }
}));
if (liveClassSelect) liveClassSelect.addEventListener('change', () => {
  if (liveOn) { showToast('Stop live before switching class.', 'warning'); liveClassSelect.value = liveClassId; return; }
  if (classModeSelect) classModeSelect.value = liveClassSelect.value;
  if (studioClassName) studioClassName.textContent = getSelectedStudioClass()?.subject || '-- No Class Selected --';
  updateModeButtons();
});

// Since the class is now selected before entering, we can add a Back to Class List button logic
document.getElementById('studioClassName')?.parentElement?.addEventListener('click', () => {
  if (liveOn) { showToast('Stop live before returning to class selection.', 'warning'); return; }
  exitStudioToPreLive();
});
document.getElementById('studioClassName')?.parentElement?.setAttribute('style', 'cursor: pointer; transition: opacity 0.2s;');
document.getElementById('studioClassName')?.parentElement?.setAttribute('title', 'Return to class selection');
async function loadClasses() {
  try {
    const payload = await fetchJson('/classes');
    classes = payload.classes || [];
    document.getElementById('heroClassCount').textContent = String(classes.length);
    renderClassOptions();
    renderClasses();
  } catch (error) {
    document.getElementById('classList').innerHTML = '<div class="status">Unable to load classes.</div>';
    console.error('Failed to load classes:', error);
  }
}

async function loadQuizzes() {
  try {
    const payload = await fetchJson('/quizzes');
    quizzes = payload.quizzes || [];
    document.getElementById('heroQuizCount').textContent = String(quizzes.length);
    loadExamList(quizzes);
    renderQuizzes();
  } catch (error) {
    console.error('Failed to load quizzes:', error);
    quizzes = [];
    document.getElementById('heroQuizCount').textContent = '0';
    renderQuizzes();
    if (examsList) {
      examsList.innerHTML = '<div class="status">Unable to load exams.</div>';
    }
  }
}
function loadExamList(examItems = quizzes) {
  if (!examsList) return;

  if (!examItems.length) {
    examsList.innerHTML = '<div class="status">No exams published yet.</div>';
    return;
  }

  examsList.innerHTML = examItems.map((quiz, index) => `
    <div class="library-item exam-list-card">
      <div class="exam-list-head">
        <div class="exam-list-title">
          <h4>${escapeHtml(quiz.title || `Exam ${index + 1}`)}</h4>
          <span class="badge">${escapeHtml(getClassName(quiz.classId))}</span>
        </div>
        <div class="exam-menu-wrap">
          <button type="button" class="exam-menu-btn" data-quiz-menu="${escapeHtml(quiz.id)}" aria-label="Quiz actions">
            <span class="material-symbols-outlined">more_vert</span>
          </button>
          <div class="exam-menu hidden" data-quiz-menu-panel="${escapeHtml(quiz.id)}">
            <button type="button" class="exam-menu-item" data-quiz-action="edit" data-quiz-id="${escapeHtml(quiz.id)}">Edit</button>
            <button type="button" class="exam-menu-item" data-quiz-action="republish" data-quiz-id="${escapeHtml(quiz.id)}">Republish</button>
            <button type="button" class="exam-menu-item danger" data-quiz-action="delete" data-quiz-id="${escapeHtml(quiz.id)}">Delete</button>
          </div>
        </div>
      </div>
      <p>${escapeHtml(quiz.question || 'No question text available.')}</p>
      <div class="exam-list-meta">
        <span>${formatShortTime(quiz.createdAt)}</span>
        <span>4 options</span>
      </div>
    </div>
  `).join('');
}

function closeQuizMenus() {
  document.querySelectorAll('[data-quiz-menu-panel]').forEach((panel) => panel.classList.add('hidden'));
}

function toggleQuizMenu(quizId) {
  const panel = document.querySelector(`[data-quiz-menu-panel="${quizId}"]`);
  if (!panel) return;
  const shouldOpen = panel.classList.contains('hidden');
  closeQuizMenus();
  if (shouldOpen) panel.classList.remove('hidden');
}

async function editQuizExam(quizId) {
  const quiz = quizzes.find((item) => item.id === quizId);
  if (!quiz) return;

  const title = window.prompt('Edit exam title', quiz.title || '')?.trim();
  if (title == null) return;
  const question = window.prompt('Edit question', quiz.question || '')?.trim();
  if (question == null || !question) return;

  const options = [];
  for (let index = 0; index < 4; index += 1) {
    const nextOption = window.prompt(`Option ${index + 1}`, quiz.options?.[index] || '')?.trim();
    if (nextOption == null || !nextOption) return;
    options.push(nextOption);
  }

  const correctIndexRaw = window.prompt('Correct option number (1-4)', String(Number(quiz.correctIndex || 0) + 1))?.trim();
  if (correctIndexRaw == null) return;
  const correctIndex = Number(correctIndexRaw) - 1;
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    showToast('Correct option must be between 1 and 4.', 'error');
    return;
  }

  try {
    await fetchJson(`/quiz/${encodeURIComponent(quizId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        question,
        options,
        correctIndex,
        classId: quiz.classId || 'all'
      })
    });
    closeQuizMenus();
    await loadQuizzes();
    showToast('Quiz updated.', 'success');
  } catch (error) {
    showToast(error.message || 'Unable to update quiz.', 'error');
  }
}

async function deleteQuizExam(quizId) {
  const quiz = quizzes.find((item) => item.id === quizId);
  if (!quiz) return;
  if (!window.confirm(`Delete "${quiz.title || quiz.question || 'this quiz'}"?`)) return;

  try {
    await fetchJson(`/quiz/${encodeURIComponent(quizId)}`, { method: 'DELETE' });
    closeQuizMenus();
    await loadQuizzes();
    showToast('Quiz deleted.', 'success');
  } catch (error) {
    showToast(error.message || 'Unable to delete quiz.', 'error');
  }
}

async function republishQuizExam(quizId) {
  const quiz = quizzes.find((item) => item.id === quizId);
  if (!quiz) return;
  if (!window.confirm(`Republish "${quiz.title || quiz.question || 'this quiz'}" as a new exam?`)) return;

  try {
    await fetchJson(`/quiz/${encodeURIComponent(quizId)}/republish`, { method: 'POST' });
    closeQuizMenus();
    await loadQuizzes();
    showToast('Quiz republished.', 'success');
  } catch (error) {
    showToast(error.message || 'Unable to republish quiz.', 'error');
  }
}

async function loadAssignments() {
  try {
    const payload = await fetchJson('/assignments');
    assignments = payload.assignments || [];
    document.getElementById('heroAssignmentCount').textContent = String(assignments.length);
    renderAssignments();
  } catch (error) {
    console.error('Failed to load assignments:', error);
  }
}

async function loadSubmissions() {
  const params = new URLSearchParams({ limit: '500' });
  const range = document.getElementById('submissionRange')?.value;
  if (range) params.set('start', new Date(Date.now() - Number(range) * 86400000).toISOString());
  const [quizResult, assignmentResult] = await Promise.allSettled([fetchJson(`/quiz-submissions?${params}`), fetchJson(`/assignment-submissions?${params}`)]);
  quizSubmissions = quizResult.status === 'fulfilled' ? (quizResult.value.submissions || []) : [];
  assignmentSubmissions = assignmentResult.status === 'fulfilled' ? (assignmentResult.value.submissions || []) : [];
  buildTeacherLists();
  updateHeroInsights();
  renderSubmissions();
  renderOverview();
  const lastUpdated = document.getElementById('lastUpdated');
  if (lastUpdated) lastUpdated.textContent = `Last updated: ${new Date().toLocaleString()}`;
}

function buildTeacherLists() {
  const quizMap = new Map(quizzes.map((quiz) => [quiz.id, quiz]));
  teacherQuiz = quizSubmissions.filter((submission) => (submission.answers || []).some((answer) => quizMap.has(answer.quizId)));
  const assignmentMap = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  teacherAssign = assignmentSubmissions.filter((submission) => assignmentMap.has(submission.assignmentId));
}

function updateHeroInsights() {
  const totalQuestions = teacherQuiz.reduce((sum, submission) => sum + Number(submission.total || 0), 0);
  const totalScore = teacherQuiz.reduce((sum, submission) => sum + Number(submission.score || 0), 0);
  document.getElementById('heroQuizSubmissions').textContent = String(teacherQuiz.length);
  document.getElementById('heroAssignmentSubmissions').textContent = String(teacherAssign.length);
  document.getElementById('heroAvgScore').textContent = totalQuestions ? `${Math.round((totalScore / totalQuestions) * 100)}%` : '0%';
  const students = new Set([...teacherQuiz.map((item) => item.studentName), ...teacherAssign.map((item) => item.studentName)].filter(Boolean));
  document.getElementById('heroActiveLearners').textContent = String(students.size);
}

function renderClassOptions() {
  const selectIds = ['classModeSelect', 'quizClass', 'quizClassFilter', 'assignmentClassFilter', 'submissionClassFilter'];
  selectIds.forEach((id) => { const select = document.getElementById(id); if (select) select.innerHTML = ''; });
  const quizClass = document.getElementById('quizClass');
  if (quizClass) quizClass.innerHTML = '<option value="all">All classes</option>';
  ['quizClassFilter', 'assignmentClassFilter', 'submissionClassFilter'].forEach((id) => { const select = document.getElementById(id); if (select) select.innerHTML = '<option value="">All classes</option>'; });

  const studioGrid = document.getElementById('studioClassGrid');
  if (studioGrid) {
    if (!classes.length) {
      studioGrid.innerHTML = '<div class="status">No classes scheduled. Create one in the Create tab!</div>';
    } else {
      studioGrid.innerHTML = classes.map(c => `
        <div class="studio-class-picker-item library-item">
          <h4>${escapeHtml(c.subject)}</h4>
          <p>${escapeHtml(c.description || 'No description')}</p>
          <div class="schedule-info">
            <span class="material-symbols-outlined">schedule</span>
            ${escapeHtml(c.nextSession || 'Unscheduled')}
          </div>
          <div class="item-actions">
            <span class="badge ${c.mode === 'ai' ? 'ai-mode' : 'human-mode'}">
              ${c.mode === 'ai' ? 'AI Teaching' : 'Live Teacher'}
            </span>
            <button type="button" class="ctrl-btn go-live" data-class-id="${c.id}">
              <span class="material-symbols-outlined">meeting_room</span> Connect
            </button>
          </div>
        </div>
      `).join('');
      
      // Add event listeners to all connect buttons
      studioGrid.querySelectorAll('.ctrl-btn.go-live').forEach(btn => {
        btn.addEventListener('click', function() {
          const classId = this.getAttribute('data-class-id');
          enterStudio(classId);
        });
      });
    }
  }

  if (!classes.length) {
    if (classModeSelect) classModeSelect.innerHTML = '<option value="">No classes</option>';
    syncStudioMeta();
    return;
  }
  classes.forEach((item) => {
    selectIds.forEach((id) => {
      const select = document.getElementById(id);
      if (!select) return;
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.subject;
      select.appendChild(option);
    });
  });
  if (liveClassId) {
    if (liveClassSelect) liveClassSelect.value = liveClassId;
    if (classModeSelect) classModeSelect.value = liveClassId;
  } else if (classes[0]) {
    if (liveClassSelect && !liveClassSelect.value) liveClassSelect.value = classes[0].id;
    if (classModeSelect) classModeSelect.value = liveClassSelect?.value || classes[0].id;
  }
  updateModeButtons();
}

function enterStudio(classId) {
  console.log('enterStudio called with classId:', classId);
  
  setActiveTab('studio');
  
  if (liveClassSelect) liveClassSelect.value = classId;
  if (classModeSelect) classModeSelect.value = classId;
  updateModeButtons();
  if (studioClassName) studioClassName.textContent = getSelectedStudioClass()?.subject || '-- No Class Selected --';
  syncStudioMeta();

  const preLive = document.getElementById('studioPreLive');
  const studioBody = document.getElementById('studioBody');
  const footerBar = document.getElementById('footerBar');

  console.log('Elements found:', { preLive: !!preLive, studioBody: !!studioBody, footerBar: !!footerBar });

  if (preLive) {
    preLive.classList.add('hidden');
    console.log('Pre-live hidden');
  }
  if (studioBody) {
    studioBody.classList.remove('hidden');
    console.log('Studio body shown');
  }
  if (footerBar) {
    footerBar.classList.remove('hidden');
    console.log('Footer bar shown');
  }
  
  setStudioPanelOpen(true);
  showToast(`Ready to broadcast ${getSelectedStudioClass()?.subject || 'class'}`, 'success');
  console.log('enterStudio completed');
}

function exitStudioToPreLive() {
  if (liveOn) stopLive();
  const preLive = document.getElementById('studioPreLive');
  const studioBody = document.getElementById('studioBody');
  const footerBar = document.getElementById('footerBar');

  if (preLive) preLive.classList.remove('hidden');
  if (studioBody) studioBody.classList.add('hidden');
  if (footerBar) footerBar.classList.add('hidden');
}

document.getElementById('exitPreLiveBtn')?.addEventListener('click', exitStudioToPreLive);

function renderClasses() {
  const list = document.getElementById('classList');
  if (!list) return;
  const search = document.getElementById('classSearch')?.value.trim().toLowerCase() || '';
  const filtered = search ? classes.filter((item) => `${item.subject} ${item.description || ''}`.toLowerCase().includes(search)) : classes;
  list.innerHTML = filtered.length ? filtered.map((item) => `<div class="library-item"><h4>${escapeHtml(item.subject)}</h4><p>${escapeHtml(item.description || 'No description.')}</p><span class="badge">Mode: ${item.mode === 'human' ? 'Live' : 'AI'}</span></div>`).join('') : '<div class="status">No classes.</div>';
}

function renderQuizzes() {
  const list = document.getElementById('quizList');
  if (!list) return;
  const search = document.getElementById('quizSearch')?.value.trim().toLowerCase() || '';
  const classFilter = document.getElementById('quizClassFilter')?.value || '';
  const filtered = quizzes.filter((quiz) => (!search || quiz.question.toLowerCase().includes(search)) && (!classFilter || (quiz.classId || 'all') === classFilter));
  list.innerHTML = filtered.length ? filtered.map((quiz) => `<div class="library-item"><h4>${escapeHtml(quiz.question)}</h4><span class="badge">${escapeHtml(getClassName(quiz.classId))}</span></div>`).join('') : '<div class="status">No quizzes.</div>';
}

function renderAssignments() {
  const list = document.getElementById('assignmentList');
  if (!list) return;
  const search = document.getElementById('assignmentSearch')?.value.trim().toLowerCase() || '';
  const classFilter = document.getElementById('assignmentClassFilter')?.value || '';
  const filtered = assignments.filter((assignment) => (!search || `${assignment.title} ${assignment.description || ''}`.toLowerCase().includes(search)) && (!classFilter || (assignment.classId || 'all') === classFilter));
  list.innerHTML = filtered.length ? filtered.map((assignment) => `<div class="library-item"><h4>${escapeHtml(assignment.title)}</h4><p>${escapeHtml(assignment.description || 'No description.')}</p><span class="badge">${escapeHtml(getClassName(assignment.classId))}</span></div>`).join('') : '<div class="status">No assignments.</div>';
}

function renderSnapshot() {
  const currentClass = classes.find((item) => item.id === liveClassId) || getSelectedStudioClass() || classes[0] || null;
  ['snapshotClass', 'snapshotNext', 'snapshotMode', 'snapshotSchedule', 'snapshotStudents'].forEach((id) => { const element = document.getElementById(id); if (element) element.textContent = '--'; });
  if (!currentClass) return;
  document.getElementById('snapshotClass').textContent = currentClass.subject;
  document.getElementById('snapshotNext').textContent = currentClass.nextSession || 'TBA';
  document.getElementById('snapshotMode').textContent = currentClass.mode === 'human' ? 'Live Teacher' : 'AI Teaching';
  document.getElementById('snapshotSchedule').textContent = currentClass.scheduleNotes || 'Not published';
  document.getElementById('snapshotStudents').textContent = String(participants.size || 0);
}

function renderActivity() {
  const list = document.getElementById('activityList');
  if (!list) return;
  const items = [
    ...classes.map((item) => ({ time: item.createdAt, label: `Class created: ${item.subject}` })),
    ...quizzes.map((item) => ({ time: item.createdAt, label: `Quiz: ${item.question}` })),
    ...assignments.map((item) => ({ time: item.createdAt, label: `Assignment: ${item.title}` })),
    ...teacherQuiz.map((item) => ({ time: item.submittedAt, label: `Quiz submitted by ${item.studentName}` })),
    ...teacherAssign.map((item) => ({ time: item.submittedAt, label: `Assignment submitted by ${item.studentName}` }))
  ].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0)).slice(0, 8);
  list.innerHTML = items.length ? items.map((item) => `<div class="activity-item"><div>${escapeHtml(item.label)}</div><div class="activity-time">${formatShortTime(item.time)}</div></div>`).join('') : '<div class="status">No recent activity.</div>';
}

function renderNextSteps() {
  const list = document.getElementById('nextSteps');
  if (!list) return;
  const tasks = [];
  if (!classes.length) tasks.push('Create your first class to onboard students.');
  if (classes.length && !quizzes.length) tasks.push('Publish a quiz to check understanding.');
  if (classes.length && !assignments.length) tasks.push('Create an assignment for deeper practice.');
  if (!tasks.length) tasks.push('Everything is running. Review submissions for insights.');
  list.innerHTML = tasks.map((task) => `<div class="task-item">${escapeHtml(task)}</div>`).join('');
}

function renderOverview() {
  renderSnapshot();
  renderActivity();
  renderNextSteps();
}

function renderSubmissions() {
  const quizMap = new Map(quizzes.map((quiz) => [quiz.id, quiz]));
  const assignmentMap = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const search = document.getElementById('submissionSearch')?.value.trim().toLowerCase() || '';
  const classFilter = document.getElementById('submissionClassFilter')?.value || '';
  const filteredQuiz = teacherQuiz.filter((submission) => (!search || String(submission.studentName || '').toLowerCase().includes(search)) && (!classFilter || (submission.classId || 'all') === classFilter));
  const filteredAssignments = teacherAssign.filter((submission) => (!search || String(submission.studentName || '').toLowerCase().includes(search)) && (!classFilter || (submission.classId || 'all') === classFilter));
  const quizList = document.getElementById('quizSubmissionList');
  const assignmentList = document.getElementById('assignmentSubmissionList');
  const quizMeta = document.getElementById('quizSubmissionMeta');
  const assignmentMeta = document.getElementById('assignmentSubmissionMeta');
  if (quizList && quizMeta) {
    quizMeta.textContent = `${filteredQuiz.length} submissions`;
    quizList.innerHTML = filteredQuiz.length ? filteredQuiz.slice(0, 12).map((submission) => {
      const answers = (submission.answers || []).map((answer) => {
        const quiz = quizMap.get(answer.quizId);
        if (!quiz) return '';
        const correct = answer.answerIndex === quiz.correctIndex;
        return `<div class="detail-row"><span class="detail-pill ${correct ? 'good' : 'bad'}">${correct ? 'OK' : 'Miss'}</span><span>${escapeHtml(quiz.question.slice(0, 60))}</span></div>`;
      }).join('');
      return `<div class="submission-item"><div class="submission-score">Score: ${submission.score}/${submission.total}</div><div class="submission-detail">Student: ${escapeHtml(submission.studentName || '?')}</div><div class="submission-detail">${formatShortTime(submission.submittedAt)}</div><details><summary class="submission-detail">Answers</summary>${answers || 'No answers to show.'}</details></div>`;
    }).join('') : '<div class="status">No quiz submissions.</div>';
  }
  if (assignmentList && assignmentMeta) {
    assignmentMeta.textContent = `${filteredAssignments.length} submissions`;
    assignmentList.innerHTML = filteredAssignments.length ? filteredAssignments.slice(0, 12).map((submission) => {
      const assignment = assignmentMap.get(submission.assignmentId);
      const preview = String(submission.answer || '').slice(0, 120);
      return `<div class="submission-item"><div class="submission-score">${escapeHtml(assignment ? assignment.title : 'Assignment')}</div><div class="submission-detail">Student: ${escapeHtml(submission.studentName || '?')}</div><div class="submission-detail">${formatShortTime(submission.submittedAt)}</div><div class="submission-detail">${escapeHtml(preview)}${String(submission.answer || '').length > 120 ? '...' : ''}</div></div>`;
    }).join('') : '<div class="status">No assignment submissions.</div>';
  }
}

const classForm = document.getElementById('classForm');
if (classForm) {
  classForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('classStatus');
    if (status) status.textContent = 'Creating...';
    try {
      await postJson('/class', {
        subject: document.getElementById('classSubject').value.trim(),
        description: document.getElementById('classDesc').value.trim(),
        nextSession: document.getElementById('classNext').value.trim(),
        scheduleNotes: document.getElementById('classSchedule').value.trim(),
        upcomingSessions: document.getElementById('classUpcoming').value.split('\n').map((line) => line.trim()).filter(Boolean)
      });
      if (status) status.textContent = 'Class created!';
      event.target.reset();
      await loadClasses();
      renderOverview();
      showToast('Class created.', 'success');
    } catch (error) {
      if (status) status.textContent = error.message || 'Network error.';
    }
  });
}

function createQuestionBlock(index) {
  const block = document.createElement('div');
  block.className = 'question-card';
  block.dataset.index = String(index);
  block.innerHTML = `<div class="question-header"><div class="question-title">Question ${index + 1}</div><button type="button" class="remove-question ghost-btn">Remove</button></div><textarea class="question-text" rows="2" placeholder="Type the question"></textarea><label>Question Type</label><select class="question-type"><option value="radio">Multiple Choice</option><option value="checkbox">Multi-Select</option><option value="text">Short Answer</option><option value="number">Number</option><option value="description">Description</option></select><div class="options-grid"><input class="option-input" type="text" placeholder="Option 1" /><input class="option-input" type="text" placeholder="Option 2" /><input class="option-input" type="text" placeholder="Option 3" /><input class="option-input" type="text" placeholder="Option 4" /></div><label>Correct Answer (Optional)</label><select class="correct-select"><option value="">Not Set</option><option value="0">Option 1</option><option value="1">Option 2</option><option value="2">Option 3</option><option value="3">Option 4</option></select>`;
  block.querySelector('.remove-question')?.addEventListener('click', () => { block.remove(); updateQuestionNumbers(); });
  return block;
}

function updateQuestionNumbers() {
  document.querySelectorAll('.question-card').forEach((card, index) => {
    card.dataset.index = String(index);
    const title = card.querySelector('.question-title');
    if (title) title.textContent = `Question ${index + 1}`;
  });
}

function ensureInitialQuestionBlock() {
  const questionList = document.getElementById('questionList');
  if (!questionList || questionList.querySelector('.question-card')) return;
  questionList.appendChild(createQuestionBlock(0));
}

const addQuestionBtn = document.getElementById('addQuestion');
if (addQuestionBtn) {
  addQuestionBtn.addEventListener('click', () => {
    const questionList = document.getElementById('questionList');
    if (!questionList) return;
    questionList.appendChild(createQuestionBlock(questionList.querySelectorAll('.question-card').length));
  });
}

const quizForm = document.getElementById('quizForm');
if (quizForm) {
  quizForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('quizStatus');
    const quizTitle = document.getElementById('QuizNameLabel')?.value.trim() || 'Untitled Quiz';
    const classIdElem = document.getElementById('quizClass');
    const classId = classIdElem ? classIdElem.value : '';
    const questionList = document.getElementById('questionList');
    const cards = questionList ? Array.from(questionList.querySelectorAll('.question-card')) : [];
    if (!cards.length) {
      if (status) status.textContent = 'Add at least one question.';
      return;
    }
    
    // Build questions array, filtering out empty options
    const questions = cards.map((card, idx) => {
      const questionText = card.querySelector('.question-text').value.trim();
      const allOptions = Array.from(card.querySelectorAll('.option-input')).map((input) => input.value.trim());
      const filledOptions = allOptions.filter((opt) => opt.length > 0); // Only non-empty options
      const correctIndexVal = card.querySelector('.correct-select').value;
      const correctIndex = correctIndexVal === '' ? undefined : Number(correctIndexVal);
      const questionType = card.querySelector('.question-type')?.value || 'radio';
      
      return {
        question: questionText,
        options: filledOptions,
        correctIndex: correctIndex,
        type: questionType,
        order: idx
      };
    });
    
    // Validate all questions - correct answer is now optional
    const invalidQuestion = questions.find((item) => {
      if (!item.question) return true; // Question text required
      // For option-based questions, require at least 2 options
      if ((item.type === 'radio' || item.type === 'checkbox') && item.options.length < 2) return true;
      // Validate correct answer index if provided
      if (item.correctIndex !== undefined && item.correctIndex >= item.options.length) return true;
      return false;
    });
    
    if (invalidQuestion) {
      if (status) status.textContent = 'Fill all required fields correctly.';
      showToast('Each question needs text. MCQ/Checkbox need at least 2 options.', 'error');
      return;
    }
    
    if (status) status.textContent = 'Publishing...';
    try {
      // Generate unique exam group ID
      const examGroupId = 'exam_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      
      // Send all questions with the same examGroupId to group them together
      await Promise.all(questions.map((question) => postJson('/quiz', { 
        ...question, 
        classId, 
        title: quizTitle,
        examGroupId: examGroupId,
        examQuestionOrder: question.order
      })));
      if (status) status.textContent = `Published ${questions.length} question(s).`;
      event.target.reset();
      if (questionList) {
        questionList.innerHTML = '';
        questionList.appendChild(createQuestionBlock(0));
      }
      await loadQuizzes();
      showToast('Quiz published.', 'success');
    } catch (error) {
      if (status) status.textContent = error.message || 'Network error.';
    }
  });
}

// ── Cancel Quiz Form ────────────────────────────────────
const cancelQuizBtn = document.querySelector('.cancelButton');
if (cancelQuizBtn) {
  cancelQuizBtn.addEventListener('click', (event) => {
    event.preventDefault();
    const quizForm = document.getElementById('quizForm');
    if (quizForm) {
      quizForm.reset();
      const questionList = document.getElementById('questionList');
      if (questionList) {
        questionList.innerHTML = '';
        questionList.appendChild(createQuestionBlock(0));
      }
      const status = document.getElementById('quizStatus');
      if (status) status.textContent = 'Ready';
    }
  });
}

const assignmentForm = document.getElementById('assignmentForm');
if (assignmentForm) {
  assignmentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('assignmentStatus');
    if (status) status.textContent = 'Publishing...';
    try {
      await postJson('/assignment', {
        title: document.getElementById('assignmentTitle').value.trim(),
        description: document.getElementById('assignmentDesc').value.trim()
      });
      if (status) status.textContent = 'Assignment published!';
      event.target.reset();
      await loadAssignments();
      showToast('Assignment published.', 'success');
    } catch (error) {
      if (status) status.textContent = error.message || 'Network error.';
    }
  });
}

// ── Generate Quiz Questions with AI ──────────────────────
const generateQuizButtons = document.querySelectorAll('.questionAreaHeader .generate-ai');
generateQuizButtons.forEach((btn) => {
  btn.addEventListener('click', async (event) => {
    event.preventDefault();
    const quizNameInput = document.getElementById('QuizNameLabel');
    const topic = quizNameInput ? quizNameInput.value.trim() : '';
    if (!topic) {
      showToast('Enter a quiz name/topic first.', 'warning');
      return;
    }
    
    // Show modal to collect parameters
    showQuizParamsModal().then(async (params) => {
      if (!params) return; // User cancelled
      
      const { numQuestions, difficultyLevel, questionType } = params;
      
      btn.disabled = true;
      btn.textContent = '⏳ Generating...';
      
      try {
        const response = await postJson('/generate-quiz-questions', {
          topic,
          numQuestions,
          difficultyLevel,
          questionType,
          subject: 'General'
        });
        
        if (response.questions && Array.isArray(response.questions)) {
          const questionList = document.getElementById('questionList');
          if (!questionList) {
            showToast('Question list element not found.', 'error');
            return;
          }
          
          // Clear existing questions
          questionList.innerHTML = '';
          
          // Add generated questions using the existing createQuestionBlock function
          response.questions.forEach((q, idx) => {
            const questionBlock = createQuestionBlock(idx);
            
            // Populate the question text
            const questionTextarea = questionBlock.querySelector('.question-text');
            if (questionTextarea) {
              questionTextarea.value = q.question || '';
            }
            
            // Populate the options
            const optionInputs = questionBlock.querySelectorAll('.option-input');
            q.options.forEach((opt, optIdx) => {
              if (optionInputs[optIdx]) {
                optionInputs[optIdx].value = opt || '';
              }
            });
            
            // Set the correct answer
            const correctSelect = questionBlock.querySelector('.correct-select');
            if (correctSelect && q.correctIndex !== undefined) {
              correctSelect.value = String(q.correctIndex);
            }
            
            // Set the question type
            if (q.type) {
              const typeSelect = questionBlock.querySelector('.question-type');
              if (typeSelect) {
                typeSelect.value = q.type;
              }
            }
            
            questionList.appendChild(questionBlock);
          });
          
          showToast(`Generated ${response.questions.length} ${difficultyLevel} questions successfully!`, 'success');
        }
      } catch (error) {
        console.error('Error generating quiz:', error);
        showToast(error.message || 'Failed to generate quiz questions.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '✨ Generate with AI';
      }
    });
  });
});

// ── Show Quiz Parameters Modal ──────────────────────────
function showQuizParamsModal() {
  return new Promise((resolve) => {
    const modal = document.getElementById('quizParamsModal');
    const numQuestionsInput = document.getElementById('numQuestionsInput');
    const difficultySelect = document.getElementById('difficultySelect');
    const questionTypeSelect = document.getElementById('questionTypeSelect');
    const confirmBtn = document.getElementById('confirmQuizModal');
    const cancelBtn = document.getElementById('cancelQuizModal');
    const closeBtn = document.getElementById('closeQuizModal');
    
    // Reset form to defaults
    numQuestionsInput.value = '3';
    difficultySelect.value = 'medium';
    questionTypeSelect.value = 'radio';
    
    // Show modal
    modal.classList.remove('hidden');
    numQuestionsInput.focus();
    
    // Close modal handler
    const handleClose = () => {
      modal.classList.add('hidden');
      removeListeners();
      resolve(null);
    };
    
    // Confirm handler
    const handleConfirm = () => {
      const numQuestions = parseInt(numQuestionsInput.value, 10);
      
      // Validate number of questions
      if (isNaN(numQuestions) || numQuestions < 1 || numQuestions > 10) {
        showToast('Please enter a number between 1 and 10.', 'error');
        return;
      }
      
      const difficultyLevel = difficultySelect.value;
      const questionType = questionTypeSelect.value;
      
      modal.classList.add('hidden');
      removeListeners();
      
      resolve({
        numQuestions,
        difficultyLevel,
        questionType
      });
    };
    
    // Remove event listeners
    const removeListeners = () => {
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleClose);
      closeBtn.removeEventListener('click', handleClose);
      document.removeEventListener('keydown', handleEscapeKey);
    };
    
    // Escape key handler
    const handleEscapeKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    
    // Add event listeners
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleClose);
    closeBtn.addEventListener('click', handleClose);
    document.addEventListener('keydown', handleEscapeKey);
    
    // Allow Enter key to confirm
    numQuestionsInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleConfirm();
    });
  });
}

// ── Generate Assignment with AI ──────────────────────────
const generateAssignmentBtn = document.querySelector('.ai-sec .generate-ai');
if (generateAssignmentBtn) {
  generateAssignmentBtn.addEventListener('click', async (event) => {
    event.preventDefault();
    
    // Prompt user for topic
    const topic = prompt('What topic should the assignment be about?', '');
    if (!topic || !topic.trim()) {
      showToast('Topic is required.', 'warning');
      return;
    }
    
    generateAssignmentBtn.disabled = true;
    generateAssignmentBtn.textContent = '⏳ Generating...';
    
    try {
      const response = await postJson('/generate-assignment', {
        topic: topic.trim()
      });
      
      if (response.assignment) {
        const titleInput = document.getElementById('assignmentTitle');
        const descInput = document.getElementById('assignmentDesc');
        
        if (titleInput) {
          titleInput.value = response.assignment.title || '';
        }
        if (descInput) {
          descInput.value = response.assignment.description || '';
        }
        
        showToast('Assignment content generated successfully!', 'success');
      }
    } catch (error) {
      console.error('Error generating assignment:', error);
      showToast(error.message || 'Failed to generate assignment.', 'error');
    } finally {
      generateAssignmentBtn.disabled = false;
      generateAssignmentBtn.textContent = '✨ Generate with AI';
    }
  });
}

function aiControlsAvailable() {
  return Boolean(aiTeachCard && aiTeachToggleBtn && aiTopicInput && aiContextInput && aiLanguageSelect && aiVoiceSelect && aiSpeechRate && aiSpeechPitch && aiTeachStartBtn && aiTeachStopBtn && aiTeachPauseBtn && aiPauseIcon && aiPauseLabel && aiStatusDot && aiStatusText && aiTranscriptContainer && aiTranscript);
}

function setAiStatus(state, text) {
  if (!aiControlsAvailable()) return;
  aiStatusDot.className = `ai-status-dot ${state}`;
  aiStatusText.textContent = text;
}

function showAiPanel() {
  if (!aiControlsAvailable()) return;
  aiTeachCard.classList.remove('hidden');
  aiTeachToggleBtn.classList.add('ai-active');
  setStudioPanelOpen(true, 'chat');
}

function hideAiPanel() {
  if (!aiControlsAvailable()) return;
  if (aiTeaching) { showToast('Stop AI teaching before hiding the panel.', 'warning'); return; }
  aiTeachCard.classList.add('hidden');
  aiTeachToggleBtn.classList.remove('ai-active');
}

function loadVoices() {
  if (!aiControlsAvailable() || !window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();
  aiVoiceSelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Default Voice';
  aiVoiceSelect.appendChild(defaultOption);
  voices.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    aiVoiceSelect.appendChild(option);
  });
}

function splitIntoSentences(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  return (normalized.match(/[^.!?]+[.!?]*/g) || [normalized]).map((item) => item.trim()).filter(Boolean);
}

function renderAiTranscript(sentences) {
  if (!aiControlsAvailable()) return;
  aiTranscript.innerHTML = '';
  aiTranscriptItems = [];
  sentences.forEach((sentence, index) => {
    const item = document.createElement('span');
    item.className = 'ai-sentence';
    item.dataset.index = String(index);
    item.textContent = `${sentence} `;
    aiTranscript.appendChild(item);
    aiTranscriptItems.push(item);
  });
  aiTranscriptContainer.classList.remove('hidden');
  aiTranscript.scrollTop = aiTranscript.scrollHeight;
}

function markAiSentence(index, state) {
  if (!aiTranscriptItems[index]) return;
  aiTranscriptItems[index].classList.remove('speaking', 'spoken');
  if (state) aiTranscriptItems[index].classList.add(state);
  aiTranscript.scrollTop = aiTranscript.scrollHeight;
}

function getAiVoice() {
  if (!aiControlsAvailable() || !window.speechSynthesis) return null;
  return window.speechSynthesis.getVoices().find((voice) => voice.name === aiVoiceSelect.value) || null;
}

function getAiSpeechLang() {
  const voice = getAiVoice();
  if (voice) return voice.lang;
  const language = String(aiLanguageSelect?.value || '').toLowerCase();
  if (language.includes('hindi') || language.includes('hinglish')) return 'hi-IN';
  return 'en-US';
}

function speakAiSentence(sentence) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return; }
    const utterance = new SpeechSynthesisUtterance(sentence);
    const voice = getAiVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = getAiSpeechLang();
    utterance.rate = Number(aiSpeechRate?.value || 1);
    utterance.pitch = Number(aiSpeechPitch?.value || 1);
    utterance.onend = resolve;
    utterance.onerror = resolve;
    window.speechSynthesis.speak(utterance);
  });
}

function syncAiControls(active) {
  if (!aiControlsAvailable()) return;
  aiTeachStartBtn.classList.toggle('hidden', active);
  aiTeachStopBtn.classList.toggle('hidden', !active);
  aiTeachPauseBtn.classList.toggle('hidden', !active);
  aiTeachToggleBtn.classList.toggle('ai-active', !aiTeachCard.classList.contains('hidden'));
}

async function startAiTeaching() {
  if (!aiControlsAvailable()) return;
  const topic = aiTopicInput.value.trim();
  if (!topic) { showToast('Enter a topic for the AI to teach.', 'warning'); return; }
  const currentClass = getSelectedStudioClass();
  aiTeaching = true;
  aiPaused = false;
  aiAbortController = new AbortController();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  aiPauseIcon.textContent = 'pause';
  aiPauseLabel.textContent = 'Pause';
  syncAiControls(true);
  showAiPanel();
  setAiStatus('loading', 'Generating lesson...');
  renderAiTranscript([]);
  if (liveOn && liveClassId) { socket.emit('ai-teaching-start', { classId: liveClassId, topic }); appendChatMsg('System', `AI teaching started: "${topic}"`, true); }
  try {
    const payload = await postJson('/ai-teach-sync', { topic, classSubject: currentClass?.subject || '', context: aiContextInput.value.trim(), language: aiLanguageSelect.value }, { signal: aiAbortController.signal });
    const sentences = splitIntoSentences(payload.text || '');
    if (!sentences.length) throw new Error('The AI did not return a lesson.');
    renderAiTranscript(sentences);
    setAiStatus('speaking', 'Teaching...');
    for (let index = 0; index < sentences.length; index += 1) {
      if (!aiTeaching) break;
      while (aiTeaching && aiPaused) await delay(150);
      if (!aiTeaching) break;
      const sentence = sentences[index];
      markAiSentence(index, 'speaking');
      if (liveOn && liveClassId) {
        socket.emit('ai-teaching-sentence', { classId: liveClassId, text: sentence, lang: getAiSpeechLang(), rate: Number(aiSpeechRate.value || 1), pitch: Number(aiSpeechPitch.value || 1) });
      }
      await speakAiSentence(sentence);
      markAiSentence(index, 'spoken');
    }
    if (aiTeaching) {
      aiTeaching = false;
      aiPaused = false;
      if (liveOn && liveClassId) { socket.emit('ai-teaching-stop', { classId: liveClassId }); appendChatMsg('System', 'AI teaching finished.', true); }
      syncAiControls(false);
      setAiStatus('standby', 'Lesson complete');
      showToast('AI teaching finished.', 'success');
    }
  } catch (error) {
    if (error.name === 'AbortError') setAiStatus('standby', 'AI stopped');
    else {
      console.error('AI teaching failed:', error);
      setAiStatus('error', error.message || 'AI teaching failed');
      showToast(error.message || 'AI teaching failed.', 'error');
    }
  } finally {
    aiAbortController = null;
    if (!aiTeaching) {
      aiPaused = false;
      syncAiControls(false);
      aiPauseIcon.textContent = 'pause';
      aiPauseLabel.textContent = 'Pause';
    }
  }
}

function stopAiTeaching(showNotice = true) {
  if (!aiControlsAvailable()) return;
  if (aiAbortController) { aiAbortController.abort(); aiAbortController = null; }
  aiTeaching = false;
  aiPaused = false;
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (liveOn && liveClassId) { socket.emit('ai-teaching-stop', { classId: liveClassId }); appendChatMsg('System', 'AI teaching stopped.', true); }
  syncAiControls(false);
  setAiStatus('standby', 'AI standby');
  aiPauseIcon.textContent = 'pause';
  aiPauseLabel.textContent = 'Pause';
  if (showNotice) showToast('AI teaching stopped.');
}

function toggleAiPause() {
  if (!aiControlsAvailable() || !aiTeaching || !window.speechSynthesis) return;
  aiPaused = !aiPaused;
  if (aiPaused) {
    window.speechSynthesis.pause();
    aiPauseIcon.textContent = 'play_arrow';
    aiPauseLabel.textContent = 'Resume';
    setAiStatus('paused', 'Paused');
  } else {
    window.speechSynthesis.resume();
    aiPauseIcon.textContent = 'pause';
    aiPauseLabel.textContent = 'Pause';
    setAiStatus('speaking', 'Teaching...');
  }
}

if (aiControlsAvailable()) {
  setAiStatus('standby', 'AI standby');
  syncAiControls(false);
  loadVoices();
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = loadVoices;
  aiTeachToggleBtn.addEventListener('click', () => { if (aiTeachCard.classList.contains('hidden')) showAiPanel(); else hideAiPanel(); });
  aiTeachStartBtn.addEventListener('click', startAiTeaching);
  aiTeachStopBtn.addEventListener('click', () => stopAiTeaching(true));
  aiTeachPauseBtn.addEventListener('click', toggleAiPause);
  aiTopicInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!aiTeaching) startAiTeaching(); } });
}

document.getElementById('classSearch')?.addEventListener('input', renderClasses);
document.getElementById('quizSearch')?.addEventListener('input', renderQuizzes);
document.getElementById('assignmentSearch')?.addEventListener('input', renderAssignments);
document.getElementById('quizClassFilter')?.addEventListener('change', renderQuizzes);
document.getElementById('assignmentClassFilter')?.addEventListener('change', renderAssignments);
document.getElementById('submissionSearch')?.addEventListener('input', renderSubmissions);
document.getElementById('submissionClassFilter')?.addEventListener('change', renderSubmissions);
document.getElementById('submissionRange')?.addEventListener('change', () => loadSubmissions().catch(() => { }));
document.getElementById('refreshSubmissions')?.addEventListener('click', () => loadSubmissions().catch(() => { }));

async function loadAll() {
  await loadRtcConfig();
  await loadClasses();
  await Promise.allSettled([loadQuizzes(), loadAssignments(), loadSubmissions()]);
  updateHeroInsights();
  renderOverview();
  updateModeButtons();
  syncStudioMeta();
}

async function bootTeacherPortal() {
  try {
    const accessNotice = window.olmsAuth.consumeAccessNotice();
    const user = await window.olmsAuth.ensurePortalAccess(['teacher', 'admin']);
    if (!user) return;
    updateTeacherIdentity(user);
    closeGate();
    ensureInitialQuestionBlock();
    updatePlaceholder();
    await loadAll();
    if (accessNotice) showToast(accessNotice, 'warning');
  } catch (error) {
    console.error('Teacher portal boot failed:', error);
    openGate();
    showToast(error.message || 'Unable to open the teacher portal.', 'error');
  }
}
bootTeacherPortal();

function newQuiz(){
  const newQuiz = document.getElementById('new-quiz');
  
}
