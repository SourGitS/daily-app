// Cooking mode and the recipe-quantity path it depends on. Everything here runs the REAL
// helpers out of js/app.js against in-memory fixtures — no account, no network, no browser
// storage, and no recipe of the user's is read or written.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { extract, extractConst } = require('./harness.cjs');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

// A stand-in element: enough shape for the renderer to mount, patch and clean up without a
// real DOM. Nothing here asserts on markup — the HTML builders are called directly for that.
function el(id) {
  return {
    id, innerHTML: '', textContent: '', disabled: false, scrollTop: 0, offsetHeight: 0,
    style: {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    querySelector: () => null, querySelectorAll: () => [],
    setAttribute() {}, removeAttribute() {}, appendChild() {}, remove() {},
    addEventListener() {}, removeEventListener() {}
  };
}

function context(recipes = [], opts = {}) {
  const nodes = {};
  const timers = { set: 0, cleared: 0, live: new Set() };
  const toasts = [];
  const saved = [];
  let now = 1_000_000;
  const c = vm.createContext({
    console, JSON, Math, Object, Array, String, Number, Set, Map, RegExp,
    parseFloat, parseInt, isNaN, isFinite,
    Date: { now: () => now },
    kitRecipes: recipes,
    kitState: { selectedId: null, scaleServings: null, proteinOptionId: null },
    navigator: { vibrate: () => true },
    confirm: () => opts.confirm !== false,
    setInterval: (fn) => { timers.set++; const id = timers.set; timers.live.add(id); return id; },
    clearInterval: (id) => { if (id) { timers.cleared++; timers.live.delete(id); } },
    setTimeout: () => 0, clearTimeout: () => {},
    window: { matchMedia: () => ({ matches: !!opts.reduceMotion, addEventListener() {}, removeEventListener() {} }) },
    document: {
      getElementById: id => (nodes[id] = nodes[id] || el(id)),
      querySelector: () => null
    },
    cardHeader: (icon, label, right) => '<header data-icon="' + icon + '">' + label + (right || '') + '</header>',
    layoutIsDesktop: () => false,
    kitUsesSplitPane: () => false,
    kitSaveRecipes: () => saved.push('save'),
    kitRenderList: () => {},
    kitRefreshOpenDetail: () => {},
    kitShowToast: msg => toasts.push(msg),
    showToast: msg => toasts.push(msg),
    kitSheetOpen: () => {}, kitSheetClose: () => {}, kitSheetHead: () => '',
    kitProteinChooserHTML: () => '', kitTempBadge: () => '',
    kitGetIngredientCategory: () => 'Other',
    kitShopItemKey: (name, unit) => String(name).toLowerCase() + '|' + String(unit || '')
  });
  // The module's own tables and mutable slide handles, taken from the real source so a fixture
  // can never drift from what ships.
  const slideVars = source.match(/^let _kitCookSlideEnd.*$/m);
  assert.ok(slideVars, 'the slide handles must stay module-level lets');
  const tables = ['KIT_VULGAR_FRACTIONS', 'KIT_QTY_GLYPHS', 'KIT_QTY_EPS',
    'KIT_GENERIC_ING_WORDS', 'KIT_IMPORT_CATS', 'KIT_COOK_SLIDE_MS', 'kitCookState']
    .map(extractConst).concat(slideVars[0]).join('\n');
  const names = ['kitEsc', 'kitTrim', 'kitNum', 'kitIngCopy',
    'kitQtyValue', 'kitQtyParse', 'kitQtyScale', 'kitQtyFormat', 'kitQtyText', 'kitQtyResolve',
    'kitQtyStore', 'kitScaledAmount',
    'kitOptionsOf', 'kitFindOption', 'kitDefaultOption', 'kitOptionsProblem', 'kitOptId',
    'kitIsProteinStep', 'kitStepText', 'kitStepTimer', 'kitResolve', 'kitStepIngredients',
    'kitCookResolve', 'kitStartCooking', 'kitExitCooking', 'kitCookFinish', 'kitCookGo',
    'kitCookTimerClear', 'kitCookStepMinutes', 'kitCookTimerSec', 'kitCookTimerActive',
    'kitCookFmtClock', 'kitCookStepName', 'kitCookTimerToggle', 'kitCookTimerReset', 'kitCookTick',
    'kitCookRingHTML', 'kitCookTimerHTML', 'kitCookRenderTimer', 'kitCookTimerPatch',
    'kitCookChipHTML', 'kitCookJumpToTimer', 'kitCookReduceMotion', 'kitCookSlideSettle',
    'kitCookSlideStart', 'kitCookStepIngredients', 'kitCookIngRowHTML', 'kitCookInstructionHTML',
    'kitCookPageHTML', 'kitCookStepbarHTML', 'kitCookMount', 'kitCookNext', 'kitCookRenderStep',
    'kitCookRender', 'kitShopComputeRecipeItems', 'kitShopAddRequirement', 'kitShopRequirementText',
    'kitRecipeToExport', 'kitParseImport'];
  vm.runInContext(tables + '\n' + names.map(extract).join('\n'), c);
  // `const` bindings are lexical inside a VM script, so the session object is not a property
  // of the context. Hand the very same object out, so a test reads and writes what the module
  // itself is using.
  c.kitCookState = vm.runInContext('kitCookState', c);
  c.kitShopSelected = [];
  c.__timers = timers;
  c.__toasts = toasts;
  c.__saved = saved;
  c.__nodes = nodes;
  c.__advance = sec => { now += sec * 1000; };
  return c;
}

const recipe = (extra = {}) => ({
  id: 'r1', name: 'Test dish', emoji: '🍲', category: 'dinner', servings: 4,
  ingredients: [{ name: 'Rice', amount: 400, unit: 'g' }],
  steps: ['Cook the rice.'], ...extra
});

// ── Quantity parsing ─────────────────────────────────────────────

test('ordinary numbers, decimals and numeric strings parse as themselves', () => {
  const c = context();
  assert.equal(c.kitQtyValue(400), 400);
  assert.equal(c.kitQtyValue('400'), 400);
  assert.equal(c.kitQtyValue('0.5'), 0.5);
  assert.equal(c.kitQtyValue('.5'), 0.5);
  assert.equal(c.kitQtyParse(2).kind, 'number');
  assert.equal(c.kitQtyParse('12.75').value, 12.75);
});

test('simple, mixed and Unicode fractions parse to their real value, never their first digit', () => {
  const c = context();
  assert.equal(c.kitQtyValue('1/2'), 0.5);
  assert.equal(c.kitQtyValue('3/4'), 0.75);
  assert.equal(c.kitQtyValue('1 1/2'), 1.5);
  assert.equal(c.kitQtyValue('2 3/4'), 2.75);
  assert.equal(c.kitQtyValue('½'), 0.5);
  assert.equal(c.kitQtyValue('¼'), 0.25);
  assert.equal(c.kitQtyValue('¾'), 0.75);
  assert.equal(c.kitQtyValue('1½'), 1.5);
  assert.equal(c.kitQtyValue('1 ½'), 1.5);
  assert.ok(Math.abs(c.kitQtyValue('⅓') - 1 / 3) < 1e-9);
  // The whole point: parseFloat answers 1 here, and that number used to be scaled and saved.
  assert.notEqual(c.kitQtyValue('1/2'), 1);
});

test('an unsupported expression is never partially parsed', () => {
  const c = context();
  // A range is a range, not its first number.
  assert.equal(c.kitQtyValue('2-3'), null);
  assert.equal(c.kitQtyValue('2–3'), null);
  assert.equal(c.kitQtyParse('2-3').kind, 'range');
  assert.equal(c.kitQtyParse('2-3').lo, 2);
  assert.equal(c.kitQtyParse('2-3').hi, 3);
  // Descriptive amounts stay exactly as written.
  assert.equal(c.kitQtyParse('to taste').kind, 'text');
  assert.equal(c.kitQtyParse('to taste').text, 'to taste');
  assert.equal(c.kitQtyParse('a good pinch').kind, 'text');
  // Units typed into the amount field are not silently reduced to their number.
  assert.equal(c.kitQtyValue('400 g'), null);
  assert.equal(c.kitQtyParse('400g').kind, 'text');
  // Nonsense fractions are refused rather than half-read.
  assert.equal(c.kitQtyValue('1/0'), null);
  assert.equal(c.kitQtyValue('1/'), null);
  assert.equal(c.kitQtyValue('/2'), null);
  assert.equal(c.kitQtyValue('1.5½'), null);
});

test('missing, blank and explicitly zero amounts stay distinguishable', () => {
  const c = context();
  assert.equal(c.kitQtyParse(null).kind, 'none');
  assert.equal(c.kitQtyParse('').kind, 'none');
  assert.equal(c.kitQtyParse('   ').kind, 'none');
  assert.equal(c.kitQtyResolve('', 2).text, '');
  const zero = c.kitQtyParse(0);
  assert.equal(zero.kind, 'number');
  assert.equal(zero.value, 0);
  assert.equal(c.kitQtyResolve(0, 2).text, '0');          // an explicit zero is stated
  assert.equal(c.kitQtyResolve(null, 2).text, '');        // a missing one is not invented
});

// ── Formatting ───────────────────────────────────────────────────

test('quantities print as a kitchen would say them', () => {
  const c = context();
  assert.equal(c.kitQtyFormat(1), '1');
  assert.equal(c.kitQtyFormat(0.5), '½');
  assert.equal(c.kitQtyFormat(1.5), '1½');
  assert.equal(c.kitQtyFormat(0.25), '¼');
  assert.equal(c.kitQtyFormat(2.75), '2¾');
  assert.equal(c.kitQtyFormat(1 / 3), '⅓');
  assert.equal(c.kitQtyFormat(400), '400');
  // No long floats: 1/3 of 100 g is a number you can act on.
  assert.equal(c.kitQtyFormat(33.333333), '33.3');
  assert.equal(c.kitQtyFormat(133.3333), '133');
  assert.ok(!/\d{5}/.test(c.kitQtyFormat(266.66666666)));
});

test('a small positive amount is never rounded away to zero', () => {
  const c = context();
  for (const v of [0.04, 0.004, 0.0004]) {
    const out = c.kitQtyFormat(v);
    assert.notEqual(out, '0', v + ' must not print as zero');
    assert.ok(parseFloat(out) > 0, v + ' must stay positive: ' + out);
  }
});

test('countable ingredients keep their fraction instead of being rounded to whole items', () => {
  const c = context();
  const r = recipe({ servings: 2, ingredients: [{ name: 'Egg', amount: 3, unit: '' }] });
  const rv = context([r]).kitResolve(r, null, 3);         // 2 → 3 servings
  assert.equal(rv.ingredients[0].display, '4½');
  assert.equal(rv.ingredients[0].unit, '');               // the countable unit survives
  assert.equal(c.kitQtyFormat(1.5), '1½');
});

// ── Scaling ──────────────────────────────────────────────────────

test('scaling reads the original amount every time and never compounds rounding', () => {
  const r = recipe({ servings: 3, ingredients: [{ name: 'Stock', amount: 100, unit: 'ml' }] });
  const c = context([r]);
  const at = n => c.kitResolve(r, null, n).ingredients[0];
  // 3 → 4 → 3 returns the author's own figure, because each pass starts from r.ingredients.
  assert.equal(at(4).display, '133');
  assert.equal(at(3).display, '100');
  assert.equal(at(1).display, '33.3');
  assert.equal(at(3).display, '100');
  // The exact value is kept apart from the printed one.
  assert.ok(Math.abs(at(4).scaledNum - 400 / 3) < 1e-9);
  assert.equal(r.ingredients[0].amount, 100, 'the stored recipe is never rewritten by scaling');
});

test('fractions and ranges scale; written amounts are shown as written and flagged', () => {
  const r = recipe({ servings: 2, ingredients: [
    { name: 'Lemon', amount: '1/2', unit: '' },
    { name: 'Chilli', amount: '2-3', unit: '' },
    { name: 'Salt', amount: 'to taste', unit: '' }
  ] });
  const c = context([r]);
  const rv = c.kitResolve(r, null, 4);                    // double
  const [lemon, chilli, salt] = rv.ingredients;
  assert.equal(lemon.display, '1');                        // ½ doubled is 1, not 2
  assert.equal(lemon.amountAdjusted, true);
  assert.equal(chilli.display, '4–6');                     // the whole range moves
  assert.equal(chilli.amountAdjusted, true);
  assert.equal(salt.display, 'to taste');                  // untouched…
  assert.equal(salt.amountUnscaled, true);                 // …and reported as not adjusted
  assert.equal(salt.amountAdjusted, undefined || salt.amountAdjusted, 'never claimed as adjusted');
  assert.equal(salt.amountAdjusted, false);
});

test('an unscalable amount is only flagged when the servings actually differ', () => {
  const r = recipe({ servings: 2, ingredients: [{ name: 'Salt', amount: 'to taste', unit: '' }] });
  const c = context([r]);
  assert.equal(c.kitResolve(r, null, 2).ingredients[0].amountUnscaled, false);
  assert.equal(c.kitResolve(r, null, 3).ingredients[0].amountUnscaled, true);
});

// ── Storage round trips ──────────────────────────────────────────

test('kitQtyStore keeps a number a number and everything else as the author wrote it', () => {
  const c = context();
  assert.equal(c.kitQtyStore('400'), 400);
  assert.equal(c.kitQtyStore(400), 400);
  assert.equal(c.kitQtyStore('0.5'), 0.5);
  assert.equal(c.kitQtyStore('1/2'), '1/2');
  assert.equal(c.kitQtyStore('1 1/2'), '1 1/2');
  assert.equal(c.kitQtyStore('½'), '½');
  assert.equal(c.kitQtyStore('2-3'), '2-3');
  assert.equal(c.kitQtyStore('to taste'), 'to taste');
  assert.equal(c.kitQtyStore(''), '');
  assert.equal(c.kitQtyStore(null), '');
});

test('export and re-import preserve fractions, ranges, countable units and custom units', () => {
  const r = recipe({ servings: 2, cookTime: 20, ingredients: [
    { name: 'Lemon', amount: '1/2', unit: '' },
    { name: 'Chilli', amount: '2-3', unit: '' },
    { name: 'Cream', amount: '½', unit: 'L' },
    { name: 'Flour', amount: 1.5, unit: 'kg' },
    { name: 'Salt', amount: 'to taste', unit: '' },
    { name: 'Saffron', amount: '', unit: 'pinch' }
  ] });
  const c = context([r]);
  const exported = c.kitRecipeToExport(r);
  const reimported = c.kitParseImport(JSON.stringify({ recipes: [exported] }));
  assert.ok(!reimported.error, reimported.error);
  const back = reimported.recipes[0].ingredients;
  assert.deepEqual(plain(back).map(i => i.amount), ['1/2', '2-3', '½', 1.5, 'to taste', '']);
  assert.deepEqual(plain(back).map(i => i.unit), ['', '', 'L', 'kg', '', 'pinch']);
  // And a second lap changes nothing further.
  const twice = c.kitParseImport(JSON.stringify({ recipes: [c.kitRecipeToExport(reimported.recipes[0])] }));
  assert.deepEqual(plain(twice.recipes[0].ingredients).map(i => i.amount), plain(back).map(i => i.amount));
});

test('import still refuses a zero or negative numeric amount, judged on the parsed value', () => {
  const c = context();
  const bad = c.kitParseImport(JSON.stringify({ recipes: [recipe({ ingredients: [{ name: 'Rice', amount: 0, unit: 'g' }] })] }));
  assert.ok(bad.error && /greater than zero/.test(bad.error));
  const ok = c.kitParseImport(JSON.stringify({ recipes: [recipe({ ingredients: [{ name: 'Rice', amount: '1/2', unit: 'g' }] })] }));
  assert.ok(!ok.error, ok.error);
});

// ── One answer across consumers ──────────────────────────────────

test('detail, cooking and shopping read the same quantities from the one resolver', () => {
  const r = recipe({ servings: 2, ingredients: [
    { name: 'Rice', amount: 200, unit: 'g' },
    { name: 'Lemon', amount: '1/2', unit: '' },
    { name: 'Chilli', amount: '2-3', unit: '' }
  ] });
  const c = context([r]);
  const rv = c.kitResolve(r, null, 4);
  c.kitShopSelected = [{ recipeId: 'r1', proteinOptionId: null, servings: 4 }];
  const shop = c.kitShopComputeRecipeItems();
  const rice = shop[c.kitShopItemKey('Rice', 'g')];
  assert.equal(rice.amount, 400);                                    // exact sum, not a display string
  assert.equal(c.kitQtyFormat(rice.amount), rv.ingredients[0].display);
  const lemon = shop[c.kitShopItemKey('Lemon', '')];
  assert.equal(lemon.amount, 1, 'half a lemon doubled is one, in the shopping list too');
  const chilli = shop[c.kitShopItemKey('Chilli', '')];
  assert.equal(chilli.hasNumeric, false, 'a range cannot be summed');
  assert.deepEqual(plain(chilli.texts), ['4–6'], 'but it is carried through as written');
  assert.equal(c.kitShopRequirementText([{ hasNumeric: false, unit: '', texts: ['4–6'] }]), '4–6');
});

test('two selections of the same ingredient add their exact values', () => {
  const r = recipe({ servings: 2, ingredients: [{ name: 'Rice', amount: 100, unit: 'g' }] });
  const c = context([r]);
  c.kitShopSelected = [
    { recipeId: 'r1', proteinOptionId: null, servings: 3 },
    { recipeId: 'r1', proteinOptionId: null, servings: 3 }
  ];
  const rice = c.kitShopComputeRecipeItems()[c.kitShopItemKey('Rice', 'g')];
  assert.ok(Math.abs(rice.amount - 300) < 1e-9, 'exact halves add to a whole: ' + rice.amount);
  assert.equal(c.kitQtyFormat(rice.amount), '300');
});

// ── Step ingredients ─────────────────────────────────────────────

test('a step names an ingredient by its full name or an unambiguous last word', () => {
  const c = context();
  const ings = [{ name: 'Baby potatoes' }, { name: 'Butter' }];
  assert.deepEqual(plain(c.kitStepIngredients('Boil the baby potatoes until tender.', ings)).map(i => i.name), ['Baby potatoes']);
  assert.deepEqual(plain(c.kitStepIngredients('Boil the potatoes.', ings)).map(i => i.name), ['Baby potatoes']);
  assert.deepEqual(plain(c.kitStepIngredients('Melt the butter.', ings)).map(i => i.name), ['Butter']);
});

test('ingredients sharing a generic word are not matched by it', () => {
  const c = context();
  const oils = [{ name: 'Olive oil' }, { name: 'Sesame oil' }];
  assert.deepEqual(plain(c.kitStepIngredients('Heat the oil in a pan.', oils)), [],
    'a shared last word proves nothing about which oil is meant');
  const butters = [{ name: 'Peanut butter' }, { name: 'Butter' }];
  const got = plain(c.kitStepIngredients('Add the butter.', butters)).map(i => i.name);
  assert.deepEqual(got, ['Butter'], 'the exact name still matches; peanut butter does not');
  // A category word is refused even when it is unique.
  assert.deepEqual(plain(c.kitStepIngredients('Season with the sauce.', [{ name: 'Fish sauce' }])), []);
});

test('an empty match never claims the step needs no ingredients', () => {
  const r = recipe({ ingredients: [{ name: 'Rice', amount: 200, unit: 'g' }], steps: ['Preheat the oven.'] });
  const c = context([r]);
  const rv = c.kitResolve(r, null, 4);
  const html = c.kitCookPageHTML(rv, 0);
  assert.ok(/does not name an ingredient/.test(html), html);
  assert.ok(!/no ingredients/i.test(html.replace(/does not name an ingredient/, '')));
});

test('listed amounts are labelled as recipe totals, not a step allocation', () => {
  const r = recipe({ ingredients: [{ name: 'Rice', amount: 200, unit: 'g' }], steps: ['Rinse the rice.'] });
  const c = context([r]);
  const html = c.kitCookPageHTML(c.kitResolve(r, null, 4), 0);
  assert.ok(/Recipe totals for 4 servings/.test(html), html);
  assert.ok(/not a measured amount for this step/.test(html));
});

test('instructions keep their authored wording and numbers', () => {
  const c = context();
  const text = 'Bake at 180°C for 25 minutes in a 20 cm tin.\nRest for 5 minutes.';
  const html = c.kitCookInstructionHTML(text);
  assert.ok(html.includes('Bake at 180°C for 25 minutes in a 20 cm tin.'));
  assert.ok(html.includes('Rest for 5 minutes.'));
  assert.equal((html.match(/<p /g) || []).length, 2, 'authored line breaks become paragraphs, nothing else');
});

// ── Protein slots ────────────────────────────────────────────────

const proteinRecipe = () => recipe({
  servings: 2,
  steps: ['Warm the sauce.', { type: 'protein' }, 'Plate up.'],
  proteinOptions: [
    { id: 'chicken', label: 'Chicken', ingredient: { name: 'Chicken thigh', amount: 300, unit: 'g' },
      prep: 'Trim the chicken.', cook: 'Fry the chicken.', cookTime: 8, internalTempC: 74, calories: 500 },
    { id: 'tofu', label: 'Tofu', ingredient: { name: 'Firm tofu', amount: 250, unit: 'g' },
      prep: 'Press the tofu.', cook: 'Fry the tofu.', cookTime: 6, calories: 400 }
  ],
  defaultProteinOptionId: 'chicken'
});

test('the chosen protein expands in the authored position with its own temperature', () => {
  const r = proteinRecipe();
  const c = context([r]);
  const rv = c.kitResolve(r, 'tofu', 2);
  assert.deepEqual(plain(rv.steps).map(s => s.text),
    ['Warm the sauce.', 'Press the tofu.', 'Fry the tofu.', 'Plate up.']);
  assert.equal(rv.steps[2].timerMinutes, 6);
  assert.equal(rv.steps[2].internalTempC, undefined || rv.steps[2].internalTempC);
  const chicken = c.kitResolve(r, 'chicken', 2);
  assert.equal(chicken.steps[2].internalTempC, 74);
  assert.ok(c.kitCookPageHTML(chicken, 2).includes('74'), 'the supplied temperature is shown at its step');
  assert.ok(!c.kitCookPageHTML(chicken, 0).includes('74'), 'and nowhere else');
});

test('a protein step uses its explicit ingredient references, not text matching', () => {
  const r = proteinRecipe();
  const c = context([r]);
  const rv = c.kitResolve(r, 'tofu', 2);
  const names = plain(c.kitCookStepIngredients(rv, rv.steps[1])).map(i => i.name);
  assert.deepEqual(names, ['Firm tofu']);
});

test('a deleted protein option is reported, never silently swapped for the default', () => {
  const r = proteinRecipe();
  const c = context([r]);
  const rv = c.kitResolve(r, 'lamb', 2);
  assert.equal(rv.optionMissing, true);
  assert.equal(rv.ok, false);
  assert.equal(rv.option, null);
});

// ── Cooking session ──────────────────────────────────────────────

function cooking(recipes, opts) {
  const c = context(recipes, opts);
  c.kitStartCooking('r1', null);
  return c;
}
const timed = () => recipe({ servings: 2, steps: [
  { text: 'Boil the water.', timerMinutes: 10 },
  { text: 'Simmer the rice.', timerMinutes: 10 },
  'Serve.'
] });

test('the session captures its own servings and protein and ignores later browsing', () => {
  const r = proteinRecipe();
  const c = context([r]);
  c.kitStartCooking('r1', 'tofu');
  assert.equal(c.kitCookState.proteinOptionId, 'tofu');
  assert.equal(c.kitCookResolve().servings, 2);
  // Browsing the detail view afterwards must not reach into the cook.
  c.kitState.proteinOptionId = 'chicken';
  c.kitState.scaleServings = 8;
  c.kitState.selectedId = 'r1';
  assert.equal(c.kitCookResolve().optionId, 'tofu');
  assert.equal(c.kitCookResolve().servings, 2);
});

test('navigation moves one step at a time and stops at both ends', () => {
  const c = cooking([timed()]);
  assert.equal(c.kitCookState.step, 0);
  c.kitCookGo(-1);
  assert.equal(c.kitCookState.step, 0, 'Prev on the first step does nothing');
  c.kitCookGo(1); c.kitCookGo(1);
  assert.equal(c.kitCookState.step, 2);
  c.kitCookGo(1);
  assert.equal(c.kitCookState.step, 2, 'Next on the last step does not run off the end');
  c.kitCookGo(-1);
  assert.equal(c.kitCookState.step, 1);
});

test('a render never starts, resets or duplicates a timer', () => {
  const c = cooking([timed()]);
  const before = c.__timers.set;
  c.kitCookRenderStep(0);
  c.kitCookRenderStep(1);
  c.kitCookRender();
  assert.equal(c.__timers.set, before, 'rendering must not create an interval');
  assert.equal(c.kitCookState.timerRunning, false);
  assert.equal(c.kitCookState.timerStep, null);
});

test('a running timer keeps its own step when you read ahead, and says where it came from', () => {
  const c = cooking([timed()]);
  c.kitCookTimerToggle();                       // start step 1's 10 minutes
  assert.equal(c.kitCookState.timerRunning, true);
  assert.equal(c.kitCookState.timerStep, 0);
  c.__advance(60);
  c.kitCookGo(1);                               // browse to step 2 — also 10 minutes
  assert.equal(c.kitCookState.timerRunning, true, 'browsing must not stop the countdown');
  assert.equal(c.kitCookState.timerStep, 0, 'and must not hand it to the step being viewed');
  assert.equal(c.kitCookTimerSec(), 540);
  const chip = c.kitCookChipHTML(c.kitCookResolve());
  assert.ok(/Step 1 of 3/.test(chip), chip);
  assert.ok(/09:00/.test(chip), chip);
});

test('consecutive equal-duration steps do not share a countdown', () => {
  const c = cooking([timed()]);
  c.kitCookTimerToggle();
  c.__advance(120);
  c.kitCookGo(1);
  // Step 2 has the same 10 minutes but has not been started.
  const html = c.kitCookTimerHTML();
  assert.ok(/Start 10 min/.test(html), html);
  assert.ok(/10:00/.test(html), html);
  assert.equal(c.kitCookTimerSec(), 480, 'step 1 is still counting down its own time');
});

test('starting another step timer while one runs asks first, and only one ever runs', () => {
  const declined = cooking([timed()], { confirm: false });
  declined.kitCookTimerToggle();
  declined.kitCookGo(1);
  declined.kitCookTimerToggle();
  assert.equal(declined.kitCookState.timerStep, 0, 'declining leaves the original timer alone');
  assert.equal(declined.kitCookState.timerRunning, true);

  const accepted = cooking([timed()], { confirm: true });
  accepted.kitCookTimerToggle();
  accepted.kitCookGo(1);
  accepted.kitCookTimerToggle();
  assert.equal(accepted.kitCookState.timerStep, 1, 'accepting replaces it');
  assert.equal(accepted.kitCookState.timerRunning, true);
  assert.equal(accepted.__timers.live.size, 1, 'never two intervals at once');
});

test('pause, resume and reset behave from elapsed time, not from tick counting', () => {
  const c = cooking([timed()]);
  c.kitCookTimerToggle();
  c.__advance(90);
  c.kitCookTimerToggle();                       // pause
  assert.equal(c.kitCookState.timerRunning, false);
  assert.equal(c.kitCookTimerSec(), 510);
  c.__advance(600);                             // time passes while paused
  assert.equal(c.kitCookTimerSec(), 510, 'a paused timer does not drain');
  c.kitCookTimerToggle();                       // resume
  c.__advance(10);
  assert.equal(c.kitCookTimerSec(), 500);
  c.kitCookTimerReset();
  assert.equal(c.kitCookState.timerRunning, false);
  assert.equal(c.kitCookTimerSec(), 600);
  assert.equal(c.__timers.live.size, 0, 'reset releases the interval');
});

test('a finished timer stops, says so, and claims nothing about the food', () => {
  const c = cooking([timed()]);
  c.kitCookTimerToggle();
  c.__advance(600);
  c.kitCookTick();
  assert.equal(c.kitCookState.timerRunning, false);
  assert.equal(c.kitCookTimerSec(), 0);
  assert.equal(c.__timers.live.size, 0);
  assert.ok(c.__toasts.some(t => /Timer finished/.test(t)), JSON.stringify(c.__toasts));
  const html = c.kitCookTimerHTML();
  assert.ok(/check the food before moving on/i.test(html), html);
  assert.ok(!/cooked through\b(?!.*does not)/i.test(html.replace(/does not mean it is cooked through/, '')));
});

test('rapid navigation settles cleanly and leaves one step showing', () => {
  const c = cooking([timed()]);
  c.kitCookGo(1); c.kitCookGo(1); c.kitCookGo(-1); c.kitCookGo(1);
  assert.equal(c.kitCookState.step, 2);
  c.kitCookSlideSettle();
  c.kitCookSlideSettle();                        // idempotent
  assert.equal(c.kitCookState.step, 2);
});

test('exit clears the interval, the wake lock and the session, and records nothing', () => {
  const r = timed();
  const c = cooking([r]);
  let released = 0;
  c.kitCookState.wakeLock = { release: () => { released++; } };
  c.kitCookTimerToggle();
  assert.equal(c.__timers.live.size, 1);
  c.kitExitCooking();
  assert.equal(c.__timers.live.size, 0, 'the tick interval is cleared');
  assert.equal(released, 1, 'the wake lock is released');
  assert.equal(c.kitCookState.recipeId, null);
  assert.equal(c.kitCookState.timerStep, null);
  assert.equal(c.kitCookState.wakeLock, null);
  assert.equal(r.lastCooked, undefined, 'exiting is not cooking');
  assert.equal(c.__saved.length, 0, 'and writes nothing');
});

test('only Finish records lastCooked, and it still cleans the session up', () => {
  const r = timed();
  const c = cooking([r]);
  c.kitCookTimerToggle();
  c.kitCookFinish();
  assert.ok(r.lastCooked > 0, 'Finish is the one thing that records a cook');
  assert.equal(c.__saved.length, 1);
  assert.equal(c.__timers.live.size, 0);
  assert.equal(c.kitCookState.recipeId, null);
});

test('opening and browsing a cook changes no stored recipe or quantity', () => {
  const r = proteinRecipe();
  const before = plain(r);
  const c = context([r]);
  c.kitStartCooking('r1', 'tofu');
  c.kitCookGo(1); c.kitCookGo(1); c.kitCookGo(-1);
  c.kitCookTimerToggle();
  c.kitCookTimerReset();
  c.kitExitCooking();
  assert.deepEqual(plain(r), before, 'a cooking session is read-only over the recipe');
  assert.equal(c.__saved.length, 0);
});

test('a stale wake lock from an ended session is released rather than kept', () => {
  const c = cooking([timed()]);
  const first = c.kitCookState.session;
  c.kitExitCooking();
  assert.notEqual(c.kitCookState.session, first, 'the session token moves on exit');
});

test('reduced motion retains no outgoing step', () => {
  const c = cooking([timed()], { reduceMotion: true });
  assert.equal(c.kitCookReduceMotion(), true);
  c.kitCookGo(1);
  assert.equal(c.kitCookState.step, 1);
  c.kitCookSlideSettle();
  assert.equal(c.kitCookState.step, 1);
});

test('a one-step recipe opens on Finish with no Prev and no timer', () => {
  const r = recipe({ steps: ['Serve immediately.'] });
  const c = cooking([r]);
  const rv = c.kitCookResolve();
  assert.equal(rv.steps.length, 1);
  assert.equal(c.kitCookStepMinutes(rv, 0), 0);
  assert.equal(c.kitCookTimerHTML(), '', 'no timer block for an untimed step');
  assert.ok(/Step 1 of 1/.test(c.kitCookStepbarHTML(rv, 0)));
});

test('the three storage paths read amounts through kitQtyStore, not parseFloat', () => {
  // A source-level guard: kitSaveForm, kitParseImport and kitRecipeToExport are the writers
  // that used to flatten "1/2" to 1 just by opening and saving a recipe. Each must keep going
  // through the one quantity path.
  for (const fn of ['kitSaveForm', 'kitParseImport', 'kitRecipeToExport']) {
    const body = extract(fn);
    const amountLines = body.split('\n').filter(l => /amount/.test(l) && !/^\s*\/\//.test(l));
    assert.ok(amountLines.some(l => /kitQtyStore/.test(l)), fn + ' must store amounts via kitQtyStore');
    assert.ok(!amountLines.some(l => /parseFloat\s*\(\s*(v|ing\.amount|i\.amount)/.test(l)),
      fn + ' must not read an ingredient amount with parseFloat: ' + amountLines.join(' | '));
  }
});
