const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { extract, extractConst } = require('./harness.cjs');
const copy = value => JSON.parse(JSON.stringify(value));

function fixture(mode = 'weather') {
  const memory = new Map([
    ['daily_accent_mode', mode],
    ['daily_day_colors', JSON.stringify({ __rest__: '#268000', Upper: '#0072EA' })]
  ]);
  const writes = [], applied = {}, nodes = {}, toasts = [];
  const modalIds = ['accent-picker-dialog', 'accent-picker-apply', 'accent-picker-hex',
    'accent-picker-status', 'static-accent-input', 'accent-picker-preview', 'static-accent-open'];
  const doc = {
    activeElement: null,
    documentElement: { getAttribute: () => 'dark', style: { setProperty: (k, v) => { applied[k] = v; } } },
    getElementById: id => nodes[id] || null,
    querySelector: () => null, querySelectorAll: () => []
  };
  for (const id of modalIds) {
    nodes[id] = { id, value: '', textContent: '', style: {}, disabled: false, open: false,
      setAttribute(k, v) { this[k] = v; }, focus() { doc.activeElement = this; },
      showModal() { this.open = true; }, close() { this.open = false; },
      querySelector: () => nodes['preview-code'] };
  }
  nodes['preview-code'] = { textContent: '' };
  const c = vm.createContext({
    console, document: doc, S: { dayIdx: 0 },
    localStorage: { getItem: key => memory.get(key) ?? null },
    lsLoad: (key, fallback) => memory.has(key) ? JSON.parse(memory.get(key)) : copy(fallback),
    lsSave: (key, value, syncPath) => { writes.push({ key, value: copy(value), syncPath }); memory.set(key, typeof value === 'string' ? value : JSON.stringify(value)); },
    showToast: text => toasts.push(text), splitTypes: () => [], typeForDayIdx: () => ({ name: 'Upper' }),
    loadWeatherCache: () => c.weather, weatherScene: () => c.scene,
    weatherEnsureFresh: () => assert.fail('Colour saving must not request location or weather'),
    weather: { lat: -33, fetchedAt: Date.now(), code: 0 }, scene: 'clear-dusk'
  });
  const tables = ['DEFAULT_ACCENT', 'REST_COLOR_KEY', 'ACCENT_MODES', 'ACCENT_MODE_LABELS',
    'WEATHER_ACCENTS', 'WEATHER_FRESH_MS', 'ACCENT_TEXT_TARGET'].map(extractConst);
  const names = ['loadDayColors', 'saveDayColors', 'restColor', 'dayColorFor', 'currentDayName',
    'accentMode', 'setAccentMode', 'setStaticAccent', 'weatherIsFresh', 'weatherIsReal',
    'weatherAppearanceEntry', 'weatherAppearanceScene', 'weatherAppearanceStatus', 'weatherAccentHex',
    'currentAccentHex', 'applyDayColour', 'applyAccent', 'hexToRgb', '_relLum', '_contrastRatio',
    '_hexToHsl', '_hslToHex', 'heroStopsFor', 'accentTextHex', 'renderAccentModeRow',
    'renderDayColorPickers', 'accentCurrentHTML', 'renderAccentCurrent', 'loadAccentFavourites',
    'saveAccentFavourites', 'saveCurrentAccentAsFavourite', 'openAccentPicker', 'previewAccentPicker',
    'closeAccentPicker', 'applyAccentPicker'];
  vm.runInContext(tables.join('\n') + '\nlet _accentPickerHex=null;\n' + names.map(extract).join('\n'), c);
  return { c, memory, nodes, writes, applied, toasts, doc };
}

test('saving the current weather colour does not save the dormant fixed colour or change modes', () => {
  const { c, memory, writes } = fixture();
  c.saveCurrentAccentAsFavourite();
  assert.deepEqual(JSON.parse(memory.get('daily_accent_favourites')), ['#533b7e']);
  assert.equal(c.accentMode(), 'weather');
  assert.equal(c.restColor(), '#268000');
  assert.deepEqual(writes.map(w => [w.key, w.syncPath]), [['daily_accent_favourites', 'accentFavourites']]);
});

test('a displayed colour is saved exactly even if weather changes before the click', () => {
  const { c, memory } = fixture();
  const displayed = c.currentAccentHex();
  c.scene = 'clear-day';
  c.saveCurrentAccentAsFavourite(displayed);
  assert.deepEqual(JSON.parse(memory.get('daily_accent_favourites')), ['#533b7e']);
});

test('favourites are case-insensitive and duplicate or invalid saves write nothing', () => {
  const { c, memory, writes } = fixture();
  memory.set('daily_accent_favourites', JSON.stringify(['#533B7E']));
  c.saveCurrentAccentAsFavourite('#533b7e'); c.saveCurrentAccentAsFavourite('not a colour');
  assert.equal(writes.length, 0);
});

test('stale, sample and missing weather save the honest fixed fallback, not a made-up weather shade', () => {
  for (const weather of [null, { lat: -33, fetchedAt: Date.now(), placeholder: true }, { lat: -33, fetchedAt: Date.now() - 7200000 }]) {
    const { c, memory } = fixture(); c.weather = weather;
    c.saveCurrentAccentAsFavourite();
    assert.deepEqual(JSON.parse(memory.get('daily_accent_favourites')), ['#268000']);
  }
});

test('opening, repeated colour input and Cancel never change appearance or storage', () => {
  const { c, nodes, writes, applied } = fixture();
  c.applyDayColour(); const before = copy(applied);
  c.openAccentPicker();
  const input = nodes['static-accent-input'];
  for (const hex of ['#123456', '#ffffff', '#8f24b3']) c.previewAccentPicker(hex);
  assert.equal(nodes['accent-picker-dialog'].open, true);
  assert.equal(nodes['static-accent-input'], input);
  assert.equal(input.value, '#8f24b3');
  assert.equal(writes.length, 0);
  assert.deepEqual(applied, before);
  c.closeAccentPicker(); c.applyAccentPicker();
  assert.equal(writes.length, 0);
  assert.equal(c.accentMode(), 'weather');
});

test('Apply saves a fixed colour once and preserves all training-day colours', () => {
  const { c, nodes, writes } = fixture();
  c.openAccentPicker(); c.previewAccentPicker('8F24B3'); c.applyAccentPicker(); c.applyAccentPicker();
  assert.equal(c.accentMode(), 'static');
  assert.equal(c.restColor(), '#8f24b3');
  assert.equal(c.dayColorFor('Upper'), '#0072EA');
  assert.equal(nodes['accent-picker-dialog'].open, false);
  assert.equal(writes.filter(w => w.key === 'daily_day_colors').length, 1);
  assert.deepEqual(writes.map(w => w.key), ['daily_day_colors', 'daily_accent_mode', 'daily_dynamic_colours']);
});

test('an invalid hex cannot apply the previous valid draft', () => {
  const { c, nodes, writes } = fixture();
  c.openAccentPicker(); c.previewAccentPicker('#123456'); c.previewAccentPicker('#12');
  assert.equal(nodes['accent-picker-apply'].disabled, true);
  c.applyAccentPicker(); assert.equal(writes.length, 0);
  assert.equal(nodes['accent-picker-dialog'].open, true);
});

test('weather and preference repaints leave the open colour editor intact', () => {
  const { c, nodes, writes } = fixture();
  c.openAccentPicker(); c.previewAccentPicker('#aabbcc');
  const input = nodes['static-accent-input'];
  c.scene = 'storm'; c.applyDayColour(); c.renderDayColorPickers();
  assert.equal(nodes['static-accent-input'], input);
  assert.equal(input.value, '#aabbcc');
  assert.equal(nodes['accent-picker-dialog'].open, true);
  assert.equal(writes.length, 0);
});

test('choosing a preset or favourite from Weather makes it the fixed accent', () => {
  const { c } = fixture();
  c.setStaticAccent('#533b7e'); c.scene = 'clear-day';
  assert.equal(c.accentMode(), 'static');
  assert.equal(c.currentAccentHex(), '#533b7e');
});

test('the visible weather swatch and save button follow fresh data without writing', () => {
  const { c, doc, writes } = fixture();
  const nodes = Object.fromEntries(['label', 'hex', 'swatch', 'save', 'use'].map(name =>
    [name, { textContent: '', style: {}, dataset: {} }]));
  const card = { dataset: { accentCurrent: 'weather' },
    querySelector: selector => nodes[selector.match(/data-accent-(\w+)/)[1]] };
  doc.querySelectorAll = () => [card];
  c.renderAccentCurrent();
  assert.equal(card.hidden, false);
  assert.equal(nodes.hex.textContent, '#533B7E');
  assert.equal(nodes.save.dataset.hex, '#533B7E');
  c.scene = 'storm'; c.renderAccentCurrent();
  assert.equal(nodes.hex.textContent, '#4B3A66');
  assert.equal(nodes.save.dataset.hex, '#4B3A66');
  c.weather = null; c.renderAccentCurrent();
  assert.equal(card.hidden, true);
  assert.equal(writes.length, 0);
});

test('Appearance labels a weather fallback honestly and offers its actual fixed colour', () => {
  const { c, doc } = fixture(); c.weather = null;
  const nodes = Object.fromEntries(['label', 'hex', 'swatch', 'save', 'use'].map(name =>
    [name, { textContent: '', style: {}, dataset: {} }]));
  const card = { dataset: { accentCurrent: 'app' },
    querySelector: selector => nodes[selector.match(/data-accent-(\w+)/)[1]] };
  doc.querySelectorAll = () => [card];
  c.renderAccentCurrent();
  assert.equal(card.hidden, false);
  assert.equal(nodes.label.textContent, 'Current colour · weather fallback');
  assert.equal(nodes.save.dataset.hex, '#268000');
});

test('native picker handlers stage only, and the dialog is outside the rebuilt settings content', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const input = html.match(/<input[^>]+id="static-accent-input"[^>]+>/)[0];
  assert.match(input, /oninput="previewAccentPicker\(this.value\)"/);
  assert.match(input, /onchange="previewAccentPicker\(this.value\)"/);
  assert.doesNotMatch(input, /setStaticAccent|renderDayColorPickers/);
  assert.match(html, /oncancel="event.preventDefault\(\);closeAccentPicker\(\)"/);
  assert.doesNotMatch(extract('renderDayColorPickers'), /id="static-accent-input"/);
});
