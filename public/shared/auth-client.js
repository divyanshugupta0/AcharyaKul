(function () {
  const DEVICE_SESSION_STORAGE_KEY = 'olms_device_session_id';
  const ACCESS_NOTICE_STORAGE_KEY = 'olms_auth_notice';
  const DEVICE_SESSION_HEADER = 'X-Device-Session';
  const ACCESS_LOSS_CODES = new Set([
    'invalid_token',
    'missing_device_session',
    'missing_token',
    'session_invalidated'
  ]);

  const state = {
    initialized: false,
    initializing: null,
    firebaseConfig: null,
    auth: null,
    currentUser: null,
    sessionUser: null,
    deviceSessionId: readStoredDeviceSessionId(),
    listeners: new Set(),
    storageBound: false
  };

  function sanitizeSessionId(value) {
    return String(value || '').trim().slice(0, 200);
  }

  function readStoredDeviceSessionId() {
    try {
      return sanitizeSessionId(window.localStorage.getItem(DEVICE_SESSION_STORAGE_KEY));
    } catch (error) {
      return '';
    }
  }

  function writeStoredDeviceSessionId(sessionId) {
    const normalized = sanitizeSessionId(sessionId);
    state.deviceSessionId = normalized;
    try {
      if (normalized) {
        window.localStorage.setItem(DEVICE_SESSION_STORAGE_KEY, normalized);
      } else {
        window.localStorage.removeItem(DEVICE_SESSION_STORAGE_KEY);
      }
    } catch (error) {
      // Ignore storage failures and keep in-memory state.
    }
  }

  function storeAccessNotice(message) {
    const text = String(message || '').trim();
    if (!text) {
      return;
    }
    try {
      window.sessionStorage.setItem(ACCESS_NOTICE_STORAGE_KEY, text);
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function consumeAccessNotice() {
    try {
      const message = String(window.sessionStorage.getItem(ACCESS_NOTICE_STORAGE_KEY) || '').trim();
      window.sessionStorage.removeItem(ACCESS_NOTICE_STORAGE_KEY);
      return message;
    } catch (error) {
      return '';
    }
  }

  function shouldAutoHandleAccessFailure() {
    const path = window.location.pathname || '';
    return ['/student', '/teacher', '/admin'].some((prefix) => path.startsWith(prefix));
  }

  function isAccessLossError(error) {
    const code = String(error && error.payload && error.payload.code ? error.payload.code : '').trim();
    return Number(error && error.status) === 401 && ACCESS_LOSS_CODES.has(code);
  }

  function notify() {
    state.listeners.forEach((listener) => {
      try {
        listener(state.currentUser, state.sessionUser);
      } catch (error) {
        console.error('Auth listener failed:', error);
      }
    });
  }

  async function clearLocalSession(options) {
    const opts = options || {};
    const shouldSignOutFirebase = opts.signOutFirebase !== false;

    writeStoredDeviceSessionId('');
    state.sessionUser = null;

    if (shouldSignOutFirebase && state.auth && state.auth.currentUser) {
      try {
        await state.auth.signOut();
      } catch (error) {
        console.error('Firebase sign-out failed:', error);
      }
    }

    notify();
  }

  async function handleAccessLoss(message, nextPath) {
    storeAccessNotice(
      message || 'This account was signed in on another device. Please sign in again.'
    );
    await clearLocalSession({ signOutFirebase: true });
    if (shouldAutoHandleAccessFailure()) {
      redirectToLogin(nextPath);
    }
  }

  function applySessionPayload(payload) {
    if (payload && payload.sessionId) {
      writeStoredDeviceSessionId(payload.sessionId);
    }
    state.sessionUser = payload && payload.user ? payload.user : null;
    notify();
    return state.sessionUser;
  }

  async function initialize() {
    if (state.initialized) {
      return state;
    }
    if (state.initializing) {
      return state.initializing;
    }

    state.initializing = (async () => {
      if (!window.firebase || !window.firebase.auth) {
        throw new Error('Firebase SDK is not loaded.');
      }

      const response = await fetch('/config/firebase');
      const payload = await response.json();

      if (!payload.enabled || !payload.config) {
        throw new Error('Firebase authentication is not configured yet.');
      }

      state.firebaseConfig = payload;

      if (!window.firebase.apps.length) {
        window.firebase.initializeApp(payload.config);
      }

      state.auth = window.firebase.auth();

      if (payload.emulatorHost) {
        state.auth.useEmulator(`http://${payload.emulatorHost}`);
      }

      await state.auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);

      await new Promise((resolve) => {
        const unsubscribe = state.auth.onAuthStateChanged((user) => {
          state.currentUser = user;
          resolve();
          unsubscribe();
        });
      });

      state.auth.onAuthStateChanged((user) => {
        state.currentUser = user;
        if (!user) {
          state.sessionUser = null;
          writeStoredDeviceSessionId('');
        }
        notify();
      });

      if (!state.storageBound) {
        window.addEventListener('storage', (event) => {
          if (event.key === DEVICE_SESSION_STORAGE_KEY) {
            state.deviceSessionId = sanitizeSessionId(event.newValue);
          }
        });
        state.storageBound = true;
      }

      state.initialized = true;
      return state;
    })();

    return state.initializing;
  }

  async function ensureInitialized() {
    await initialize();
    return state;
  }

  function portalForRole(role) {
    if (role === 'admin') {
      return '/admin/';
    }
    if (role === 'teacher') {
      return '/teacher/';
    }
    return '/student/';
  }

  function redirectToLogin(nextPath) {
    const next = nextPath || `${window.location.pathname}${window.location.search}`;
    const target = `/?next=${encodeURIComponent(next)}`;
    if (window.location.pathname !== '/' || !window.location.search.includes(next)) {
      window.location.replace(target);
    }
  }

  async function getIdToken(forceRefresh) {
    await ensureInitialized();
    const currentUser =
      state.currentUser ||
      (state.auth && state.auth.currentUser) ||
      (window.firebase && window.firebase.auth ? window.firebase.auth().currentUser : null);

    if (!currentUser) {
      return '';
    }

    if (!state.currentUser) {
      state.currentUser = currentUser;
    }

    return currentUser.getIdToken(Boolean(forceRefresh));
  }

  async function authHeaders(extraHeaders) {
    const token = await getIdToken();
    const headers = new Headers(extraHeaders || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (state.deviceSessionId) {
      headers.set(DEVICE_SESSION_HEADER, state.deviceSessionId);
    }
    return headers;
  }

  async function fetchJson(url, options) {
    const opts = { ...(options || {}) };
    opts.headers = await authHeaders(opts.headers);

    const response = await fetch(url, opts);
    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }

    if (!response.ok) {
      const message = data.error || `HTTP ${response.status}`;
      const err = new Error(message);
      err.status = response.status;
      err.payload = data;
      if (isAccessLossError(err) && shouldAutoHandleAccessFailure()) {
        await handleAccessLoss(message);
      }
      throw err;
    }

    return data;
  }

  async function postPublicJson(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }
    if (!response.ok) {
      const message = data.error || `HTTP ${response.status}`;
      const err = new Error(message);
      err.status = response.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  async function fetchSession() {
    const payload = await fetchJson('/me');
    state.sessionUser = payload.user || null;
    notify();
    return state.sessionUser;
  }

  async function openSession() {
    const payload = await fetchJson('/auth/session/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return applySessionPayload(payload);
  }

  async function completeRegistration(role) {
    const payload = await fetchJson('/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestedRole: role })
    });
    return applySessionPayload(payload);
  }

  async function completeFirstAdminRegistration() {
    const payload = await fetchJson('/auth/first-admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return applySessionPayload(payload);
  }

  async function signIn(email, password) {
    await ensureInitialized();
    try {
      await state.auth.signInWithEmailAndPassword(email, password);
      state.currentUser = state.auth.currentUser;
      return await openSession();
    } catch (error) {
      await clearLocalSession({ signOutFirebase: true });
      throw error;
    }
  }

  async function signUp(options) {
    await ensureInitialized();
    try {
      await postPublicJson('/auth/precheck', {
        email: options.email,
        requestedRole: options.role
      });
      const credential = await state.auth.createUserWithEmailAndPassword(
        options.email,
        options.password
      );
      if (credential.user && options.displayName) {
        await credential.user.updateProfile({ displayName: options.displayName });
      }
      if (state.auth.currentUser) {
        await state.auth.currentUser.reload();
        state.currentUser = state.auth.currentUser;
      }
      return completeRegistration(options.role);
    } catch (error) {
      await clearLocalSession({ signOutFirebase: true });
      throw error;
    }
  }

  async function signOut() {
    await ensureInitialized();

    const token = await getIdToken();
    const sessionId = state.deviceSessionId;
    if (token && sessionId) {
      try {
        await fetch('/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            [DEVICE_SESSION_HEADER]: sessionId,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        });
      } catch (error) {
        console.error('Server logout failed:', error);
      }
    }

    await clearLocalSession({ signOutFirebase: true });
  }

  async function ensurePortalAccess(allowedRoles) {
    await ensureInitialized();
    if (!state.currentUser) {
      redirectToLogin();
      return null;
    }
    const sessionUser = await fetchSession();
    if (!allowedRoles.includes(sessionUser.role)) {
      const target = portalForRole(sessionUser.role);
      if (window.location.pathname === target) {
        throw new Error('Your account role is not configured for this portal yet.');
      }
      window.location.replace(target);
      return null;
    }
    return sessionUser;
  }

  function subscribe(listener) {
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  }

  window.olmsAuth = {
    authHeaders,
    completeFirstAdminRegistration,
    completeRegistration,
    consumeAccessNotice,
    ensureInitialized,
    ensurePortalAccess,
    fetchJson,
    fetchSession,
    getCurrentFirebaseUser() {
      return state.currentUser;
    },
    getDeviceSessionId() {
      return state.deviceSessionId;
    },
    getFirebaseConfig() {
      return state.firebaseConfig;
    },
    getIdToken,
    getSessionUser() {
      return state.sessionUser;
    },
    handleAccessLoss,
    isAccessLossError,
    openSession,
    portalForRole,
    redirectToLogin,
    signIn,
    signOut,
    signUp,
    subscribe
  };
})();
