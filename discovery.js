'use strict';
// Pure catalogue operations shared by the browser and the verification script.
(function (root) {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const terms = value => normalize(value).split(',').map(x => x.trim()).filter(Boolean);
  function matches(product, filters) {
    const text = normalize(product.name + ' ' + product.description);
    return terms(filters.include).every(term => text.includes(term))
      && terms(filters.exclude).every(term => !text.includes(term))
      && (!filters.max || product.base_price_cents != null && product.base_price_cents <= Number(filters.max));
  }
  function sort(products, mode, query) {
    return [...products].sort((a, b) => {
      if (mode === 'price') {
        const aPrice=a.base_price_cents==null?Number.POSITIVE_INFINITY:a.base_price_cents,bPrice=b.base_price_cents==null?Number.POSITIVE_INFINITY:b.base_price_cents;
        return aPrice-bPrice||a.name.localeCompare(b.name);
      }
      if (mode === 'name') return a.name.localeCompare(b.name);
      if (query) {
        const q = normalize(query), rank = p => normalize(p.name) === q ? 0 : normalize(p.name).startsWith(q) ? 1 : normalize(p.name).includes(q) ? 2 : 3;
        return rank(a) - rank(b);
      }
      return 0;
    });
  }
  const api = {normalize, terms, matches, sort};
  if (typeof module !== 'undefined') module.exports = api;
  else root.DeliDiscovery = api;
})(typeof window !== 'undefined' ? window : globalThis);
