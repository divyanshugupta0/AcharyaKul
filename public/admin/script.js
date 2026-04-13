const tabs = Array.from(document.querySelectorAll('.side-btn'));
const panels = Array.from(document.querySelectorAll('.panel'));
const refreshAdmin = document.getElementById('refreshAdmin');
const errorBanner = document.getElementById('errorBanner');
const lastUpdated = document.getElementById('lastUpdated');

function setActiveTab(tabName) {
  tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
  panels.forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${tabName}`));
}

tabs.forEach((btn) => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
});

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

function byId(id) {
  return document.getElementById(id);
}

function getValue(id) {
  const el = byId(id);
  return el ? el.value : '';
}

function isChecked(id) {
  const el = byId(id);
  return Boolean(el && el.checked);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

function formatTime(value) {
  if (!value) {
    return 'Unknown';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function isActive(value) {
  if (!value) {
    return false;
  }
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return false;
  }
  return Date.now() - time <= ACTIVE_MINUTES * 60 * 1000;
}

function withinDays(value, days) {
  if (!days) {
    return true;
  }
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return false;
  }
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return time >= since;
}

function setError(message) {
  if (!errorBanner) {
    return;
  }
  if (message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
  } else {
    errorBanner.textContent = '';
    errorBanner.hidden = true;
  }
}

function updateLastUpdated() {
  if (lastUpdated) {
    lastUpdated.textContent = new Date().toLocaleString();
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

async function loadTeachers() {
  const data = await fetchJson('/teachers');
  teachers = data.teachers || [];
}

async function loadStudents() {
  const data = await fetchJson('/students');
  students = data.students || [];
}

async function loadClasses() {
  const data = await fetchJson('/classes');
  classes = data.classes || [];
}

async function loadQuizzes() {
  const data = await fetchJson('/quizzes?includeAnswers=true&role=admin');
  quizzes = data.quizzes || [];
}

async function loadAssignments() {
  const data = await fetchJson('/assignments');
  assignments = data.assignments || [];
}

async function loadQuizSubmissions() {
  const data = await fetchJson('/quiz-submissions?limit=500');
  quizSubmissions = data.submissions || [];
}

async function loadAssignmentSubmissions() {
  const data = await fetchJson('/assignment-submissions?limit=500');
  assignmentSubmissions = data.submissions || [];
}

async function loadHealth() {
  health = await fetchJson('/health');
}
function uniqueList(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function classLabel(classId) {
  if (classId === 'all') {
    return 'All Classes';
  }
  const found = classes.find((item) => item.id === classId);
  if (!found) {
    return classId;
  }
  const suffix = found.id ? found.id.slice(-4) : '';
  return `${found.subject}${suffix ? ` (${suffix})` : ''}`;
}

function setSelectOptions(select, values, placeholder, labelFn) {
  if (!select) {
    return;
  }
  const current = select.value;
  select.innerHTML = '';
  const base = document.createElement('option');
  base.value = '';
  base.textContent = placeholder;
  select.appendChild(base);
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labelFn ? labelFn(value) : value;
    select.appendChild(option);
  });
  if (current && values.includes(current)) {
    select.value = current;
  }
}

function populateFilters() {
  const teacherIds = uniqueList(teachers.map((teacher) => teacher.id)).sort();
  const quizTeacherIds = uniqueList(quizzes.map((quiz) => quiz.teacherId)).sort();
  const quizClassIds = uniqueList(quizzes.map((quiz) => quiz.classId || 'all')).sort();
  const assignmentTeacherIds = uniqueList(assignments.map((assignment) => assignment.teacherId)).sort();
  const assignmentClassIds = uniqueList(assignments.map((assignment) => assignment.classId || 'all')).sort();

  setSelectOptions(byId('classTeacherFilter'), teacherIds, 'Teacher: All');
  setSelectOptions(byId('quizTeacherFilter'), quizTeacherIds, 'Teacher: All');
  setSelectOptions(byId('quizClassFilter'), quizClassIds, 'Class: All', classLabel);
  setSelectOptions(byId('assignmentTeacherFilter'), assignmentTeacherIds, 'Teacher: All');
  setSelectOptions(byId('assignmentClassFilter'), assignmentClassIds, 'Class: All', classLabel);
  setSelectOptions(byId('quizSubmissionTeacherFilter'), quizTeacherIds, 'Teacher: All');
  setSelectOptions(byId('quizSubmissionClassFilter'), quizClassIds, 'Class: All', classLabel);
  setSelectOptions(byId('assignmentSubmissionTeacherFilter'), assignmentTeacherIds, 'Teacher: All');
  setSelectOptions(byId('assignmentSubmissionClassFilter'), assignmentClassIds, 'Class: All', classLabel);
}

function buildClassCountMap() {
  const map = new Map();
  classes.forEach((item) => {
    if (!item.teacherId) {
      return;
    }
    map.set(item.teacherId, (map.get(item.teacherId) || 0) + 1);
  });
  return map;
}

function getFilteredTeachers() {
  const search = getValue('teacherSearch').toLowerCase();
  const activeOnly = isChecked('teacherActiveOnly');
  const sort = getValue('teacherSort');
  const classCount = buildClassCountMap();
  let list = teachers.slice();

  if (search) {
    list = list.filter((teacher) => teacher.id.toLowerCase().includes(search));
  }
  if (activeOnly) {
    list = list.filter((teacher) => isActive(teacher.lastSeen));
  }

  if (sort === 'name') {
    list.sort((a, b) => a.id.localeCompare(b.id));
  } else if (sort === 'classes') {
    list.sort((a, b) => (classCount.get(b.id) || 0) - (classCount.get(a.id) || 0));
  } else {
    list.sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
  }

  return { list, classCount };
}

function getFilteredStudents() {
  const search = getValue('studentSearch').toLowerCase();
  const activeOnly = isChecked('studentActiveOnly');
  const sort = getValue('studentSort');
  let list = students.slice();

  if (search) {
    list = list.filter((student) => student.name.toLowerCase().includes(search));
  }
  if (activeOnly) {
    list = list.filter((student) => isActive(student.lastSeen));
  }

  if (sort === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    list.sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
  }

  return list;
}

function getFilteredClasses() {
  const search = getValue('classSearch').toLowerCase();
  const teacherFilter = getValue('classTeacherFilter');
  const modeFilter = getValue('classModeFilter');
  const sort = getValue('classSort');
  let list = classes.slice();

  if (search) {
    list = list.filter((item) =>
      `${item.subject} ${item.description}`.toLowerCase().includes(search)
    );
  }
  if (teacherFilter) {
    list = list.filter((item) => item.teacherId === teacherFilter);
  }
  if (modeFilter) {
    list = list.filter((item) => item.mode === modeFilter);
  }

  if (sort === 'subject') {
    list.sort((a, b) => a.subject.localeCompare(b.subject));
  } else {
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  return list;
}

function getFilteredQuizzes() {
  const search = getValue('quizSearch').toLowerCase();
  const teacherFilter = getValue('quizTeacherFilter');
  const classFilter = getValue('quizClassFilter');
  const sort = getValue('quizSort');
  let list = quizzes.slice();

  if (search) {
    list = list.filter((quiz) => quiz.question.toLowerCase().includes(search));
  }
  if (teacherFilter) {
    list = list.filter((quiz) => quiz.teacherId === teacherFilter);
  }
  if (classFilter) {
    list = list.filter((quiz) => (quiz.classId || 'all') === classFilter);
  }

  if (sort === 'question') {
    list.sort((a, b) => a.question.localeCompare(b.question));
  } else {
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  return list;
}

function getFilteredAssignments() {
  const search = getValue('assignmentSearch').toLowerCase();
  const teacherFilter = getValue('assignmentTeacherFilter');
  const classFilter = getValue('assignmentClassFilter');
  const sort = getValue('assignmentSort');
  let list = assignments.slice();

  if (search) {
    list = list.filter((assignment) =>
      `${assignment.title} ${assignment.description}`.toLowerCase().includes(search)
    );
  }
  if (teacherFilter) {
    list = list.filter((assignment) => assignment.teacherId === teacherFilter);
  }
  if (classFilter) {
    list = list.filter((assignment) => (assignment.classId || 'all') === classFilter);
  }

  if (sort === 'title') {
    list.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  return list;
}
function submissionMatchesQuizFilters(submission, teacherFilter, classFilter, quizMap) {
  if (!teacherFilter && !classFilter) {
    return true;
  }
  const answers = Array.isArray(submission.answers) ? submission.answers : [];
  return answers.some((answer) => {
    const quiz = quizMap.get(answer.quizId);
    if (!quiz) {
      return false;
    }
    if (teacherFilter && quiz.teacherId !== teacherFilter) {
      return false;
    }
    if (classFilter && (quiz.classId || 'all') !== classFilter) {
      return false;
    }
    return true;
  });
}

function getFilteredQuizSubmissions() {
  const search = getValue('quizSubmissionSearch').toLowerCase();
  const teacherFilter = getValue('quizSubmissionTeacherFilter');
  const classFilter = getValue('quizSubmissionClassFilter');
  const rangeValue = Number(getValue('quizSubmissionRange'));
  const quizMap = new Map(quizzes.map((quiz) => [quiz.id, quiz]));

  let list = quizSubmissions.slice();

  if (search) {
    list = list.filter((submission) => submission.studentName.toLowerCase().includes(search));
  }

  if (teacherFilter || classFilter) {
    list = list.filter((submission) =>
      submissionMatchesQuizFilters(submission, teacherFilter, classFilter, quizMap)
    );
  }

  if (rangeValue) {
    list = list.filter((submission) => withinDays(submission.submittedAt, rangeValue));
  }

  list.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

  return { list, quizMap };
}

function getFilteredAssignmentSubmissions() {
  const search = getValue('assignmentSubmissionSearch').toLowerCase();
  const teacherFilter = getValue('assignmentSubmissionTeacherFilter');
  const classFilter = getValue('assignmentSubmissionClassFilter');
  const rangeValue = Number(getValue('assignmentSubmissionRange'));
  const assignmentMap = new Map(assignments.map((assignment) => [assignment.id, assignment]));

  let list = assignmentSubmissions.slice();

  if (search) {
    list = list.filter((submission) => submission.studentName.toLowerCase().includes(search));
  }

  if (teacherFilter || classFilter) {
    list = list.filter((submission) => {
      const assignment = assignmentMap.get(submission.assignmentId);
      if (!assignment) {
        return false;
      }
      if (teacherFilter && assignment.teacherId !== teacherFilter) {
        return false;
      }
      if (classFilter && (assignment.classId || 'all') !== classFilter) {
        return false;
      }
      return true;
    });
  }

  if (rangeValue) {
    list = list.filter((submission) => withinDays(submission.submittedAt, rangeValue));
  }

  list.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

  return { list, assignmentMap };
}

function renderOverview() {
  totalTeachers.textContent = teachers.length;
  totalStudents.textContent = students.length;
  totalClasses.textContent = classes.length;
  totalQuizzes.textContent = quizzes.length;
  totalAssignments.textContent = assignments.length;
  totalQuizSubmissions.textContent = quizSubmissions.length;
  totalAssignmentSubmissions.textContent = assignmentSubmissions.length;

  const activeTeacherCount = teachers.filter((teacher) => isActive(teacher.lastSeen)).length;
  const activeStudentCount = students.filter((student) => isActive(student.lastSeen)).length;
  activeTeachers.textContent = activeTeacherCount;
  activeStudents.textContent = activeStudentCount;

  const totalScore = quizSubmissions.reduce((sum, submission) => sum + Number(submission.score || 0), 0);
  const totalPossible = quizSubmissions.reduce((sum, submission) => sum + Number(submission.total || 0), 0);
  const average = totalPossible ? Math.round((totalScore / totalPossible) * 100) : 0;
  avgQuizScore.textContent = `${average}%`;

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

function renderActivity() {
  if (!activityFeed) {
    return;
  }
  const items = [];

  teachers.forEach((teacher) => {
    if (teacher.lastSeen) {
      items.push({
        time: teacher.lastSeen,
        label: `Teacher ${teacher.id} active`,
        type: 'teacher'
      });
    }
  });

  students.forEach((student) => {
    if (student.lastSeen) {
      items.push({
        time: student.lastSeen,
        label: `Student ${student.name} active`,
        type: 'student'
      });
    }
  });

  classes.forEach((item) => {
    if (item.createdAt) {
      items.push({
        time: item.createdAt,
        label: `Class created: ${item.subject}`,
        type: 'class'
      });
    }
  });

  quizzes.forEach((quiz) => {
    if (quiz.createdAt) {
      items.push({
        time: quiz.createdAt,
        label: `Quiz added: ${quiz.question}`,
        type: 'quiz'
      });
    }
  });

  assignments.forEach((assignment) => {
    if (assignment.createdAt) {
      items.push({
        time: assignment.createdAt,
        label: `Assignment added: ${assignment.title}`,
        type: 'assignment'
      });
    }
  });

  quizSubmissions.forEach((submission) => {
    if (submission.submittedAt) {
      items.push({
        time: submission.submittedAt,
        label: `Quiz submitted by ${submission.studentName} (${submission.score}/${submission.total})`,
        type: 'submission'
      });
    }
  });

  assignmentSubmissions.forEach((submission) => {
    if (submission.submittedAt) {
      items.push({
        time: submission.submittedAt,
        label: `Assignment submitted by ${submission.studentName}`,
        type: 'submission'
      });
    }
  });

  items.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
  const trimmed = items.slice(0, 8);

  activityFeed.innerHTML = '';
  if (!trimmed.length) {
    activityFeed.innerHTML = '<div class="mini-empty">No activity yet.</div>';
    return;
  }

  trimmed.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'mini-item';
    row.innerHTML = `
      <span class="dot ${escapeHtml(item.type)}"></span>
      <div>
        <div class="mini-title">${escapeHtml(item.label)}</div>
        <div class="mini-time">${formatTime(item.time)}</div>
      </div>
    `;
    activityFeed.appendChild(row);
  });
}
function renderTeachers() {
  const { list, classCount } = getFilteredTeachers();
  teacherList.innerHTML = '';
  teacherMeta.textContent = `${list.length} of ${teachers.length} teachers`;

  if (!list.length) {
    teacherList.innerHTML = '<div class="list-item"><p>No teachers tracked yet.</p></div>';
    return;
  }

  list.forEach((teacher) => {
    const card = document.createElement('div');
    card.className = 'list-item';
    const count = classCount.get(teacher.id) || 0;
    const status = isActive(teacher.lastSeen) ? 'Active now' : `Last seen: ${formatTime(teacher.lastSeen)}`;
    const statusClass = isActive(teacher.lastSeen) ? 'badge-active' : '';
    card.innerHTML = `
      <div class="item-header">
        <div>
          <h4>${escapeHtml(teacher.id)}</h4>
          <p>Classes: ${count}</p>
        </div>
        <span class="badge ${statusClass}">${escapeHtml(status)}</span>
      </div>
    `;
    teacherList.appendChild(card);
  });
}

function renderStudents() {
  const list = getFilteredStudents();
  studentList.innerHTML = '';
  studentMeta.textContent = `${list.length} of ${students.length} students`;

  if (!list.length) {
    studentList.innerHTML = '<div class="list-item"><p>No students tracked yet.</p></div>';
    return;
  }

  list.forEach((student) => {
    const card = document.createElement('div');
    card.className = 'list-item';
    const status = isActive(student.lastSeen) ? 'Active now' : `Last seen: ${formatTime(student.lastSeen)}`;
    const statusClass = isActive(student.lastSeen) ? 'badge-active' : '';
    card.innerHTML = `
      <div class="item-header">
        <div>
          <h4>${escapeHtml(student.name)}</h4>
        </div>
        <span class="badge ${statusClass}">${escapeHtml(status)}</span>
      </div>
    `;
    studentList.appendChild(card);
  });
}

function renderClasses() {
  const list = getFilteredClasses();
  classList.innerHTML = '';
  classMeta.textContent = `${list.length} of ${classes.length} classes`;

  if (!list.length) {
    classList.innerHTML = '<div class="list-item"><p>No classes yet.</p></div>';
    return;
  }

  list.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'list-item';
    const upcoming = Array.isArray(item.upcomingSessions) ? item.upcomingSessions : [];
    const upcomingPreview = upcoming.slice(0, 2).join(' � ');
    const upcomingMore = upcoming.length > 2 ? ` +${upcoming.length - 2} more` : '';
    const nextSession = item.nextSession || (upcoming[0] || 'TBA');
    const schedule = item.scheduleNotes || 'Schedule not published.';
    const modeLabel = item.mode === 'human' ? 'Live' : 'AI';

    card.innerHTML = `
      <h4>${escapeHtml(item.subject)}</h4>
      <p>${escapeHtml(item.description || 'No description provided.')}</p>
      <div class="tag-row">
        <span class="badge">Teacher: ${escapeHtml(item.teacherId || 'Unknown')}</span>
        <span class="badge">Mode: ${escapeHtml(modeLabel)}</span>
        <span class="badge">Next: ${escapeHtml(nextSession)}</span>
      </div>
      <div class="tag-row">
        <span class="badge">${escapeHtml(schedule)}</span>
        ${upcoming.length ? `<span class="badge">Upcoming: ${escapeHtml(`${upcomingPreview}${upcomingMore}`)}</span>` : ''}
      </div>
    `;
    classList.appendChild(card);
  });
}

function renderQuizzes() {
  const list = getFilteredQuizzes();
  const showAnswers = isChecked('quizShowAnswers');
  quizList.innerHTML = '';
  quizMeta.textContent = `${list.length} of ${quizzes.length} quizzes`;

  if (!list.length) {
    quizList.innerHTML = '<div class="list-item"><p>No quizzes yet.</p></div>';
    return;
  }

  list.forEach((quiz) => {
    const card = document.createElement('div');
    card.className = 'list-item';
    const options = Array.isArray(quiz.options) ? quiz.options : [];
    const optionsHtml = options
      .map((option, index) => {
        const isCorrect = showAnswers && Number(quiz.correctIndex) === index;
        const tagClass = isCorrect ? 'tag tag-correct' : 'tag';
        return `<span class="${tagClass}">${escapeHtml(option)}</span>`;
      })
      .join('');

    const answerText = showAnswers && options[quiz.correctIndex]
      ? `<span class="badge badge-active">Correct: ${escapeHtml(options[quiz.correctIndex])}</span>`
      : '';

    card.innerHTML = `
      <div class="item-header">
        <div>
          <h4>${escapeHtml(quiz.question)}</h4>
          <p>Class: ${escapeHtml(quiz.classId || 'all')}</p>
        </div>
        <span class="badge">Teacher: ${escapeHtml(quiz.teacherId || 'Unknown')}</span>
      </div>
      <div class="tag-row">${optionsHtml}</div>
      <div class="tag-row">
        <span class="badge">Created: ${escapeHtml(formatTime(quiz.createdAt))}</span>
        ${answerText}
      </div>
    `;
    quizList.appendChild(card);
  });
}

function renderAssignments() {
  const list = getFilteredAssignments();
  assignmentList.innerHTML = '';
  assignmentMeta.textContent = `${list.length} of ${assignments.length} assignments`;

  if (!list.length) {
    assignmentList.innerHTML = '<div class="list-item"><p>No assignments yet.</p></div>';
    return;
  }

  list.forEach((assignment) => {
    const card = document.createElement('div');
    card.className = 'list-item';
    card.innerHTML = `
      <div class="item-header">
        <div>
          <h4>${escapeHtml(assignment.title)}</h4>
          <p>${escapeHtml(assignment.description || 'No description provided.')}</p>
        </div>
        <span class="badge">Teacher: ${escapeHtml(assignment.teacherId || 'Unknown')}</span>
      </div>
      <div class="tag-row">
        <span class="badge">Class: ${escapeHtml(assignment.classId || 'all')}</span>
        <span class="badge">Created: ${escapeHtml(formatTime(assignment.createdAt))}</span>
      </div>
    `;
    assignmentList.appendChild(card);
  });
}
function renderQuizSubmissions() {
  const { list, quizMap } = getFilteredQuizSubmissions();
  quizSubmissionList.innerHTML = '';
  quizSubmissionMeta.textContent = `${list.length} of ${quizSubmissions.length} submissions`;

  if (!list.length) {
    quizSubmissionList.innerHTML = '<div class="list-item"><p>No quiz submissions yet.</p></div>';
    return;
  }

  list.forEach((submission) => {
    const card = document.createElement('div');
    card.className = 'list-item';
    const answers = Array.isArray(submission.answers) ? submission.answers : [];
    const detailHtml = answers
      .map((answer) => {
        const quiz = quizMap.get(answer.quizId);
        const question = quiz ? quiz.question : 'Unknown quiz';
        const options = quiz ? quiz.options : [];
        const selected = Number.isFinite(Number(answer.answerIndex)) ? options[answer.answerIndex] : null;
        const correct = quiz && Number.isFinite(Number(quiz.correctIndex))
          ? options[quiz.correctIndex]
          : null;
        const isCorrect = quiz ? Number(answer.answerIndex) === Number(quiz.correctIndex) : false;
        const resultClass = isCorrect ? 'good' : 'bad';

        return `
          <div class="detail-item">
            <div class="detail-q">${escapeHtml(question)}</div>
            <div class="detail-a">
              <span class="detail-pill ${resultClass}">${isCorrect ? 'Correct' : 'Incorrect'}</span>
              <span class="detail-text">Selected: ${escapeHtml(selected || 'N/A')}</span>
              <span class="detail-text">Answer: ${escapeHtml(correct || 'N/A')}</span>
            </div>
          </div>
        `;
      })
      .join('');

    card.innerHTML = `
      <div class="item-header">
        <div>
          <h4>${escapeHtml(submission.studentName)}</h4>
          <p>Submitted: ${escapeHtml(formatTime(submission.submittedAt))}</p>
        </div>
        <span class="score-pill">${escapeHtml(`${submission.score}/${submission.total}`)}</span>
      </div>
      <details class="details">
        <summary>View answers (${answers.length})</summary>
        <div class="details-body">
          ${detailHtml || '<div class="mini-empty">No answers stored.</div>'}
        </div>
      </details>
    `;
    quizSubmissionList.appendChild(card);
  });
}

function renderAssignmentSubmissions() {
  const { list, assignmentMap } = getFilteredAssignmentSubmissions();
  assignmentSubmissionList.innerHTML = '';
  assignmentSubmissionMeta.textContent = `${list.length} of ${assignmentSubmissions.length} submissions`;

  if (!list.length) {
    assignmentSubmissionList.innerHTML = '<div class="list-item"><p>No assignment submissions yet.</p></div>';
    return;
  }

  list.forEach((submission) => {
    const card = document.createElement('div');
    card.className = 'list-item';
    const assignment = assignmentMap.get(submission.assignmentId);
    const title = assignment ? assignment.title : 'Unknown assignment';
    const answer = submission.answer || '';
    const preview = answer.length > 180 ? `${answer.slice(0, 180)}...` : answer;

    card.innerHTML = `
      <div class="item-header">
        <div>
          <h4>${escapeHtml(submission.studentName)}</h4>
          <p>${escapeHtml(title)}</p>
        </div>
        <span class="badge">Submitted: ${escapeHtml(formatTime(submission.submittedAt))}</span>
      </div>
      <div class="response-preview">${escapeHtml(preview || 'No answer provided.')}</div>
      <details class="details">
        <summary>Read full response</summary>
        <div class="details-body">
          <div class="detail-item">
            <div class="detail-q">Answer</div>
            <div class="detail-a">${escapeHtml(answer || 'No answer provided.')}</div>
          </div>
        </div>
      </details>
    `;
    assignmentSubmissionList.appendChild(card);
  });
}

function toCsvValue(value) {
  const text = String(value ?? '');
  if (/["\n,]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCSV(filename, rows) {
  const content = rows.map((row) => row.map(toCsvValue).join(',')).join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
function exportTeachersCSV() {
  const { list, classCount } = getFilteredTeachers();
  const rows = [['Teacher ID', 'First Seen', 'Last Seen', 'Classes', 'Active']];
  list.forEach((teacher) => {
    rows.push([
      teacher.id,
      teacher.firstSeen,
      teacher.lastSeen,
      classCount.get(teacher.id) || 0,
      isActive(teacher.lastSeen) ? 'Yes' : 'No'
    ]);
  });
  downloadCSV('teachers.csv', rows);
}

function exportStudentsCSV() {
  const list = getFilteredStudents();
  const rows = [['Student Name', 'First Seen', 'Last Seen', 'Active']];
  list.forEach((student) => {
    rows.push([
      student.name,
      student.firstSeen,
      student.lastSeen,
      isActive(student.lastSeen) ? 'Yes' : 'No'
    ]);
  });
  downloadCSV('students.csv', rows);
}

function exportClassesCSV() {
  const list = getFilteredClasses();
  const rows = [['Subject', 'Description', 'Teacher ID', 'Mode', 'Next Session', 'Schedule Notes', 'Created At']];
  list.forEach((item) => {
    rows.push([
      item.subject,
      item.description,
      item.teacherId,
      item.mode,
      item.nextSession,
      item.scheduleNotes,
      item.createdAt
    ]);
  });
  downloadCSV('classes.csv', rows);
}

function exportQuizzesCSV() {
  const list = getFilteredQuizzes();
  const rows = [['Question', 'Options', 'Correct Index', 'Class ID', 'Teacher ID', 'Created At']];
  list.forEach((quiz) => {
    rows.push([
      quiz.question,
      Array.isArray(quiz.options) ? quiz.options.join(' | ') : '',
      quiz.correctIndex,
      quiz.classId,
      quiz.teacherId,
      quiz.createdAt
    ]);
  });
  downloadCSV('quizzes.csv', rows);
}

function exportAssignmentsCSV() {
  const list = getFilteredAssignments();
  const rows = [['Title', 'Description', 'Class ID', 'Teacher ID', 'Created At']];
  list.forEach((assignment) => {
    rows.push([
      assignment.title,
      assignment.description,
      assignment.classId,
      assignment.teacherId,
      assignment.createdAt
    ]);
  });
  downloadCSV('assignments.csv', rows);
}

function exportQuizSubmissionsCSV() {
  const { list } = getFilteredQuizSubmissions();
  const rows = [['Student Name', 'Score', 'Total', 'Submitted At', 'Quiz IDs']];
  list.forEach((submission) => {
    const quizIds = Array.isArray(submission.answers)
      ? submission.answers.map((answer) => answer.quizId).join(' | ')
      : '';
    rows.push([
      submission.studentName,
      submission.score,
      submission.total,
      submission.submittedAt,
      quizIds
    ]);
  });
  downloadCSV('quiz_submissions.csv', rows);
}

function exportAssignmentSubmissionsCSV() {
  const { list } = getFilteredAssignmentSubmissions();
  const rows = [['Student Name', 'Assignment ID', 'Answer', 'Submitted At']];
  list.forEach((submission) => {
    rows.push([
      submission.studentName,
      submission.assignmentId,
      submission.answer,
      submission.submittedAt
    ]);
  });
  downloadCSV('assignment_submissions.csv', rows);
}

function renderAll() {
  populateFilters();
  renderOverview();
  renderActivity();
  renderTeachers();
  renderStudents();
  renderClasses();
  renderQuizzes();
  renderAssignments();
  renderQuizSubmissions();
  renderAssignmentSubmissions();
}

async function loadAll() {
  refreshAdmin.disabled = true;
  const results = await Promise.allSettled([
    loadTeachers(),
    loadStudents(),
    loadClasses(),
    loadQuizzes(),
    loadAssignments(),
    loadQuizSubmissions(),
    loadAssignmentSubmissions(),
    loadHealth()
  ]);

  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length) {
    setError('Some data could not be loaded. Please try again.');
  } else {
    setError('');
  }

  renderAll();
  updateLastUpdated();
  refreshAdmin.disabled = false;
}

function bindInput(id, handler, eventName = 'input') {
  const element = byId(id);
  if (!element) {
    return;
  }
  element.addEventListener(eventName, handler);
}

bindInput('teacherSearch', renderTeachers);
bindInput('teacherActiveOnly', renderTeachers, 'change');
bindInput('teacherSort', renderTeachers, 'change');
bindInput('exportTeachers', exportTeachersCSV, 'click');

bindInput('studentSearch', renderStudents);
bindInput('studentActiveOnly', renderStudents, 'change');
bindInput('studentSort', renderStudents, 'change');
bindInput('exportStudents', exportStudentsCSV, 'click');

bindInput('classSearch', renderClasses);
bindInput('classTeacherFilter', renderClasses, 'change');
bindInput('classModeFilter', renderClasses, 'change');
bindInput('classSort', renderClasses, 'change');
bindInput('exportClasses', exportClassesCSV, 'click');

bindInput('quizSearch', renderQuizzes);
bindInput('quizTeacherFilter', renderQuizzes, 'change');
bindInput('quizClassFilter', renderQuizzes, 'change');
bindInput('quizShowAnswers', renderQuizzes, 'change');
bindInput('quizSort', renderQuizzes, 'change');
bindInput('exportQuizzes', exportQuizzesCSV, 'click');

bindInput('assignmentSearch', renderAssignments);
bindInput('assignmentTeacherFilter', renderAssignments, 'change');
bindInput('assignmentClassFilter', renderAssignments, 'change');
bindInput('assignmentSort', renderAssignments, 'change');
bindInput('exportAssignments', exportAssignmentsCSV, 'click');

bindInput('quizSubmissionSearch', renderQuizSubmissions);
bindInput('quizSubmissionTeacherFilter', renderQuizSubmissions, 'change');
bindInput('quizSubmissionClassFilter', renderQuizSubmissions, 'change');
bindInput('quizSubmissionRange', renderQuizSubmissions, 'change');
bindInput('exportQuizSubmissions', exportQuizSubmissionsCSV, 'click');

bindInput('assignmentSubmissionSearch', renderAssignmentSubmissions);
bindInput('assignmentSubmissionTeacherFilter', renderAssignmentSubmissions, 'change');
bindInput('assignmentSubmissionClassFilter', renderAssignmentSubmissions, 'change');
bindInput('assignmentSubmissionRange', renderAssignmentSubmissions, 'change');
bindInput('exportAssignmentSubmissions', exportAssignmentSubmissionsCSV, 'click');

refreshAdmin.addEventListener('click', loadAll);

loadAll();
setInterval(loadAll, 20000);
