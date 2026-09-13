// Food › Today reads saved recipes, accepted nutrition and the canonical shopping/day
// summaries. These fixtures execute the real readers without an account or browser storage.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { extract } = require('./harness.cjs');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const nutritionSource = fs.readFileSync(path.join(__dirname, '../js/nutrition.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function nutrition(name) {
  const start = nutritionSource.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' must be an actual nutrition reader');
  const end = nutritionSource.indexOf('\nfunction ', start + 1);
  return nutritionSource.slice(start, end < 0 ? undefined : end);
}
const recipe = (id, extra = {}) => ({ id, name: 'Recipe ' + id, category: 'dinner',
  servings: 4, cookTime: '20 min', calories: 600, protein: 35, carbs: 55, fat: 20,
  ingredients: [{ name: 'Rice', amount: 400, unit: 'g' }], steps: ['Cook the rice.'], ...extra });
const option = (id, label, calories, extra = {}) => ({ id, label, calories,
  protein: 40, carbs: 50, fat: 18, ingredient: { name: label, amount: 400, unit: 'g' },
  prep: 'Prepare ' + label, cook: 'Cook ' + label, cookTime: 7, ...extra });
const entry = (id, calories, extra = {}) => ({ id, date: '2026-09-13', name: 'Logged ' + id,
  meal: 'lunch', createdAt: 1, nutritionStatus: calories == null ? 'unknown' : 'known',
  nutrition: { calories, protein: null, carbs: null, fat: null }, ...extra });

function context(recipes = []) {
  const calls = [], writes = [];
  const c = vm.createContext({ console, Date, Math, JSON, Set, Map, Object, Array, String,
    Number, parseFloat, parseInt, isNaN, encodeURIComponent, decodeURIComponent,
    kitRecipes: recipes, kitState: { search: 'keep Recipes search', cat: 'lunch', filter: 'favourites' },
    foodState: { tab: 'today', todayView: 'overview' },
    foodOverviewState: { search: '', category: 'all', maxMinutes: '', maxCalories: '', compareId: null },
    KIT_CATS: [['all', 'All'], ['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['dessert', 'Dessert']],
    KIT_CAT_EMOJI: { breakfast: '🍳', lunch: '🥪', dinner: '🍽️', dessert: '🍰' },
    nutLog: { entries: {}, legacyTotals: {} },
    getLocalDate: () => '2026-09-13', nutTarget: () => 2400,
    kitShopComputePlan: () => ({ pantryId: 'home', pantryName: 'Home', normal: {}, pantryNeeds: [], stocked: [], buy: {} }),
    kitShopRowChecked: row => !!row.checked,
    foodShowing: section => section === 'today',
    document: { getElementById: () => null },
    cardHeader: (icon, title) => '<header>' + title + '</header>',
    kitEsc: value => String(value ?? ''), escText: value => String(value ?? ''), escAttr: value => String(value ?? ''),
    foodGo: (...args) => calls.push(['foodGo', ...args]),
    kitOpenDetail: (...args) => calls.push(['detail', ...args]),
    kitStartCooking: (...args) => calls.push(['cook', ...args]),
    kitCloseDetail: (...args) => calls.push(['closeDetail', ...args]),
    nutLogSelected: () => { throw new Error('browsing must never log food'); },
    kitSave: () => { throw new Error('browsing must never save recipes'); },
    lsSave: (...args) => writes.push(['lsSave', ...args]),
    lsSaveTS: (...args) => writes.push(['lsSaveTS', ...args]),
    localStorage: { getItem: () => null, setItem: (...args) => writes.push(['setItem', ...args]),
      removeItem: (...args) => writes.push(['removeItem', ...args]) }
  });
  const names = ['kitOptionsOf', 'kitFindOption', 'kitDefaultOption', 'kitOptionsProblem',
    'kitNum', 'kitIngCopy', 'kitTrim', 'kitIsProteinStep', 'kitStepText', 'kitStepTimer',
    'kitResolve', 'kitShopCountLeft', 'kitCardEmoji', 'kitEsc'];
  const overviewNames = [...source.matchAll(/^function (foodOverview\w*|foodRenderOverview)\(/gm)].map(m => m[1]);
  vm.runInContext(names.concat(overviewNames).map(extract).join('\n') + '\n' +
    ['nutNum', 'nutRound', 'nutEntries', 'nutDaySummary', 'nutRecipeState'].map(nutrition).join('\n'), c);
  c.calls = calls;
  c.writes = writes;
  return c;
}
const shownIds = c => plain(c.foodOverviewModel().shown).map(row => row.id);

// A small DOM boundary: controls are real identities in this fixture and replacing the
// overview root recreates them. That makes an incoming-data refresh's focus promise testable.
function attachOverviewDOM(c) {
  const nodes = new Map(), categories = [];
  let rebuilds = 0;
  const node = id => ({ id, value: '', innerHTML: '', attributes: {}, dataset: {},
    classList: { toggle() {} }, setAttribute(key, value) { this.attributes[key] = value; } });
  const root = node('food-overview');
  root.querySelectorAll = selector => selector === '[data-fo-category]' ? categories : [];
  Object.defineProperty(root, 'innerHTML', { get: () => '', set(html) {
    rebuilds++;
    for (const [, id] of html.matchAll(/id="([^"]+)"/g)) nodes.set(id, node(id));
    categories.length = 0;
    for (const [, category] of html.matchAll(/data-fo-category="([^"]+)"/g)) {
      const button = node('category-' + category); button.dataset.foCategory = category;
      categories.push(button);
    }
  } });
  nodes.set(root.id, root);
  c.document = { getElementById: id => nodes.get(id) || null, activeElement: null };
  return { nodes, categories, rebuilds: () => rebuilds };
}

test('cooking duration accepts exact minutes and unambiguous hour/minute durations', () => {
  const c = context();
  [[20, 20], ['20', 20], ['20 min', 20], ['20 minutes', 20], ['1 h 30 min', 90],
    ['1 hour', 60], ['1.5 hours', 90]].forEach(([value, minutes]) =>
    assert.equal(c.foodOverviewMinutes(value), minutes, String(value)));
});

test('missing and ambiguous cooking durations never become a quick recipe', () => {
  const c = context();
  [null, undefined, '', '   ', '20–30 min', '20-30 min', 'about 20 minutes',
    'overnight', '20 min plus resting', '1:30', 'quick', -5, 'Infinity'].forEach(value =>
    assert.equal(c.foodOverviewMinutes(value), null, String(value)));
});

test('Food overview state is declared before init and defaults to all categories', () => {
  const declaration = source.match(/const foodOverviewState=([^;]+);/);
  assert.ok(declaration, 'filters have one in-memory state');
  const boot = source.indexOf('// ── Boot');
  assert.ok(boot > source.indexOf(declaration[0]), 'hash boot cannot hit a TDZ');
  const c = vm.createContext({});
  vm.runInContext(declaration[0] + ';globalThis.state=foodOverviewState;', c);
  assert.deepEqual(plain(c.state), { search: '', category: 'all', maxMinutes: '', maxCalories: '', compareId: null });
});

test('filters and comparison have no direct persistence or food-log write path', () => {
  ['foodOverviewMinutes', 'foodOverviewRecipe', 'foodOverviewModel',
    'foodOverviewSetFilter', 'foodOverviewReset', 'foodOverviewCompare',
    'foodRenderOverview'].forEach(name => {
    assert.doesNotMatch(extract(name), /\b(?:lsSave|lsSaveTS|nutSaveLog|nutLogSelected|kitSave)\s*\(|localStorage\s*\.\s*(?:setItem|removeItem|clear)\s*\(/,
      name + ' is a read-only overview operation');
  });
});

test('browsing filters never borrows or overwrites Recipes’ own search and selections', () => {
  const c = context([recipe('a'), recipe('b', { category: 'lunch' })]);
  const before = plain(c.kitState), saved = plain(c.kitRecipes);
  c.foodOverviewSetFilter('search', 'Recipe');
  c.foodOverviewSetFilter('category', 'dinner');
  c.foodOverviewSetFilter('maxMinutes', '30');
  c.foodOverviewSetFilter('maxCalories', '700');
  c.foodOverviewModel();
  c.foodOverviewReset();
  assert.deepEqual(plain(c.kitState), before);
  assert.deepEqual(plain(c.kitRecipes), saved);
  assert.deepEqual(c.writes, []);
});

test('calorie comparison never logs food, rescales servings or changes recipe data', () => {
  const c = context([recipe('a', { servings: 4, calories: 620 })]);
  const before = plain(c.kitRecipes);
  c.foodOverviewCompare('a');
  const model = c.foodOverviewModel();
  assert.equal(c.foodOverviewState.compareId, 'a');
  assert.ok(model.comparison, 'the chosen recipe is available for comparison');
  assert.deepEqual(plain(c.kitRecipes), before);
  assert.deepEqual(plain(c.nutLog.entries), {});
  assert.deepEqual(c.calls, []);
  assert.deepEqual(c.writes, []);
});

test('recipe search matches names case-insensitively and composes with category', () => {
  const c = context([
    recipe('lunch', { name: 'Lemon rice', category: 'lunch' }),
    recipe('dinner', { name: 'LEMON pasta', category: 'dinner' }),
    recipe('ingredient', { name: 'Bean bowl', ingredients: [{ name: 'Lemon', amount: 1, unit: '' }] })
  ]);
  c.foodOverviewSetFilter('search', '  lemon  ');
  assert.deepEqual(shownIds(c).sort(), ['dinner', 'lunch']);
  c.foodOverviewSetFilter('category', 'dinner');
  assert.deepEqual(shownIds(c), ['dinner']);
  c.foodOverviewReset();
  assert.equal(shownIds(c).length, 3, 'reset returns all categories and names');
});

test('time filter includes its boundary and excludes unknown or ambiguous duration', () => {
  const c = context([
    recipe('quick', { cookTime: 10 }), recipe('boundary', { cookTime: '30 minutes' }),
    recipe('slow', { cookTime: '1 hour' }), recipe('missing', { cookTime: null }),
    recipe('ambiguous', { cookTime: '20–30 minutes' })
  ]);
  c.foodOverviewSetFilter('maxMinutes', '30');
  assert.deepEqual(shownIds(c).sort(), ['boundary', 'quick']);
  assert.equal(c.foodOverviewModel().unknownTime, 2, 'unknown and ambiguous are disclosed');
});

test('calorie ceiling evaluates accepted per-serving values and discloses unknown recipes', () => {
  const c = context([
    recipe('under', { calories: 450 }), recipe('boundary', { calories: 600 }),
    recipe('over', { calories: 601 }), recipe('unknown', { calories: null }),
    recipe('suggestion', { calories: null, nutritionCalculation: { perServing: { calories: 300 } } })
  ]);
  assert.equal(shownIds(c).length, 5, 'unknown calories are still browsable without a ceiling');
  c.foodOverviewSetFilter('maxCalories', '600');
  assert.deepEqual(shownIds(c).sort(), ['boundary', 'under']);
  assert.equal(c.foodOverviewModel().unknownCalories, 2, 'a calculation awaiting acceptance is still unknown');
});

test('recipe ordering is stable, preference-first, capped at six and does not sort the catalogue in place', () => {
  const recipes = [recipe('z', { name: 'Zulu', favourite: true }), recipe('b', { name: 'Beta' }),
    recipe('a', { name: 'Alpha' }), recipe('g', { name: 'Gamma' }), recipe('e', { name: 'Echo' }),
    recipe('d', { name: 'Delta' }), recipe('c', { name: 'Charlie' }), recipe('f', { name: 'Foxtrot' })];
  const c = context(recipes), before = recipes.map(r => r.id);
  assert.deepEqual(shownIds(c), ['z', 'a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(shownIds(c), ['z', 'a', 'b', 'c', 'd', 'e'], 'there is no random recommendation');
  assert.deepEqual(recipes.map(r => r.id), before);
  assert.equal(c.foodOverviewModel().total, 8);
});

test('calorie filtering is an explicit preference and never inferred from logged intake', () => {
  const c = context([recipe('a', { calories: 600 }), recipe('b', { calories: 1800 })]);
  const before = shownIds(c);
  c.nutLog.entries = { lunch: entry('lunch', 2300) };
  assert.deepEqual(shownIds(c), before, 'a 100 kcal target gap must not hide dinner recipes');
  assert.equal(c.foodOverviewState.maxCalories, '');
});

test('no target and no logged food leave recipe browsing usable and no intake is invented', () => {
  const c = context([recipe('a')]);
  c.nutTarget = () => null;
  const model = c.foodOverviewModel();
  assert.equal(model.target, null);
  assert.equal(model.log.status, 'missing');
  assert.equal(model.log.calories, null);
  assert.equal(model.log.entries.length, 0);
  assert.deepEqual(shownIds(c), ['a']);
  assert.deepEqual(c.writes, []);
});

test('known and unknown food log summaries use the actual canonical entry snapshots', () => {
  const c = context();
  c.nutLog.entries = { a: entry('a', 420), b: entry('b', null) };
  let model = c.foodOverviewModel();
  assert.equal(model.log.status, 'partial');
  assert.equal(model.log.calories, 420);
  assert.equal(model.log.unknown, 1);
  assert.equal(model.log.entries.length, 2);
  delete c.nutLog.entries.b;
  model = c.foodOverviewModel();
  assert.equal(model.log.status, 'complete', 'this status covers recorded entries only');
  assert.equal(model.log.calories, 420);
  assert.equal(model.log.entries.length, 1);
});

test('View recipe and Cook use the advertised default protein option without logging it', () => {
  const r = recipe('variant', { calories: 999, servings: 4, defaultProteinOptionId: 'chicken',
    proteinOptions: [option('beef', 'Beef', 750), option('chicken', 'Chicken', 620)] });
  const c = context([r]), before = plain(r);
  c.foodOverviewView('variant');
  c.foodOverviewCook('variant');
  const detail = c.calls.find(call => call[0] === 'detail');
  const cook = c.calls.find(call => call[0] === 'cook');
  assert.ok(detail, 'View enters the established detail flow');
  assert.ok(cook, 'Cook enters the established cooking flow');
  assert.deepEqual(detail.slice(1, 3), ['variant', 'chicken']);
  assert.deepEqual(cook.slice(1, 3), ['variant', 'chicken']);
  assert.deepEqual(plain(r), before);
  assert.deepEqual(plain(c.nutLog.entries), {});
  assert.deepEqual(c.writes, []);
});

test('protein options advertise the canonical option’s per-serving nutrition without dividing by servings', () => {
  const r = recipe('variant', { servings: 4, calories: 999, protein: 99,
    defaultProteinOptionId: 'chicken', proteinOptions: [option('beef', 'Beef', 750),
      option('chicken', 'Chicken', 620, { protein: 42 })] });
  const c = context([r]);
  let item = c.foodOverviewRecipe(r);
  assert.equal(item.optionId, 'chicken');
  assert.equal(item.optionLabel, 'Chicken');
  assert.equal(item.calories, 620, 'calories are already per serving, never 155');
  assert.equal(item.protein, 42);
  assert.equal(item.nutritionState, 'manual');
  assert.match(c.foodOverviewRecipeHTML(item), /Chicken option/);
  assert.match(c.foodOverviewRecipeHTML(item), /<strong>620<\/strong> kcal/);
  r.defaultProteinOptionId = 'beef';
  item = c.foodOverviewModel().shown[0];
  assert.equal(item.optionId, 'beef');
  assert.equal(item.calories, 750, 'a refreshed default updates the advertised values together');
});

test('missing, partial, manual and explicitly accepted calculated nutrition stay distinct', () => {
  const c = context();
  const cases = [
    [recipe('manual', { calories: 500, nutritionBasis: 'manual',
      nutritionCalculation: { perServing: { calories: 250, protein: 25 } } }), 'manual', 500],
    [recipe('partial', { calories: 510, nutritionBasis: 'partial',
      nutritionCalculation: { perServing: { calories: 270, protein: 25 } } }), 'partial', 510],
    [recipe('calculated', { calories: 520, nutritionBasis: 'calculated' }), 'calculated', 520],
    [recipe('missing', { calories: null, protein: null,
      nutritionCalculation: { perServing: { calories: 290, protein: 25 } } }), 'missing', null]
  ];
  cases.forEach(([r, status, calories]) => {
    const item = c.foodOverviewRecipe(r);
    assert.equal(item.nutritionState, status);
    assert.equal(item.calories, calories, 'unaccepted calculations cannot replace saved values');
  });
  const missing = c.foodOverviewRecipeHTML(c.foodOverviewRecipe(cases[3][0]));
  assert.match(missing, /Calories unknown/);
  assert.match(missing, /Protein unknown/);
  assert.doesNotMatch(missing, /<strong>0<\/strong>/);
});

test('a protein-step timer never becomes the complete recipe’s quick-filter duration', () => {
  const r = recipe('variant', { cookTime: null, defaultProteinOptionId: 'chicken',
    proteinOptions: [option('chicken', 'Chicken', 620, { cookTime: 7 })] });
  const c = context([r]), item = c.foodOverviewRecipe(r);
  assert.equal(item.minutes, null);
  assert.equal(item.proteinMinutes, 7);
  assert.match(c.foodOverviewRecipeHTML(item), /Cooking time unknown · Protein step: 7 min/);
  c.foodOverviewSetFilter('maxMinutes', '10');
  assert.deepEqual(shownIds(c), []);
});

test('invalid protein-option data cannot advertise guessed nutrition or enter cooking', () => {
  const r = recipe('broken', { defaultProteinOptionId: 'deleted',
    proteinOptions: [option('chicken', 'Chicken', 620)] });
  const c = context([r]), item = c.foodOverviewRecipe(r);
  assert.equal(item.resolved.ok, false);
  assert.equal(item.calories, null);
  assert.equal(item.protein, null);
  assert.match(c.foodOverviewRecipeHTML(item), /disabled/);
  c.foodOverviewCook('broken');
  assert.deepEqual(c.calls, []);
  assert.equal(r.defaultProteinOptionId, 'deleted', 'browsing never repairs the saved schema');
});

test('serving comparison labels its ratio to the target and never claims remaining intake', () => {
  const c = context([recipe('a', { calories: 620, servings: 4 })]);
  c.nutTarget = () => 2500;
  c.foodOverviewCompare('a');
  const html = c.foodOverviewGoalHTML(c.foodOverviewModel());
  assert.match(html, /Daily calorie target/);
  assert.match(html, /One serving: 620 kcal · 25% of your daily target/);
  assert.match(html, /comparison/i);
  assert.doesNotMatch(html, /remaining|on track|off track|planned today/i);
  assert.deepEqual(plain(c.nutLog.entries), {});
});

test('known logged calories never claim the day’s intake is complete or prescribe a remainder', () => {
  const c = context();
  c.nutLog.entries = { a: entry('a', 420) };
  let html = c.foodOverviewLogHTML(c.foodOverviewModel());
  assert.match(html, /known logged kcal/);
  assert.match(html, /1 entry recorded/);
  assert.match(html, /may not include everything eaten/);
  assert.doesNotMatch(html, /complete|remaining|on track|off track|you have eaten/i);
  c.nutLog.entries.b = entry('b', null);
  html = c.foodOverviewLogHTML(c.foodOverviewModel());
  assert.match(html, /2 entries recorded · 1 with unknown calories/);
  assert.doesNotMatch(html, /complete|remaining|on track|off track/i);
});

test('shopping summary uses canonical unchecked semantics and active-pantry identity', () => {
  const c = context();
  const plan = { pantryId: 'office', pantryName: 'Office', pantryNeeds: [
    { key: 'pantry:office:milk', name: 'Milk', source: 'pantry', checked: true }],
    normal: { rice: { name: 'Rice', checked: false }, eggs: { name: 'Eggs', checked: true },
      manual: { name: 'Bread', checked: false }, extra: { name: 'Apples', checked: false } },
    stocked: [{ name: 'Salt' }], buy: {} };
  const before = plain(plan), checkedPantries = [];
  c.kitShopComputePlan = () => plan;
  c.kitShopRowChecked = (row, pantryId) => { checkedPantries.push(pantryId); return !!row.checked; };
  const model = c.foodOverviewModel();
  assert.equal(model.shopping.count, c.kitShopCountLeft(plan));
  assert.equal(model.shopping.count, 4, 'pantry needs always count; checked normal and stocked rows do not');
  assert.equal(model.shopping.pantryName, 'Office');
  assert.deepEqual(plain(model.shopping.preview).map(row => row.name), ['Milk', 'Rice', 'Bread']);
  assert.ok(checkedPantries.every(id => id === 'office'));
  assert.deepEqual(plain(plan), before);
  assert.doesNotMatch(c.foodOverviewShoppingHTML(model), /cook this now|enough|meal plan/i);
  assert.deepEqual(c.writes, []);
});

test('empty recipe, filter and target states retain the existing actions', () => {
  const c = context();
  let html = c.foodOverviewResultsHTML(c.foodOverviewModel());
  assert.match(html, /onclick="kitOpenForm\(\)"/);
  assert.match(html, /onclick="kitOpenImport\(\)"/);
  c.kitRecipes.push(recipe('a', { calories: null }));
  c.foodOverviewSetFilter('search', 'no match');
  html = c.foodOverviewResultsHTML(c.foodOverviewModel());
  assert.match(html, /No recipes match these filters/);
  assert.match(html, /foodOverviewReset\(\)/);
  assert.match(html, /foodOpenReview\(\)/);
  c.nutTarget = () => null;
  assert.match(c.foodOverviewGoalHTML(c.foodOverviewModel()), /No calorie target set/);
  assert.match(c.foodOverviewGoalHTML(c.foodOverviewModel()), /openHealthSettings\(\)/);
  assert.match(c.foodOverviewLogHTML(c.foodOverviewModel()), /No food logged today/);
  assert.match(c.foodOverviewLogHTML(c.foodOverviewModel()), /foodOpenLog\(\)/);
});

test('incoming data refresh preserves chooser identity, focus, filters and stable-ID comparison', () => {
  const c = context([recipe('a', { name: 'Rice bowl' })]), dom = attachOverviewDOM(c);
  c.foodRenderOverview();
  c.foodOverviewCompare('a');
  const search = dom.nodes.get('fo-search');
  search.value = 'Rice'; c.document.activeElement = search;
  c.foodOverviewSetFilter('search', 'Rice');
  c.foodOverviewSetFilter('category', 'dinner');
  c.foodOverviewSetFilter('maxMinutes', '30');
  c.foodOverviewSetFilter('maxCalories', '700');
  const state = plain(c.foodOverviewState);
  c.kitRecipes = [recipe('a', { name: 'Rice bowl updated', calories: 650 })];
  c.nutLog.entries = { a: entry('a', 300) };
  c.foodRenderOverview();
  assert.equal(dom.nodes.get('fo-search'), search, 'the typed control is not recreated');
  assert.equal(c.document.activeElement, search, 'focus remains on the same input');
  assert.equal(search.value, 'Rice');
  assert.equal(dom.rebuilds(), 1, 'incoming changes update results, not the whole chooser');
  assert.deepEqual(plain(c.foodOverviewState), state);
  assert.match(dom.nodes.get('fo-goal').innerHTML, /One serving: 650 kcal/);
  assert.match(dom.nodes.get('fo-log-summary').innerHTML, /known logged kcal/);
  assert.deepEqual(c.writes, []);
});

test('deleting the compared recipe clears only the stale comparison and leaves search focused', () => {
  const c = context([recipe('a', { name: 'Rice bowl' })]), dom = attachOverviewDOM(c);
  c.foodRenderOverview(); c.foodOverviewCompare('a'); c.foodOverviewSetFilter('search', 'Rice');
  const search = dom.nodes.get('fo-search'); c.document.activeElement = search;
  c.kitRecipes = []; c.foodRenderOverview();
  assert.equal(c.foodOverviewState.compareId, null);
  assert.equal(c.foodOverviewState.search, 'Rice');
  assert.equal(c.document.activeElement, search);
  assert.equal(dom.rebuilds(), 1);
  assert.deepEqual(c.writes, []);
});
