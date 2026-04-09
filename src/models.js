const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

const userSchema = new mongoose.Schema(
  {
    firebaseUid: { type: String, required: true, unique: true, index: true },
    email: { type: String, trim: true, lowercase: true, default: '', index: true },
    displayName: { type: String, trim: true, default: '' },
    photoURL: { type: String, trim: true, default: '' },
    role: { type: String, enum: ['teacher', 'student', 'admin'], required: true },
    activeSessionId: { type: String, trim: true, default: '' },
    activeSessionOpenedAt: { type: Date, default: null },
    firstSeen: { type: Date, required: true },
    lastSeen: { type: Date, required: true }
  },
  { timestamps: true, versionKey: false }
);

const classSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    mode: { type: String, enum: ['ai', 'human'], default: 'ai' },
    nextSession: { type: String, default: '', trim: true },
    scheduleNotes: { type: String, default: '', trim: true },
    upcomingSessions: { type: [String], default: [] },
    teacherUid: { type: String, required: true, index: true },
    teacherId: { type: String, required: true, trim: true },
    teacherName: { type: String, default: '', trim: true }
  },
  { timestamps: true, versionKey: false }
);

const quizSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true },
    question: { type: String, required: true, trim: true },
    questionType: {
      type: String,
      enum: ['number', 'text', 'radio', 'checkbox', 'description', 'coding'],
      default: 'radio'
    },
    examGroupId: { type: String, default: '', trim: true, index: true },
    examQuestionOrder: { type: Number, default: 0 },
    options: { type: [String], default: [] },
    optionCount: { type: Number, default: 0 },
    requiresCorrectAnswer: { type: Boolean, default: false },
    correctIndex: { type: Number, default: -1 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    classId: { type: String, default: 'all', index: true },
    teacherUid: { type: String, required: true, index: true },
    teacherId: { type: String, required: true, trim: true },
    teacherName: { type: String, default: '', trim: true }
  },
  { timestamps: true, versionKey: false }
);

const assignmentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    classId: { type: String, default: 'all', index: true },
    teacherUid: { type: String, required: true, index: true },
    teacherId: { type: String, required: true, trim: true },
    teacherName: { type: String, default: '', trim: true }
  },
  { timestamps: true, versionKey: false }
);

const quizSubmissionSchema = new mongoose.Schema(
  {
    studentUid: { type: String, required: true, index: true },
    studentName: { type: String, required: true, trim: true },
    studentEmail: { type: String, default: '', trim: true },
    teacherUid: { type: String, required: true, index: true },
    teacherId: { type: String, default: '', trim: true },
    classId: { type: String, default: 'all', index: true },
    answers: [
      {
        quizId: { type: String, required: true },
        answerIndex: { type: Number, default: -1 },
        answerText: { type: String, default: '', trim: true },
        answerValues: { type: [String], default: [] }
      }
    ],
    score: { type: Number, required: true },
    total: { type: Number, required: true },
    submittedAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

const examProgressSchema = new mongoose.Schema(
  {
    quizId: { type: String, required: true, index: true },
    classId: { type: String, default: '', index: true },
    studentUid: { type: String, required: true, index: true },
    studentName: { type: String, required: true, trim: true },
    studentEmail: { type: String, default: '', trim: true },
    remainingSeconds: { type: Number, required: true, min: 0 },
    touchedAt: { type: Date, default: Date.now }
  },
  { timestamps: true, versionKey: false }
);

examProgressSchema.index({ quizId: 1, studentUid: 1 }, { unique: true });

const assignmentSubmissionSchema = new mongoose.Schema(
  {
    assignmentId: { type: String, required: true, index: true },
    studentUid: { type: String, required: true, index: true },
    studentName: { type: String, required: true, trim: true },
    studentEmail: { type: String, default: '', trim: true },
    teacherUid: { type: String, required: true, index: true },
    teacherId: { type: String, default: '', trim: true },
    classId: { type: String, default: 'all', index: true },
    answer: { type: String, required: true, trim: true },
    submittedAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

module.exports = {
  Assignment: mongoose.models.Assignment || mongoose.model('Assignment', assignmentSchema),
  AssignmentSubmission:
    mongoose.models.AssignmentSubmission ||
    mongoose.model('AssignmentSubmission', assignmentSubmissionSchema),
  ClassModel: mongoose.models.Class || mongoose.model('Class', classSchema),
  ExamProgress:
    mongoose.models.ExamProgress || mongoose.model('ExamProgress', examProgressSchema),
  Quiz: mongoose.models.Quiz || mongoose.model('Quiz', quizSchema),
  QuizSubmission:
    mongoose.models.QuizSubmission || mongoose.model('QuizSubmission', quizSubmissionSchema),
  User: mongoose.models.User || mongoose.model('User', userSchema)
};
