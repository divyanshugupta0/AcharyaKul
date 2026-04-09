const fs = require('fs');
const path = require('path');

const admin = require('firebase-admin');

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePrivateKey(value) {
  return String(value || '').replace(/\\n/g, '\n').trim();
}

function parseTrustProxy(value) {
  if (value === undefined || value === '') {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : value;
}

function buildOriginMatcher(allowedOrigins) {
  if (!allowedOrigins.length) {
    return () => true;
  }
  return (origin) => !origin || allowedOrigins.includes(origin);
}

function readServiceAccountFromJson(value) {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return {
      projectId: parsed.project_id || parsed.projectId || '',
      clientEmail: parsed.client_email || parsed.clientEmail || '',
      privateKey: normalizePrivateKey(parsed.private_key || parsed.privateKey || '')
    };
  } catch (error) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
    return null;
  }
}

function readServiceAccountFromFile(filePath) {
  if (!filePath) {
    return null;
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);

  try {
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    return readServiceAccountFromJson(raw);
  } catch (error) {
    console.error(`Unable to read FIREBASE_SERVICE_ACCOUNT_PATH at ${resolvedPath}.`);
    return null;
  }
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInteger(process.env.PORT, 3000),
  mongoUri: process.env.MONGODB_URI,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  allowedOrigins: parseList(process.env.ALLOWED_ORIGINS),
  socketAllowedOrigins: parseList(process.env.SOCKET_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS),
  staticCacheMaxAgeSeconds: parseInteger(process.env.STATIC_CACHE_MAX_AGE_SECONDS, 3600),
  askRateLimitMax: parseInteger(process.env.ASK_RATE_LIMIT_MAX, 20),
  askRateLimitWindowMs: parseInteger(process.env.ASK_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  writeRateLimitMax: parseInteger(process.env.WRITE_RATE_LIMIT_MAX, 120),
  writeRateLimitWindowMs: parseInteger(process.env.WRITE_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'mistral',
  ollamaTimeoutMs: parseInteger(process.env.OLLAMA_TIMEOUT_MS, 600000),
  healthcheckRequireOllama: parseBoolean(process.env.HEALTHCHECK_REQUIRE_OLLAMA, false),
  nvidiaApiUrl: process.env.NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions',
  nvidiaApiKey: process.env.NVIDIA_API_KEY || '',
  nvidiaModel: process.env.NVIDIA_MODEL || 'mistralai/mistral-large-3-675b-instruct-2512',
  firebase: {
    emulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    databaseUrl: process.env.FIREBASE_DATABASE_URL || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || ''),
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
    publicConfig: {
      apiKey: process.env.FIREBASE_API_KEY || '',
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
      projectId: process.env.FIREBASE_PROJECT_ID || '',
      appId: process.env.FIREBASE_APP_ID || '',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
      measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
    },
    adminEmails: parseList(process.env.ADMIN_EMAILS).map((email) => String(email).trim().toLowerCase()),
    adminUids: parseList(process.env.ADMIN_UIDS),
    teacherEmails: parseList(process.env.TEACHER_EMAILS).map((email) => String(email).trim().toLowerCase()),
    teacherUids: parseList(process.env.TEACHER_UIDS)
  }
};

const firebaseServiceAccount =
  readServiceAccountFromFile(config.firebase.serviceAccountPath) ||
  readServiceAccountFromJson(config.firebase.serviceAccountJson) ||
  (config.firebase.projectId && config.firebase.clientEmail && config.firebase.privateKey
    ? {
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey
      }
    : null);

const firebaseAdminConfigured = Boolean(firebaseServiceAccount);
const firebaseRealtimeDatabaseConfigured = Boolean(
  firebaseAdminConfigured && config.firebase.databaseUrl
);
const firebasePublicConfigured = Boolean(
  config.firebase.publicConfig.apiKey &&
    config.firebase.publicConfig.authDomain &&
    config.firebase.publicConfig.projectId &&
    config.firebase.publicConfig.appId
);

if (config.firebase.emulatorHost) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = config.firebase.emulatorHost;
}

if (firebaseAdminConfigured && !admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(firebaseServiceAccount),
    ...(config.firebase.databaseUrl ? { databaseURL: config.firebase.databaseUrl } : {})
  });
}

module.exports = {
  admin,
  buildOriginMatcher,
  config,
  firebaseAdminConfigured,
  firebasePublicConfigured,
  firebaseRealtimeDatabaseConfigured,
  parseBoolean,
  parseInteger,
  parseList
};
