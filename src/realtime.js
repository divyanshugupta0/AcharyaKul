const { Server } = require('socket.io');

const { admin, config, firebaseAdminConfigured, buildOriginMatcher } = require('./config');
const { ClassModel } = require('./models');
const {
  createError,
  ensureValidObjectId,
  SESSION_INVALIDATED_MESSAGE,
  sanitizeText,
  syncUserFromToken,
  toSessionUser
} = require('./auth');

function createRealtime(server) {
  const isSocketOriginAllowed = buildOriginMatcher(config.socketAllowedOrigins);

  const io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (isSocketOriginAllowed(origin)) {
          return callback(null, true);
        }
        callback(new Error('Socket origin not allowed.'));
      }
    }
  });

  const roomKey = (classId) => `class:${classId}`;
  const liveRooms = new Map();
  const teacherRooms = new Map();
  const studentRooms = new Map();
  const pendingStudents = new Map();
  const userSockets = new Map();
  const aiTeachingRooms = new Map(); // classId → { active: boolean, topic: string }

  function registerUserSocket(userUid, socketId) {
    if (!userUid) {
      return;
    }
    const current = userSockets.get(userUid) || new Set();
    current.add(socketId);
    userSockets.set(userUid, current);
  }

  function unregisterUserSocket(userUid, socketId) {
    if (!userUid) {
      return;
    }
    const current = userSockets.get(userUid);
    if (!current) {
      return;
    }
    current.delete(socketId);
    if (!current.size) {
      userSockets.delete(userUid);
    }
  }

  function emitSocketError(socket, error) {
    socket.emit('app-error', {
      message: error.message || 'Socket error.',
      code: error.code || 'socket_error'
    });
  }

  function leaveTeacherRoom(socket) {
    const current = teacherRooms.get(socket.id);
    if (!current) {
      return;
    }
    const live = liveRooms.get(current.classId);
    if (live && live.socketId === socket.id) {
      liveRooms.delete(current.classId);
      io.to(roomKey(current.classId)).emit('teacher-left', { classId: current.classId });
    }
    teacherRooms.delete(socket.id);
    socket.leave(roomKey(current.classId));
  }

  function leaveStudentRoom(socket) {
    const current = studentRooms.get(socket.id);
    if (!current) {
      return;
    }
    studentRooms.delete(socket.id);
    socket.leave(roomKey(current.classId));
    const live = liveRooms.get(current.classId);
    if (live) {
      io.to(live.socketId).emit('student-left', {
        classId: current.classId,
        studentId: socket.id,
        studentUid: current.studentUid
      });
    }
  }

  function getSocketRoom(socketId) {
    return teacherRooms.get(socketId) || studentRooms.get(socketId) || null;
  }

  function parseScheduledSessionEntry(raw) {
    if (!raw) {
      return null;
    }
    if (typeof raw === 'object') {
      return raw;
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function classHasWaitingRoom(targetClass) {
    const now = Date.now();
    const sessions = Array.isArray(targetClass && targetClass.upcomingSessions) ? targetClass.upcomingSessions : [];
    return sessions
      .map(parseScheduledSessionEntry)
      .filter(Boolean)
      .some((session) => {
        if (!session.features || !session.features.waitingRoom) {
          return false;
        }
        const endsAt = session.endsAt ? new Date(session.endsAt).getTime() : 0;
        return !endsAt || now <= endsAt;
      });
  }

  function getPendingStudents(classId) {
    if (!pendingStudents.has(classId)) {
      pendingStudents.set(classId, new Map());
    }
    return pendingStudents.get(classId);
  }

  function removePendingStudent(socketId) {
    pendingStudents.forEach((classMap, classId) => {
      if (!classMap.has(socketId)) {
        return;
      }
      const pending = classMap.get(socketId);
      classMap.delete(socketId);
      const live = liveRooms.get(classId);
      if (live) {
        io.to(live.socketId).emit('join-request-removed', {
          classId,
          studentId: socketId,
          studentUid: pending && pending.studentUid
        });
      }
      if (!classMap.size) {
        pendingStudents.delete(classId);
      }
    });
  }

  io.disconnectOtherUserSockets = (userUid, activeSessionId) => {
    const socketIds = Array.from(userSockets.get(userUid) || []);
    socketIds.forEach((socketId) => {
      const targetSocket = io.sockets.sockets.get(socketId);
      if (!targetSocket) {
        unregisterUserSocket(userUid, socketId);
        return;
      }
      if (targetSocket.data.deviceSessionId === activeSessionId) {
        return;
      }
      targetSocket.emit('app-error', {
        message: SESSION_INVALIDATED_MESSAGE,
        code: 'session_invalidated'
      });
      targetSocket.disconnect(true);
    });
  };

  io.disconnectAllUserSockets = (userUid) => {
    const socketIds = Array.from(userSockets.get(userUid) || []);
    socketIds.forEach((socketId) => {
      const targetSocket = io.sockets.sockets.get(socketId);
      if (!targetSocket) {
        unregisterUserSocket(userUid, socketId);
        return;
      }
      targetSocket.emit('app-error', {
        message: 'You have been logged out.',
        code: 'session_closed'
      });
      targetSocket.disconnect(true);
    });
  };

  async function validateTeacherClassOwnership(socket, classId) {
    ensureValidObjectId(classId, 'classId');
    const targetClass = await ClassModel.findById(classId);
    if (!targetClass) {
      throw createError(404, 'Class not found.', 'class_not_found');
    }
    const teacherId = socket.data.user.email || socket.data.user.uid;
    if (targetClass.teacherUid && targetClass.teacherUid !== socket.data.user.uid) {
      throw createError(403, 'You cannot teach this class.', 'forbidden');
    }
    if (!targetClass.teacherUid && targetClass.teacherId && targetClass.teacherId !== teacherId) {
      throw createError(403, 'You cannot teach this class.', 'forbidden');
    }
    return targetClass;
  }

  io.use(async (socket, next) => {
    try {
      if (!firebaseAdminConfigured) {
        throw createError(503, 'Firebase authentication is not configured.', 'firebase_not_configured');
      }
      const token = sanitizeText(socket.handshake.auth && socket.handshake.auth.token, 5000);
      const deviceSessionId = sanitizeText(
        socket.handshake.auth && socket.handshake.auth.sessionId,
        200
      );
      if (!token) {
        throw createError(401, 'Missing Firebase ID token.', 'missing_token');
      }
      if (!deviceSessionId) {
        throw createError(401, 'Missing device session. Please sign in again.', 'missing_device_session');
      }
      const decodedToken = await admin.auth().verifyIdToken(token);
      const user = await syncUserFromToken(decodedToken);
      if (!user.activeSessionId || user.activeSessionId !== deviceSessionId) {
        throw createError(401, SESSION_INVALIDATED_MESSAGE, 'session_invalidated');
      }
      socket.data.user = toSessionUser(user);
      socket.data.deviceSessionId = deviceSessionId;
      registerUserSocket(user.firebaseUid, socket.id);
      next();
    } catch (error) {
      const socketError = new Error(error.message || 'Socket authentication failed.');
      socketError.data = { code: error.code || 'socket_error' };
      next(socketError);
    }
  });

  io.on('connection', (socket) => {
    socket.on('teacher-join', async (payload = {}) => {
      try {
        if (!['teacher', 'admin'].includes(socket.data.user.role)) {
          throw createError(403, 'Teacher access is required.', 'forbidden');
        }
        const classId = sanitizeText(payload.classId, 40);
        if (!classId) {
          throw createError(400, 'classId is required.', 'class_required');
        }
        const targetClass = await validateTeacherClassOwnership(socket, classId);
        const existing = liveRooms.get(classId);
        if (existing && existing.socketId !== socket.id) {
          io.to(existing.socketId).emit('teacher-replaced', { classId });
          teacherRooms.delete(existing.socketId);
        }
        leaveTeacherRoom(socket);
        const teacherName = targetClass.teacherName || socket.data.user.displayName;
        liveRooms.set(classId, { socketId: socket.id, teacherUid: socket.data.user.uid, teacherName });
        teacherRooms.set(socket.id, { classId, teacherUid: socket.data.user.uid });
        socket.join(roomKey(classId));
        io.to(roomKey(classId)).emit('teacher-live', {
          classId,
          teacherId: targetClass.teacherId || socket.data.user.email || socket.data.user.uid,
          teacherName,
          teacherSocketId: socket.id
        });
        const queuedStudents = Array.from(getPendingStudents(classId).values());
        queuedStudents.forEach((pending) => {
          socket.emit('join-request', pending);
        });
      } catch (error) {
        emitSocketError(socket, error);
      }
    });

    socket.on('teacher-leave', () => leaveTeacherRoom(socket));

    socket.on('student-join', async (payload = {}) => {
      try {
        const classId = sanitizeText(payload.classId, 40);
        if (!classId) {
          throw createError(400, 'classId is required.', 'class_required');
        }
        ensureValidObjectId(classId, 'classId');
        const targetClass = await ClassModel.findById(classId);
        if (!targetClass) {
          throw createError(404, 'Class not found.', 'class_not_found');
        }
        removePendingStudent(socket.id);
        leaveStudentRoom(socket);
        const studentName = socket.data.user.displayName;
        const waitingRoomEnabled = classHasWaitingRoom(targetClass);
        const live = liveRooms.get(classId);
        if (waitingRoomEnabled) {
          const pending = {
            classId,
            studentId: socket.id,
            studentUid: socket.data.user.uid,
            studentName
          };
          getPendingStudents(classId).set(socket.id, pending);
          socket.emit('waiting-room-status', {
            classId,
            status: 'pending',
            teacherLive: Boolean(live)
          });
          if (live) {
            io.to(live.socketId).emit('join-request', pending);
          } else {
            socket.emit('teacher-offline', { classId, waitingRoom: true });
          }
          return;
        }
        studentRooms.set(socket.id, {
          classId,
          studentUid: socket.data.user.uid,
          studentName,
          handRaised: false
        });
        socket.join(roomKey(classId));
        if (live) {
          io.to(live.socketId).emit('student-join', {
            classId,
            studentId: socket.id,
            studentUid: socket.data.user.uid,
            studentName
          });
          socket.emit('teacher-live', {
            classId,
            teacherId: live.teacherName || live.teacherUid,
            teacherName: live.teacherName,
            teacherSocketId: live.socketId
          });
        } else {
          socket.emit('teacher-offline', { classId });
        }
      } catch (error) {
        emitSocketError(socket, error);
      }
    });

    socket.on('student-leave', () => {
      removePendingStudent(socket.id);
      leaveStudentRoom(socket);
    });

    socket.on('teacher-admit-student', (payload = {}) => {
      try {
        const current = teacherRooms.get(socket.id);
        if (!current) {
          throw createError(403, 'You are not live in a classroom.', 'forbidden');
        }
        const classId = sanitizeText(payload.classId, 40) || current.classId;
        const studentId = sanitizeText(payload.studentId, 40);
        if (!studentId || classId !== current.classId) {
          throw createError(400, 'Invalid join request.', 'invalid_request');
        }
        const classPending = getPendingStudents(classId);
        const pending = classPending.get(studentId);
        const targetSocket = io.sockets.sockets.get(studentId);
        if (!pending || !targetSocket) {
          throw createError(404, 'Student request no longer exists.', 'request_missing');
        }
        classPending.delete(studentId);
        if (!classPending.size) {
          pendingStudents.delete(classId);
        }
        studentRooms.set(studentId, {
          classId,
          studentUid: pending.studentUid,
          studentName: pending.studentName,
          handRaised: false
        });
        targetSocket.join(roomKey(classId));
        targetSocket.emit('waiting-room-status', {
          classId,
          status: 'approved',
          teacherLive: true
        });
        targetSocket.emit('teacher-live', {
          classId,
          teacherId: socket.data.user.email || socket.data.user.uid,
          teacherName: socket.data.user.displayName,
          teacherSocketId: socket.id
        });
        socket.emit('join-request-resolved', { classId, studentId, status: 'approved' });
        io.to(socket.id).emit('student-join', {
          classId,
          studentId,
          studentUid: pending.studentUid,
          studentName: pending.studentName
        });
      } catch (error) {
        emitSocketError(socket, error);
      }
    });

    socket.on('teacher-reject-student', (payload = {}) => {
      try {
        const current = teacherRooms.get(socket.id);
        if (!current) {
          throw createError(403, 'You are not live in a classroom.', 'forbidden');
        }
        const classId = sanitizeText(payload.classId, 40) || current.classId;
        const studentId = sanitizeText(payload.studentId, 40);
        if (!studentId || classId !== current.classId) {
          throw createError(400, 'Invalid join request.', 'invalid_request');
        }
        const classPending = getPendingStudents(classId);
        const pending = classPending.get(studentId);
        if (!pending) {
          throw createError(404, 'Student request no longer exists.', 'request_missing');
        }
        classPending.delete(studentId);
        if (!classPending.size) {
          pendingStudents.delete(classId);
        }
        io.to(studentId).emit('waiting-room-status', {
          classId,
          status: 'rejected',
          teacherLive: true
        });
        socket.emit('join-request-resolved', { classId, studentId, status: 'rejected' });
      } catch (error) {
        emitSocketError(socket, error);
      }
    });

    socket.on('teacher-chat', (payload = {}) => {
      try {
        const current = teacherRooms.get(socket.id);
        if (!current) {
          throw createError(403, 'You are not live in a classroom.', 'forbidden');
        }
        const text = sanitizeText(payload.text, 1000);
        if (!text) {
          return;
        }
        io.to(roomKey(current.classId)).emit('teacher-chat', {
          classId: current.classId,
          teacherId: socket.data.user.id,
          name: socket.data.user.displayName,
          text
        });
      } catch (error) {
        emitSocketError(socket, error);
      }
    });

    socket.on('student-chat', (payload = {}) => {
      try {
        const current = studentRooms.get(socket.id);
        if (!current) {
          throw createError(403, 'You are not in a classroom.', 'forbidden');
        }
        // Block student chat when AI is teaching
        const aiStatus = aiTeachingRooms.get(current.classId);
        if (aiStatus && aiStatus.active) {
          socket.emit('app-error', {
            message: 'Chat is disabled while AI Teacher is active. Please listen to the lesson.',
            code: 'ai_teaching_active'
          });
          return;
        }
        const text = sanitizeText(payload.text, 1000);
        if (!text) {
          return;
        }
        io.to(roomKey(current.classId)).emit('student-chat', {
          classId: current.classId,
          studentId: socket.id,
          studentUid: current.studentUid,
          name: current.studentName,
          text
        });
      } catch (error) {
        emitSocketError(socket, error);
      }
    });

    socket.on('student-hand', () => {
      try {
        const current = studentRooms.get(socket.id);
        if (!current) {
          throw createError(403, 'You are not in a classroom.', 'forbidden');
        }
        // Block hand raising when AI is teaching
        const aiStatus = aiTeachingRooms.get(current.classId);
        if (aiStatus && aiStatus.active) {
          socket.emit('app-error', {
            message: 'Hand raising is disabled while AI Teacher is active.',
            code: 'ai_teaching_active'
          });
          return;
        }
        current.handRaised = !current.handRaised;
        studentRooms.set(socket.id, current);
        const live = liveRooms.get(current.classId);
        if (live) {
          io.to(live.socketId).emit('student-hand', {
            classId: current.classId,
            studentId: socket.id,
            studentUid: current.studentUid,
            name: current.studentName,
            handRaised: current.handRaised
          });
        }
      } catch (error) {
        emitSocketError(socket, error);
      }
    });

    // ── AI Teaching mode control ──────────────────────────
    socket.on('ai-teaching-start', (payload = {}) => {
      try {
        if (!['teacher', 'admin'].includes(socket.data.user.role)) {
          throw createError(403, 'Teacher access is required.', 'forbidden');
        }
        const current = teacherRooms.get(socket.id);
        if (!current) {
          throw createError(403, 'You are not live in a classroom.', 'forbidden');
        }
        const topic = sanitizeText(payload.topic, 500) || 'General';
        aiTeachingRooms.set(current.classId, { active: true, topic });
        // Broadcast to all students in the room
        io.to(roomKey(current.classId)).emit('ai-teaching-status', {
          classId: current.classId,
          active: true,
          topic
        });
      } catch (error) {
        emitSocketError(socket, error);
      }
    });

    socket.on('ai-teaching-sentence', (payload = {}) => {
      try {
        if (!['teacher', 'admin'].includes(socket.data.user.role)) return;
        const current = teacherRooms.get(socket.id);
        if (!current || payload.classId !== current.classId) return;

        io.to(roomKey(current.classId)).emit('ai-teaching-sentence', {
          classId: payload.classId,
          text: sanitizeText(payload.text, 2000),
          lang: sanitizeText(payload.lang, 20),
          rate: Number(payload.rate) || 1,
          pitch: Number(payload.pitch) || 1
        });
      } catch (error) {
        // ignore verbose string errors to prevent spam
      }
    });

    socket.on('ai-teaching-stop', () => {
      try {
        const current = teacherRooms.get(socket.id);
        if (!current) return;
        aiTeachingRooms.delete(current.classId);
        // Broadcast to all students in the room
        io.to(roomKey(current.classId)).emit('ai-teaching-status', {
          classId: current.classId,
          active: false,
          topic: ''
        });
      } catch (error) {
        emitSocketError(socket, error);
      }
    });

    socket.on('offer', (payload = {}) => {
      try {
        const target = sanitizeText(payload.to, 40);
        const sourceRoom = teacherRooms.get(socket.id);
        const targetRoom = studentRooms.get(target);
        if (!target || !sourceRoom || !targetRoom || sourceRoom.classId !== targetRoom.classId) {
          throw createError(403, 'Invalid signaling target.', 'invalid_target');
        }
        io.to(target).emit('offer', { from: socket.id, sdp: payload.sdp, classId: sourceRoom.classId });
      } catch (error) {
        emitSocketError(socket, error);
      }
    });

    socket.on('answer', (payload = {}) => {
      try {
        const target = sanitizeText(payload.to, 40);
        const sourceRoom = studentRooms.get(socket.id);
        const targetRoom = teacherRooms.get(target);
        if (!target || !sourceRoom || !targetRoom || sourceRoom.classId !== targetRoom.classId) {
          throw createError(403, 'Invalid signaling target.', 'invalid_target');
        }
        io.to(target).emit('answer', { from: socket.id, sdp: payload.sdp, classId: sourceRoom.classId });
      } catch (error) {
        emitSocketError(socket, error);
      }
    });

    socket.on('ice-candidate', (payload = {}) => {
      try {
        const target = sanitizeText(payload.to, 40);
        const sourceRoom = getSocketRoom(socket.id);
        const targetRoom = getSocketRoom(target);
        if (!target || !sourceRoom || !targetRoom || sourceRoom.classId !== targetRoom.classId) {
          throw createError(403, 'Invalid signaling target.', 'invalid_target');
        }
        io.to(target).emit('ice-candidate', {
          from: socket.id,
          candidate: payload.candidate,
          classId: sourceRoom.classId
        });
      } catch (error) {
        emitSocketError(socket, error);
      }
    });

    socket.on('disconnect', () => {
      // Clean up AI teaching state if teacher disconnects
      const teacherRoom = teacherRooms.get(socket.id);
      if (teacherRoom && aiTeachingRooms.has(teacherRoom.classId)) {
        aiTeachingRooms.delete(teacherRoom.classId);
        io.to(roomKey(teacherRoom.classId)).emit('ai-teaching-status', {
          classId: teacherRoom.classId,
          active: false,
          topic: ''
        });
      }
      unregisterUserSocket(socket.data.user && socket.data.user.uid, socket.id);
      removePendingStudent(socket.id);
      leaveStudentRoom(socket);
      leaveTeacherRoom(socket);
    });
  });

  return io;
}

module.exports = {
  createRealtime
};
