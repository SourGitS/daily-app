// The weather card's scene palettes and its phone reading cluster, read straight out of the
// stylesheet. Colour is the whole subject here, so these assert the actual hex stops rather than
// that some rule exists: the dawn/dusk skies must stay VIOLET (they drifted to candy pink, which
// fought Daily's own pink action colour), the other scenes must stay exactly where they are, and
// the lightest twilight stop has to keep carrying white text.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../css/kitchen-extras.css'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

function rule(scene) {
  const re = new RegExp('\\.home-weather-card\\[data-scene="' + scene + '"\\]\\{background:([^\\n]*)\\}', 'm');
  const m = css.match(re);
  assert.ok(m, 'no background rule for scene ' + scene);
  return m[1];
}
// Only the linear-gradient stops — the radial is the sun's own glow and is deliberately warm.
function skyStops(scene) {
  const body = rule(scene);
  const lin = body.slice(body.indexOf('linear-gradient('));
  const hexes = lin.match(/#[0-9A-Fa-f]{6}/g) || [];
  assert.ok(hexes.length >= 3, 'scene ' + scene + ' should be a multi-stop sky');
  return hexes;
}
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16));
function hue([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return null;                       // achromatic: no hue to judge
  let h;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return (h + 360) % 360;
}
const lum = ([r, g, b]) => {
  const c = [r, g, b].map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const onWhite = hex => Math.round((1.05 / (lum(rgb(hex)) + 0.05)) * 100) / 100;

const TWILIGHT = ['clear-dawn', 'clear-dusk', 'partly-dawn', 'partly-dusk'];

test('every dawn and dusk sky is indigo through violet to mauve — never pink or peach', () => {
  TWILIGHT.forEach(scene => {
    skyStops(scene).forEach(hex => {
      const h = hue(rgb(hex));
      assert.ok(h !== null, scene + ' ' + hex + ' has no hue');
      assert.ok(h >= 225 && h <= 300,
        scene + ' stop ' + hex + ' is at ' + Math.round(h) + '° — outside the indigo-to-violet band. ' +
        'Above 300 is magenta/pink, below 225 is blue, and warm hues are the sun glow’s job, not the sky’s.');
    });
  });
});

test('twilight runs dark at the top and light at the horizon, and the horizon carries white text', () => {
  TWILIGHT.forEach(scene => {
    const stops = skyStops(scene);
    const first = lum(rgb(stops[0])), last = lum(rgb(stops[stops.length - 1]));
    assert.ok(first < last, scene + ' should get lighter toward the horizon');
    assert.ok(first < 0.06, scene + ' should start deep: ' + stops[0]);
  });
  // The clear scenes carry no legibility scrim on a desktop Grid banner, so white 10-11px copy
  // sits directly on the last stop. The retired #F2A0B8 measured 1.8:1 there.
  ['clear-dawn', 'clear-dusk'].forEach(scene => {
    const stops = skyStops(scene);
    const contrast = onWhite(stops[stops.length - 1]);
    assert.ok(contrast >= 4.5, scene + ' horizon ' + stops[stops.length - 1] + ' is only ' + contrast + ':1 against white');
  });
  // partly-* is scrimmed, so it is allowed to sit a little lighter — but not much.
  ['partly-dawn', 'partly-dusk'].forEach(scene => {
    const stops = skyStops(scene);
    assert.ok(onWhite(stops[stops.length - 1]) >= 3.5, scene + ' horizon is too light for white copy');
  });
});

test('the sun keeps a warm glow in a violet sky', () => {
  ['clear-dawn', 'clear-dusk', 'partly-dawn', 'partly-dusk'].forEach(scene => {
    const body = rule(scene);
    const radial = body.slice(0, body.indexOf('linear-gradient('));
    const m = radial.match(/rgba\((\d+),(\d+),(\d+)/);
    assert.ok(m, scene + ' lost its horizon glow');
    const h = hue([+m[1], +m[2], +m[3]]);
    assert.ok(h <= 60, scene + ' glow is at ' + Math.round(h) + '° — the sun stays warm gold, not pink');
  });
  // The disc's own gradient is warm for both ends of the day.
  assert.match(css, /\[data-scene\$="-dawn"\] \.wfx-sun,[\s\S]{0,120}rgba\(255,236,200,\.95\)/);
});

test('day, cloud, rain and night scenes are untouched', () => {
  const pinned = {
    'clear-noon': '#2F8FD8', 'clear-day': '#1E6FD0',
    'partly-noon': '#4C86B8', 'partly-day': '#3E70A4',
    'clear-night': '#070C1A', 'partly-night': '#0C1424',
    'cloudy-day': '#596873', 'cloudy-night': '#12171C',
    'rain-day': '#2B3E52', 'rain-night': '#0B121A',
    'fog-day': '#74818A', 'fog-night': '#1D2932',
    'snow-day': '#66869B', 'snow-night': '#18212B', 'storm': '#120F19'
  };
  Object.entries(pinned).forEach(([scene, first]) => {
    assert.equal(skyStops(scene)[0], first, scene + ' changed');
  });
  // Night in particular must not go purple: it is blue-indigo and stays there.
  ['clear-night', 'partly-night'].forEach(scene => {
    skyStops(scene).forEach(hex => {
      const h = hue(rgb(hex));
      assert.ok(h === null || (h >= 200 && h < 235), scene + ' stop ' + hex + ' drifted off navy');
    });
  });
  // Day stays blue.
  ['clear-day', 'clear-noon'].forEach(scene => {
    skyStops(scene).forEach(hex => {
      const h = hue(rgb(hex));
      assert.ok(h >= 190 && h <= 225, scene + ' stop ' + hex + ' is no longer blue');
    });
  });
});

test('weather appearance mode keeps its existing scenes but follows violet twilight', () => {
  // Appearance still answers from the same WEATHER_ACCENTS table. Only its twilight hues move
  // with the new card palette, so Weather mode cannot make the rest of Daily pink again.
  assert.match(app, /'clear-dawn':'#4F3C7A'/);
  assert.match(app, /'clear-dusk':'#533B7E'/);
  assert.match(app, /'partly-dawn':'#5D4E78'/);
  assert.match(app, /'partly-dusk':'#5B4A7C'/);
  ['clear-noon', 'clear-day', 'clear-night', 'rain-day', 'storm'].forEach(scene =>
    assert.match(app, new RegExp("'" + scene + "':'#"), scene + ' keeps its existing appearance scene'));
});

// ── The shared phone and desktop reading cluster ───────────────────
const shared = fs.readFileSync(path.join(__dirname, '../css/finance-periods.css'), 'utf8');

test('the temperature, icon, condition and detail line are one centred cluster', () => {
  assert.match(shared, /\.home-widget-weather \.weather-right\{[^}]*grid-template-columns:auto minmax\(0,1fr\);align-items:center/,
    'temperature and the condition stack align within one row');
  // Left-aligned in its content area — the fix is optical alignment inside the cluster, not
  // centring the card's text.
  assert.match(shared, /\.home-widget-weather \.weather-right\{[^}]*text-align:left/);
  assert.match(shared, /\.home-widget-weather \.weather-temp-row\{[^}]*justify-content:flex-start/);
});

test('the icon reads before the temperature', () => {
  assert.ok(!/\.home-widget-weather \.weather-icon\{[^}]*order:/.test(shared),
    'order:1 moved the icon after the number, so the reading led with a digit');
  const start = app.indexOf('<div class="weather-temp-row">');
  assert.ok(start >= 0, 'weather reading markup is present');
  const row = app.slice(start, app.indexOf('home-weather-label', start));
  assert.ok(row.indexOf('home-weather-icon') < row.indexOf('home-weather-temp'),
    'DOM order is what puts the icon first now');
});

test('shared forecast columns fit the card and retain the temperature hierarchy', () => {
  const font=part=>Number(shared.match(new RegExp('\\.home-widget-weather \\.'+part+'\\{[^}]*font-size:(\\d+)px'))[1]);
  assert.ok(font('weather-temp')>font('weather-condition'));
  assert.ok(font('weather-condition')>font('weather-meta'));
  assert.match(shared, /\.weather-hours\{[^}]*grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(shared, /\.weather-hours\.weather-week\{grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(shared, /\.weather-hours\[hidden\]\{display:none\}/);
});
