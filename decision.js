'use strict';
(() => {
  // Preserve existing bookmarks into the proposal when the full terms are folded.
  function revealBookmark() {
    const target = document.getElementById(location.hash.slice(1));
    const disclosure = target?.closest('.decision-disclosure');
    if (disclosure && !disclosure.open) {
      disclosure.open = true;
      target.scrollIntoView();
    }
  }
  revealBookmark();
  window.addEventListener('hashchange', revealBookmark);

  const form = document.getElementById('fee-estimator');
  const fees = document.getElementById('annual-fees');
  const results = form.querySelector('.fee-results');
  const currency = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'});
  form.hidden = false;
  fees.addEventListener('input', () => {
    fees.removeAttribute('aria-invalid');
    results.replaceChildren();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const amount = /^\$?\s*(\d{1,12}|\d{1,3}(?:,\d{3}){1,3})(?:\.(\d{1,2}))?$/.exec(fees.value.trim());
    if (!amount) {
      fees.setAttribute('aria-invalid', 'true');
      results.textContent = 'Enter a total of zero or more dollars with up to two decimal places.';
      fees.focus();
      return;
    }
    const cents = Number(amount[1].replaceAll(',', '')) * 100 + Number((amount[2] || '').padEnd(2, '0'));
    // Round fractions of a cent down so the estimate never exceeds either cap.
    const year = Math.min(250000, Math.floor(cents / 2));
    const care = Math.min(14900, Math.floor(cents / 24));
    const firstYear = document.createElement('p');
    firstYear.textContent = `First year: ${currency.format(year / 100)} total.`;
    const optionalCare = document.createElement('p');
    optionalCare.textContent = `Optional care from month 13: ${currency.format(care / 100)} per month.`;
    results.replaceChildren(firstYear, optionalCare);
  });
})();
