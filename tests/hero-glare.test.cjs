// Accent heroes communicate a summary through their content and gradient. A detached circular
// highlight reads like unexplained decoration, varies from screen to screen, and competes with
// the figures. Keep the generic heroes aligned with Home and Food's quiet full-card treatment.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = file => fs.readFileSync(path.join(__dirname, '../css', file), 'utf8');

test('live generic heroes do not draw detached circular glare bubbles', () => {
  const budget = css('budget-home.css');
  const workout = css('workout.css');
  const kitchen = css('kitchen-extras.css');

  for (const [source, selector] of [
    [budget, '.hero-surface::before'],
    [budget, '.hero-wide::before'],
    [budget, '.ob-pv-hero::after'],
    [workout, '.fin-hero::before'],
    [workout, '.ov-hero::before'],
    [kitchen, '.aih-hero::after']
  ]) {
    assert.ok(!source.includes(selector), `${selector} must not restore a decorative orb`);
  }
});

test('Home and Food remain the quiet gradient references', () => {
  const kitchen = css('kitchen-extras.css');
  const nutrition = css('nutrition-modals.css');
  assert.match(kitchen, /\.hero-workout-card\{background:linear-gradient\(/,
    'Home keeps its clean, accent-gradient hero');
  assert.match(kitchen, /\.kitchen-hero-card\{background:linear-gradient\(/,
    'Food featured cards keep the same restrained hero language');
  assert.match(nutrition, /\.nut-hero\{[^}]*background:linear-gradient\(/,
    'Food Today remains a simple gradient, without a separate flare');
});
