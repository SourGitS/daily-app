// What the Home weather card SHOWS about its own freshness, against the real renderer in an
// isolated VM. The rule being protected: Retry is not an everyday control. Routine updates
// arrive on their own, so a card holding a fresh successful reading offers nothing to press —
// the button appears only for a reading that is missing, stale, failed or offline, and a failed
// refresh still leaves the last successful reading and its age on screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { extract } = require('./harness.cjs');

const NOW = Date.parse('2026-09-14T02:20:00Z');
const HOUR = 3600000;

function el() {
  return { textContent: '', hidden: false, disabled: false, attrs: {}, span: { textContent: '' },
    setAttribute(name, value) { this.attrs[name] = value; },
    querySelector() { return this.span; } };
}
function fixture(cache, { state = 'idle', online = true } = {}) {
  const nodes = {
    'home-weather-freshness': el(), 'home-weather-refresh': el(),
    'home-weather-notice': el(), 'home-weather-location': el()
  };
  class Clock extends Date { static now() { return NOW; } }
  const ctx = vm.createContext({
    Date: Clock, Number, console,
    document: { getElementById: id => nodes[id] || null },
    navigator: { onLine: online },
    lsLoad: (key, fallback) => cache === undefined ? fallback : cache
  });
  vm.runInContext([
    'loadWeatherCache', 'weatherIsFresh', 'weatherIsReal', 'weatherAgeLabel', 'renderWeatherStatus'
  ].map(extract).join('\n') +
    '\nconst WEATHER_FRESH_MS=' + HOUR + ';\nlet _weatherStatus={state:' + JSON.stringify(state) + ',message:\'\'};', ctx);
  ctx.renderWeatherStatus();
  return nodes;
}
const reading = (over = {}) => ({ lat: -33.8688, lon: 151.2093, city: 'Sydney', tempC: 20, code: 1,
  fetchedAt: NOW - 10 * 60000, ...over });

test('fresh successful weather offers nothing to press and explains nothing', () => {
  const n = fixture(reading());
  assert.equal(n['home-weather-refresh'].hidden, true, 'no everyday refresh button');
  assert.equal(n['home-weather-notice'].hidden, true);
  assert.equal(n['home-weather-freshness'].textContent, 'Updated 10 minutes ago');
  assert.equal(n['home-weather-location'].hidden, true, 'a real location needs no location prompt');
});

test('a stale reading stays on screen, says so, and exposes Retry', () => {
  const n = fixture(reading({ fetchedAt: NOW - 3 * HOUR }));
  assert.equal(n['home-weather-refresh'].hidden, false);
  assert.equal(n['home-weather-refresh'].span.textContent, 'Retry');
  assert.equal(n['home-weather-refresh'].attrs['aria-label'], 'Retry weather update');
  assert.equal(n['home-weather-notice'].hidden, false);
  assert.match(n['home-weather-notice'].textContent, /out of date/);
  assert.equal(n['home-weather-freshness'].textContent, 'Updated 3 hours ago');
});

test('a failed refresh keeps the last successful reading and its timestamp', () => {
  const n = fixture(reading({ lastError: 'Could not refresh weather — showing the last reading.',
    lastErrorAt: NOW - 60000 }));
  assert.equal(n['home-weather-freshness'].textContent, 'Updated 10 minutes ago',
    'the age still reads from the last SUCCESS, not from the failure');
  assert.equal(n['home-weather-refresh'].hidden, false);
  assert.match(n['home-weather-notice'].textContent, /refresh failed/);
});

test('offline keeps the saved reading and says why it is not newer', () => {
  const n = fixture(reading(), { online: false });
  assert.equal(n['home-weather-refresh'].hidden, false, 'offline is a state Retry can act on once back');
  assert.match(n['home-weather-notice'].textContent, /Offline · showing saved weather/);
});

test('no reading at all asks for one, and offers the location prompt', () => {
  const n = fixture(null);
  assert.equal(n['home-weather-freshness'].textContent, 'No update yet');
  assert.equal(n['home-weather-refresh'].hidden, false);
  assert.equal(n['home-weather-location'].hidden, false);
});

test('while a request is in flight the control says so instead of inviting another press', () => {
  const n = fixture(reading({ fetchedAt: NOW - 3 * HOUR }), { state: 'loading' });
  assert.equal(n['home-weather-refresh'].hidden, false);
  assert.equal(n['home-weather-refresh'].disabled, true);
  assert.equal(n['home-weather-refresh'].span.textContent, 'Updating…');
  assert.equal(n['home-weather-refresh'].attrs['aria-label'], 'Updating weather');
});

test('a loading refresh over fresh weather still shows no button', () => {
  const n = fixture(reading(), { state: 'loading' });
  assert.equal(n['home-weather-refresh'].hidden, true,
    'an automatic check must not make a healthy card look like it needs attention');
});

test('the sample reading keeps offering the real-location prompt', () => {
  const n = fixture({ ...reading(), placeholder: true });
  assert.equal(n['home-weather-location'].hidden, false);
  assert.equal(n['home-weather-refresh'].hidden, true, 'a fresh sample is not a broken card');
});
