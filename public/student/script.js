/* ═══════════════════════════════════════════════════════
   AcharyaKul Student – Full Feature Client
   Compatible with teacher Live Studio WebRTC system
   ═══════════════════════════════════════════════════════ */

const socket = io({ transports: ['websocket', 'polling'], autoConnect: false });

// ── Tab routing ─────────────────────────────────────────
const tabs = Array.from(document.querySelectorAll('.side-btn'));
const topLinks = Array.from(document.querySelectorAll('.top-link'));
const panels = Array.from(document.querySelectorAll('.panel'));
const jumpBtns = Array.from(document.querySelectorAll('[data-jump]'));
const sidebtn = document.getElementById('side-btn');
const sectionHashMap = {
  dashboard: 'dashboard',
  live: 'live-class',
  quiz: 'quiz',
  assignment: 'assignment',
  progress: 'progress',
  exam: 'exam',
  ai: 'ai-mentor'
};
const hashSectionMap = Object.fromEntries(
  Object.entries(sectionHashMap).map(([section, hash]) => [hash, section])
);

function setActiveTab(name) {
  tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  topLinks.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  panels.forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  urlSection(name);
  document.body.classList.toggle('studio-full', name === 'live'); 
}
tabs.forEach(b => b.addEventListener('click', () => setActiveTab(b.dataset.tab)));
topLinks.forEach(b => b.addEventListener('click', () => setActiveTab(b.dataset.tab)));
jumpBtns.forEach(b => b.addEventListener('click', () => setActiveTab(b.dataset.jump)));

function loadTabFromHash() {
  const currentHash = window.location.hash.replace(/^#/, '');
  const sectionName = hashSectionMap[currentHash] || 'dashboard';
  setActiveTab(sectionName);
}

window.addEventListener('hashchange', loadTabFromHash);

// ── Gate / Name entry ────────────────────────────────────
const gate = document.getElementById('studentGate');
const shell = document.getElementById('studentShell');
const nameLabel = document.getElementById('studentNameLabel');
const changeBtn = document.getElementById('changeStudent');
const goToAccessPage = document.getElementById('goToAccessPage');
const topbarAvatar = document.getElementById('topbarAvatar');
const topbarNameEl = document.getElementById('topbarName');
const examList = document.getElementById('examList');
const examStatus = document.getElementById('exam-status');
const studentPageUrl = new URL(window.location.href);
const examSubmittedOnReturn = studentPageUrl.searchParams.get('submitted') === 'true';
const recentlySubmittedQuizId = studentPageUrl.searchParams.get('quizId') || '';

let studentName = '';
let sessionUser = null;

function openGate() { if (gate) gate.classList.add('show'); if (shell) shell.style.display = 'none'; }
function closeGate() { if (gate) gate.classList.remove('show'); if (shell) shell.style.display = ''; }

function updateStudentIdentity(user) {
  sessionUser = user;
  studentName = user.displayName || user.email || user.uid;
  if (nameLabel) nameLabel.textContent = `👤 ${studentName}`;
  if (topbarAvatar) topbarAvatar.textContent = studentName.slice(0, 2).toUpperCase();
  if (topbarNameEl) topbarNameEl.textContent = studentName;
}

if (goToAccessPage) goToAccessPage.addEventListener('click', () => window.olmsAuth.redirectToLogin('/student/'));
if (changeBtn) changeBtn.addEventListener('click', async () => {
  await window.olmsAuth.signOut();
  window.olmsAuth.redirectToLogin('/student/');
});

function getExamAvailability(exam) {
  const now = Date.now();
  const startsAt = exam?.startsAt ? new Date(exam.startsAt).getTime() : 0;
  const endsAt = exam?.endsAt ? new Date(exam.endsAt).getTime() : 0;
  if (startsAt && now < startsAt) {
    return { canStart: false, label: `Starts ${new Date(startsAt).toLocaleString()}` };
  }
  if (endsAt && now > endsAt) {
    return { canStart: false, label: 'Exam window closed' };
  }
  return { canStart: true, label: exam?.durationMinutes ? `${exam.durationMinutes} min` : 'Available now' };
}

function groupExamItems(items = []) {
  const grouped = new Map();
  items.forEach((item, index) => {
    const key = item.examGroupId || item.id;
    if (!grouped.has(key)) {
      // Calculate duration from startsAt and endsAt if available
      let durationMinutes = 0;
      if (item.startsAt && item.endsAt) {
        const start = new Date(item.startsAt);
        const end = new Date(item.endsAt);
        durationMinutes = Math.max(1, Math.round((end - start) / 60000));
      }
      
      grouped.set(key, {
        ...item,
        id: item.id,
        examGroupId: item.examGroupId || item.id,
        questionIds: [],
        questionCount: 0,
        questionPreview: item.question || '',
        durationMinutes: durationMinutes,
        _sortIndex: index
      });
    }
    const group = grouped.get(key);
    group.questionIds.push(item.id);
    group.questionCount += 1;
    if (!group.questionPreview && item.question) {
      group.questionPreview = item.question;
    }
  });
  return Array.from(grouped.values());
}

async function loadExamList(classId = currentClassId) {
  if (!examList) return;

  examList.innerHTML = '';
  if (examStatus && !examSubmittedOnReturn) {
    examStatus.style.visibility = 'visible';
    examStatus.style.display = '';
    examStatus.textContent = 'Loading exams...';
  }

  try {
    const params = new URLSearchParams();
    if (classId) params.set('classId', classId);

    const [quizResponse, submissionResponse] = await Promise.all([
      fetchJson(`/quizzes${params.toString() ? `?${params.toString()}` : ''}`),
      fetchJson('/quiz-submissions?limit=200')
    ]);

    const submittedQuizIds = new Set(
      (submissionResponse?.submissions || [])
        .flatMap((submission) => Array.isArray(submission.answers) ? submission.answers : [])
        .map((answer) => answer?.quizId)
        .filter(Boolean)
    );
    if (recentlySubmittedQuizId) {
      submittedQuizIds.add(recentlySubmittedQuizId);
    }

    const groupedExams = groupExamItems(Array.isArray(quizResponse?.quizzes) ? quizResponse.quizzes : []);
    const examsAvailable = groupedExams
      .filter((exam) => !exam.questionIds.some((id) => submittedQuizIds.has(id)));

    if (!examsAvailable.length) {
      if (examStatus) examStatus.textContent = 'No exam available right now.';
      return;
    }

    if (examStatus) examStatus.style.display = 'none';

    examsAvailable.forEach((exam, index) => {
      const card = document.createElement('div');
      card.className = 'list-item exam-card';
      const availability = getExamAvailability(exam);

      const startUrl = new URL(`/exam/${encodeURIComponent(exam.id)}`, window.location.origin);
      if (classId) startUrl.searchParams.set('classId', classId);
      if (sessionUser?.firebaseUid) startUrl.searchParams.set('firebaseUid', sessionUser.firebaseUid);
      startUrl.searchParams.set('duration', String(exam.durationMinutes && exam.durationMinutes > 0 ? exam.durationMinutes : 0));

      card.innerHTML = `
        <h4>${escapeHtml(exam.title || `Exam ${index + 1}`)}</h4>
        <p>${escapeHtml(exam.questionPreview || exam.question || 'Untitled exam')}</p>
        <p>${escapeHtml(`${exam.questionCount || 1} question(s)`)}</p>
        <p>${escapeHtml(availability.label)}</p>
        ${availability.canStart
          ? `<a class="ghost-btn exam-card-btn" href="${startUrl.toString()}">Start Exam</a>`
          : `<button class="ghost-btn exam-card-btn" type="button" disabled>${escapeHtml(availability.label)}</button>`}`;

      examList.appendChild(card);
    });
  } catch (_) {
    if (examStatus) {
      examStatus.style.display = '';
      examStatus.textContent = 'Unable to load exams right now.';
    }
  }
}
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
function parseScheduledSessionEntry(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return {
      startsAt: '',
      endsAt: '',
      title: String(raw || ''),
      mode: '',
      description: '',
      maxParticipants: '',
      recurring: 'none',
      features: {}
    };
  }
}
function getClassSessions(classItem) {
  const source = Array.isArray(classItem?.scheduledSessions) && classItem.scheduledSessions.length
    ? classItem.scheduledSessions
    : (Array.isArray(classItem?.upcomingSessions) ? classItem.upcomingSessions : []);
  return source
    .map(parseScheduledSessionEntry)
    .filter(Boolean)
    .sort((a, b) => new Date(a.startsAt || 0) - new Date(b.startsAt || 0));
}
function getNextScheduledSession(classItem, now = Date.now()) {
  const sessions = getClassSessions(classItem);
  return sessions.find((session) => {
    const endsAt = session?.endsAt ? new Date(session.endsAt).getTime() : 0;
    const startsAt = session?.startsAt ? new Date(session.startsAt).getTime() : 0;
    return (endsAt && endsAt >= now) || startsAt >= now;
  }) || sessions[0] || null;
}
function getWaitingRoomSession(classItem, now = Date.now()) {
  return getClassSessions(classItem).find((session) => {
    if (!session?.features?.waitingRoom) return false;
    const endsAt = session?.endsAt ? new Date(session.endsAt).getTime() : 0;
    return !endsAt || now <= endsAt;
  }) || null;
}
function formatSessionDateTime(value) {
  if (!value) return 'Time not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time not set' : date.toLocaleString();
}
function formatSessionWindow(session) {
  if (!session) return 'No session scheduled';
  const startsAt = formatSessionDateTime(session.startsAt);
  const endsAt = session?.endsAt ? formatSessionDateTime(session.endsAt) : '';
  return endsAt && endsAt !== 'Time not set' ? `${startsAt} to ${endsAt}` : startsAt;
}
function getClassScheduleInfo(classItem) {
  const nextSession = getNextScheduledSession(classItem);
  const waitingRoomSession = getWaitingRoomSession(classItem);
  const nextSessionLabel = nextSession
    ? formatSessionWindow(nextSession)
    : (classItem?.nextSession || 'No upcoming class scheduled');
  return {
    nextSession,
    waitingRoomSession,
    nextSessionLabel,
    waitingRoomEnabled: Boolean(waitingRoomSession)
  };
}
function setLivePlaceholderContent(title, message, icon = 'live_tv') {
  const iconEl = livePlaceholder?.querySelector('.ph-icon');
  if (iconEl) iconEl.textContent = icon;
  if (livePlaceholderTitle) livePlaceholderTitle.textContent = title;
  if (livePlaceholderText) livePlaceholderText.textContent = message;
}
function applyLiveRoomStatus(classId = liveClassId, teacherIsLive = teacherLive) {
  const classItem = classes.find((item) => item.id === classId);
  const schedule = getClassScheduleInfo(classItem);
  if (teacherIsLive) {
    if (liveStatus) {
      liveStatus.textContent = 'Live';
      liveStatus.classList.add('on');
    }
    setLivePlaceholderContent(
      'Live class is starting',
      'The teacher is online. The stream will appear here as soon as the connection is ready.',
      'live_tv'
    );
    return;
  }
  if (schedule.waitingRoomEnabled) {
    if (liveStatus) {
      liveStatus.textContent = 'Waiting Room';
      liveStatus.classList.remove('on');
    }
    setLivePlaceholderContent(
      'Waiting room open',
      `${schedule.nextSession?.title || classItem?.subject || 'This class'} is waiting for teacher approval. Scheduled slot: ${schedule.nextSessionLabel}.`,
      'hourglass_top'
    );
    return;
  }
  if (liveStatus) {
    liveStatus.textContent = 'Offline';
    liveStatus.classList.remove('on');
  }
  setLivePlaceholderContent(
    'Teacher is offline',
    schedule.nextSession ? `Next class: ${schedule.nextSessionLabel}` : 'No live stream is active for this class right now.',
    'live_tv'
  );
}
async function fetchJson(url, opts) {
  return window.olmsAuth.fetchJson(url, opts);
}
async function postJson(url, body, extraOptions) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...((extraOptions && extraOptions.headers) || {}) },
    body: JSON.stringify(body),
    ...(extraOptions || {})
  });
}
let accessLost = false;
async function handleAccessLoss(message) {
  if (accessLost) return;
  accessLost = true;
  showToast(message || 'Your session ended. Please sign in again.', 'warning');
  await window.olmsAuth.handleAccessLoss(message, '/student/');
}
async function connectSocket() {
  socket.auth = {
    token: await window.olmsAuth.getIdToken(),
    sessionId: window.olmsAuth.getDeviceSessionId()
  };
  if (!socket.connected) {
    socket.connect();
  }
}

// ── Toast ────────────────────────────────────────────────
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
  rtcReady = fetchJson('/rtc-config').then(d => {
    if (d && Array.isArray(d.iceServers)) rtcConfig.iceServers = d.iceServers;
  }).catch(() => { });
  return rtcReady;
}

// ── Stream & peer state ─────────────────────────────────
let peerConnection = null;
let liveClassId = '';
let inSession = false;
let teacherLive = false;
let handRaised = false;

// ── DOM elements ─────────────────────────────────────────
const liveVideo = document.getElementById('liveVideo');
const livePlaceholder = document.getElementById('livePlaceholder');
const livePlaceholderTitle = document.getElementById('livePlaceholderTitle');
const livePlaceholderText = document.getElementById('livePlaceholderText');
const liveClassName = document.getElementById('liveClassName');
const liveStatus = document.getElementById('liveStatus');
const footerBar = document.getElementById('footerBar');
const netLabel = document.getElementById('netLabel');
const netBars = [document.getElementById('nb1'), document.getElementById('nb2'), document.getElementById('nb3'), document.getElementById('nb4')];
const fullscreenBtn = document.getElementById('fullscreenBtn');
const raiseHandBtn = document.getElementById('raiseHandBtn');
const chatToggleBtn = document.getElementById('chatToggleBtn');
const leaveSessionBtn = document.getElementById('leaveSessionBtn');
const chatTabBtn = document.getElementById('chatTabBtn');
const studentsTabBtn = document.getElementById('studentsTabBtn');
const chatBody = document.getElementById('chatBody');
const studentsBody = document.getElementById('studentsBody');
const chatInputEl = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const studioPanelAside = document.getElementById('studioPanelAside');
const connectionStatus = document.getElementById('connectionStatus');
const mobileLiveLabel = document.getElementById('mobileLiveLabel');
const liveLobby = document.getElementById('liveLobby');
const liveSession = document.getElementById('liveSession');
const liveLobbyList = document.getElementById('liveLobbyList');
const refreshLobbyBtn = document.getElementById('refreshLobbyBtn');
const classGallery = document.getElementById('classGallery');
const classSelect = document.getElementById('classSelect');
const upcomingClassList = document.getElementById('upcomingClassList');

// Quiz & Assignment
const quizSearch = document.getElementById('quizSearch');
const refreshQuizzesBtn = document.getElementById('refreshQuizzesBtn');
const quizListEl = document.getElementById('quizList');
const activeQuizTitle = document.getElementById('activeQuizTitle');
const quizQuestions = document.getElementById('quizQuestions');
const quizActions = document.getElementById('quizActions');
const submitQuizBtn = document.getElementById('submitQuizBtn');
const quizStatus = document.getElementById('quizStatus');
const assignmentSearch = document.getElementById('assignmentSearch');
const assignmentSelect = document.getElementById('assignmentSelect');
const assignmentPreviewTitle = document.getElementById('assignmentPreviewTitle');
const assignmentPreviewDesc = document.getElementById('assignmentPreviewDesc');
const assignmentForm = document.getElementById('assignmentForm');
const assignmentStatusEl = document.getElementById('assignmentStatus');
const assignmentAnswer = document.getElementById('assignmentAnswer');

// Hero cards
const heroClassCount = document.getElementById('heroClassCount');
const heroQuizCount = document.getElementById('heroQuizCount');
const heroAssignmentCount = document.getElementById('heroAssignmentCount');
const heroAvgScore = document.getElementById('heroAvgScore');
const heroAvgScoreSub = document.getElementById('heroAvgScoreSub');

// Progress
const progressRange = document.getElementById('progressRange');
const refreshProgress = document.getElementById('refreshProgress');
const progressQuizCount = document.getElementById('progressQuizCount');
const progressAvgScore = document.getElementById('progressAvgScore');
const progressAssignmentCount = document.getElementById('progressAssignmentCount');
const progressLastActive = document.getElementById('progressLastActive');
const quizHistoryList = document.getElementById('quizHistoryList');
const assignmentHistoryList = document.getElementById('assignmentHistoryList');

// AI Mentor
const aiChatArea = document.getElementById('aiChatArea');
const aiQuestion = document.getElementById('aiQuestion');
const aiAskBtn = document.getElementById('aiAskBtn');

// ── Data state ───────────────────────────────────────────
let classes = [];
let quizzes = [];
let assignments = [];
let currentClassId = '';
let activeQuiz = null;
let netPollInterval = null;
let progressQuizSubmissions = [];
let progressAssignmentSubmissions = [];

// ── Placeholder toggle ──────────────────────────────────
// Never hide the <video> element — only toggle the overlay placeholder.
// This ensures camera video renders immediately when tracks arrive.
function updatePlaceholder() {
  const has = liveVideo && liveVideo.srcObject && liveVideo.srcObject.active;
  if (livePlaceholder) livePlaceholder.classList.toggle('hidden', !!has);
}
if (liveVideo) {
  liveVideo.addEventListener('loadedmetadata', updatePlaceholder);
  liveVideo.addEventListener('playing', updatePlaceholder);
  liveVideo.addEventListener('emptied', updatePlaceholder);
}

// ── Network quality ─────────────────────────────────────
async function pollNetworkQuality() {
  if (!peerConnection) { setNetQuality(4); return; }
  let rtt = 0, count = 0;
  try {
    const stats = await peerConnection.getStats();
    stats.forEach(s => {
      if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.currentRoundTripTime != null) {
        rtt += s.currentRoundTripTime * 1000; count++;
      }
    });
  } catch (_) { }
  if (!count) { setNetQuality(4); return; }
  const avg = rtt / count;
  if (avg < 80) setNetQuality(4, 'active');
  else if (avg < 150) setNetQuality(3, 'warn');
  else if (avg < 300) setNetQuality(2, 'warn');
  else setNetQuality(1, 'bad');
}
function setNetQuality(bars, cls = 'active') {
  const labels = ['Poor', 'Weak', 'Fair', 'Good', 'Excellent'];
  netBars.forEach((b, i) => { if (b) b.className = 'net-bar' + (i < bars ? ' ' + cls : ''); });
  if (netLabel) netLabel.textContent = labels[bars] || 'Good';
}

// ── Peer connection factory ─────────────────────────────
function resetPeer() {
  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.close();
  }
  peerConnection = null;
  if (liveVideo) liveVideo.srcObject = null;
  updatePlaceholder();
}

function buildPeerConnection(remoteId) {
  const pc = new RTCPeerConnection({
    ...rtcConfig,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 5
  });

  pc.ontrack = (event) => {
    const [stream] = event.streams;
    if (stream && liveVideo) {
      liveVideo.srcObject = stream;
      updatePlaceholder();
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', { to: remoteId, candidate: event.candidate, classId: liveClassId });
    }
  };

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === 'connected') {
      showToast('Stream connected! 🎥', 'success');
    } else if (state === 'failed') {
      showToast('Connection lost. Reconnecting...', 'error');
      resetPeer();
      setTimeout(() => {
        if (inSession && liveClassId) {
          socket.emit('student-join', { classId: liveClassId });
        }
      }, 2000);
    } else if (state === 'disconnected') {
      showToast('Stream interrupted...', 'warning');
    }
  };

  return pc;
}

// ── Join / Leave live session ────────────────────────────
function joinLiveRoom(classId) {
  if (!classId) return;
  liveClassId = classId;
  socket.emit('student-join', { classId });
}

function leaveLiveRoom() {
  if (!liveClassId) return;
  socket.emit('student-leave', { classId: liveClassId });
  teacherLive = false;
  handRaised = false;
  resetPeer();
  clearInterval(netPollInterval);
  liveClassId = '';
}

function showLobby() {
  if (liveLobby) liveLobby.classList.remove('hidden');
  if (liveSession) liveSession.classList.add('hidden');
  inSession = false;
}

function showSession() {
  if (liveLobby) liveLobby.classList.add('hidden');
  if (liveSession) liveSession.classList.remove('hidden');
  inSession = true;
}

async function enterClassroom(classId) {
  if (!classId) { showToast('Select a class first.', 'warning'); return; }
  const cls = classes.find(c => c.id === classId);
  if (liveClassName) liveClassName.textContent = cls ? cls.subject : classId;
  currentClassId = classId;
  if (classSelect) classSelect.value = classId;

  await connectSocket();
  await loadRtcConfig();
  setActiveTab('live');
  showSession();
  teacherLive = false;
  applyLiveRoomStatus(classId, false);
  joinLiveRoom(classId);
  netPollInterval = setInterval(pollNetworkQuality, 5000);
  setNetQuality(4);
  showToast(`Joined: ${cls ? cls.subject : classId}`, 'success');
}

function leaveClassroom() {
  leaveLiveRoom();
  showLobby();
  showToast('You left the session.', '');
  if (raiseHandBtn) raiseHandBtn.classList.remove('hand-active');
  setLivePlaceholderContent('Waiting for teacher to start streaming...', 'Join a scheduled class and stay here until the live stream begins.');
}

// ═══════════════════════════════════════════════════════════
//  SOCKET EVENTS
// ═══════════════════════════════════════════════════════════
socket.on('connect', () => {
  accessLost = false;
  if (connectionStatus) { connectionStatus.textContent = '⬤ Connected'; connectionStatus.classList.add('on'); }
  if (mobileLiveLabel) { mobileLiveLabel.textContent = '⬤ Connected'; }
  if (inSession && liveClassId) {
    socket.emit('student-join', { classId: liveClassId });
  }
});

socket.on('connect_error', (error) => {
  const code = error && error.data ? error.data.code : '';
  if (code === 'session_invalidated' || code === 'missing_device_session') {
    handleAccessLoss(error.message);
    return;
  }
  showToast(error.message || 'Live connection failed.', 'error');
});

socket.on('disconnect', () => {
  if (connectionStatus) { connectionStatus.textContent = '⬤ Offline'; connectionStatus.classList.remove('on'); }
  if (mobileLiveLabel) { mobileLiveLabel.textContent = '⬤ Offline'; }
  teacherLive = false;
  resetPeer();
  applyLiveRoomStatus(liveClassId, false);
});

socket.on('app-error', (payload = {}) => {
  if (payload.code === 'session_invalidated' || payload.code === 'missing_device_session') {
    handleAccessLoss(payload.message);
    return;
  }
  if (payload.message) {
    showToast(payload.message, 'error');
  }
});

socket.on('teacher-live', (payload = {}) => {
  if (payload.classId !== liveClassId) return;
  teacherLive = true;
  applyLiveRoomStatus(payload.classId, true);
  showToast('Teacher is live! 🎙️', 'success');
});

socket.on('teacher-left', (payload = {}) => {
  if (payload.classId !== liveClassId) return;
  teacherLive = false;
  resetPeer();
  applyLiveRoomStatus(payload.classId, false);
  showToast('Teacher ended the session.', 'warning');
});

socket.on('teacher-offline', (payload = {}) => {
  if (payload.classId !== liveClassId) return;
  teacherLive = false;
  applyLiveRoomStatus(payload.classId, false);
});

socket.on('waiting-room-status', (payload = {}) => {
  if (payload.classId !== liveClassId) return;
  if (payload.status === 'approved') {
    teacherLive = true;
    applyLiveRoomStatus(payload.classId, true);
    showToast('Teacher approved your join request.', 'success');
    return;
  }
  teacherLive = false;
  applyLiveRoomStatus(payload.classId, false);
  if (payload.status === 'rejected') {
    showToast('Teacher declined your waiting-room request.', 'warning');
    return;
  }
  showToast(payload.teacherLive ? 'Waiting for teacher approval.' : 'You are in the waiting room. Teacher is offline right now.', 'warning');
});

// ── WebRTC signaling ─────────────────────────────────────
socket.on('offer', async (payload = {}) => {
  if (payload.classId !== liveClassId) return;
  try {
    await loadRtcConfig();
    if (peerConnection) resetPeer();
    peerConnection = buildPeerConnection(payload.from);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { to: payload.from, sdp: answer, classId: liveClassId });
  } catch (err) {
    console.error('Failed to handle offer:', err);
    showToast('Stream connection error.', 'error');
  }
});

socket.on('answer', async (payload = {}) => {
  if (!peerConnection || payload.classId !== liveClassId) return;
  try { await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp)); }
  catch (err) { console.error('Failed to handle answer:', err); }
});

socket.on('ice-candidate', async (payload = {}) => {
  if (!peerConnection || payload.classId !== liveClassId) return;
  try { if (payload.candidate) await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate)); }
  catch (_) { }
});

// ── Chat messaging ───────────────────────────────────────
socket.on('teacher-chat', payload => {
  if (payload.classId !== liveClassId) return;
  appendChatMsg(payload.name || 'Teacher', payload.text, false);
});

socket.on('student-chat', payload => {
  if (payload.classId !== liveClassId) return;
  if (payload.studentId === socket.id) return;
  appendChatMsg(payload.name || 'Student', payload.text, false);
});

function appendChatMsg(name, text, isSelf) {
  if (!chatBody) return;
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
  const text = chatInputEl?.value?.trim();
  if (!text || !inSession) {
    if (!inSession) showToast('Join a session first.', 'warning');
    return;
  }
  socket.emit('student-chat', { classId: liveClassId, text });
  appendChatMsg(`${studentName} (you)`, text, true);
  chatInputEl.value = '';
}
if (chatSendBtn) chatSendBtn.addEventListener('click', sendChat);
if (chatInputEl) chatInputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });

// ── Chat/Students tab toggle ─────────────────────────────
chatTabBtn?.addEventListener('click', () => {
  chatTabBtn.classList.add('active'); studentsTabBtn?.classList.remove('active');
  chatBody?.classList.remove('hidden'); studentsBody?.classList.add('hidden');
});
studentsTabBtn?.addEventListener('click', () => {
  studentsTabBtn.classList.add('active'); chatTabBtn?.classList.remove('active');
  studentsBody?.classList.remove('hidden'); chatBody?.classList.add('hidden');
});
chatToggleBtn?.addEventListener('click', () => {
  if (studioPanelAside) studioPanelAside.classList.toggle('mobile-open');
});

// ── Raise hand ───────────────────────────────────────────
if (raiseHandBtn) {
  raiseHandBtn.addEventListener('click', () => {
    if (!inSession || !liveClassId) { showToast('Join a session first.', 'warning'); return; }
    handRaised = !handRaised;
    raiseHandBtn.classList.toggle('hand-active', handRaised);
    socket.emit('student-hand', { classId: liveClassId });
    showToast(handRaised ? 'Hand raised ✋' : 'Hand lowered', handRaised ? '' : 'success');
  });
}

// ── Leave ────────────────────────────────────────────────
if (leaveSessionBtn) leaveSessionBtn.addEventListener('click', leaveClassroom);

// ── Fullscreen ───────────────────────────────────────────
if (fullscreenBtn) {
  fullscreenBtn.addEventListener('click', () => {
    const el = document.getElementById('tab-live');
    if (!document.fullscreenElement) el?.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
  document.addEventListener('fullscreenchange', () => {
    const icon = fullscreenBtn.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = document.fullscreenElement ? 'fullscreen_exit' : 'fullscreen';
  });
}

// ═══════════════════════════════════════════════════════════
//  DATA LOADING
// ═══════════════════════════════════════════════════════════

async function loadClasses() {
  try {
    const d = await fetchJson('/classes');
    classes = d.classes || [];
    if (heroClassCount) heroClassCount.textContent = classes.length;
    renderClassGallery();
    renderUpcomingClasses();
    renderLobbyList();
    renderClassSelect();
  } catch (e) {
    if (liveLobbyList) liveLobbyList.innerHTML = '<div class="status">Unable to load classes.</div>';
  }
}

function renderClassSelect() {
  if (!classSelect) return;
  classSelect.innerHTML = '';
  classes.forEach(cls => {
    const opt = document.createElement('option');
    opt.value = cls.id; opt.textContent = cls.subject;
    classSelect.appendChild(opt);
  });
  if (currentClassId && classes.some(c => c.id === currentClassId)) {
    classSelect.value = currentClassId;
  } else if (classes.length) {
    currentClassId = classes[0].id;
    classSelect.value = currentClassId;
  }
}

function renderClassGalleryLegacyUnused() {
  if (!classGallery) return;
  classGallery.innerHTML = '';
  if (!classes.length) {
    classGallery.innerHTML = '<div class="status">No classes available yet.</div>';
    return;
  }
  classes.forEach(cls => {
    const schedule = getClassScheduleInfo(cls);
    const card = document.createElement('div');
    card.className = 'class-card' + (cls.id === currentClassId ? ' active' : '');
    card.innerHTML = `
      <h3>${escapeHtml(cls.subject)}</h3>
      <p>${escapeHtml(cls.description || 'No description.')}</p>
      <span style="font-size:11px;color:var(--muted)">Mode: ${cls.mode === 'human' ? '🟢 Live Teacher' : '🤖 Self Study'}</span>`;
    card.addEventListener('click', () => selectClass(cls.id));
    classGallery.appendChild(card);
  });
}

function selectClass(classId) {
  currentClassId = classId;
  if (classSelect) classSelect.value = classId;
  const cls = classes.find(c => c.id === classId);
  showToast(`Selected: ${cls ? cls.subject : classId}`, '');
  renderClassGallery();
  loadQuizzes(classId);
  loadAssignments(classId);
  loadExamList(classId);
}

if (classSelect) classSelect.addEventListener('change', () => selectClass(classSelect.value));

function renderLobbyListLegacyUnused() {
  if (!liveLobbyList) return;
  liveLobbyList.innerHTML = '';
  if (!classes.length) {
    liveLobbyList.innerHTML = '<div class="status" style="color:var(--studio-muted)">No classes available.</div>';
    return;
  }
  classes.forEach(cls => {
    const item = document.createElement('div');
    item.className = 'lobby-item';
    item.innerHTML = `
      <div class="lobby-info">
        <h4>${escapeHtml(cls.subject)}</h4>
        <p>${escapeHtml(cls.description || 'No description.')} · Mode: ${cls.mode === 'human' ? 'Live Teacher' : 'Self Study'}</p>
      </div>`;
    const btn = document.createElement('button');
    btn.className = 'ghost-btn';
    btn.textContent = 'Join';
    btn.addEventListener('click', () => enterClassroom(cls.id));
    item.appendChild(btn);
    liveLobbyList.appendChild(item);
  });
}

function renderClassGallery() {
  if (!classGallery) return;
  classGallery.innerHTML = '';
  if (!classes.length) {
    classGallery.innerHTML = '<div class="status">No classes available yet.</div>';
    return;
  }
  classes.forEach((cls) => {
    const schedule = getClassScheduleInfo(cls);
    const card = document.createElement('div');
    card.className = 'class-card' + (cls.id === currentClassId ? ' active' : '');
    card.innerHTML = `
      <h3>${escapeHtml(cls.subject)}</h3>
      <p>${escapeHtml(cls.description || 'No description.')}</p>
      <div class="class-meta">
        <div class="class-meta-line">Next class: ${escapeHtml(schedule.nextSessionLabel)}</div>
        <div class="class-chip-row">
          <span class="class-chip">Mode: ${escapeHtml(cls.mode === 'human' ? 'Live Teacher' : 'Self Study')}</span>
          ${schedule.waitingRoomEnabled ? '<span class="class-chip waiting">Waiting room on</span>' : ''}
        </div>
      </div>`;
    card.addEventListener('click', () => selectClass(cls.id));
    classGallery.appendChild(card);
  });
}

function renderUpcomingClasses() {
  if (!upcomingClassList) return;
  const items = classes
    .map((cls) => {
      const schedule = getClassScheduleInfo(cls);
      return (schedule.nextSession || cls?.nextSession) ? { cls, schedule } : null;
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.schedule.nextSession?.startsAt || 0) - new Date(b.schedule.nextSession?.startsAt || 0));

  if (!items.length) {
    upcomingClassList.innerHTML = '<div class="status">No upcoming class scheduled yet.</div>';
    return;
  }

  upcomingClassList.innerHTML = items.slice(0, 8).map(({ cls, schedule }) => `
    <div class="upcoming-class-card">
      <div class="upcoming-class-head">
        <div>
          <h4>${escapeHtml(schedule.nextSession?.title || cls.subject)}</h4>
          <div class="upcoming-class-time">${escapeHtml(schedule.nextSessionLabel)}</div>
        </div>
        ${schedule.waitingRoomEnabled ? '<span class="schedule-badge waiting">Waiting room</span>' : '<span class="schedule-badge">Scheduled</span>'}
      </div>
      <p>${escapeHtml(schedule.nextSession?.description || cls.scheduleNotes || cls.description || 'Live class scheduled for this subject.')}</p>
    </div>
  `).join('');
}

function renderLobbyList() {
  if (!liveLobbyList) return;
  liveLobbyList.innerHTML = '';
  if (!classes.length) {
    liveLobbyList.innerHTML = '<div class="status" style="color:var(--studio-muted)">No classes available.</div>';
    return;
  }
  classes.forEach((cls) => {
    const schedule = getClassScheduleInfo(cls);
    const item = document.createElement('div');
    item.className = 'lobby-item';
    item.innerHTML = `
      <div class="lobby-info">
        <h4>${escapeHtml(cls.subject)}</h4>
        <p>${escapeHtml(cls.description || 'No description.')} · Mode: ${cls.mode === 'human' ? 'Live Teacher' : 'Self Study'}</p>
        <div class="lobby-meta">
          <p>${escapeHtml(`Next class: ${schedule.nextSessionLabel}`)}</p>
          ${schedule.waitingRoomEnabled ? '<span class="schedule-badge waiting">Teacher approval required</span>' : ''}
        </div>
      </div>`;
    const btn = document.createElement('button');
    btn.className = 'ghost-btn';
    btn.textContent = schedule.waitingRoomEnabled ? 'Enter Waiting Room' : 'Join';
    btn.addEventListener('click', () => enterClassroom(cls.id));
    const actions = document.createElement('div');
    actions.className = 'lobby-actions';
    actions.appendChild(btn);
    item.appendChild(actions);
    liveLobbyList.appendChild(item);
  });
}

if (refreshLobbyBtn) refreshLobbyBtn.addEventListener('click', loadClasses);

// ── Quizzes ──────────────────────────────────────────────
async function loadQuizzes(classId) {
  if (!classId) return;
  try {
    const d = await fetchJson(`/quizzes?classId=${encodeURIComponent(classId)}`);
    quizzes = d.quizzes || [];
    if (heroQuizCount) heroQuizCount.textContent = quizzes.length;
    renderQuizList();
  } catch (_) {
    if (quizListEl) quizListEl.innerHTML = '<div class="status">Unable to load quizzes.</div>';
  }
}

function renderQuizList() {
  if (!quizListEl) return;
  quizListEl.innerHTML = '';
  const search = quizSearch?.value.trim().toLowerCase() || '';
  const filtered = search ? quizzes.filter(q => q.question.toLowerCase().includes(search)) : quizzes;
  if (!filtered.length) {
    quizListEl.innerHTML = `<div class="status">${search ? 'No matches.' : 'No quizzes yet.'}</div>`;
    return;
  }
  filtered.forEach((quiz, i) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `<h4>${i + 1}. ${escapeHtml(quiz.question)}</h4>`;
    item.addEventListener('click', () => openQuiz(quiz));
    quizListEl.appendChild(item);
  });
}

function openQuiz(quiz) {
  activeQuiz = quiz;
  if (activeQuizTitle) activeQuizTitle.textContent = quiz.question;
  if (!quizQuestions) return;
  quizQuestions.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'question-card';
  const title = document.createElement('div');
  title.className = 'question-title';
  title.textContent = quiz.question;
  card.appendChild(title);
  const type = String(quiz.questionType || 'radio').toLowerCase();
  if (type === 'radio' || type === 'checkbox') {
    const grid = document.createElement('div');
    grid.className = 'options-grid';
    quiz.options.forEach((opt, idx) => {
      const label = document.createElement('label');
      label.className = 'radio-label';
      label.dataset.index = idx;
      const input = document.createElement('input');
      input.type = type === 'checkbox' ? 'checkbox' : 'radio';
      input.name = `quiz-${quiz.id}`;
      input.value = idx;
      label.appendChild(input);
      const span = document.createElement('span');
      span.textContent = opt;
      label.appendChild(span);
      grid.appendChild(label);
    });
    card.appendChild(grid);
  } else if (type === 'description' || type === 'coding') {
    const textarea = document.createElement('textarea');
    textarea.id = `quiz-${quiz.id}-text`;
    textarea.rows = 8;
    textarea.placeholder = type === 'coding' ? 'Write your code answer...' : 'Write your answer...';
    card.appendChild(textarea);
  } else {
    const input = document.createElement('input');
    input.id = `quiz-${quiz.id}-text`;
    input.type = type === 'number' ? 'number' : 'text';
    input.placeholder = 'Enter your answer';
    card.appendChild(input);
  }
  quizQuestions.appendChild(card);
  if (quizActions) quizActions.classList.remove('hidden');
}

if (submitQuizBtn) {
  submitQuizBtn.addEventListener('click', async () => {
    if (!activeQuiz) return;
    const type = String(activeQuiz.questionType || 'radio').toLowerCase();
    let answers = [];
    if (type === 'radio') {
      const selected = document.querySelector(`input[name="quiz-${activeQuiz.id}"]:checked`);
      answers = [{ quizId: activeQuiz.id, answerIndex: selected ? Number(selected.value) : -1, answerText: '', answerValues: [] }];
    } else if (type === 'checkbox') {
      const selectedValues = Array.from(document.querySelectorAll(`input[name="quiz-${activeQuiz.id}"]:checked`)).map((input) => input.value);
      answers = [{ quizId: activeQuiz.id, answerIndex: -1, answerText: '', answerValues: selectedValues }];
    } else {
      const textInput = document.getElementById(`quiz-${activeQuiz.id}-text`);
      answers = [{ quizId: activeQuiz.id, answerIndex: -1, answerText: textInput ? String(textInput.value || '').trim() : '', answerValues: [] }];
    }
    if (quizStatus) quizStatus.textContent = 'Submitting...';
    try {
      const d = await postJson('/submit-quiz', { answers });
      if (quizStatus) quizStatus.textContent = `Score: ${d.score}/${d.total}`;
      d.results?.forEach(result => {
        document.querySelectorAll(`[name="quiz-${result.quizId}"]`).forEach(inp => {
          const label = inp.closest('.radio-label');
          if (!label) return;
          const idx = Number(label.dataset.index);
          if (idx === result.correctIndex) { label.style.borderColor = 'var(--success)'; label.style.background = 'rgba(0,137,123,.08)'; }
          if (idx === result.selectedIndex && idx !== result.correctIndex) { label.style.borderColor = 'var(--danger)'; label.style.background = 'rgba(198,40,40,.08)'; }
        });
      });
      showToast(`Quiz score: ${d.score}/${d.total}`, 'success');
      loadProgress();
    } catch (_) { if (quizStatus) quizStatus.textContent = 'Network error.'; }
  });
}

if (quizSearch) quizSearch.addEventListener('input', renderQuizList);
if (refreshQuizzesBtn) refreshQuizzesBtn.addEventListener('click', () => loadQuizzes(currentClassId));

// ── Assignments ──────────────────────────────────────────
async function loadAssignments(classId) {
  if (!classId) return;
  try {
    const d = await fetchJson(`/assignments?classId=${encodeURIComponent(classId)}`);
    assignments = d.assignments || [];
    if (heroAssignmentCount) heroAssignmentCount.textContent = assignments.length;
    renderAssignmentSelect();
  } catch (_) { }
}

function renderAssignmentSelect() {
  if (!assignmentSelect) return;
  assignmentSelect.innerHTML = '';
  const search = assignmentSearch?.value.trim().toLowerCase() || '';
  const filtered = search
    ? assignments.filter(a => `${a.title} ${a.description}`.toLowerCase().includes(search))
    : assignments;
  if (!filtered.length) {
    assignmentSelect.innerHTML = '<option value="">No assignments</option>';
    assignmentSelect.disabled = true;
    if (assignmentPreviewTitle) assignmentPreviewTitle.textContent = 'No assignments available';
    if (assignmentPreviewDesc) assignmentPreviewDesc.textContent = '';
    return;
  }
  assignmentSelect.disabled = false;
  filtered.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id; opt.textContent = a.title;
    assignmentSelect.appendChild(opt);
  });
  updateAssignmentPreview();
}

function updateAssignmentPreview() {
  const a = assignments.find(x => x.id === assignmentSelect?.value);
  if (assignmentPreviewTitle) assignmentPreviewTitle.textContent = a ? a.title : 'Select an assignment';
  if (assignmentPreviewDesc) assignmentPreviewDesc.textContent = a ? (a.description || 'No description.') : '';
}

if (assignmentSelect) assignmentSelect.addEventListener('change', updateAssignmentPreview);
if (assignmentSearch) assignmentSearch.addEventListener('input', renderAssignmentSelect);

if (assignmentForm) {
  assignmentForm.addEventListener('submit', async e => {
    e.preventDefault();
    const answer = assignmentAnswer?.value.trim();
    const assignmentId = assignmentSelect?.value;
    if (!answer || !assignmentId) {
      if (assignmentStatusEl) assignmentStatusEl.textContent = 'Fill all fields.';
      return;
    }
    if (assignmentStatusEl) assignmentStatusEl.textContent = 'Submitting...';
    try {
      await postJson('/submit-assignment', { assignmentId, answer });
      if (assignmentStatusEl) assignmentStatusEl.textContent = 'Submitted successfully!';
      assignmentForm.reset();
      showToast('Assignment submitted ✓', 'success');
      loadProgress();
    } catch (_) { if (assignmentStatusEl) assignmentStatusEl.textContent = 'Network error.'; }
  });
}

// ═══════════════════════════════════════════════════════════
//  PROGRESS TRACKER
// ═══════════════════════════════════════════════════════════

async function loadProgress() {
  if (!sessionUser) {
    progressQuizSubmissions = [];
    progressAssignmentSubmissions = [];
    renderProgress();
    return;
  }

  const rangeDays = progressRange ? Number(progressRange.value) : 0;
  const params = new URLSearchParams({ limit: '200' });
  if (rangeDays) {
    const startDate = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
    params.set('start', startDate.toISOString());
  }

  const [qr, ar] = await Promise.allSettled([
    fetchJson(`/quiz-submissions?${params.toString()}`),
    fetchJson(`/assignment-submissions?${params.toString()}`)
  ]);

  progressQuizSubmissions = qr.status === 'fulfilled' ? qr.value.submissions || [] : [];
  progressAssignmentSubmissions = ar.status === 'fulfilled' ? ar.value.submissions || [] : [];

  progressQuizSubmissions.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
  progressAssignmentSubmissions.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

  renderProgress();
}

function renderProgress() {
  const qCount = progressQuizSubmissions.length;
  const aCount = progressAssignmentSubmissions.length;
  const totalScore = progressQuizSubmissions.reduce((s, x) => s + Number(x.score || 0), 0);
  const totalPossible = progressQuizSubmissions.reduce((s, x) => s + Number(x.total || 0), 0);
  const avg = totalPossible ? Math.round((totalScore / totalPossible) * 100) : 0;

  if (progressQuizCount) progressQuizCount.textContent = qCount;
  if (progressAssignmentCount) progressAssignmentCount.textContent = aCount;
  if (progressAvgScore) progressAvgScore.textContent = `${avg}%`;

  // Update hero card
  if (heroAvgScore) heroAvgScore.textContent = totalPossible ? `${avg}%` : '--';
  if (heroAvgScoreSub) heroAvgScoreSub.textContent = totalPossible ? `${qCount} quizzes taken` : 'Take a quiz to see';

  // Last activity
  const lastQ = progressQuizSubmissions[0]?.submittedAt || null;
  const lastA = progressAssignmentSubmissions[0]?.submittedAt || null;
  const times = [lastQ, lastA].filter(Boolean).map(v => new Date(v).getTime());
  const lastActive = times.length ? new Date(Math.max(...times)).toISOString() : null;
  if (progressLastActive) progressLastActive.textContent = lastActive ? formatShortTime(lastActive) : '--';

  // Quiz history
  if (quizHistoryList) {
    quizHistoryList.innerHTML = '';
    if (!qCount) {
      quizHistoryList.innerHTML = '<div class="status">No quiz attempts yet.</div>';
    } else {
      progressQuizSubmissions.slice(0, 8).forEach(s => {
        const pct = s.total ? Math.round((s.score / s.total) * 100) : 0;
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
          <div class="history-title">Score: ${s.score}/${s.total} (${pct}%)</div>
          <div class="history-meta">${formatShortTime(s.submittedAt)}</div>`;
        quizHistoryList.appendChild(item);
      });
    }
  }

  // Assignment history
  if (assignmentHistoryList) {
    assignmentHistoryList.innerHTML = '';
    if (!aCount) {
      assignmentHistoryList.innerHTML = '<div class="status">No assignments submitted yet.</div>';
    } else {
      progressAssignmentSubmissions.slice(0, 8).forEach(s => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
          <div class="history-title">Assignment submitted</div>
          <div class="history-meta">${formatShortTime(s.submittedAt)}</div>`;
        assignmentHistoryList.appendChild(item);
      });
    }
  }
}

if (refreshProgress) refreshProgress.addEventListener('click', loadProgress);
if (progressRange) progressRange.addEventListener('change', loadProgress);

// ═══════════════════════════════════════════════════════════
//  AI MENTOR
// ═══════════════════════════════════════════════════════════

// Maintain conversation history for context
let aiConversationHistory = [];

function appendAiMsg(text, role) {
  if (!aiChatArea) return;
  // Remove welcome message
  const welcome = aiChatArea.querySelector('.ai-welcome');
  if (welcome) welcome.remove();
  const el = document.createElement('div');
  el.className = `ai-msg ${role}`;
  el.textContent = text;
  aiChatArea.appendChild(el);
  aiChatArea.scrollTop = aiChatArea.scrollHeight;
  return el;
}

async function askAi() {
  const question = aiQuestion?.value?.trim();
  if (!question) return;
  
  // Add user message to history and UI
  aiConversationHistory.push({ role: 'user', content: question });
  appendAiMsg(question, 'user');
  aiQuestion.value = '';
  
  const loader = appendAiMsg('Thinking...', 'bot loading');
  try {
    // Send full conversation history to maintain context
    const d = await postJson('/ask', { 
      question,
      conversationHistory: aiConversationHistory.slice(0, -1) // Exclude the current user message (will be added by server)
    });
    
    if (loader) loader.remove();
    
    const answer = d.answer || 'No answer received.';
    
    // Add assistant response to history
    aiConversationHistory.push({ role: 'assistant', content: answer });
    
    appendAiMsg(answer, 'bot');
  } catch (error) {
    if (loader) loader.remove();
    
    // Keep conversation history even on error
    aiConversationHistory.pop(); // Remove the user message that failed
    
    appendAiMsg(
      error?.message || 'AI request failed. Please try again.',
      'bot'
    );
  }
}

// Clear conversation when switching tabs
const aiPanel = document.getElementById('tab-ai');
if (aiPanel) {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        // Check if panel is being hidden
        if (!aiPanel.classList.contains('active')) {
          // Panel is hidden, optionally clear history (comment out to keep history)
          // aiConversationHistory = [];
        }
      }
    });
  });
  observer.observe(aiPanel, { attributes: true });
}

if (aiAskBtn) aiAskBtn.addEventListener('click', askAi);
if (aiQuestion) aiQuestion.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); askAi(); } });

// ═══════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════

async function loadAll() {
  await loadRtcConfig();
  await loadClasses();
  if (currentClassId) {
    loadQuizzes(currentClassId);
    loadAssignments(currentClassId);
  }
  loadExamList();
  loadProgress();
}

showLobby();
updatePlaceholder();
openGate();
loadTabFromHash();

async function bootStudentPortal() {
  try {
    const user = await window.olmsAuth.ensurePortalAccess(['student']);
    if (!user) return;
    updateStudentIdentity(user);
    closeGate();
    await connectSocket();
    await loadAll();
  } catch (error) {
    console.error(error);
    openGate();
  }
}

bootStudentPortal();

// Periodic refresh
setInterval(loadClasses, 20000);

// ══════════════════════════════════════════════════════════
//  AI TEACHING MODE – STUDENT SIDE
// ══════════════════════════════════════════════════════════

(function () {
  let aiModeActive = false;
  let aiModeBanner = null;

  function createAiModeBanner() {
    if (aiModeBanner) return;
    const session = document.getElementById('liveSession');
    if (!session) return;
    aiModeBanner = document.createElement('div');
    aiModeBanner.className = 'ai-mode-banner hidden';
    aiModeBanner.id = 'aiModeBanner';
    aiModeBanner.innerHTML = `
      <div class="ai-mode-icon">
        <span class="material-symbols-outlined">smart_toy</span>
      </div>
      <div class="ai-mode-info">
        <div class="ai-mode-title">AI Teacher is Live</div>
        <div class="ai-mode-topic" id="aiModeTopic">Listening mode — chat is disabled</div>
      </div>
      <div class="ai-mode-wave">
        <span></span><span></span><span></span><span></span><span></span>
      </div>`;
    // Insert at the top of the session container
    session.insertBefore(aiModeBanner, session.firstChild);
  }

  function enableAiListeningMode(topic) {
    aiModeActive = true;
    createAiModeBanner();
    if (aiModeBanner) {
      aiModeBanner.classList.remove('hidden');
      const topicEl = document.getElementById('aiModeTopic');
      if (topicEl) topicEl.textContent = topic ? `Topic: ${topic} — Listening mode` : 'Listening mode — chat is disabled';
    }

    // Disable chat input
    if (chatInputEl) {
      chatInputEl.disabled = true;
      chatInputEl.placeholder = '🤖 AI Teacher is active — listening mode';
      chatInputEl.style.opacity = '0.4';
    }
    if (chatSendBtn) {
      chatSendBtn.disabled = true;
      chatSendBtn.style.opacity = '0.3';
    }

    // Disable hand raise
    if (raiseHandBtn) {
      raiseHandBtn.disabled = true;
      raiseHandBtn.style.opacity = '0.4';
      raiseHandBtn.title = 'Disabled during AI teaching';
    }

    showToast('🤖 AI Teacher is now teaching. Chat is disabled.', '');
  }

  function disableAiListeningMode() {
    aiModeActive = false;
    if (aiModeBanner) aiModeBanner.classList.add('hidden');

    // Re-enable chat input
    if (chatInputEl) {
      chatInputEl.disabled = false;
      chatInputEl.placeholder = 'Type a message…';
      chatInputEl.style.opacity = '';
    }
    if (chatSendBtn) {
      chatSendBtn.disabled = false;
      chatSendBtn.style.opacity = '';
    }

    // Re-enable hand raise
    if (raiseHandBtn) {
      raiseHandBtn.disabled = false;
      raiseHandBtn.style.opacity = '';
      raiseHandBtn.title = 'Raise / lower hand';
    }

    showToast('AI Teacher session ended. Chat is now enabled.', 'success');
  }

  // Listen for AI teaching status from server
  socket.on('ai-teaching-status', (payload = {}) => {
    if (payload.classId !== liveClassId) return;
    if (payload.active) {
      enableAiListeningMode(payload.topic);
    } else {
      disableAiListeningMode();
    }
  });

  socket.on('ai-teaching-sentence', (payload = {}) => {
    if (payload.classId !== liveClassId || !payload.text) return;
    try {
      const utterance = new SpeechSynthesisUtterance(payload.text);
      utterance.lang = payload.lang || 'en-US';
      utterance.rate = payload.rate || 1;
      utterance.pitch = payload.pitch || 1;
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.warn('Student TTS error:', error);
    }
  });

  // Override sendChat to block locally too
  const origSendChat = sendChat;
  window.sendChat = function () {
    if (aiModeActive) {
      showToast('Chat is disabled while AI Teacher is active.', 'warning');
      return;
    }
    origSendChat();
  };
})();


//=================================url-parameters========================

window.onload = function() {
  const hash = window.location.hash.substring(1);
  if (hash) {
    urlSection(hash);
  }
};
function urlSection(sectionName) {
  window.location.hash = sectionHashMap[sectionName] || 'dashboard';
}
