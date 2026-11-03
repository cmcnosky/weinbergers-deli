'use strict';

window.Deli = (() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const configuredRoot = String(window.WEINBERGERS_RUNTIME?.apiBaseUrl || '').trim().replace(/\/$/, '');
  const staticMenu = () => ({
    restaurant: {name: 'Weinberger’s Deli', location: '601 S Main St, Grapevine, TX 76051'},
    ordering: {accepting_orders: false, checkout_enabled: false, prep_minutes: 20},
    categories: [...new Set((window.DEMO_MENU || []).map(item => item.category))],
    items: clone(window.DEMO_MENU || []).map(item => ({...item, sold_out: false})),
    source: 'bundled'
  });
  let mode = configuredRoot ? 'connecting' : 'catalogue';
  let config = {
    payment_provider: 'unconfigured', checkout_enabled: false, ordering_approved: false,
    tax_configuration_approved: false, staff_login_enabled: false, integrations: {}
  };
  let initPromise;

  function fail(message, code, status) {
    const error = new Error(message);
    error.code = code || 'request_failed';
    error.status = status || 0;
    throw error;
  }

  function rootURL(path) {
    if (!configuredRoot) fail('Online checkout is not connected yet.', 'service_not_configured');
    return configuredRoot + (path.startsWith('/') ? path : '/' + path);
  }

  async function decode(response, raw = false) {
    if (raw) return response;
    if (response.status === 204) return {};
    let payload;
    try { payload = await response.json(); }
    catch { fail('The ordering service returned an unreadable response.', 'invalid_response', response.status); }
    if (!response.ok) fail(payload?.error?.message || 'Unable to complete this action.', payload?.error?.code, response.status);
    return payload;
  }

  async function fetchAPI(path, {method = 'GET', body, token, raw = false} = {}) {
    if (!configuredRoot) fail('Online checkout is not connected yet.', 'service_not_configured');
    const headers = {Accept: raw ? 'text/csv, application/json' : 'application/json'};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(rootURL(path), {
        method, headers, credentials: 'omit',
        cache: method === 'GET' ? 'no-store' : 'default',
        signal: controller.signal,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      fail('The ordering service is unavailable. Your bag is still saved.', 'network_unavailable');
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok && raw) {
      let payload;
      try { payload = await response.json(); } catch { payload = null; }
      fail(payload?.error?.message || 'Unable to download this file.', payload?.error?.code, response.status);
    }
    return decode(response, raw);
  }

  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (!configuredRoot) return {mode, config};
      try {
        config = await fetchAPI('/config');
        mode = 'connected';
      } catch (error) {
        mode = 'unavailable';
        initPromise = null;
        throw error;
      }
      return {mode, config};
    })();
    return initPromise;
  }

  function validateOptions(product, ids) {
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) fail('Please review your item choices.', 'invalid_options');
    const groups = product.option_groups || [];
    const allowed = groups.flatMap(group => group.options);
    const counts = new Map();
    if (ids.some(id => !allowed.some(option => option.id === id))) fail('An option is no longer available. Please review your choices.', 'invalid_options');
    ids.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
    for (const group of groups) {
      let groupCount = 0;
      for (const option of group.options) {
        const count = counts.get(option.id) || 0;
        if (count > 1 && group.display_type !== 'quantity-select') fail('The same option cannot be selected twice.', 'invalid_options');
        if (count < (option.selection_min || 0) || (option.selection_max != null && count > option.selection_max)) fail('Please review the quantity for ' + option.name + '.', 'options_required');
        groupCount += count;
      }
      if (groupCount < (group.selection_min || 0) || (group.selection_max != null && groupCount > group.selection_max)) fail('Please choose ' + group.name.toLowerCase() + '.', 'options_required');
    }
    return true;
  }

  async function menu() {
    if (!configuredRoot) return staticMenu();
    try { await init(); return await fetchAPI('/menu'); }
    catch (error) {
      mode = 'unavailable';
      initPromise = null;
      const fallback = staticMenu();
      fallback.connection_error = error.message;
      return fallback;
    }
  }

  const request = (path, method = 'GET', body, token) => fetchAPI(path, {method, body, token});
  const download = (path, token) => fetchAPI(path, {token, raw: true});
  const uid = prefix => prefix + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  return {
    init, menu, request, download, validateOptions, uid,
    get mode() { return mode; },
    get config() { return {...config}; },
    get connected() { return mode === 'connected'; },
    get checkoutAvailable() { return mode === 'connected' && config.checkout_enabled === true; },
    get apiRoot() { return configuredRoot; }
  };
})();
