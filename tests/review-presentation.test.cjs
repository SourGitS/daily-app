// Presentation invariants for Stats › Review. These are static checks over the real source —
// no DOM, no network, no account — and they exist because the failures they cover are silent:
// a stylesheet override that shrinks insight cards to their own text, or a numbered local
// sidebar creeping back into a screen that is meant to read as part of Stats.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('js/app.js');
const reviewCss = read('css/review.css');
const workoutCss = read('css/workout.css');
// Several of these checks are "this must not appear in the code", and the code deliberately
// NAMES what was retired in the comment explaining why. Strip comments before asserting, or
// every such note trips its own test.
const noComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  .replace(/([^:])\/\/[^\n'"`]*$/gm, '$1');
const appCode = noComments(app);
const reviewCssCode = noComments(reviewCss);

test('.rev-list stays a grid — the flex/align-items contradiction does not come back', () => {
  // The bug: workout.css gave .rev-list `align-items:start` (a no-op in a single-column grid),
  // review.css then overrode it to `display:flex;flex-direction:column`, and in a flex column
  // that same declaration became the CROSS axis — every insight card shrank to the width of
  // its own text (measured 802/620/584px inside an 875px list).
  assert.ok(!/\.rev-list\s*\{[^}]*display\s*:\s*flex/.test(reviewCss),
    'review.css must not override .rev-list to flex');
  assert.ok(!/\.rev-list\s*\{[^}]*display\s*:\s*flex/.test(workoutCss),
    'workout.css must not make .rev-list flex');
  assert.ok(!/\.rev-list\s*\{[^}]*align-items/.test(reviewCss + workoutCss),
    'align-items on .rev-list is what turned into a width constraint; leave it off');
  // It must still BE a grid somewhere, or the cards lose their gap entirely.
  assert.match(workoutCss, /\.rev-list\{display:grid/, '.rev-list should still be a grid');
});

test('the numbered local Review sidebar is gone from markup, styles and state', () => {
  const retired = ['wkr-rail', 'wkr-mainhd', 'wkr-tab-n', 'wkr-tab-d', 'rev-railed'];
  // Emitted markup, not prose: the retired names may still be named in the comments that
  // record why they went, but nothing may render or style them.
  const markup = app.match(/class="[^"]*"/g) || [];
  retired.forEach(cls => {
    assert.ok(!markup.some(m => m.includes(cls)), 'js/app.js still emits the retired ' + cls);
    assert.ok(!new RegExp('\\.' + cls + '[\\s{,:.>]').test(reviewCss),
      'css/review.css still styles the retired ' + cls);
  });
  assert.ok(!app.includes("classList.toggle('rev-railed'"), 'the rail state flag should be gone');
  // Review is laid out from the section it is showing, not from whether a rail exists.
  assert.match(app, /data-wkr-section="/, 'the body should declare which section it is showing');
  assert.match(reviewCss, /--wkr-measure/, 'the reading measure should survive the rail');
  assert.ok(!reviewCssCode.includes('--wkr-rail-w'), 'the rail geometry token should be gone');
});

test('the section registry carries no table-of-contents descriptions', () => {
  const block = app.slice(app.indexOf('const WKR_SECTIONS=['), app.indexOf('function wkrSectionsFor'));
  assert.ok(block.length > 0 && block.length < 600, 'WKR_SECTIONS block not found');
  assert.ok(!/desc\s*:/.test(block),
    'a per-section description is what made the nav read as a document contents page');
  ['overview', 'money', 'next'].forEach(id =>
    assert.ok(block.includes("id:'" + id + "'"), 'core section ' + id + ' must stay in the registry'));
  // Optional pages come from the same list, so there is no second mobile/desktop nav to drift.
  const forFn = app.slice(app.indexOf('function wkrSectionsFor'), app.indexOf('function wkrNormalisePages'));
  assert.match(forFn, /WKR_SECTIONS\.concat/, 'enabled pages must extend the same registry');
});

test('the section row never uses scrollIntoView inside the swipe deck', () => {
  const start = app.indexOf('function wkrSetSection');
  // To the end of THIS function only — a fixed slice ran into neighbouring code.
  const fn = noComments(app.slice(start, app.indexOf('\n}', start) + 2));
  assert.ok(!/scrollIntoView/.test(fn),
    '#view-stats is a .swipe-panel inside the transformed #swipe-deck; scrollIntoView would shove the deck sideways');
  assert.match(fn, /segScrollToTab/, 'use the app’s measured-rect nudge to reveal the selected pill');
  assert.match(fn, /wkrFlushPending\(\)/, 'pending answer edits must be flushed before the section changes');
});

test('an insight separates what must stay visible from what may be disclosed', () => {
  const fn = app.slice(app.indexOf('function wkrInsightsHtml'), app.indexOf('// ══ Weekly Review'));
  assert.ok(fn.length > 0, 'wkrInsightsHtml not found');
  // Dates and any uncertainty note render OUTSIDE the disclosure; only `method` goes inside.
  const methodAt = fn.indexOf('rev-method');
  ['rev-figure', 'rev-dates', 'rev-note', 'rev-actions'].forEach(cls =>
    assert.ok(fn.indexOf(cls) > 0 && fn.indexOf(cls) < methodAt,
      cls + ' must render before (outside) the methodology disclosure'));
  // A stable id per disclosure, so renderStatsReview()'s details[open][id] restore keeps it open.
  assert.match(fn, /id="rev-method-'\+idx\+'"/, 'each disclosure needs a stable id to survive a re-render');
  // The technical phrasing this rewrite removed must not return anywhere, including in a
  // comment that would tempt the next person to paste it back into a string.
  assert.ok(!appCode.includes('archived category ID'),
    'plain language, please — that phrase described the mechanism to someone who already knew it, not the limitation');
});

test('review status and next-week plan status stay separate statements', () => {
  const chip = app.slice(app.indexOf('function wkrStatusChip'), app.indexOf('function wkrStatusChip') + 700);
  assert.match(chip, /Review not started/);
  assert.match(chip, /Review completed/);
  assert.match(chip, /Review in progress/);
  // The plan's own chip lives on the next-week card and says something different.
  const card = app.slice(app.indexOf('function wkrNextCardHtml'), app.indexOf('function wkrNextEditorHtml'));
  assert.match(card, /Saved plan/);
  assert.match(card, /Not saved yet/);
  // The landing gets the compact form; the full allocation table stays in Next week.
  assert.match(card, /const compact=/, 'the card should have a compact form for the landing');
  assert.match(app, /wkrNextCardHtml\(week,rec,plan,\{compact:true\}\)/, 'the landing should ask for it');
});

test('nothing in the redesign introduces storage, sync or a new accent colour', () => {
  const added = ['wkrWeekSummaryHtml', 'wkrOverviewHtml'];
  added.forEach(name => {
    const fn = app.slice(app.indexOf('function ' + name), app.indexOf('function ' + name) + 2600);
    assert.ok(fn.length > 0, name + ' not found');
    ['localStorage', 'lsSave', 'wkrSavePlan', 'wkrSaveReviews', 'Date.now()'].forEach(bad =>
      assert.ok(!fn.includes(bad), name + ' must not ' + bad + ' — opening Review writes nothing'));
  });
  // The only accent reference among the new Review rules is a focus ring, like every other one.
  const newRules = reviewCss.split('\n').filter(l =>
    /^\.(rev-figure|rev-dates|rev-note|rev-calm|wkr-head|wkr-week-lbl|wkr-sum-week|wkr-cov|wkr-next-state|wkr-landing)/.test(l.trim()));
  assert.ok(newRules.length > 0, 'expected the new Review rules to be present');
  newRules.forEach(l => assert.ok(!/accent/.test(l),
    'new Review styles should not take a colour from the accent: ' + l.trim().slice(0, 60)));
});
