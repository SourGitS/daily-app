# Prompt 47 — Refine the Home weather card scenes

## Objective

Refine the existing Home weather card so its animated weather scenes feel intentional, atmospheric and consistent with Daily. The main visual problems are the oval-looking clouds and unnatural rain. Implement the agreed design directions:

- **Cloud direction 1.B — Layered cloud bank**
- **Rain direction 2.A — Fine single-layer rain**

Keep the card's current information hierarchy, dimensions, typography and behaviour. This is a visual-scene refinement, not a redesign of the weather feature or its data flow.

## Repository context and required reading

This is Daily, a vanilla HTML/CSS/JavaScript PWA with no build step. Before editing:

1. Read `AGENTS.md` in full, especially the data-preservation, coding-convention, testing and service-worker rules.
2. Read the relevant Home, card, typography, weather and motion sections of `CLAUDE.md`.
3. Inspect `git status` and preserve all unrelated work, including untracked files under `Prompts/`.
4. Locate current code by symbol or selector rather than relying on line numbers. Relevant areas currently include:
   - `WEATHER_ACCENTS`, `WEATHER_CODES`, `CLOUD_LOOKS`
   - `weatherLook()`, `weatherSceneBase()`, `weatherScene()`
   - `applyWeatherMotion()`, `buildWeatherCard()` and the weather render-state functions
   - `.home-weather-card`, `.weather-fx`, `.wfx-cloud*`, `.wfx-rain*`, `.wfx-fog*`, `.wfx-snow*` and all scene selectors
   - wide Home weather-card overrides in `css/budget-home.css`
5. Verify the actual current service-worker cache name before editing. It is currently expected to be `daily-v301`; because cached assets will change, increment the current numeric suffix exactly once and update the adjacent version comment. If it is still `daily-v301`, the result must be `daily-v302`.

Do not reorder the nine stylesheet links in `index.html`. Do not introduce a build step, package dependency, image asset, canvas renderer or third-party animation library. Do not commit, push or deploy.

## Scope and non-negotiable guardrails

- Change presentation code only, apart from correcting weather-code labels and derived scene/intensity classification.
- Do not change the Open-Meteo request, geolocation flow, refresh rules, freshness rules, sample/live distinction, weather cache, timestamps, localStorage keys, Firebase code or sync behaviour.
- Add no persisted state and perform no migration.
- Preserve the existing Home card order, show/hide behaviour, compact/wide layouts and responsive grid.
- Preserve the existing weather-card information structure: city and day/date at left; temperature, condition and high/low at right.
- Preserve the existing Daily typography exactly. UI text remains Manrope; numeric weather values remain Space Grotesk; retain the current sizes, weights, casing and hierarchy. Do not copy the experimental mockup's substitute fonts or alternative type hierarchy.
- Preserve the current card footprint. Do not make the card taller to accommodate the new artwork.
- Preserve reduced-motion support. The static reduced-motion composition must still look deliberate.
- Preserve the sun/moon arc and the existing wind-responsive motion variables, including `--wfx-wind`, `--wfx-drift` and `--wfx-rain-x`, unless a small compatible adjustment is necessary for the new artwork.
- Do not paste the visual-study implementation wholesale. Translate the chosen design into the app's existing DOM, CSS conventions and motion system.

## 1. Lock the scene taxonomy and repair weather-code coverage

The current comments describe 16 scenes, but the implementation has 18. Make the taxonomy explicit and finish it as **19 derived scenes**:

- Clear: `clear-dawn`, `clear-noon`, `clear-day`, `clear-dusk`, `clear-night`
- Partly cloudy: `partly-dawn`, `partly-noon`, `partly-day`, `partly-dusk`, `partly-night`
- Cloudy: `cloudy-day`, `cloudy-night`
- Fog: `fog-day`, `fog-night`
- Rain: `rain-day`, `rain-night`
- Storm: `storm`
- Snow: `snow-day`, `snow-night`

Requirements:

- Keep the existing five-phase clear and partly-cloudy progression.
- Split the current all-hours `fog` scene into day and night variants.
- Keep storm as one deliberately dark scene.
- Update `WEATHER_ACCENTS` and any appearance-scene logic so both fog scenes receive the intended weather-driven accent.
- Correct stale comments and documentation that state the wrong scene count.
- Ensure cloudy night has no visible stars. Clear night and partly-cloudy night should retain them.
- Ensure storm renders a substantial cloud bank as well as rain and lightning.

Complete the WMO code presentation map so every code already accepted by the classifier has a meaningful label and controlled icon. At minimum add the currently missing codes:

- 56 — freezing drizzle, light
- 57 — freezing drizzle, dense
- 66 — freezing rain, light
- 67 — freezing rain, heavy
- 77 — snow grains
- 85 — snow showers, light
- 86 — snow showers, heavy

Use the official Open-Meteo WMO interpretation table as the source of truth: `https://open-meteo.com/en/docs#weather_variable_documentation`.

No supported reading may fall through to the thermometer/unknown fallback merely because its WMO entry is absent.

## 2. Replace weather emoji with Daily-compatible line icons

Replace the fixed weather emoji with controlled line icons that match the rest of Daily. Reuse the Tabler icon resource and existing icon vocabulary already loaded by the app; add no dependency.

Use suitable condition icons for clear day, clear night, partly cloudy, cloudy, fog, rain, snow and storm. Also replace weather-specific prompt/error emoji, such as the location pin, if those states display one.

Requirements:

- The icon and the text label must describe the same WMO condition.
- Icons are decorative where the adjacent text already names the condition and should not create duplicate screen-reader announcements.
- Keep icon rendering controlled by application-owned mappings. Do not insert API strings as HTML.
- Keep the existing text column geometry and alignment. The line icon must not shift or enlarge the current type layout.
- No weather emoji should remain visible in the loaded, sample, prompt, error or stale states.

## 3. Implement cloud direction 1.B — Layered cloud bank

Replace the current blurred oval/pill clouds with one coherent, reusable cloud-bank system.

### Shape language

Each cloud bank should read as one natural cloud mass:

- a broad, irregular horizontal body;
- a noticeably flatter underside;
- two or three overlapping lobes of unequal size and height;
- asymmetric placement rather than evenly spaced circles;
- a restrained highlight on the upper mass;
- a slightly darker underside that gives the bank depth;
- softened edges without enough blur to turn the form back into an oval.

Do not solve the shape with a single `border-radius: 50%` element or a row of obvious identical circles. Individual lobes must visually merge into a compound silhouette.

### Scene use

- **Partly cloudy:** use a smaller, lighter and less opaque member of the same cloud family. It must leave enough open sky for the sun or moon and preserve the current phase identity.
- **Cloudy:** use broader overlapping banks with stronger coverage and at least two perceptible depth planes.
- **Rain:** use a darker, lower bank. The rain must visibly originate beneath its base.
- **Storm:** use the deepest and most substantial version, with a heavier underside but enough tonal separation to read against the scene.

### Depth and movement

- Use a small number of differently scaled banks at different vertical positions, opacities and drift speeds. Depth should come from shape, tone and relative motion—not excessive blur.
- Continue to derive drift from the live wind variable.
- Keep motion slow and atmospheric. No bank should visibly snap, expose an empty seam or pop back to its start during the animation loop.
- Avoid clouds crossing through the text strongly enough to reduce readability.
- The composition must work in the normal half-width Home card and the wide desktop card.

The final result should still look convincing in a screenshot with animation paused. Motion may enhance the bank, but it must not be required to explain the shape.

## 4. Implement rain direction 2.A — Fine single-layer rain

Replace the current six broad, uniform streaks with a fine single-layer rain field.

### Locked visual rules

- Rain strokes are thin—normally 1 CSS pixel at standard scale.
- Use short, subtly varied lengths rather than identical long bars.
- Vary horizontal placement, opacity, duration and delay enough to avoid a marching or repeating pattern.
- Every visible drop begins below the cloud bank's underside. No drop may appear in front of or above the cloud body.
- Preserve the wind-responsive horizontal component through `--wfx-rain-x`.
- Keep the field airy enough that the sky remains visible.
- Use one visual depth layer. Do not introduce a second foreground sheet of large or heavily blurred rain; option 2.A is intentionally fine and restrained.
- Do not use a repeating diagonal CSS background that reads as a grid or texture.
- Do not turn the rain into thick neon slashes, fast lasers or a dense curtain.

Use enough controlled drops to avoid the current sparse six-line look; approximately 12–16 reusable drop elements is a sensible starting point, but the visual outcome matters more than the exact count.

### Intensity modifiers

Do not create more scene IDs for rain intensity. Derive a small presentation-only intensity modifier from the WMO code and expose it through a controlled class, data attribute or CSS custom property.

- Drizzle `51`, `53`, `55`, `56`, `57`: finest and sparsest; increase density modestly across severity.
- Rain `61`, `63`, `65`, `66`, `67`: progressively greater density and speed while retaining the fine stroke language.
- Showers `80`, `81`, `82`: more irregular timing; increase strength across severity.
- Thunderstorm `95`, `96`, `99`: the densest/fastest form, still using fine strokes beneath the storm bank.

Vary only the properties that communicate intensity—primarily the number of active drops, opacity, stroke length, speed and delay. Keep the overall grammar consistent.

Rain should look plausible in both a paused frame and in motion. The uneven still frame is especially important because a static mockup or reduced-motion view should not make the drops look like misplaced lines.

## 5. Refine snow intensity without expanding the scene count

Keep the existing day/night snow scenes, but apply the same derived-intensity principle to snow codes `71`, `73`, `75`, `77`, `85` and `86`.

- Light snow and snow grains should be relatively sparse.
- Heavy snow and heavy snow showers should show greater density and slightly more assertive movement.
- Preserve the current soft snow character and avoid turning flakes into rain strokes.
- This is a supporting refinement only; do not let it expand the task into a complete snow redesign.

## 6. Improve fog and bright-scene legibility

Create distinct `fog-day` and `fog-night` appearances using the existing horizontal fog-band grammar:

- day fog may remain pale and low-contrast but must retain enough tonal structure to read as a weather scene;
- night fog should use cooler, darker tones rather than reusing the bright daytime scene;
- fog motion should remain slow and horizontal.

Improve small-text legibility over the brightest scenes—especially `clear-noon`, `partly-noon`, `cloudy-day`, `fog-day` and `snow-day`—without globally dimming the artwork.

Preferred treatment:

- modestly deepen any excessively pale lower gradient stops; and/or
- introduce subtle, localised edge scrims or text-side tonal support behind the left and right information columns.

Avoid a heavy full-card black overlay. The weather colour and time-of-day gradient should stay luminous. Keep text white unless the current design system provides a clearly better existing pattern, and verify practical contrast for the smallest 11–12px text in the actual rendered scene.

## 7. Preserve the parts that already work

Do not disturb:

- the five-phase clear and partly-cloudy sky transitions;
- sun and moon arc position;
- live wind-driven direction and speed;
- temperature, condition, high/low and date calculations;
- sample weather and stale-data restrictions;
- tap-to-refresh behaviour and location permission flow;
- weather-driven app accent behaviour;
- Home card visibility and ordering;
- normal and wide card layouts;
- existing reduced-motion behaviour;
- light and dark app themes surrounding the scene.

Do not broaden this prompt into a new forecast feature, hourly timeline, manual location picker or weather-settings screen.

## 8. Keep the implementation maintainable

- Use one cloud-bank component grammar across partly, cloudy, rain and storm scenes, with modifiers rather than four unrelated drawings.
- Use one rain field with intensity modifiers rather than separate copied markup for every WMO code.
- Keep all weather-code-to-label/icon/intensity mappings explicit and easy to audit.
- Generate only a controlled, fixed amount of decorative markup. Do not recreate particles on every animation frame.
- Avoid JavaScript animation loops where CSS animation and the existing motion variables are sufficient.
- Preserve current z-index ordering: background scene first, weather effects next, content always readable above them.
- Do not leave temporary scene-gallery controls, debugging classes, console logging or test data in production files.

## 9. Documentation and cache

Update `CLAUDE.md` so future agents can understand:

- the final 19-scene taxonomy;
- the shared layered-cloud-bank grammar;
- the fine single-layer rain grammar and WMO-derived intensity modifiers;
- the fog day/night split;
- the rule that the weather card retains Daily's existing Manrope/Space Grotesk typography and uses the existing line-icon system;
- the rule that weather scenes remain derived presentation state and add no persisted storage.

Because `js/app.js` and/or CSS will change, increment `CACHE_NAME` in `service-worker.js` once, with the matching version comment, following `AGENTS.md`.

## Numbered verification checklist

Run the app through a local static server and verify all of the following before reporting completion:

1. The app boots with no JavaScript errors, CSS parsing errors, failed local assets or weather-render exceptions.
2. The ordinary Home weather card still renders its cached/live state and refresh behaviour correctly.
3. All 19 scene IDs can be exercised and each has a visually intentional composition.
4. The five clear scenes and five partly-cloudy scenes still transition through the original time phases correctly.
5. `fog-day` and `fog-night` are selected at the appropriate time and are visibly distinct.
6. Cloud banks in partly, cloudy, rain and storm scenes use the selected 1.B silhouette: asymmetric compound mass, irregular lobes, broad body and flatter underside.
7. No cloud reads primarily as a single blurred oval, capsule or row of identical circles.
8. Partly-cloudy scenes retain visible sun/moon and adequate open sky.
9. Cloudy scenes show convincing depth without excessive blur.
10. `cloudy-night` has no stars; clear and partly-cloudy night scenes still do.
11. Storm visibly includes the heaviest cloud bank, rain and the existing restrained lightning effect.
12. Cloud animation responds to wind, loops without a visible jump or empty seam, and never obscures the text excessively.
13. Rain uses fine, short, uneven single-layer strokes rather than six broad bars.
14. Every rain stroke starts below the lowest relevant cloud-bank edge throughout the animation.
15. Rain preserves the live wind direction and does not resemble a repeating diagonal grid.
16. Drizzle, light rain, heavy rain, showers and storm codes show perceptibly appropriate density/speed differences without adding scene IDs.
17. Verify rain classification and rendering for `51`, `53`, `55`, `56`, `57`, `61`, `63`, `65`, `66`, `67`, `80`, `81`, `82`, `95`, `96` and `99`.
18. Verify snow presentation for `71`, `73`, `75`, `77`, `85` and `86`, including sensible light/heavy density differences.
19. Every supported WMO code has the intended human-readable label and line icon; specifically, `56`, `57`, `66`, `67`, `77`, `85` and `86` no longer fall back to unknown weather.
20. Loaded, sample, prompt, error and stale states show no weather/location emoji and retain their existing behaviour.
21. The condition line icon aligns with the current text without changing the card's information geometry.
22. The card uses the exact current Daily type system and type scale: Manrope for UI copy and Space Grotesk for numeric weather values.
23. The smallest text remains comfortably legible in `clear-noon`, `partly-noon`, `cloudy-day`, `fog-day` and `snow-day` without a muddy full-card overlay.
24. The card retains its current height and does not clip effects or content at a narrow phone viewport.
25. Verify the normal half-width Home card, the wide Home card and desktop two-column Home layout.
26. Verify the surrounding app in both light and dark themes.
27. With reduced motion enabled, animation stops or reduces according to the existing policy, and the paused cloud/rain compositions still look natural.
28. Weather-driven accents still work for every scene, including both new fog scene IDs.
29. No Home card ordering, visibility or layout-setting behaviour has changed.
30. No weather request, cache, geolocation, localStorage, Firebase, sync or timestamp behaviour has changed; no new stored key exists.
31. `CLAUDE.md` accurately describes the finished system and no stale 16- or 18-scene claim remains where it refers to the final implementation.
32. `service-worker.js` has exactly one cache-version increment from the value found at task start and its adjacent comment matches.
33. No debug UI, scene switcher, temporary fixture, console output or unused experimental CSS remains.
34. Final browser console is clean after a fresh reload of the locally served app.

## Completion report

At the end, report:

1. Every file changed.
2. The final 19 scene IDs.
3. How the shared 1.B cloud bank is constructed and modified for partly/cloudy/rain/storm.
4. How the 2.A rain field and WMO-derived intensity modifiers work.
5. The completed WMO label/icon additions.
6. How bright-scene legibility was improved without dimming the whole card.
7. The service-worker cache change.
8. Which verification items were completed, and anything that still requires physical-device checking.
9. Explicit confirmation that no stored data, sync, Firebase or weather-fetch behaviour changed.

