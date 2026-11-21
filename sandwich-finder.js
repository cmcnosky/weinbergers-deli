'use strict';

(() => {
  const finder = document.querySelector('#sandwich-finder');
  if (!finder) return;

  const filling = finder.querySelector('[name="filling"]');
  const style = finder.querySelector('[name="style"]');
  const count = finder.querySelector('#finder-count');
  const results = finder.querySelector('#finder-results');
  const actions = finder.querySelector('#finder-actions');
  const pageSize = 3;

  // Match the listed recipe. Add-on groups can contain the entire pantry.
  const fillings = {
    pastrami: /\b(?:pastrami|corned beef)\b/i,
    beef: /\b(?:italian beef|roast beef)\b/i,
    'cold-cuts': /\b(?:mortadella|capicol{1,2}a|capocollo|prosciutto|sopp?ress?ata|salami)\b/i,
    pork: /\b(?:ham|roast(?:ed)? pork)\b/i,
    poultry: /\b(?:turkey|chicken)\b/i
  };
  const styles = {
    rye: /\brye\b/i,
    heat: /\b(?:habanero|jalape[nñ]os?|serranos?|sriracha|hot (?:peppers?|sauce|giardiniera)|chili oil|pepper jack|spicy)\b/i,
    pickles: /\b(?:pickles?|kosher dill planks|sauerkraut)\b/i,
    slaw: /\b(?:coleslaw|slaw)\b/i,
    pressed: /\bpressed\b/i,
    avocado: /\bavocados?\b/i
  };
  let catalog = null;
  let sandwichCategories = new Set();
  let offset = 0;
  let dirty = true;

  function matches(item) {
    const isSandwich = item.is_sandwich ?? sandwichCategories.has(item.category);
    if (!isSandwich || item.sold_out || item.availability_status === 'sold_out' ||
        item.unavailable_ingredient_ids?.length || item.id === 'custom-build-your-own' ||
        item.category === 'Build Your Own') return false;
    const text = [item.name, item.description].filter(Boolean).join(' ');
    if (filling.value === 'vegetarian' && item.vegetarian !== true) return false;
    if (fillings[filling.value] && !fillings[filling.value].test(text)) return false;
    if (style.value === 'pressed' && !/\bcuban (?:roll|bread)\b/i.test(text)) return false;
    return !styles[style.value] || styles[style.value].test(text);
  }

  function recipeDescription(item) {
    const text = item.description || '';
    const patterns = [fillings[filling.value], styles[style.value]].filter(Boolean);
    const description = document.createElement('p');
    if (!patterns.length) {
      description.textContent = text;
      return description;
    }
    const re = new RegExp(patterns.map(pattern => pattern.source).join('|'), 'gi');
    let start = 0;
    for (const match of text.matchAll(re)) {
      description.append(text.slice(start, match.index));
      const emphasis = document.createElement('strong');
      emphasis.textContent = match[0];
      description.append(emphasis);
      start = match.index + match[0].length;
    }
    description.append(text.slice(start));
    return description;
  }

  function resultCard(item) {
    const article = document.createElement('article');
    const row = document.createElement('div');
    row.className = 'finder-item-head';
    const image = document.createElement('div');
    image.innerHTML = menuImageMarkup(item, 'card', '');
    if (image.firstElementChild) row.append(image.firstElementChild);

    const title = document.createElement('h3');
    const open = document.createElement('button');
    open.type = 'button';
    open.dataset.product = item.id;
    open.textContent = item.name;
    title.append(open);
    const price = document.createElement('span');
    price.className = 'finder-price';
    price.textContent = itemPriceLabel(item);
    const titleAndPrice = document.createElement('div');
    titleAndPrice.append(title, price);
    row.append(titleAndPrice);
    article.append(row, recipeDescription(item));
    return article;
  }

  function action(label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  function changePage(next) {
    offset = next;
    storeChoices();
    render();
    count.focus({preventScroll:true});
    count.scrollIntoView({block:'nearest'});
  }

  function render() {
    if (!catalog || !finder.open) return;
    dirty = false;
    const list = catalog.filter(matches).sort((a,b) => Number(!!b.popular) - Number(!!a.popular));
    if (offset >= list.length) offset = 0;
    const shown = list.slice(offset, offset + pageSize);
    results.replaceChildren(...shown.map(resultCard));
    actions.replaceChildren();

    if (!shown.length) {
      count.textContent = 'No matching sandwiches right now.';
      if (filling.value || style.value) {
        actions.append(action('Clear choices', () => {
          filling.value = '';
          style.value = '';
          changeSelection();
          filling.focus();
        }));
      }
      return;
    }
    count.textContent = list.length === 1 ? '1 sandwich matches' :
      (offset + 1) + '–' + (offset + shown.length) + ' of ' + list.length + ' sandwiches';
    if (shown.length > 1) {
      const compare = document.createElement('a');
      compare.className = 'finder-compare';
      const target = new URL(location.href);
      target.search = new URLSearchParams({compare: shown.map(item => item.id).join(',')}).toString();
      target.hash = '';
      compare.href = target.href;
      compare.textContent = shown.length === 2 ? 'Compare these two' : 'Compare these three';
      actions.append(compare);
    }
    if (offset > 0) actions.append(action('Previous', () => changePage(offset - pageSize)));
    if (offset + pageSize < list.length) actions.append(action('Next sandwiches', () => changePage(offset + pageSize)));
  }

  function storeChoices() {
    const url = new URL(location.href);
    for (const field of [filling, style]) {
      if (field.value) url.searchParams.set(field.name, field.value);
      else url.searchParams.delete(field.name);
    }
    if (offset > 0) url.searchParams.set('finderPage', String(1 + offset / pageSize));
    else url.searchParams.delete('finderPage');
    url.hash = finder.id;
    window.history.replaceState(window.history.state, '', url);
  }

  function changeSelection() {
    offset = 0;
    dirty = true;
    storeChoices();
    render();
  }

  function readChoices() {
    const params = new URLSearchParams(location.search);
    for (const field of [filling,style]) {
      const requested = params.get(field.name);
      field.value = Array.from(field.options).some(option => option.value === requested) ? requested : '';
    }
    if (location.hash === '#' + finder.id) finder.open = true;
    const page = Number(params.get('finderPage'));
    offset = Number.isSafeInteger(page) && page > 1 ? (page - 1) * pageSize : 0;
    dirty = true;
    render();
  }

  count.tabIndex = -1;
  finder.addEventListener('change', changeSelection);
  finder.addEventListener('toggle', () => { if (finder.open && dirty) render(); });
  window.addEventListener('popstate', readChoices);
  window.addEventListener('hashchange', readChoices);
  readChoices();
  window.DeliSandwichFinder = {
    update(items) {
      catalog = items;
      sandwichCategories = new Set(items.filter(item => item.is_sandwich === true).map(item => item.category));
      for (const item of items) if (item.is_sandwich === false) sandwichCategories.delete(item.category);
      dirty = true;
      render();
    }
  };
})();
