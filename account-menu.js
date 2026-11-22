'use strict';
(() => {
  if (document.querySelector('.account-menu')) return;
  const root = String(window.WEINBERGERS_RUNTIME?.ownerApiBaseUrl || '').trim().replace(/\/$/, '');
  let token = '';
  try {
    token = sessionStorage.getItem('wd-staff-token') || '';
  } catch {
    // Navigation also runs in browsers that disallow session storage.
  }
  const host = document.createElement('div');
  host.setAttribute('role', 'navigation');
  host.className = 'account-menu';
  host.setAttribute('aria-label', 'Site and account');
  host.innerHTML = `<button class="account-menu__toggle" type="button" aria-label="More pages and account" aria-expanded="false" aria-controls="account-menu-panel"><span class="account-menu__icon" aria-hidden="true"></span><span class="account-menu__label">More</span></button><div class="account-menu__panel" id="account-menu-panel" hidden><strong class="account-menu__heading">Weinberger’s Deli</strong><a href="index.html">Home</a><div class="account-menu__destinations"><a href="menu.html">Menu &amp; order</a><a href="group.html">Group lunch</a><a href="catering.html">Catering</a><a href="visit.html">Visit &amp; hours</a><a href="story.html">Our story</a><a href="menu.html?saved=1">Saved</a><a href="menu.html#orders">Orders</a></div><a data-account-login href="login.html">Log in</a></div>`;
  const header = document.querySelector('.guest-header, .expansion-header, .menu-page .header, [data-cms-page="readable-menu"] .site-header');
  if (header) {
    header.append(host);
  } else {
    const masthead = document.querySelector('header, .demo-bar');
    if (masthead) masthead.after(host);
    else document.body.prepend(host);
  }

  function markCurrentPage() {
    const here = new URL(location.href);
    if (here.pathname.endsWith('/')) here.pathname += 'index.html';
    const links = Array.from(host.querySelectorAll('a[href]'));
    const exact = links.find(link => link.href === here.href);
    const currentLink = exact || links.find(link => {
      const url = new URL(link.href);
      return url.origin === here.origin && url.pathname === here.pathname && !url.search && !url.hash;
    });
    for (const link of links) {
      if (link === currentLink) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }

  function syncDestinations(content) {
    if (!Array.isArray(content?.navigation) || !window.DeliContentCore) return;
    const links = document.createDocumentFragment();
    for (const item of content.navigation) {
      if (!item.visible) continue;
      const href = window.DeliContentCore.safeURL(item.url, location.href);
      if (!href) continue;
      const link = document.createElement('a');
      link.href = href;
      link.textContent = item.label;
      links.append(link);
    }
    const destinations = host.querySelector('.account-menu__destinations');
    const current = Array.from(destinations.children);
    const next = Array.from(links.children);
    if (current.length === next.length && current.every((link, i) =>
      link.href === next[i].href && link.textContent === next[i].textContent
    )) return;
    const focusedHref = destinations.contains(document.activeElement) ? document.activeElement.href : null;
    destinations.replaceChildren(links);
    if (focusedHref) (next.find(link => link.href === focusedHref) || host.querySelector('.account-menu__toggle')).focus();
  }
  function syncHeader(content) {
    syncDestinations(content);
    if (!header?.matches('.guest-header, .expansion-header')) return;
    const destinations = new Set(Array.from(host.querySelectorAll('.account-menu__destinations a'), link => link.href));
    const navLinks = header.querySelectorAll(':scope > nav > a');
    for (const link of navLinks) {
      const menu = link.dataset.cmsNav === 'menu' || (!link.dataset.cmsNav && link === navLinks[0]);
      link.toggleAttribute('data-in-more', !menu && link.hasAttribute('href') && destinations.has(link.href));
    }
  }
  syncHeader(window.DeliContent?.current);
  window.addEventListener('weinbergers-content', event => syncHeader(event.detail));
  const toggle = host.querySelector('.account-menu__toggle');
  const panel = host.querySelector('.account-menu__panel');
  const setOpen = open => {
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    if (open) markCurrentPage();
  };
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  host.addEventListener('focusout', event => {
    if (event.relatedTarget && !host.contains(event.relatedTarget)) setOpen(false);
  });
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
