const express = require('express');
const path = require('path');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI. Set it to your MongoDB Atlas connection string.');
  process.exit(1);
}

mongoose.set('strictQuery', true);

const teacherSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  firstSeen: { type: Date, required: true },
  lastSeen: { type: Date, required: true }
});

const studentSchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true },
  firstSeen: { type: Date, required: true },
  lastSeen: { type: Date, required: true }
});

const classSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  description: { type: String, default: '' },
  mode: { type: String, enum: ['ai', 'human'], default: 'ai' },
  nextSession: { type: String, default: '' },
  scheduleNotes: { type: String, default: '' },
  upcomingSessions: { type: [String], default: [] },
  teacherId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const quizSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: { type: [String], required: true },
  correctIndex: { type: Number, required: true },
  classId: { type: String, default: 'all' },
  teacherId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const assignmentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  classId: { type: String, default: 'all' },
  teacherId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const quizSubmissionSchema = new mongoose.Schema({
  studentName: { type: String, required: true },
  answers: [
    {
      quizId: { type: String, required: true },
      answerIndex: { type: Number, required: true }
    }
  ],
  score: { type: Number, required: true },
  total: { type: Number, required: true },
  submittedAt: { type: Date, default: Date.now }
});

const assignmentSubmissionSchema = new mongoose.Schema({
  assignmentId: { type: String, required: true },
  studentName: { type: String, required: true },
  answer: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now }
});

const Teacher = mongoose.model('Teacher', teacherSchema);
const Student = mongoose.model('Student', studentSchema);
const ClassModel = mongoose.model('Class', classSchema);
const Quiz = mongoose.model('Quiz', quizSchema);
const Assignment = mongoose.model('Assignment', assignmentSchema);
const QuizSubmission = mongoose.model('QuizSubmission', quizSubmissionSchema);
const AssignmentSubmission = mongoose.model('AssignmentSubmission', assignmentSubmissionSchema);

function toPlain(doc) {
  if (!doc) {
    return doc;
  }
  const obj = doc.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  return obj;
}

function mapList(list) {
  return list.map((doc) => toPlain(doc));
}

function getTeacherId(req) {
  const headerId = req.headers['x-teacher-id'];
  return String(headerId || req.query.teacherId || (req.body && req.body.teacherId) || '').trim();
}

async function registerTeacher(teacherId) {
  if (!teacherId) {
    return;
  }
  const now = new Date();
  await Teacher.findOneAndUpdate(
    { id: teacherId },
    { $set: { lastSeen: now }, $setOnInsert: { id: teacherId, firstSeen: now } },
    { upsert: true }
  );
}

async function registerStudent(studentName) {
  if (!studentName) {
    return;
  }
  const now = new Date();
  const normalized = studentName.trim();
  await Student.findOneAndUpdate(
    { name: normalized },
    { $set: { lastSeen: now }, $setOnInsert: { name: normalized, firstSeen: now } },
    { upsert: true }
  );
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server);

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDateQuery(startValue, endValue) {
  const range = {};
  if (startValue) {
    const startDate = new Date(startValue);
    if (!Number.isNaN(startDate.getTime())) {
      range.$gte = startDate;
    }
  }
  if (endValue) {
    const endDate = new Date(endValue);
    if (!Number.isNaN(endDate.getTime())) {
      range.$lte = endDate;
    }
  }
  return Object.keys(range).length ? range : null;
}

function buildIceServers() {
  const servers = [];
  const stunList = parseList(process.env.STUN_URLS);
  const turnList = parseList(process.env.TURN_URLS || process.env.TURN_URL);
  const turnUser = String(process.env.TURN_USER || '').trim();
  const turnPass = String(process.env.TURN_PASS || '').trim();
  const allowPublicStun = String(process.env.DISABLE_PUBLIC_STUN || '').toLowerCase() !== 'true';

  if (stunList.length) {
    servers.push({ urls: stunList });
  } else if (allowPublicStun) {
    servers.push({
      urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']
    });
  }

  if (turnList.length && turnUser && turnPass) {
    servers.push({
      urls: turnList,
      username: turnUser,
      credential: turnPass
    });
  }

  return servers;
}

const liveRooms = new Map();
const teacherRooms = new Map();
const studentRooms = new Map();

const roomKey = (classId) => `class:${classId}`;

function leaveTeacherRoom(socket) {
  const classId = teacherRooms.get(socket.id);
  if (!classId) {
    return;
  }

  const live = liveRooms.get(classId);
  if (live && live.socketId === socket.id) {
    liveRooms.delete(classId);
    io.to(roomKey(classId)).emit('teacher-left', { classId });
  }

  teacherRooms.delete(socket.id);
  socket.leave(roomKey(classId));
}

function leaveStudentRoom(socket) {
  const classId = studentRooms.get(socket.id);
  if (!classId) {
    return;
  }

  studentRooms.delete(socket.id);
  socket.leave(roomKey(classId));

  const live = liveRooms.get(classId);
  if (live) {
    io.to(live.socketId).emit('student-left', { studentId: socket.id, classId });
  }
}

io.on('connection', (socket) => {
  socket.on('teacher-join', (payload = {}) => {
    const classId = String(payload.classId || '').trim();
    const teacherId = String(payload.teacherId || '').trim();
    if (!classId) {
      return;
    }

    const existing = liveRooms.get(classId);
    if (existing && existing.socketId !== socket.id) {
      io.to(existing.socketId).emit('teacher-replaced', { classId });
      teacherRooms.delete(existing.socketId);
    }

    leaveTeacherRoom(socket);

    liveRooms.set(classId, { socketId: socket.id, teacherId });
    teacherRooms.set(socket.id, classId);
    socket.join(roomKey(classId));

    io.to(roomKey(classId)).emit('teacher-live', {
      classId,
      teacherId,
      teacherSocketId: socket.id
    });
  });

  socket.on('teacher-leave', (payload = {}) => {
    const classId = String(payload.classId || teacherRooms.get(socket.id) || '').trim();
    if (!classId) {
      return;
    }

    const live = liveRooms.get(classId);
    if (live && live.socketId === socket.id) {
      liveRooms.delete(classId);
      io.to(roomKey(classId)).emit('teacher-left', { classId });
    }

    teacherRooms.delete(socket.id);
    socket.leave(roomKey(classId));
  });

  socket.on('student-join', (payload = {}) => {
    const classId = String(payload.classId || '').trim();
    if (!classId) {
      return;
    }

    leaveStudentRoom(socket);
    studentRooms.set(socket.id, classId);
    socket.join(roomKey(classId));

    const live = liveRooms.get(classId);
    if (live) {
      io.to(live.socketId).emit('student-join', { studentId: socket.id, classId });
      socket.emit('teacher-live', {
        classId,
        teacherId: live.teacherId,
        teacherSocketId: live.socketId
      });
    } else {
      socket.emit('teacher-offline', { classId });
    }
  });

  socket.on('student-leave', (payload = {}) => {
    const classId = String(payload.classId || studentRooms.get(socket.id) || '').trim();
    if (!classId) {
      return;
    }

    studentRooms.delete(socket.id);
    socket.leave(roomKey(classId));

    const live = liveRooms.get(classId);
    if (live) {
      io.to(live.socketId).emit('student-left', { studentId: socket.id, classId });
    }
  });

  socket.on('offer', (payload = {}) => {
    const target = String(payload.to || '').trim();
    if (!target) {
      return;
    }
    io.to(target).emit('offer', {
      from: socket.id,
      sdp: payload.sdp,
      classId: payload.classId
    });
  });

  socket.on('answer', (payload = {}) => {
    const target = String(payload.to || '').trim();
    if (!target) {
      return;
    }
    io.to(target).emit('answer', {
      from: socket.id,
      sdp: payload.sdp,
      classId: payload.classId
    });
  });

  socket.on('ice-candidate', (payload = {}) => {
    const target = String(payload.to || '').trim();
    if (!target) {
      return;
    }
    io.to(target).emit('ice-candidate', {
      from: socket.id,
      candidate: payload.candidate,
      classId: payload.classId
    });
  });

  // ── Chat relay ────────────────────────────────────────────
  socket.on('teacher-chat', (payload = {}) => {
    const classId = String(payload.classId || '').trim();
    const text    = String(payload.text    || '').trim();
    if (!classId || !text) return;
    // Broadcast to all students in the room
    socket.to(roomKey(classId)).emit('teacher-chat', {
      classId,
      name: String(payload.teacherId || 'Teacher').trim(),
      text
    });
  });

  socket.on('student-chat', (payload = {}) => {
    const classId = String(payload.classId || '').trim();
    const text    = String(payload.text    || '').trim();
    if (!classId || !text) return;
    const live = liveRooms.get(classId);
    // Send to teacher + broadcast to room
    if (live) {
      io.to(live.socketId).emit('student-chat', {
        classId,
        studentId: socket.id,
        name: String(payload.name || 'Student').trim(),
        text
      });
    }
    // Also send to all students so everyone sees the message
    socket.to(roomKey(classId)).emit('student-chat', {
      classId,
      studentId: socket.id,
      name: String(payload.name || 'Student').trim(),
      text
    });
  });

  // ── Hand raise ────────────────────────────────────────────
  socket.on('student-hand', (payload = {}) => {
    const classId = String(payload.classId || '').trim();
    if (!classId) return;
    const live = liveRooms.get(classId);
    if (live) {
      io.to(live.socketId).emit('student-hand', {
        classId,
        studentId: socket.id,
        name: String(payload.name || 'Student').trim()
      });
    }
  });

  socket.on('disconnect', () => {
    leaveStudentRoom(socket);
    leaveTeacherRoom(socket);
  });
});

app.get('/', (req, res) => {
  res.redirect('/student/');
});

app.get('/student', (req, res) => {
  res.redirect('/student/');
});

app.get('/teacher', (req, res) => {
  res.redirect('/teacher/');
});

app.get('/admin', (req, res) => {
  res.redirect('/admin/');
});

function callOllama(prompt) {
  const payload = JSON.stringify({
    model: 'mistral',
    prompt,
    stream: false
  });

  const options = {
    hostname: 'localhost',
    port: 11434,
    path: '/api/generate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(body);
            resolve(json.response || '');
          } catch (err) {
            reject(err);
          }
        } else {
          reject(new Error(`Ollama error ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

app.post('/ask', async (req, res) => {
  const question = String(req.body && req.body.question ? req.body.question : '').trim();
  if (!question) {
    return res.status(400).json({ error: 'Question is required.' });
  }

  const prompt = [
    'You are an AI teacher.',
    'Explain step-by-step in simple terms.',
    'Use a Hindi + English mix (Hinglish).',
    'Give one clear example.',
    'Ask a short follow-up question at the end.',
    '',
    `Student question: ${question}`
  ].join('\n');

  try {
    const answer = await callOllama(prompt);
    return res.json({ answer, model: 'mistral' });
  } catch (err) {
    console.error(err);
    return res.status(502).json({
      error: 'Failed to reach Ollama. Make sure it is running on http://localhost:11434.'
    });
  }
});

app.get('/classes', async (req, res) => {
  const teacherId = getTeacherId(req);
  const query = teacherId ? { teacherId } : {};
  const classes = await ClassModel.find(query).sort({ createdAt: -1 });
  if (teacherId) {
    await registerTeacher(teacherId);
  }
  return res.json({ classes: mapList(classes) });
});

app.post('/class', async (req, res) => {
  const teacherId = getTeacherId(req);
  const subject = String(req.body && req.body.subject ? req.body.subject : '').trim();
  const description = String(req.body && req.body.description ? req.body.description : '').trim();
  const nextSession = String(req.body && req.body.nextSession ? req.body.nextSession : '').trim();
  const scheduleNotes = String(req.body && req.body.scheduleNotes ? req.body.scheduleNotes : '').trim();
  const upcomingRaw = req.body && req.body.upcomingSessions ? req.body.upcomingSessions : [];
  const upcomingSessions = Array.isArray(upcomingRaw)
    ? upcomingRaw.map((item) => String(item || '').trim()).filter(Boolean)
    : String(upcomingRaw)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

  if (!teacherId) {
    return res.status(400).json({ error: 'teacherId is required.' });
  }
  if (teacherId.toLowerCase() === 'admin') {
    return res.status(403).json({ error: 'Admin cannot create classes.' });
  }

  if (!subject) {
    return res.status(400).json({ error: 'Subject is required.' });
  }

  const newClass = await ClassModel.create({
    subject,
    description,
    mode: 'ai',
    nextSession,
    scheduleNotes,
    upcomingSessions,
    teacherId
  });

  await registerTeacher(teacherId);

  return res.status(201).json({ class: toPlain(newClass) });
});

app.post('/class-mode', async (req, res) => {
  const teacherId = getTeacherId(req);
  const classId = String(req.body && req.body.classId ? req.body.classId : '').trim();
  const mode = String(req.body && req.body.mode ? req.body.mode : '').trim().toLowerCase();

  if (!teacherId || !classId || !['ai', 'human'].includes(mode)) {
    return res.status(400).json({ error: 'teacherId, classId, and mode (ai/human) are required.' });
  }
  if (teacherId.toLowerCase() === 'admin') {
    return res.status(403).json({ error: 'Admin cannot update class mode.' });
  }

  const targetClass = await ClassModel.findById(classId);
  if (!targetClass) {
    return res.status(404).json({ error: 'Class not found.' });
  }

  if (targetClass.teacherId !== teacherId) {
    return res.status(403).json({ error: 'Not allowed to update this class.' });
  }

  targetClass.mode = mode;
  await targetClass.save();
  await registerTeacher(teacherId);

  return res.json({ class: toPlain(targetClass) });
});

app.get('/quizzes', async (req, res) => {
  const classId = String(req.query.classId || '').trim();
  const teacherId = getTeacherId(req);
  const includeAnswers =
    String(req.query.includeAnswers || '').toLowerCase() === 'true' ||
    ['admin', 'teacher'].includes(String(req.query.role || '').toLowerCase());

  const query = {};
  if (teacherId) {
    query.teacherId = teacherId;
  }
  if (classId) {
    query.$or = [{ classId }, { classId: 'all' }, { classId: { $exists: false } }];
  }

  const quizzes = await Quiz.find(query).sort({ createdAt: -1 });

  const mapped = quizzes.map((quiz) => {
    if (includeAnswers) {
      return toPlain(quiz);
    }
    return {
      id: quiz._id.toString(),
      question: quiz.question,
      options: quiz.options,
      classId: quiz.classId || 'all',
      teacherId: quiz.teacherId,
      createdAt: quiz.createdAt
    };
  });

  return res.json({ quizzes: mapped });
});

app.post('/quiz', async (req, res) => {
  const teacherId = getTeacherId(req);
  const question = String(req.body && req.body.question ? req.body.question : '').trim();
  const optionsRaw = Array.isArray(req.body && req.body.options) ? req.body.options : [];
  const options = optionsRaw.map((option) => String(option || '').trim()).filter(Boolean);
  const classIdRaw = String(req.body && req.body.classId ? req.body.classId : 'all').trim();
  const classId = classIdRaw || 'all';

  if (!teacherId) {
    return res.status(400).json({ error: 'teacherId is required.' });
  }
  if (teacherId.toLowerCase() === 'admin') {
    return res.status(403).json({ error: 'Admin cannot create quizzes.' });
  }

  if (!question) {
    return res.status(400).json({ error: 'Question is required.' });
  }

  if (options.length !== 4) {
    return res.status(400).json({ error: 'Exactly 4 options are required.' });
  }

  let correctIndex = Number.isInteger(req.body && req.body.correctIndex)
    ? req.body.correctIndex
    : null;

  if (correctIndex === null && req.body && req.body.correctAnswer) {
    const answerText = String(req.body.correctAnswer).trim().toLowerCase();
    correctIndex = options.findIndex((opt) => opt.toLowerCase() === answerText);
  }

  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return res.status(400).json({ error: 'correctIndex must be between 0 and 3.' });
  }

  if (classId !== 'all') {
    const targetClass = await ClassModel.findById(classId);
    if (!targetClass) {
      return res.status(400).json({ error: 'classId is invalid.' });
    }
    if (targetClass.teacherId !== teacherId) {
      return res.status(403).json({ error: 'Not allowed to add quiz to this class.' });
    }
  }

  const quiz = await Quiz.create({
    question,
    options,
    classId,
    teacherId,
    correctIndex
  });

  await registerTeacher(teacherId);

  return res.status(201).json({ quiz: toPlain(quiz) });
});

app.post('/submit-quiz', async (req, res) => {
  const studentName =
    String(req.body && req.body.studentName ? req.body.studentName : 'Anonymous').trim() ||
    'Anonymous';

  let answers = [];
  if (Array.isArray(req.body && req.body.answers)) {
    answers = req.body.answers;
  } else if (req.body && req.body.quizId) {
    answers = [{ quizId: req.body.quizId, answerIndex: req.body.answerIndex }];
  }

  if (!answers.length) {
    return res.status(400).json({ error: 'answers are required.' });
  }

  const normalizedAnswers = answers.map((answer) => ({
    quizId: String(answer.quizId || '').trim(),
    answerIndex: Number.isFinite(Number(answer.answerIndex)) ? Number(answer.answerIndex) : -1
  }));

  const quizIds = normalizedAnswers.map((answer) => answer.quizId).filter(Boolean);
  const quizzes = await Quiz.find({ _id: { $in: quizIds } });
  const quizMap = new Map(quizzes.map((quiz) => [quiz._id.toString(), quiz]));

  const results = normalizedAnswers.map((answer) => {
    const quiz = quizMap.get(answer.quizId);
    if (!quiz) {
      return {
        quizId: answer.quizId,
        selectedIndex: answer.answerIndex,
        correctIndex: null,
        correct: false,
        question: null,
        options: []
      };
    }

    const selectedIndex = answer.answerIndex;
    const correctIndex = quiz.correctIndex;
    const correct = selectedIndex === correctIndex;

    return {
      quizId: quiz._id.toString(),
      selectedIndex,
      correctIndex,
      correct,
      question: quiz.question,
      options: quiz.options
    };
  });

  const score = results.filter((result) => result.correct).length;
  const total = results.length;

  await QuizSubmission.create({
    studentName,
    answers: normalizedAnswers,
    score,
    total
  });

  await registerStudent(studentName);

  return res.json({ score, total, results });
});

app.get('/assignments', async (req, res) => {
  const classId = String(req.query.classId || '').trim();
  const teacherId = getTeacherId(req);
  const query = {};

  if (teacherId) {
    query.teacherId = teacherId;
  }

  if (classId) {
    query.$or = [{ classId }, { classId: 'all' }, { classId: { $exists: false } }];
  }

  const assignments = await Assignment.find(query).sort({ createdAt: -1 });
  return res.json({ assignments: mapList(assignments) });
});

app.post('/assignment', async (req, res) => {
  const teacherId = getTeacherId(req);
  const title = String(req.body && req.body.title ? req.body.title : '').trim();
  const description = String(req.body && req.body.description ? req.body.description : '').trim();
  const classIdRaw = String(req.body && req.body.classId ? req.body.classId : 'all').trim();
  const classId = classIdRaw || 'all';

  if (!teacherId) {
    return res.status(400).json({ error: 'teacherId is required.' });
  }
  if (teacherId.toLowerCase() === 'admin') {
    return res.status(403).json({ error: 'Admin cannot create assignments.' });
  }

  if (!title) {
    return res.status(400).json({ error: 'Title is required.' });
  }

  if (classId !== 'all') {
    const targetClass = await ClassModel.findById(classId);
    if (!targetClass) {
      return res.status(400).json({ error: 'classId is invalid.' });
    }
    if (targetClass.teacherId !== teacherId) {
      return res.status(403).json({ error: 'Not allowed to add assignment to this class.' });
    }
  }

  const assignment = await Assignment.create({
    title,
    description,
    classId,
    teacherId
  });

  await registerTeacher(teacherId);

  return res.status(201).json({ assignment: toPlain(assignment) });
});

app.post('/submit-assignment', async (req, res) => {
  const assignmentId = String(req.body && req.body.assignmentId ? req.body.assignmentId : '').trim();
  const studentName =
    String(req.body && req.body.studentName ? req.body.studentName : 'Anonymous').trim() ||
    'Anonymous';
  const answer = String(req.body && req.body.answer ? req.body.answer : '').trim();

  if (!assignmentId || !answer) {
    return res.status(400).json({ error: 'assignmentId and answer are required.' });
  }

  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) {
    return res.status(404).json({ error: 'Assignment not found.' });
  }

  await AssignmentSubmission.create({
    assignmentId,
    studentName,
    answer
  });

  await registerStudent(studentName);

  return res.status(201).json({ submission: { assignmentId, studentName, answer } });
});

app.get('/quiz-submissions', async (req, res) => {
  const studentName = String(req.query.studentName || '').trim();
  const start = String(req.query.start || '').trim();
  const end = String(req.query.end || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);

  const query = {};
  if (studentName) {
    query.studentName = new RegExp(escapeRegex(studentName), 'i');
  }

  const dateQuery = buildDateQuery(start, end);
  if (dateQuery) {
    query.submittedAt = dateQuery;
  }

  const submissions = await QuizSubmission.find(query)
    .sort({ submittedAt: -1 })
    .limit(limit);

  return res.json({ submissions: mapList(submissions) });
});

app.get('/assignment-submissions', async (req, res) => {
  const studentName = String(req.query.studentName || '').trim();
  const start = String(req.query.start || '').trim();
  const end = String(req.query.end || '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);

  const query = {};
  if (studentName) {
    query.studentName = new RegExp(escapeRegex(studentName), 'i');
  }

  const dateQuery = buildDateQuery(start, end);
  if (dateQuery) {
    query.submittedAt = dateQuery;
  }

  const submissions = await AssignmentSubmission.find(query)
    .sort({ submittedAt: -1 })
    .limit(limit);

  return res.json({ submissions: mapList(submissions) });
});

app.get('/teachers', async (req, res) => {
  const teachers = await Teacher.find().sort({ lastSeen: -1 });
  return res.json({ teachers: mapList(teachers) });
});

app.get('/students', async (req, res) => {
  const students = await Student.find().sort({ lastSeen: -1 });
  return res.json({ students: mapList(students) });
});

app.get('/health', (req, res) => {
  return res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/rtc-config', (req, res) => {
  return res.json({ iceServers: buildIceServers() });
});

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    server.listen(PORT, () => {
      console.log(`OLMS server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });
