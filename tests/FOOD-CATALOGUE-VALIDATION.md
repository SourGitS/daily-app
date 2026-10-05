# Food catalogue v379 validation — 2026-10-06

## Agreed release behavior

The Food introduction appears on the first Food visit and can be closed on every slide.
The sequence is Birria reveal → six recipes → cooking/shopping guidance. Replay is available
from the catalogue, reached through Food → Recipes → Recipe catalogue.

First-time users receive the six recipes after completing setup and restoring any cloud
state. Existing users explicitly add individual recipes or the remaining collection. Names
and stable catalogue IDs protect saved/edited copies. The download is the original JSON
bundle. Missing quantities remain unspecified and original tablespoon measures/notes remain.

## Automated checks

- `node --test tests/*.test.cjs`: 523 pass, including 11 catalogue regressions.
- `node --check js/app.js`, `node --check js/food-catalogue.js` and diff whitespace checks pass.
- The app's real importer accepts all six recipes. Tests compare every ingredient amount,
  unit and method step with the supplied JSON.
- Tests cover no boot seed, only-first-setup eligibility, cloud readiness/failure gates,
  empty-cloud transactions (including competing cloud data), existing/empty book preservation,
  repeated adds, renamed catalogue copies, storage failure, late account changes and monotonic
  acknowledgement.

## Browser checks

Regenerate the synthetic page with `node tests/build-sync-browser.cjs`, serve this repository
locally, and open `tests/sync-browser.html?preview&catalogue`. Add `&light` for light mode.
Use `?preview&catalogue=new&light` for first-time setup. Firebase and account storage are mocked;
these pages cannot connect to the production database.

Checked in Chromium/Edge at 320 × 640, 390 × 844 and 1440 × 1000:

- No introduction on Home; first Food visit opens it. Close/Escape records acknowledgement;
  re-entering Food does not reopen it. Catalogue replay and keyboard arrows work.
- All three slides have accessible titles and reachable footer/close controls. No horizontal
  overflow. The six dishes fit the short phone introduction. Reduced motion removes animation.
- Browse and preview perform no recipe writes. JSON download contains all six source recipes.
- Starting with two personal recipes, including an edited Birria, Add remaining adds five.
  The original two survive unchanged and subsequent additions are disabled for saved entries.
- View saved recipe reaches the existing detail and Cook recipe starts the existing cooking
  session. Ingredient blanks remain visibly unspecified.
- A genuinely new setup begins without a recipe store, receives exactly six after Finish,
  and only sees the introduction on entering Food. Deleting the recipes does not reseed them.
- A failed catalogue fetch changes no saved recipe. Retry successfully restores the catalogue.
- No browser JavaScript errors in these scenarios.

Artwork assets and the JSON bundle are included in `daily-v379`'s service-worker asset list.
Physical iPhone/Safari, production Firebase and an installed-PWA upgrade were not exercised.
