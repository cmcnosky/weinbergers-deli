'use strict';
(() => {
  const form = document.querySelector('#account-login-form');
  const identifier = document.querySelector('#account-identifier');
  const password = document.querySelector('#account-password');
  const status = document.querySelector('#account-login-status');
  const toggle = document.querySelector('#password-toggle');
  const tokenKey = 'wd-staff-token';

  function destination(user) {
    const requested = new URLSearchParams(location.search).get('return');
    if (requested) {
      try {
        const target = new URL(requested, location.href);
        const page = target.pathname.split('/').pop();
        if (target.origin === location.origin && ['owner-studio.html', 'staff.html'].includes(page)) return page + target.search + target.hash;
      } catch {}
    }
    return user?.role === 'manager' ? 'owner-studio.html' : 'staff.html';
  }

  function message(value) {
    status.textContent = value;
  }

  toggle.addEventListener('click', () => {
    const shown = password.type === 'text';
    password.type = shown ? 'password' : 'text';
    toggle.textContent = shown ? 'Show' : 'Hide';
    toggle.setAttribute('aria-pressed', String(!shown));
    password.focus();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = event.submitter || form.querySelector('[type="submit"]');
    button.disabled = true;
    message('Logging in…');
    try {
      if (!Deli.ownerApiRoot) throw new Error('Online login is unavailable right now.');
      const response = await Deli.request('/auth/login', 'POST', {email: identifier.value.trim(), password: password.value});
      if (!response?.access_token || !response?.user) throw new Error('The login service returned an incomplete response.');
      sessionStorage.setItem(tokenKey, response.access_token);
      location.replace(destination(response.user));
    } catch (error) {
      message(error.message || 'Unable to log in. Check your information and try again.');
      password.select();
      button.disabled = false;
    }
  });

  async function resume() {
    const token = sessionStorage.getItem(tokenKey);
    if (!token || !Deli.ownerApiRoot) {
      identifier.focus();
      return;
    }
    try {
      const response = await Deli.request('/auth/me', 'GET', undefined, token);
      location.replace(destination(response.user || response));
    } catch {
      sessionStorage.removeItem(tokenKey);
      identifier.focus();
    }
  }
  resume();
})();
