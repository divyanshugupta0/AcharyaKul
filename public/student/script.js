const tabs = Array.from(document.querySelectorAll('.side-btn'));
const panels = Array.from(document.querySelectorAll('.panel'));
const socket = io();

function setActiveTab(tabName) {
  tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
  panels.forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${tabName}`));
}

tabs.forEach((btn) => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
});

const classSelect = document.getElementById('classSelect');
const classGallery = document.getElementById('classGallery');
const activeClassLabel = document.getElementById('activeClassLabel');
const classModePill = document.getElementById('classModePill');
const liveIndicator = document.getElementById('liveIndicator');
const liveBadge = document.getElementById('liveBadge');
const liveVideo = document.getElementById('liveVideo');
const livePlaceholder = document.getElementById('livePlaceholder');
const liveStatusText = document.getElementById('liveStatusText');
const summarySubject = document.getElementById('summarySubject');
const summaryDesc = document.getElementById('summaryDesc');
const summaryNext = document.getElementById('summaryNext');
const summarySchedule = document.getElementById('summarySchedule');
const heroNext = document.getElementById('heroNext');
const heroNextSub = document.getElementById('heroNextSub');
const heroQuizCount = document.getElementById('heroQuizCount');
const heroAssignmentCount = document.getElementById('heroAssignmentCount');
const upcomingList = document.getElementById('upcomingList');
const connectionStatus = document.getElementById('connectionStatus');
const enterClassroomBtn = document.getElementById('enterClassroomBtn');

let classes = [];
let currentClassId = '';
let currentMode = 'ai';
let teacherLive = false;
let peerConnection = null;

const rtcConfig = {
  iceServers: []
};
let rtcConfigReady = null;

async function loadRtcConfig() {
  if (rtcConfigReady) {
    return rtcConfigReady;
  }

  rtcConfigReady = fetch('/rtc-config')
    .then((res) => res.json())
    .then((data) => {
      if (data && Array.isArray(data.iceServers)) {
        rtcConfig.iceServers = data.iceServers;
      }
    })
    .catch(() => {});

  return rtcConfigReady;
}

const thumbPalette = [
  ['#d9f2ec', '#fde8d6'],
  ['#e0ecff', '#ffe7d8'],
  ['#fef3c7', '#dbeafe'],
  ['#e3fcec', '#fce7f3'],
  ['#f0f4ff', '#fef0f2']
];

function updateLiveDisplay() {
  const isLive = teacherLive;
  const hasStream = Boolean(liveVideo.srcObject);

  liveIndicator.classList.toggle('on', isLive);
  liveBadge.classList.toggle('on', isLive && hasStream);

  if (!currentClassId) {
    liveStatusText.textContent = 'Select a class to join live.';
  } else {
    liveStatusText.textContent = isLive
      ? hasStream
        ? 'Live class is ON'
        : 'Teacher is joining...'
      : 'Live class is OFF';
  }

  livePlaceholder.textContent = isLive
    ? 'Teacher live stream will appear here.'
    : 'Live class is not running right now.';

  liveVideo.style.display = isLive && hasStream ? 'block' : 'none';
  livePlaceholder.classList.toggle('hidden', isLive && hasStream);
}

function applyMode(mode) {
  currentMode = mode;
  updateLiveDisplay();
}

liveVideo.addEventListener('loadedmetadata', updateLiveDisplay);
liveVideo.addEventListener('playing', updateLiveDisplay);
liveVideo.addEventListener('emptied', updateLiveDisplay);

function resetPeer() {
  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.close();
  }
  peerConnection = null;
  liveVideo.srcObject = null;
}

function joinLiveRoom(classId) {
  if (!classId) {
    return;
  }
  socket.emit('student-join', { classId });
}

function leaveLiveRoom(classId) {
  if (!classId) {
    return;
  }
  socket.emit('student-leave', { classId });
  teacherLive = false;
  resetPeer();
  updateLiveDisplay();
}

function buildPeerConnection(remoteId) {
  const peer = new RTCPeerConnection(rtcConfig);

  peer.ontrack = (event) => {
    const [stream] = event.streams;
    if (stream) {
      liveVideo.srcObject = stream;
      updateLiveDisplay();
    }
  };

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', { to: remoteId, candidate: event.candidate, classId: currentClassId });
    }
  };

  return peer;
}

socket.on('connect', () => {
  if (connectionStatus) {
    connectionStatus.textContent = 'Connected';
  }
  if (currentClassId) {
    joinLiveRoom(currentClassId);
  }
});

socket.on('disconnect', () => {
  if (connectionStatus) {
    connectionStatus.textContent = 'Disconnected';
  }
  teacherLive = false;
  resetPeer();
  updateLiveDisplay();
});

socket.on('teacher-live', (payload = {}) => {
  if (payload.classId !== currentClassId) {
    return;
  }
  teacherLive = true;
  updateLiveDisplay();
});

socket.on('teacher-left', (payload = {}) => {
  if (payload.classId !== currentClassId) {
    return;
  }
  teacherLive = false;
  resetPeer();
  updateLiveDisplay();
});

socket.on('teacher-offline', (payload = {}) => {
  if (payload.classId !== currentClassId) {
    return;
  }
  teacherLive = false;
  resetPeer();
  updateLiveDisplay();
});

socket.on('offer', async (payload = {}) => {
  if (payload.classId !== currentClassId) {
    return;
  }

  try {
    await loadRtcConfig();
    if (!peerConnection) {
      peerConnection = buildPeerConnection(payload.from);
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { to: payload.from, sdp: answer, classId: currentClassId });
  } catch (err) {
    console.error('Failed to handle offer', err);
  }
});

socket.on('answer', async (payload = {}) => {
  if (!peerConnection || payload.classId !== currentClassId) {
    return;
  }
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
  } catch (err) {
    console.error('Failed to handle answer', err);
  }
});

socket.on('ice-candidate', async (payload = {}) => {
  if (!peerConnection || payload.classId !== currentClassId) {
    return;
  }
  try {
    if (payload.candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
    }
  } catch (err) {
    console.error('Failed to add ICE candidate', err);
  }
});

enterClassroomBtn.addEventListener('click', async () => {
  setActiveTab('teaching');

  if (!currentClassId) {
    liveStatusText.textContent = 'Select a class to enter the classroom.';
    return;
  }

  joinLiveRoom(currentClassId);

  if (!teacherLive) {
    liveStatusText.textContent = 'Teacher is not live yet.';
    return;
  }

  if (liveVideo.srcObject) {
    try {
      await liveVideo.play();
    } catch (err) {
      // Autoplay restrictions can block playback; user can press play manually.
    }

    if (liveVideo.requestFullscreen) {
      try {
        await liveVideo.requestFullscreen();
      } catch (err) {
        // Fullscreen may be blocked; ignore.
      }
    }
  }
});

const quizList = document.getElementById('quizList');
const quizResult = document.getElementById('quizResult');
const submitQuiz = document.getElementById('submitQuiz');
const refreshQuizzes = document.getElementById('refreshQuizzes');
const quizStudentName = document.getElementById('quizStudentName');

let quizzes = [];

async function loadQuizzes(classId) {
  if (!classId) {
    quizList.innerHTML = '<div class="hint">Select a class to view quizzes.</div>';
    heroQuizCount.textContent = '0';
    return;
  }

  try {
    const response = await fetch(`/quizzes?classId=${encodeURIComponent(classId)}`);
    const data = await response.json();
    quizzes = data.quizzes || [];
    heroQuizCount.textContent = String(quizzes.length);
    renderQuizzes();
  } catch (err) {
    quizList.innerHTML = '<div class="hint">Unable to load quizzes.</div>';
    heroQuizCount.textContent = '0';
  }
}

function renderQuizzes() {
  quizList.innerHTML = '';
  quizResult.textContent = '';

  if (!quizzes.length) {
    quizList.innerHTML = '<div class="hint">No quizzes available yet.</div>';
    return;
  }

  quizzes.forEach((quiz, index) => {
    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.dataset.quizId = quiz.id;

    const heading = document.createElement('h4');
    heading.textContent = `${index + 1}. ${quiz.question}`;
    card.appendChild(heading);

    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'options';

    quiz.options.forEach((option, optionIndex) => {
      const label = document.createElement('label');
      label.className = 'option';
      label.dataset.index = optionIndex;

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `quiz-${quiz.id}`;
      input.value = optionIndex;

      const text = document.createElement('span');
      text.textContent = option;

      label.appendChild(input);
      label.appendChild(text);
      optionsWrap.appendChild(label);
    });

    card.appendChild(optionsWrap);
    quizList.appendChild(card);
  });
}

submitQuiz.addEventListener('click', async () => {
  if (!quizzes.length) {
    return;
  }

  const answers = quizzes.map((quiz) => {
    const selected = document.querySelector(`input[name="quiz-${quiz.id}"]:checked`);
    return {
      quizId: quiz.id,
      answerIndex: selected ? Number(selected.value) : -1
    };
  });

  const studentName = quizStudentName.value.trim() || 'Anonymous';

  try {
    const response = await fetch('/submit-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName, answers })
    });

    const data = await response.json();
    if (!response.ok) {
      quizResult.textContent = data.error || 'Quiz submission failed.';
      return;
    }

    quizResult.textContent = `Score: ${data.score}/${data.total}`;

    data.results.forEach((result) => {
      const card = document.querySelector(`[data-quiz-id="${result.quizId}"]`);
      if (!card) {
        return;
      }

      card.querySelectorAll('.option').forEach((label) => {
        label.classList.remove('correct', 'incorrect');
        const index = Number(label.dataset.index);
        if (index === result.correctIndex) {
          label.classList.add('correct');
        }
        if (index === result.selectedIndex && result.selectedIndex !== result.correctIndex) {
          label.classList.add('incorrect');
        }
      });
    });
  } catch (err) {
    quizResult.textContent = 'Network error. Please try again.';
  }
});

refreshQuizzes.addEventListener('click', () => loadQuizzes(currentClassId));

const assignmentSelect = document.getElementById('assignmentSelect');
const assignmentPreviewTitle = document.getElementById('assignmentPreviewTitle');
const assignmentPreviewDesc = document.getElementById('assignmentPreviewDesc');
const assignmentForm = document.getElementById('assignmentForm');
const assignmentStatus = document.getElementById('assignmentStatus');
const submitAssignment = document.getElementById('submitAssignment');

let assignments = [];

async function loadAssignments(classId) {
  if (!classId) {
    assignmentSelect.innerHTML = '<option value="">Select a class first</option>';
    assignmentSelect.disabled = true;
    submitAssignment.disabled = true;
    assignmentPreviewTitle.textContent = 'Select a class to view assignments';
    assignmentPreviewDesc.textContent = '';
    heroAssignmentCount.textContent = '0';
    return;
  }

  try {
    const response = await fetch(`/assignments?classId=${encodeURIComponent(classId)}`);
    const data = await response.json();
    assignments = data.assignments || [];
    heroAssignmentCount.textContent = String(assignments.length);
    renderAssignments();
  } catch (err) {
    assignmentPreviewTitle.textContent = 'Unable to load assignments';
    assignmentPreviewDesc.textContent = 'Check the server and try again.';
    heroAssignmentCount.textContent = '0';
  }
}

function renderAssignments() {
  assignmentSelect.innerHTML = '';

  if (!assignments.length) {
    assignmentSelect.innerHTML = '<option value="">No assignments yet</option>';
    assignmentSelect.disabled = true;
    submitAssignment.disabled = true;
    assignmentPreviewTitle.textContent = 'No assignments available';
    assignmentPreviewDesc.textContent = 'Please check back later.';
    return;
  }

  assignmentSelect.disabled = false;
  submitAssignment.disabled = false;

  assignments.forEach((assignment) => {
    const option = document.createElement('option');
    option.value = assignment.id;
    option.textContent = assignment.title;
    assignmentSelect.appendChild(option);
  });

  updateAssignmentPreview();
}

function updateAssignmentPreview() {
  const selectedId = assignmentSelect.value;
  const assignment = assignments.find((item) => item.id === selectedId);
  if (!assignment) {
    assignmentPreviewTitle.textContent = 'Select an assignment';
    assignmentPreviewDesc.textContent = 'Assignments created by the teacher will appear here.';
    return;
  }

  assignmentPreviewTitle.textContent = assignment.title;
  assignmentPreviewDesc.textContent = assignment.description || 'No description provided.';
}

assignmentSelect.addEventListener('change', updateAssignmentPreview);

assignmentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!assignments.length) {
    return;
  }

  const studentName = document.getElementById('studentName').value.trim();
  const answer = document.getElementById('assignmentAnswer').value.trim();
  const assignmentId = assignmentSelect.value;

  if (!studentName || !answer || !assignmentId) {
    assignmentStatus.textContent = 'Please fill all fields.';
    return;
  }

  assignmentStatus.textContent = 'Submitting...';

  try {
    const response = await fetch('/submit-assignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentId, studentName, answer })
    });

    const data = await response.json();
    if (!response.ok) {
      assignmentStatus.textContent = data.error || 'Submission failed.';
      return;
    }

    assignmentStatus.textContent = 'Submitted successfully.';
    assignmentForm.reset();
  } catch (err) {
    assignmentStatus.textContent = 'Network error. Please try again.';
  }
});

function renderClassCards() {
  classGallery.innerHTML = '';

  if (!classes.length) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'No classes available yet.';
    classGallery.appendChild(empty);
    return;
  }

  classes.forEach((classItem, index) => {
    const card = document.createElement('div');
    card.className = 'class-card';
    card.dataset.classId = classItem.id;
    const palette = thumbPalette[index % thumbPalette.length];
    card.style.setProperty('--thumb', `linear-gradient(135deg, ${palette[0]}, ${palette[1]})`);

    const nextSession = classItem.nextSession ? `Next: ${classItem.nextSession}` : 'Next: TBA';
    const modeLabel = classItem.mode === 'human' ? 'Live Teacher' : 'Self Study';

    card.innerHTML = `
      <div class="class-thumb"></div>
      <div class="class-name">${classItem.subject}</div>
      <div class="class-desc">${classItem.description || 'No description available.'}</div>
      <div class="class-meta">${nextSession}</div>
      <div class="class-meta">Mode: ${modeLabel}</div>
    `;

    card.addEventListener('click', () => {
      classSelect.value = classItem.id;
      updateClassContext();
    });

    classGallery.appendChild(card);
  });
}

function highlightActiveClass() {
  document.querySelectorAll('.class-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.classId === currentClassId);
  });
}

function renderClassOptions(preferredId) {
  classSelect.innerHTML = '';

  if (!classes.length) {
    classSelect.innerHTML = '<option value="">No classes available</option>';
    classSelect.disabled = true;
    classModePill.textContent = 'Mode: Unavailable';
    classModePill.classList.remove('human');
    activeClassLabel.textContent = 'Class: --';
    summarySubject.textContent = '--';
    summaryDesc.textContent = '--';
    summaryNext.textContent = '--';
    summarySchedule.textContent = '--';
    heroNext.textContent = '--';
    heroNextSub.textContent = 'Schedule pending';
    upcomingList.innerHTML = '<div class="session-item">No upcoming sessions posted yet.</div>';
    applyMode('ai');
    renderClassCards();
    loadQuizzes('');
    loadAssignments('');
    leaveLiveRoom(currentClassId);
    return;
  }

  classSelect.disabled = false;

  classes.forEach((classItem) => {
    const option = document.createElement('option');
    option.value = classItem.id;
    option.textContent = classItem.subject;
    classSelect.appendChild(option);
  });

  if (preferredId && classes.some((item) => item.id === preferredId)) {
    classSelect.value = preferredId;
  }

  renderClassCards();
  currentClassId = classSelect.value;
  updateClassContext();
}

function updateClassContext() {
  const previousClassId = currentClassId;
  currentClassId = classSelect.value;
  const selected = classes.find((item) => item.id === currentClassId);
  if (!selected) {
    classModePill.textContent = 'Mode: Unavailable';
    classModePill.classList.remove('human');
    activeClassLabel.textContent = 'Class: --';
    summarySubject.textContent = '--';
    summaryDesc.textContent = '--';
    summaryNext.textContent = '--';
    summarySchedule.textContent = '--';
    heroNext.textContent = '--';
    heroNextSub.textContent = 'Schedule pending';
    upcomingList.innerHTML = '<div class="session-item">No upcoming sessions posted yet.</div>';
    applyMode('ai');
    highlightActiveClass();
    loadQuizzes('');
    loadAssignments('');
    leaveLiveRoom(previousClassId);
    return;
  }

  activeClassLabel.textContent = `Class: ${selected.subject}`;
  summarySubject.textContent = selected.subject;
  summaryDesc.textContent = selected.description || 'No description available.';
  summaryNext.textContent = selected.nextSession || 'TBA';
  summarySchedule.textContent = selected.scheduleNotes || 'Not published';
  heroNext.textContent = selected.nextSession || 'To be announced';
  heroNextSub.textContent = selected.scheduleNotes || 'Schedule pending';

  const upcoming = Array.isArray(selected.upcomingSessions) ? selected.upcomingSessions : [];
  upcomingList.innerHTML = '';
  if (upcoming.length) {
    upcoming.forEach((item) => {
      const entry = document.createElement('div');
      entry.className = 'session-item';
      entry.textContent = item;
      upcomingList.appendChild(entry);
    });
  } else {
    upcomingList.innerHTML = '<div class="session-item">No upcoming sessions posted yet.</div>';
  }

  const modeLabel = selected.mode === 'human' ? 'Live Teacher' : 'Self Study';
  classModePill.textContent = `Mode: ${modeLabel}`;
  classModePill.classList.toggle('human', selected.mode === 'human');
  highlightActiveClass();
  applyMode(selected.mode || 'ai');
  loadQuizzes(currentClassId);
  loadAssignments(currentClassId);

  if (previousClassId && previousClassId !== currentClassId) {
    leaveLiveRoom(previousClassId);
  }
  joinLiveRoom(currentClassId);
}

classSelect.addEventListener('change', updateClassContext);

async function loadClasses() {
  try {
    const previousClassId = currentClassId;
    const response = await fetch('/classes');
    const data = await response.json();
    classes = data.classes || [];
    renderClassOptions(previousClassId);
  } catch (err) {
    classSelect.innerHTML = '<option value="">Unable to load classes</option>';
    classSelect.disabled = true;
  }
}

applyMode('ai');
loadRtcConfig();
loadClasses();
setInterval(loadClasses, 15000);
