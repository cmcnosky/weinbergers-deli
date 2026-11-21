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
  function page(products, limit, size = 24) {
    const pageSize = Math.max(1, Math.floor(Number(size) || 24));
    const visibleLimit = Math.max(pageSize, Math.floor(Number(limit) || pageSize));
    return {
      items: products.slice(0, visibleLimit),
      shown: Math.min(products.length, visibleLimit),
      remaining: Math.max(0, products.length - visibleLimit),
      next: Math.min(products.length, visibleLimit + pageSize)
    };
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
  const comparisonBreadLabels = Object.freeze({
    'baguette': 'Baguette',
    'black-bread': 'Black bread',
    'brioche-lobster-roll': 'Brioche lobster roll',
    'brioche-roll': 'Brioche roll',
    'cuban-roll': 'Cuban roll',
    'everything-roll': 'Everything roll',
    'hoagie': 'Hoagie',
    'hot-dog-bun': 'Hot dog bun',
    'italian-bread': 'Italian bread',
    'italian-herbed-focaccia': 'Italian herbed focaccia',
    'italian-roll': 'Italian roll',
    'jalapeno-cornbread': 'Jalapeño cornbread',
    'jalapeno-roll': 'Jalapeño roll',
    'kaiser-roll': 'Kaiser roll',
    'kummelweck-roll': 'Kummelweck roll',
    'marble-rye': 'Marble rye',
    'muffuletta-roll': 'Muffuletta roll',
    'multigrain-roll': 'Multigrain roll',
    'onion-roll': 'Onion roll',
    'pita': 'Pita',
    'poppy-seed-bun': 'Poppy-seed bun',
    'poppy-seed-hoagie': 'Poppy-seed hoagie',
    'pumpernickel-roll': 'Pumpernickel roll',
    'red-pepper-parmesan-ciabatta': 'Red-pepper Parmesan ciabatta',
    'russian-rye': 'Russian rye',
    'sesame-baguette': 'Sesame baguette',
    'sesame-hoagie': 'Sesame hoagie',
    'telera-roll': 'Telera roll',
    'texas-toast': 'Texas toast',
    'wheat-bread': 'Wheat bread',
    'wheat-roll': 'Wheat roll'
  });
  const comparisonCheeseLabels = Object.freeze({
    'american-cheese': 'American cheese',
    'bleu-cheese': 'Bleu cheese',
    'buffalo-mozzarella': 'Buffalo mozzarella',
    'burrata-mozzarella': 'Burrata mozzarella',
    'cheddar': 'Cheddar',
    'cheese-wiz': 'Cheese wiz',
    'cream-cheese': 'Cream cheese',
    'feta': 'Feta',
    'generic-cheese': 'Cheese; type not stated',
    'gouda': 'Gouda',
    'herbed-feta': 'Herbed feta',
    'horseradish-cream-cheese': 'Horseradish cream cheese',
    'mozzarella': 'Mozzarella',
    'muenster': 'Muenster',
    'pepper-jack': 'Pepper Jack',
    'provolone': 'Provolone',
    'romano': 'Romano',
    'smoked-gouda': 'Smoked Gouda',
    'swiss': 'Swiss',
    'white-american-cheese': 'White American cheese'
  });
  const comparisonBreadFallbacks = [
    ['red peppered parmesan ciabatta', 'Red-pepper Parmesan ciabatta'],
    ['italian herbed focaccia', 'Italian herbed focaccia'],
    ['herbed focaccia roll', 'Herbed focaccia roll'],
    ['italian focaccia', 'Italian focaccia'],
    ['jalapeno cornbread', 'Jalapeño cornbread'],
    ['poppy seed hoagie', 'Poppy-seed hoagie'],
    ['poppyseed hoagie', 'Poppy-seed hoagie'],
    ['pumpernickel roll', 'Pumpernickel roll'],
    ['pumpernickel', 'Pumpernickel'],
    ['muffuletta roll', 'Muffuletta roll'],
    ['multigrain roll', 'Multigrain roll'],
    ['multigrain', 'Multigrain'],
    ['marble rye', 'Marble rye'],
    ['russian rye', 'Russian rye'],
    ['rye', 'Rye'],
    ['onion roll', 'Onion roll'],
    ['wheat roll', 'Wheat roll'],
    ['wheat bread', 'Wheat bread'],
    ['whole wheat', 'Wheat bread'],
    ['wheat', 'Wheat bread'],
    ['sesame hoagie', 'Sesame hoagie'],
    ['sesame baguette', 'Sesame baguette'],
    ['cuban roll', 'Cuban roll'],
    ['brioche roll', 'Brioche roll'],
    ['italian bread', 'Italian bread'],
    ['texas toast', 'Texas toast'],
    ['black bread', 'Black bread'],
    ['hot dog bun', 'Hot dog bun'],
    ['plain bun', 'Plain bun'],
    ['poppy seed bun', 'Poppy-seed bun'],
    ['poppyseed bun', 'Poppy-seed bun'],
    ['kaiser', 'Kaiser roll'],
    ['baguette', 'Baguette'],
    ['hoagie', 'Hoagie'],
    ['pita', 'Pita']
  ];
  const comparisonCheeseFallbacks = [
    ['horseradish cream cheese', 'Horseradish cream cheese'],
    ['white american cheese', 'White American cheese'],
    ['buffalo mozzarella', 'Buffalo mozzarella'],
    ['burrata mozzarella', 'Burrata mozzarella'],
    ['american cheese', 'American cheese'],
    ['pepper jack', 'Pepper Jack'],
    ['cream cheese', 'Cream cheese'],
    ['bleu cheese', 'Bleu cheese'],
    ['muenster', 'Muenster'],
    ['provolone', 'Provolone'],
    ['mozzarella', 'Mozzarella'],
    ['cheez wiz', 'Cheese wiz'],
    ['cheese wiz', 'Cheese wiz'],
    ['chez wiz', 'Cheese wiz'],
    ['cheddar', 'Cheddar'],
    ['smoked gouda', 'Smoked Gouda'],
    ['gouda', 'Gouda'],
    ['romano', 'Romano'],
    ['swiss', 'Swiss'],
    ['feta', 'Feta'],
    ['cheese', 'Cheese; type not stated']
  ];
  function readableIngredientName(option, ingredientId) {
    const optionName = String(option?.name || '').trim();
    const cleaned = optionName.replace(/^(?:add|without|bread:)\s+/i, '').trim();
    if (cleaned) return cleaned;
    const words = String(ingredientId || '').replace(/[-_]+/g, ' ').trim();
    return words ? words[0].toUpperCase() + words.slice(1) : '';
  }
  function listedIngredientRecords(product) {
    const ingredientIds = Array.isArray(product?.description_ingredient_ids) ? product.description_ingredient_ids : [];
    const listed = new Set(ingredientIds), records = new Map();
    for (const group of product?.option_groups || []) {
      for (const option of group.options || []) {
        const id = option?.ingredient_id;
        if (!id || !listed.has(id) || records.has(id)) continue;
        records.set(id, {
          id,
          kind: option.ingredient_kind || (comparisonBreadLabels[id] ? 'bread' : comparisonCheeseLabels[id] ? 'cheese' : ''),
          label: comparisonBreadLabels[id] || comparisonCheeseLabels[id] || readableIngredientName(option, id)
        });
      }
    }
    return ingredientIds.map(id => records.get(id) || {
      id,
      kind: comparisonBreadLabels[id] ? 'bread' : comparisonCheeseLabels[id] ? 'cheese' : '',
      label: comparisonBreadLabels[id] || comparisonCheeseLabels[id] || readableIngredientName(null, id)
    });
  }
  const comparisonIngredientAliases = Object.freeze({
    'creamy-coleslaw': ['creamy coleslaw', 'coleslaw', 'slaw'],
    'dill-pickle': ['dill pickle', 'kosher dill', 'dill planks', 'pickles'],
    'generic-cheese': ['cheese'],
    'salt-and-pepper': ['salt and pepper'],
    'turkey-pastrami': ['turkey pastrami']
  });
  function hasNormalizedPhrase(description, term) {
    const phrase = normalize(term);if (!description || !phrase) return false;
    const padded = ` ${description} `;
    if (padded.includes(` ${phrase} `)) return true;
    const plural = phrase.endsWith('s') ? phrase.slice(0, -1) : phrase + 's';
    return plural && padded.includes(` ${plural} `);
  }
  function recordAppearsInDescription(record, description) {
    const aliases = comparisonIngredientAliases[record.id] || [record.label, record.id];
    return aliases.some(alias => hasNormalizedPhrase(description, alias));
  }
  function currentListedIngredientRecords(product) {
    const description = normalize(product?.description);
    return listedIngredientRecords(product).filter(record => recordAppearsInDescription(record, description));
  }
  function statedComparisonValues(product, kind, labels, fallbacks) {
    const description = normalize(product?.description);
    const found = [], structured = currentListedIngredientRecords(product)
      .filter(record => record.kind === kind || labels[record.id])
      .map(record => [record.label, labels[record.id] || record.label]);
    const labelCandidates = Object.values(labels).map(label => [label, label]);
    for (const [term, label] of [...fallbacks, ...structured, ...labelCandidates]) {
      const normalizedTerm = normalize(term);
      if (normalizedTerm === 'pita' && description.includes('pita chips')) continue;
      if (normalizedTerm === 'jalapeno cornbread' && description.includes('jalapeno cornbread stuffing')) continue;
      if (!hasNormalizedPhrase(description, term)) continue;
      if (label === 'Cheese; type not stated' && found.length) continue;
      const normalizedLabel = normalize(label);
      if (!found.some(value => normalize(value).includes(normalizedLabel) || normalizedLabel.includes(normalize(value)))) found.push(label);
    }
    return found;
  }
  function distinctiveComparisonIngredients(product, selected) {
    const chosen = Array.isArray(selected) ? selected.filter(Boolean) : [];
    if (chosen.length < 2) return 'Add another item to reveal description highlights';
    const frequency = new Map();
    for (const choice of chosen) {
      const ids = new Set(currentListedIngredientRecords(choice)
        .filter(record => record.kind !== 'bread' && record.kind !== 'cheese')
        .map(record => record.id));
      for (const id of ids) frequency.set(id, (frequency.get(id) || 0) + 1);
    }
    const distinctive = currentListedIngredientRecords(product).filter(record =>
      record.kind !== 'bread' && record.kind !== 'cheese' && frequency.get(record.id) < chosen.length
    );
    if (!distinctive.length) return 'No additional ingredient wording stands out in this description';
    const visible = distinctive.slice(0, 7).map(record => record.label);
    const remaining = distinctive.length - visible.length;
    return visible.join(', ') + (remaining ? `, plus ${remaining} more listed in the description` : '');
  }
  function comparisonPriceDifference(product, selected) {
    const chosen = Array.isArray(selected) ? selected : [];
    const listedPrice = item => Number.isFinite(item?.base_price_cents) && item?.price_status !== 'unknown' && item?.requires_price_approval !== true;
    const price = listedPrice(product) ? product.base_price_cents : null;
    const comparable = chosen.filter(listedPrice).map(item => item.base_price_cents);
    if (price == null) return 'No listed base price to compare';
    if (comparable.length < 2) return 'Add another listed base price to compare';
    const minimum = Math.min(...comparable), delta = price - minimum;
    if (delta === 0) return comparable.filter(value => value === minimum).length > 1 ? 'Tied for lowest listed base' : 'Lowest listed base';
    return `+$${(delta / 100).toFixed(2)} above lowest listed base`;
  }
  function comparisonFacts(product, selected) {
    const fallback = 'Not stated in the current description';
    const breads = statedComparisonValues(product, 'bread', comparisonBreadLabels, comparisonBreadFallbacks);
    const cheeses = statedComparisonValues(product, 'cheese', comparisonCheeseLabels, comparisonCheeseFallbacks);
    return {
      bread: breads.join(', ') || fallback,
      cheese: cheeses.join(', ') || fallback,
      distinctive: distinctiveComparisonIngredients(product, selected),
      build: String(product?.description || '').trim() || 'No current description is listed. Ask the deli for details.',
      priceDifference: comparisonPriceDifference(product, selected)
    };
  }
  const api = {normalize, terms, queryTerms, queryMatches, matches, sort, page, readURLState, publicURL, comparisonFacts, comparisonPriceDifference};
  if (typeof module !== 'undefined') module.exports = api;
  else root.DeliDiscovery = api;
})(typeof window !== 'undefined' ? window : globalThis);
