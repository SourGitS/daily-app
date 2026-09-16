const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { extract, copy } = require('./harness.cjs');

const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
const HOUR = 3600000;
const START = Date.parse('2026-09-14T02:20:00Z');
function cached(overrides = {}) {
  return { lat: -33.8688, lon: 151.2093, city: 'Sydney', tempC: 20, code: 1,
    fetchedAt: START - 10 * 60000, ...overrides };
}
function provider(temp = 23, overrides = {}) {
  const time = Math.floor(START / 1000);
  return { timezone: 'Australia/Sydney', utc_offset_seconds: 36000,
    current: { time, temperature_2m: temp, apparent_temperature: 21, weather_code: 2,
      is_day: 1, cloud_cover: 40, wind_speed_10m: 8, wind_direction_10m: 120 },
    daily: { temperature_2m_max: [25], temperature_2m_min: [12],
      sunrise: [time - 6 * 3600], sunset: [time + 6 * 3600] },
    hourly: { time: [time + 3600, time + 7200], temperature_2m: [23, null],
      weather_code: [2], is_day: [1, null], precipitation_probability: [0, null],
      precipitation: [0] }, ...overrides };
}
function target() {
  const listeners = new Map();
  return { listeners, addEventListener(name, callback) {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(callback);
  }, emit(name) { for (const callback of listeners.get(name) || []) callback(); } };
}
function fixture(seed = cached()) {
  let now = START, cache = copy(seed), nextTimer = 1;
  const requests = [], writes = [], renders = [], errors = [], statusPaints = [], toasts = [], positions = [];
  const intervals = new Map(), deadlines = new Map();
  const doc = Object.assign(target(), { hidden: false, weatherCard: true,
    getElementById(id) { return id === 'home-weather-temp' && this.weatherCard ? {} : null; } });
  const win = target();
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const ctx = vm.createContext({
    Date: Clock, console, Promise, AbortController, Number,
    document: doc, window: win, S: { view: 'log' },
    navigator: { onLine: true, geolocation: { getCurrentPosition(ok, fail, options) { positions.push({ ok, fail, options }); } } },
    lsLoad: (key, fallback) => copy(cache) || fallback,
    lsSave: (key, value) => { assert.equal(key, 'daily_weather_cache'); cache = copy(value); writes.push(copy(value)); },
    localStorage: { removeItem: key => { assert.ok(/^daily_weather_cache(_ts)?$/.test(key)); cache = null; } },
    accentMode: () => 'static',
    renderWeatherInto: value => renders.push(copy(value)), renderWeatherStatus: () => statusPaints.push(true),
    renderWeatherSection: () => {}, renderWeatherError: denied => errors.push(denied), renderWeatherPrompt: () => {},
    setWeatherPlaceholderScene: () => {}, showToast: text => toasts.push(text),
    setInterval: (fn, ms) => { const id = nextTimer++; intervals.set(id, { fn, ms }); return id; },
    clearInterval: id => intervals.delete(id),
    setTimeout: (fn, ms) => { const id = nextTimer++; deadlines.set(id, { fn, ms }); return id; },
    clearTimeout: id => deadlines.delete(id),
    fetch(url, options) {
      return new Promise((resolve, reject) => requests.push({ url, options, reject,
        respond: (body = provider(), status = 200) => resolve({ ok: status < 400, status, json: () => Promise.resolve(body) }) }));
    }
  });
  const coordinator = source.slice(source.indexOf('function fetchWeatherAt('), source.indexOf('// Clears the device cache,', source.indexOf('function fetchWeatherAt(')));
  const lifecycle = source.slice(source.indexOf('// iOS can suspend timers for hours.'), source.indexOf('// Fixed set of decorative layers', source.indexOf('// iOS can suspend timers for hours.')));
  const names = ['loadWeatherCache', 'saveWeatherCache', 'weatherIsFresh', 'weatherIsReal',
    'weatherCityFromTz', 'weatherSetStatus', 'weatherRecordFailure', 'weatherRecordSuccess', 'weatherClearSaved', 'weatherConditionsTime'];
  vm.runInContext(source.match(/const WEATHER_FRESH_MS=.*?;/)[0] + '\n' +
    source.match(/const WEATHER_SAMPLE_LOC=.*?;/)[0] + '\n' +
    "let _weatherStatus={state:'idle',message:''}; let _weatherLoading=false, _weatherPerm='unknown';\n" +
    names.map(extract).join('\n') + '\n' + coordinator + '\n' + lifecycle, ctx);
  return { ctx, requests, writes, renders, errors, statusPaints, toasts, positions, intervals, deadlines, doc, win,
    cache: () => copy(cache), put: value => { cache = copy(value); },
    advance: ms => { now += ms; },
    status: () => vm.runInContext('({..._weatherStatus})', ctx),
    permission: () => vm.runInContext('_weatherPerm', ctx),
    settle: async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); } };
}

test('fresh cache paints immediately without requesting weather or rewriting storage', async () => {
  const f = fixture();
  assert.equal(await f.ctx.weatherEnsureFresh('launch'), true);
  assert.equal(f.requests.length, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(f.renders[0].tempC, 20);
  assert.equal(f.intervals.size, 1);
});

test('resume checks stale weather immediately and pauses the interval while hidden', async () => {
  const f = fixture();
  await f.ctx.weatherEnsureFresh();
  f.doc.hidden = true; f.doc.emit('visibilitychange');
  assert.equal(f.intervals.size, 0);
  f.advance(HOUR);
  f.doc.hidden = false; f.doc.emit('visibilitychange');
  assert.equal(f.requests.length, 1);
  assert.equal(f.intervals.size, 1);
  assert.equal(f.renders.at(-1).tempC, 20, 'old success stays visible while loading');
  f.requests[0].respond(provider(25)); await f.settle();
  assert.equal(f.cache().tempC, 25);
  assert.equal(f.renders.at(-1).tempC, 25);
});

test('the Home entry checks freshness again when returning from another destination', async () => {
  const f = fixture();
  await f.ctx.loadWeatherWidget();
  f.advance(HOUR);
  const pending = f.ctx.loadWeatherWidget();
  assert.equal(f.requests.length, 1);
  f.requests[0].respond(); assert.equal(await pending, true);
  assert.equal(f.positions.length, 0, 'Home never reacquires location');
});

test('a visible app eventually refreshes stale data without another navigation', async () => {
  const f = fixture();
  await f.ctx.weatherEnsureFresh();
  f.advance(HOUR);
  const interval = [...f.intervals.values()][0];
  assert.equal(interval.ms, 60000);
  interval.fn();
  assert.equal(f.requests.length, 1);
  f.requests[0].respond(); await f.settle();
  assert.equal(f.cache().fetchedAt, START + HOUR);
});

test('offline checks keep the cache, and connectivity recovery refreshes immediately', async () => {
  const f = fixture(cached({ fetchedAt: START - 2 * HOUR }));
  f.ctx.navigator.onLine = false;
  assert.equal(await f.ctx.weatherEnsureFresh(), false);
  assert.equal(f.requests.length, 0);
  assert.equal(f.cache().tempC, 20);
  assert.equal(f.cache().fetchedAt, START - 2 * HOUR);
  f.ctx.navigator.onLine = true; f.win.emit('online');
  assert.equal(f.requests.length, 1);
  f.requests[0].respond(); await f.settle();
  assert.equal(f.status().state, 'ok');
  assert.equal(f.cache().lastError, undefined);
});

test('offline Home without a cache paints a terminal error instead of leaving the loading label', async () => {
  const f = fixture(null);
  f.ctx.S.view = 'home';
  f.ctx.navigator.onLine = false;
  assert.equal(await f.ctx.loadWeatherWidget(), false);
  assert.deepEqual(f.errors, [false], 'the existing empty/error renderer must replace the initial Loading label');
  assert.equal(f.status().state, 'error');
  assert.match(f.status().message, /offline/);
  assert.equal(f.requests.length, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(f.cache(), null, 'no invented successful weather or fetchedAt');
  assert.equal(vm.runInContext('_weatherLoading', f.ctx), false);
});

test('concurrent lifecycle and retry requests join one saved-location request', async () => {
  const f = fixture(cached({ fetchedAt: START - 2 * HOUR }));
  const first = f.ctx.weatherEnsureFresh('resume');
  const second = f.ctx.weatherEnsureFresh('online');
  const retry = f.ctx.weatherRefresh({ force: true, reason: 'retry' });
  assert.equal(first, second);
  assert.equal(first, retry);
  assert.equal(f.requests.length, 1);
  f.requests[0].respond(); await first;
  assert.equal(f.writes.length, 1);
});

test('a rebuilt cold Home card repaints pending status while joining its existing request', async () => {
  const f = fixture(null);
  f.ctx.S.view = 'home';
  const first = f.ctx.loadWeatherWidget();
  const before = f.statusPaints.length;
  const joined = f.ctx.loadWeatherWidget();
  assert.equal(joined, first);
  assert.equal(f.statusPaints.length, before + 1, 'the rebuilt retry control needs the current loading state');
  assert.equal(f.status().state, 'loading');
  assert.equal(f.errors.length, 0);
  assert.equal(f.requests.length, 1);
  f.requests[0].respond(); assert.equal(await joined, true);
});

test('provider failure preserves the successful reading and timestamp, retry recovers', async () => {
  const f = fixture();
  const first = f.ctx.weatherRefreshStored();
  f.requests[0].reject(new Error('network down')); assert.equal(await first, false);
  assert.equal(f.cache().tempC, 20);
  assert.equal(f.cache().fetchedAt, START - 10 * 60000);
  assert.match(f.cache().lastError, /Could not refresh/);
  assert.equal(f.renders.at(-1).tempC, 20);
  assert.equal(f.status().state, 'error');
  f.advance(1000);
  const retry = f.ctx.weatherRefresh({ force: true, reason: 'retry' });
  f.requests[1].respond(provider(24)); assert.equal(await retry, true);
  assert.equal(f.cache().tempC, 24);
  assert.equal(f.cache().fetchedAt, START + 1000);
  assert.equal(f.cache().lastError, undefined);
  assert.equal(f.toasts.at(-1), 'Weather updated');
});

test('failed automatic requests wait five minutes; manual retry bypasses the backoff', async () => {
  const f = fixture(cached({ fetchedAt: START - 2 * HOUR }));
  const first = f.ctx.weatherEnsureFresh();
  f.requests[0].reject(new Error('provider unavailable')); await first;
  for (let n = 0; n < 4; n++) {
    f.advance(60000); await f.ctx.weatherEnsureFresh('interval');
  }
  assert.equal(f.requests.length, 1);
  f.advance(60000); const next = f.ctx.weatherEnsureFresh('interval');
  assert.equal(f.requests.length, 2);
  f.requests[1].reject(new Error('still unavailable')); await next;
  const retry = f.ctx.weatherRefreshStored();
  assert.equal(f.requests.length, 3);
  f.requests[2].respond(); await retry;
});

test('changing location supersedes an outstanding response and never applies its late result', async () => {
  const f = fixture(cached({ fetchedAt: START - 2 * HOUR }));
  const old = f.ctx.weatherEnsureFresh();
  const newer = f.ctx.weatherUseCurrentLocation();
  assert.equal(f.requests[0].options.signal.aborted, true);
  assert.equal(f.positions.length, 1);
  assert.equal(f.positions[0].options.maximumAge, 0);
  f.positions[0].ok({ coords: { latitude: -37.8, longitude: 144.9 } });
  f.requests[1].respond(provider(11, { timezone: 'Australia/Melbourne' }));
  assert.equal(await newer, true);
  f.requests[0].respond(provider(99)); assert.equal(await old, false);
  assert.equal(f.cache().lat, -37.8);
  assert.equal(f.cache().city, 'Melbourne');
  assert.equal(f.cache().tempC, 11);
});

test('clearing weather invalidates an outstanding request without resurrecting the location', async () => {
  const f = fixture();
  const pending = f.ctx.weatherRefreshStored();
  f.ctx.weatherClearSaved();
  f.requests[0].respond(); assert.equal(await pending, false);
  assert.equal(f.cache(), null);
  assert.equal(f.writes.length, 0);
  assert.equal(f.status().state, 'idle');
});

test('a late response cannot overwrite newer cache data even from the same coordinates', async () => {
  const f = fixture();
  const pending = f.ctx.weatherRefreshStored();
  f.put(cached({ tempC: 28, fetchedAt: START + 500 }));
  f.requests[0].respond(provider(10)); assert.equal(await pending, false);
  assert.equal(f.cache().tempC, 28);
  assert.equal(f.writes.length, 0);
});

test('a timed-out request settles, and its late response cannot replace a newer retry', async () => {
  const f = fixture();
  const old = f.ctx.weatherRefreshStored();
  const timeout = [...f.deadlines.values()][0];
  assert.equal(timeout.ms, 20000);
  timeout.fn(); assert.equal(await old, false);
  assert.equal(f.status().state, 'error');
  const newer = f.ctx.weatherRefreshStored();
  f.requests[1].respond(provider(26)); assert.equal(await newer, true);
  f.requests[0].respond(provider(99)); await f.settle();
  assert.equal(f.cache().tempC, 26);
  assert.equal(f.deadlines.size, 0);
});

test('repeated rendering and lifecycle checks install one set of listeners and timers', async () => {
  const f = fixture();
  for (let n = 0; n < 15; n++) await f.ctx.loadWeatherWidget();
  assert.equal(f.doc.listeners.get('visibilitychange').length, 1);
  for (const name of ['online', 'offline', 'pageshow', 'pagehide']) assert.equal(f.win.listeners.get(name).length, 1);
  assert.equal(f.intervals.size, 1);
  f.win.emit('pagehide'); assert.equal(f.intervals.size, 0);
  f.win.emit('pageshow'); await f.settle();
  assert.equal(f.intervals.size, 1);
  assert.equal(f.requests.length, 0);
});

test('automatic sample refresh never prompts, while an explicit denied location keeps the sample', async () => {
  const f = fixture(null);
  const sample = f.ctx.loadWeatherWidget();
  assert.equal(f.positions.length, 0);
  f.requests[0].respond(); await sample;
  assert.equal(f.cache().placeholder, true);
  const original = f.cache();
  const location = f.ctx.weatherUseCurrentLocation();
  const duplicate = f.ctx.weatherUseCurrentLocation();
  assert.equal(location, duplicate);
  assert.equal(f.positions.length, 1);
  f.positions[0].fail({ code: 1 }); assert.equal(await location, false);
  assert.equal(f.cache().tempC, original.tempC);
  assert.equal(f.cache().fetchedAt, original.fetchedAt);
  assert.match(f.status().message, /permission was refused/);
  assert.equal(f.permission(), 'denied');
});

test('accepted location results update permission feedback and superseded errors cannot change it', async () => {
  const f = fixture();
  const old = f.ctx.weatherUseCurrentLocation();
  f.ctx.weatherClearSaved();
  const current = f.ctx.weatherUseCurrentLocation();
  f.positions[1].ok({ coords: { latitude: -37.8, longitude: 144.9 } });
  assert.equal(f.permission(), 'granted', 'a successful location fix establishes permission even before the forecast returns');
  f.requests[0].respond(); assert.equal(await current, true);
  f.positions[0].fail({ code: 1 }); assert.equal(await old, false);
  assert.equal(f.permission(), 'granted');
  assert.equal(f.status().state, 'ok');
});

test('cold Home fetches the sample without a global layout variable; unrelated launch does not', async () => {
  const f = fixture(null);
  assert.equal(vm.runInContext('typeof _homeIds', f.ctx), 'undefined', 'Home layout IDs are local to renderHome');
  assert.equal(await f.ctx.weatherEnsureFresh('launch'), false);
  assert.equal(f.requests.length, 0);
  const home = f.ctx.loadWeatherWidget();
  assert.equal(f.requests.length, 1);
  f.requests[0].respond(); assert.equal(await home, true);
  assert.equal(f.cache().placeholder, true);
  assert.equal(f.positions.length, 0);
});

test('failed cold Home recovers on reconnect without another Home render', async () => {
  const f = fixture(null);
  f.ctx.S.view = 'home';
  const initial = f.ctx.loadWeatherWidget();
  f.requests[0].reject(new Error('connection lost')); assert.equal(await initial, false);
  assert.equal(f.cache(), null);
  f.ctx.navigator.onLine = false; f.win.emit('offline');
  f.ctx.navigator.onLine = true; f.win.emit('online');
  assert.equal(f.requests.length, 2, 'visible Home remains eligible without any cached success');
  f.requests[1].respond(); await f.settle();
  assert.equal(f.status().state, 'ok');
  assert.equal(f.cache().placeholder, true);
});

test('returning to Home after a cold-cache failure repaints the error during automatic backoff', async () => {
  const f = fixture(null);
  f.ctx.S.view = 'home';
  const initial = f.ctx.loadWeatherWidget();
  f.requests[0].reject(new Error('service down')); await initial;
  assert.equal(f.errors.length, 1);
  f.ctx.S.view = 'log'; f.advance(1000); f.ctx.S.view = 'home';
  assert.equal(await f.ctx.loadWeatherWidget(), false);
  assert.equal(f.errors.length, 2, 'a rebuilt Home card needs its terminal error painted again');
  assert.equal(f.requests.length, 1, 'navigating does not bypass the failure backoff');
  assert.equal(f.status().state, 'error');
  assert.equal(f.cache(), null);
});

test('failed cold Home retries on resume after backoff without relying on background timers', async () => {
  const f = fixture(null);
  f.ctx.S.view = 'home';
  const initial = f.ctx.loadWeatherWidget();
  f.requests[0].reject(new Error('provider failed')); await initial;
  f.doc.hidden = true; f.doc.emit('visibilitychange');
  f.advance(5 * 60000);
  f.doc.hidden = false; f.doc.emit('visibilitychange');
  assert.equal(f.requests.length, 2);
  f.requests[1].respond(); await f.settle();
  assert.equal(f.cache().tempC, 23);
  assert.equal(f.renders.at(-1).tempC, 23);
});

test('missing weather does not fetch a sample on another destination or with the Home card disabled', async () => {
  const f = fixture(null);
  await f.ctx.weatherEnsureFresh('launch');
  f.win.emit('online'); f.win.emit('pageshow');
  [...f.intervals.values()][0].fn(); await f.settle();
  assert.equal(f.requests.length, 0, 'a retained hidden Home node is insufficient');
  f.ctx.S.view = 'home'; f.doc.weatherCard = false;
  f.win.emit('online'); f.win.emit('pageshow');
  [...f.intervals.values()][0].fn(); await f.settle();
  assert.equal(f.requests.length, 0, 'a disabled Home weather card does not request the sample');
});

test('Weather details distinguish forecast model time in the location timezone from fetch time', () => {
  const f = fixture();
  const result = f.ctx.weatherConditionsTime({ observedAt: START, timezone: 'Pacific/Auckland', fetchedAt: START + HOUR });
  assert.match(result, /14 Sept.*2:20 pm/);
  assert.equal(f.ctx.weatherConditionsTime({ fetchedAt: START }), '');
  assert.match(f.ctx.weatherConditionsTime({ observedAt: START, timezone: 'Invalid/Zone', utcOffsetSeconds: 36000 }), /12:20 pm/);
});

test('provider parsing keeps unavailable hourly values null and uses absolute forecast instants', async () => {
  const f = fixture();
  const pending = f.ctx.fetchWeatherAt(-33.8, 151.2);
  assert.match(f.requests[0].url, /timeformat=unixtime/);
  assert.match(f.requests[0].url, /forecast_days=2/);
  assert.match(f.requests[0].url, /hourly=temperature_2m,weather_code,is_day,precipitation_probability,precipitation/);
  f.requests[0].respond();
  const result = await pending;
  assert.equal(result.timezone, 'Australia/Sydney');
  assert.equal(result.utcOffsetSeconds, 36000);
  assert.equal(result.observedAt, START);
  assert.equal(Date.parse(result.sunrise), START - 6 * HOUR);
  assert.equal(result.hourly[0].time, START + HOUR);
  assert.equal(result.hourly[0].rainProbability, 0, 'reported zero stays zero');
  for (const key of ['tempC', 'code', 'isDay', 'rainProbability', 'precipitation']) assert.equal(result.hourly[1][key], null, key);
});

test('invalid provider data and HTTP failures cannot replace a usable cache', async () => {
  for (const [body, status] of [[{}, 200], [provider(null), 200], [provider(), 503]]) {
    const f = fixture();
    const pending = f.ctx.weatherRefreshStored();
    f.requests[0].respond(body, status);
    assert.equal(await pending, false);
    assert.equal(f.cache().tempC, 20);
    assert.equal(f.cache().fetchedAt, START - 10 * 60000);
  }
});

test('a saved-coordinate refresh retains existing location metadata without reacquiring location', async () => {
  const f = fixture(cached({ city: 'Chosen location', source: 'manual' }));
  const pending = f.ctx.weatherRefreshStored();
  f.requests[0].respond(); await pending;
  assert.equal(f.cache().city, 'Chosen location');
  assert.equal(f.cache().source, 'manual');
  assert.equal(f.positions.length, 0);
});

function settingsFixture(seed) {
  const f = fixture(seed);
  const coordinates = { open: false };
  const wrap = { innerHTML: '', querySelector: selector => selector === '.wx-details' ? coordinates : null };
  f.doc.getElementById = id => id === 'settings-weather-section' ? wrap : null;
  Object.assign(f.ctx, { weatherAppearanceStatus: () => ({ ok: false, reason: 'Waiting for weather' }),
    weatherLook: () => ['sun', 'Clear'], weatherScene: () => 'clear-day',
    weatherPlaceholderScene: () => 'clear-day', escText: value => String(value), stgCardHead: () => '',
    accentCurrentHTML: () => '', renderAccentCurrent: () => {} });
  vm.runInContext(source.match(/const WEATHER_PERM_LABEL=.*?;/)[0] + '\n' +
    ['weatherAgeLabel', 'weatherSourceLabel', 'renderWeatherSection'].map(extract).join('\n'), f.ctx);
  return { ...f, wrap, coordinates };
}

test('Weather Settings keeps the coordinate disclosure open through weather repaints', () => {
  const f = settingsFixture(cached());
  f.coordinates.open = true;
  f.ctx.renderWeatherSection();
  assert.match(f.wrap.innerHTML, /<details class="wx-details" open>/);
  f.coordinates.open = false;
  f.ctx.renderWeatherSection();
  assert.match(f.wrap.innerHTML, /<details class="wx-details">/);
  assert.doesNotMatch(f.wrap.innerHTML, /<details class="wx-details" open>/);
});

test('Weather Settings offline copy distinguishes missing weather from a saved reading', () => {
  const f = settingsFixture(null);
  f.ctx.navigator.onLine = false;
  f.ctx.renderWeatherSection();
  assert.match(f.wrap.innerHTML, /You are offline\. Connect to load weather\./);
  assert.doesNotMatch(f.wrap.innerHTML, /showing the last reading/);
  f.put(cached()); f.ctx.renderWeatherSection();
  assert.match(f.wrap.innerHTML, /You are offline — showing the last reading\./);
});
