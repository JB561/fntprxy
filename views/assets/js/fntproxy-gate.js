(() => {
  const gate = document.getElementById('fntproxy-gate');
  const form = document.getElementById('fntproxy-gate-form');
  const error = document.getElementById('fntproxy-gate-error');
  const buy = document.getElementById('fntproxy-buy');
  const note = document.getElementById('fntproxy-buy-note');
  const deviceStorageKey = 'fntproxy-device-id-v2';
  const activationStorageKey = 'fntproxy-activated-v2';
  const deviceId = (() => {
    try {
      let value = localStorage.getItem(deviceStorageKey);
      if (!value) {
        value = crypto.randomUUID();
        localStorage.setItem(deviceStorageKey, value);
      }
      return value;
    } catch {
      // The server cookie remains the fallback when storage is blocked.
      return '';
    }
  })();
  const deviceHeaders = deviceId ? { 'x-fntproxy-device': deviceId } : {};
  const activationRequest = (url, options = {}) => fetch(url, {
    ...options,
    credentials: 'include',
    cache: 'no-store',
    headers: { ...deviceHeaders, ...(options.headers || {}) },
  });
  const setGate = (open) => { gate.hidden = !open; if (open) document.getElementById('fntproxy-code').focus(); };
  // Never trust localStorage to unlock the site. The server must approve every load.
  setGate(false);
  activationRequest('/api/fntproxy/status').then((r) => r.json()).then((data) => {
    if (data.activated) {
      try { localStorage.setItem(activationStorageKey, 'true'); } catch {}
    } else {
      try { localStorage.removeItem(activationStorageKey); } catch {}
      setGate(true);
    }
  }).catch(() => {
    error.textContent = 'Activation service is temporarily unavailable. Please refresh once it is online.';
  });
  const validPasscodes = new Set(['38b1979ff0', '2552e37a29', '24ca29c574', 'cc60fc5d7b', '5cd19ea6ef', 'b8d05e0d05', 'fa97418cd6']);
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); error.textContent = '';
    const code = String(new FormData(form).get('code') || '').trim().toLowerCase();
    if (!validPasscodes.has(code)) { error.textContent = 'Invalid passcode.'; return; }
    try {
      const response = await activationRequest('/api/fntproxy/activate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { error.textContent = data.error || 'Unable to activate.'; return; }
      try { localStorage.setItem(activationStorageKey, 'true'); } catch {}
      setGate(false);
    } catch {
      error.textContent = 'Could not reach the activation server. Try again.';
    }
  });
  buy.addEventListener('click', () => { note.hidden = !note.hidden; });
})();

(() => {
  const about = document.getElementById('fntproxy-about');
  const settingsToggle = document.querySelector('.smenu > .white-text > a');
  const settingsParent = document.querySelector('.smenu');
  const settingsPanel = document.querySelector('.dropdown-settings');
  const closeSettings = () => {
    settingsParent?.classList.remove('is-open');
    settingsToggle?.setAttribute('aria-expanded', 'false');
    settingsPanel?.classList.remove('open', 'active', 'show');
  };

  document.addEventListener('click', (event) => {
    const target = event.target.closest('a,button');
    if (!target) return;

    if (target === settingsToggle) {
      event.preventDefault();
      settingsParent.classList.toggle('is-open');
      target.setAttribute('aria-expanded', String(settingsParent.classList.contains('is-open')));
      return;
    }

    if (settingsPanel && !settingsPanel.contains(target) && !settingsParent.contains(target)) {
      closeSettings();
    }

    if (target.matches('.close-settings-btn')) {
      event.preventDefault();
      closeSettings();
      return;
    }

    if (target.matches('a[href="#fntproxy-about"]') || target.textContent.trim().toLowerCase() === 'about me') {
      event.preventDefault();
      if (about) about.hidden = false;
    }

    if (target.matches('.fntproxy-close')) {
      if (about) about.hidden = true;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSettings();
      if (about) about.hidden = true;
    }
  });
})();
