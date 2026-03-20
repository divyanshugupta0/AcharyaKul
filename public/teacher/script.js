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

const gate = document.getElementById('teacherGate');
const shell = document.getElementById('teacherShell');
const teacherIdInput = document.getElementById('teacherIdInput');
const teacherIdBtn = document.getElementById('teacherIdBtn');
const teacherIdLabel = document.getElementById('teacherIdLabel');
const changeTeacher = document.getElementById('changeTeacher');
const teacherLiveLabel = document.getElementById('teacherLiveLabel');

const heroClassCount = document.getElementById('heroClassCount');
const heroQuizCount = document.getElementById('heroQuizCount');
const heroAssignmentCount = document.getElementById('heroAssignmentCount');

const liveToggle = document.getElementById('liveToggle');
const screenShareToggle = document.getElementById('screenShareToggle');
const liveStatus = document.getElementById('liveStatus');
const teacherVideo = document.getElementById('teacherVideo');
const liveClassSelect = document.getElementById('liveClassSelect');

const classForm = document.getElementById('classForm');
const classStatus = document.getElementById('classStatus');
const classList = document.getElementById('classList');
const classSubject = document.getElementById('classSubject');
const classDesc = document.getElementById('classDesc');
const classNext = document.getElementById('classNext');
const classSchedule = document.getElementById('classSchedule');
const classUpcoming = document.getElementById('classUpcoming');

const classModeSelect = document.getElementById('classModeSelect');
const classModeStatus = document.getElementById('classModeStatus');
const modeButtons = Array.from(document.querySelectorAll('.mode-btn'));

const quizForm = document.getElementById('quizForm');
const quizStatus = document.getElementById('quizStatus');
const quizList = document.getElementById('quizList');
const quizClass = document.getElementById('quizClass');
const questionList = document.getElementById('questionList');
const addQuestionBtn = document.getElementById('addQuestion');

const assignmentForm = document.getElementById('assignmentForm');
const assignmentStatus = document.getElementById('assignmentStatus');
const assignmentList = document.getElementById('assignmentList');
const assignmentClass = document.getElementById('assignmentClass');

let teacherId = localStorage.getItem('olms-teacher-id') || '';
let classes = [];
let quizzes = [];
let assignments = [];
let cameraStream = null;
let screenStream = null;
let liveStream = null;
let liveOn = false;
let liveClassId = '';
let currentStreamMode = 'camera';

const rtcConfig = {
  iceServers: []
};
let rtcConfigReady = null;
const peers = new Map();

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

function headers() {
  return { 'Content-Type': 'application/json', 'x-teacher-id': teacherId };
}

function openGate() {
  gate.classList.add('show');
  shell.style.display = 'none';
}

function closeGate() {
  gate.classList.remove('show');
  shell.style.display = 'grid';
}

function setTeacherId(id) {
  teacherId = id.trim();
  if (!teacherId) {
    openGate();
    return;
  }
  localStorage.setItem('olms-teacher-id', teacherId);
  teacherIdLabel.textContent = `Teacher ID: ${teacherId}`;
  closeGate();
  loadAll();
}

teacherIdBtn.addEventListener('click', () => {
  setTeacherId(teacherIdInput.value);
});

changeTeacher.addEventListener('click', () => {
  localStorage.removeItem('olms-teacher-id');
  teacherIdInput.value = '';
  openGate();
});

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Camera API not available in this browser.');
    return null;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    return cameraStream;
  } catch (err) {
    alert('Camera permission denied or unavailable.');
    return null;
  }
}

async function startScreenShare() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    alert('Screen sharing is not supported in this browser.');
    return null;
  }

  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const merged = new MediaStream();

    const screenVideo = screenStream.getVideoTracks()[0];
    if (screenVideo) {
      merged.addTrack(screenVideo);
      screenVideo.onended = () => {
        stopScreenShare(true);
      };
    }

    const screenAudio = screenStream.getAudioTracks()[0];
    if (screenAudio) {
      merged.addTrack(screenAudio);
    } else if (cameraStream) {
      const micTrack = cameraStream.getAudioTracks()[0];
      if (micTrack) {
        merged.addTrack(micTrack);
      }
    }

    return merged;
  } catch (err) {
    liveStatus.textContent = 'Screen share cancelled.';
    return null;
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
  }
  cameraStream = null;
}

function stopScreenShare(silent) {
  if (screenStream) {
    screenStream.getTracks().forEach((track) => track.stop());
  }
  screenStream = null;
  screenShareToggle.textContent = 'Share Screen';
  currentStreamMode = 'camera';

  if (liveOn) {
    if (!cameraStream) {
      startCamera().then((stream) => {
        if (stream) {
          setLiveStream(stream, 'camera');
          liveStatus.textContent = 'Live now';
        } else if (!silent) {
          liveStatus.textContent = 'Camera unavailable.';
        }
      });
    } else {
      setLiveStream(cameraStream, 'camera');
      liveStatus.textContent = 'Live now';
    }
  }
}

function setLiveStream(stream, mode) {
  liveStream = stream;
  currentStreamMode = mode;
  teacherVideo.srcObject = stream;

  if (!liveOn) {
    return;
  }

  peers.forEach((peer) => {
    stream.getTracks().forEach((track) => {
      const sender = peer.getSenders().find((s) => s.track && s.track.kind === track.kind);
      if (sender) {
        sender.replaceTrack(track);
      } else {
        peer.addTrack(track, stream);
      }
    });
  });
}

function closePeers() {
  peers.forEach((peer) => peer.close());
  peers.clear();
}

function beginLiveStatus() {
  liveToggle.textContent = 'Stop Live';
  liveStatus.textContent = currentStreamMode === 'screen' ? 'Sharing screen' : 'Live now';
  liveStatus.classList.add('on');
  teacherLiveLabel.textContent = `Live: ${getClassName(liveClassId)}`;
}

function endLiveStatus() {
  liveToggle.textContent = 'Start Live';
  liveStatus.textContent = 'Camera off';
  liveStatus.classList.remove('on');
  teacherLiveLabel.textContent = 'Live: Off';
  screenShareToggle.textContent = 'Share Screen';
}

async function startLiveSession() {
  const selectedClassId = liveClassSelect.value;
  if (!selectedClassId) {
    liveStatus.textContent = 'Select a class to go live.';
    return;
  }

  await loadRtcConfig();
  let stream = cameraStream;
  if (!stream) {
    stream = await startCamera();
  }
  if (!stream) {
    return;
  }

  liveOn = true;
  liveClassId = selectedClassId;
  setLiveStream(stream, 'camera');
  beginLiveStatus();

  socket.emit('teacher-join', { classId: liveClassId, teacherId });
}

async function startLiveWithScreen() {
  const selectedClassId = liveClassSelect.value;
  if (!selectedClassId) {
    liveStatus.textContent = 'Select a class to go live.';
    return;
  }

  await loadRtcConfig();
  const stream = await startScreenShare();
  if (!stream) {
    return;
  }

  liveOn = true;
  liveClassId = selectedClassId;
  setLiveStream(stream, 'screen');
  screenShareToggle.textContent = 'Stop Share';
  beginLiveStatus();
  liveStatus.textContent = 'Sharing screen';

  socket.emit('teacher-join', { classId: liveClassId, teacherId });
}

function stopLiveSession() {
  liveOn = false;
  endLiveStatus();

  if (liveClassId) {
    socket.emit('teacher-leave', { classId: liveClassId });
  }

  closePeers();
  if (screenStream) {
    stopScreenShare(true);
  }
  stopCamera();
  liveStream = null;
  liveClassId = '';
}

liveToggle.addEventListener('click', async () => {
  if (liveOn) {
    stopLiveSession();
    return;
  }

  await startLiveSession();
});

screenShareToggle.addEventListener('click', async () => {
  if (!liveOn) {
    await startLiveWithScreen();
    return;
  }

  if (currentStreamMode === 'screen') {
    stopScreenShare(false);
    screenShareToggle.textContent = 'Share Screen';
    return;
  }

  const stream = await startScreenShare();
  if (!stream) {
    return;
  }

  setLiveStream(stream, 'screen');
  screenShareToggle.textContent = 'Stop Share';
  liveStatus.textContent = 'Sharing screen';
});

liveClassSelect.addEventListener('change', () => {
  if (liveOn) {
    liveStatus.textContent = 'Stop live before switching class.';
    liveClassSelect.value = liveClassId;
  }
});

socket.on('student-join', async (payload = {}) => {
  if (!liveOn || payload.classId !== liveClassId || !liveStream) {
    return;
  }

  try {
    await loadRtcConfig();
    const peer = new RTCPeerConnection(rtcConfig);
    liveStream.getTracks().forEach((track) => peer.addTrack(track, liveStream));

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { to: payload.studentId, candidate: event.candidate, classId: liveClassId });
      }
    };

    peers.set(payload.studentId, peer);

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('offer', { to: payload.studentId, sdp: offer, classId: liveClassId });
  } catch (err) {
    console.error('Failed to create offer', err);
  }
});

socket.on('answer', async (payload = {}) => {
  const peer = peers.get(payload.from);
  if (!peer || payload.classId !== liveClassId) {
    return;
  }
  try {
    await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
  } catch (err) {
    console.error('Failed to apply answer', err);
  }
});

socket.on('ice-candidate', async (payload = {}) => {
  const peer = peers.get(payload.from);
  if (!peer || payload.classId !== liveClassId) {
    return;
  }
  try {
    if (payload.candidate) {
      await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
    }
  } catch (err) {
    console.error('Failed to add ICE candidate', err);
  }
});

socket.on('student-left', (payload = {}) => {
  const peer = peers.get(payload.studentId);
  if (peer) {
    peer.close();
    peers.delete(payload.studentId);
  }
});

socket.on('teacher-replaced', (payload = {}) => {
  if (payload.classId === liveClassId) {
    stopLiveSession();
  }
});

async function loadClasses() {
  try {
    const response = await fetch('/classes', { headers: headers() });
    const data = await response.json();
    classes = data.classes || [];
    heroClassCount.textContent = String(classes.length);
    renderClasses();
    renderClassOptions();
  } catch (err) {
    classList.innerHTML = '<div class="status">Unable to load classes.</div>';
  }
}

function renderClasses() {
  classList.innerHTML = '';
  if (!classes.length) {
    classList.innerHTML = '<div class="status">No classes yet.</div>';
    return;
  }

  classes.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'library-item';
    const nextSession = item.nextSession ? `Next: ${item.nextSession}` : 'Next: TBA';
    const schedule = item.scheduleNotes || 'Schedule not published.';
    card.innerHTML = `
      <h4>${item.subject}</h4>
      <p>${item.description || 'No description provided.'}</p>
      <span class="badge">${nextSession}</span>
      <span class="badge">${schedule}</span>
      <span class="badge">Mode: ${item.mode === 'human' ? 'Live Teacher' : 'AI'}</span>
    `;
    classList.appendChild(card);
  });
}

function renderClassOptions() {
  classModeSelect.innerHTML = '';
  quizClass.innerHTML = '<option value="all">All classes</option>';
  assignmentClass.innerHTML = '<option value="all">All classes</option>';
  liveClassSelect.innerHTML = '<option value="">Select class</option>';

  if (!classes.length) {
    classModeSelect.innerHTML = '<option value="">No classes</option>';
    liveClassSelect.innerHTML = '<option value="">No classes</option>';
    return;
  }

  classes.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.subject;
    classModeSelect.appendChild(option);

    const quizOption = option.cloneNode(true);
    const assignmentOption = option.cloneNode(true);
    quizClass.appendChild(quizOption);
    assignmentClass.appendChild(assignmentOption);

    const liveOption = option.cloneNode(true);
    liveClassSelect.appendChild(liveOption);
  });

  if (liveClassId) {
    liveClassSelect.value = liveClassId;
  }

  updateModeButtons();
}

function updateModeButtons() {
  const selectedId = classModeSelect.value;
  const selected = classes.find((item) => item.id === selectedId);
  const mode = selected ? selected.mode : null;

  modeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  classModeStatus.textContent = selected
    ? `Current mode: ${mode === 'human' ? 'Live Teacher' : 'AI Teaching'}`
    : 'Pick a class to update the mode.';
}

classModeSelect.addEventListener('change', updateModeButtons);

modeButtons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    const classId = classModeSelect.value;
    if (!classId) {
      classModeStatus.textContent = 'Please select a class first.';
      return;
    }

    classModeStatus.textContent = 'Updating mode...';

    try {
      const response = await fetch('/class-mode', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ classId, mode: btn.dataset.mode })
      });

      const data = await response.json();
      if (!response.ok) {
        classModeStatus.textContent = data.error || 'Failed to update mode.';
        return;
      }

      classes = classes.map((item) => (item.id === classId ? data.class : item));
      updateModeButtons();
    } catch (err) {
      classModeStatus.textContent = 'Network error.';
    }
  });
});

classForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  classStatus.textContent = 'Creating...';

  const upcomingSessions = classUpcoming.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  try {
    const response = await fetch('/class', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        subject: classSubject.value.trim(),
        description: classDesc.value.trim(),
        nextSession: classNext.value.trim(),
        scheduleNotes: classSchedule.value.trim(),
        upcomingSessions
      })
    });

    const data = await response.json();
    if (!response.ok) {
      classStatus.textContent = data.error || 'Failed to create class.';
      return;
    }

    classStatus.textContent = 'Class created.';
    classForm.reset();
    loadClasses();
  } catch (err) {
    classStatus.textContent = 'Network error.';
  }
});

function createQuestionBlock(index) {
  const card = document.createElement('div');
  card.className = 'question-card';
  card.dataset.index = index;

  card.innerHTML = `
    <div class="question-header">
      <div class="question-title">Question ${index + 1}</div>
      <button type="button" class="remove-question">Remove</button>
    </div>
    <textarea class="question-text" rows="3" placeholder="Type the question"></textarea>
    <div class="options-grid">
      <input class="option-input" type="text" placeholder="Option 1" />
      <input class="option-input" type="text" placeholder="Option 2" />
      <input class="option-input" type="text" placeholder="Option 3" />
      <input class="option-input" type="text" placeholder="Option 4" />
    </div>
    <label>Correct Answer</label>
    <select class="correct-select">
      <option value="0">Option 1</option>
      <option value="1">Option 2</option>
      <option value="2">Option 3</option>
      <option value="3">Option 4</option>
    </select>
  `;

  const removeBtn = card.querySelector('.remove-question');
  removeBtn.addEventListener('click', () => {
    card.remove();
    updateQuestionNumbers();
  });

  return card;
}

function updateQuestionNumbers() {
  const cards = Array.from(questionList.querySelectorAll('.question-card'));
  cards.forEach((card, index) => {
    card.dataset.index = index;
    const title = card.querySelector('.question-title');
    if (title) {
      title.textContent = `Question ${index + 1}`;
    }
  });
}

function addQuestionBlock() {
  const index = questionList.querySelectorAll('.question-card').length;
  const card = createQuestionBlock(index);
  questionList.appendChild(card);
}

addQuestionBtn.addEventListener('click', addQuestionBlock);

quizForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const classId = quizClass.value;
  if (!classId) {
    quizStatus.textContent = 'Please select a class.';
    return;
  }

  const cards = Array.from(questionList.querySelectorAll('.question-card'));
  if (!cards.length) {
    quizStatus.textContent = 'Add at least one question.';
    return;
  }

  const questions = cards.map((card) => {
    const question = card.querySelector('.question-text').value.trim();
    const options = Array.from(card.querySelectorAll('.option-input')).map((input) => input.value.trim());
    const correctIndex = Number(card.querySelector('.correct-select').value);
    return { question, options, correctIndex };
  });

  const invalid = questions.some(
    (q) => !q.question || q.options.length !== 4 || q.options.some((opt) => !opt)
  );

  if (invalid) {
    quizStatus.textContent = 'Please fill all question fields and options.';
    return;
  }

  quizStatus.textContent = 'Publishing...';

  try {
    const responses = await Promise.all(
      questions.map((q) =>
        fetch('/quiz', {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex,
            classId
          })
        })
      )
    );

    const failed = responses.find((res) => !res.ok);
    if (failed) {
      const data = await failed.json();
      quizStatus.textContent = data.error || 'Failed to publish quiz.';
      return;
    }

    quizStatus.textContent = `Published ${questions.length} question(s).`;
    quizForm.reset();
    questionList.innerHTML = '';
    addQuestionBlock();
    loadQuizzes();
  } catch (err) {
    quizStatus.textContent = 'Network error.';
  }
});

async function loadQuizzes() {
  try {
    const response = await fetch('/quizzes?role=teacher', { headers: headers() });
    const data = await response.json();
    quizzes = data.quizzes || [];
    heroQuizCount.textContent = String(quizzes.length);
    renderQuizzes();
  } catch (err) {
    quizList.innerHTML = '<div class="status">Unable to load quizzes.</div>';
  }
}

function renderQuizzes() {
  quizList.innerHTML = '';
  if (!quizzes.length) {
    quizList.innerHTML = '<div class="status">No quizzes yet.</div>';
    return;
  }

  quizzes.forEach((quiz) => {
    const card = document.createElement('div');
    card.className = 'library-item';
    card.innerHTML = `
      <h4>${quiz.question}</h4>
      <p>Correct: ${quiz.options[quiz.correctIndex]}</p>
      <span class="badge">Class: ${getClassName(quiz.classId)}</span>
    `;
    quizList.appendChild(card);
  });
}

assignmentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  assignmentStatus.textContent = 'Publishing...';

  try {
    const response = await fetch('/assignment', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        title: document.getElementById('assignmentTitle').value.trim(),
        description: document.getElementById('assignmentDesc').value.trim(),
        classId: assignmentClass.value
      })
    });

    const data = await response.json();
    if (!response.ok) {
      assignmentStatus.textContent = data.error || 'Failed to create assignment.';
      return;
    }

    assignmentStatus.textContent = 'Assignment published.';
    assignmentForm.reset();
    loadAssignments();
  } catch (err) {
    assignmentStatus.textContent = 'Network error.';
  }
});

async function loadAssignments() {
  try {
    const response = await fetch('/assignments', { headers: headers() });
    const data = await response.json();
    assignments = data.assignments || [];
    heroAssignmentCount.textContent = String(assignments.length);
    renderAssignments();
  } catch (err) {
    assignmentList.innerHTML = '<div class="status">Unable to load assignments.</div>';
  }
}

function renderAssignments() {
  assignmentList.innerHTML = '';
  if (!assignments.length) {
    assignmentList.innerHTML = '<div class="status">No assignments yet.</div>';
    return;
  }

  assignments.forEach((assignment) => {
    const card = document.createElement('div');
    card.className = 'library-item';
    card.innerHTML = `
      <h4>${assignment.title}</h4>
      <p>${assignment.description || 'No description provided.'}</p>
      <span class="badge">Class: ${getClassName(assignment.classId)}</span>
    `;
    assignmentList.appendChild(card);
  });
}

function getClassName(classId) {
  if (!classId || classId === 'all') {
    return 'All classes';
  }
  const found = classes.find((item) => item.id === classId);
  return found ? found.subject : 'Unknown class';
}

function loadAll() {
  loadRtcConfig();
  loadClasses();
  loadQuizzes();
  loadAssignments();
}

if (!teacherId) {
  openGate();
} else {
  setTeacherId(teacherId);
}

addQuestionBlock();
