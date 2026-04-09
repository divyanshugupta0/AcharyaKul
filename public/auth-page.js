(function () {
  const signinTab = document.getElementById('signinTab');
  const signupTab = document.getElementById('signupTab');
  const signinForm = document.getElementById('signinForm');
  const signupForm = document.getElementById('signupForm');
  const authStatus = document.getElementById('authStatus');

  function setStatus(message, type) {
    authStatus.textContent = message || '';
    authStatus.className = `auth-status${type ? ` ${type}` : ''}`;
  }

  function setMode(mode) {
    const signinActive = mode === 'signin';
    signinTab.classList.toggle('active', signinActive);
    signupTab.classList.toggle('active', !signinActive);
    signinForm.classList.toggle('auth-hidden', !signinActive);
    signupForm.classList.toggle('auth-hidden', signinActive);
    setStatus('');
  }

  function nextDestination(sessionUser) {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    if (!next) {
      return window.olmsAuth.portalForRole(sessionUser.role);
    }
    if (next.startsWith('/teacher') && sessionUser.role === 'teacher') {
      return next;
    }
    if (next.startsWith('/admin') && sessionUser.role === 'admin') {
      return next;
    }
    if (next.startsWith('/student') && sessionUser.role === 'student') {
      return next;
    }
    return window.olmsAuth.portalForRole(sessionUser.role);
  }

  async function finish(sessionUser) {
    setStatus('Redirecting to your portal...', 'success');
    window.location.replace(nextDestination(sessionUser));
  }

  signinTab.addEventListener('click', () => setMode('signin'));
  signupTab.addEventListener('click', () => setMode('signup'));

  signinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('Signing in...');
    try {
      const sessionUser = await window.olmsAuth.signIn(
        document.getElementById('signinEmail').value.trim(),
        document.getElementById('signinPassword').value
      );
      await finish(sessionUser);
    } catch (error) {
      setStatus(error.message || 'Unable to sign in.', 'error');
    }
  });

  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('Creating your account...');
    try {
      const sessionUser = await window.olmsAuth.signUp({
        displayName: document.getElementById('signupName').value.trim(),
        email: document.getElementById('signupEmail').value.trim(),
        password: document.getElementById('signupPassword').value,
        role: document.getElementById('signupRole').value
      });
      await finish(sessionUser);
    } catch (error) {
      setStatus(error.message || 'Unable to create the account.', 'error');
    }
  });

  window.olmsAuth
    .ensureInitialized()
    .then(async () => {
      const accessNotice = window.olmsAuth.consumeAccessNotice();
      if (accessNotice) {
        setStatus(accessNotice, 'error');
      }

      if (window.olmsAuth.getCurrentFirebaseUser()) {
        try {
          const sessionUser = await window.olmsAuth.fetchSession();
          await finish(sessionUser);
          return;
        } catch (error) {
          if (!window.olmsAuth.isAccessLossError(error)) {
            throw error;
          }
          const sessionUser = await window.olmsAuth.openSession();
          await finish(sessionUser);
        }
      }
    })
    .catch((error) => {
      setStatus(error.message || 'Firebase authentication is not configured yet.', 'error');
    });
})();
