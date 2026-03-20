const tabs = Array.from(document.querySelectorAll('.side-btn'));
const panels = Array.from(document.querySelectorAll('.panel'));
const refreshAdmin = document.getElementById('refreshAdmin');

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
const teacherList = document.getElementById('teacherList');
const studentList = document.getElementById('studentList');
const classList = document.getElementById('classList');

let teachers = [];
let students = [];
let classes = [];
let quizzes = [];
let assignments = [];

function formatTime(value) {
  if (!value) {
    return 'Unknown';
  }
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

async function loadTeachers() {
  const response = await fetch('/teachers');
  const data = await response.json();
  teachers = data.teachers || [];
}

async function loadStudents() {
  const response = await fetch('/students');
  const data = await response.json();
  students = data.students || [];
}

async function loadClasses() {
  const response = await fetch('/classes');
  const data = await response.json();
  classes = data.classes || [];
}

async function loadQuizzes() {
  const response = await fetch('/quizzes');
  const data = await response.json();
  quizzes = data.quizzes || [];
}

async function loadAssignments() {
  const response = await fetch('/assignments');
  const data = await response.json();
  assignments = data.assignments || [];
}

function renderOverview() {
  totalTeachers.textContent = teachers.length;
  totalStudents.textContent = students.length;
  totalClasses.textContent = classes.length;
  totalQuizzes.textContent = quizzes.length;
  totalAssignments.textContent = assignments.length;
}

function renderTeachers() {
  teacherList.innerHTML = '';
  if (!teachers.length) {
    teacherList.innerHTML = '<div class="list-item"><p>No teachers tracked yet.</p></div>';
    return;
  }

  teachers.forEach((teacher) => {
    const card = document.createElement('div');
    card.className = 'list-item';
    const classCount = classes.filter((item) => item.teacherId === teacher.id).length;
    card.innerHTML = `
      <h4>${teacher.id}</h4>
      <p>Classes: ${classCount}</p>
      <span class="badge">Last seen: ${formatTime(teacher.lastSeen)}</span>
    `;
    teacherList.appendChild(card);
  });
}

function renderStudents() {
  studentList.innerHTML = '';
  if (!students.length) {
    studentList.innerHTML = '<div class="list-item"><p>No students tracked yet.</p></div>';
    return;
  }

  students.forEach((student) => {
    const card = document.createElement('div');
    card.className = 'list-item';
    card.innerHTML = `
      <h4>${student.name}</h4>
      <span class="badge">Last seen: ${formatTime(student.lastSeen)}</span>
    `;
    studentList.appendChild(card);
  });
}

function renderClasses() {
  classList.innerHTML = '';
  if (!classes.length) {
    classList.innerHTML = '<div class="list-item"><p>No classes yet.</p></div>';
    return;
  }

  classes.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'list-item';
    const nextSession = item.nextSession ? `Next: ${item.nextSession}` : 'Next: TBA';
    const schedule = item.scheduleNotes || 'Schedule not published.';
    card.innerHTML = `
      <h4>${item.subject}</h4>
      <p>${item.description || 'No description provided.'}</p>
      <span class="badge">${nextSession}</span>
      <span class="badge">${schedule}</span>
      <span class="badge">Teacher: ${item.teacherId || 'Unknown'} - Mode: ${item.mode === 'human' ? 'Live' : 'AI'}</span>
    `;
    classList.appendChild(card);
  });
}

async function loadAll() {
  try {
    await Promise.all([loadTeachers(), loadStudents(), loadClasses(), loadQuizzes(), loadAssignments()]);
    renderOverview();
    renderTeachers();
    renderStudents();
    renderClasses();
  } catch (err) {
    teacherList.innerHTML = '<div class="list-item"><p>Unable to load data.</p></div>';
  }
}

refreshAdmin.addEventListener('click', loadAll);

loadAll();
setInterval(loadAll, 20000);

