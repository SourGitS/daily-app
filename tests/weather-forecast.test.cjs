const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { extract, copy } = require('./harness.cjs');

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-09-14T03:15:00Z');
function fixture() {
  class Clock extends Date { static now() { return NOW; } }
  const ctx = vm.createContext({ Date: Clock, Intl });
  vm.runInContext(['weatherForecastHours', 'weatherForecastTime', 'weatherForecastSummary']
    .map(extract).join('\n'), ctx);
  return ctx;
}
function hour(time, extra = {}) {
  return { time: typeof time === 'string' ? Date.parse(time) : time,
    tempC: 20, code: 0, isDay: 1, rainProbability: 0, precipitation: 0, ...extra };
}
function forecast(extra = {}) {
  return { timezone: 'Australia/Sydney', utcOffsetSeconds: 36000,
    hourly: Array.from({ length: 8 }, (_, i) => hour(Date.parse('2026-09-14T04:00:00Z') + i * HOUR)),
    ...extra };
}

test('forecast preview selects the next six hours, orders and deduplicates without changing the cache', () => {
  const ctx = fixture();
  const entry = forecast();
  entry.hourly = [hour(NOW - HOUR), ...entry.hourly.reverse(), hour('2026-09-14T04:00:00Z'),
    hour(null), hour(NaN), hour('invalid'), null];
  const before = copy(entry);
  const result = copy(ctx.weatherForecastHours(entry));
  assert.deepEqual(result.map(row => row.time), Array.from({ length: 6 }, (_, i) =>
    Date.parse('2026-09-14T04:00:00Z') + i * HOUR));
  assert.deepEqual(copy(entry), before);
  assert.deepEqual(copy(ctx.weatherForecastHours(entry, NOW + 24 * HOUR)), []);
});

test('missing and invalid hourly measurements remain unavailable, including precipitation probability', () => {
  const ctx = fixture();
  const entry = forecast({ hourly: [hour(NOW, { tempC: null, code: null, isDay: null,
    rainProbability: null, precipitation: null }), hour(NOW + HOUR, { tempC: '', code: '0',
    isDay: 2, rainProbability: 101, precipitation: -1 }), hour(NOW + 2 * HOUR, {
    tempC: -5, rainProbability: 0, precipitation: 0 })] });
  const rows = copy(ctx.weatherForecastHours(entry));
  for (const row of rows.slice(0, 2)) {
    for (const key of ['tempC', 'code', 'isDay', 'rainProbability', 'precipitation']) {
      assert.equal(row[key], null, key + ' must not invent zero from an unavailable value');
    }
  }
  assert.equal(rows[2].tempC, -5);
  assert.equal(rows[2].rainProbability, 0);
  assert.equal(rows[2].precipitation, 0);
  assert.deepEqual(copy(ctx.weatherForecastHours({})), []);
  assert.deepEqual(copy(ctx.weatherForecastHours({ hourly: {} })), []);
});

test('forecast labels use the location timezone and keep non-hourly provider valid times', () => {
  const ctx = fixture();
  assert.equal(ctx.weatherForecastTime({ timezone: 'Australia/Sydney' }, NOW), '1:15 pm');
  assert.equal(ctx.weatherForecastTime({ timezone: 'America/New_York' }, NOW), '11:15 pm');
  assert.equal(ctx.weatherForecastTime({ timezone: 'Pacific/Auckland' }, Date.parse('2026-09-14T12:00:00Z')), '12 am');
  assert.equal(ctx.weatherForecastTime({}, NOW), '');
  assert.equal(ctx.weatherForecastTime({ timezone: 'invalid' }, NOW), '');
  assert.equal(ctx.weatherForecastTime({ timezone: 'Australia/Sydney' }, null), '');
});

test('forecast timezone handles daylight-saving transitions and uses only an explicit offset fallback', () => {
  const ctx = fixture();
  const entry = { timezone: 'America/New_York', utcOffsetSeconds: -18000 };
  assert.equal(ctx.weatherForecastTime(entry, Date.parse('2026-03-08T06:00:00Z')), '1 am');
  assert.equal(ctx.weatherForecastTime(entry, Date.parse('2026-03-08T07:00:00Z')), '3 am');
  assert.equal(ctx.weatherForecastTime(entry, Date.parse('2026-11-01T05:00:00Z')), '1 am');
  assert.equal(ctx.weatherForecastTime(entry, Date.parse('2026-11-01T06:00:00Z')), '1 am');
  assert.equal(ctx.weatherForecastTime({ timezone: 'invalid', utcOffsetSeconds: 20700 },
    Date.parse('2026-09-14T00:00:00Z')), '5:45 am');
  assert.equal(ctx.weatherForecastTime({ utcOffsetSeconds: 0 }, NOW), '3:15 am');
  assert.equal(ctx.weatherForecastTime({ utcOffsetSeconds: null }, NOW), '');
});

test('hourly preview crosses midnight using elapsed time without dropping the next local day', () => {
  const ctx = fixture();
  const now = Date.parse('2026-09-14T13:30:00Z');
  const entry = forecast({ hourly: Array.from({ length: 6 }, (_, i) =>
    hour(Date.parse('2026-09-14T14:00:00Z') + i * HOUR)) });
  const rows = ctx.weatherForecastHours(entry, now);
  assert.equal(rows.length, 6);
  assert.deepEqual(copy(rows.map(row => ctx.weatherForecastTime(entry, row.time))),
    ['12 am', '1 am', '2 am', '3 am', '4 am', '5 am']);
});

test('forecast copy distinguishes probability from modelled precipitation and respects its type', () => {
  const ctx = fixture();
  const summary = extra => ctx.weatherForecastSummary(forecast({ hourly: [hour('2026-09-14T05:00:00Z', extra)] }));
  assert.equal(summary({ code: null, rainProbability: 60, precipitation: null }), 'Precipitation possible around 3 pm.');
  assert.equal(summary({ code: 61, rainProbability: 60, precipitation: 0 }), 'Rain possible around 3 pm.');
  assert.equal(summary({ code: 61, rainProbability: null, precipitation: 0.4 }), 'Rain forecast around 3 pm.');
  assert.equal(summary({ code: 73, rainProbability: null, precipitation: 0.4 }), 'Snow forecast around 3 pm.');
  assert.equal(summary({ code: 95, rainProbability: null, precipitation: 0.4 }), 'Precipitation forecast around 3 pm.');
  assert.equal(summary({ code: 0, rainProbability: 10, precipitation: 0 }), '');
  assert.equal(summary({ code: 61, rainProbability: null, precipitation: null }), '');
});

test('forecast copy uses the first supported upcoming event and never recycles past or unzoned timing', () => {
  const ctx = fixture();
  const entry = forecast({ hourly: [hour(NOW - HOUR, { code: 61, precipitation: 1 }),
    hour('2026-09-14T05:00:00Z', { code: 61, rainProbability: 40 }),
    hour('2026-09-14T06:00:00Z', { code: 61, precipitation: 2 })] });
  assert.equal(ctx.weatherForecastSummary(entry), 'Rain possible around 3 pm.');
  assert.equal(ctx.weatherForecastSummary({ ...entry, timezone: null, utcOffsetSeconds: null }), '');
  assert.equal(ctx.weatherForecastSummary(entry, NOW + 24 * HOUR), '');
  assert.equal(ctx.weatherForecastSummary({}), '');
});

test('clear forecast copy requires several contiguous clear hours and yields to precipitation evidence', () => {
  const ctx = fixture();
  const entry = forecast({ hourly: forecast().hourly.slice(0, 3) });
  entry.hourly[1].code = 1;
  assert.equal(ctx.weatherForecastSummary(entry), 'Clear through the next few hours.');
  assert.equal(ctx.weatherForecastSummary({ ...entry, hourly: entry.hourly.slice(0, 2) }), '');
  assert.equal(ctx.weatherForecastSummary({ ...entry, hourly: entry.hourly.slice(1) }), '');
  assert.equal(ctx.weatherForecastSummary({ ...entry, hourly: [entry.hourly[0], entry.hourly[2],
    hour(NOW + 5 * HOUR)] }), '');
  entry.hourly[1].code = null;
  assert.equal(ctx.weatherForecastSummary(entry), '');
  entry.hourly[1].code = 0;
  entry.hourly[1].precipitation = 0.1;
  assert.equal(ctx.weatherForecastSummary(entry), 'Precipitation forecast around 3 pm.');
  entry.hourly[1].precipitation = 0;
  entry.hourly[2].rainProbability = 30;
  assert.equal(ctx.weatherForecastSummary(entry), 'Precipitation possible around 4 pm.');
});
