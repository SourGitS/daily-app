# Daily on TV

Open **https://sourgits.github.io/daily-app/?tv=1** for the optional TV interface. The ordinary URL keeps the existing phone and desktop interface. A large window never enables TV mode automatically.

## Remote controls

- Arrows move the visible focus ring between controls and reveal them within scrolling lists or editors. Calendar days and spending charts retain their own arrow controls; Back leaves the calendar grid.
- OK/Enter activates the focused control. On a text field, the first OK enters editing. Arrows and Enter then keep their ordinary editing behaviour, including newlines and the app's existing Enter actions. Back/Escape returns to navigation before closing an editor. Backspace still deletes text during editing.
- Delivered Back/Escape closes the innermost app menu or dialog through its existing close action and preserves its unsaved-change checks. At the top level, the browser owns Back. The on-screen Back button is also available.
- Exit TV mode returns to the normal layout without reloading or discarding a draft. The URL records the mode; browser history can return to an earlier TV entry.
- An imported HTML plan has a scrollable, read-only text view in TV mode. Its original file, sandbox and stored plan remain unchanged. Exit restores the original presentation.

TV styling reserves room around the screen edges, enlarges text and controls at desktop widths, and respects reduced motion. TV navigation also works at narrow browser widths. Mouse and touch can still activate controls and edit fields.

## DAILY TV launcher integration

The separate Android launcher currently opens Daily in an external browser with `ACTION_VIEW` and `CATEGORY_BROWSABLE`. It does not embed the site or forward keys through a WebView. This website change does not modify or reinstall that launcher.

The launcher owner should change `daily_hub_url` in `app/src/main/res/values/companions.xml` to the exact TV URL above, then rebuild and install the next APK. The existing v0.5.1 APK still opens the ordinary URL. The native project is separate at `C:\Users\fanma\Documents\Codex\2026-11-17\i\outputs\DAILY-TV`.

Daily website sign-in and browser storage remain independent of the DAILY TV launcher profile. Choosing a launcher profile does not choose a website account.

## Verification and physical acceptance

Automated browser checks use synthetic accounts, not personal records. The repeatable TV journey suite is `node tests/tv-navigation-browser.cjs`; `DAILY_TV_BASELINE=d130ee3` compares ordinary mode with v466. `DAILY_TV_BROWSER`, `DAILY_TV_WIDTH` and `DAILY_TV_THEME` can narrow a run.

The physical target is Maya's 32-inch HD Blaupunkt BP320HSG9800 with Google/Android TV OS 14. On that TV, verify the chosen browser delivers D-pad/OK/Back to the page, its software keyboard and sign-in work, and text, overscan margins and focus remain comfortable from the sofa. Browser-owned selects, file pickers and confirmations also need this check. Desktop Chrome/WebKit checks do not establish Android TV browser support.

## Follow-up boundaries

Manhua Hub can reuse the explicit URL opt-in, spatial focus, safe text-entry handling and layered Back conventions in its own project. No Manhua code or deployment is part of this change.

A future iPhone remote needs separate design and authenticated pairing. Controlling the DAILY TV launcher or its own paired interface is separate from controlling Netflix or TV-wide volume, power and wake. Public platform support and device limits must be checked before promising those controls. No iPhone remote project has been started here.
