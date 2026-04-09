const crypto = require('crypto');
const mongoose = require('mongoose');

const {
  admin,
  config,
  firebaseAdminConfigured,
  firebaseRealtimeDatabaseConfigured
} = require('./config');
const { User } = require('./models');

const DEVICE_SESSION_HEADER = 'x-device-session';
const SESSION_INVALIDATED_MESSAGE = 'This account is already active on another device. Please sign in again.';

function createError(status, message, code = 'error') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sanitizeText(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function buildRoleNotAllowedMessage(role) {
  const normalizedRole = sanitizeText(role, 20).toLowerCase();
  const roleLabel = normalizedRole === 'admin' ? 'admin' : 'teacher';
  const allowlistLabel =
    normalizedRole === 'admin' ? 'ADMIN_EMAILS or ADMIN_UIDS' : 'TEACHER_EMAILS or TEACHER_UIDS';
  const bootstrapNote =
    normalizedRole === 'admin'
      ? ' If no admin exists yet, use /first-admin to bootstrap the first admin account.'
      : '';

  return `This email is not approved for ${roleLabel} access. Add it to ${allowlistLabel}.${bootstrapNote}`;
}

function canSelfRegisterRole(requestedRole, email) {
  const normalizedRole = sanitizeText(requestedRole, 20).toLowerCase();
  const normalizedEmail = normalizeEmail(email);

  if (normalizedRole === 'student') {
    return {
      allowed: true,
      role: 'student'
    };
  }

  if (normalizedRole === 'teacher') {
    const allowed =
      config.firebase.teacherEmails.includes(normalizedEmail) ||
      config.firebase.adminEmails.includes(normalizedEmail);

    return {
      allowed,
      role: normalizedRole,
      message: allowed ? '' : buildRoleNotAllowedMessage(normalizedRole)
    };
  }

  if (normalizedRole === 'admin') {
    const allowed = config.firebase.adminEmails.includes(normalizedEmail);

    return {
      allowed,
      role: normalizedRole,
      message: allowed ? '' : buildRoleNotAllowedMessage(normalizedRole)
    };
  }

  return {
    allowed: false,
    role: normalizedRole,
    message: 'requestedRole must be teacher, student, or admin.'
  };
}

function ensureValidObjectId(id, fieldName) {
  if (!mongoose.isValidObjectId(id)) {
    throw createError(400, `${fieldName} is invalid.`, 'invalid_id');
  }
}

function getDisplayName(decodedToken, email) {
  const name =
    sanitizeText(decodedToken.name || decodedToken.displayName || '', 120) ||
    sanitizeText(email.split('@')[0], 120) ||
    sanitizeText(decodedToken.uid, 120);
  return name;
}

function getIdentityLabel(userLike) {
  return sanitizeText(userLike.email || userLike.displayName || userLike.firebaseUid || userLike.uid, 160);
}

function hasAdminAccess(decodedToken, email) {
  return (
    decodedToken.admin === true ||
    String(decodedToken.role || '').toLowerCase() === 'admin' ||
    config.firebase.adminUids.includes(decodedToken.uid) ||
    config.firebase.adminEmails.includes(email)
  );
}

function hasTeacherAccess(decodedToken, email) {
  return (
    hasAdminAccess(decodedToken, email) ||
    decodedToken.teacher === true ||
    String(decodedToken.role || '').toLowerCase() === 'teacher' ||
    config.firebase.teacherUids.includes(decodedToken.uid) ||
    config.firebase.teacherEmails.includes(email)
  );
}

function resolveRole(existingRole, requestedRole, decodedToken, email, options = {}) {
  const adminAllowed = hasAdminAccess(decodedToken, email);
  const teacherAllowed = hasTeacherAccess(decodedToken, email);
  const bootstrapAdminAccess = Boolean(options.allowFirstAdminBootstrap);

  if (requestedRole === 'admin') {
    if (!adminAllowed && existingRole !== 'admin' && !bootstrapAdminAccess) {
      throw createError(403, buildRoleNotAllowedMessage('admin'), 'role_not_allowed');
    }
    return 'admin';
  }

  if (requestedRole === 'teacher') {
    if (existingRole === 'admin') {
      return 'admin';
    }
    if (existingRole === 'teacher') {
      return 'teacher';
    }
    if (!teacherAllowed) {
      throw createError(
        403,
        buildRoleNotAllowedMessage('teacher'),
        'role_not_allowed'
      );
    }
    return adminAllowed ? 'admin' : 'teacher';
  }

  if (requestedRole === 'student') {
    if (existingRole === 'admin') {
      return 'admin';
    }
    if (existingRole === 'teacher') {
      return 'teacher';
    }
    return 'student';
  }

  if (existingRole) {
    return existingRole;
  }
  if (adminAllowed) {
    return 'admin';
  }
  if (teacherAllowed) {
    return 'teacher';
  }
  return 'student';
}

function buildRealtimeUserPayload(user) {
  return {
    uid: user.firebaseUid,
    email: user.email || '',
    displayName: user.displayName || user.email || user.firebaseUid,
    photoURL: user.photoURL || '',
    role: user.role,
    firstSeen: user.firstSeen ? new Date(user.firstSeen).toISOString() : '',
    lastSeen: user.lastSeen ? new Date(user.lastSeen).toISOString() : '',
    updatedAt: new Date().toISOString()
  };
}

async function syncUserToRealtimeDatabase(user, previousRole = '') {
  if (!firebaseRealtimeDatabaseConfigured) {
    return;
  }

  const payload = buildRealtimeUserPayload(user);
  const updates = {
    [`users/${user.firebaseUid}`]: payload,
    [`roles/${user.role}/${user.firebaseUid}`]: payload
  };

  if (previousRole && previousRole !== user.role) {
    updates[`roles/${previousRole}/${user.firebaseUid}`] = null;
  }

  await admin.database().ref().update(updates);
}

async function syncUserFromToken(decodedToken, requestedRole = '', options = {}) {
  const email = normalizeEmail(decodedToken.email);
  const existingUser = await User.findOne({ firebaseUid: decodedToken.uid });
  const previousRole = existingUser && existingUser.role;
  const role = resolveRole(
    existingUser && existingUser.role,
    requestedRole,
    decodedToken,
    email,
    options
  );
  const now = new Date();

  const user = await User.findOneAndUpdate(
    { firebaseUid: decodedToken.uid },
    {
      $set: {
        email,
        displayName: getDisplayName(decodedToken, email),
        photoURL: sanitizeText(decodedToken.picture || decodedToken.photoURL || '', 500),
        role,
        lastSeen: now
      },
      $setOnInsert: {
        firebaseUid: decodedToken.uid,
        firstSeen: now
      }
    },
    { new: true, upsert: true }
  );

  try {
    await syncUserToRealtimeDatabase(user, previousRole);
  } catch (error) {
    console.error('Failed to sync user to Firebase Realtime Database:', error.message || error);
  }

  return user;
}

function toSessionUser(user) {
  return {
    uid: user.firebaseUid,
    firebaseUid: user.firebaseUid,
    id: getIdentityLabel(user),
    email: user.email || '',
    displayName: user.displayName || user.email || user.firebaseUid,
    photoURL: user.photoURL || '',
    role: user.role,
    firstSeen: user.firstSeen,
    lastSeen: user.lastSeen
  };
}

function getBearerToken(req) {
  const authHeader = String(req.headers.authorization || '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return authHeader.slice(7).trim();
}

function getDeviceSessionId(req) {
  return sanitizeText(req.headers[DEVICE_SESSION_HEADER], 200);
}

async function establishUserSession(user) {
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const updatedUser = await User.findOneAndUpdate(
    { firebaseUid: user.firebaseUid },
    {
      $set: {
        activeSessionId: sessionId,
        activeSessionOpenedAt: now
      }
    },
    { new: true }
  );

  return {
    sessionId,
    user: updatedUser || user
  };
}

async function clearUserSession(firebaseUid) {
  if (!firebaseUid) {
    return null;
  }

  return User.findOneAndUpdate(
    { firebaseUid },
    {
      $set: {
        activeSessionId: '',
        activeSessionOpenedAt: null
      }
    },
    { new: true }
  );
}

async function resolveVerifiedRequest(req) {
  if (!firebaseAdminConfigured) {
    throw createError(503, 'Firebase authentication is not configured on the server.', 'firebase_not_configured');
  }

  const token = getBearerToken(req);
  if (!token) {
    throw createError(401, 'Missing Firebase ID token.', 'missing_token');
  }

  const decodedToken = await admin.auth().verifyIdToken(token);
  const user = await syncUserFromToken(decodedToken);

  return { decodedToken, user };
}

async function verifyFirebaseRequest(req, res, next) {
  try {
    const { decodedToken, user } = await resolveVerifiedRequest(req);
    req.firebaseToken = decodedToken;
    req.appUser = user;
    req.user = toSessionUser(user);
    next();
  } catch (error) {
    if (error && error.code && String(error.code).startsWith('auth/')) {
      return next(createError(401, 'Invalid or expired Firebase ID token.', 'invalid_token'));
    }
    next(error);
  }
}

async function authenticateRequest(req, res, next) {
  try {
    const { decodedToken, user } = await resolveVerifiedRequest(req);
    const deviceSessionId = getDeviceSessionId(req);

    if (!deviceSessionId) {
      throw createError(401, 'Missing device session. Please sign in again.', 'missing_device_session');
    }

    if (!user.activeSessionId || user.activeSessionId !== deviceSessionId) {
      throw createError(401, SESSION_INVALIDATED_MESSAGE, 'session_invalidated');
    }

    req.deviceSessionId = deviceSessionId;
    req.firebaseToken = decodedToken;
    req.appUser = user;
    req.user = toSessionUser(user);
    next();
  } catch (error) {
    if (error && error.code && String(error.code).startsWith('auth/')) {
      return next(createError(401, 'Invalid or expired Firebase ID token.', 'invalid_token'));
    }
    next(error);
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(createError(401, 'Authentication is required.', 'unauthorized'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(createError(403, 'You do not have access to this resource.', 'forbidden'));
    }
    next();
  };
}

function requestBelongsToRole(req, ...roles) {
  return Boolean(req.user && roles.includes(req.user.role));
}

module.exports = {
  authenticateRequest,
  canSelfRegisterRole,
  clearUserSession,
  createError,
  DEVICE_SESSION_HEADER,
  ensureValidObjectId,
  establishUserSession,
  getIdentityLabel,
  getDeviceSessionId,
  normalizeEmail,
  requestBelongsToRole,
  requireRole,
  sanitizeText,
  SESSION_INVALIDATED_MESSAGE,
  syncUserFromToken,
  syncUserToRealtimeDatabase,
  toSessionUser,
  verifyFirebaseRequest
};
