'use strict';

window.Deli = (() => {
  const configuredRoot = String(window.WEINBERGERS_RUNTIME?.apiBaseUrl || '').trim().replace(/\/$/, '');
  const sharedReviewOrigin = /(^|\.)github\.io$/i.test(String(window.location?.hostname || ''));
  let bundledMenu;
  const staticMenu = () => bundledMenu || (bundledMenu = {
    restaurant: {name: 'Weinberger’s Deli', location: '601 S Main St, Grapevine, TX 76051'},
    ordering: {accepting_orders: false, checkout_enabled: false, prep_minutes: 20},
    categories: [...new Set((window.DEMO_MENU || []).map(item => item.category))],
    // The catalogue bundle deliberately shares repeated option-group objects to
    // reduce parse and memory cost. Customer code treats menu data as immutable,
    // so copy only each item shell to add local availability state and preserve
    // those shared groups instead of expanding the full catalogue through JSON.
    items: (window.DEMO_MENU || []).map(item => ({...item, sold_out: false})),
    source: 'bundled', revision: 'bundled-20261105'
  });
  let cachedMenu, menuETag = '', menuFlight;
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

  async function fetchAPI(path, {method = 'GET', body, token, raw = false, menuConditional = false} = {}) {
    if (!configuredRoot) fail('Online checkout is not connected yet.', 'service_not_configured');
    if (sharedReviewOrigin) fail('Ordering and staff access require the restaurant’s dedicated secure address.', 'dedicated_origin_required');
    const headers = {Accept: raw ? 'text/csv, application/json' : 'application/json'};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    if (menuConditional && menuETag && cachedMenu) headers['If-None-Match'] = menuETag;
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
    if (menuConditional && response.status === 304 && cachedMenu) return cachedMenu;
    if (!response.ok && raw) {
      let payload;
      try { payload = await response.json(); } catch { payload = null; }
      fail(payload?.error?.message || 'Unable to download this file.', payload?.error?.code, response.status);
    }
    const payload = await decode(response, raw);
    if (menuConditional) {
      menuETag = response.headers?.get?.('ETag') || '';
      cachedMenu = payload;
    }
    return payload;
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
    const ingredientChoices = new Map();
    const breadSubstitutions = new Set();
    for (const group of groups) {
      let groupCount = 0;
      for (const option of group.options) {
        const count = counts.get(option.id) || 0;
        if (count && option.ui_selectable === false) fail(option.name + ' is not available to select.', 'option_unavailable');
        if (count > 1 && group.display_type !== 'quantity-select') fail('The same option cannot be selected twice.', 'invalid_options');
        if (count < (option.selection_min || 0) || (option.selection_max != null && count > option.selection_max)) fail('Please review the quantity for ' + option.name + '.', 'options_required');
        groupCount += count;
        if (count && option.ingredient_id) {
          const prior = ingredientChoices.get(option.ingredient_id);
          const action = option.action || 'add';
          if (prior && prior.id !== option.id && (
            prior.action === 'omit' || action === 'omit' ||
            ['add', 'substitute'].includes(prior.action) && ['add', 'substitute'].includes(action)
          )) fail('Choose one instruction for ' + option.name.toLowerCase() + '.', 'conflicting_options');
          ingredientChoices.set(option.ingredient_id, {id: option.id, action});
        }
        if (count && option.ingredient_kind === 'bread' && option.action === 'substitute') breadSubstitutions.add(option.id);
      }
      if (groupCount < (group.selection_min || 0) || (group.selection_max != null && groupCount > group.selection_max)) fail('Please choose ' + group.name.toLowerCase() + '.', 'options_required');
      for (const exclusive of group.exclusive_option_sets || []) {
        const chosen = exclusive.filter(id => (counts.get(id) || 0) > 0);
        if (chosen.length > 1) {
          const names = chosen.map(id => group.options.find(option => option.id === id)?.name).filter(Boolean);
          fail('Choose either ' + names.join(' or ') + ', not both.', 'conflicting_options');
        }
      }
    }
    if (breadSubstitutions.size > 1) fail('Choose only one bread.', 'conflicting_options');
    for (const ingredient of product.unavailable_ingredient_ids || []) {
      const omission = allowed.find(option => option.ingredient_id === ingredient && option.action === 'omit');
      if (!omission || !counts.get(omission.id)) fail(omission ? 'This ingredient is sold out. Select “' + omission.name + '” to continue.' : 'An ingredient in this item is sold out.', 'ingredient_unavailable');
    }
    return true;
  }

  function selectionState(product, ids) {
    const selected = [];
    const options = (product.option_groups || []).flatMap(group => group.options || []);
    for (const id of ids || []) {
      const option = options.find(value => value.id === id);
      if (option) selected.push(option);
    }
    const selectedCounts = new Map();
    for (const id of ids || []) selectedCounts.set(id, (selectedCounts.get(id) || 0) + 1);
    const expandedSelectionPending = (product.option_groups || []).some(group => group.expanded_selection === true && group.expanded_selection_approved !== true && group.source_selection_max != null && (group.options || []).reduce((sum, option) => sum + (selectedCounts.get(option.id) || 0), 0) > group.source_selection_max);
    const pendingPrice = expandedSelectionPending || product.base_price_cents == null || product.price_status === 'unknown' || product.requires_price_approval === true || selected.some(option => option.price_delta_cents == null || option.price_status === 'unknown' || option.requires_price_approval === true);
    const pendingAvailability = expandedSelectionPending || product.availability_status === 'needs_confirmation' || product.requires_availability_approval === true || selected.some(option => option.availability_status === 'needs_confirmation' || option.requires_availability_approval === true || option.requires_confirmation === true);
    const unitCents = pendingPrice ? null : Number(product.base_price_cents || 0) + selected.reduce((sum, option) => sum + Number(option.price_delta_cents || 0), 0);
    return {pendingPrice, pendingAvailability, pricingResolved: !pendingPrice, expandedSelectionPending, requiresConfirmation: pendingPrice || pendingAvailability, unitCents, selected};
  }

  async function menu() {
    if (!configuredRoot) return staticMenu();
    if (menuFlight) return menuFlight;
    menuFlight = (async () => {
    try {
      await init();
      config = await fetchAPI('/config');
      mode = 'connected';
      if (config.menu_revision && cachedMenu?.revision === config.menu_revision) return cachedMenu;
      return await fetchAPI('/menu', {menuConditional: true});
    }
    catch (error) {
      mode = 'unavailable';
      initPromise = null;
      return {...staticMenu(), connection_error: error.message};
    }
    finally { menuFlight = null; }
    })();
    return menuFlight;
  }

  const request = (path, method = 'GET', body, token) => fetchAPI(path, {method, body, token});
  const download = (path, token) => fetchAPI(path, {token, raw: true});
  const uid = prefix => prefix + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  return {
    init, menu, request, download, validateOptions, selectionState, uid,
    get mode() { return mode; },
    get config() { return {...config}; },
    get connected() { return mode === 'connected'; },
    get checkoutAvailable() { return mode === 'connected' && config.checkout_enabled === true; },
    get apiRoot() { return configuredRoot; }
  };
})();
