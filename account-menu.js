'use strict';
(() => {
  if (document.querySelector('.account-menu')) return;
  const root = String(window.WEINBERGERS_RUNTIME?.ownerApiBaseUrl || '').trim().replace(/\/$/, '');
  const token = sessionStorage.getItem('wd-staff-token') || '';
  const host = document.createElement('nav');
  host.className = 'account-menu';
  host.setAttribute('aria-label', 'Site and account');
  host.innerHTML = `<button class="account-menu__toggle" type="button" aria-expanded="false" aria-controls="account-menu-panel"><span class="account-menu__icon" aria-hidden="true"></span><span class="account-menu__label">Menu</span></button><div class="account-menu__panel" id="account-menu-panel" hidden><strong class="account-menu__heading">Weinberger’s Deli</strong><a href="index.html">Home</a><a href="menu.html">Menu</a><a href="visit.html">Visit</a><a data-account-login href="login.html">Log in</a></div>`;
  document.body.append(host);
  const toggle = host.querySelector('.account-menu__toggle');
  const panel = host.querySelector('.account-menu__panel');
  const setOpen = open => {
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  };
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  document.addEventListener('click', event => { if (!host.contains(event.target)) setOpen(false); });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || panel.hidden) return;
    setOpen(false);
    toggle.focus();
  });

  async function account() {
    if (!root || !token) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(root + '/auth/me', {
        headers: {Accept: 'application/json', Authorization: 'Bearer ' + token},
        credentials: 'omit', cache: 'no-store', signal: controller.signal
      });
      if (!response.ok) {
        if (response.status === 401) sessionStorage.removeItem('wd-staff-token');
        return;
      }
      const payload = await response.json();
      const user = payload.user || payload;
      const login = host.querySelector('[data-account-login]');
      login.remove();
      const identity = document.createElement('p');
      identity.className = 'account-menu__account';
      identity.textContent = user.email || 'Signed in';
      panel.querySelector('.account-menu__heading').insertAdjacentElement('afterend', identity);
      if (user.role === 'manager') panel.insertAdjacentHTML('beforeend', '<a href="owner-studio.html">Site Studio</a>');
      panel.insertAdjacentHTML('beforeend', '<a href="staff.html">Operations</a><button type="button" data-account-logout>Sign out</button>');
      panel.querySelector('[data-account-logout]').addEventListener('click', async () => {
        try {
          await fetch(root + '/auth/logout', {method: 'POST', headers: {Accept: 'application/json', Authorization: 'Bearer ' + token}, credentials: 'omit'});
        } catch {}
        sessionStorage.removeItem('wd-staff-token');
        location.assign('index.html');
      });
    } catch {
      // The normal public links and Log in option remain usable while offline.
    } finally {
      clearTimeout(timer);
    }
  }
  account();
})();
