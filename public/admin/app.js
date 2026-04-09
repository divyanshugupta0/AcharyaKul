const tabs = Array.from(document.querySelectorAll('.side-btn'));
const panels = Array.from(document.querySelectorAll('.panel'));
const refreshAdmin = document.getElementById('refreshAdmin');
const errorBanner = document.getElementById('errorBanner');
const lastUpdated = document.getElementById('lastUpdated');
const logoutBtn = document.getElementById('logoutBtn');
const staffAccountForm = document.getElementById('staffAccountForm');
const staffDisplayName = document.getElementById('staffDisplayName');
const staffEmail = document.getElementById('staffEmail');
const staffPassword = document.getElementById('staffPassword');
const staffRole = document.getElementById('staffRole');
const staffAccountSubmit = document.getElementById('staffAccountSubmit');
const staffAccountStatus = document.getElementById('staffAccountStatus');

const totalTeachers = document.getElementById('totalTeachers');
const totalStudents = document.getElementById('totalStudents');
const totalClasses = document.getElementById('totalClasses');
const totalQuizzes = document.getElementById('totalQuizzes');
const totalAssignments = document.getElementById('totalAssignments');
const totalQuizSubmissions = document.getElementById('totalQuizSubmissions');
const totalAssignmentSubmissions = document.getElementById('totalAssignmentSubmissions');
const avgQuizScore = document.getElementById('avgQuizScore');
const activeTeachers = document.getElementById('activeTeachers');
const activeStudents = document.getElementById('activeStudents');
const activityFeed = document.getElementById('activityFeed');
const healthStatus = document.getElementById('healthStatus');
const healthTime = document.getElementById('healthTime');

const teacherList = document.getElementById('teacherList');
const studentList = document.getElementById('studentList');
const classList = document.getElementById('classList');
const quizList = document.getElementById('quizList');
const assignmentList = document.getElementById('assignmentList');
const quizSubmissionList = document.getElementById('quizSubmissionList');
const assignmentSubmissionList = document.getElementById('assignmentSubmissionList');

const teacherMeta = document.getElementById('teacherMeta');
const studentMeta = document.getElementById('studentMeta');
const classMeta = document.getElementById('classMeta');
const quizMeta = document.getElementById('quizMeta');
const assignmentMeta = document.getElementById('assignmentMeta');
const quizSubmissionMeta = document.getElementById('quizSubmissionMeta');
const assignmentSubmissionMeta = document.getElementById('assignmentSubmissionMeta');

const ACTIVE_MINUTES = 30;

let teachers = [];
let students = [];
let classes = [];
let quizzes = [];
let assignments = [];
let quizSubmissions = [];
let assignmentSubmissions = [];
let health = null;

document.body.style.visibility = 'hidden';

function setActiveTab(tabName) {
  tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
  panels.forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${tabName}`));
}

tabs.forEach((btn) => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => {
    return (
      {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[char] || char
    );
  });
}

function formatTime(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function isActive(value) {
  const time = new Date(value || '').getTime();
  return Number.isFinite(time) && Date.now() - time <= ACTIVE_MINUTES * 60 * 1000;
}

function setError(message) {
  if (!errorBanner) return;
  errorBanner.hidden = !message;
  errorBanner.textContent = message || '';
}

function setStaffStatus(message, type) {
  if (!staffAccountStatus) return;
  staffAccountStatus.textContent = message || '';
  staffAccountStatus.style.color =
    type === 'error' ? '#b42318' : type === 'success' ? '#0f766e' : '';
}

async function fetchJson(url) {
  return window.olmsAuth.fetchJson(url);
}

async function createStaffAccount(payload) {
  return window.olmsAuth.fetchJson('/admin/staff-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function loadAll() {
  refreshAdmin.disabled = true;
  const results = await Promise.allSettled([
    fetchJson('/teachers'),
    fetchJson('/students'),
    fetchJson('/classes'),
    fetchJson('/quizzes?includeAnswers=true'),
    fetchJson('/assignments'),
    fetchJson('/quiz-submissions?limit=500'),
    fetchJson('/assignment-submissions?limit=500'),
    fetchJson('/health')
  ]);

  const [teachersRes, studentsRes, classesRes, quizzesRes, assignmentsRes, quizSubsRes, assignmentSubsRes, healthRes] = results;

  teachers = teachersRes.status === 'fulfilled' ? teachersRes.value.teachers || [] : [];
  students = studentsRes.status === 'fulfilled' ? studentsRes.value.students || [] : [];
  classes = classesRes.status === 'fulfilled' ? classesRes.value.classes || [] : [];
  quizzes = quizzesRes.status === 'fulfilled' ? quizzesRes.value.quizzes || [] : [];
  assignments = assignmentsRes.status === 'fulfilled' ? assignmentsRes.value.assignments || [] : [];
  quizSubmissions = quizSubsRes.status === 'fulfilled' ? quizSubsRes.value.submissions || [] : [];
  assignmentSubmissions = assignmentSubsRes.status === 'fulfilled' ? assignmentSubsRes.value.submissions || [] : [];
  health = healthRes.status === 'fulfilled' ? healthRes.value : null;

  setError(results.some((result) => result.status === 'rejected') ? 'Some admin data could not be loaded.' : '');
  renderAll();
  lastUpdated.textContent = new Date().toLocaleString();
  refreshAdmin.disabled = false;
}

function renderOverview() {
  totalTeachers.textContent = teachers.length;
  totalStudents.textContent = students.length;
  totalClasses.textContent = classes.length;
  totalQuizzes.textContent = quizzes.length;
  totalAssignments.textContent = assignments.length;
  totalQuizSubmissions.textContent = quizSubmissions.length;
  totalAssignmentSubmissions.textContent = assignmentSubmissions.length;
  activeTeachers.textContent = teachers.filter((item) => isActive(item.lastSeen)).length;
  activeStudents.textContent = students.filter((item) => isActive(item.lastSeen)).length;

  const totalScore = quizSubmissions.reduce((sum, item) => sum + Number(item.score || 0), 0);
  const totalPossible = quizSubmissions.reduce((sum, item) => sum + Number(item.total || 0), 0);
  avgQuizScore.textContent = `${totalPossible ? Math.round((totalScore / totalPossible) * 100) : 0}%`;

  if (health && health.ok) {
    healthStatus.textContent = 'Online';
    healthStatus.classList.add('ok');
    healthTime.textContent = formatTime(health.time);
  } else {
    healthStatus.textContent = 'Unavailable';
    healthStatus.classList.remove('ok');
    healthTime.textContent = '--';
  }
}

function renderMiniList(target, items, emptyMessage) {
  target.innerHTML = items.length
    ? items.join('')
    : `<div class="list-item"><p>${escapeHtml(emptyMessage)}</p></div>`;
}

function renderActivity() {
  const items = [
    ...teachers.map((item) => ({ time: item.lastSeen, label: `Teacher active: ${item.id}`, type: 'teacher' })),
    ...students.map((item) => ({ time: item.lastSeen, label: `Student active: ${item.name || item.id}`, type: 'student' })),
    ...classes.map((item) => ({ time: item.createdAt, label: `Class created: ${item.subject}`, type: 'class' })),
    ...quizSubmissions.map((item) => ({ time: item.submittedAt, label: `Quiz submitted by ${item.studentName}`, type: 'submission' })),
    ...assignmentSubmissions.map((item) => ({ time: item.submittedAt, label: `Assignment submitted by ${item.studentName}`, type: 'submission' }))
  ]
    .filter((item) => item.time)
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 8);

  activityFeed.innerHTML = items.length
    ? items
        .map(
          (item) => `
            <div class="mini-item">
              <span class="dot ${escapeHtml(item.type)}"></span>
              <div>
                <div class="mini-title">${escapeHtml(item.label)}</div>
                <div class="mini-time">${escapeHtml(formatTime(item.time))}</div>
              </div>
            </div>`
        )
        .join('')
    : '<div class="mini-empty">No activity yet.</div>';
}

function renderAll() {
  renderOverview();
  renderActivity();

  teacherMeta.textContent = `${teachers.length} teachers`;
  studentMeta.textContent = `${students.length} students`;
  classMeta.textContent = `${classes.length} classes`;
  quizMeta.textContent = `${quizzes.length} quizzes`;
  assignmentMeta.textContent = `${assignments.length} assignments`;
  quizSubmissionMeta.textContent = `${quizSubmissions.length} submissions`;
  assignmentSubmissionMeta.textContent = `${assignmentSubmissions.length} submissions`;

  renderMiniList(
    teacherList,
    teachers.map(
      (item) => `
        <div class="list-item">
          <div class="item-header">
            <div>
              <h4>${escapeHtml(item.id)}</h4>
              <p>${escapeHtml(item.email || item.firebaseUid || 'No email')}</p>
            </div>
            <span class="badge ${isActive(item.lastSeen) ? 'badge-active' : ''}">${escapeHtml(isActive(item.lastSeen) ? 'Active now' : formatTime(item.lastSeen))}</span>
          </div>
          <div class="tag-row">
            <span class="badge">Role: ${escapeHtml(item.role || 'teacher')}</span>
          </div>
        </div>`
    ),
    'No teachers tracked yet.'
  );

  renderMiniList(
    studentList,
    students.map(
      (item) => `
        <div class="list-item">
          <div class="item-header">
            <div>
              <h4>${escapeHtml(item.name || item.id)}</h4>
              <p>${escapeHtml(item.email || item.firebaseUid || 'No email')}</p>
            </div>
            <span class="badge ${isActive(item.lastSeen) ? 'badge-active' : ''}">${escapeHtml(isActive(item.lastSeen) ? 'Active now' : formatTime(item.lastSeen))}</span>
          </div>
        </div>`
    ),
    'No students tracked yet.'
  );

  renderMiniList(
    classList,
    classes.map(
      (item) => `
        <div class="list-item">
          <h4>${escapeHtml(item.subject)}</h4>
          <p>${escapeHtml(item.description || 'No description')}</p>
          <div class="tag-row">
            <span class="badge">Teacher: ${escapeHtml(item.teacherName || item.teacherId)}</span>
            <span class="badge">Mode: ${escapeHtml(item.mode)}</span>
          </div>
        </div>`
    ),
    'No classes yet.'
  );

  renderMiniList(
    quizList,
    quizzes.map(
      (item) => `
        <div class="list-item">
          <div class="item-header">
            <div>
              <h4>${escapeHtml(item.question)}</h4>
              <p>Class: ${escapeHtml(item.classId || 'all')}</p>
            </div>
            <span class="badge">Teacher: ${escapeHtml(item.teacherName || item.teacherId)}</span>
          </div>
        </div>`
    ),
    'No quizzes yet.'
  );

  renderMiniList(
    assignmentList,
    assignments.map(
      (item) => `
        <div class="list-item">
          <div class="item-header">
            <div>
              <h4>${escapeHtml(item.title)}</h4>
              <p>${escapeHtml(item.description || 'No description')}</p>
            </div>
            <span class="badge">Teacher: ${escapeHtml(item.teacherName || item.teacherId)}</span>
          </div>
        </div>`
    ),
    'No assignments yet.'
  );

  renderMiniList(
    quizSubmissionList,
    quizSubmissions.map(
      (item) => `
        <div class="list-item">
          <div class="item-header">
            <div>
              <h4>${escapeHtml(item.studentName)}</h4>
              <p>${escapeHtml(formatTime(item.submittedAt))}</p>
            </div>
            <span class="score-pill">${escapeHtml(`${item.score}/${item.total}`)}</span>
          </div>
        </div>`
    ),
    'No quiz submissions yet.'
  );

  renderMiniList(
    assignmentSubmissionList,
    assignmentSubmissions.map(
      (item) => `
        <div class="list-item">
          <div class="item-header">
            <div>
              <h4>${escapeHtml(item.studentName)}</h4>
              <p>${escapeHtml(formatTime(item.submittedAt))}</p>
            </div>
            <span class="badge">Class: ${escapeHtml(item.classId || 'all')}</span>
          </div>
          <div class="response-preview">${escapeHtml((item.answer || '').slice(0, 180))}</div>
        </div>`
    ),
    'No assignment submissions yet.'
  );
}

refreshAdmin.addEventListener('click', loadAll);
if (staffAccountForm) {
  staffAccountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    staffAccountSubmit.disabled = true;
    setStaffStatus('Creating staff account...');
    try {
      const payload = await createStaffAccount({
        displayName: staffDisplayName.value.trim(),
        email: staffEmail.value.trim(),
        password: staffPassword.value,
        role: staffRole.value
      });
      setStaffStatus(
        `${payload.user.displayName} is ready as ${payload.user.role}.`,
        'success'
      );
      staffAccountForm.reset();
      await loadAll();
    } catch (error) {
      setStaffStatus(error.message || 'Unable to create staff account.', 'error');
    } finally {
      staffAccountSubmit.disabled = false;
    }
  });
}
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await window.olmsAuth.signOut();
    window.olmsAuth.redirectToLogin('/admin/');
  });
}

async function bootAdminPortal() {
  try {
    const user = await window.olmsAuth.ensurePortalAccess(['admin']);
    if (!user) return;
    document.body.style.visibility = '';
    await loadAll();
    setInterval(loadAll, 20000);
  } catch (error) {
    console.error(error);
    window.olmsAuth.redirectToLogin('/admin/');
  }
}

bootAdminPortal();
