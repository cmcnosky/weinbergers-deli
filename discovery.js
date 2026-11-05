'use strict';
// Pure catalogue operations shared by the browser and the verification script.
(function (root) {
  const normalize = value => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  const terms = value => String(value || '').split(',').map(normalize).filter(Boolean);
  const queryTerms = value => normalize(value).split(' ').filter(Boolean);
  function queryMatches(product, query) {
    const text = normalize(product.name + ' ' + product.category + ' ' + product.description);
    return queryTerms(query).every(term => text.includes(term));
  }
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
        const q = normalize(query),tokens=queryTerms(query),rank = p => {
          const name=normalize(p.name);
          return name===q?0:name.startsWith(q)?1:tokens.every(token=>name.includes(token))?2:3;
        };
        return rank(a) - rank(b);
      }
      return 0;
    });
  }
  const validSort = value => ['menu','price','name'].includes(value) ? value : 'menu';
  function readURLState(search) {
    const params = new URLSearchParams(search || '');
    return {
      q: params.get('q') || '',
      include: params.get('include') || '',
      exclude: params.get('exclude') || '',
      max: params.get('max') || '',
      category: params.get('category') || 'All',
      compare: (params.get('compare') || '').split(',').filter(Boolean),
      sort: validSort(params.get('sort')),
      saved: params.get('saved') === '1',
      item: params.get('item') || ''
    };
  }
  function publicURL(origin, pathname, state = {}) {
    const url = new URL(pathname, origin);
    const values = {
      q: state.q,
      include: state.include,
      exclude: state.exclude,
      max: state.max,
      category: state.category && state.category !== 'All' ? state.category : '',
      compare: Array.isArray(state.compare) ? state.compare.filter(Boolean).slice(0, 3).join(',') : '',
      sort: validSort(state.sort) === 'menu' ? '' : validSort(state.sort),
      saved: state.saved ? '1' : '',
      item: state.item
    };
    for (const [key, value] of Object.entries(values)) if (value) url.searchParams.set(key, value);
    return url.href;
  }
  const api = {normalize, terms, queryTerms, queryMatches, matches, sort, readURLState, publicURL};
  if (typeof module !== 'undefined') module.exports = api;
  else root.DeliDiscovery = api;
})(typeof window !== 'undefined' ? window : globalThis);
