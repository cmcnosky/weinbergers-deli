'use strict';
(() => {
  const screen = document.querySelector('.phone-shell');
  const frame = screen?.querySelector('template');
  if (!frame) return;

  // Use one scrolling surface on phones. Create the interactive frame only
  // when the presentation has space for it, and keep its state on resize.
  const wide = window.matchMedia('(min-width: 840px)');
  function mountWhenVisible() {
    if (!wide.matches || screen.querySelector('iframe') || screen.closest('[data-cms-section-hidden]')) return;
    screen.append(frame.content.cloneNode(true));
    screen.dataset.interactive = 'true';
  }
  mountWhenVisible();
  wide.addEventListener('change', mountWhenVisible);
  window.addEventListener('weinbergers-content', mountWhenVisible);
})();
