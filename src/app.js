const compression = require('compression');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const http = require('http');
const path = require('path');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const {
  admin,
  buildOriginMatcher,
  config,
  firebaseAdminConfigured,
  firebasePublicConfigured,
  firebaseRealtimeDatabaseConfigured,
  parseBoolean,
  parseList
} = require('./config');
const { Assignment, AssignmentSubmission, ClassModel, ExamProgress, Quiz, QuizSubmission, User } = require('./models');
const {
  authenticateRequest,
  canSelfRegisterRole,
  clearUserSession,
  createError,
  ensureValidObjectId,
  establishUserSession,
  getIdentityLabel,
  normalizeEmail,
  requestBelongsToRole,
  requireRole,
  sanitizeText,
  syncUserFromToken,
  syncUserToRealtimeDatabase,
  toSessionUser,
  verifyFirebaseRequest
} = require('./auth');
const { createRealtime } = require('./realtime');

function toPlain(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  if (obj._id) {
    obj.id = obj._id.toString();
    delete obj._id;
  }
  return obj;
}

function mapList(list) {
  return list.map((item) => toPlain(item));
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseScheduledClassSession(raw) {
  if (!raw) {
    return null;
  }
  if (typeof raw === 'object') {
    return raw;
  }
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function parseLimit(value, fallback = 200, max = 500) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function computeQuizDurationMinutes(startsAt, endsAt) {
  if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) {
    return 0;
  }
  if (!(endsAt instanceof Date) || Number.isNaN(endsAt.getTime())) {
    return 0;
  }
  const diffMs = endsAt.getTime() - startsAt.getTime();
  if (diffMs <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(diffMs / 60000));
}

function resolveQuizSchedule(body) {
  const startsAt = parseDate(body && body.startsAt);
  const endsAt = parseDate(body && body.endsAt);

  if (!startsAt && !endsAt) {
    return { startsAt: null, endsAt: null };
  }
  if (!startsAt || !endsAt) {
    throw createError(400, 'Both start and end time are required for a scheduled exam.', 'invalid_schedule');
  }
  if (endsAt <= startsAt) {
    throw createError(400, 'End time must be later than start time.', 'invalid_schedule');
  }

  return { startsAt, endsAt };
}

function isQuizAvailableNow(quiz, now = new Date()) {
  const startsAt = quiz && quiz.startsAt ? new Date(quiz.startsAt) : null;
  const endsAt = quiz && quiz.endsAt ? new Date(quiz.endsAt) : null;
  if (startsAt && !Number.isNaN(startsAt.getTime()) && now < startsAt) {
    return false;
  }
  if (endsAt && !Number.isNaN(endsAt.getTime()) && now > endsAt) {
    return false;
  }
  return true;
}

function normalizeQuestionType(value) {
  const type = sanitizeText(value, 20).toLowerCase();
  return ['number', 'text', 'radio', 'checkbox', 'description', 'coding'].includes(type) ? type : 'radio';
}

function validateQuizPayload(body) {
  const title = sanitizeText(body && body.title, 200);
  const question = sanitizeText(body && body.question, 500);
  const questionType = normalizeQuestionType(body && body.questionType);
  const examGroupId = sanitizeText(body && body.examGroupId, 80);
  const examQuestionOrder = Number.parseInt(String(body && body.examQuestionOrder), 10);
  const optionsRaw = Array.isArray(body && body.options) ? body.options : [];
  const options = optionsRaw.map((item) => sanitizeText(item, 240)).filter(Boolean);
  const classId = sanitizeText(body && body.classId, 40) || 'all';
  const requiresCorrectAnswer = Boolean(body && body.requiresCorrectAnswer);
  const correctIndex = Number(body && body.correctIndex);
  const { startsAt, endsAt } = resolveQuizSchedule(body);
  const optionBased = questionType === 'radio' || questionType === 'checkbox';

  if (!question) {
    throw createError(400, 'Question is required.', 'question_required');
  }
  if (optionBased) {
    if (options.length < 2 || options.length > 6) {
      throw createError(400, 'Options must contain between 2 and 6 items.', 'invalid_options');
    }
    if (requiresCorrectAnswer && (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length)) {
      throw createError(400, 'Select a valid correct option.', 'invalid_correct_index');
    }
  } else if (options.length) {
    throw createError(400, 'This question type does not use options.', 'options_not_supported');
  }
  if (!optionBased && requiresCorrectAnswer) {
    throw createError(400, 'Correct-answer selection is only supported for option-based questions.', 'invalid_correct_answer_mode');
  }
  if (classId !== 'all') {
    ensureValidObjectId(classId, 'classId');
  }

  return {
    title,
    question,
    questionType,
    examGroupId,
    examQuestionOrder: Number.isFinite(examQuestionOrder) ? Math.max(0, examQuestionOrder) : 0,
    options,
    optionCount: optionBased ? options.length : 0,
    requiresCorrectAnswer,
    correctIndex: requiresCorrectAnswer ? correctIndex : -1,
    startsAt,
    endsAt,
    classId
  };
}

function buildPublicClass(doc) {
  const item = toPlain(doc);
  item.teacherId = item.teacherId || item.teacherUid;
  item.teacherName = item.teacherName || item.teacherId;
  item.scheduledSessions = (Array.isArray(item.upcomingSessions) ? item.upcomingSessions : [])
    .map(parseScheduledClassSession)
    .filter(Boolean);
  return item;
}

function buildPublicQuiz(doc, includeAnswers) {
  const item = toPlain(doc);
  item.title = item.title || sanitizeText(item.question, 120) || 'Untitled exam';
  item.teacherId = item.teacherId || item.teacherUid;
  item.teacherName = item.teacherName || item.teacherId;
  item.questionType = sanitizeText(item.questionType || 'radio', 20).toLowerCase() || 'radio';
  item.examGroupId = sanitizeText(item.examGroupId || '', 80);
  item.examQuestionOrder = Number.isFinite(Number(item.examQuestionOrder)) ? Number(item.examQuestionOrder) : 0;
  item.optionCount = Number.isFinite(Number(item.optionCount)) ? Number(item.optionCount) : (Array.isArray(item.options) ? item.options.length : 0);
  item.requiresCorrectAnswer = Boolean(item.requiresCorrectAnswer);
  item.durationMinutes = computeQuizDurationMinutes(
    item.startsAt ? new Date(item.startsAt) : null,
    item.endsAt ? new Date(item.endsAt) : null
  );
  if (!includeAnswers) {
    delete item.correctIndex;
  }
  return item;
}

function buildPublicAssignment(doc) {
  const item = toPlain(doc);
  item.teacherId = item.teacherId || item.teacherUid;
  item.teacherName = item.teacherName || item.teacherId;
  return item;
}

async function resolveTeacherIdentity(item) {
  const teacherUid = sanitizeText(item && item.teacherUid, 200);
  const teacherId = sanitizeText(item && item.teacherId, 200);

  if (teacherUid) {
    return { teacherUid, teacherId: teacherId || teacherUid };
  }

  if (!teacherId) {
    return { teacherUid: '', teacherId: '' };
  }

  const teacher = await User.findOne({
    $or: [{ firebaseUid: teacherId }, { email: normalizeEmail(teacherId) }]
  });

  if (!teacher) {
    return { teacherUid: '', teacherId };
  }

  return {
    teacherUid: teacher.firebaseUid || '',
    teacherId: teacher.email || teacher.firebaseUid || teacherId
  };
}

async function callOllama(prompt, generationOptions = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ollamaTimeoutMs);
  try {
    const requestBody = {
      model: config.ollamaModel,
      prompt,
      stream: false,
      keep_alive: '10m',
      options: {
        temperature: 0.4,
        num_predict: 220,
        ...generationOptions
      }
    };

    // Qwen 3 supports disabling the thinking trace, which helps reduce latency
    // and avoids the app waiting on a long reasoning stream when we only need
    // the final mentor answer.
    if (String(config.ollamaModel || '').toLowerCase().startsWith('qwen3')) {
      requestBody.think = false;
    }

    const response = await fetch(new URL('/api/generate', config.ollamaBaseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text();
      throw createError(502, `Ollama error ${response.status}: ${text}`, 'ollama_error');
    }
    const data = await response.json();
    return extractMentorAnswer(data.response || '');
  } catch (error) {
    if (error.name === 'AbortError') {
      throw createError(
        504,
        'The AI request timed out. Increase OLLAMA_TIMEOUT_MS or use a faster Ollama model.',
        'ollama_timeout'
      );
    }
    if (error && (error.code === 'UND_ERR_SOCKET' || (error.cause && error.cause.code === 'UND_ERR_SOCKET'))) {
      throw createError(
        502,
        'Ollama closed the connection while generating the answer. Try again, keep the Ollama app open, or switch to a lighter model.',
        'ollama_connection_closed'
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractMentorAnswer(rawText) {
  const text = sanitizeText(rawText || '', 12000);
  if (!text) {
    return '';
  }

  const taggedMatch = text.match(/<answer>([\s\S]*?)<\/answer>/i);
  let answer = taggedMatch ? taggedMatch[1] : text;

  const labeledQuoteMatch = answer.match(
    /(?:example(?:\s+response)?(?:\s+in\s+hinglish)?|final(?:\s+student-facing)?\s+reply|reply|answer)\s*:\s*"([^"]+)"/i
  );
  if (!taggedMatch && labeledQuoteMatch) {
    answer = labeledQuoteMatch[1];
  } else if (!taggedMatch) {
    const quotedCandidates = Array.from(answer.matchAll(/"([^"]{8,240})"/g))
      .map((match) => match[1].trim())
      .filter((candidate) => {
        return !/^(student asked|steps?|keep the answer|just the reply|answer|reply|we are|we need|we should|we can|we will)/i.test(
          candidate
        );
      })
      .filter((candidate) => /[a-z]/i.test(candidate));

    if (quotedCandidates.length) {
      answer = quotedCandidates[quotedCandidates.length - 1];
    }
  }

  answer = answer.replace(/<\/?answer>/gi, '').trim();

  if (answer.includes('```')) {
    const codeBlockMatch = answer.match(/```[\s\S]*?```/);
    if (codeBlockMatch) {
      const prefixLines = answer
        .slice(0, codeBlockMatch.index)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => {
          return !/^(student asked:|steps?:|we are|we need to|we should|we can|we will|since the student|important:|but note:|also,|lets craft|let's craft|final answer:|answer:|example response)/i.test(
            line
          );
        });

      answer = `${prefixLines.length ? `${prefixLines[prefixLines.length - 1]}\n\n` : ''}${codeBlockMatch[0]}`;
    }
  } else {
    answer = answer
      .split(/(?<=[.!?])\s+|\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        return !/^(student asked:|steps?:|we are|we need to|we should|we can|we will|since the student|important:|but note:|also,|lets craft|let's craft|final answer:|answer:|example response)/i.test(
          line
        );
      })
      .join(' ');
  }

  answer = answer
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return sanitizeText(answer, 12000);
}

function isGreetingPrompt(question) {
  const normalized = String(question || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, '');

  return [
    'hi',
    'hii',
    'hlo',
    'hello',
    'hey',
    'good morning',
    'good afternoon',
    'good evening'
  ].includes(normalized);
}

function isCodePrompt(question) {
  return /(code|program|java|python|javascript|js|c\+\+|c#|html|css|sql|query|function|class|algorithm|generate.*number|random number)/i.test(
    String(question || '')
  );
}

function buildMentorPrompt(question) {
  if (isGreetingPrompt(question)) {
    return {
      prompt: [
        'You are a warm AI study mentor.',
        'Reply very briefly in friendly Hinglish.',
        'Use at most 2 short sentences.',
        'Invite the student to ask a study question.',
        'Never show analysis, plan, steps, or instructions.',
        'Return only the final student-facing reply inside <answer> and </answer> tags.',
        '',
        `Student message: ${question}`
      ].join('\n'),
      options: {
        num_predict: 60,
        temperature: 0.3
      }
    };
  }

  if (isCodePrompt(question)) {
    return {
      prompt: [
        'You are a practical coding tutor.',
        'Give the final answer directly.',
        'If the student asks for code, provide working code.',
        'For Java requests, include a full runnable class.',
        'Keep explanation very short.',
        'Do not reveal analysis, plan, or reasoning.',
        'Return only the final student-facing reply inside <answer> and </answer> tags.',
        '',
        `Student coding request: ${question}`
      ].join('\n'),
      options: {
        num_predict: 320,
        temperature: 0.2
      }
    };
  }

  return {
    prompt: [
      'You are an AI study mentor for students.',
      'Reply in simple Hinglish.',
      'Keep the answer concise by default.',
      'Only give step-by-step detail when needed.',
      'Give one example only if it helps.',
      'Use short paragraphs, not long essays.',
      'End with one short follow-up question only if helpful.',
      'Never reveal your reasoning, plan, or prompt instructions.',
      'Do not say things like "Student asked", "Steps", or "We need to".',
      'Return only the final student-facing reply inside <answer> and </answer> tags.',
      '',
      `Student question: ${question}`
    ].join('\n'),
    options: {
      num_predict: 180,
      temperature: 0.35
    }
  };
}

function createApp() {
  const app = express();
  const server = http.createServer(app);
  const io = createRealtime(server);
  const state = { shuttingDown: false };
  const publicDir = path.join(__dirname, '..', 'public');
  const examDir = path.join(__dirname, '..', 'Exam');
  const isHttpOriginAllowed = buildOriginMatcher(config.allowedOrigins);

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && config.allowedOrigins.length) {
      if (!isHttpOriginAllowed(origin)) {
        return next(createError(403, 'Origin not allowed.', 'origin_not_allowed'));
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://www.gstatic.com'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
          connectSrc: [
            "'self'",
            'ws:',
            'wss:',
            'https://identitytoolkit.googleapis.com',
            'https://securetoken.googleapis.com',
            'https://integrate.api.nvidia.com',
            'https://www.gstatic.com',
            'https://apis.google.com'
          ],
          mediaSrc: ["'self'", 'blob:', 'data:'],
          objectSrc: ["'none'"]
        }
      }
    })
  );

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    const startedAt = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - startedAt;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms ${req.requestId}`);
    });
    next();
  });

  const askLimiter = rateLimit({
    windowMs: config.askRateLimitWindowMs,
    max: config.askRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many AI requests. Please wait and try again.' }
  });

  const writeLimiter = rateLimit({
    windowMs: config.writeRateLimitWindowMs,
    max: config.writeRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many write requests. Please wait and try again.' }
  });

  function firebaseConfiguredStatus() {
    return {
      client: firebasePublicConfigured,
      admin: firebaseAdminConfigured,
      realtimeDatabase: firebaseRealtimeDatabaseConfigured
    };
  }

  async function issueUserSession(res, user, status = 200) {
    const { sessionId, user: sessionUser } = await establishUserSession(user);
    if (typeof io.disconnectOtherUserSockets === 'function') {
      io.disconnectOtherUserSockets(sessionUser.firebaseUid, sessionId);
    }
    res.status(status).json({
      user: toSessionUser(sessionUser),
      sessionId,
      firebaseConfigured: firebaseConfiguredStatus()
    });
  }

  app.use(
    express.static(publicDir, {
      index: false,
      maxAge: config.staticCacheMaxAgeSeconds * 1000,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-store');
        }
      }
    })
  );

  app.use(
    '/exam',
    express.static(examDir, {
      index: false,
      maxAge: config.staticCacheMaxAgeSeconds * 1000,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-store');
        }
      }
    })
  );

  app.get('/config/firebase', (req, res) => {
    res.json({
      enabled: firebasePublicConfigured,
      config: firebasePublicConfigured ? config.firebase.publicConfig : null,
      emulatorHost: config.firebase.emulatorHost || '',
      canSelfRegisterTeacher: Boolean(config.firebase.teacherEmails.length || config.firebase.teacherUids.length)
    });
  });

  app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  app.get('/first-admin', (req, res) => res.sendFile(path.join(publicDir, 'first-admin.html')));
  app.get(['/student', '/student/'], (req, res) =>
    res.sendFile(path.join(publicDir, 'student', 'index.html'))
  );
  app.get(['/teacher', '/teacher/'], (req, res) =>
    res.sendFile(path.join(publicDir, 'teacher', 'index.html'))
  );
  app.get(['/admin', '/admin/'], (req, res) =>
    res.sendFile(path.join(publicDir, 'admin', 'index.html'))
  );
  app.get(['/exam', '/exam/'], (req, res) => res.sendFile(path.join(examDir, 'index.html')));
  app.get('/exam/:quizId', (req, res) => res.sendFile(path.join(examDir, 'index.html')));

  app.get('/auth/bootstrap-status', async (req, res) => {
    const adminExists = await User.exists({ role: 'admin' });
    res.json({ firstAdminRegistrationOpen: !adminExists });
  });

  app.post('/auth/precheck', (req, res) => {
    const requestedRole = sanitizeText(req.body && req.body.requestedRole, 20).toLowerCase();
    const email = normalizeEmail(req.body && req.body.email);
    if (!email) {
      throw createError(400, 'Email is required.', 'email_required');
    }

    const result = canSelfRegisterRole(requestedRole, email);
    if (!result.allowed) {
      throw createError(403, result.message, 'role_not_allowed');
    }

    res.json({
      allowed: true,
      requestedRole,
      email
    });
  });

  app.post('/auth/first-admin/precheck', async (req, res) => {
    const email = normalizeEmail(req.body && req.body.email);
    if (!email) {
      throw createError(400, 'Email is required.', 'email_required');
    }

    const adminExists = await User.exists({ role: 'admin' });
    if (adminExists) {
      throw createError(403, 'The first admin account has already been created.', 'bootstrap_closed');
    }

    res.json({
      allowed: true,
      email,
      role: 'admin'
    });
  });

  app.post('/auth/session', verifyFirebaseRequest, async (req, res) => {
    const requestedRole = sanitizeText(req.body && req.body.requestedRole, 20).toLowerCase();
    if (!['teacher', 'student', 'admin'].includes(requestedRole)) {
      throw createError(400, 'requestedRole must be teacher, student, or admin.', 'invalid_role');
    }
    const user = await syncUserFromToken(req.firebaseToken, requestedRole);
    await issueUserSession(res, user);
  });

  app.post('/auth/session/open', verifyFirebaseRequest, async (req, res) => {
    const user = await syncUserFromToken(req.firebaseToken);
    await issueUserSession(res, user);
  });

  app.post('/auth/first-admin/session', verifyFirebaseRequest, async (req, res) => {
    const adminExists = await User.exists({ role: 'admin' });
    if (adminExists) {
      throw createError(403, 'The first admin account has already been created.', 'bootstrap_closed');
    }

    const user = await syncUserFromToken(req.firebaseToken, 'admin', {
      allowFirstAdminBootstrap: true
    });

    await issueUserSession(res, user);
  });

  app.post('/auth/logout', authenticateRequest, async (req, res) => {
    await clearUserSession(req.user.uid);
    if (typeof io.disconnectAllUserSockets === 'function') {
      io.disconnectAllUserSockets(req.user.uid);
    }
    res.json({ ok: true });
  });

  app.get('/me', authenticateRequest, async (req, res) => res.json({ user: req.user }));

  app.get('/classes', authenticateRequest, async (req, res) => {
    const query = requestBelongsToRole(req, 'teacher')
      ? { $or: [{ teacherUid: req.user.uid }, { teacherId: req.user.email || req.user.uid }] }
      : {};
    const classes = await ClassModel.find(query).sort({ createdAt: -1 });
    res.json({ classes: classes.map((item) => buildPublicClass(item)) });
  });

  app.post('/class', authenticateRequest, requireRole('teacher', 'admin'), writeLimiter, async (req, res) => {
    const subject = sanitizeText(req.body && req.body.subject, 140);
    if (!subject) {
      throw createError(400, 'Subject is required.', 'subject_required');
    }
    const description = sanitizeText(req.body && req.body.description, 400);
    const nextSession = sanitizeText(req.body && req.body.nextSession, 120);
    const scheduleNotes = sanitizeText(req.body && req.body.scheduleNotes, 240);
    const upcomingRaw = req.body && req.body.upcomingSessions ? req.body.upcomingSessions : [];
    const upcomingSessions = Array.isArray(upcomingRaw)
      ? upcomingRaw.map((item) => sanitizeText(item, 1000)).filter(Boolean)
      : String(upcomingRaw || '').split(',').map((item) => sanitizeText(item, 1000)).filter(Boolean);
    const newClass = await ClassModel.create({
      subject,
      description,
      mode: 'ai',
      nextSession,
      scheduleNotes,
      upcomingSessions,
      teacherUid: req.user.uid,
      teacherId: req.user.email || req.user.uid,
      teacherName: req.user.displayName
    });
    res.status(201).json({ class: buildPublicClass(newClass) });
  });

  app.post('/class-mode', authenticateRequest, requireRole('teacher', 'admin'), writeLimiter, async (req, res) => {
    const classId = sanitizeText(req.body && req.body.classId, 40);
    const mode = sanitizeText(req.body && req.body.mode, 20).toLowerCase();
    ensureValidObjectId(classId, 'classId');
    if (!['ai', 'human'].includes(mode)) {
      throw createError(400, 'mode must be ai or human.', 'invalid_mode');
    }
    const targetClass = await ClassModel.findById(classId);
    if (!targetClass) {
      throw createError(404, 'Class not found.', 'class_not_found');
    }
    if (requestBelongsToRole(req, 'teacher') && targetClass.teacherUid && targetClass.teacherUid !== req.user.uid) {
      throw createError(403, 'You cannot update this class.', 'forbidden');
    }
    targetClass.mode = mode;
    await targetClass.save();
    res.json({ class: buildPublicClass(targetClass) });
  });

  app.patch('/class/:classId/schedule', authenticateRequest, requireRole('teacher', 'admin'), writeLimiter, async (req, res) => {
    const classId = sanitizeText(req.params && req.params.classId, 40);
    const mode = sanitizeText(req.body && req.body.mode, 20).toLowerCase();
    const nextSession = sanitizeText(req.body && req.body.nextSession, 160);
    const scheduleNotes = sanitizeText(req.body && req.body.scheduleNotes, 400);
    const upcomingRaw = Array.isArray(req.body && req.body.upcomingSessions) ? req.body.upcomingSessions : [];
    const upcomingSessions = upcomingRaw.map((item) => sanitizeText(item, 1000)).filter(Boolean).slice(0, 100);

    ensureValidObjectId(classId, 'classId');
    if (!['ai', 'human'].includes(mode)) {
      throw createError(400, 'mode must be ai or human.', 'invalid_mode');
    }

    const targetClass = await ClassModel.findById(classId);
    if (!targetClass) {
      throw createError(404, 'Class not found.', 'class_not_found');
    }
    if (requestBelongsToRole(req, 'teacher') && targetClass.teacherUid && targetClass.teacherUid !== req.user.uid) {
      throw createError(403, 'You cannot update this class schedule.', 'forbidden');
    }

    targetClass.mode = mode;
    targetClass.nextSession = nextSession;
    targetClass.scheduleNotes = scheduleNotes;
    targetClass.upcomingSessions = upcomingSessions;
    await targetClass.save();

    res.json({ class: buildPublicClass(targetClass) });
  });

  app.get('/quizzes', authenticateRequest, async (req, res) => {
    const classId = sanitizeText(req.query.classId, 40);
    const quizId = sanitizeText(req.query.quizId, 40);
    const baseQuery = requestBelongsToRole(req, 'teacher')
      ? { $or: [{ teacherUid: req.user.uid }, { teacherId: req.user.email || req.user.uid }] }
      : {};
    const query = { ...baseQuery };
    if (quizId) {
      ensureValidObjectId(quizId, 'quizId');
      const anchorQuiz = await Quiz.findOne({ ...baseQuery, _id: quizId });
      if (!anchorQuiz) {
        throw createError(404, 'Quiz not found.', 'quiz_not_found');
      }
      if (anchorQuiz.examGroupId) {
        query.examGroupId = anchorQuiz.examGroupId;
      } else {
        query._id = quizId;
      }
    }
    if (classId) {
      query.classId = { $in: [classId, 'all'] };
    }
    const quizzes = await Quiz.find(query).sort({ examQuestionOrder: 1, createdAt: 1 });
    res.json({ quizzes: quizzes.map((quiz) => buildPublicQuiz(quiz, requestBelongsToRole(req, 'teacher', 'admin'))) });
  });

  app.post('/quiz', authenticateRequest, requireRole('teacher', 'admin'), writeLimiter, async (req, res) => {
    const quizPayload = validateQuizPayload(req.body);
    const quiz = await Quiz.create({
      title: quizPayload.title || sanitizeText(quizPayload.question, 120),
      question: quizPayload.question,
      questionType: quizPayload.questionType,
      examGroupId: quizPayload.examGroupId,
      examQuestionOrder: quizPayload.examQuestionOrder,
      options: quizPayload.options,
      optionCount: quizPayload.optionCount,
      requiresCorrectAnswer: quizPayload.requiresCorrectAnswer,
      correctIndex: quizPayload.correctIndex,
      startsAt: quizPayload.startsAt,
      endsAt: quizPayload.endsAt,
      classId: quizPayload.classId,
      teacherUid: req.user.uid,
      teacherId: req.user.email || req.user.uid,
      teacherName: req.user.displayName
    });
    res.status(201).json({ quiz: buildPublicQuiz(quiz, true) });
  });

  app.patch('/quiz/:quizId', authenticateRequest, requireRole('teacher', 'admin'), writeLimiter, async (req, res) => {
    const quizId = sanitizeText(req.params && req.params.quizId, 40);
    const quizPayload = validateQuizPayload(req.body);

    ensureValidObjectId(quizId, 'quizId');

    const quiz = await Quiz.findById(quizId);
    if (!quiz) throw createError(404, 'Quiz not found.', 'quiz_not_found');
    if (requestBelongsToRole(req, 'teacher') && quiz.teacherUid && quiz.teacherUid !== req.user.uid) {
      throw createError(403, 'You cannot update this quiz.', 'forbidden');
    }

    quiz.title = quizPayload.title || sanitizeText(quizPayload.question, 120);
    quiz.question = quizPayload.question;
    quiz.questionType = quizPayload.questionType;
    quiz.examGroupId = quizPayload.examGroupId;
    quiz.examQuestionOrder = quizPayload.examQuestionOrder;
    quiz.options = quizPayload.options;
    quiz.optionCount = quizPayload.optionCount;
    quiz.requiresCorrectAnswer = quizPayload.requiresCorrectAnswer;
    quiz.correctIndex = quizPayload.correctIndex;
    quiz.startsAt = quizPayload.startsAt;
    quiz.endsAt = quizPayload.endsAt;
    quiz.classId = quizPayload.classId;
    await quiz.save();

    res.json({ quiz: buildPublicQuiz(quiz, true) });
  });

  app.delete('/quiz/:quizId', authenticateRequest, requireRole('teacher', 'admin'), writeLimiter, async (req, res) => {
    const quizId = sanitizeText(req.params && req.params.quizId, 40);
    ensureValidObjectId(quizId, 'quizId');

    const quiz = await Quiz.findById(quizId);
    if (!quiz) throw createError(404, 'Quiz not found.', 'quiz_not_found');
    if (requestBelongsToRole(req, 'teacher') && quiz.teacherUid && quiz.teacherUid !== req.user.uid) {
      throw createError(403, 'You cannot delete this quiz.', 'forbidden');
    }

    if (quiz.examGroupId) {
      await Quiz.deleteMany({ examGroupId: quiz.examGroupId });
    } else {
      await Quiz.deleteOne({ _id: quizId });
    }
    res.json({ ok: true });
  });

  app.post('/quiz/:quizId/republish', authenticateRequest, requireRole('teacher', 'admin'), writeLimiter, async (req, res) => {
    const quizId = sanitizeText(req.params && req.params.quizId, 40);
    ensureValidObjectId(quizId, 'quizId');

    const quiz = await Quiz.findById(quizId);
    if (!quiz) throw createError(404, 'Quiz not found.', 'quiz_not_found');
    if (requestBelongsToRole(req, 'teacher') && quiz.teacherUid && quiz.teacherUid !== req.user.uid) {
      throw createError(403, 'You cannot republish this quiz.', 'forbidden');
    }

    const sourceQuizzes = quiz.examGroupId
      ? await Quiz.find({ examGroupId: quiz.examGroupId }).sort({ examQuestionOrder: 1, createdAt: 1 })
      : [quiz];
    const republishedGroupId = new mongoose.Types.ObjectId().toString();
    const publishedQuizzes = await Quiz.insertMany(sourceQuizzes.map((item, index) => ({
      title: item.title || sanitizeText(item.question, 120),
      question: item.question,
      questionType: item.questionType || 'radio',
      examGroupId: republishedGroupId,
      examQuestionOrder: Number(item.examQuestionOrder || index),
      options: Array.isArray(item.options) ? [...item.options] : [],
      optionCount: Number(item.optionCount || 0),
      requiresCorrectAnswer: Boolean(item.requiresCorrectAnswer),
      correctIndex: item.correctIndex,
      startsAt: item.startsAt || null,
      endsAt: item.endsAt || null,
      classId: item.classId || 'all',
      teacherUid: req.user.uid,
      teacherId: req.user.email || req.user.uid,
      teacherName: req.user.displayName
    })));

    res.status(201).json({ quiz: buildPublicQuiz(publishedQuizzes[0], true) });
  });

  app.post('/submit-quiz', authenticateRequest, requireRole('student', 'teacher', 'admin'), writeLimiter, async (req, res) => {
    const answers = Array.isArray(req.body && req.body.answers)
      ? req.body.answers
      : req.body && req.body.quizId
        ? [{ quizId: req.body.quizId, answerIndex: req.body.answerIndex }]
        : [];
    if (!answers.length) throw createError(400, 'answers are required.', 'answers_required');
    const normalizedAnswers = answers.map((answer) => ({
      quizId: sanitizeText(answer && answer.quizId, 40),
      answerIndex: Number.isFinite(Number(answer && answer.answerIndex)) ? Number(answer.answerIndex) : -1,
      answerText: sanitizeText(answer && answer.answerText, 4000),
      answerValues: Array.isArray(answer && answer.answerValues)
        ? answer.answerValues.map((value) => sanitizeText(value, 240)).filter(Boolean)
        : []
    }));
    normalizedAnswers.forEach((answer) => ensureValidObjectId(answer.quizId, 'quizId'));
    const quizIds = normalizedAnswers.map((answer) => answer.quizId);
    const quizzes = await Quiz.find({ _id: { $in: quizIds } });
    const quizMap = new Map(quizzes.map((quiz) => [quiz._id.toString(), quiz]));
    if (quizMap.size !== quizIds.length) throw createError(400, 'One or more quizzes were not found.', 'quiz_not_found');
    const unavailableQuiz = quizzes.find((quiz) => !isQuizAvailableNow(quiz));
    if (unavailableQuiz) {
      throw createError(403, 'This exam is not available at the current time.', 'quiz_not_available');
    }
    const firstQuiz = quizzes[0];
    const results = normalizedAnswers.map((answer) => {
      const quiz = quizMap.get(answer.quizId);
      const questionType = normalizeQuestionType(quiz.questionType);
      const selectedValues = Array.isArray(answer.answerValues) ? answer.answerValues : [];
      const correct =
        Boolean(quiz.requiresCorrectAnswer) &&
        (questionType === 'checkbox'
          ? selectedValues.length === 1 && String(selectedValues[0]) === String(quiz.correctIndex)
          : questionType === 'radio'
            ? answer.answerIndex === quiz.correctIndex
            : false);
      return {
        quizId: quiz._id.toString(),
        questionType,
        selectedIndex: answer.answerIndex,
        selectedText: answer.answerText,
        selectedValues,
        correctIndex: quiz.correctIndex,
        correct,
        question: quiz.question,
        options: quiz.options
      };
    });
    const gradableResults = results.filter((item) => item.questionType === 'radio' || item.questionType === 'checkbox')
      .filter((item) => {
        const quiz = quizMap.get(item.quizId);
        return Boolean(quiz && quiz.requiresCorrectAnswer);
      });
    const score = gradableResults.filter((item) => item.correct).length;
    const submissionTeacher = await resolveTeacherIdentity(firstQuiz);
    if (!submissionTeacher.teacherUid) {
      throw createError(
        500,
        'This quiz is missing teacher ownership data. Update the quiz record and try again.',
        'quiz_teacher_missing'
      );
    }

    if (!firstQuiz.teacherUid || !firstQuiz.teacherId) {
      firstQuiz.teacherUid = submissionTeacher.teacherUid;
      firstQuiz.teacherId = firstQuiz.teacherId || submissionTeacher.teacherId;
      await firstQuiz.save();
    }

    await QuizSubmission.create({
      studentUid: req.user.uid,
      studentName: req.user.displayName,
      studentEmail: req.user.email,
      teacherUid: submissionTeacher.teacherUid,
      teacherId: submissionTeacher.teacherId,
      classId: firstQuiz.classId || 'all',
      answers: normalizedAnswers,
      score,
      total: gradableResults.length
    });
    await ExamProgress.deleteMany({ studentUid: req.user.uid, quizId: { $in: quizIds } });
    res.json({ score, total: gradableResults.length, results });
  });

  app.get('/exam-progress', authenticateRequest, requireRole('student', 'teacher', 'admin'), async (req, res) => {
    const quizId = sanitizeText(req.query.quizId, 40);
    if (!quizId) throw createError(400, 'quizId is required.', 'quiz_id_required');
    ensureValidObjectId(quizId, 'quizId');

    const progress = await ExamProgress.findOne({ quizId, studentUid: req.user.uid });
    res.json({ progress: progress ? toPlain(progress) : null });
  });

  app.post('/exam-progress', authenticateRequest, requireRole('student', 'teacher', 'admin'), async (req, res) => {
    const quizId = sanitizeText(req.body && req.body.quizId, 40);
    const classId = sanitizeText(req.body && req.body.classId, 40);
    const remainingSeconds = Number.parseInt(String(req.body && req.body.remainingSeconds), 10);

    if (!quizId) throw createError(400, 'quizId is required.', 'quiz_id_required');
    ensureValidObjectId(quizId, 'quizId');
    if (classId) ensureValidObjectId(classId, 'classId');
    if (!Number.isFinite(remainingSeconds) || remainingSeconds < 0) {
      throw createError(400, 'remainingSeconds must be a non-negative integer.', 'invalid_remaining_seconds');
    }

    const progress = await ExamProgress.findOneAndUpdate(
      { quizId, studentUid: req.user.uid },
      {
        $set: {
          classId,
          studentName: req.user.displayName,
          studentEmail: req.user.email,
          remainingSeconds,
          touchedAt: new Date()
        },
        $setOnInsert: {
          quizId,
          studentUid: req.user.uid
        }
      },
      { new: true, upsert: true }
    );

    res.json({ progress: toPlain(progress) });
  });

  app.get('/assignments', authenticateRequest, async (req, res) => {
    const classId = sanitizeText(req.query.classId, 40);
    const query = requestBelongsToRole(req, 'teacher')
      ? { $or: [{ teacherUid: req.user.uid }, { teacherId: req.user.email || req.user.uid }] }
      : {};
    if (classId) query.classId = { $in: [classId, 'all'] };
    const assignments = await Assignment.find(query).sort({ createdAt: -1 });
    res.json({ assignments: assignments.map((item) => buildPublicAssignment(item)) });
  });

  app.post('/assignment', authenticateRequest, requireRole('teacher', 'admin'), writeLimiter, async (req, res) => {
    const title = sanitizeText(req.body && req.body.title, 200);
    const description = sanitizeText(req.body && req.body.description, 1000);
    const classId = sanitizeText(req.body && req.body.classId, 40) || 'all';
    if (!title) throw createError(400, 'Title is required.', 'title_required');
    if (classId !== 'all') ensureValidObjectId(classId, 'classId');
    const assignment = await Assignment.create({
      title,
      description,
      classId,
      teacherUid: req.user.uid,
      teacherId: req.user.email || req.user.uid,
      teacherName: req.user.displayName
    });
    res.status(201).json({ assignment: buildPublicAssignment(assignment) });
  });

  app.post('/submit-assignment', authenticateRequest, requireRole('student', 'teacher', 'admin'), writeLimiter, async (req, res) => {
    const assignmentId = sanitizeText(req.body && req.body.assignmentId, 40);
    const answer = sanitizeText(req.body && req.body.answer, 5000);
    if (!assignmentId || !answer) throw createError(400, 'assignmentId and answer are required.', 'assignment_required');
    ensureValidObjectId(assignmentId, 'assignmentId');
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw createError(404, 'Assignment not found.', 'assignment_not_found');
    const submission = await AssignmentSubmission.create({
      assignmentId,
      studentUid: req.user.uid,
      studentName: req.user.displayName,
      studentEmail: req.user.email,
      teacherUid: assignment.teacherUid || '',
      teacherId: assignment.teacherId || '',
      classId: assignment.classId || 'all',
      answer
    });
    res.status(201).json({ submission: { id: submission._id.toString(), assignmentId, studentName: req.user.displayName, answer, submittedAt: submission.submittedAt } });
  });

  app.get('/quiz-submissions', authenticateRequest, async (req, res) => {
    const query = requestBelongsToRole(req, 'teacher')
      ? { $or: [{ teacherUid: req.user.uid }, { teacherId: req.user.email || req.user.uid }] }
      : requestBelongsToRole(req, 'student')
        ? { studentUid: req.user.uid }
        : {};
    const start = parseDate(req.query.start);
    const classId = sanitizeText(req.query.classId, 40);
    if (start) query.submittedAt = { $gte: start };
    if (classId) query.classId = classId;
    const submissions = await QuizSubmission.find(query).sort({ submittedAt: -1 }).limit(parseLimit(req.query.limit));
    res.json({ submissions: mapList(submissions) });
  });

  app.get('/assignment-submissions', authenticateRequest, async (req, res) => {
    const query = requestBelongsToRole(req, 'teacher')
      ? { $or: [{ teacherUid: req.user.uid }, { teacherId: req.user.email || req.user.uid }] }
      : requestBelongsToRole(req, 'student')
        ? { studentUid: req.user.uid }
        : {};
    const start = parseDate(req.query.start);
    const classId = sanitizeText(req.query.classId, 40);
    if (start) query.submittedAt = { $gte: start };
    if (classId) query.classId = classId;
    const submissions = await AssignmentSubmission.find(query).sort({ submittedAt: -1 }).limit(parseLimit(req.query.limit));
    res.json({ submissions: mapList(submissions) });
  });

  app.get('/teachers', authenticateRequest, requireRole('admin'), async (req, res) => {
    const teachers = await User.find({ role: { $in: ['teacher', 'admin'] } }).sort({ lastSeen: -1 });
    res.json({ teachers: teachers.map((user) => ({ id: getIdentityLabel(user), name: user.displayName, email: user.email, firebaseUid: user.firebaseUid, firstSeen: user.firstSeen, lastSeen: user.lastSeen, role: user.role })) });
  });

  app.get('/students', authenticateRequest, requireRole('admin'), async (req, res) => {
    const students = await User.find({ role: 'student' }).sort({ lastSeen: -1 });
    res.json({ students: students.map((user) => ({ id: getIdentityLabel(user), name: user.displayName, email: user.email, firebaseUid: user.firebaseUid, firstSeen: user.firstSeen, lastSeen: user.lastSeen, role: user.role })) });
  });

  app.post('/admin/staff-account', authenticateRequest, requireRole('admin'), writeLimiter, async (req, res) => {
    if (!firebaseAdminConfigured) {
      throw createError(503, 'Firebase Admin is not configured.', 'firebase_not_configured');
    }

    const email = normalizeEmail(req.body && req.body.email);
    const displayName = sanitizeText(req.body && req.body.displayName, 120);
    const password = String(req.body && req.body.password || '').trim();
    const role = sanitizeText(req.body && req.body.role, 20).toLowerCase();

    if (!email) {
      throw createError(400, 'Email is required.', 'email_required');
    }
    if (!displayName) {
      throw createError(400, 'Display name is required.', 'display_name_required');
    }
    if (!['teacher', 'admin'].includes(role)) {
      throw createError(400, 'role must be teacher or admin.', 'invalid_role');
    }
    if (password.length < 6) {
      throw createError(400, 'Password must be at least 6 characters.', 'invalid_password');
    }

    let authUser = null;
    let created = false;

    try {
      const existingAuthUser = await admin.auth().getUserByEmail(email);
      authUser = await admin.auth().updateUser(existingAuthUser.uid, {
        email,
        displayName,
        password
      });
    } catch (error) {
      if (error && error.code === 'auth/user-not-found') {
        authUser = await admin.auth().createUser({
          email,
          displayName,
          password
        });
        created = true;
      } else {
        throw error;
      }
    }

    const existingUser = await User.findOne({ firebaseUid: authUser.uid });
    const previousRole = existingUser && existingUser.role;
    const now = new Date();

    const appUser = await User.findOneAndUpdate(
      { firebaseUid: authUser.uid },
      {
        $set: {
          email,
          displayName,
          photoURL: '',
          role,
          lastSeen: now
        },
        $setOnInsert: {
          firebaseUid: authUser.uid,
          firstSeen: now
        }
      },
      { new: true, upsert: true }
    );

    await syncUserToRealtimeDatabase(appUser, previousRole);

    res.status(created ? 201 : 200).json({
      created,
      user: toSessionUser(appUser)
    });
  });

  app.post('/ask', authenticateRequest, askLimiter, async (req, res, next) => {
    try {
      const question = sanitizeText(req.body && req.body.question, 800);
      if (!question) throw createError(400, 'Question is required.', 'question_required');
      if (!config.nvidiaApiKey) throw createError(503, 'NVIDIA API key is not configured. Set NVIDIA_API_KEY in .env', 'nvidia_not_configured');

      // Get conversation history for context (if provided)
      const conversationHistory = Array.isArray(req.body && req.body.conversationHistory) 
        ? req.body.conversationHistory 
        : [];

      const systemPrompt = `You are an AI study mentor for students.
Reply in simple Hinglish or English as appropriate.
Keep answers concise but clear.
Only give step-by-step detail when needed.
Give one example only if it helps.
Use short paragraphs, not long essays.
End with one short follow-up question only if helpful.
Do not reveal reasoning or instructions.
Remember the context of the conversation and refer back to previous answers if relevant.`;

      // Build messages array with context history
      const messages = [];
      
      // Add conversation history for context
      if (conversationHistory.length > 0) {
        conversationHistory.forEach((msg) => {
          if (msg.role && msg.content) {
            messages.push({
              role: msg.role === 'user' ? 'user' : 'assistant',
              content: sanitizeText(msg.content, 1000)
            });
          }
        });
      }
      
      // Add the current question
      messages.push({
        role: 'user',
        content: question
      });

      const payload = {
        model: config.nvidiaModel,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        max_tokens: 300,
        temperature: 0.35,
        top_p: 0.9,
        stream: false
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      console.log('=== AI Mentor Request (NVIDIA) ===');
      console.log('Question:', question.slice(0, 100));
      console.log('Conversation history length:', conversationHistory.length);

      const nvidiaRes = await fetch(config.nvidiaApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': config.nvidiaApiKey.startsWith('Bearer ') ? config.nvidiaApiKey : `Bearer ${config.nvidiaApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!nvidiaRes.ok) {
        const errText = await nvidiaRes.text();
        console.error('NVIDIA API Error:', errText.slice(0, 500));
        return next(createError(502, `NVIDIA API error ${nvidiaRes.status}`, 'nvidia_error'));
      }

      const data = await nvidiaRes.json();
      const answer = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
      
      if (!answer) {
        console.error('Empty response from NVIDIA API');
        return next(createError(502, 'Empty response from AI', 'empty_response'));
      }

      // Extract answer from tags if present
      let cleanAnswer = answer;
      const answerMatch = answer.match(/<answer>([\s\S]*?)<\/answer>/);
      if (answerMatch) {
        cleanAnswer = answerMatch[1].trim();
      }

      console.log('AI Mentor response received, length:', cleanAnswer.length);
      res.json({ answer: cleanAnswer, model: config.nvidiaModel });
    } catch (error) {
      next(error);
    }
  });

  // ── AI Teach (NVIDIA API streaming) ─────────────────────
  app.post('/ai-teach', authenticateRequest, requireRole('teacher', 'admin'), askLimiter, async (req, res) => {
    const topic = sanitizeText(req.body && req.body.topic, 500);
    const classSubject = sanitizeText(req.body && req.body.classSubject, 200);
    const context = sanitizeText(req.body && req.body.context, 2000);
    const language = sanitizeText(req.body && req.body.language, 40) || 'Hinglish';
    if (!topic) throw createError(400, 'Topic is required.', 'topic_required');
    if (!config.nvidiaApiKey) throw createError(503, 'NVIDIA API key is not configured. Set NVIDIA_API_KEY in .env', 'nvidia_not_configured');

    const systemPrompt = [
      `You are an expert AI teacher named "Acharya AI" for the subject: ${classSubject || 'General'}.`,
      `Teach the following topic in ${language} in a clear, engaging, and conversational tone as if you are teaching a live class.`,
      'Break down complex concepts into simple explanations.',
      'Use real-world examples and analogies.',
      'Keep your sentences short and natural for text-to-speech output.',
      'Use pauses by adding periods between sentences.',
      'Do not use markdown formatting, code blocks, bullet points, or special characters.',
      'Speak as if talking directly to students in a live classroom.',
      'Start with a brief greeting and introduction to the topic.',
      'End with a summary and invite questions.',
      context ? `Additional context from the teacher: ${context}` : ''
    ].filter(Boolean).join('\n');

    const payload = {
      model: config.nvidiaModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Please teach the topic: ${topic}` }
      ],
      max_tokens: 2048,
      temperature: 0.7,
      top_p: 0.95,
      stream: true
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      const nvidiaRes = await fetch(config.nvidiaApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': config.nvidiaApiKey.startsWith('Bearer ') ? config.nvidiaApiKey : `Bearer ${config.nvidiaApiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!nvidiaRes.ok) {
        const errText = await nvidiaRes.text();
        throw createError(502, `NVIDIA API error ${nvidiaRes.status}: ${errText}`, 'nvidia_error');
      }

      // Stream response back to client
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const reader = nvidiaRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') {
              res.write('data: [DONE]\n\n');
              continue;
            }
            try {
              const parsed = JSON.parse(dataStr);
              const content = parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content;
              if (content) {
                res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
              }
            } catch (_) { /* skip malformed lines */ }
          }
        }
      } catch (streamErr) {
        if (streamErr.name !== 'AbortError') console.error('Stream read error:', streamErr);
      }
      res.end();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw createError(504, 'NVIDIA API request timed out.', 'nvidia_timeout');
      }
      throw error;
    }
  });

  // ── AI Teach non-streaming (fallback) ────────────────────
  app.post('/ai-teach-sync', authenticateRequest, requireRole('teacher', 'admin'), askLimiter, async (req, res) => {
    const topic = sanitizeText(req.body && req.body.topic, 500);
    const classSubject = sanitizeText(req.body && req.body.classSubject, 200);
    const context = sanitizeText(req.body && req.body.context, 2000);
    const language = sanitizeText(req.body && req.body.language, 40) || 'Hinglish';
    if (!topic) throw createError(400, 'Topic is required.', 'topic_required');
    if (!config.nvidiaApiKey) throw createError(503, 'NVIDIA API key is not configured. Set NVIDIA_API_KEY in .env', 'nvidia_not_configured');

    const systemPrompt = [
      `You are an expert AI teacher named "Acharya AI" for the subject: ${classSubject || 'General'}.`,
      `Teach the following topic in ${language} in a clear, engaging, and conversational tone.`,
      'Break down complex concepts into simple explanations with real-world examples.',
      'Keep sentences short and natural for text-to-speech.',
      'Do not use markdown, code blocks, or special characters.',
      'Speak as if teaching a live class.',
      context ? `Additional context: ${context}` : ''
    ].filter(Boolean).join('\n');

    const payload = {
      model: config.nvidiaModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Please teach the topic: ${topic}` }
      ],
      max_tokens: 2048,
      temperature: 0.7,
      top_p: 0.95,
      stream: false
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const nvidiaRes = await fetch(config.nvidiaApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': config.nvidiaApiKey.startsWith('Bearer ') ? config.nvidiaApiKey : `Bearer ${config.nvidiaApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!nvidiaRes.ok) {
        const errText = await nvidiaRes.text();
        throw createError(502, `NVIDIA API error ${nvidiaRes.status}: ${errText}`, 'nvidia_error');
      }

      const data = await nvidiaRes.json();
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
      res.json({ text, model: config.nvidiaModel });
    } catch (error) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw createError(504, 'NVIDIA API request timed out.', 'nvidia_timeout');
      }
      throw error;
    }
  });

  // ── Generate Quiz Questions (NVIDIA API) ──────────────────
  app.post('/generate-quiz-questions', authenticateRequest, requireRole('teacher', 'admin'), askLimiter, async (req, res, next) => {
    try {
      const topic = sanitizeText(req.body && req.body.topic, 500);
      const numQuestions = parseInt(req.body && req.body.numQuestions, 10) || 3;
      const difficultyLevel = sanitizeText(req.body && req.body.difficultyLevel, 50) || 'medium';
      const questionType = sanitizeText(req.body && req.body.questionType, 50) || 'radio';
      const subject = sanitizeText(req.body && req.body.subject, 200) || 'General';
      
      if (!topic) return next(createError(400, 'Topic is required.', 'topic_required'));
      if (!config.nvidiaApiKey) return next(createError(503, 'NVIDIA API key is not configured. Set NVIDIA_API_KEY in .env', 'nvidia_not_configured'));

      // Determine system prompt based on question type
      let typeInstruction = '';
      if (questionType === 'hybrid' || questionType === 'mixed') {
        typeInstruction = `Generate questions of MIXED types:
- About 40% multiple choice ("type": "radio") with 4 options
- About 30% checkbox ("type": "checkbox") with 4-5 options
- About 30% short text ("type": "text") answers

For EACH question, MUST include the "type" field:
- For radio: "type": "radio", "options": ["option1", "option2", "option3", "option4"], "correctIndex": 0-3
- For checkbox: "type": "checkbox", "options": ["option1", "option2", "option3", "option4", "option5"], "correctIndex": 0-4
- For text: "type": "text", "options": ["correct_answer", "alternative_correct"], "correctIndex": 0`;
      } else if (questionType === 'checkbox') {
        typeInstruction = `All questions must have "type": "checkbox" (multiple correct answers). Include "options": ["option1", "option2", "option3", "option4", "option5"] and "correctIndex": 0 (or another correct index).`;
      } else if (questionType === 'text') {
        typeInstruction = `All questions must have "type": "text" (short answer). Include "options": ["correct_answer", "alternative_answer"] and "correctIndex": 0.`;
      } else {
        typeInstruction = `All questions must have "type": "radio" (multiple choice) with exactly 4 options. Include "options": ["option1", "option2", "option3", "option4"] and "correctIndex": (0, 1, 2, or 3).`;
      }

      const systemPrompt = `You are an expert educator creating quiz questions in valid JSON format.
CRITICAL: Respond with ONLY a valid JSON array. No text before, after, or around it. No code blocks. No markdown.

Generate exactly ${numQuestions} quiz questions on "${topic}" (subject: "${subject}", difficulty: ${difficultyLevel}).
${typeInstruction}

STRICT JSON REQUIREMENTS:
- Output ONLY the JSON array
- Use double quotes for all strings
- Escape special characters: backslash as \\\\, quote as \\"
- No literal newlines in strings
- No trailing commas
- No comments
- Valid JSON only

Format validation: Your response will be parsed as JSON. If it fails, it must be valid JSON.

Required question fields:
- "question": string - the question text
- "type": string - "radio", "checkbox", or "text"  
- "options": array of strings - the answer options
- "correctIndex": number or null - index of correct answer

VALID OUTPUT:
[
  {"question": "Sample question?", "type": "radio", "options": ["Option A", "Option B", "Option C"], "correctIndex": 0},
  {"question": "Another question?", "type": "checkbox", "options": ["Choice 1", "Choice 2", "Choice 3"], "correctIndex": 1}
]

IMPORTANT: Output ONLY the JSON array. Nothing else.`;

      const payload = {
        model: config.nvidiaModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate exactly ${numQuestions} ${questionType} questions on "${topic}". Respond ONLY with valid JSON array.` }
        ],
        max_tokens: 3000,
        temperature: 0.3,
        top_p: 0.9,
        stream: false
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      console.log('=== Generate Quiz Questions - NVIDIA API Call ===');
      console.log('URL:', config.nvidiaApiUrl);
      console.log('Model:', config.nvidiaModel);
      console.log('Topic:', topic);

      const nvidiaRes = await fetch(config.nvidiaApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': config.nvidiaApiKey.startsWith('Bearer ') ? config.nvidiaApiKey : `Bearer ${config.nvidiaApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      console.log('NVIDIA API Response Status:', nvidiaRes.status);

      if (!nvidiaRes.ok) {
        const errText = await nvidiaRes.text();
        console.error('NVIDIA API Error Response:', errText.slice(0, 500));
        return next(createError(502, `NVIDIA API error ${nvidiaRes.status}: ${errText.slice(0, 100)}`, 'nvidia_error'));
      }

      const data = await nvidiaRes.json();
      console.log('NVIDIA API Response received successfully');
      const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
      
      if (!content) {
        console.error('No content in NVIDIA response:', JSON.stringify(data).slice(0, 500));
        return next(createError(502, 'NVIDIA API returned empty response', 'empty_response'));
      }
      
      // Try to parse the JSON response
      let questions = [];
      let cleanedContent = ''; // Declare outside try block so catch can access it
      try {
        cleanedContent = content.trim();
        
        // Remove markdown code blocks
        if (cleanedContent.startsWith('```json')) cleanedContent = cleanedContent.slice(7);
        if (cleanedContent.startsWith('```')) cleanedContent = cleanedContent.slice(3);
        if (cleanedContent.endsWith('```')) cleanedContent = cleanedContent.slice(0, -3);
        cleanedContent = cleanedContent.trim();
        
        // Try to extract JSON array - find first [ and last ]
        let jsonStr = cleanedContent;
        const arrayStart = cleanedContent.indexOf('[');
        const arrayEnd = cleanedContent.lastIndexOf(']');
        
        if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
          jsonStr = cleanedContent.substring(arrayStart, arrayEnd + 1);
        }
        
        console.log('Raw JSON to parse (first 200 chars):', jsonStr.slice(0, 200));
        
        // Attempt 1: Try direct parse
        let parsed = null;
        try {
          parsed = JSON.parse(jsonStr);
        } catch (e1) {
          console.log('Direct parse failed, attempting to fix common issues...');
          
          // Attempt 2: Try to fix unescaped characters in content
          // Use a simpler approach - replace actual newlines with escaped versions
          let fixed = jsonStr.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
          
          try {
            parsed = JSON.parse(fixed);
            console.log('Successfully parsed after fixing whitespace');
          } catch (e2) {
            console.log('Still failed after whitespace fix, trying original again');
            throw e1; // Throw original error
          }
        }
        
        questions = parsed;
        if (!Array.isArray(questions)) {
          console.error('Response is not an array:', typeof questions);
          questions = [];
        } else if (questions.length > 0) {
          // Validate and clean each question
          questions = questions.map((q) => ({
            question: String(q.question || '').trim(),
            type: String(q.type || 'radio').toLowerCase(),
            options: Array.isArray(q.options) ? q.options.map((o) => String(o).trim()).filter((o) => o) : [],
            correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : undefined
          })).filter((q) => q.question && q.options.length >= 2);
        }
        
        console.log('Quiz questions parsed successfully, count:', questions.length);
      } catch (parseErr) {
        console.error('Final parse error:', parseErr.message);
        console.error('Attempted JSON (first 400 chars):', cleanedContent.slice(0, 400));
        console.error('Full raw content (first 600 chars):', content.slice(0, 600));
        return next(createError(502, 'Failed to parse AI response: ' + parseErr.message, 'parse_error'));
      }
      
      res.json({ questions, model: config.nvidiaModel });
    } catch (error) {
      console.error('Generate quiz error:', error);
      next(error);
    }
  });

  // ── Generate Assignment (NVIDIA API) ───────────────────────
  app.post('/generate-assignment', authenticateRequest, requireRole('teacher', 'admin'), askLimiter, async (req, res, next) => {
    try {
      const topic = sanitizeText(req.body && req.body.topic, 500);
      const subject = sanitizeText(req.body && req.body.subject, 200) || 'General';
      
      if (!topic) return next(createError(400, 'Topic is required.', 'topic_required'));
      if (!config.nvidiaApiKey) return next(createError(503, 'NVIDIA API key is not configured. Set NVIDIA_API_KEY in .env', 'nvidia_not_configured'));

      const systemPrompt = `You are an expert educator creating assignment prompts.
You MUST respond with ONLY a valid JSON object, with NO text before or after, and NO code blocks.
Create an assignment for the topic: "${topic}" in subject: "${subject}".
Respond with ONLY pure JSON, no markdown, no code blocks:
{"title": "Assignment title here", "description": "Detailed assignment description here"}`;

      const payload = {
        model: config.nvidiaModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Create an assignment for "${topic}".` }
        ],
        max_tokens: 1024,
        temperature: 0.7,
        top_p: 0.95,
        stream: false
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      console.log('=== Generate Assignment - NVIDIA API Call ===');
      console.log('URL:', config.nvidiaApiUrl);
      console.log('Model:', config.nvidiaModel);
      console.log('Topic:', topic);

      const nvidiaRes = await fetch(config.nvidiaApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': config.nvidiaApiKey.startsWith('Bearer ') ? config.nvidiaApiKey : `Bearer ${config.nvidiaApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      console.log('NVIDIA API Response Status:', nvidiaRes.status);

      if (!nvidiaRes.ok) {
        const errText = await nvidiaRes.text();
        console.error('NVIDIA API Error Response:', errText.slice(0, 500));
        return next(createError(502, `NVIDIA API error ${nvidiaRes.status}: ${errText.slice(0, 100)}`, 'nvidia_error'));
      }

      const data = await nvidiaRes.json();
      console.log('NVIDIA API Response received successfully');
      const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
      
      if (!content) {
        console.error('No content in NVIDIA response:', JSON.stringify(data).slice(0, 500));
        return next(createError(502, 'NVIDIA API returned empty response', 'empty_response'));
      }
      
      // Try to parse the JSON response
      let assignment = { title: '', description: '' };
      try {
        // Clean up the response - remove markdown code blocks if present
        let cleanedContent = content.trim();
        if (cleanedContent.startsWith('```json')) cleanedContent = cleanedContent.slice(7);
        if (cleanedContent.startsWith('```')) cleanedContent = cleanedContent.slice(3);
        if (cleanedContent.endsWith('```')) cleanedContent = cleanedContent.slice(0, -3);
        cleanedContent = cleanedContent.trim();
        
        const parsed = JSON.parse(cleanedContent);
        assignment.title = parsed.title || '';
        assignment.description = parsed.description || '';
        console.log('Assignment parsed successfully:', assignment);
      } catch (parseErr) {
        console.error('Failed to parse assignment response:', parseErr.message, 'Content:', content.slice(0, 200));
        return next(createError(502, 'Failed to parse AI response: ' + parseErr.message, 'parse_error'));
      }
      
      res.json({ assignment, model: config.nvidiaModel });
    } catch (error) {
      console.error('Generate assignment error:', error);
      next(error);
    }
  });

  app.get('/rtc-config', authenticateRequest, async (req, res) => {
    const stunList = parseList(process.env.STUN_URLS);
    const turnList = parseList(process.env.TURN_URLS || process.env.TURN_URL);
    const turnUser = sanitizeText(process.env.TURN_USER, 200);
    const turnPass = sanitizeText(process.env.TURN_PASS, 200);
    const allowPublicStun = !parseBoolean(process.env.DISABLE_PUBLIC_STUN, false);
    const servers = [];
    if (stunList.length) servers.push({ urls: stunList });
    else if (allowPublicStun) servers.push({ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] });
    if (turnList.length && turnUser && turnPass) {
      servers.push({ urls: turnList, username: turnUser, credential: turnPass });
    }
    res.json({ iceServers: servers });
  });

  app.get('/health', async (req, res) => {
    const dbConnected = mongoose.connection.readyState === 1;
    res.status(dbConnected ? 200 : 503).json({
      ok: dbConnected,
      time: new Date().toISOString(),
      mongo: dbConnected ? 'connected' : 'disconnected',
      firebaseAdminConfigured,
      firebasePublicConfigured,
      firebaseRealtimeDatabaseConfigured,
      shuttingDown: state.shuttingDown
    });
  });

  app.get('/ready', async (req, res) => {
    const dbConnected = mongoose.connection.readyState === 1;
    const ready = dbConnected && !state.shuttingDown;
    res.status(ready ? 200 : 503).json({
      ok: ready,
      time: new Date().toISOString(),
      mongo: dbConnected ? 'connected' : 'disconnected',
      firebaseAdminConfigured,
      firebasePublicConfigured,
      firebaseRealtimeDatabaseConfigured,
      shuttingDown: state.shuttingDown
    });
  });

  app.use((req, res, next) => next(createError(404, 'Route not found.', 'not_found')));
  app.use((error, req, res, next) => {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? 'Internal server error.' : error.message, code: error.code || 'internal_error', requestId: req.requestId });
  });

  return {
    app,
    io,
    server,
    setShuttingDown(value) {
      state.shuttingDown = value;
    }
  };
}

module.exports = {
  createApp
};
